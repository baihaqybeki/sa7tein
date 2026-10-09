-- ============================================================
--  Sa7tein — SEMUA MIGRASI (0000-0006) dalam satu berkas
--
--  ⚠️  DESTRUKTIF. Berkas ini menghapus 7 tabel skema lama BESERTA SELURUH
--      ISINYA (bagian 0000). Jalankan HANYA setelah backup.
--      Backup sebelum perubahan: supabase/backup-legacy-*/ (lihat catatan di
--      docs/backend/MIGRATION-RUNBOOK.md §2).
--
--  Cara pakai (SQL Editor Supabase):
--    1. Supabase Dashboard -> SQL Editor -> New query
--    2. Tempel SELURUH isi berkas ini, lalu Run
--    3. Jalankan `npm run db:remote-check` untuk memastikan hasilnya
--
--  Catatan:
--   * Bagian 0005 berisi data DEMO (4 user, 1 merchant, 4 menu, 3 wallet).
--     Kalau tidak mau, hapus bagian 0005 sebelum Run.
--   * Berkas ini di-GENERATE oleh `npm run db:migrations:bundle` — jangan
--     diedit langsung.
-- ============================================================


-- ########## 0000_drop_legacy.sql ##########
-- (sumber: supabase/migrations/0000_drop_legacy.sql, 40 baris)

-- ============================================================
--  Sa7tein — 0000: drop skema lama (7 tabel) sebelum ERD Irbid
--
--  ⚠️  DESTRUKTIF. Membuang SEMUA data skema lama.
--  Jalankan HANYA setelah backup — lihat docs/backend/MIGRATION-RUNBOOK.md.
--
--  Skema lama (lihat docs/backend/ERD.md §6):
--    merchants, menu_items, orders (jsonb `data`), couriers, profiles,
--    settings (kv), order_messages
--
--  Catatan: nama `merchants` dan `couriers` DIPAKAI ULANG oleh skema baru,
--  jadi keduanya harus dibuang lebih dulu.
-- ============================================================

-- Lepaskan dari realtime publication lebih dulu (kalau ada), supaya drop bersih.
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['order_messages','settings','profiles','couriers','orders','menu_items','merchants'] loop
      if exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
      ) then
        execute format('alter publication supabase_realtime drop table public.%I', t);
      end if;
    end loop;
  end if;
end $$;

drop table if exists public.order_messages cascade;
drop table if exists public.settings       cascade;
drop table if exists public.profiles       cascade;
drop table if exists public.couriers       cascade;
drop table if exists public.orders         cascade;
drop table if exists public.menu_items     cascade;
drop table if exists public.merchants      cascade;

-- Fungsi bantu skema lama (kalau pernah ada)
drop function if exists public.sa7tein_current_role() cascade;

-- ########## 0001_identity_catalog.sql ##########
-- (sumber: supabase/migrations/0001_identity_catalog.sql, 138 baris)

-- ============================================================
--  Sa7tein — Fase 1 (M2) — identitas & katalog
--  Sumber kanonik: docs/backend/ERD.md §3. Bergantung pada: 0000_drop_legacy.sql.
--  DDL ini di-generate dari ERD.md supaya dokumen & migrasi tidak drift.
--  JANGAN edit file ini langsung — ubah ERD.md lalu jalankan
--  `npm run db:migrations:sync`.
-- ============================================================

-- users: identitas login. Peran menentukan tabel profil mana yang dipakai.
create table users (
  id          bigint generated always as identity primary key,
  auth_user_id uuid unique references auth.users(id) on delete set null,  -- jembatan ke Supabase Auth (pengganti profiles.id)
  role        text not null check (role in ('customer','merchant','courier','cs','superadmin')),
  email       text unique,
  phone       text not null unique
              check (phone ~ '^\+[1-9][0-9]{7,14}$'),  -- E.164 (+962/+62); wajib
  verified    boolean not null default false,
  status      text not null default 'active' check (status in ('active','suspended')),
  auth_provider text not null default 'phone' check (auth_provider in ('phone','google')),
  created_at  timestamptz not null default now()
);

