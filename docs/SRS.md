# 📄 SRS — Software Requirements Specification

**Aplikasi:** Sa7tein (Platform Food Delivery: Customer, Merchant, Courier)
**Versi Dokumen:** 1.0
**Status:** Final (sesuai implementasi saat ini)
**Teknologi:** React 18 · Vite 5 · Tailwind CSS 3 · Zustand 4 · React Router 6 · Leaflet · Supabase · Capacitor

---

## 1. Pendahuluan

### 1.1 Tujuan

Dokumen ini mendefinisikan kebutuhan perangkat lunak untuk **Sa7tein**, platform pesan-antar makanan
gaya GoFood yang terdiri dari **tiga aplikasi web terpisah** (Customer, Merchant, Courier) yang saling
terhubung secara realtime. Dokumen menjadi acuan bagi pengembang, penguji, dan pihak yang menerima
handover proyek.

### 1.2 Lingkup

Sistem mencakup:

- Portal **Customer**: melihat restoran & menu, keranjang, checkout dengan peta, lacak pesanan, chat, profil.
- Portal **Merchant**: kelola status buka/tutup toko, terima/persiapkan pesanan, kelola menu & stok, lokasi restoran (peta), chat, profil.
- Portal **Courier**: terima tawaran pengiriman, ambil & antar pesanan dengan simulasi lokasi, chat, profil.
- Portal **CS**: monitoring & manajemen transaksi lintas semua merchant (batalkan/tolak, tugaskan ulang kurir, selesaikan manual, chat sebagai penengah).
- **Shared package** (`@sa7tein/shared`): store, backend (local/Supabase), komponen, helper geo.
- **Native mobile**: pembungkusan Android & iOS via Capacitor.
- **Realtime**: sinkronisasi antar portal (BroadcastChannel untuk mode demo lokal; Supabase realtime untuk cloud).

Di luar lingkup: pembayaran gateway sungguhan, notifikasi push native, integrasi SMS/email sungguhan,
sistem rating/ulasan, multi-bahasa, dan akuntansi.

### 1.3 Definisi, Akronim, Singkatan

| Istilah          | Definisi                                                      |
| ---------------- | ------------------------------------------------------------- |
| Portal           | Salah satu dari tiga aplikasi web (customer/merchant/courier) |
| Order            | Pesanan yang dibuat customer dan diproses merchant & courier  |
| Offer            | Tawaran pengiriman ke kurir terdekat saat pesanan siap        |
| Channel chat     | Percakapan per pasangan peran pada sebuah order               |
| Backend lokal    | Mode demo: `localStorage` + `BroadcastChannel`                |
| Backend Supabase | Mode cloud: Supabase Auth + Postgres + Realtime               |
| PWA              | Progressive Web App (installable, offline-ready)              |
| OTP              | One-time password (kode verifikasi email/telepon, demo)       |

### 1.4 Referensi

- `README.md` — panduan menjalankan proyek
- `docs/FSD.md` — Functional Specification Document
- `supabase/schema.sql` — skema basis data cloud
- `packages/shared/src/lib/*` — logika backend, geo, store

---

## 2. Deskripsi Keseluruhan

### 2.1 Perspektif Produk

Sa7tein adalah **monorepo** (npm workspaces) dengan tiga aplikasi SPA yang berdiri sendiri namun berbagi
kode melalui package `@sa7tein/shared`. Setiap aplikasi punya `base` subpath sendiri
(`/customer/`, `/merchant/`, `/courier/`) dan `BrowserRouter basename` yang sama. Ketiga aplikasi
memiliki sistem akun dengan peran (`role`) masing-masing.

```
                ┌────────────────────────────┐
                │  @sa7tein/shared (paket)    │
                │  store · backend · komponen│
                └────────────┬───────────────┘
         ┌───────────────────┼───────────────────┐
         │                   │                   │
 ┌───────▼───────┐   ┌───────▼───────┐   ┌───────▼───────┐
 │  Customer     │   │  Merchant     │   │  Courier      │
 │  /customer/   │   │  /merchant/   │   │  /courier/    │
 │  :5173        │   │  :5174        │   │  :5175        │
 └───────────────┘   └───────────────┘   └───────────────┘
        │                  │                    │
        └──────────┬───────┴───────┬────────────┘
                   ▼               ▼
        localStorage+        Supabase (opsional)
        BroadcastChannel     Auth+Realtime
        (mode demo)
```

