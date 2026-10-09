-- ============================================================
--  E2E skema Sa7tein (Irbid MVP) — dijalankan oleh scripts/e2e-irbid.sh
--
--  Menguji bahwa SKEMA mampu mengekspresikan alur bisnis nyata, dengan
--  invariant yang bisa dibuktikan:
--    S1  snapshot harga tidak berubah setelah menu naik harga
--    S2  reserve saat order: saldo BELUM berkurang, hanya reserved naik
--    S3  settle saat done: saldo berkurang di titik itu + ledger cr/db
--    S4  batal sebelum done: hanya release, saldo tidak tersentuh
--    S5  race claim kurir: hanya satu pemenang (compare-and-swap)
--    S6  kolom SLA batch bisa diisi & terbaca
--    S7  kewajiban platform = saldo user (bukan milik platform)
--    S8  ledger append-only benar-benar ditegakkan
--    S9  RLS menolak tulis yang bukan haknya
--
--  CATATAN PENTING: orkestrasi di sini adalah SQL, karena adapter backend (M6)
--  belum ada. Yang diuji adalah SKEMA (kolom, constraint, status, RLS), bukan
--  kode aplikasi. Nilai `UNRESOLVED` tidak diisi — hanya ditulis sebagai angka
--  uji lokal supaya kolomnya terbukti bekerja.
-- ============================================================

\set ON_ERROR_STOP on
\pset format unaligned
\pset tuples_only on
\pset border 0

create temp table t_result (label text, ok boolean);
create or replace function t_assert(label text, cond boolean) returns text
language plpgsql as $$
begin
  insert into t_result (label, ok) values (label, coalesce(cond, false));
  if not coalesce(cond, false) then
    return 'GAGAL  ' || label;
  end if;
  return 'ok     ' || label;
end $$;

-- helper: id
create temp view v as
  select
    (select id from public.users where phone = '+962790000001') as customer_user,
    (select id from public.users where phone = '+962790000002') as merchant_user,
    (select id from public.users where phone = '+962790000003') as courier_user,
    (select c.id from public.customers c where c.user_id = (select id from public.users where phone = '+962790000001')) as customer_id,
    (select m.id from public.merchants m where m.user_id = (select id from public.users where phone = '+962790000002')) as merchant_id,
    (select co.id from public.couriers co where co.user_id = (select id from public.users where phone = '+962790000003')) as courier_id,
    (select a.id from public.addresses a where a.user_id = (select id from public.users where phone = '+962790000001')) as address_id;

\echo 'S1 — snapshot harga'
create temp table t_price as select id, price_jod from public.menus where name = 'Nasi Goreng Spesial';
insert into public.orders (code,status,customer_id,merchant_id,delivery_address_id,
  sub_total_jod,delivery_fee_jod,platform_fee_jod,total_jod,payment_method,zone_code)
select 'SA-E2E-1','cart',customer_id,merchant_id,address_id, 10.000,1.500,0.370,11.870,'cod','Hijazi' from v;
insert into public.order_items (order_id,menu_id,name,qty,unit_price_jod,modifiers,line_total_jod)
select o.id, mn.id, mn.name, 2, mn.price_jod, '[]'::jsonb, mn.price_jod*2
from public.orders o, public.menus mn where o.code='SA-E2E-1' and mn.name='Nasi Goreng Spesial';
update public.menus set price_jod = price_jod + 5 where name = 'Nasi Goreng Spesial';
select t_assert('S1 harga item di order TIDAK ikut naik',
  (select oi.unit_price_jod = tp.price_jod
     from public.order_items oi
     join public.orders o on o.id = oi.order_id
     join t_price tp on tp.id = oi.menu_id
    where o.code = 'SA-E2E-1'));
update public.menus m set price_jod = tp.price_jod from t_price tp where tp.id = m.id;

\echo 'S2 — reserve saat order (saldo belum berkurang)'
update public.wallets set balance_jod = 20.000, reserved_balance_jod = 0
 where user_id = (select customer_user from v);
insert into public.wallet_holds (wallet_id, order_id, amount_jod, status)
select w.id, o.id, o.total_jod, 'reserved'
from public.wallets w, public.orders o, v
where w.user_id = v.customer_user and o.code = 'SA-E2E-1';
update public.wallets set reserved_balance_jod = reserved_balance_jod + 11.870
 where user_id = (select customer_user from v);
update public.orders set status = 'quotation', placed_at = now() where code = 'SA-E2E-1';
select t_assert('S2 saldo masih 20 (reserve bukan potong)',
  (select balance_jod = 20.000 from public.wallets where user_id = (select customer_user from v)));
select t_assert('S2 reserved_balance naik jadi 11.87',
  (select reserved_balance_jod = 11.870 from public.wallets where user_id = (select customer_user from v)));
