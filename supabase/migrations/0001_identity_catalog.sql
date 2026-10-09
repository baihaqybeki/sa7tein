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
