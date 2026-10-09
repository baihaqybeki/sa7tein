# Runbook Migrasi — skema lama → ERD Irbid

Untuk: siapa pun yang akan menjalankan migrasi di Supabase yang sesungguhnya.
Baca sampai habis sebelum menekan Enter.

## ⚠️ Baca dulu

1. **Migrasi ini DESTRUKTIF.** `0000_drop_legacy.sql` membuang 7 tabel lama **beserta seluruh isinya**
   (`merchants`, `menu_items`, `orders` + `data` jsonb, `couriers`, `profiles`, `settings`,
   `order_messages`). Tidak ada jalur "undo" data — hanya restore dari backup.
2. **4 portal yang live akan berhenti bekerja.** `sa7tein-{customer,merchant,courier,cs}.vercel.app`
   membaca skema lama. Setelah migrasi ini, mereka gagal sampai adapter diperbarui (**M6**).
   Lihat §5 untuk urutan yang aman.
3. **Jangan mengisi nilai `UNRESOLVED`.** 20 item di `docs/backend/ERD.md` §8 belum diputuskan PO.
   Kolomnya sengaja dibiarkan `null`/default. Mengisinya dengan tebakan = melanggar aturan main.

## 1. Prasyarat

- [ ] Akses SQL Editor di project Supabase (`dwzxtnfesmpobnepilhl.supabase.co`)
- [ ] **Backup diambil dan sudah diuji restore-nya** (bukan sekadar "sudah pernah backup"):
      - Supabase Dashboard → Database → Backups (atau `pg_dump`)
      - Simpan juga isi 7 tabel lama sebagai CSV bila perlu jejak
- [ ] **Backup lewat REST sudah ada** (kalau belum): isi 7 tabel lama diekspor baca-saja ke
      `supabase/backup-legacy-<tanggal>/` memakai `SUPABASE_SERVICE_ROLE_KEY`. Folder ini
      **di-gitignore** karena berisi data pribadi. Ini jaring pengaman, **bukan** pengganti
      backup dashboard (tidak menyertakan auth users).
- [ ] Cabang kerja bukan `main` (lihat §5)
- [ ] `npm run db:verify` **lulus di lokal** sebelum menyentuh cloud

## 2. Verifikasi lokal dulu (wajib, 30 detik)

```bash
npm run db:migrations:sync     # pastikan migrasi = ERD.md (tidak drift)
npm run db:migrations:bundle   # pastikan supabase/apply-all.sql sinkron dengan 0000-0006
npm run db:verify              # cluster sementara → jalankan 0000..0006 → uji constraint & RLS
npm run db:e2e                 # alur bisnis: reserve→settle, batal→release, race claim, append-only
```

Harus berakhir `LULUS — migrasi berjalan, constraint & RLS berlaku, seed benar` dan
`E2E LULUS — 26 pemeriksaan`. Kalau tidak lulus, **berhenti** — jangan lanjut ke cloud.

## 3. Langkah di Supabase

### Jalur cepat (disarankan): satu berkas

`supabase/apply-all.sql` = migrasi `0000`–`0006` berurutan dalam satu berkas, **di-generate** oleh
`npm run db:migrations:bundle` (ada mode `--check`, jadi tidak bisa basi). Sudah diuji: berkas ini
berjalan bersih di Postgres lokal → 42 tabel, RLS 42/42, 59 policy, seed `users=4`.

1. `npm run db:migrations:bundle` → buka `supabase/apply-all.sql`
2. Salin SELURUH isinya → SQL Editor → **Run sekali**
3. Verifikasi dari terminal: `npm run db:remote-check` → harus `HASIL: SIAP`

Bagian `0005` di dalam berkas itu berisi data demo (4 user, 1 merchant, 4 menu, 3 wallet). Kalau
tidak mau, hapus blok `-- ########## 0005_seed_irbid.sql ##########` sebelum Run.

### Jalur hati-hati: satu per satu

Jalankan **satu per satu**, bukan ditempel semua sekaligus, supaya kegagalan mudah dilokalisasi.

| # | File | Yang terjadi | Cek setelah selesai |
|---|---|---|---|
| 1 | `supabase/migrations/0000_drop_legacy.sql` | 7 tabel lama dibuang | `select count(*) from information_schema.tables where table_schema='public'` → **0** |
| 2 | `0001_identity_catalog.sql` | 10 tabel identitas & katalog | tabel bertambah 10 |
| 3 | `0002_order_money.sql` | 18 tabel order & uang | total **28** |
| 4 | `0003_ops_platform.sql` | 14 tabel ops & platform | total **42** |
| 5 | `0004_indexes_rls_realtime.sql` | helper, index, RLS, realtime | `select count(*) from pg_policies where schemaname='public'` → **59** |
| 6 | `0005_seed_irbid.sql` | data demo JOD | `select count(*) from public.users` → **4** |
| 7 | `0006_append_only_guards.sql` | trigger penjaga append-only | `select count(*) from pg_trigger where tgrelid='public.wallet_ledgers'::regclass and not tgisinternal` → **2** |