### 2.2 Fungsi Produk (ringkas)

- Manajemen akun per peran dengan login/register dan verifikasi email/telepon.
- Manajemen restoran, menu, stok, dan status buka/tutup toko.
- Alur pesanan lengkap: buat → terima → siapkan → siap → diambil → diantar → selesai (dengan simulasi kurir).
- Penugasan kurir terdekat (offer/accept/reject) dan pelacakan posisi kurir realtime di peta.
- Chat per order (customer↔merchant, merchant↔courier, courier↔customer).
- Upload foto (menu, restoran, kurir).
- Pengaturan lokasi berbasis peta (pin drag, geocoding, autocomplete) di merchant & customer.
- Profil pengaturan (nama, email/telepon terverifikasi, alamat) dalam dropdown avatar.
- PWA (installable) dan aplikasi native Android/iOS via Capacitor.

### 2.3 Karakteristik Pengguna

| Kelas Pengguna | Deskripsi                           | Kebutuhan utama                                                                         |
| -------------- | ----------------------------------- | --------------------------------------------------------------------------------------- |
| Customer       | Pemesan makanan                     | Menelusuri menu, checkout, melacak, chat                                                |
| Merchant       | Pemilik restoran                    | Kelola pesanan, menu, stok, lokasi, chat                                                |
| Courier        | Kurir pengantar                     | Terima tawaran, antar pesanan, chat                                                     |
| CS (Support)   | Pengawas operasional                | Monitoring semua pesanan & transaksi, batalkan, tugaskan kurir, selesaikan manual, chat |
| Admin demo     | Menggunakan akun demo yang tersedia | Menjalankan seluruh alur lintas portal                                                  |

### 2.4 Lingkungan Operasi

- **Browser**: Chrome/Edge/Firefox/Safari modern (mobile-first, PWA).
- **Server demo**: `node scripts/serve-demo.mjs` di `http://localhost:8080` (satu origin agar mode lokal tersinkron).
- **Development**: `vite dev` pada port 5173/5174/5175.
- **Cloud**: Supabase (URL + anon key pada `.env` root).
- **Mobile**: Android (SDK 36, JDK 21) dan iOS (Xcode) via Capacitor 8.

### 2.5 Kendala Desain & Implementasi

- Node.js v20+ (teruji v24); **file `.mjs` tidak boleh memakai komentar `#`** (harus `//`).
- Mode lokal hanya sinkron antar tab/aplikasi bila disajikan dari **origin yang sama**.
- App native dalam mode lokal tidak dapat sinkron antar aplikasi/perangkat (butuh Supabase).
- Kode verifikasi demo ditampilkan di layar (bukan SMS/email sungguhan).
- Peta memakai OpenStreetMap/Nominatim gratis (perlu koneksi internet).

### 2.6 Asumsi & Ketergantungan

- Semua akun demo ter-seed otomatis (`customer@/merchant@/merchant2@/merchant3@/courier@/courier2@/courier3@sa7tein.app`, password `demo1234`).
- `ensureUsers()` menggabungkan akun demo yang hilang dan **backfill** `merchantId`/`courierId` akun lama.
- `ensureSeed()` me-refresh data demo saat versi seed berubah.
- Dependensi eksternal: `leaflet`, `react-leaflet`, `zustand`, `@supabase/supabase-js`, `vite-plugin-pwa`, `@capacitor/*`.

---

## 3. Kebutuhan Fungsional (FR)

> Format: `FR-<modul>-<no>`. Prioritas: **Tinggi / Sedang / Rendah**.

### 3.1 Otentikasi & Akun (AUTH)

