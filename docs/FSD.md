# ⚙️ FSD — Functional Specification Document

**Aplikasi:** Sa7tein (Customer · Merchant · Courier)
**Versi Dokumen:** 1.0
**Status:** Final (sesuai implementasi saat ini)
**Terkait:** `docs/SRS.md` · `supabase/schema.sql`

---

## 1. Tujuan & Ruang Lingkup

Dokumen ini merinci **spesifikasi fungsional** Sa7tein: aktor, modul, alur proses, aturan bisnis,
entitas data, dan antarmuka backend — sehingga pengembang baru dapat memahami perilaku sistem dan
mengimplementasikan/mengubah fitur tanpa menebak.

## 2. Aktor & Peran

| Aktor    | Portal       | Kemampuan utama                                                                                  |
| -------- | ------------ | ------------------------------------------------------------------------------------------------ |
| Customer | `/customer/` | Pesan makanan, checkout, lacak, chat, kelola profil & lokasi pengiriman                          |
| Merchant | `/merchant/` | Kelola toko (buka/tutup), pesanan, menu/stok, lokasi, chat, profil                               |
| Courier  | `/courier/`  | Terima tawaran, antar pesanan, chat, kelola profil & foto                                        |
| CS       | `/cs/`       | Monitoring semua pesanan & transaksi, batalkan, tugaskan kurir, selesaikan manual, chat penengah |

## 3. Spesifikasi Modul Fungsional

### 3.1 Modul Otentikasi (AUTH)

- **Input**: email, kata sandi, nama, telepon, peran.
- **Proses**:
  1. `register()` — cek duplikat email → hash password (SHA-256 + salt) → simpan user → (merchant: buat restoran; courier: buat profil kurir) → set sesi.
  2. `login()` — cek akun, cek peran sesuai portal, verifikasi hash, set sesi.
  3. `logout()` / `getCurrentUser()` — bersihkan / pulihkan sesi.
- **Output**: objek user publik `{ id, name, email, phone, role, merchantId, courierId, address }`.
- **Aturan**: akun tidak boleh lintas peran; user merchant tampil dengan nama restoran (satu identitas).

### 3.2 Modul Merchant & Menu (MENU)

- Merchant (AdminDashboard, MenuManager):
  - Ubah foto restoran, edit lokasi (mode edit eksplisit), kelola item menu (CRUD + stok + foto).
- Customer (Home): daftar restoran + jarak + badge status + menu per restoran.
- **Proses**:
  - `saveMenu(merchantId, items)` mengganti item milik merchant tsb.
  - `updateStock(itemId, delta)` menyesuaikan stok; pemesanan men-decrement stok (`decrementStock`).
- **Aturan bisnis**: harga dalam Rupiah (integer); item dengan `stock === 0` tidak bisa ditambah.

### 3.3 Modul Status Toko (STORE)

- **Toggle** di AdminDashboard → `setStoreStatus(merchantId, open)`.
- Status disimpan per merchant (`storeStatus:{id}`), notifikasi `store-status`.
- **Dampak tutup**:
  1. Banner + tombol order nonaktif di customer (Home, Cart, Checkout).
  2. `createOrder` ditolak.
  3. Order `pending` milik merchant otomatis menjadi `cancelled` (reason `store_closed`).
- Customer melihat notifikasi di TrackOrder; timeline menampilkan status batal.

### 3.4 Modul Alur Pesanan (ORDER)

Status & transisi:

```
pending ──accept──▶ accepted ──start──▶ preparing ──done──▶ ready
   │                  │                                        │
   │ reject           └──(rejected)                            │ offer
   ▼                                                            ▼
rejected                                              courier accept → picked_up
(cancelled saat toko tutup / oleh sistem)                              │
                                             on_the_way ◀── start ─────┘
                                                     │
                                                     ▼
                                                 delivered
```

- **Pembuatan** (`CheckoutPage` → `createOrder`): menyimpan snapshot restoran & item, `customerId/UserId/Name/Phone/Address`, koordinat, biaya, `restaurantPhoto`, `courierPhoto` (saat diambil).
- **Transisi merchant**: Accept → set prep time → Preparing → Ready.
- **Transisi courier**: `acceptOffer` → `picked_up`; `startDelivery` → `on_the_way`; `completeDelivery` (manual) → `delivered`.
- **Biaya ongkir**: haversine meter → `max(5000, 5000 + 2500*km)` → round `500`.
- **Notifikasi "hampir tiba"**: saat estimasi sisa waktu pengiriman ≤ 90 detik, customer (TrackOrder) melihat banner "Your order is almost here" — memakai `remainingTimeSec` dari posisi kurir.

