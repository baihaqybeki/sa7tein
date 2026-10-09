#!/usr/bin/env bash
# Verifikasi migrasi Sa7tein: jalankan SEMUA migrasi di PostgreSQL sementara,
# lalu uji bahwa constraint & RLS benar-benar berlaku.
#
#   ./scripts/verify-migrations.sh [port]
#
# Membuat cluster sekali-pakai di /tmp, menyiapkan stub Supabase Auth
# (schema `auth` + `auth.uid()`), menjalankan 0000..0005 berurutan dengan
# ON_ERROR_STOP=1, menguji constraint, lalu membersihkan diri.
# TIDAK menyentuh instalasi Postgres milikmu.
set -uo pipefail

PORT="${1:-55440}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MIG="$ROOT/supabase/migrations"
PGDATA="/tmp/sa7tein-mig-pg-$PORT"
PG="${PG_BIN:-/usr/local/bin}"
DB="sa7tein_check"
started=0
fails=0

cleanup() {
  [ "$started" = "1" ] && "$PG/pg_ctl" -D "$PGDATA" stop -m immediate >/dev/null 2>&1
  rm -rf "$PGDATA"
}
trap cleanup EXIT

for bin in initdb pg_ctl psql createdb pg_isready; do
  [ -x "$PG/$bin" ] || { echo "SKIP: $PG/$bin tidak ada (set PG_BIN)"; exit 0; }
done

PSQL() { "$PG/psql" -h /tmp -p "$PORT" -U postgres -d "$DB" -v ON_ERROR_STOP=1 "$@"; }
Q()    { "$PG/psql" -h /tmp -p "$PORT" -U postgres -d "$DB" -t -A -c "$1"; }

expect_ok() {   # expect_ok "label" "sql"
  if out=$(PSQL -q -c "$2" 2>&1); then
    echo "   ok    $1"
  else
    echo "   GAGAL $1 — seharusnya berhasil, tapi: $(echo "$out" | tail -2)"
    fails=$((fails+1))
  fi
}
expect_fail() { # expect_fail "label" "sql"
  if out=$(PSQL -q -c "$2" 2>&1); then
    echo "   GAGAL $1 — seharusnya DITOLAK, tapi berhasil"
    fails=$((fails+1))
  else
    echo "   ok    $1 (ditolak)"
  fi
}

echo "1) initdb cluster sementara -> $PGDATA"
rm -rf "$PGDATA"
"$PG/initdb" -D "$PGDATA" -U postgres --auth=trust -E UTF8 >/tmp/mig-initdb.log 2>&1 \
  || { echo "GAGAL initdb"; tail -15 /tmp/mig-initdb.log; exit 1; }

echo "2) start postgres port $PORT (socket /tmp, tanpa TCP)"
"$PG/pg_ctl" -D "$PGDATA" -l "/tmp/mig-pg-$PORT.log" \
  -o "-p $PORT -k /tmp -c listen_addresses=''" start >/dev/null 2>&1
started=1
for _ in $(seq 1 40); do "$PG/pg_isready" -h /tmp -p "$PORT" -U postgres >/dev/null 2>&1 && break; done
"$PG/pg_isready" -h /tmp -p "$PORT" -U postgres >/dev/null 2>&1 \
  || { echo "GAGAL: postgres tidak siap"; tail -15 "/tmp/mig-pg-$PORT.log"; exit 1; }
"$PG/createdb" -h /tmp -p "$PORT" -U postgres "$DB" || { echo "GAGAL createdb"; exit 1; }

echo "3) stub Supabase Auth (schema auth + auth.uid() + role anon/authenticated) — hanya untuk uji lokal"
PSQL -q <<'SQL'
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key, email text);
create or replace function auth.uid() returns uuid
  language sql stable as $fn$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $fn$;
do $do$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end $do$;
SQL

echo "4) jalankan migrasi berurutan"
for f in "$MIG"/0*.sql; do
  name=$(basename "$f")
  if out=$(PSQL -q -f "$f" 2>&1); then
    echo "   ok    $name"
  else
    echo "   GAGAL $name:"
    echo "$out" | tail -12
    exit 1
  fi
done