| ID         | Kebutuhan                                                                                                                   | Prioritas |
| ---------- | --------------------------------------------------------------------------------------------------------------------------- | --------- |
| FR-AUTH-01 | Sistem menyediakan registrasi akun dengan nama, email, telepon, kata sandi, dan peran (customer/merchant/courier).          | Tinggi    |
| FR-AUTH-02 | Sistem memverifikasi keunikan email saat registrasi.                                                                        | Tinggi    |
| FR-AUTH-03 | Sistem menyediakan login dengan email & kata sandi, terbatas per peran (akun merchant tidak bisa login ke portal customer). | Tinggi    |
| FR-AUTH-04 | Kata sandi disimpan ter-hash (SHA-256 + salt) dan tidak pernah diekspos.                                                    | Tinggi    |
| FR-AUTH-05 | Sistem menyimpan sesi dan memulihkannya saat aplikasi dimuat ulang.                                                         | Tinggi    |
| FR-AUTH-06 | Registrasi sebagai merchant otomatis membuat restoran; sebagai kurir otomatis membuat profil kurir.                         | Tinggi    |
| FR-AUTH-07 | Setiap portal menampilkan halaman login/registrasi bersama (AuthPage) sesuai peran.                                         | Sedang    |

### 3.2 Merchant, Menu & Stok (MENU)

| ID         | Kebutuhan                                                                                                                        | Prioritas |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------- | --------- |
| FR-MENU-01 | Sistem menyediakan banyak merchant; setiap merchant punya identitas, alamat, koordinat, kategori, dan foto.                      | Tinggi    |
| FR-MENU-02 | Merchant dapat mengelola menu miliknya (tambah/ubah/hapus item, harga, kategori, stok, ketersediaan).                            | Tinggi    |
| FR-MENU-03 | Stok otomatis berkurang saat pesanan dibuat dan bertambah saat dibatalkan/ditolak.                                               | Tinggi    |
| FR-MENU-04 | Menu dapat memiliki emoji (fallback) dan/atau foto.                                                                              | Sedang    |
| FR-MENU-05 | Customer dapat melihat daftar restoran (dengan jarak & status buka) dan menu per restoran.                                       | Tinggi    |
| FR-MENU-06 | Merchant memiliki **satu identitas** — nama & alamat restoran adalah nama & alamat akun (sinkron antara Settings dan dashboard). | Sedang    |

### 3.3 Status Buka/Tutup Toko (STORE)

| ID          | Kebutuhan                                                                                                | Prioritas |
| ----------- | -------------------------------------------------------------------------------------------------------- | --------- |
| FR-STORE-01 | Merchant dapat membuka/menutup tokonya; status tersinkron realtime ke customer.                          | Tinggi    |
| FR-STORE-02 | Saat toko tutup, customer melihat banner dan **tombol order dinonaktifkan** (menu, keranjang, checkout). | Tinggi    |
| FR-STORE-03 | `createOrder` menolak pesanan bila toko tutup (guard di backend).                                        | Tinggi    |
| FR-STORE-04 | Saat toko ditutup, pesanan berstatus `pending` **otomatis dibatalkan** dengan alasan `store_closed`.     | Tinggi    |
| FR-STORE-05 | Customer yang pesanannya dibatalkan karena toko tutup melihat notifikasi jelas di halaman lacak.         | Tinggi    |

### 3.4 Alur Pesanan (ORDER)

| ID          | Kebutuhan                                                                                                                            | Prioritas |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| FR-ORDER-01 | Customer dapat membuat pesanan (item, alamat, koordinat, catatan, metode pembayaran).                                                | Tinggi    |
| FR-ORDER-02 | Sistem menghitung biaya pengiriman dari jarak (haversine): `Rp5.000 + Rp2.500/km`, min `Rp5.000`, dibulatkan `Rp500`.                | Tinggi    |
| FR-ORDER-03 | Siklus status order: `pending → accepted → preparing → ready → picked_up → on_the_way → delivered`, plus `rejected` dan `cancelled`. | Tinggi    |
| FR-ORDER-04 | Merchant menerima (`accepted`), menetapkan waktu persiapan lalu `preparing`, dan menandai `ready`.                                   | Tinggi    |
| FR-ORDER-05 | Saat `ready`, sistem menawarkan pesanan ke kurir terdekat yang tersedia.                                                             | Tinggi    |
| FR-ORDER-06 | Setiap perubahan status tercatat dengan timestamp.                                                                                   | Sedang    |
| FR-ORDER-07 | Customer melihat ringkasan biaya (subtotal, ongkir, total) dan status/lacakan.                                                       | Tinggi    |
| FR-ORDER-08 | Customer mendapat **notifikasi saat pesanan hampir tiba** (dari estimasi waktu pengiriman, mis. < 90 detik).                         | Tinggi    |