### 3.5 Modul Courier & Tawaran (OFFER)

- **Hanya kurir ONLINE** yang dipertimbangkan (`online=true` + `lastSeenAt` segar dalam `ONLINE_WINDOW_MS`, default 2 menit). Kurir yang tidak login / app ditutup (heartbeat stale) dilewati.
- **Dropdown Online/Offline (manual)**: kurir bisa mengubah status kapan pun via dropdown di dashboard — tetap bisa login & melihat halaman saat offline, tetapi tawaran disembunyikan dan tidak diterima. Heartbeat (`apps/courier/src/App.jsx`, tiap 30 detik) hanya berjalan saat Online; saat Offline status tersimpan dipaksa `false`.
- `offerToNearestCourier` saat order `ready`: cari kurir terdekat yang online dari lokasi restoran (exclude `rejectedBy`).
- Order menerima `assignedCourierId/Name`, `offerStatus:'pending'`.
- **Kurir** (CourierDashboard):
  - Offer (status `ready`, assigned ke dirinya, pending): **Accept** → `picked_up` (navigasi ke halaman pengiriman); **Reject** → tawarkan ke berikutnya.
  - `available` (ready, belum ada kurir): "Pick Up & Deliver".
- **Pelacakan GPS** (CourierDelivery): interval 3 detik memprioritaskan **GPS sungguhan** (`getCurrentPosition`, timeout 4 detik); bila gagal fallback `stepToward` menuju koordinat customer. `updateCourierLocation` → notifikasi `courier-location` → peta customer.
- **Penyelesaian MANUAL**: kurir menekan **"Complete Delivery"** untuk menyelesaikan pengantaran — tidak ada auto-complete dari peta/simulasi (menghindari bug peta / kendala waktu).

### 3.6 Modul Chat Per Order (CHAT)

- Satu thread per order, dikelompokkan `channel`: `customer-merchant` | `merchant-courier` | `courier-customer`.
- **Ketersediaan channel** (`chatChannelsFor(order, user)`):
  | Peran | Channel |
  | --- | --- |
  | Customer | `customer-merchant` (selalu); `courier-customer` saat `picked_up`/`on_the_way` |
  | Merchant | `customer-merchant` (selalu); `merchant-courier` saat kurir ditugaskan |
  | Courier | `merchant-courier` saat ditugaskan & aktif; `courier-customer` saat mengantar |
- **Proses**: `sendMessage(orderId, {channel, senderId/Name/Role, text})` → simpan + notifikasi `chat` (kirim daftar pesan lengkap). Komponen `OrderChat` subscribe `onMessagesChange(orderId)` dan menampilkan bubble (pesan sendiri di kanan), badge unread per channel.

### 3.7 Modul Profil & Verifikasi (PROFILE)

- Halaman `/settings` (komponen bersama) → dropdown avatar → **⚙️ Settings** + **🚪 Sign out**.
- Field: Full name / **Restaurant name** (merchant), Email (verifikasi OTP), Phone (verifikasi OTP), Address / **Restaurant address** (merchant) / **Delivery address** (customer, dengan peta).
- **Verifikasi**: `sendVerificationCode(channel)` → kode 6 digit disimpan 10 menit, dikembalikan sebagai `demoCode`; `verifyCode(channel, code)` **tidak mengonsumsi** kode; `updateProfile` mengonsumsi setelah valid.
- **Sinkronisasi merchant**: nama/alamat = nama/alamat restoran (dua arah Settings ↔ dashboard). Kurir: nama akun = nama profil kurir.

### 3.8 Modul Lokasi & Peta (MAP)

- **MapView**: marker restoran/customer/courier, pin `editablePoint` (drag/klik → `onPointChange`), rute.
- **Reverse geocode** & **search** via Nominatim (`geo.js`).
- **AddressAutocomplete**: debounce 400ms, min 3 karakter, dropdown saran.
- **Merchant**: kartu lokasi read-only default → tombol "Edit location" → peta + autocomplete + "Use my location" → simpan `{address, lat, lng}`.
- **Customer**: kartu "Deliver to" (Home), checkout (pin + alamat sinkron), pengaturan (peta).
- **Race guard**: alamat hasil geocode hanya diterapkan bila koordinat tidak berpindah lagi.

