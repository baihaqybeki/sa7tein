# M6 — Adapter Backend Skema Baru (ERD Irbid)

Status: **adapter selesai & terverifikasi statis.** UI 4 portal **belum** dimigrasikan
(keputusan sadar — lihat §8). Dokumen pendamping: `ERD.md` (skema), `openapi.yaml` (kontrak API),
`MIGRATION-RUNBOOK.md` (cara aman pindah environment), `MILESTONES.md` (urutan kerja).

| | |
|---|---|
| Berkas | `packages/shared/src/lib/backend/irbidBackend.js` (904 baris) |
| Saklar | `VITE_SCHEMA=irbid` — dibaca di `packages/shared/src/lib/backend/index.js` |
| Default | **skema lama** (`supabaseBackend.js`). Produksi tidak berubah bila env kosong. |
| Target skema | 42 tabel hasil migrasi `supabase/migrations/0000`–`0006` |

---

## 1. Kenapa pakai saklar, bukan ganti langsung

4 portal produksi (`sa7tein-{customer,merchant,courier,cs}.vercel.app`) masih membaca skema lama
(`profiles`, `restaurants`, `menu_items`, `order_messages`, `settings`) dan satu blob `orders.data`
(jsonb). Mengganti adapter secara langsung akan mematikan keempatnya sebelum UI dimigrasikan.

Karena itu `getBackend()` memilih adapter berdasarkan env:

```js
const TARGET_SCHEMA = import.meta.env.VITE_SCHEMA === 'irbid' ? 'irbid' : 'legacy';

export function getBackend() {
  if (!isSupabaseConfigured) return localBackend;          // mode demo lokal
  return TARGET_SCHEMA === 'irbid' ? irbidBackend : supabaseBackend;
}
export function getBackendMode()   { /* 'supabase' | 'local' */ }
export function getTargetSchema()  { /* 'irbid' | 'legacy' | 'local' */ }
```

Nilai lain/kosong untuk `VITE_SCHEMA` → `legacy`. Tidak ada jalur lain yang bisa mengaktifkan
skema baru, jadi risiko tanpa sengaja menyalakannya di produksi = nol.

> Bentuk `import.meta.env.VITE_SCHEMA` ditulis **tanpa optional chaining**. Versi pertama saya
> memakai `import.meta.env?.VITE_SCHEMA`, dan itu membuat Vite tidak menyubstitusi nilainya jadi
> literal — Rollup lalu tidak bisa membuang adapter yang tidak dipakai (lihat §2).

## 2. Bukti saklar bekerja (bukan asumsi)

Diuji dengan env Supabase dummy supaya jalur Supabase benar-benar aktif, `dist/` dibersihkan dulu,
lalu bundle diperiksa dari penanda khas masing-masing adapter
(`order_messages` hanya ada di adapter lama; `phone_verifications` hanya di adapter baru):

| Build | Bundle `dist/assets` | `phone_verifications` (baru) | `order_messages` (lama) |
|---|---|---|---|
| `npm run build:merchant` | 660 KB | **0** | 4 |
| `VITE_SCHEMA=irbid npm run build:merchant` | 668 KB | 4 | **0** |

Artinya adapter yang tidak terpakai benar-benar dibuang dari bundle:

- **Produksi tidak membesar sama sekali** — bundle legacy tetap 660 KB, tanpa kode adapter baru.
- Adapter skema baru hanya menambah ~8 KB pada build `irbid`.

## 3. Permukaan API

| | jumlah |
|---|---|
| Metode di `supabaseBackend` / `localBackend` (kontrak UI saat ini) | 31 |
| Metode di `irbidBackend` | 33 |
| Metode yang **benar-benar dipanggil** `apps/*/src` | 19 |

- **19/19 metode yang dipanggil UI ada** di `irbidBackend` (dicek dengan mengekstrak
  `getBackend().x()` dan `backend.x()` dari seluruh `apps/*/src`).
- 3 metode **tambahan** (superset, tidak memecahkan apa pun): `getOrder`, `ensureChat`,
  `onCouriersChange`.
- `fetchProfile` **tidak** ada di adapter baru. Metode itu hanya dipakai internal
  `supabaseBackend.js` (bukan bagian kontrak UI), dan fungsinya digantikan `loadUserRow()`.

## 4. Mapping metode → tabel

Dihasilkan otomatis dari kode (bukan ditulis manual) agar tidak ada tabel yang salah sebut.
Kolom kosong = metode memakai helper/realtime, lihat catatan di bawah tabel.