### 3.5 Courier & Pengiriman (COURIER)

| ID            | Kebutuhan                                                                                                                                                                 | Prioritas |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| FR-COURIER-01 | Setiap kurir memiliki **akun sendiri** (tidak ada dropdown persona); akun terhubung ke profil kurir via `courierId`.                                                      | Tinggi    |
| FR-COURIER-02 | Kurir menerima **offer** pesanan siap yang ditugaskan (terdekat); bisa menerima atau menolak.                                                                             | Tinggi    |
| FR-COURIER-03 | Penolakan meneruskan offer ke kurir terdekat berikutnya.                                                                                                                  | Sedang    |
| FR-COURIER-04 | Menerima offer memindahkan order ke `picked_up` dan menyimpan info kurir (nama, foto).                                                                                    | Tinggi    |
| FR-COURIER-05 | Posisi kurir diperbarui realtime memakai **GPS sungguhan** (fallback simulasi berjalan bila GPS tidak tersedia).                                                          | Tinggi    |
| FR-COURIER-06 | **Penyelesaian delivery dilakukan MANUAL oleh kurir** (tombol Complete Delivery) — tidak bergantung auto-detect peta/simulasi.                                            | Tinggi    |
| FR-COURIER-07 | Customer melihat posisi kurir, jarak tersisa, dan ETA di peta.                                                                                                            | Tinggi    |
| FR-COURIER-08 | Penawaran delivery **hanya dikirim ke kurir yang sedang online** (login + heartbeat aktif); kurir yang offline/stale tidak menerima tawaran.                              | Tinggi    |
| FR-COURIER-09 | Kurir dapat **mengubah status online/offline secara manual** (dropdown) kapan pun — tetap bisa login dan melihat halaman saat offline, namun tidak menerima tawaran baru. | Tinggi    |

### 3.6 Chat Per Order (CHAT)

| ID         | Kebutuhan                                                                                                                         | Prioritas |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------- | --------- |
| FR-CHAT-01 | Setiap order memiliki percakapan yang dikelompokkan per **channel**: `customer-merchant`, `merchant-courier`, `courier-customer`. | Tinggi    |
| FR-CHAT-02 | Customer↔Merchant aktif sejak order dibuat; Merchant↔Courier saat kurir ditugaskan; Courier↔Customer saat pengiriman berlangsung. | Tinggi    |
| FR-CHAT-03 | Pesan memuat pengirim (id, nama, peran), teks, dan waktu; riwayat tersimpan.                                                      | Tinggi    |
| FR-CHAT-04 | Pesan baru muncul **realtime** di semua portal yang terlibat.                                                                     | Tinggi    |
| FR-CHAT-05 | Panel chat menampilkan tab channel bila lebih dari satu, badge pesan belum dibaca, dan input untuk mengirim.                      | Sedang    |
| FR-CHAT-06 | Chat hanya tersedia bagi pengguna yang terlibat pada order tersebut.                                                              | Sedang    |

### 3.7 Profil, Verifikasi & Pengaturan (PROFILE)

| ID            | Kebutuhan                                                                                         | Prioritas |
| ------------- | ------------------------------------------------------------------------------------------------- | --------- |
| FR-PROFILE-01 | Setiap pengguna dapat melihat & mengubah nama, email, nomor telepon, dan alamat.                  | Tinggi    |
| FR-PROFILE-02 | Perubahan email/telepon **wajib diverifikasi** dengan kode OTP (demo: kode ditampilkan di layar). | Tinggi    |
| FR-PROFILE-03 | Menu pengaturan diakses dari **dropdown avatar** (Settings), dengan tombol Sign out di bawahnya.  | Tinggi    |
| FR-PROFILE-04 | Untuk merchant, field nama & alamat = nama & alamat restoran (satu identitas).                    | Tinggi    |
| FR-PROFILE-05 | Untuk customer, alamat di pengaturan tersinkron ke lokasi pengiriman (kartu "Deliver to").        | Sedang    |

### 3.8 Lokasi & Peta (MAP)

