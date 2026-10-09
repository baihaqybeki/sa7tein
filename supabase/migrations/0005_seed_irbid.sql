-- ============================================================
--  Sa7tein — 0005: M5 — seed data demo (Irbid, JOD)
--
--  Bergantung pada: 0004.
--
--  Isi yang SENGAJA TIDAK di-seed karena masih `UNRESOLVED`
--  (lihat docs/backend/ERD.md §8) — jangan diisi tebakan:
--    • `taxes.rate_pct`, `tax_reports.*`        → TAX-1/TAX-2 (tarif pajak belum final)
--    • `cashouts.fee_jod`                       → CO-1 (OQ-22)
--    • `exchange_rates.rate`/`source`           → FX-1 (OQ-26/28)
--    • `cashback_tiers`                         → INC-1 (I-4/I-5)
--    • `marketing`                              → MKT-1 (scope promo)
--    • `batches.sla_*_deadline`                 → SLA-1 (angka SLA sementara)
--    • `disputes.window_closes_at`              → DSP-1 (OQ-29)
--
--  Zona di bawah adalah CONTOH BATAS KASAR untuk demo; batas sebenarnya
--  ditentukan Super Admin (f22) dan bukan keputusan yang boleh ditebak di sini.
-- ============================================================

-- ------------------------------------------------------------
--  Master zona + role + kill switch (bagian dari platform)
-- ------------------------------------------------------------
insert into public.zones (code, name, polygon) values
  ('Hijazi',  'Hijazi',  '[[32.5200,35.8200],[32.5800,35.8200],[32.5800,35.9000],[32.5200,35.9000]]'),
  ('Syimali', 'Syimali', '[[32.5800,35.8200],[32.6400,35.8200],[32.6400,35.9000],[32.5800,35.9000]]')
on conflict (code) do nothing;

insert into public.roles (key, name, permissions) values
  ('cs_ops',   'CS Operator',       '["tenant.read","tenant.approve","deposit.verify","dispute.resolve","cod.blacklist","order.cancel"]'),
  ('sa_ops',   'Super Admin Ops',   '["zone.write","role.write","audit.read","ledger.read"]'),
  ('sa_owner', 'Super Admin Owner', '["zone.write","role.write","audit.read","ledger.read","tenant.status","tax.read","profit.withdraw","switch.write"]')
on conflict (key) do nothing;

insert into public.platform_switches (key, enabled) values
  ('cod_enabled', true), ('payout_enabled', true), ('maintenance_mode', false)
on conflict (key) do nothing;

-- ------------------------------------------------------------
--  Pengguna demo (satu per peran operasional yang dipakai UI)
--  Nomor memakai format E.164 (+962). Password dikelola Supabase Auth,
--  bukan di sini — kolom `auth_user_id` diisi saat akun auth dibuat.
-- ------------------------------------------------------------
insert into public.users (role, email, phone, verified, status, auth_provider) values
  ('customer', 'customer@sa7tein.app', '+962790000001', true, 'active', 'phone'),
  ('merchant', 'merchant@sa7tein.app', '+962790000002', true, 'active', 'phone'),
  ('courier',  'courier@sa7tein.app',  '+962790000003', true, 'active', 'phone'),
  ('cs',       'cs@sa7tein.app',       '+962790000004', true, 'active', 'phone')
on conflict (phone) do nothing;

-- ------------------------------------------------------------
--  Profil per peran
-- ------------------------------------------------------------
insert into public.customers (user_id, name)
select u.id, 'Budi Santoso' from public.users u
where u.phone = '+962790000001'
  and not exists (select 1 from public.customers c where c.user_id = u.id);

insert into public.merchants (user_id, store_name, store_phone, store_address, description,
                              available, delivery_config, tenant_status, deposit_jod, deposit_status)
select u.id, 'Warung Nusantara', '+962790000002', 'Jl. Hijazi No. 8, Irbid',
       'Masakan Indonesia di Irbid', true,
       '{"mode":"area","activeZones":["Hijazi","Syimali"],"feeByArea":[{"zone":"Hijazi","feeJod":1.500},{"zone":"Syimali","feeJod":2.000}]}'::jsonb,
       'approved', 3.500, 'held'          -- 3.50 JOD = keputusan PO (DEC-1038)
from public.users u
where u.phone = '+962790000002'
  and not exists (select 1 from public.merchants m where m.user_id = u.id);

insert into public.couriers (user_id, merchant_id, name, availability, latitude, longitude, vehicle)
select u.id, m.id, 'Andi Saputra', 'available', 32.5550, 35.8500, 'Motor'
from public.users u
join public.merchants m on m.user_id = (select id from public.users where phone = '+962790000002')
where u.phone = '+962790000003'
  and not exists (select 1 from public.couriers c where c.user_id = u.id);

