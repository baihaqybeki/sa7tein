# 🍽️ Sa7tein — Four Separate Portals (GoFood-style)

A food delivery system built as **four separate web apps** that talk to each other the way
the GoFood ecosystem does:

| Portal                            | Role                                                | Path         | Dev port |
| --------------------------------- | --------------------------------------------------- | ------------ | -------- |
| 🛍️ **Customer** (`apps/customer`) | Order food, cart, checkout, track the courier       | `/customer/` | 5173     |
| 👨‍🍳 **Merchant** (`apps/merchant`) | Accept incoming orders, manage the menu and stock   | `/merchant/` | 5174     |
| 🛵 **Courier** (`apps/courier`)   | Pick up and deliver orders, live tracking           | `/courier/`  | 5175     |
| 🎧 **CS** (`apps/cs`)             | Monitor transactions, manage orders & cancellations | `/cs/`       | 5176     |

All shared code (store, backend, geo helpers, components) lives in **`packages/shared`** and is
imported through the `@sa7tein/shared` alias — written once, used by all four portals.

## 📁 Structure

```
sa7tein/
├── apps/
│   ├── customer/   # Customer portal (Vite + React + PWA)
│   ├── merchant/   # Merchant portal (Vite + React + PWA)
│   ├── courier/    # Courier portal (Vite + React + PWA)
│   └── cs/         # CS portal — monitor & manage orders (Vite + React + PWA)
├── packages/
│   └── shared/     # Shared code: lib, store, backend, components
├── scripts/
│   ├── generate-icons.py
│   ├── serve-demo.mjs   # Serve all four portals on one origin
│   ├── doctor.mjs       # Cek lingkungan build (node/java/android/xcode)
│   ├── handover.mjs     # Panduan cepat handover proyek
│   ├── build-apk.mjs    # Build 3 APK Android sekaligus
│   └── build-ipa.mjs    # Build 3 IPA iOS sekaligus
├── docs/
│   ├── SRS.md           # Software Requirements Specification
│   └── FSD.md           # Functional Specification Document
├── supabase/schema.sql
└── .env.example
```

## 📚 Dokumentasi & Handover

```bash
npm run handover   # panduan cepat arsitektur, quick start, akun demo, gotchas
npm run doctor     # cek lingkungan: Node, JDK 17+, Android SDK, Xcode, Supabase
npm run apk        # build 3 APK Android debug sekaligus → mobile-builds/
npm run tunnel     # HTTPS tunnel (cloudflared) → coba di iPhone (PWA + geolokasi)
```

> 📱 **Mencoba di iPhone:** pastikan server demo jalan (`npm run demo`), lalu `npm run tunnel`
> dan buka URL `https://….trycloudflare.com/customer/` di Safari iPhone (Wi-Fi yang sama tidak
> diperlukan). Karena HTTPS, **Add to Home Screen** (PWA) dan **Use my location** berfungsi.

- **`docs/SRS.md`** — Software Requirements Specification (kebutuhan fungsional & non-fungsional).
- **`docs/FSD.md`** — Functional Specification Document (modul, aturan bisnis, data, antarmuka backend).

## 🔐 Accounts

Each portal requires a sign-in. Demo accounts are seeded automatically (one per portal):

| Portal   | Email                  | Password   |
| -------- | ---------------------- | ---------- |
| Customer | `customer@sa7tein.app` | `demo1234` |
| Merchant | `merchant@sa7tein.app` | `demo1234` |
| Courier  | `courier@sa7tein.app`  | `demo1234` |
| CS       | `cs@sa7tein.app`       | `demo1234` |

You can also create your own account from the portal's **Create account** tab. Accounts are
role-scoped, so a customer account cannot sign in to the merchant portal.

## 🚀 Running

```bash
npm install
```

### Development (one portal at a time)

```bash
npm run dev:customer   # http://localhost:5173/customer/
npm run dev:merchant   # http://localhost:5174/merchant/
npm run dev:courier    # http://localhost:5175/courier/
npm run dev:cs         # http://localhost:5176/cs/
# or run all four at once:
npm run dev
```

> ⚠️ During development each portal runs on a different port (a different origin), so the
> Local Demo Mode does not sync across portals. For a fully connected demo without Supabase,
> use `npm run demo`.

### Real-time demo (single origin, synced like GoFood)

