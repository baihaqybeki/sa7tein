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