-- phone_verifications: Level 1 = validasi format saja (tanpa OTP WA)
create table phone_verifications (
  id         bigint generated always as identity primary key,
  user_id    bigint references users(id) on delete cascade,
  phone      text not null check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  method     text not null default 'format_only' check (method in ('format_only','wa_otp')),
  code       text,                  -- UNRESOLVED: AUT-1 (dipakai hanya bila Level 2 aktif)
  expires_at timestamptz,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

-- customers: profil customer
create table customers (
  id         bigint generated always as identity primary key,
  user_id    bigint not null unique references users(id) on delete cascade,
  name       text not null,
  risk_flag  boolean not null default false,   -- blacklist COD (ditandai CS/SA)
  created_at timestamptz not null default now()
);

-- zones: master zona. Didefinisikan Super Admin; merchant hanya mengaktifkan.
create table zones (
  id         bigint generated always as identity primary key,
  code       text not null unique,            -- 'Hijazi', 'Syimali', ...
  name       text not null,
  polygon    jsonb,                           -- array [[lat,lng], ...]
  created_at timestamptz not null default now()
);

-- addresses: buku alamat + zona hasil hitung saat pin disimpan
create table addresses (
  id          bigint generated always as identity primary key,
  user_id     bigint not null references users(id) on delete cascade,
  label       text not null,
  address     text not null,
  latitude    double precision not null,
  longitude   double precision not null,
  is_default  boolean not null default false,
  zone_id     bigint references zones(id),     -- UNRESOLVED: ZON-1 (aturan & ambang hitung)
  zone_code   text,                            -- denormalisasi kode zona saat disimpan
  created_at  timestamptz not null default now()
);

-- merchants: toko. tenantStatus + deposit = kontrol platform.
create table merchants (
  id            bigint generated always as identity primary key,
  user_id       bigint not null unique references users(id) on delete restrict,
  store_name    text not null,
  store_phone   text check (store_phone ~ '^\+[1-9][0-9]{7,14}$'),
  store_address text,
  latitude      double precision,      -- lokasi toko: dipakai hitung zona (haversine) & fee radius
  longitude     double precision,      -- (draft §2: zone dihitung "haversine ke merchant"; f20 gate coverage)
  description   text,
  photo         text,
  available     boolean not null default true,          -- buka/tutup (pengganti `settings.store_status`)
  delivery_config jsonb not null default '{}'::jsonb,   -- { mode, radiusMeters, feeByDistance[], feeByArea[], activeZones[] }
  tenant_status text not null default 'pending'
                check (tenant_status in ('pending','approved','suspended','blacklisted')),
  deposit_jod   numeric(12,3) not null default 0,       -- UNRESOLVED: FEE-1 (PO: 3.50)
  deposit_status text not null default 'unpaid'
                check (deposit_status in ('unpaid','held','released')),
  created_at    timestamptz not null default now()
);

-- couriers: kurir adalah karyawan merchant (maks 3 — ditegakkan di API, bukan FK)
create table couriers (
  id           bigint generated always as identity primary key,
  user_id      bigint not null unique references users(id) on delete cascade,
  merchant_id  bigint not null references merchants(id) on delete restrict,
  name         text not null,                  -- tambahan: nama tampilan kurir (draft tidak mencantumkannya;
                                               -- sejajar dengan customers.name; UI & chat menampilkannya)
  availability text not null default 'unavailable'
               check (availability in ('available','unavailable','busy')),
  latitude     double precision,
  longitude    double precision,
  last_seen_at timestamptz,                    -- tambahan: heartbeat tawaran (bukan di draft)
  photo        text,
  vehicle      text,
  created_at   timestamptz not null default now()
);

-- fav_merchants
create table fav_merchants (
  id          bigint generated always as identity primary key,
  user_id     bigint not null references users(id) on delete cascade,
  merchant_id bigint not null references merchants(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (user_id, merchant_id)
);

-- menus
create table menus (
  id          bigint generated always as identity primary key,
  merchant_id bigint not null references merchants(id) on delete cascade,
  name        text not null,
  description text,
  price_jod   numeric(12,3) not null default 0,
  available   boolean not null default true,
  image       text,
  -- Kolom legacy yang TIDAK ada di draft → lihat §8 (butuh keputusan, jangan diisi tebakan)
  stock       integer,
  category    text,
  created_at  timestamptz not null default now()
);

-- menu_variants: 1 = radio (ukuran), N = checkbox (topping)
create table menu_variants (
  id         bigint generated always as identity primary key,
  menu_id    bigint not null references menus(id) on delete cascade,
  name       text not null,
  required   boolean not null default false,
  max_select integer not null default 1 check (max_select >= 1),
  options    jsonb not null default '[]'::jsonb,   -- [{ id, name, priceDeltaJod }]
  created_at timestamptz not null default now()
);

-- ########## 0002_order_money.sql ##########
-- (sumber: supabase/migrations/0002_order_money.sql, 270 baris)

-- ============================================================
--  Sa7tein — Fase 2 (M3) — order & uang
--  Sumber kanonik: docs/backend/ERD.md §4. Bergantung pada: 0001_identity_catalog.sql.
--  DDL ini di-generate dari ERD.md supaya dokumen & migrasi tidak drift.
--  JANGAN edit file ini langsung — ubah ERD.md lalu jalankan
--  `npm run db:migrations:sync`.
-- ============================================================

-- orders: semua nominal = SNAPSHOT saat order dibuat
create table orders (
  id                bigint generated always as identity primary key,
  code              text not null unique,        -- SA-1041 (tidak ada di draft; dari flows/FEAT-2014)
  status            text not null default 'cart'
                    check (status in ('cart','quotation','canceled','prepare','waitingCourier',
                                      'waitingDelivery','delivery','done')),  -- UNRESOLVED: OST-1
  customer_id       bigint not null references customers(id) on delete restrict,
  merchant_id       bigint not null references merchants(id) on delete restrict,
  delivery_address_id bigint not null references addresses(id) on delete restrict,
  batch_id          bigint,                      -- FK ditambahkan setelah `batches` ada
  courier_id        bigint references couriers(id) on delete set null,
  -- uang (JOD display, IDR settlement)
  sub_total_jod     numeric(12,3) not null,      -- snapshot
  delivery_fee_jod  numeric(12,3) not null,      -- snapshot
  platform_fee_jod  numeric(12,3) not null,      -- snapshot -- UNRESOLVED: FEE-1
  tip_jod           numeric(12,3) not null default 0,   -- snapshot
  promo_amount_jod  numeric(12,3) not null default 0,   -- snapshot
  total_jod         numeric(12,3) not null,      -- snapshot
  total_idr         numeric(18,2),               -- settlement
  zone_id           bigint references zones(id), -- snapshot (dipakai hitung fee)
  zone_code         text,                        -- snapshot
  promo_id          bigint,                      -- FK ke marketing
  -- pembayaran
  payment_method    text not null check (payment_method in ('cod','transfer','xendit_va','xendit_qris')),
  payment_status    text not null default 'unpaid'
                    check (payment_status in ('unpaid','pending','paid','failed','refunded')),
  paid_at           timestamptz,
  -- reserve/hold
  hold_status       text not null default 'none'
                    check (hold_status in ('none','reserved','settled','released')),
  -- waktu
  created_at        timestamptz not null default now(),
  placed_at         timestamptz,
  -- pembatalan
  cancel_reason     text,
  cancel_by         text check (cancel_by in ('customer','merchant','system')),
  order_note        text
);
create index on orders (merchant_id, status);
create index on orders (customer_id, created_at desc);
create index on orders (courier_id, status);

-- order_items: unit_price & modifiers = SNAPSHOT
create table order_items (
  id             bigint generated always as identity primary key,
  order_id       bigint not null references orders(id) on delete cascade,
  menu_id        bigint not null references menus(id) on delete restrict,
  name           text not null,                  -- snapshot nama hidangan
  qty            integer not null check (qty > 0),
  unit_price_jod numeric(12,3) not null,         -- snapshot
  modifiers      jsonb not null default '[]'::jsonb,  -- snapshot [{ variantId, optionId, name, priceDeltaJod }]
  line_total_jod numeric(12,3) not null,         -- snapshot (unitPrice + Σ delta) × qty
  note           text
);

-- batches: pengelompokan order untuk satu kurir + timer SLA
create table batches (
  id                    bigint generated always as identity primary key,
  merchant_id           bigint not null references merchants(id) on delete restrict,
  courier_id            bigint references couriers(id) on delete set null,
  status                text not null default 'prepare'
                        check (status in ('prepare','closed','waitingCourier','waitingDelivery','delivery')),
  eta_prepare_seconds   integer,
  eta_delivery_seconds  integer,
  sla_prepare_deadline  timestamptz,   -- UNRESOLVED: SLA-1
  sla_delivery_deadline timestamptz,   -- UNRESOLVED: SLA-1
  escalated_to_admin    boolean not null default false,
  created_at            timestamptz not null default now()
);
alter table orders add constraint orders_batch_fk
  foreign key (batch_id) references batches(id) on delete set null;

-- fees: rincian fee per order
create table fees (
  id         bigint generated always as identity primary key,
  order_id   bigint not null references orders(id) on delete cascade,
  kind       text not null check (kind in ('platform_merchant','platform_customer','delivery','service')),
  amount_jod numeric(12,3) not null,
  rule_ref   text,
  created_at timestamptz not null default now()
);

-- taxes: pajak dua lapis (GST makanan + pajak fee platform)
create table taxes (
  id         bigint generated always as identity primary key,
  order_id   bigint not null references orders(id) on delete cascade,
  kind       text not null check (kind in ('gst_food','platform_income')),
  rate_pct   numeric(6,3),             -- UNRESOLVED: TAX-1
  base_jod   numeric(12,3) not null,
  amount_jod numeric(12,3),            -- UNRESOLVED: TAX-1
  created_at timestamptz not null default now()
);

-- payments: jejak pembayaran per order
create table payments (
  id          bigint generated always as identity primary key,
  order_id    bigint not null references orders(id) on delete cascade,
  provider    text not null default 'none' check (provider in ('xendit','none')),
  method      text not null check (method in ('cod','transfer','xendit_va','xendit_qris')),
  amount_jod  numeric(12,3) not null,
  amount_idr  numeric(18,2),
  external_id text,                    -- id transaksi di Xendit
  status      text not null default 'unpaid'
              check (status in ('unpaid','pending','paid','failed','refunded')),
  paid_at     timestamptz,
  created_at  timestamptz not null default now(),
  unique (order_id, provider, external_id)
);

-- wallets
create table wallets (
  id                    bigint generated always as identity primary key,
  user_id               bigint not null unique references users(id) on delete cascade,
  balance_jod           numeric(12,3) not null default 0,
  reserved_balance_jod  numeric(12,3) not null default 0,
  updated_at            timestamptz not null default now(),
  check (balance_jod >= 0),
  check (reserved_balance_jod >= 0)
);

-- wallet_holds: reserve saat order dibuat → settle/release saat selesai/batal
create table wallet_holds (
  id         bigint generated always as identity primary key,
  wallet_id  bigint not null references wallets(id) on delete cascade,
  order_id   bigint not null references orders(id) on delete cascade,
  amount_jod numeric(12,3) not null,
  status     text not null default 'none'
             check (status in ('none','reserved','settled','released')),  -- tahap `cut` DIHAPUS
  expires_at timestamptz,              -- UNRESOLVED: RSV-1
  created_at timestamptz not null default now(),
  settled_at timestamptz,
  unique (order_id)
);

-- wallet_ledgers: APPEND-ONLY, double-entry
create table wallet_ledgers (
  id         bigint generated always as identity primary key,
  user_id    bigint not null references users(id) on delete restrict,
  type       text not null check (type in ('cr','db')),
  reference  text not null
             check (reference in ('topUp','order','delivery','withdrawal','refund','hold','release')),
  amount_jod numeric(12,3) not null,
  order_id   bigint references orders(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on wallet_ledgers (user_id, created_at desc);

-- topups
create table topups (
  id               bigint generated always as identity primary key,
  wallet_id        bigint not null references wallets(id) on delete cascade,
  amount_jod       numeric(12,3) not null check (amount_jod > 0),
  amount_idr       numeric(18,2),
  rate_id          bigint,             -- FK ke exchange_rates
  method           text not null check (method in ('xendit_va','xendit_qris','transfer')),
  status           text not null default 'pending'
                   check (status in ('pending','paid','expired','failed')),
  instructions     jsonb,
  external_id      text,
  expires_at       timestamptz,        -- UNRESOLVED: WEB-1
  created_at       timestamptz not null default now()
);

-- cashouts
create table cashouts (
  id          bigint generated always as identity primary key,
  wallet_id   bigint not null references wallets(id) on delete cascade,
  amount_jod  numeric(12,3) not null check (amount_jod > 0),
  fee_jod     numeric(12,3),           -- UNRESOLVED: CO-1
  status      text not null default 'requested'
              check (status in ('requested','processing','paid','rejected')),
  destination text,
  created_at  timestamptz not null default now()
);

-- deposits: deposit COD + kredit founding
create table deposits (
  id          bigint generated always as identity primary key,
  merchant_id bigint not null references merchants(id) on delete cascade,
  kind        text not null check (kind in ('cod','founding_credit')),
  amount_jod  numeric(12,3) not null,  -- UNRESOLVED: FEE-1
  status      text not null default 'unpaid' check (status in ('unpaid','held','released')),
  verified_by bigint references users(id) on delete set null,
  verified_at timestamptz,
  created_at  timestamptz not null default now()
);

-- merchant_credits: modal + cashback. NON-WITHDRAWAL.
create table merchant_credits (
  id                 bigint generated always as identity primary key,
  merchant_id        bigint not null unique references merchants(id) on delete cascade,
  balance_jod        numeric(12,3) not null default 0,
  rebate_tier        text,             -- UNRESOLVED: INC-1
  rebate_period      text,
  rebate_amount_jod  numeric(12,3),
  rebate_paid_at     timestamptz,
  non_withdrawable   boolean not null default true,
  updated_at         timestamptz not null default now()
);

-- cashback_tiers
create table cashback_tiers (
  id             bigint generated always as identity primary key,
  tier           text not null unique,
  min_volume_jod numeric(12,3) not null,
  pct            numeric(6,3) not null
);

-- disputes: sengketa + resolusi + banding
create table disputes (
  id                bigint generated always as identity primary key,
  order_id          bigint not null references orders(id) on delete restrict,
  opened_by         bigint not null references users(id) on delete restrict,
  type              text not null
                    check (type in ('late','missing','wrong','not_delivered','payment_failed')),
  status            text not null default 'open'
                    check (status in ('open','investigating','resolved','rejected')),
  resolution        text check (resolution in
                    ('refund_customer','refund_order','resettle','no_action')),
  refund_amount_jod numeric(12,3),
  resolved_by       bigint references users(id) on delete set null,
  resolved_at       timestamptz,
  window_closes_at  timestamptz,       -- UNRESOLVED: DSP-1 (24 jam, sementara)
  created_at        timestamptz not null default now()
);

-- dispute_appeals: banding atas putusan level-1 (diputus Super Admin)
create table dispute_appeals (
  id            bigint generated always as identity primary key,
  dispute_id    bigint not null references disputes(id) on delete cascade,
  filed_by      bigint not null references users(id) on delete restrict,
  reason        text,
  status        text not null default 'open' check (status in ('open','decided','rejected')),
  decided_by    bigint references users(id) on delete set null,
  decided_at    timestamptz,
  window_closes_at timestamptz,      -- UNRESOLVED: APL-1 (siapa boleh mengajukan, window/SLA)
  created_at    timestamptz not null default now()
);

-- protection_fund
create table protection_fund (
  id         bigint generated always as identity primary key,
  order_id   bigint references orders(id) on delete set null,
  dispute_id bigint references disputes(id) on delete set null,
  amount_jod numeric(12,3) not null,
  direction  text not null check (direction in ('in','out')),
  created_at timestamptz not null default now()
);

-- exchange_rates: JOD (display) ↔ IDR (settlement)
create table exchange_rates (
  id         bigint generated always as identity primary key,
  base       text not null check (base in ('JOD','USD')),
  quote      text not null check (quote in ('IDR')),
  rate       numeric(18,6) not null,
  source     text,                     -- UNRESOLVED: FX-1
  fetched_at timestamptz not null default now(),
  unique (base, quote, fetched_at)
);
alter table topups add constraint topups_rate_fk
  foreign key (rate_id) references exchange_rates(id) on delete set null;

-- ########## 0003_ops_platform.sql ##########
-- (sumber: supabase/migrations/0003_ops_platform.sql, 159 baris)

-- ============================================================
--  Sa7tein — Fase 3 (M4) — ops & platform
--  Sumber kanonik: docs/backend/ERD.md §5. Bergantung pada: 0001 + 0002.
--  DDL ini di-generate dari ERD.md supaya dokumen & migrasi tidak drift.
--  JANGAN edit file ini langsung — ubah ERD.md lalu jalankan
--  `npm run db:migrations:sync`.
-- ============================================================

-- chats / chat_messages: satu thread per order, maks 3 peserta
create table chats (
  id           bigint generated always as identity primary key,
  order_id     bigint not null unique references orders(id) on delete cascade,
  last_message text,
  last_at      timestamptz,
  created_at   timestamptz not null default now()
);

create table chat_participants (
  chat_id bigint not null references chats(id) on delete cascade,
  user_id bigint not null references users(id) on delete cascade,
  role    text not null,               -- peran saat bergabung (jejak, bukan otorisasi)
  joined_at timestamptz not null default now(),
  primary key (chat_id, user_id)
);

create table chat_messages (
  id         bigint generated always as identity primary key,
  chat_id    bigint not null references chats(id) on delete cascade,
  sender_id  bigint not null references users(id) on delete restrict,
  channel    text not null
             check (channel in ('customer-merchant','merchant-courier','courier-customer')),
  body       text not null,
  at         timestamptz not null default now(),
  read_at    timestamptz
);
create index on chat_messages (chat_id, at);

-- checkpoints: 4 titik verifikasi pengiriman
create table checkpoints (
  id         bigint generated always as identity primary key,
  order_id   bigint not null references orders(id) on delete cascade,
  kind       text not null check (kind in ('at_store','picked_up','arrived','otp_verified')),
  latitude   double precision,
  longitude  double precision,
  proof_photo text,
  note       text,
  at         timestamptz not null default now()
);

-- rating_reviews: merchant XOR menu
create table rating_reviews (
  id          bigint generated always as identity primary key,
  order_id    bigint not null references orders(id) on delete cascade,
  customer_id bigint not null references customers(id) on delete cascade,
  merchant_id bigint references merchants(id) on delete cascade,
  menu_id     bigint references menus(id) on delete cascade,
  rating      integer not null check (rating between 1 and 5),
  review      text,
  window_closes_at timestamptz,        -- UNRESOLVED: RATE-1 (jendela pengisian)
  edited_at   timestamptz,             -- UNRESOLVED: RATE-1 (boleh diedit?)
  deleted_at  timestamptz,             -- UNRESOLVED: RATE-1 (hapus/moderasi)
  created_at  timestamptz not null default now(),
  check ((merchant_id is not null) <> (menu_id is not null)),  -- tepat satu
  unique (order_id, customer_id, merchant_id, menu_id)
);

create table review_replies (
  id          bigint generated always as identity primary key,
  review_id   bigint not null references rating_reviews(id) on delete cascade,
  merchant_id bigint not null references merchants(id) on delete cascade,
  body        text not null,
  created_at  timestamptz not null default now()
);

-- marketing: promo (scope MVP belum diputuskan)
create table marketing (
  id          bigint generated always as identity primary key,
  type        text not null check (type in ('promo_delivery','discount_pct','discount_fixed')),
  value       numeric(12,3) not null,  -- UNRESOLVED: MKT-1
  code        text unique,             -- null = auto apply
  active_from timestamptz not null,
  active_to   timestamptz not null,
  max_uses    integer,
  used_count  integer not null default 0,
  created_at  timestamptz not null default now()
);
alter table orders add constraint orders_promo_fk
  foreign key (promo_id) references marketing(id) on delete set null;

-- push_subscriptions
create table push_subscriptions (
  id          bigint generated always as identity primary key,
  user_id     bigint not null references users(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  created_at  timestamptz not null default now(),
  last_used_at timestamptz
);

-- roles / operators: operator dibuat SA, tidak ada self-registration
create table roles (
  id   bigint generated always as identity primary key,
  key  text not null unique check (key in ('cs_ops','sa_ops','sa_owner')),
  name text not null,
  permissions jsonb not null default '[]'::jsonb
);

create table operators (
  id         bigint generated always as identity primary key,
  user_id    bigint not null unique references users(id) on delete cascade,
  role_id    bigint not null references roles(id) on delete restrict,
  active     boolean not null default true,
  created_by bigint references users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- audit_logs: pelaku = id, bukan nama
create table audit_logs (
  id         bigint generated always as identity primary key,
  actor_id   bigint references users(id) on delete set null,
  actor_role text,
  action     text not null,
  target     text,                     -- UNRESOLVED: AUD-1 (taksonomi)
  target_id  bigint,
  at         timestamptz not null default now()
);
create index on audit_logs (actor_id, at desc);

-- tax_reports / platform_profit / platform_switches
create table tax_reports (
  id              bigint generated always as identity primary key,
  period          text not null,        -- '2026-10'
  platform_fee_jod numeric(12,3) not null default 0,
  gst_jod         numeric(12,3),        -- UNRESOLVED: TAX-1
  other_tax_jod   numeric(12,3),        -- UNRESOLVED: TAX-1
  total_tax_jod   numeric(12,3),        -- UNRESOLVED: TAX-1
  export_url      text,                 -- UNRESOLVED: TAX-2
  created_at      timestamptz not null default now(),
  unique (period)
);

create table platform_profit (
  id            bigint generated always as identity primary key,
  period        text not null,
  gross_jod     numeric(12,3) not null default 0,
  cost_jod      numeric(12,3) not null default 0,
  net_jod       numeric(12,3) not null default 0,
  withdrawn_jod numeric(12,3) not null default 0,
  updated_at    timestamptz not null default now(),
  unique (period)
);

create table platform_switches (
  key        text primary key check (key in ('cod_enabled','payout_enabled','maintenance_mode')),
  enabled    boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by bigint references users(id) on delete set null
);

-- ########## 0004_indexes_rls_realtime.sql ##########
-- (sumber: supabase/migrations/0004_indexes_rls_realtime.sql, 315 baris)

-- ============================================================
--  Sa7tein — 0004: M5 — helper, index, RLS, realtime
--
--  Bergantung pada: 0001 + 0002 + 0003.
--  RLS memakai Supabase Auth: `users.auth_user_id` menjembatani auth.uid()
--  ke id internal kita. Untuk uji lokal, `auth.uid()` disediakan stub
--  (lihat scripts/verify-migrations.sh).
-- ============================================================

-- ------------------------------------------------------------
--  Helper: siapa saya, dan apa peran saya
-- ------------------------------------------------------------
create or replace function public.app_uid() returns bigint
language sql stable security definer set search_path = public as $$
  select u.id from public.users u where u.auth_user_id = auth.uid()
$$;
comment on function public.app_uid() is
  'Id internal (users.id) dari sesi Supabase Auth yang aktif. null bila belum terhubung.';

create or replace function public.app_role() returns text
language sql stable security definer set search_path = public as $$
  select u.role from public.users u where u.auth_user_id = auth.uid()
$$;
comment on function public.app_role() is 'Peran sesi aktif; null bila belum terhubung.';

create or replace function public.app_is_ops() returns boolean
language sql stable as $$
  select coalesce(public.app_role() in ('cs','superadmin'), false)
$$;
comment on function public.app_is_ops() is 'true untuk CS & Super Admin (pengawas lintas tenant).';

-- ------------------------------------------------------------
--  Index untuk query panas
--  (M5 hanya ini + unique/check yang sudah ada di 0001–0003)
-- ------------------------------------------------------------
create index if not exists menus_merchant_idx            on public.menus (merchant_id, available);
create index if not exists menu_variants_menu_idx        on public.menu_variants (menu_id);
create index if not exists couriers_merchant_idx         on public.couriers (merchant_id, availability);
create index if not exists addresses_user_idx            on public.addresses (user_id, is_default);
create index if not exists orders_merchant_status_idx    on public.orders (merchant_id, status, created_at desc);
create index if not exists orders_customer_idx           on public.orders (customer_id, created_at desc);
create index if not exists orders_courier_idx            on public.orders (courier_id, status);
create index if not exists orders_placed_idx             on public.orders (placed_at desc) where placed_at is not null;
create index if not exists order_items_order_idx         on public.order_items (order_id);
create index if not exists wallet_ledgers_user_idx       on public.wallet_ledgers (user_id, created_at desc);
create index if not exists wallet_holds_wallet_idx       on public.wallet_holds (wallet_id, status);
create index if not exists chat_messages_chat_idx        on public.chat_messages (chat_id, at);
create index if not exists checkpoints_order_idx         on public.checkpoints (order_id, at);
create index if not exists disputes_status_idx           on public.disputes (status, created_at desc);
create index if not exists rating_reviews_merchant_idx   on public.rating_reviews (merchant_id, created_at desc);
create index if not exists audit_logs_actor_idx          on public.audit_logs (actor_id, at desc);
create index if not exists payments_order_idx            on public.payments (order_id, status);
create index if not exists batches_merchant_status_idx   on public.batches (merchant_id, status);
-- batas 3 kurir per merchant ditegakkan di API, tetapi index ini membuat pengecekannya murah
create index if not exists couriers_merchant_count_idx   on public.couriers (merchant_id);

-- ------------------------------------------------------------
--  RLS
--  Prinsip: default TOLAK. Yang tidak punya policy = tidak bisa diakses.
--  Anon hanya boleh membaca katalog yang memang publik (merchant approved, menu).
-- ------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'users','phone_verifications','customers','addresses','zones','merchants','couriers',
    'fav_merchants','menus','menu_variants',
    'orders','order_items','batches','fees','taxes','payments','wallets','wallet_holds',
    'wallet_ledgers','topups','cashouts','deposits','merchant_credits','cashback_tiers',
    'disputes','dispute_appeals','protection_fund','exchange_rates',
    'chats','chat_participants','chat_messages','checkpoints','rating_reviews','review_replies',
    'marketing','push_subscriptions','roles','operators','audit_logs','tax_reports',
    'platform_profit','platform_switches'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- users: diri sendiri; ops boleh semua
create policy users_self_read on public.users for select
  using (auth_user_id = auth.uid() or public.app_is_ops());
create policy users_self_update on public.users for update
  using (auth_user_id = auth.uid()) with check (auth_user_id = auth.uid());
create policy users_insert_self on public.users for insert
  with check (auth_user_id = auth.uid());

-- customers: diri sendiri; merchant perlu membaca nama customer pada ordernya
create policy customers_self on public.customers for all
  using (user_id = public.app_uid() or public.app_is_ops())
  with check (user_id = public.app_uid() or public.app_is_ops());

-- addresses: hanya pemilik; merchant/kurir membaca lewat order (lihat policy orders)
create policy addresses_owner on public.addresses for all
  using (user_id = public.app_uid() or public.app_is_ops())
  with check (user_id = public.app_uid() or public.app_is_ops());

-- zones: publik baca (dipakai gate coverage); tulis hanya Super Admin
create policy zones_read on public.zones for select using (true);
create policy zones_sa_write on public.zones for all
  using (public.app_role() = 'superadmin') with check (public.app_role() = 'superadmin');

-- merchants: katalog publik (hanya yang approved); pemilik boleh melihat & mengubah miliknya; ops semua
create policy merchants_public_read on public.merchants for select
  using (tenant_status = 'approved' or user_id = public.app_uid() or public.app_is_ops());
create policy merchants_owner_write on public.merchants for update
  using (user_id = public.app_uid() or public.app_is_ops())
  with check (user_id = public.app_uid() or public.app_is_ops());
create policy merchants_insert_self on public.merchants for insert
  with check (user_id = public.app_uid());

-- menus & varian: publik baca; tulis oleh merchant pemilik
create policy menus_public_read on public.menus for select using (true);
create policy menus_owner_write on public.menus for all
  using (exists (select 1 from public.merchants m
                 where m.id = menus.merchant_id and m.user_id = public.app_uid())
         or public.app_is_ops())
  with check (exists (select 1 from public.merchants m
                      where m.id = menus.merchant_id and m.user_id = public.app_uid())
              or public.app_is_ops());
create policy menu_variants_public_read on public.menu_variants for select using (true);
create policy menu_variants_owner_write on public.menu_variants for all
  using (exists (select 1 from public.menus mn join public.merchants m on m.id = mn.merchant_id
                 where mn.id = menu_variants.menu_id and m.user_id = public.app_uid())
         or public.app_is_ops())
  with check (exists (select 1 from public.menus mn join public.merchants m on m.id = mn.merchant_id
                      where mn.id = menu_variants.menu_id and m.user_id = public.app_uid())
              or public.app_is_ops());

-- couriers: hanya merchant pemilik & dirinya sendiri & ops
create policy couriers_read on public.couriers for select
  using (user_id = public.app_uid()
         or exists (select 1 from public.merchants m
                    where m.id = couriers.merchant_id and m.user_id = public.app_uid())
         or public.app_is_ops());
create policy couriers_self_update on public.couriers for update
  using (user_id = public.app_uid()
         or exists (select 1 from public.merchants m
                    where m.id = couriers.merchant_id and m.user_id = public.app_uid())
         or public.app_is_ops())
  with check (true);

-- fav_merchants
create policy fav_owner on public.fav_merchants for all
  using (user_id = public.app_uid()) with check (user_id = public.app_uid());

-- orders: pihak yang terlibat saja
create policy orders_parties on public.orders for select
  using (
    public.app_is_ops()
    or customer_id in (select id from public.customers where user_id = public.app_uid())
    or merchant_id in (select id from public.merchants where user_id = public.app_uid())
    or courier_id in (select id from public.couriers where user_id = public.app_uid())
  );
create policy orders_customer_insert on public.orders for insert
  with check (customer_id in (select id from public.customers where user_id = public.app_uid()));
create policy orders_parties_update on public.orders for update
  using (
    public.app_is_ops()
    or customer_id in (select id from public.customers where user_id = public.app_uid())
    or merchant_id in (select id from public.merchants where user_id = public.app_uid())
    or courier_id in (select id from public.couriers where user_id = public.app_uid())
  )
  with check (true);

-- order_items / fees / taxes / payments / checkpoints: ikut keterlihatan order-nya
do $$
declare t text;
begin
  foreach t in array array['order_items','fees','taxes','payments','checkpoints'] loop
    execute format($f$
      create policy %1$s_via_order on public.%1$I for all
        using (exists (select 1 from public.orders o where o.id = %1$I.order_id))
        with check (exists (select 1 from public.orders o where o.id = %1$I.order_id))
    $f$, t);
  end loop;
end $$;

-- wallet & uang: hanya pemilik; ops boleh membaca (monitoring), bukan menulis
create policy wallets_owner on public.wallets for all
  using (user_id = public.app_uid() or public.app_role() = 'superadmin')
  with check (user_id = public.app_uid() or public.app_is_ops());
create policy wallet_holds_owner on public.wallet_holds for all
  using (wallet_id in (select id from public.wallets where user_id = public.app_uid())
         or public.app_is_ops())
  with check (true);
-- ledger append-only: baca milik sendiri, tulis hanya lewat jalur sistem (service role)
create policy wallet_ledgers_read on public.wallet_ledgers for select
  using (user_id = public.app_uid() or public.app_is_ops());
create policy topups_owner on public.topups for all
  using (wallet_id in (select id from public.wallets where user_id = public.app_uid())
         or public.app_is_ops())
  with check (true);
create policy cashouts_owner on public.cashouts for all
  using (wallet_id in (select id from public.wallets where user_id = public.app_uid())
         or public.app_is_ops())
  with check (true);

-- deposits / merchant_credits / cashback_tiers: merchant pemilik + ops
create policy deposits_scope on public.deposits for select
  using (merchant_id in (select id from public.merchants where user_id = public.app_uid())
         or public.app_is_ops());
create policy deposits_ops_write on public.deposits for all
  using (public.app_is_ops()) with check (public.app_is_ops());
create policy merchant_credits_scope on public.merchant_credits for select
  using (merchant_id in (select id from public.merchants where user_id = public.app_uid())
         or public.app_is_ops());
create policy cashback_tiers_read on public.cashback_tiers for select using (true);

-- disputes: pihak order + ops
create policy disputes_scope on public.disputes for select
  using (public.app_is_ops()
         or order_id in (
              select o.id from public.orders o
              where o.customer_id in (select id from public.customers where user_id = public.app_uid())
                 or o.merchant_id in (select id from public.merchants where user_id = public.app_uid())
                 or o.courier_id  in (select id from public.couriers  where user_id = public.app_uid())
            ));
create policy disputes_open on public.disputes for insert
  with check (opened_by = public.app_uid());
create policy disputes_ops_resolve on public.disputes for update
  using (public.app_is_ops()) with check (public.app_is_ops());
create policy dispute_appeals_sa on public.dispute_appeals for all
  using (public.app_role() = 'superadmin' or filed_by = public.app_uid())
  with check (filed_by = public.app_uid() or public.app_role() = 'superadmin');
create policy protection_fund_ops on public.protection_fund for select using (public.app_is_ops());

-- exchange_rates: publik baca (dipakai konversi tampilan)
create policy exchange_rates_read on public.exchange_rates for select using (true);

-- chat: peserta thread
create policy chats_participants on public.chats for select
  using (public.app_is_ops()
         or exists (select 1 from public.chat_participants cp
                    where cp.chat_id = chats.id and cp.user_id = public.app_uid()));
create policy chat_participants_read on public.chat_participants for select
  using (public.app_is_ops() or user_id = public.app_uid()
         or chat_id in (select chat_id from public.chat_participants where user_id = public.app_uid()));
create policy chat_messages_participants on public.chat_messages for select
  using (public.app_is_ops()
         or exists (select 1 from public.chat_participants cp
                    where cp.chat_id = chat_messages.chat_id and cp.user_id = public.app_uid()));
create policy chat_messages_send on public.chat_messages for insert
  with check (sender_id = public.app_uid()
              and exists (select 1 from public.chat_participants cp
                          where cp.chat_id = chat_messages.chat_id and cp.user_id = public.app_uid()));

-- ulasan: publik baca; tulis oleh customer yang ordernya
create policy rating_reviews_public_read on public.rating_reviews for select using (true);
create policy rating_reviews_owner_write on public.rating_reviews for insert
  with check (customer_id in (select id from public.customers where user_id = public.app_uid()));
create policy review_replies_public_read on public.review_replies for select using (true);
create policy review_replies_merchant_write on public.review_replies for insert
  with check (merchant_id in (select id from public.merchants where user_id = public.app_uid()));

-- marketing: publik baca promo aktif; tulis ops
create policy marketing_read on public.marketing for select using (true);
create policy marketing_ops_write on public.marketing for all
  using (public.app_is_ops()) with check (public.app_is_ops());

-- push_subscriptions: milik sendiri
create policy push_owner on public.push_subscriptions for all
  using (user_id = public.app_uid()) with check (user_id = public.app_uid());

-- platform: roles/operators/audit/tax/profit/switches → Super Admin (ops boleh baca audit & profit)
create policy roles_sa on public.roles for all
  using (public.app_role() = 'superadmin') with check (public.app_role() = 'superadmin');
create policy operators_sa on public.operators for all
  using (public.app_role() = 'superadmin') with check (public.app_role() = 'superadmin');
create policy audit_ops_read on public.audit_logs for select using (public.app_is_ops());
create policy audit_insert_ops on public.audit_logs for insert with check (public.app_is_ops());
create policy tax_reports_sa on public.tax_reports for all
  using (public.app_role() = 'superadmin') with check (public.app_role() = 'superadmin');
create policy platform_profit_sa on public.platform_profit for all
  using (public.app_role() = 'superadmin') with check (public.app_role() = 'superadmin');
create policy platform_switches_read on public.platform_switches for select using (true);
create policy platform_switches_sa on public.platform_switches for all
  using (public.app_role() = 'superadmin') with check (public.app_role() = 'superadmin');

-- ------------------------------------------------------------
--  Realtime — hanya tabel yang memang perlu didorong ke klien.
--  (Bukan semua tabel: publikasi berlebihan = beban & data bocor.)
-- ------------------------------------------------------------
do $$
declare t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  foreach t in array array[
    'orders',            -- status & penugasan kurir
    'couriers',          -- lokasi + ketersediaan
    'merchants',         -- buka/tutup + status tenant
    'chats','chat_messages',
    'wallets','wallet_holds','wallet_ledgers',  -- reserve → settle
    'disputes','batches','menus'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- `replica identity full` supaya UPDATE/DELETE membawa nilai lama
-- (dibutuhkan untuk reserve→settle & perubahan status).
do $$
declare t text;
begin
  foreach t in array array['orders','couriers','merchants','wallets','wallet_holds','batches','disputes'] loop
    execute format('alter table public.%I replica identity full', t);
  end loop;
end $$;

-- ########## 0005_seed_irbid.sql ##########
-- (sumber: supabase/migrations/0005_seed_irbid.sql, 153 baris)

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

-- ########## 0006_append_only_guards.sql ##########
-- (sumber: supabase/migrations/0006_append_only_guards.sql, 45 baris)

-- ============================================================
--  Sa7tein — 0006: penjaga append-only
--
--  DITEMUKAN OLEH E2E (scripts/e2e-irbid.sh, S8): tanpa trigger ini,
--  UPDATE dan DELETE pada `wallet_ledgers` BERHASIL. ERD mengklaim tabel ini
--  append-only, tetapi RLS saja tidak menegakkannya — RLS hanya membatasi
--  peran non-owner; pemilik tabel & service role tetap bisa mengubah.
--  Trigger di bawah menutup celah itu untuk semua peran.
--
--  Bergantung pada: 0004.
-- ============================================================

create or replace function public.forbid_mutation() returns trigger
language plpgsql as $$
begin
  if tg_op = 'TRUNCATE' then
    raise exception 'Tabel % bersifat append-only: TRUNCATE tidak diizinkan', tg_table_name
      using errcode = 'restrict_violation';
  end if;
  raise exception 'Tabel % bersifat append-only: % tidak diizinkan (baris id %)',
    tg_table_name, tg_op, coalesce(old.id::text, '?')
    using errcode = 'restrict_violation';
end $$;

comment on function public.forbid_mutation() is
  'Penjaga append-only: menolak UPDATE/DELETE/TRUNCATE pada tabel jejak (ledger, audit).';

do $$
declare t text;
begin
  -- wallet_ledgers: mutasi uang tidak boleh diubah setelah tercatat (double-entry append-only)
  -- audit_logs:     jejak aksi operator tidak boleh diubah atau dihapus
  foreach t in array array['wallet_ledgers', 'audit_logs'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_append_only_row', t);
    execute format('drop trigger if exists %I on public.%I', t || '_append_only_trunc', t);
    execute format(
      'create trigger %I before update or delete on public.%I
         for each row execute function public.forbid_mutation()',
      t || '_append_only_row', t);
    execute format(
      'create trigger %I before truncate on public.%I
         for each statement execute function public.forbid_mutation()',
      t || '_append_only_trunc', t);
  end loop;
end $$;

-- ########## SELESAI ##########