# Meniru Supabase: anon/authenticated punya hak tabel, pembatasannya lewat RLS.
PSQL -q <<'SQL'
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;
SQL

echo "5) migrasi sinkron dengan ERD?"
if /usr/bin/python3 "$ROOT/scripts/sync-migrations.py" --check >/tmp/mig-sync.log 2>&1; then
  echo "   ok    migrasi == ERD.md"
else
  echo "   GAGAL migrasi tidak sinkron dengan ERD.md:"; cat /tmp/mig-sync.log; fails=$((fails+1))
fi

echo "6) struktur"
tables=$(Q "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE'")
fks=$(Q "select count(*) from pg_constraint where contype='f'")
checks=$(Q "select count(*) from pg_constraint where contype='c' and connamespace='public'::regnamespace")
rls=$(Q "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
         where n.nspname='public' and c.relkind='r' and c.relrowsecurity")
pub=$(Q "select count(*) from pg_publication_tables where pubname='supabase_realtime' and schemaname='public'")
pol=$(Q "select count(*) from pg_policies where schemaname='public'")
echo "   tabel=$tables FK=$fks check=$checks | RLS aktif=$rls/$tables | policy=$pol | realtime=$pub"

[ "$tables" = "42" ] || { echo "   GAGAL jumlah tabel $tables != 42"; fails=$((fails+1)); }
[ "$rls" = "$tables" ] || { echo "   GAGAL RLS tidak aktif di semua tabel"; fails=$((fails+1)); }
[ "$pub" -gt 0 ] || { echo "   GAGAL realtime publication kosong"; fails=$((fails+1)); }

trig=$(Q "select count(*) from pg_trigger where tgrelid = 'public.wallet_ledgers'::regclass and not tgisinternal")
echo "   trigger penjaga append-only di wallet_ledgers = $trig (harus 2: baris + truncate)"
[ "$trig" = "2" ] || { echo "   GAGAL trigger append-only tidak lengkap"; fails=$((fails+1)); }

echo "7) seed"
echo "   users=$(Q 'select count(*) from public.users') merchants=$(Q 'select count(*) from public.merchants') menus=$(Q 'select count(*) from public.menus') variants=$(Q 'select count(*) from public.menu_variants') wallets=$(Q 'select count(*) from public.wallets') zones=$(Q 'select count(*) from public.zones') roles=$(Q 'select count(*) from public.roles')"
[ "$(Q 'select count(*) from public.users')" = "4" ] || { echo "   GAGAL seed users != 4"; fails=$((fails+1)); }
[ "$(Q 'select count(*) from public.wallets')" = "3" ] || { echo "   GAGAL seed wallets != 3 (CS tidak memegang saldo)"; fails=$((fails+1)); }

echo "8) uji constraint & FK benar-benar berlaku"
expect_ok   "insert pengguna kedua (nomor unik)" \
  "insert into public.users (role, phone) values ('customer','+962790000009')"
expect_fail "telepon duplikat ditolak" \
  "insert into public.users (role, phone) values ('customer','+962790000009')"
expect_fail "role tidak dikenal ditolak" \
  "insert into public.users (role, phone) values ('admin','+962790000010')"
expect_fail "nomor bukan E.164 ditolak" \
  "insert into public.users (role, phone) values ('customer','0812345')"

# Order nyata dulu, supaya uji berikutnya gagal KARENA ALASANNYA SENDIRI
# (bukan karena FK ke order yang tidak ada).
expect_ok   "order valid dibuat" \
  "insert into public.orders (code,status,customer_id,merchant_id,delivery_address_id,
     sub_total_jod,delivery_fee_jod,platform_fee_jod,total_jod,payment_method)
   select 'SA-TEST-1','cart',c.id,m.id,a.id,10,1.5,0.37,11.87,'cod'
   from public.customers c, public.merchants m, public.addresses a limit 1"

expect_fail "FK customer hantu ditolak" \
  "insert into public.orders (code,status,customer_id,merchant_id,delivery_address_id,
     sub_total_jod,delivery_fee_jod,platform_fee_jod,total_jod,payment_method)
   select 'SA-TEST-2','cart',999999,m.id,a.id,1,1,1,3,'cod'
   from public.merchants m, public.addresses a limit 1"