| ID        | Kebutuhan                                                                                                                              | Prioritas |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| FR-MAP-01 | Merchant dapat mengedit lokasi restoran via peta (pin drag/klik) dengan alamat terisi otomatis (reverse geocoding).                    | Tinggi    |
| FR-MAP-02 | Customer dapat mengatur lokasi pengiriman via peta (beranda, checkout, pengaturan).                                                    | Tinggi    |
| FR-MAP-03 | Autocomplete alamat (Nominatim) dengan pemilihan saran yang memindahkan pin.                                                           | Sedang    |
| FR-MAP-04 | Lokasi restoran di dashboard merchant bersifat **read-only** secara default; edit hanya saat mode edit diaktifkan (mencegah mis-klik). | Sedang    |
| FR-MAP-05 | Peta menampilkan marker restoran, customer, dan posisi kurir (beserta rute).                                                           | Tinggi    |

### 3.9 Foto (PHOTO)

| ID          | Kebutuhan                                                                                 | Prioritas |
| ----------- | ----------------------------------------------------------------------------------------- | --------- |
| FR-PHOTO-01 | Merchant dapat mengunggah foto menu, foto restoran, dan foto kurir.                       | Tinggi    |
| FR-PHOTO-02 | Customer dapat melihat foto menu, restoran, dan kurir (di daftar, detail, dan pelacakan). | Tinggi    |
| FR-PHOTO-03 | Unggahan dikompresi otomatis (max 512px, JPEG) agar hemat penyimpanan.                    | Sedang    |

### 3.10 Mobile Native & PWA (MOBILE)

| ID           | Kebutuhan                                                                                                  | Prioritas |
| ------------ | ---------------------------------------------------------------------------------------------------------- | --------- |
| FR-MOBILE-01 | Setiap portal dapat diinstall sebagai PWA (offline-ready).                                                 | Sedang    |
| FR-MOBILE-02 | Setiap portal dibungkus menjadi aplikasi **Android & iOS** via Capacitor (base `/`, tanpa service worker). | Tinggi    |
| FR-MOBILE-03 | Build mobile menghasilkan bundle di `dist-mobile` dan dapat disinkronkan ke proyek native (`cap sync`).    | Tinggi    |

### 3.11 Customer Service / Monitoring (CS)

| ID       | Kebutuhan                                                                                                         | Prioritas |
| -------- | ----------------------------------------------------------------------------------------------------------------- | --------- |
| FR-CS-01 | CS dapat melihat **semua pesanan lintas semua merchant** beserta status realtime.                                 | Tinggi    |
| FR-CS-02 | CS dapat **membatalkan** pesanan dengan alasan `cs_cancelled` (stok otomatis dikembalikan).                       | Tinggi    |
| FR-CS-03 | CS dapat **menugaskan order ke kurir pilihan** (force assign) atau meneruskan offer ke kurir terdekat berikutnya. | Tinggi    |
| FR-CS-04 | CS dapat **menandai pesanan selesai (delivered)** secara manual bila kurir lupa menyelesaikan.                    | Sedang    |
| FR-CS-05 | CS dapat **membuka semua channel chat** pada sebuah order sebagai penengah (monitoring & intervensi).             | Sedang    |
| FR-CS-06 | CS dapat **memantau transaksi & status pembayaran** (simulasi sebelum payment gateway diintegrasikan).            | Sedang    |

---

## 4. Kebutuhan Antarmuka Eksternal

### 4.1 Antarmuka Pengguna

- Antarmuka berbasis web responsive (Tailwind CSS), bahasa Inggris, tema hijau (`#00aa13`).
- Komponen bersama di `packages/shared/src/components` (Navbar, AuthPage, ProfileMenu, ProfileSettings, MapView, AddressAutocomplete, PhotoUploader, OrderChat, StatusBadge, OrderItemsList, OrderStatusTimeline, dll).
- Akses di `:8080` (demo), `:5173/5174/5175` (dev), atau aplikasi native.

### 4.2 Antarmuka Perangkat Keras

- GPS/geolokasi untuk "Use my location".
- Kamera/gallery untuk upload foto (via input file).
- Layar sentuh untuk peta & pin.

### 4.3 Antarmuka Perangkat Lunak

- **Leaflet** + OpenStreetMap tile + Nominatim (reverse geocoding & search).
- **Supabase** (Auth, Postgres, Realtime) bila dikonfigurasi.
- **BroadcastChannel** (`sa7tein-sync`) untuk realtime antar tab mode lokal.
- **Capacitor 8** (Android/iOS) + Gradle (SDK 36, JDK 21) + Xcode.