```bash
npm run demo
# builds all four portals, then serves them at http://localhost:8080
# landing page → pick /customer/, /merchant/, /courier/, or /cs/
```

Because all four are served from the **same origin**, `localStorage` + `BroadcastChannel`
(Local Demo Mode) are shared — orders placed on the customer portal appear **live** on the
merchant portal, a courier can accept them, CS can monitor them, and the customer sees the
tracking. Just like GoFood.

## ✨ Features

- ⚡ **Live stock / auto-deduct** — stock drops in real time across every portal when an order is placed
- 🚶 **Per-distance courier fee** — computed from the restaurant→customer distance (haversine formula)
- 📍 **Live courier tracking** — the courier's position updates on the map (OpenStreetMap/Leaflet)
- ⏱️ **Delivery estimates** — merchant-set prep time plus the on-foot travel estimate
- 🔐 **Per-portal accounts** — sign in and register for each role
- 📱 **PWA** — every portal can be installed to the home screen (Android & iOS), offline-ready

## 🧪 Demo flow (four portals)

1. **Customer**: pick items → cart → checkout → drop a pin on the map → place the order
2. **Merchant**: see the incoming order → accept → start preparing (set the prep time) → mark ready
3. **Courier**: take the order → "Start Delivery" → the on-foot simulation runs → the courier's
   position shows live on the customer's map
4. **CS**: monitor every transaction, cancel unresponsive orders, and force-assign couriers
5. **Customer**: watch the live tracking, remaining distance, and ETA

## 🗄️ Backend: Local Demo vs Supabase

The backend is selected automatically (see `packages/shared/src/lib/backend`):

- **Local Demo Mode** (default): data in `localStorage`, realtime across tabs via `BroadcastChannel`.
  Syncs across portals when served from the same origin (see `npm run demo`).
- **Supabase Mode** (cloud, realtime across devices): active when `.env` is filled in at the **repo root**
  (all four portals read the env from the root through `envDir`).

### Setting up Supabase (free)

1. Sign up at <https://supabase.com> (free tier) → create a project
2. Open the **SQL Editor** → run the contents of `supabase/schema.sql`
3. Copy the `Project URL` and `anon public key` from **Settings → API**
4. Create `.env` at the repo root from `.env.example`:

```bash
cp .env.example .env
# then fill in:
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

With Supabase, all four portals stay in sync across origins and devices, with no need for `npm run demo`.

5. `npm run dev` — realtime now works across devices (phone & laptop can see each other)

## 🧮 Courier Fee Formula (on foot)

- Distance is calculated with the **haversine formula** (meters)
- Rate: `Rp5,000` + `Rp2,500/km`, minimum `Rp5,000`, rounded to `Rp500`
- Travel time: `distance ÷ 1.35 m/s` (≈ 4.9 km/h walking speed)
- **Total estimate** = prep time (set by the merchant) + travel time

All of this can be tuned in `packages/shared/src/lib/geo.js`.

## 🚢 Deploying each portal independently

Each app can be deployed to its own domain or path. Adjust the `base` in each app's `vite.config.js`
(defaults: `/customer/`, `/merchant/`, `/courier/` so they can be hosted on a single origin):

```bash
npm run build:customer
npm run build:merchant
npm run build:courier
# build output lands in apps/*/dist
```

### Deploy ke Vercel (4 project terpisah)

Setiap portal punya mode build `SA7TEIN_VERCEL=1` (base `/`, PWA di root).

```bash
vercel login                 # sekali saja (interaktif — akun Vercel kamu)
npm run deploy:customer      # → sa7tein-customer.vercel.app
npm run deploy:merchant      # → sa7tein-merchant.vercel.app
npm run deploy:courier       # → sa7tein-courier.vercel.app
npm run deploy:cs            # → sa7tein-cs.vercel.app
```

Hasilnya 4 URL terpisah (`sa7tein-customer.vercel.app`, dst.). ⚠️ Mode demo lokal tidak sinkron
antar domain berbeda (origin berbeda) — untuk sinkron lintas portal di Vercel, isi **Supabase**.

## 📲 Native Mobile Apps (Android & iOS via Capacitor)

Each portal can be wrapped into a native app with **Capacitor**. Every app already has a generated
`android/` and `ios/` project plus a `capacitor.config.json`:

| App      | Android applicationId / iOS bundle id | App name         |
| -------- | ------------------------------------- | ---------------- |
| Customer | `com.sa7tein.customer`                | Sa7tein Customer |
| Merchant | `com.sa7tein.merchant`                | Sa7tein Merchant |
| Courier  | `com.sa7tein.courier`                 | Sa7tein Courier  |

### Requirements

- **Node 20+** and npm
- **Android**: Android Studio / Android SDK (platform 33/36 + build-tools) and a **JDK 17+** (`JAVA_HOME`)
- **iOS**: a Mac with **Xcode** (an iOS build cannot be produced without it)

### Generate the native projects (one time)

```bash
npm run cap:add:android -w @sa7tein/customer   # or add --workspaces to do all three
npm run cap:add:ios -w @sa7tein/customer
```

### Build the mobile bundle + sync into the native projects

```bash
npm run cap:sync -w @sa7tein/customer   # one portal…
npm run cap:sync                       # …or all three
```

`cap:sync` runs `SA7TEIN_MOBILE=1 vite build` (base `/`, output `dist-mobile`, **no PWA service
worker**) and then `cap sync` copies those web assets into `android/` and `ios/`.

### Build / run

**Android** (debug APK):

```bash
export JAVA_HOME=/Library/Java/JavaVirtualMachines/<jdk-21>/Contents/Home
cd apps/customer/android && ./gradlew assembleDebug
# APK → apps/customer/android/app/build/outputs/apk/debug/app-debug.apk
```

Ready-made debug APKs are also copied to **`mobile-builds/`**:

```
mobile-builds/sa7tein-customer-debug.apk
mobile-builds/sa7tein-merchant-debug.apk
mobile-builds/sa7tein-courier-debug.apk
```

Or open `apps/*/android` in **Android Studio** and press Run.

**iOS**:

```bash
npm run cap:sync -w @sa7tein/customer
npm run cap:open:ios -w @sa7tein/customer   # opens Xcode → pick a simulator/device → Run
```

### Scripts summary (per app, e.g. `-w @sa7tein/customer`)

| Command                   | What it does                                                        |
| ------------------------- | ------------------------------------------------------------------- |
| `npm run build:mobile`    | Web build with base `/` into `dist-mobile` (no PWA SW)              |
| `npm run cap:add:android` | Generates the native `android/` project                             |
| `npm run cap:add:ios`     | Generates the native `ios/` project                                 |
| `npm run cap:sync`        | Mobile build + copy assets into the native projects                 |
| `npm run cap:android`     | Sync, then open the Android project in Android Studio               |
| `npm run cap:ios`         | Sync, then open the iOS project in Xcode                            |
| `npm run apk`             | Build 3 Android debug APKs → `mobile-builds/`                       |
| `npm run ipa`             | Build the iOS `.ipa` (needs Xcode + signing) → `mobile-builds/ios/` |

> 📝 The native apps keep working in **Local Demo Mode** on a single device (localStorage +
> BroadcastChannel are available in the WebView). For realtime across _different_ devices or apps,
> fill in **Supabase** (see below).

### 📲 Install di HP

**Android (APK):** APK debug ada di `mobile-builds/`. Kalau server demo berjalan (`npm run demo`)
atau tunnel (`npm run tunnel`), buka `/apk/` di browser HP untuk daftar unduhan:

```
http://<ip-mac>:8080/apk/            # via LAN (Wi-Fi sama)
https://….trycloudflare.com/apk/     # via tunnel (di mana saja)
```

Lalu buka file `.apk` yang terunduh → izinkan "Install from unknown sources" → Install.

**iPhone (`.ipa`):** file `.ipa` dibuat dari proyek `ios/` dengan **Xcode** di macOS:
`npm run cap:sync -w @sa7tein/<app>` → `npm run cap:ios -w @sa7tein/<app>` → pilih perangkat → Run.
Tanpa Xcode, gunakan **PWA** dari tunnel HTTPS: buka URL-nya di Safari → **Add to Home Screen**
(berfungsi seperti app).

## 🔧 Utilities

```bash
npm run icons   # regenerate the PWA icons for all three apps
```

## 🛠️ Tech Stack

React 18 · Vite · Tailwind CSS · Zustand · Leaflet (OpenStreetMap) · vite-plugin-pwa · Supabase (optional)