| Metode | Tabel |
|---|---|
| `register` | `users`, `customers`, `merchants` |
| `login`, `logout`, `getCurrentUser` | via `loadUserRow()` → `users` |
| `sendVerificationCode`, `verifyCode` | `phone_verifications` |
| `updateProfile` | `users`, `customers`, `merchants`, `couriers` |
| `getMerchants`, `updateMerchant`, `getStoreStatus` | `merchants` |
| `setStoreStatus` | `merchants`, `orders` |
| `getMenu`, `saveMenu`, `updateStock` | `menus` |
| `getCouriers`, `updateCourier`, `updateCourierLocation` | `couriers` |
| `createOrder` | `menus`, `orders`, `order_items` |
| `getOrder`, `getOrders`, `claimOrder` | `orders` |
| `updateOrderStatus` | `orders`, `order_items` |
| `ensureChat` | `chats`, `chat_participants` |
| `getMessages` | `chats`, `chat_messages` |
| `sendMessage` | `chat_messages`, `chats` |
| `resetDemo` | 32 tabel (daftar eksplisit, urut anak → induk) |
| `onMerchantsChange`, `onStoreStatusChange`, `onMenuChange`, `onCouriersChange`, `onOrdersChange`, `onCourierLocation`, `onMessagesChange` | realtime, tanpa `.from()` — lihat di bawah |

- Helper menambah tabel di luar tabel pemanggilnya: `loadUserRow()` → `users`;
  `ensureWallet()` → `wallets`; `ensureSeed()` → `merchants`, `users`, `menus`, `couriers`.
- Kanal realtime (`postgres_changes`): `merchants`, `menus`, `couriers`, `orders`, `chat_messages`.
- Baca bersarang (embed PostgREST, bukan `.from()`): `order_items`, `merchants`, `couriers`,
  `customers`, `addresses`, `menu_variants`, `users` (sebagai `sender`).

### Cakupan tabel

42 tabel ada di DDL; adapter menyebut **32** sebagai sasaran query. Sisa **10** tidak pernah
disentuh, dan satu di antaranya tetap dibaca lewat embed:

- dibaca via embed, bukan `.from()`: `menu_variants`
- benar-benar belum dipakai: `cashback_tiers`, `exchange_rates`, `marketing`, `operators`,
  `platform_profit`, `platform_switches`, `roles`, `tax_reports`, `zones`

Catatan: `zone_code` yang dikembalikan adapter adalah **kolom `orders`**, bukan query ke tabel
`zones`. Jadi `zones` memang belum dipakai aplikasi (belum ada gerbang zona).

## 5. Mapping nilai

### Status pesanan — ⚠️ UNRESOLVED OST-1

Enum baru (8 nilai) **tidak bisa** membedakan seluruh status lama (9 nilai). Mapping terpaksa
**menyusutkan** dua status lama jadi satu:

| Lama | Baru | Catatan |
|---|---|---|
| `pending` | `quotation` | |
| `accepted` | `prepare` | ⚠️ menyusut |
| `preparing` | `prepare` | ⚠️ menyusut |
| `ready` | `waitingCourier` | |
| `picked_up` | `waitingDelivery` | |
| `on_the_way` | `delivery` | |
| `delivered` | `done` | |
| `rejected` | `canceled` | |
| `cancelled` | `canceled` | |

Konsekuensi: order yang sudah `accepted` lalu dibaca kembali akan tampil sebagai `preparing` di UI
lama, karena informasi aslinya hilang. Ini **butuh keputusan PO** (`docs/backend/ERD.md` §8,
item OST-1): tambahkan nilai status ke-9, atau terima penyusutan ini secara resmi.

### Pembayaran

`wallet` → `xendit_qris`; `cod` → `cod`; `transfer` → `transfer`.

## 6. Bentuk objek: nama lama **dan** baru sekaligus

Adapter mengembalikan kedua penamaan, mis. `subtotal` + `subTotalJod`, `courierCost` +
`zoneCode`, status legacy + `statusNew`. Tujuannya: data layer bisa ditukar lebih dulu tanpa
memecah layar yang belum dimigrasikan. `statusNew` selalu berisi status skema baru yang sebenarnya.

Saat UI dimigrasikan ke JOD/skema baru, field lama dihapus dan `statusNew` di-rename jadi `status`.

## 7. Verifikasi (semua bisa dijalankan ulang)

```bash
npm run build            # 4 portal, hasil: 4 build sukses
npm run db:audit-backend # tabel/kolom/relasi adapter vs skema NYATA
npm run db:verify        # migrasi + constraint + RLS
npm run db:e2e           # alur bisnis end-to-end
npm run api:audit        # kontrak OpenAPI vs sumber 1:1
```

Hasil terakhir: semuanya LULUS.