expect_fail "status di luar enum ditolak" \
  "insert into public.orders (code,status,customer_id,merchant_id,delivery_address_id,
     sub_total_jod,delivery_fee_jod,platform_fee_jod,total_jod,payment_method)
   select 'SA-TEST-3','selesai',customer_id,merchant_id,delivery_address_id,1,1,1,3,'cod'
   from public.orders where code = 'SA-TEST-1'"
expect_fail "kode order duplikat ditolak" \
  "insert into public.orders (code,status,customer_id,merchant_id,delivery_address_id,
     sub_total_jod,delivery_fee_jod,platform_fee_jod,total_jod,payment_method)
   select 'SA-TEST-1',status,customer_id,merchant_id,delivery_address_id,1,1,1,3,'cod'
   from public.orders where code = 'SA-TEST-1'"
expect_fail "max_select 0 ditolak" \
  "insert into public.menu_variants (menu_id,name,max_select)
   select id,'X',0 from public.menus limit 1"
expect_fail "hold_status 'cut' ditolak (tahap sudah dihapus)" \
  "insert into public.wallet_holds (wallet_id,order_id,amount_jod,status)
   select w.id,o.id,1,'cut' from public.wallets w, public.orders o
   where o.code = 'SA-TEST-1' limit 1"
expect_fail "saldo wallet negatif ditolak" \
  "insert into public.wallets (user_id,balance_jod)
   select id,-1 from public.users where phone = '+962790000009'"
expect_fail "ulasan dengan merchant DAN menu sekaligus ditolak" \
  "insert into public.rating_reviews (order_id,customer_id,merchant_id,menu_id,rating)
   select o.id,o.customer_id,o.merchant_id,(select id from public.menus limit 1),5
   from public.orders o where o.code = 'SA-TEST-1'"
# append-only (ditemukan oleh E2E; lihat migrasi 0006)
# Catatan: trigger-nya level BARIS, jadi tabel harus punya isi dulu —
# UPDATE pada tabel kosong mengenai 0 baris dan wajar tidak memicu apa pun.
expect_ok   "siapkan baris ledger untuk uji append-only" \
  "insert into public.wallet_ledgers (user_id,type,reference,amount_jod)
   select id,'cr','topUp',1 from public.users limit 1"
expect_fail "UPDATE pada ledger ditolak (append-only)" \
  "update public.wallet_ledgers set amount_jod = 999 where id = (select min(id) from public.wallet_ledgers)"
expect_fail "DELETE pada ledger ditolak (append-only)" \
  "delete from public.wallet_ledgers where id = (select min(id) from public.wallet_ledgers)"
expect_fail "TRUNCATE pada ledger ditolak (append-only)" \
  "truncate public.wallet_ledgers"
expect_fail "UPDATE pada audit_logs ditolak (append-only)" \
  "insert into public.audit_logs (action) values ('x'); update public.audit_logs set action = 'y'"

echo "9) RLS benar-benar menyembunyikan data anon"
PSQL -q <<'SQL'
set role anon;
SQL
anon_see=$(PGPASSWORD= "$PG/psql" -h /tmp -p "$PORT" -U postgres -d "$DB" -t -A \
  -c "set role anon; select count(*) from public.orders" 2>&1 | tail -1)
if [ "$anon_see" = "0" ]; then
  echo "   ok    anon melihat 0 order (RLS menolak)"
else
  echo "   GAGAL anon melihat $anon_see order — RLS bocor"
  fails=$((fails+1))
fi
pub_menu=$(PGPASSWORD= "$PG/psql" -h /tmp -p "$PORT" -U postgres -d "$DB" -t -A \
  -c "set role anon; select count(*) from public.menus" 2>&1 | tail -1)
if [ "$pub_menu" = "4" ]; then
  echo "   ok    anon boleh melihat katalog menu (4)"
else
  echo "   GAGAL anon melihat menu = $pub_menu (harusnya 4)"
  fails=$((fails+1))
fi

echo
if [ "$fails" -eq 0 ]; then
  echo "LULUS — migrasi berjalan, constraint & RLS berlaku, seed benar"
  exit 0
fi
echo "GAGAL — $fails pemeriksaan tidak lulus"
exit 1
