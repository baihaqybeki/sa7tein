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
