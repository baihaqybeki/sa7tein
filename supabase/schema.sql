-- ============================================================
--  Sa7tein — Skema Supabase
--  Jalankan di SQL Editor (Supabase) sebelum mengisi .env
-- ============================================================

-- Restoran terdaftar
create table if not exists public.merchants (
  id text primary key,
  name text not null,
  address text,
  lat double precision,
  lng double precision,
  emoji text,
  category text,
  photo text,
  open boolean not null default true,
  created_at timestamptz not null default now()
);

-- Item menu & stok (milik sebuah restoran)
create table if not exists public.menu_items (
  id text primary key,
  merchant_id text references public.merchants(id) on delete cascade,
  name text not null,
  description text,
  price integer not null default 0,
  category text not null default 'Main Dishes',
  stock integer not null default 0,
  image text,
  photo text,
  available boolean not null default true,
  created_at timestamptz not null default now()
);

-- Pesanan (objek order lengkap tersimpan di kolom jsonb `data`)
create table if not exists public.orders (
  id text primary key,
  code text,
  status text not null default 'pending',
  merchant_id text references public.merchants(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Kurir
create table if not exists public.couriers (
  id text primary key,
  name text not null,
  phone text,
  vehicle text,
  status text default 'idle',
  lat double precision,
  lng double precision,
  photo text
);

-- Status online kurir: penawaran delivery hanya untuk kurir yang sedang online
-- (online=true + heartbeat last_seen_at masih segar). Idempotent — aman diulang.
alter table public.couriers add column if not exists online boolean not null default false;
alter table public.couriers add column if not exists last_seen_at bigint;

-- Profil akun (terhubung ke pengguna Supabase Auth)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  name text,
  phone text,
  address text,
  role text not null default 'customer',
  merchant_id text references public.merchants(id) on delete set null,
  courier_id text references public.couriers(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Pengaturan toko (status buka/tutup per restoran, dll.)
create table if not exists public.settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb
);

-- Pesan chat order (dikelompokkan per order berdasarkan channel:
--   'customer-merchant' | 'merchant-courier' | 'courier-customer')
create table if not exists public.order_messages (
  id uuid primary key default gen_random_uuid(),
  order_id text references public.orders(id) on delete cascade,
  channel text not null,
  sender_id text,
  sender_name text,
  sender_role text,
  text text not null,
  created_at timestamptz not null default now()
);

-- Realtime: aktifkan publish untuk tabel (idempotent — aman dijalankan ulang)
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'merchants') then
    alter publication supabase_realtime add table public.merchants;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'couriers') then
    alter publication supabase_realtime add table public.couriers;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'menu_items') then
    alter publication supabase_realtime add table public.menu_items;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'orders') then
    alter publication supabase_realtime add table public.orders;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'settings') then
    alter publication supabase_realtime add table public.settings;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'order_messages') then
    alter publication supabase_realtime add table public.order_messages;
  end if;
end $$;

-- ============================================================
--  RLS (sederhana untuk MVP): izinkan semua operasi anon.
--  Untuk produksi, ganti dengan policy berbasis auth.
-- ============================================================
alter table public.merchants enable row level security;
alter table public.menu_items enable row level security;
alter table public.orders enable row level security;
alter table public.couriers enable row level security;
alter table public.profiles enable row level security;
alter table public.settings enable row level security;
alter table public.order_messages enable row level security;

drop policy if exists "public read merchants" on public.merchants;
drop policy if exists "public write merchants" on public.merchants;
create policy "public read merchants" on public.merchants for select using (true);
create policy "public write merchants" on public.merchants for all using (true) with check (true);

drop policy if exists "public read menu" on public.menu_items;
drop policy if exists "public write menu" on public.menu_items;
create policy "public read menu" on public.menu_items for select using (true);
create policy "public write menu" on public.menu_items for all using (true) with check (true);

drop policy if exists "public read orders" on public.orders;
drop policy if exists "public write orders" on public.orders;
create policy "public read orders" on public.orders for select using (true);
create policy "public write orders" on public.orders for all using (true) with check (true);

drop policy if exists "public read couriers" on public.couriers;
drop policy if exists "public write couriers" on public.couriers;
create policy "public read couriers" on public.couriers for select using (true);
create policy "public write couriers" on public.couriers for all using (true) with check (true);

drop policy if exists "public read profiles" on public.profiles;
drop policy if exists "public write profiles" on public.profiles;
create policy "public read profiles" on public.profiles for select using (true);
create policy "public write profiles" on public.profiles for all using (true) with check (true);

drop policy if exists "public read settings" on public.settings;
drop policy if exists "public write settings" on public.settings;
create policy "public read settings" on public.settings for select using (true);
create policy "public write settings" on public.settings for all using (true) with check (true);

drop policy if exists "public read order_messages" on public.order_messages;
drop policy if exists "public write order_messages" on public.order_messages;
create policy "public read order_messages" on public.order_messages for select using (true);
create policy "public write order_messages" on public.order_messages for all using (true) with check (true);