select t_assert('S2 hold berstatus reserved',
  (select h.status = 'reserved' from public.wallet_holds h join public.orders o on o.id = h.order_id where o.code = 'SA-E2E-1'));

\echo 'S3 — settle saat done (saldo berkurang di titik ini)'
update public.orders set status = 'prepare' where code = 'SA-E2E-1';
update public.orders set status = 'waitingCourier' where code = 'SA-E2E-1';
update public.orders set status = 'waitingDelivery' where code = 'SA-E2E-1';
update public.orders set status = 'delivery' where code = 'SA-E2E-1';
update public.orders set status = 'done', payment_status = 'paid', paid_at = now(),
       hold_status = 'settled' where code = 'SA-E2E-1';
update public.wallet_holds set status = 'settled', settled_at = now()
 where order_id = (select id from public.orders where code='SA-E2E-1');
update public.wallets set balance_jod = balance_jod - 11.870,
       reserved_balance_jod = reserved_balance_jod - 11.870
 where user_id = (select customer_user from v);
insert into public.wallet_ledgers (user_id,type,reference,amount_jod,order_id)
select customer_user,'db','order',11.870,(select id from public.orders where code='SA-E2E-1') from v;
insert into public.wallet_ledgers (user_id,type,reference,amount_jod,order_id)
select merchant_user,'cr','delivery',11.870,(select id from public.orders where code='SA-E2E-1') from v;
select t_assert('S3 hold settled',
  (select hold_status = 'settled' from public.orders where code='SA-E2E-1'));
select t_assert('S3 saldo turun ke 8.13',
  (select balance_jod = 8.130 from public.wallets where user_id = (select customer_user from v)));
select t_assert('S3 reserved kembali 0',
  (select reserved_balance_jod = 0 from public.wallets where user_id = (select customer_user from v)));
select t_assert('S3 ledger punya 1 db customer + 1 cr merchant',
  (select count(*) = 2 from public.wallet_ledgers wl
    where wl.order_id = (select id from public.orders where code='SA-E2E-1')));

\echo 'S4 — batal sebelum done: hanya release'
insert into public.orders (code,status,customer_id,merchant_id,delivery_address_id,
  sub_total_jod,delivery_fee_jod,platform_fee_jod,total_jod,payment_method,zone_code)
select 'SA-E2E-2','quotation',customer_id,merchant_id,address_id, 3.000,1.500,0.370,4.870,'cod','Hijazi' from v;
insert into public.wallet_holds (wallet_id, order_id, amount_jod, status)
select w.id, o.id, 4.870, 'reserved' from public.wallets w, public.orders o, v
where w.user_id = v.customer_user and o.code = 'SA-E2E-2';
update public.wallets set reserved_balance_jod = reserved_balance_jod + 4.870
 where user_id = (select customer_user from v);
-- batal
update public.orders set status = 'canceled', cancel_by = 'customer', cancel_reason = 'customer_cancelled',
       hold_status = 'released' where code = 'SA-E2E-2';
update public.wallet_holds set status = 'released'
 where order_id = (select id from public.orders where code='SA-E2E-2');
update public.wallets set reserved_balance_jod = reserved_balance_jod - 4.870
 where user_id = (select customer_user from v);
select t_assert('S4 hold released', 
  (select hold_status = 'released' from public.orders where code='SA-E2E-2'));
select t_assert('S4 saldo tetap 8.13 (tidak ada potongan)',
  (select balance_jod = 8.130 from public.wallets where user_id = (select customer_user from v)));
select t_assert('S4 reserved kembali 0',
  (select reserved_balance_jod = 0 from public.wallets where user_id = (select customer_user from v)));
select t_assert('S4 tidak ada ledger untuk order batal',
  (select count(*) = 0 from public.wallet_ledgers
    where order_id = (select id from public.orders where code='SA-E2E-2')));

\echo 'S5 — race claim kurir: hanya satu pemenang'
insert into public.orders (code,status,customer_id,merchant_id,delivery_address_id,
  sub_total_jod,delivery_fee_jod,platform_fee_jod,total_jod,payment_method,zone_code)
select 'SA-E2E-3','waitingCourier',customer_id,merchant_id,address_id, 5.000,1.500,0.370,6.870,'cod','Hijazi' from v;
do $$
declare n1 int; n2 int; oid bigint;
begin
  select id into oid from public.orders where code = 'SA-E2E-3';
  -- kurir pertama: compare-and-swap
  update public.orders set courier_id = (select courier_id from v), status = 'waitingDelivery'
   where id = oid and status = 'waitingCourier' and courier_id is null;
  n1 := case when found then 1 else 0 end;
  -- kurir kedua mencoba hal yang sama
  update public.orders set courier_id = (select courier_id from v), status = 'waitingDelivery'
   where id = oid and status = 'waitingCourier' and courier_id is null;
  n2 := case when found then 1 else 0 end;
  perform t_assert('S5 klaim pertama menang (1 baris)', n1 = 1);
  perform t_assert('S5 klaim kedua ditolak (0 baris)', n2 = 0);