### 3.9 Modul Foto (PHOTO)

- `PhotoUploader` → `readFileAsDataUrl` → `downscaleDataUrl` (max 512px JPEG 0.72) → simpan `photo`.
- `isPhoto(value)` membedakan foto (`data:`/`http`) vs emoji.
- `updateMerchant`/`updateCourier`/`saveMenu` menyimpan foto; snapshot order membawa `restaurantPhoto` + item `photo` + `courierPhoto`.

### 3.10 Modul Realtime & Backend (BACKEND)

- **Auto-selection**: `getBackend()` → `supabaseBackend` bila `.env` terisi, selain itu `localBackend`.
- **Local**: data di `localStorage` (prefix `sa7tein:`), notifikasi via `BroadcastChannel` (`sa7tein-sync`); `subscribe(fn)` menerima `{type, payload}`.
- **Supabase**: Auth + Postgres + Realtime (`postgres_changes`).
- **Notifikasi utama**: `menu`, `orders`, `merchants`, `couriers`, `store-status`, `courier-location`, `chat`.

### 3.11 Modul Customer Service / Monitoring (CS)

- Portal ke-4 `/cs/` (role `cs`, akun demo `cs@sa7tein.app`, password `demo1234`).
- **Dashboard**: KPI (aktif, menunggu kurir, dalam pengiriman, selesai, pendapatan, batal/tolak); tab filter (Aktif / Perlu perhatian / Selesai / Batal-Tolak); daftar **semua order lintas merchant** dengan StatusBadge, item, biaya, dan chat.
- **Aksi CS**:
  - Batalkan → `updateOrderStatus(id, 'cancelled', { cancelledReason: 'cs_cancelled' })` (stok dikembalikan otomatis).
  - Force assign → `updateOrderStatus(id, 'ready', { assignedCourierId/Name, offerStatus: 'pending', offerSentAt })` ke kurir pilihan — **hanya kurir ONLINE** (`online=true` + heartbeat segar dalam `ONLINE_WINDOW_MS`) yang muncul di dropdown dan bisa ditugaskan.
  - Re-offer → `rejectOffer(...)` — teruskan ke kurir terbaik berikutnya bila yang sekarang tidak merespons.
  - Selesai manual → `updateOrderStatus(id, 'delivered', { remainingMeters: 0 })`.
  - Chat → komponen `OrderChat` dengan **semua channel** (CS sebagai penengah).
- **Transaksi** (`/transactions`): ringkasan dana (pendapatan, total nilai, jumlah transaksi, COD/Non-COD/Refund), rincian per merchant, dan tabel transaksi (metode + status bayar simulasi). Dilengkapi **filter tanggal (from–to), filter status order, dan pencarian** (kode/customer/merchant/metode); ringkasan & rincian merchant mengikuti hasil filter, plus tombol "Clear filters".
- **Catatan**: status pembayaran masih **simulasi** hingga payment gateway diintegrasikan.

---

## 4. Aturan Bisnis (ringkasan)

| Kode  | Aturan                                                                                                              |
| ----- | ------------------------------------------------------------------------------------------------------------------- |
| BR-01 | Ongkir = `max(5000, 5000 + 2500×km)`, dibulatkan ke `Rp500` (walking speed 1.35 m/s).                               |
| BR-02 | Order `pending` dibatalkan otomatis bila toko ditutup; order berjalan tetap lanjut.                                 |
| BR-03 | Stok menu = min 0; berkurang saat order dibuat, bertambah saat batal/tolak.                                         |
| BR-04 | Email harus unik; perubahan email/telepon wajib OTP terverifikasi.                                                  |
| BR-05 | Nama/alamat merchant = nama/alamat restoran (satu identitas, dua arah).                                             |
| BR-06 | Offer kurir hanya untuk kurir terdekat yang tersedia; penolakan → kurir berikutnya.                                 |
| BR-07 | Chat channel mengikuti peran & tahap pengiriman; hanya peserta order.                                               |
| BR-08 | Kode verifikasi berlaku 10 menit dan dikonsumsi hanya saat simpan berhasil.                                         |
| BR-09 | Lokasi restoran di dashboard read-only default (cegah mis-klik).                                                    |
| BR-10 | Seed data di-refresh saat versi seed berubah; akun demo yang hilang digabung; `merchantId`/`courierId` di-backfill. |

---

## 5. Entitas Data (Data Dictionary)