-- ------------------------------------------------------------
--  Buku alamat customer demo (zona hasil hitung saat pin disimpan)
-- ------------------------------------------------------------
insert into public.addresses (user_id, label, address, latitude, longitude, is_default, zone_id, zone_code)
select u.id, 'Rumah', 'Jl. Hijazi No. 12, Irbid', 32.5550, 35.8500, true,
       (select z.id from public.zones z where z.code = 'Hijazi'), 'Hijazi'
from public.users u
where u.phone = '+962790000001'
  and not exists (select 1 from public.addresses a where a.user_id = u.id);

-- ------------------------------------------------------------
--  Wallet setiap pengguna bertransaksi (CS tidak memegang saldo)
-- ------------------------------------------------------------
insert into public.wallets (user_id, balance_jod)
select u.id, 0 from public.users u
where u.role in ('customer','merchant','courier')
  and not exists (select 1 from public.wallets w where w.user_id = u.id);

-- ------------------------------------------------------------
--  Modal founding + deposit (I-2: kredit 5 JOD non-withdrawal, terpisah dari deposit COD 3.50)
-- ------------------------------------------------------------
insert into public.merchant_credits (merchant_id, balance_jod, non_withdrawable)
select m.id, 5.000, true from public.merchants m
where not exists (select 1 from public.merchant_credits mc where mc.merchant_id = m.id);

insert into public.deposits (merchant_id, kind, amount_jod, status)
select m.id, 'founding_credit', 5.000, 'held' from public.merchants m
where not exists (select 1 from public.deposits d where d.merchant_id = m.id and d.kind = 'founding_credit');

insert into public.deposits (merchant_id, kind, amount_jod, status)
select m.id, 'cod', 3.500, 'held' from public.merchants m
where not exists (select 1 from public.deposits d where d.merchant_id = m.id and d.kind = 'cod');

-- ------------------------------------------------------------
--  Katalog + varian
-- ------------------------------------------------------------
insert into public.menus (merchant_id, name, description, price_jod, available)
select m.id, x.name, x.descr, x.price, true
from public.merchants m
cross join (values
  ('Nasi Goreng Spesial', 'Nasi goreng dengan telur & ayam', 3.500),
  ('Mie Goreng',          'Mie goreng sayur',                 3.000),
  ('Es Teh Manis',        'Teh manis dingin',                 0.750),
  ('Gule Kambing',        'Gule kambing santan',              5.500)
) as x(name, descr, price)
where not exists (select 1 from public.menus mn where mn.merchant_id = m.id and mn.name = x.name);

insert into public.menu_variants (menu_id, name, required, max_select, options)
select mn.id, 'Pedas', false, 1,
       '[{"id":1,"name":"Tidak pedas","priceDeltaJod":0},{"id":2,"name":"Pedas","priceDeltaJod":0},{"id":3,"name":"Sangat pedas","priceDeltaJod":0.250}]'::jsonb
from public.menus mn
where mn.name in ('Nasi Goreng Spesial','Mie Goreng')
  and not exists (select 1 from public.menu_variants mv where mv.menu_id = mn.id and mv.name = 'Pedas');

insert into public.menu_variants (menu_id, name, required, max_select, options)
select mn.id, 'Ukuran', true, 1,
       '[{"id":1,"name":"Regular","priceDeltaJod":0},{"id":2,"name":"Jumbo","priceDeltaJod":1.000}]'::jsonb
from public.menus mn
where mn.name = 'Nasi Goreng Spesial'
  and not exists (select 1 from public.menu_variants mv where mv.menu_id = mn.id and mv.name = 'Ukuran');

-- ------------------------------------------------------------
--  Ringkasan
-- ------------------------------------------------------------
do $$
declare
  n_users int; n_merch int; n_menu int; n_var int; n_wallet int; n_zone int; n_role int; n_addr int;
begin
  select count(*) into n_users  from public.users;
  select count(*) into n_merch  from public.merchants;
  select count(*) into n_menu   from public.menus;
  select count(*) into n_var    from public.menu_variants;
  select count(*) into n_wallet from public.wallets;
  select count(*) into n_zone   from public.zones;
  select count(*) into n_role   from public.roles;
  select count(*) into n_addr   from public.addresses;
  raise notice 'seed: users=% merchants=% menus=% variants=% wallets=% zones=% roles=% addresses=%',
    n_users, n_merch, n_menu, n_var, n_wallet, n_zone, n_role, n_addr;
end $$;
