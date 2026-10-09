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
