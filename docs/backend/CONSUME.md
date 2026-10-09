# Konsumsi Database — untuk frontend baru

Target pembaca: siapa pun yang membangun frontend baru (mis. `za7tein-pwa`) di atas database
Sa7tein. Database **sudah live** dan sudah diuji bisa dikonsumsi — dokumen ini menjelaskan caranya,
apa yang boleh/tidak boleh, dan apa yang belum diputuskan.

Verifikasi: `npm run db:verify-consume` (12 pemeriksaan: tulis, baca lintas peran, RLS, realtime).
Batas yang belum diputuskan: `docs/backend/M6-ADAPTER.md` §9–§10.

---

## 1. Koneksi

Tidak ada server backend terpisah. **PostgREST + Realtime bawaan Supabase** adalah API-nya.

| Hal | Nilai |
|---|---|
| URL | `https://dwzxtnfesmpobnepilhl.supabase.co` (di `.env`: `VITE_SUPABASE_URL`) |
| Kunci klien | anon key (di `.env`: `VITE_SUPABASE_ANON_KEY`) — aman dipakai di browser |
| REST | `{URL}/rest/v1/<tabel>` |
| Auth | `{URL}/auth/v1` (login: `POST /auth/v1/token?grant_type=password`) |
| Realtime | `wss://…supabase.co/realtime/v1/websocket` (ditangani `@supabase/supabase-js`) |
| Docs API | OpenAPI statis: https://sa7tein-api.vercel.app · **catatan**: endpoint `/rest/v1/` (spec otomatis PostgREST) **dimatikan** Supabase, jadi kontraknya ambil dari `docs/backend/openapi.yaml` atau skema di `docs/backend/ERD.md`. |

`SUPABASE_SERVICE_ROLE_KEY` **hanya** untuk skrip admin di mesin sendiri — jangan pernah dipakai di
frontend.

## 2. Autentikasi & peran

1. Login lewat Supabase Auth (email + password) → dapat `access_token`.
2. Kirim token ke PostgREST: `Authorization: Bearer <access_token>` (+ `apikey: <anon key>`).
3. Di server, `auth.uid()` → dicocokkan ke `public.users.auth_user_id` oleh helper
   `app_uid()` / `app_role()` / `app_is_ops()`. **Inilah sebabnya `users.auth_user_id` wajib terisi**:
   akun auth yang belum dihubungkan akan lolos autentikasi tapi tidak punya profil.

Akun demo (password `demo1234`): `customer@sa7tein.app`, `merchant@sa7tein.app`,
`courier@sa7tein.app`, `cs@sa7tein.app`. Keempatnya sudah dihubungkan (`npm run db:link-auth`).

`register` di frontend harus mengisi `users.auth_user_id` dengan id dari `supabase.auth.signUp()`,
lalu membuat baris profil (`customers` / `merchants` / `couriers`) — lihat
`packages/shared/src/lib/backend/irbidBackend.js` sebagai contoh yang sudah jalan.

## 3. Matriks akses per peran (RLS)

Default = **tolak**. Tabel tanpa policy = tidak bisa diakses sama sekali.

| Peran | Boleh BACA | Boleh TULIS |
|---|---|---|
| **anon** (belum login) | katalog publik: `merchants` (hanya `tenant_status='approved'`), `menus`, `menu_variants`, `zones`, `exchange_rates`, `rating_reviews`, `review_replies`, `marketing`, `platform_switches`, `cashback_tiers` | — |
| **customer** | dirinya (`users`,`customers`,`addresses`), order miliknya (+ `order_items`,`fees`,`taxes`,`payments`,`checkpoints` lewat order), wallet & `topups`/`cashouts`/`wallet_holds`/`wallet_ledgers` miliknya, chat sebagai peserta, `push_subscriptions` | `orders` (insert), `rating_reviews`, `addresses`, `chat_messages`, `topups`, `cashouts`, profil |
| **merchant** | `merchants` miliknya, `menus`/`menu_variants` miliknya, `couriers` miliknya, `orders` untuk tokonya, chat sebagai peserta, `deposits`/`merchant_credits` miliknya | `merchants`, `menus`, `couriers`, `review_replies`, `orders` (update status) |
| **courier** | `couriers` dirinya, `orders` yang **ditugaskan ke dia** (`courier_id`), chat sebagai peserta, wallet miliknya | `couriers` (lokasi/ketersediaan), `orders` (update), `chat_messages` |
| **cs** (ops) | **semua** tabel lintas tenant | `orders`, `disputes` (resolve), `audit_logs` (insert), `deposits` |
| **superadmin** | semua | + `zones`, `roles`, `operators`, `tax_reports`, `platform_profit`, `platform_switches` |

Aturan penting yang mudah terlewat:

- **`orders` tidak punya policy DELETE** — order tidak bisa dihapus siapa pun lewat API. Batal =
  ubah `status` jadi `canceled` + `cancel_reason`/`cancel_by`.
- **`wallet_ledgers` & `audit_logs` append-only** (trigger `0006`): `UPDATE`/`DELETE`/`TRUNCATE`
  ditolak **untuk semua peran, termasuk service role**. Jangan bangun fitur edit/hapus di sini.
- **`rating_reviews`** harus menyasar tepat satu dari `merchant_id` **atau** `menu_id`
  (check constraint), unik per `(order_id, customer_id, merchant_id, menu_id)`.
- **`couriers`** wajib punya `merchant_id` (kurir = karyawan merchant) dan `users.phone` (E.164).

## 4. Contoh query (PostgREST)

```js
// katalog publik (tanpa login)
await fetch(`${URL}/rest/v1/merchants?select=id,store_name,store_address,latitude,longitude,available&tenant_status=eq.approved`, { headers: { apikey: ANON } });

// embed relasi: order + item + merchant (butuh FK, sudah ada)
await fetch(`${URL}/rest/v1/orders?select=id,code,status,total_jod,order_items(name,qty,unit_price_jod),merchants(store_name)&order=created_at.desc`, { headers: { apikey: ANON, Authorization: `Bearer ${token}` } });

// profil sesi (pola loadUserRow)
await fetch(`${URL}/rest/v1/users?select=*,customers(*),merchants(*),couriers(*)&limit=1`, …);
```

Realtime (11 tabel dipublikasikan): `orders`, `couriers`, `merchants`, `menus`, `chats`,
`chat_messages`, `wallets`, `wallet_holds`, `wallet_ledgers`, `disputes`, `batches`.

```js
supabase.channel('orders')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (p) => use(p.new))
  .subscribe();
```

## 5. Bentuk data: snake_case di DB, camelCase di frontend

DB memakai `snake_case`; frontend TS memakai `camelCase`. Padanan yang paling sering dipakai:

| Kolom DB | Kunci frontend | Catatan |
|---|---|---|
| `store_name` / `store_address` | `name` / `address` | merchant |
| `price_jod` | `priceJod` | JOD, `numeric(12,3)` |
| `sub_total_jod`, `delivery_fee_jod`, `platform_fee_jod`, `total_jod` | `subTotalJod`, … | **snapshot** saat order dibuat |
| `total_idr` | `totalIdr` | settlement, boleh `null` |
| `delivery_address_id` | `deliveryAddressId` | wajib saat insert order |
| `payment_method` / `payment_status` | `paymentMethod` / `paymentStatus` | |
| `hold_status` | `holdStatus` | `none/reserved/settled/released` (tahap `cut` dihapus) |
| `zone_code` / `zone_id` | `zoneCode` / `zoneId` | kolom `orders`, bukan query ke `zones` |
| `availability` (couriers) | `availability` | `available/unavailable/busy` |
| `last_seen_at` | `lastSeenAt` | heartbeat tawaran |

Catatan teknis: PostgREST mengembalikan `numeric` sebagai **string** (mis. `"3.500"`), bukan number.
Konversi eksplisit di sisi frontend (`Number(v)`) — lihat helper `num()` di `irbidBackend.js`.

## 6. Yang BELUM diputuskan (menghalangi integrasi penuh)

Tiga hal ini keputusan produk, sudah dicatat lengkap di `M6-ADAPTER.md` §10:

1. **Mata uang** — DB menyimpan JOD (`_jod`), sedangkan `za7tein-pwa` memakai **IDR sebagai sumber
   kebenaran** + JOD hanya tampilan. Salah satu harus menyesuaikan.
2. **Kosakata status order** — DB memakai istilah Inggris (`cart/quotation/prepare/waitingCourier/
   waitingDelivery/delivery/done/canceled`), frontend baru memakai istilah Indonesia
   (`masuk/diterima/dimasak/diantar/tiba/selesai/ditolak/batal`).
3. **Format id** — DB `bigint identity` (1, 2, 3…), frontend baru memakai string ber-prefix
   (`cus-1`, `am-1`, `mo-1`).

Selain itu jalur uang **reserve → settle** belum dijalankan aplikasi mana pun (tabel + trigger sudah
ada dan sudah diuji di `npm run db:e2e`), dan gerbang zona belum dipakai.

## 7. Cara memverifikasi sendiri

```bash
npm run db:remote-check    # skema cloud lengkap? (42 tabel, skema lama bersih, seed terisi)
npm run db:link-auth       # akun auth sudah terhubung ke users?
npm run db:verify-consume  # tulis + baca lintas peran + RLS + realtime, ke CLOUD (12 pemeriksaan)
```

`db:verify-consume` membuat satu order uji lalu **menghapusnya lagi**, jadi DB tidak ditinggalkan
kotor. Jalankan setiap kali skema/policy berubah.