- `db:audit-backend` — membangun Postgres sementara dari `supabase/migrations/0000`–`0006`,
  membaca `information_schema`, lalu memastikan setiap `.from('tabel')`, setiap kolom di
  `.select(...)`/filter/`insert`/`update`, dan setiap relasi bersarang benar-benar ada.
  **Bukan sekadar "kodenya jalan"** — PostgREST tidak punya type-check, jadi salah nama kolom
  normalnya baru ketahuan saat runtime di depan user.
  Hasil: 42 tabel; FK 63 baris / 60 pasangan unik (1 menunjuk ke luar skema `public`);
  **32 tabel dirujuk, 112 kolom diperiksa, 15 relasi bersarang diperiksa — 0 rujukan tidak dikenal.**
- `db:e2e` — 26 pemeriksaan (naik dari 23; +3 skenario S10, lihat §9).

## 8. Batas yang disengaja (jangan dianggap selesai)

1. **Mata uang.** Nilai uang kini JOD (mis. `price_jod numeric(12,3)`), sedangkan UI masih
   memformat Rupiah lewat `formatRupiah` di `packages/shared/src/lib/geo.js:69`, dipakai **14
   berkas** di keempat portal. Selama pass UI JOD belum dikerjakan, **angka yang tampil salah**
   (5.000 JOD tampil sebagai "Rp 5.000"). Ini pekerjaan M6 lanjutan.
2. **Reserve/hold belum dibuat saat order.** UI wallet belum ada, dan customer demo belum punya
   saldo, jadi `createOrder` tidak membuat baris `wallet_holds`/`wallet_ledgers` untuk menahan
   dana. Alur top-up + reserve menyusul bersama UI wallet.
3. **Gerbang zona belum ada.** `zones` belum dipakai; `orders.zone_code` diisi apa adanya.
4. **UI belum memakai field baru.** `subTotalJod`, `zoneCode`, `holdStatus`, `statusNew` belum
   dirujuk satu pun oleh `apps/*/src` (dicek dengan pencarian). Jadi semua perbaikan tipe data di
   atas belum terpakai di layar.

## 9. Bug yang ditemukan & diperbaiki di milestone ini

**`resetDemo()` tidak pernah berhasil.** Penjaga append-only (migrasi `0006`) menolak `DELETE`
pada `wallet_ledgers` dan `audit_logs` untuk **semua peran** — dan karena FK, menghapus tabel
induknya (`wallets`) ikut terblokir. Loop lama mengeksekusi delete berurutan tanpa pemeriksaan
awal, jadi ia melempar error di tengah jalan dan **meninggalkan demo setengah terhapus** (chat
hilang, order masih ada).

Perbaikan: preflight menghitung `wallet_ledgers` dan `audit_logs` **sebelum** menghapus satu baris
pun. Bila salah satunya berisi data, `resetDemo()` berhenti dengan pesan yang menjelaskan sebabnya
dan menyebut langkah alternatif — tanpa mengubah data apa pun. Bila keduanya kosong, reset berjalan
seperti biasa.

Premis perbaikannya diuji empiris sebagai skenario E2E **S10** (3 pemeriksaan):

- `DELETE` yang cocok 0 baris pada tabel append-only **diizinkan** (trigger row tidak menyala);
- `TRUNCATE` pada `audit_logs` **ditolak**;
- `DELETE` pada ledger yang **berisi** **ditolak** (jadi preflight memang diperlukan).

## 10. Keputusan yang menunggu PO

| # | Hal | Pilihan |
|---|---|---|
| 1 | **OST-1** — status 9 → 8 nilai | tambah nilai ke-9, atau terima penyusutan `accepted`+`preparing`→`prepare` |
| 2 | 4 kolom legacy tanpa padanan di draft: `merchants.emoji`, `merchants.category`, `menus.stock`, `menus.category` | tambahkan ke skema, atau buang fiturnya. Sementara: `emoji` diisi `🍽️`, `category` null, `stock` dibiarkan null (UI masih membacanya) |
| 3 | Nama entitas bentrok: draft `incidentResolution` vs flows `incident_resolutions` **dan** `disputes` | saat ini dipakai `disputes` |
| 4 | Kebijakan reset demo: jejak uang/audit tidak boleh dihapus | biarkan seperti sekarang (butuh DB bersih), atau sediakan jalur maintenance khusus |

## 11. Langkah berikutnya (M6 lanjutan → M8)

1. Pass UI JOD: ganti `formatRupiah` di 14 berkas (atau buat `formatMoney` sadar-mata-uang).
2. Migrasikan layar satu per satu ke field baru, lalu hapus field lama dari mapper.
3. UI wallet (top-up, reserve saat checkout, riwayat ledger).
4. Gerbang zona saat checkout.
5. Setelah 1–4 selesai: staging Supabase → E2E 4 portal → baru produksi
   (`MIGRATION-RUNBOOK.md` §5). **Jangan** menjalankan migrasi ke project Supabase produksi
   sebelum staging lolos.