end $$;

\echo 'S6 — kolom SLA batch'
insert into public.batches (merchant_id, courier_id, status, eta_prepare_seconds,
  sla_prepare_deadline, sla_delivery_deadline)
select merchant_id, courier_id, 'prepare', 900, now() + interval '15 minutes', now() + interval '45 minutes' from v;
select t_assert('S6 SLA deadline tersimpan (kolom bekerja, angkanya tetap UNRESOLVED)',
  (select sla_prepare_deadline is not null and escalated_to_admin = false from public.batches limit 1));

\echo 'S7 — kewajiban platform = saldo user'
select t_assert('S7 total saldo user = 8.130 (ini kewajiban platform, bukan milik platform)',
  (select sum(balance_jod) = 8.130 from public.wallets));
select t_assert('S7 kredit merchant 5.000 non-withdrawal',
  (select balance_jod = 5.000 and non_withdrawable from public.merchant_credits limit 1));
select t_assert('S7 profit platform disimpan TERPISAH dari dana user',
  (select count(*) = 0 from public.platform_profit));

\echo 'S8 — ledger append-only ditegakkan'
do $$
declare blocked boolean := false;
begin
  begin
    update public.wallet_ledgers set amount_jod = 999 where id = (select min(id) from public.wallet_ledgers);
    blocked := false;
  exception when others then
    blocked := true;
  end;
  perform t_assert('S8 UPDATE pada ledger DITOLAK', blocked);
end $$;
do $$
declare blocked boolean := false;
begin
  begin
    delete from public.wallet_ledgers where id = (select min(id) from public.wallet_ledgers);
    blocked := false;
  exception when others then
    blocked := true;
  end;
  perform t_assert('S8 DELETE pada ledger DITOLAK', blocked);
end $$;

\echo 'S9 — RLS menolak tulis yang bukan haknya'
-- Catatan: RLS TIDAK melempar error — ia hanya membuat 0 baris terlihat/terubah.
-- Jadi yang benar diuji: berapa baris yang terpengaruh, dan apakah nilainya berubah.
do $$
declare affected int; before_val numeric; after_val numeric;
begin
  select balance_jod into before_val from public.wallets where user_id = (select customer_user from v);
  set role authenticated;                -- tanpa auth.uid() → app_uid() null
  update public.wallets set balance_jod = 999999;
  affected := case when found then 1 else 0 end;
  reset role;
  select balance_jod into after_val from public.wallets where user_id = (select customer_user from v);
  perform t_assert('S9 non-pemilik mengubah 0 baris wallet', affected = 0);
  perform t_assert('S9 saldo tidak berubah', after_val = before_val);
end $$;
do $$
declare terlihat int;
begin
  set role authenticated;
  select count(*) into terlihat from public.orders;
  reset role;
  perform t_assert('S9 non-pemilik melihat 0 order', terlihat = 0);
end $$;

\echo 'S10 — reset demo aman terhadap penjaga append-only'
-- Premis `resetDemo()` di irbidBackend.js: sebelum menghapus apa pun ia mengecek
-- apakah wallet_ledgers/audit_logs kosong. Delete pada tabel append-only yang
-- KOSONG harus lolos (trigger row tidak pernah menyala), sedangkan TRUNCATE
-- selalu ditolak (trigger statement). Kalau premis ini salah, preflight di
-- adapter akan memblokir reset demo yang sebenarnya aman.
do $$
declare blocked boolean := false;
begin
  begin
    delete from public.wallet_ledgers where false;   -- 0 baris cocok
    blocked := false;
  exception when others then
    blocked := true;
  end;
  perform t_assert('S10 DELETE 0 baris pada ledger diizinkan', not blocked);
end $$;
do $$
declare blocked boolean := false;
begin
  begin
    truncate public.audit_logs;
    blocked := false;
  exception when others then
    blocked := true;
  end;
  perform t_assert('S10 TRUNCATE audit_logs DITOLAK', blocked);
end $$;
do $$
declare blocked boolean := false;
begin
  begin
    delete from public.wallet_ledgers where id = (select min(id) from public.wallet_ledgers);
    blocked := false;
  exception when others then
    blocked := true;
  end;
  perform t_assert('S10 preflight benar-benar memblokir bila ledger BERISI', blocked);
end $$;

\echo ''
select case
         when count(*) filter (where not ok) = 0
         then 'E2E LULUS — ' || count(*) || ' pemeriksaan'
         else 'E2E GAGAL — ' || count(*) filter (where not ok) || ' dari ' || count(*) || ' gagal'
       end as hasil
from t_result;

select label from t_result where not ok order by label;

do $$
begin
  if (select count(*) filter (where not ok) from t_result) > 0 then
    raise exception 'E2E gagal';
  end if;
end $$;