Catatan penting untuk langkah 5:
- `0001` membuat `users.auth_user_id references auth.users(id)`. Di Supabase, schema `auth` sudah ada
  — **jangan** membuat stub seperti di uji lokal.
- Kalau langkah 5 gagal pada `create publication`, berarti `supabase_realtime` belum ada; migrasi
  sudah menanganinya lewat `create publication` bila belum ada.

## 4. Verifikasi setelah migrasi

```sql
-- jumlah tabel harus 42
select count(*) from information_schema.tables
where table_schema='public' and table_type='BASE TABLE';

-- RLS harus aktif di SEMUA tabel
select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='r' and not c.relrowsecurity;   -- harus 0

-- realtime
select tablename from pg_publication_tables
where pubname='supabase_realtime' and schemaname='public';             -- harus 11 baris

-- seed
select role, count(*) from public.users group by role;
```

## 5. Urutan yang aman (portal live)

Status 2026-10-09: **M6 sudah jadi default** — adapter memakai tabel baru tanpa env var apa pun
(`VITE_SCHEMA=legacy` only sebagai jalan pulang). Jadi setelah cloud dimigrasikan, portal hasil
deploy otomatis memakai skema baru. Konsekuensinya: **4 portal lama tidak lagi cocok** dengan
bentuk data yang dikembalikan adapter (portal lama butuh `VITE_SCHEMA=legacy`).

```
branch: feat/irbid-schema
  1. (opsional) migrasi di project Supabase TERPISAH (staging) — produksi tidak disentuh
  2. backup (dashboard + supabase/backup-legacy-*/)                              ← WAJIB
  3. paste supabase/apply-all.sql di SQL Editor project target
  4. npm run db:remote-check  → harus SIAP
  5. deploy 4 portal (npm run deploy:customer|merchant|courier|cs) + api docs
  6. merge ke main setelah semuanya hijau
```

**Jangan** menjalankan migrasi di project produksi tanpa butir 2 selesai.

## 6. Rollback

Tidak ada rollback otomatis. Yang bisa dilakukan:

| Situasi | Tindakan |
|---|---|
| Gagal di `0001`–`0003` | Drop tabel yang sudah dibuat, ulangi dari `0000` (belum ada data berarti) |
| Gagal di `0004` | Perbaiki policy/constraint yang gagal, lalu jalankan ulang file itu (idempotent) |
| Sudah jalan tapi portal rusak | **Kembalikan ke project Supabase lama** (ganti `VITE_SUPABASE_URL`), bukan undo migrasi |
| Data lama hilang & dibutuhkan | Restore backup ke project baru, jangan timpa yang sudah dimigrasi |

## 7. Kalau ada yang harus diubah

| Yang mau diubah | Caranya |
|---|---|
| Struktur tabel / kolom / constraint | Ubah `docs/backend/ERD.md` (§3–§5) lalu `npm run db:migrations:sync` |
| Index / RLS / realtime | Edit `supabase/migrations/0004_indexes_rls_realtime.sql` langsung |
| Data demo | Edit `supabase/migrations/0005_seed_irbid.sql` langsung |

> `0001`–`0003` **di-generate** dari `ERD.md`. Edit file itu langsung akan tertimpa pada `db:migrations:sync`
> berikutnya. `npm run db:verify` akan menolak bila keduanya berbeda (cek `--check`).

## 8. Yang masih menghambat (perlu keputusan PO)

Dua item ini **memblokir migrasi yang bersih** dan belum diputuskan:

1. **Nasib 4 kolom legacy tanpa padanan di draft:** `merchants.emoji`, `merchants.category`,
   `menus.stock`, `menus.category` — dibuang, dipertahankan, atau ditambahkan ke draft?
   Sekarang dibiarkan `null`-able dan ditandai di ERD §8 butir 4.
2. **Nama entitas bentrok:** draft menamai `incidentResolution`, flows menyebut `incident_resolutions`
   **dan** `disputes`. Sementara dipakai `disputes`. Perlu satu nama resmi.

Selama keduanya belum diputuskan, migrasi **bisa dijalankan** tetapi hasilnya belum bisa disebut final.
