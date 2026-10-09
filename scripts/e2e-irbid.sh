#!/usr/bin/env bash
# E2E skema Sa7tein: boot Postgres sementara → jalankan migrasi → jalankan alur bisnis.
#
#   ./scripts/e2e-irbid.sh [port]
#
# Menguji alur end-to-end DI SKEMA (bukan kode aplikasi — adapter M6 belum ada):
# reserve → settle, batal → release, race claim kurir, snapshot harga, SLA,
# kewajiban platform, ledger append-only, dan RLS.
set -uo pipefail

PORT="${1:-55450}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MIG="$ROOT/supabase/migrations"
PGDATA="/tmp/sa7tein-e2e-pg-$PORT"
PG="${PG_BIN:-/usr/local/bin}"
DB="sa7tein_e2e"
started=0

cleanup() {
  [ "$started" = "1" ] && "$PG/pg_ctl" -D "$PGDATA" stop -m immediate >/dev/null 2>&1
  rm -rf "$PGDATA"
}
trap cleanup EXIT

for bin in initdb pg_ctl psql createdb pg_isready; do
  [ -x "$PG/$bin" ] || { echo "SKIP: $PG/$bin tidak ada (set PG_BIN)"; exit 0; }
done

echo "1) initdb cluster sementara -> $PGDATA"
rm -rf "$PGDATA"
"$PG/initdb" -D "$PGDATA" -U postgres --auth=trust -E UTF8 >/tmp/e2e-initdb.log 2>&1 \
  || { echo "GAGAL initdb"; tail -15 /tmp/e2e-initdb.log; exit 1; }

echo "2) start postgres port $PORT"
"$PG/pg_ctl" -D "$PGDATA" -l "/tmp/e2e-pg-$PORT.log" \
  -o "-p $PORT -k /tmp -c listen_addresses=''" start >/dev/null 2>&1
started=1
for _ in $(seq 1 40); do "$PG/pg_isready" -h /tmp -p "$PORT" -U postgres >/dev/null 2>&1 && break; done
"$PG/pg_isready" -h /tmp -p "$PORT" -U postgres >/dev/null 2>&1 \
  || { echo "GAGAL: postgres tidak siap"; tail -15 "/tmp/e2e-pg-$PORT.log"; exit 1; }
"$PG/createdb" -h /tmp -p "$PORT" -U postgres "$DB" || { echo "GAGAL createdb"; exit 1; }

PSQL() { "$PG/psql" -h /tmp -p "$PORT" -U postgres -d "$DB" -v ON_ERROR_STOP=1 "$@"; }

echo "3) stub Supabase Auth + role"
PSQL -q <<'SQL'
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key, email text);
create or replace function auth.uid() returns uuid
  language sql stable as $fn$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $fn$;
do $do$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $do$;
SQL

echo "4) jalankan migrasi"
for f in "$MIG"/0*.sql; do
  if out=$(PSQL -q -f "$f" 2>&1); then
    echo "   ok    $(basename "$f")"
  else
    echo "   GAGAL $(basename "$f"):"; echo "$out" | tail -12; exit 1
  fi
done

PSQL -q <<'SQL'
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;
SQL

echo "5) jalankan alur E2E"
echo
if out=$(PSQL -q -f "$ROOT/scripts/e2e-irbid.sql" 2>&1); then
  echo "$out"
  exit 0
fi
echo "$out"
echo
echo "E2E GAGAL — lihat pesan di atas"
exit 1
