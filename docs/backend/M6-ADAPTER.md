# M6 — Adapter Backend Skema Baru (ERD Irbid)

Status: **skema baru sekarang jadi jalur DEFAULT dan sudah LIVE di produksi.** Cloud Supabase
dimigrasikan 2026-10-09 (42/42 tabel, skema lama dibuang setelah backup) dan 4 portal dideploy
memakai skema baru. Portal lama sengaja diputus (keputusan pemilik produk: "putus saja gapaap, agar
bisa diconsume ke ui baru") — lihat §1.

| | |
|---|---|
| Berkas | `packages/shared/src/lib/backend/irbidBackend.js` (942 baris, 33 metode) |
| Default | **skema baru** (`VITE_SCHEMA` kosong → `irbidBackend`) |
| Jalan pulang | `VITE_SCHEMA=legacy` → adapter skema lama (`supabaseBackend.js`) |
| Target skema | 42 tabel hasil migrasi `supabase/migrations/0000`–`0006` |

Dokumen pendamping: `ERD.md` (skema) · `openapi.yaml` (kontrak API) · `MIGRATION-RUNBOOK.md`
(cara pindah environment) · `MILESTONES.md` (urutan kerja).

---

## 1. Kenapa default-nya dibalik

Sebelumnya adapter skema baru hanya aktif lewat `VITE_SCHEMA=irbid` supaya 4 portal produksi
(`sa7tein-{customer,merchant,courier,cs}.vercel.app`) yang masih membaca skema lama tidak mati.
Pemilik produk memutuskan sebaliknya: **skema baru yang diprioritaskan**, portal lama boleh putus.

Konsekuensi yang diterima (dan sudah diperhitungkan):

- 4 portal lama **tidak lagi cocok** dengan bentuk data yang dikembalikan adapter: mereka membaca
  nama field skema lama (`subtotal`, `courierCost`, `restaurantId`, `price`, `status` berbahasa
  lama) dan memformat Rupiah. Gejala paling terlihat: harga tampil sebagai `Rp NaN`.
- Build keempatnya **tetap sukses** (tidak ada error kompilasi) — jadi ini kegagalan runtime yang
  disengaja, bukan build rusak.
- `VITE_SCHEMA=legacy` tetap disediakan sebagai jalan pulang, bukan lagi syarat memakai skema baru.

```js
const TARGET_SCHEMA = import.meta.env.VITE_SCHEMA === 'legacy' ? 'legacy' : 'irbid';

export function getBackend() {
  if (!isSupabaseConfigured) return localBackend;          // mode demo lokal
  return TARGET_SCHEMA === 'legacy' ? supabaseBackend : irbidBackend;
}
```

> Bentuk `import.meta.env.VITE_SCHEMA` ditulis **tanpa optional chaining**. Versi pertama saya
> memakai `import.meta.env?.VITE_SCHEMA`, dan itu membuat Vite tidak menyubstitusi nilainya jadi
> literal — Rollup lalu tidak bisa membuang adapter yang tidak dipakai (kedua adapter ikut
> terkirim ke bundle).

## 2. Bukti saklar bekerja (bukan asumsi)

Env Supabase dummy dipakai supaya jalur Supabase benar-benar aktif, `dist/` dibersihkan dulu, lalu
bundle diperiksa lewat penanda khas tiap adapter (`order_messages` hanya di adapter lama,
`phone_verifications` hanya di adapter baru):

| Build | Bundle | `phone_verifications` (baru) | `order_messages` (lama) |
|---|---|---|---|
| default (tanpa `VITE_SCHEMA`) | **668 KB** | **4** | 0 |
| `VITE_SCHEMA=legacy` | **660 KB** | 0 | **4** |

Jadi adapter yang tidak dipakai benar-benar dibuang dari bundle — bukan sekadar tidak dipanggil.

## 3. Permukaan API

| | jumlah |
|---|---|
| Metode di adapter skema baru | 33 |
| Metode yang dipanggil `apps/*/src` | 19 (semuanya ada) |
| Metode tambahan (superset) | 3: `getOrder`, `ensureChat`, `onCouriersChange` |

`fetchProfile` hanya dipakai internal `supabaseBackend.js` (bukan bagian kontrak yang dipanggil UI)
dan fungsinya digantikan `loadUserRow()`.

## 4. Mapping metode → tabel

Dihasilkan otomatis dari kode agar tidak ada tabel yang salah sebut. Baris kosong = metode memakai
helper/realtime (catatan di bawah tabel).

| Metode | Tabel |
|---|---|
| `register` | `users`, `customers`, `merchants` |
| `login`, `logout`, `getCurrentUser` | via `loadUserRow()` → `users` |
| `sendVerificationCode`, `verifyCode` | `phone_verifications` |
| `updateProfile` | `users`, `customers`, `merchants`, `couriers` |
| `getMerchants`, `updateMerchant`, `getStoreStatus` | `merchants` |
| `setStoreStatus` | `merchants`, `orders` |
| `getMenu`, `saveMenu`, `updateStock` | `menus` |
| `getCouriers`, `updateCourier`, `updateCourierLocation` | `couriers` (+ embed `users`) |
| `createOrder` | `menus`, `orders`, `order_items`, `addresses` |
| `getOrder`, `getOrders`, `claimOrder` | `orders` |
| `updateOrderStatus` | `orders`, `order_items` |
| `ensureChat` | `chats`, `chat_participants`, `users` |
| `getMessages` | `chats`, `chat_messages` |
| `sendMessage` | `chat_messages`, `chats` |
| `resetDemo` | 32 tabel (daftar eksplisit, urut anak → induk) |
| `on*Change` (7 metode) | realtime, tanpa `.from()` |

- Helper menambah tabel di luar tabel pemanggilnya: `loadUserRow()` → `users`; `ensureWallet()`
  → `wallets`; `resolveDeliveryAddress()` → `addresses`; `ensureSeed()` → `merchants`, `users`,
  `menus`, `couriers`.
- Kanal realtime (`postgres_changes`): `merchants`, `menus`, `couriers`, `orders`, `chat_messages`.
- Baca bersarang (embed PostgREST): `order_items`, `merchants`, `couriers`, `customers`,
  `addresses`, `menu_variants`, `users` (sebagai `sender` dan untuk `couriers.phone`).

### Cakupan tabel

42 tabel ada di DDL; adapter menyebut **32** sebagai sasaran query. Sisa 10 tidak pernah jadi sasaran
query; `menu_variants` tetap dibaca lewat embed, 9 benar-benar belum dipakai: `cashback_tiers`,
`exchange_rates`, `marketing`, `operators`, `platform_profit`, `platform_switches`, `roles`,
`tax_reports`, `zones`.

Catatan: `zone_code` yang dikembalikan adapter adalah **kolom `orders`**, bukan query ke tabel
`zones`. Jadi `zones` memang belum dipakai aplikasi (belum ada gerbang zona).

## 5. Bentuk data: satu nama per konsep

Adapter mengembalikan **camelCase dari kolom ERD**, tanpa alias warisan. Sebelumnya ada nama kembar
(`subtotal` + `subTotalJod`, `courierCost` + `deliveryFeeJod`, status lama + `statusNew`) karena 4
portal lama belum dimigrasikan — alasan itu sudah tidak ada.

Padanan utama:

| Kolom ERD | Kunci yang dikembalikan |
|---|---|
| `orders.sub_total_jod` | `subTotalJod` |
| `orders.delivery_fee_jod` | `deliveryFeeJod` |
| `orders.total_jod` / `total_idr` | `totalJod` / `totalIdr` |
| `orders.delivery_address_id` + embed `addresses` | `deliveryAddressId`, `deliveryAddress`, `deliveryLat`, `deliveryLng` |
| `orders.merchant_id` + embed `merchants` | `merchantId`, `merchantName`, `merchantLat`, … |
| `orders.zone_code` / `zone_id` | `zoneCode` / `zoneId` |
| `orders.payment_method` | `paymentMethod` |
| `orders.hold_status` | `holdStatus` |
| `menus.price_jod` | `priceJod` |
| `couriers.availability` | `availability` |
| `users.phone` (embed dari `couriers`) | `phone` |

**Masukan** tetap longgar di dua tempat saja, dan itu disengaja: status (`toNewStatus`, lihat §6) dan
pembayaran (`wallet` → `xendit_qris`, karena `wallet` bukan nilai yang diizinkan check constraint).
Selain itu masukan memakai nama kanonik (`menuId`, `merchantId`, `deliveryFeeJod`, …).

## 6. Status pesanan — ⚠️ UNRESOLVED OST-1

Yang **dikembalikan** adapter selalu status skema baru (8 nilai). Yang **diterima** masih boleh
status skema lama, karena kosakata status baru tidak bisa membedakan semuanya:

| Lama (diterima) | Baru (dikeluarkan) | Catatan |
|---|---|---|
| `pending` | `quotation` | |
| `accepted` | `prepare` | ⚠️ menyusut |
| `preparing` | `prepare` | ⚠️ menyusut |
| `ready` | `waitingCourier` | |
| `picked_up` | `waitingDelivery` | |
| `on_the_way` | `delivery` | |
| `delivered` | `done` | |
| `rejected` / `cancelled` | `canceled` | |

Konsekuensi: order yang pernah `accepted` akan terbaca `prepare` saat dimuat ulang — informasi
aslinya hilang. Ini **butuh keputusan PO** (`ERD.md` §8, OST-1).

## 7. Verifikasi (semua bisa dijalankan ulang)

```bash
npm run build              # 4 portal, hasil: 4 build sukses
npm run db:audit-backend   # tabel/kolom/relasi/insert adapter vs skema NYATA
npm run db:verify          # migrasi + constraint + append-only + RLS
npm run db:e2e             # alur bisnis end-to-end (26 pemeriksaan)
npm run api:audit          # kontrak OpenAPI vs sumber 1:1
```

Hasil terakhir: semuanya LULUS.

`db:audit-backend` membangun Postgres sementara dari `supabase/migrations/0000`–`0006`, membaca
`information_schema`, lalu memeriksa:

1. setiap `.from('tabel')` ada;
2. setiap kolom di `.select(...)`, filter, dan `order` ada (termasuk embed bertingkat);
3. setiap relasi bersarang punya FK yang cocok (dua arah);
4. kunci objek `.insert/.update/.upsert` ada sebagai kolom — **termasuk** objek yang ditampung
   variabel (`const row = {...}`) atau dibangun `.map((x) => ({...}))`;
5. `.insert`/`.upsert` mengisi semua kolom **NOT NULL tanpa default**, dan nilainya tidak boleh
   `null` atau `... ?? null`;
6. daftar tabel `resetDemo()` ada.

Hasil: 42 tabel; FK 63 baris / 60 pasangan unik; **32 tabel dirujuk, 195 kolom diperiksa,
17 relasi bersarang, 29 objek insert/update (0 insert dilewati) — 0 rujukan tidak dikenal.**

## 8. Bug nyata yang ditemukan & ditutup (semua lewat pemeriksaan, bukan dugaan)

| # | Bug | Akibat kalau dibiarkan |
|---|---|---|
| 1 | `createOrder` mengirim `delivery_address_id: null` padahal kolomnya NOT NULL | **setiap pembuatan order gagal**; diperbaiki: pakai `deliveryAddressId` → alamat default customer → bikin dari koordinat → kalau kosong, gagal dengan pesan jelas |
| 2 | `menus.photo` **tidak ada** di skema (hanya `image`) | `saveMenu` + `ensureSeed` gagal (PGRST204) |
| 3 | `chat_participants.role` NOT NULL tapi upsert hanya mengisi `chat_id`/`user_id` | pembuatan chat gagal; sekarang peran dibaca dari `users` (bukan ditebak) |
| 4 | `chat_messages.sender_id: me?.id ?? null` | kirim pesan tanpa sesi → pelanggaran NOT NULL; sekarang gagal dengan pesan jelas |
| 5 | Harga bisa datang dari klien (`i.price`) kalau menu tidak ketemu | **harga bisa dipalsukan pemanggil**; sekarang snapshot wajib dari `menus`, kalau tidak ada → order dibatalkan |
| 6 | `couriers.phone` di-hardcode `''` | data tidak ada padahal nomornya nyata di `users.phone`; sekarang di-embed |
| 7 | `merchants.store_phone` tidak punya jalur tulis | kolom wajib PRD (E.164) tidak pernah terisi; sekarang `updateMerchant` menerimanya |
| 8 | `resetDemo()` melempar error di tengah loop | demo tertinggal **setengah terhapus** (chat hilang, order masih ada); sekarang ada preflight yang gagal sebelum menghapus apa pun |
| 9 | `wallet_ledgers` tidak append-only | ditemukan E2E S8, ditutup migrasi `0006` |

### Auditor-nya sendiri sempat salah (dan itu diperbaiki + diuji)

`menus.photo` **lolos** dari audit pertama karena pemeriksa kunci objek hanya melihat bentuk
`.insert({...})` langsung — sedangkan `saveMenu` memakai `.map((x) => ({...}))` dan `createOrder`
memakai `const row = {...}`. Empat bug di auditor yang ditemukan & ditutup:

1. objek lewat variabel/`.map()` tidak diperiksa (penyebab `menus.photo` lolos);
2. `const NAME =` diambil dari kemunculan **pertama di seluruh berkas**, bukan yang terdekat
   sebelum pemanggilan → kolom tabel lain ikut dilaporkan;
3. objek perantara di dalam badan blok (`=> { const modifiers = xs.map((x) => ({...})) ... }`) ikut
   dianggap baris insert;
4. komentar `// ...` setelah koma membuat bagian berikutnya terbuang → kunci seperti `qty` hilang.

Agar tidak sekadar "lulus", auditor **diuji mutasi**: dua bug yang sudah diperbaiki disuntikkan
kembali ke salinan sementara (`AUDIT_TARGET=/tmp/mutN.js`), dan keduanya **dilaporkan tepat**:

```
✗ menus.photo (di .insert) tidak ada
✗ orders.delivery_address_id WAJIB diisi tapi nilainya bisa null: order.deliveryAddressId ?? null
```

## 9. Batas yang disengaja / belum selesai

1. **Reserve/hold belum dibuat saat order.** `createOrder` menulis `hold_status: 'none'` dan tidak
   membuat baris `wallet_holds`/`wallet_ledgers`, karena customer demo belum punya saldo dan UI
   wallet belum ada. Jadi model uang "reserve saat order → settle saat `done`" (ERD) belum berjalan
   di adapter, walau migrasi + E2E sudah membuktikan mekanismenya bisa.
2. **Gerbang zona belum ada.** `zones` belum dipakai; `orders.zone_code` diisi apa adanya.
3. **Tidak ada timestamp per-status.** Tabel `orders` hanya punya `created_at`, `placed_at`,
   `paid_at`, jadi `statusTimestamps` (dipakai timeline/ETA UI lama) tidak diisi. Kalau UI butuh,
   ini perlu kolom baru (keputusan produk).
4. **Mode demo lokal masih skema lama.** `localBackend.js` (dipakai bila Supabase kosong) tetap
   berbentuk skema lama. Jadi jalur "tanpa Supabase" tidak setara dengan default baru.
5. **UI 4 portal lama belum menyesuaikan** (inilah wujud "putus" yang disetujui). Terukur:
   **~143 rujukan skema lama di 15 berkas** — `formatRupiah` 44×, literal status lama (64×:
   `'pending'` 12, `'delivered'` 14, `'ready'` 11, `'on_the_way'` 10, `'picked_up'` 7,
   `'preparing'` 5, `'accepted'` 5), nama field lama ~35× (`subtotal`, `courierCost`,
   `restaurantName`, `restaurantId`, `.emoji`). Gejala yang terlihat di portal live:
   toko selalu tampil **🔴 Closed** karena `Home.jsx:49` membaca `merchant.open`
   (`merchantStatus[m.id] ?? m.open`) yang sudah diganti `available`.

## 10. Yang menghalangi konsumsi oleh UI baru (butuh keputusan produk)

UI baru (`/Users/muhammadbaihaqy/Downloads/za7tein-pwa`) **belum punya lapisan API sama sekali** —
itu keputusan sadar repo tersebut (`AGENTS.md`: *"Jangan merasa ada yang kurang lalu mulai membuat
lapisan API: ketiadaan integrasi itu keputusan sadar"*). Jadi yang perlu disiapkan bukan sekadar
adapter, tetapi **tiga ketidakcocokan kontrak** berikut. Semuanya keputusan produk, bukan sesuatu
yang boleh ditebak di adapter:

| # | Hal | ERD / backend sekarang | UI baru (kode aktual) |
|---|---|---|---|
| 1 | **Mata uang** | nilai uang disimpan **JOD** (`_jod numeric(12,3)`), IDR untuk settlement | **IDR = sumber kebenaran**, JOD hanya tampilan (`R-CURR-01`, kurs mock 1 JOD = Rp23.000, JOD 2 desimal) — `src/data/currency.ts` |
| 2 | **Status pesanan** | kosakata Inggris: `cart/quotation/prepare/waitingCourier/waitingDelivery/delivery/done/canceled` | kosakata Indonesia: `masuk/diterima/dimasak/diantar/tiba/selesai/ditolak/batal` — `MerchantOrderStatus`, `src/types.ts` |
| 3 | **Format id** | `bigint identity` (1, 2, 3, …) | string ber-prefix: `sa-…`/`cus-1`/`am-1`/`mm-1`/`mo-1`/`cr-1` |

Catatan tambahan: UI baru memakai `holdStatus` = `none/held/cut/settled/released` (model lama),
sedangkan keputusan PO 2026-09-25 (yang dipakai ERD) menghapus tahap `cut` →
`none/reserved/settled/released`. **ERD mengikuti keputusan terbaru; UI baru masih memakai model
lama.** Perlu diselaraskan sebelum integrasi.

Sampai tiga hal di atas diputuskan, integrasi UI baru tidak bisa "tinggal sambung".

## 11. Langkah berikutnya

1. Putuskan §10 (mata uang, kosakata status, format id) — ini menentukan apakah ERD/`openapi.yaml`
   perlu diubah atau UI baru yang menyesuaikan.
2. Lengkapi jalur uang di adapter: top-up + reserve saat checkout + settle saat `done`
   (`wallet_holds` + `wallet_ledgers` sudah ada dan sudah terbukti di E2E).
3. Gerbang zona saat checkout.
4. Kalau portal lama masih dibutuhkan sebagai demo: jalankan dengan `VITE_SCHEMA=legacy`, atau
   migrasikan layarnya ke bentuk baru.