### 4.4 Antarmuka Komunikasi

- REST/HTTP untuk Supabase; WebSocket (realtime) via Supabase Realtime.
- `localStorage` (prefix `sa7tein:`) untuk persisten mode lokal.
- `BroadcastChannel` untuk notifikasi realtime antar aplikasi pada origin sama.

---

## 5. Kebutuhan Non-Fungsional (NFR)

| ID           | Kategori        | Kebutuhan                                                                                                           |
| ------------ | --------------- | ------------------------------------------------------------------------------------------------------------------- |
| NFR-PERF-01  | Performa        | Aplikasi responsif; simulasi kurir memperbarui posisi tiap detik; build web < 6 detik per app.                      |
| NFR-PERF-02  | Performa        | Aset di-_cache_ (immutable hashed) agar muat cepat setelah pertama kali.                                            |
| NFR-SEC-01   | Keamanan        | Kata sandi di-hash; kode verifikasi hanya valid 10 menit & sekali pakai; `sanitizeUser` tidak mengekspos hash/salt. |
| NFR-SEC-02   | Keamanan        | Pesan chat hanya untuk peserta order; peran login dibatasi per portal.                                              |
| NFR-REL-01   | Keandalan       | Saat toko tutup, pesanan pending otomatis dibatalkan (tidak ada pesanan menggantung).                               |
| NFR-REL-02   | Keandalan       | Guard ganda toko tutup (UI + backend).                                                                              |
| NFR-AVAIL-01 | Ketersediaan    | Mode demo berjalan tanpa server eksternal (kecuali tile peta).                                                      |
| NFR-MAIN-01  | Maintainability | Kode dibagi via `@sa7tein/shared`; satu sumber kebenaran untuk logika umum.                                          |
| NFR-PORT-01  | Portabilitas    | Berjalan di browser, PWA, Android, dan iOS.                                                                         |
| NFR-COMP-01  | Kompatibilitas  | Mode Supabase vs lokal dipilih otomatis (`isSupabaseConfigured`).                                                   |
| NFR-USAB-01  | Usability       | Lokasi restoran read-only secara default agar tidak salah geser; tombol penting mudah dilihat.                      |

---

## 6. Matriks Traceability (ringkas)

| Modul         | FR terkait                      | NFR terkait   | File utama                                                           |
| ------------- | ------------------------------- | ------------- | -------------------------------------------------------------------- |
| Auth          | FR-AUTH-01..07                  | NFR-SEC-01/02 | `backend/*`, `components/AuthPage.jsx`, `data/seed.js`               |
| Menu/Store    | FR-MENU-01..06, FR-STORE-01..05 | NFR-REL-01/02 | `AdminDashboard.jsx`, `MenuManager.jsx`, `store.js`                  |
| Order         | FR-ORDER-01..08                 | NFR-PERF-01   | `CheckoutPage.jsx`, `TrackOrder.jsx`, `backend/*`                    |
| Courier       | FR-COURIER-01..09               | NFR-PERF-01   | `CourierDashboard.jsx`, `CourierDelivery.jsx`, `orders.js`, `geo.js` |
| Chat          | FR-CHAT-01..06                  | NFR-SEC-02    | `components/OrderChat.jsx`, `lib/chat.js`                            |
| Profile       | FR-PROFILE-01..05               | NFR-SEC-01    | `components/ProfileSettings.jsx`, `ProfileMenu.jsx`                  |
| Map           | FR-MAP-01..05                   | NFR-USAB-01   | `components/MapView.jsx`, `AddressAutocomplete.jsx`, `geo.js`        |
| Photo         | FR-PHOTO-01..03                 | NFR-PERF-02   | `components/PhotoUploader.jsx`, `image.js`                           |
| Mobile/PWA    | FR-MOBILE-01..03                | NFR-PORT-01   | `vite.config.js`, `capacitor.config.json`                            |
| CS/Monitoring | FR-CS-01..06                    | NFR-REL-01    | `apps/cs/*`, `CSDashboard.jsx`, `Transactions.jsx`                   |

---

_Dokumen ini sesuai dengan implementasi terkini dan diperbarui bersama setiap perubahan fitur.
Gunakan `npm run handover` untuk panduan pengembangan & handover cepat._