### 5.1 User / Profil

| Field             | Tipe    | Keterangan                            |
| ----------------- | ------- | ------------------------------------- |
| id                | string  | id unik (local `u-…` / Supabase UUID) |
| name              | string  | Nama (merchant = nama restoran)       |
| email             | string  | Login, unik                           |
| phone             | string  | Telepon                               |
| role              | enum    | `customer` \| `merchant` \| `courier` |
| merchantId        | string? | Kunci ke `merchants`                  |
| courierId         | string? | Kunci ke `couriers`                   |
| address           | string  | Alamat (merchant = alamat restoran)   |
| salt/passwordHash | string  | (hanya lokal, tidak diekspos)         |

### 5.2 Merchant (Restoran)

`id, name, address, lat, lng, emoji, category, photo, open`

### 5.3 MenuItem

`id, merchantId, name, description, price, category, stock, image(emoji), photo, available`

### 5.4 Order

`id, code(GE-xxx), status, statusTimestamps, customerId, customerUserId, customerName/Phone/Address/Lat/Lng, restaurantId/Name/Photo/Lat/Lng, items[{itemId,name,image,photo,price,qty,note}], subtotal, courierCost, total, distanceMeters, travelTimeSeconds, payment, orderNote, prepTimeMinutes, assignedCourierId/Name, offerStatus, rejectedBy, courierId/Name/Photo/Lat/Lng, remainingMeters, cancelledReason`

### 5.5 Courier

`id, name, phone, vehicle, status, lat, lng, photo, online, lastSeenAt`

- `online` (boolean) — menandakan kurir sedang aktif; hanya kurir online yang menerima penawaran.
- `lastSeenAt` (number, ms) — heartbeat terakhir; kurir dianggap offline bila `now - lastSeenAt > ONLINE_WINDOW_MS` (2 menit).

### 5.6 Message (chat)

`id, orderId, channel, senderId, senderName, senderRole, text, createdAt`

### 5.7 Settings (Supabase)

`key (store_status:{id}), value (jsonb)`

---

## 6. Antarmuka Backend (method)

Disusun identik untuk `localBackend` dan `supabaseBackend`.

| Kategori | Method                                                                                                                  |
| -------- | ----------------------------------------------------------------------------------------------------------------------- |
| Auth     | `register`, `login`, `logout`, `getCurrentUser`                                                                         |
| Profil   | `sendVerificationCode`, `verifyCode`, `updateProfile`                                                                   |
| Merchant | `getMerchants`, `updateMerchant`, `onMerchantsChange`                                                                   |
| Store    | `getStoreStatus`, `setStoreStatus`, `onStoreStatusChange`                                                               |
| Menu     | `getMenu`, `saveMenu`, `updateStock`, `onMenuChange`                                                                    |
| Order    | `createOrder`, `getOrders`, `updateOrderStatus`, `onOrdersChange`                                                       |
| Courier  | `getCouriers`, `updateCourier`, `updateCourierLocation`, `onCourierLocation`, `onCouriersChange`, `claimOrder` (atomic) |
| Chat     | `getMessages`, `sendMessage`, `onMessagesChange`                                                                        |
| Utilitas | `resetDemo`                                                                                                             |

> Helper alur: `packages/shared/src/lib/orders.js` → `offerToNearestCourier`, `acceptOffer` (memakai `claimOrder` atomik — anti double-claim), `rejectOffer`.

---

## 7. Konfigurasi & Lingkungan

| Konfigurasi        | Lokasi                         | Keterangan                                                                   |
| ------------------ | ------------------------------ | ---------------------------------------------------------------------------- |
| `base` web         | `apps/*/vite.config.js`        | `/customer/`, `/merchant/`, `/courier/`; mode mobile `SA7TEIN_MOBILE=1` → `/` |
| Output mobile      | —                              | `dist-mobile` (tanpa PWA)                                                    |
| `webDir` Capacitor | `apps/*/capacitor.config.json` | `dist-mobile`                                                                |
| Env Supabase       | `.env` (root)                  | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`                                |
| Skema DB           | `supabase/schema.sql`          | jalankan di SQL Editor Supabase                                              |
| Server demo        | `scripts/serve-demo.mjs`       | `:8080`, satu origin, HTML no-cache                                          |

---

_Gunakan `npm run doctor` untuk memeriksa lingkungan build, dan `npm run handover` untuk panduan
cepat pengembangan & serah terima._
