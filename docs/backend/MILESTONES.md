# Milestone — Migrasi DB & API Spec ke ERD Irbid MVP

Status: `planned`. **Milestone adalah rencana, bukan klaim sudah selesai.**
Dibuat: 2026-10-09.

## Sumber

| Sumber | Isi |
|---|---|
| `za7tein-pwa/docs/product/schema-draft-v1.md` | ERD draft BE (17 entitas) + tambahan frontend |
| `za7tein-pwa/docs/product/prd/decision-irbid-mvp.md` | Keputusan PO: uang (reserve→settle), peran CS vs Super Admin, registri pengguna |
| `za7tein-pwa/docs/product/prd/versions/irbid-mvp-v2-2026-09-21/repo-sa7tein-schema.md` | Snapshot kondisi repo ini (referensi UI/UX) |
| `za7tein-pwa/docs/design/flows/INDEX.json` | Peta 24 flow: `event → entity` (bahan ERD + API) |
| Repo ini: `supabase/schema.sql` | Kondisi DB sekarang (7 tabel, JSONB) |

## Keputusan yang membuka pekerjaan ini

Keputusan PO 2026-10-09 (menyimpang dari catatan sebelumnya, dicatat eksplisit):

1. **Repo ini (`baihaqybeki/sa7tein`) menjadi backend resmi.** Catatan lama di
   `repo-sa7tein-schema.md` yang menyebut repo ini *"referensi UI/UX saja, bukan target
   implementasi"* **tidak lagi berlaku** untuk pekerjaan backend/DB/API.
2. **Strategi migrasi: ganti total.** Skema lama (7 tabel, `orders.data` JSONB) **diganti**
   ERD Irbid. Tidak ada jalur paralel/dual-track.
3. **Gaya API spec: REST + Realtime**, technology-agnostic, plus webhook provider pembayaran.
   Backend saat ini menembak Supabase langsung; spec ini menjadi kontrak target.

> Konsekuensi yang harus disadari: 4 portal live (`sa7tein-{customer,merchant,courier,cs}.vercel.app`)
> **akan berhenti cocok** dengan skema baru sampai M6 selesai. Lihat catatan risiko di bawah.

## Status pelaksanaan (2026-10-09)

| Milestone | Status | Bukti |
|---|---|---|
| M0 | ✅ selesai | §`UNRESOLVED` di dokumen ini (20 item, punya pemilik/sumber) |
| M1 | ✅ selesai | `docs/backend/ERD.md` — **42 tabel**, 63 FK, 49 check |
| M2 | ✅ selesai | `supabase/migrations/0001_identity_catalog.sql` (10 tabel) |
| M3 | ✅ selesai | `supabase/migrations/0002_order_money.sql` (18 tabel) |
| M4 | ✅ selesai | `supabase/migrations/0003_ops_platform.sql` (14 tabel) |
| M5 | ✅ selesai | `0004_indexes_rls_realtime.sql` + `0005_seed_irbid.sql` + `0006_append_only_guards.sql` — RLS **42/42**, 59 policy, 11 tabel realtime, seed JOD, penjaga append-only |
| M6 | 🟡 **sebagian** — adapter **live di produksi** | `irbidBackend.js` (942 baris, 33 metode). Skema baru = default; `VITE_SCHEMA=legacy` jalan pulang. **2026-10-09: cloud Supabase dimigrasikan (42/42 tabel) + 4 portal dideploy** — portal lama kini membaca skema baru. Audit skema: 32 tabel / 195 kolom / 17 relasi / 29 objek insert, 0 rujukan tidak dikenal (auditor diuji mutasi). **DoD belum**: reserve/hold, gerbang zona, timestamp per-status; UI lama masih memakai nama field lama (~143 rujukan di 15 berkas); UI baru belum cocok (mata uang, kosakata status, format id) — `docs/backend/M6-ADAPTER.md` §9–§10 |
| M7 | 🟡 draft | `docs/backend/openapi.yaml` — 68 path / 83 operasi, audit 1:1 **LULUS** |
| M8 | 🟡 sebagian | `MIGRATION-RUNBOOK.md` ✅ · **migrasi cloud + deploy 4 portal (2026-10-09)** ✅ · selaraskan SRS/FSD ⛔ |

**Cara memverifikasi klaim di tabel ini** (bukan janji, bisa dijalankan siapa pun):

```bash
npm run db:verify            # jalankan 0000–0006 di Postgres lokal + uji constraint, append-only & RLS
npm run db:e2e               # alur bisnis end-to-end (26 pemeriksaan)
npm run db:migrations:sync   # pastikan migrasi == ERD.md (tidak drift)
npm run db:migrations:bundle # pastikan supabase/apply-all.sql sinkron dengan 0000-0006
npm run db:remote-check      # cek skema di Supabase CLOUD (read-only): siap deploy atau belum
npm run db:verify-consume    # CLOUD: tulis + baca lintas peran + RLS + realtime (12 pemeriksaan)
npm run db:link-auth         # hubungkan akun Supabase Auth ke users.auth_user_id
npm run db:audit-backend     # tabel/kolom/relasi yang dirujuk adapter benar-benar ada di skema
npm run api:audit            # audit 1:1 kontrak API vs sumber spek
```

Yang **belum** dikerjakan dan alasannya: sisa **M6** (reserve/hold, gerbang zona, timestamp
per-status) dan deploy ulang pada M8.

⚠️ **Sejak 2026-10-09 skema baru jadi DEFAULT** (permintaan pemilik produk: portal lama boleh
putus supaya skema baru bisa dikonsumsi). Jadi **4 portal lama tidak lagi cocok** dengan bentuk
data yang dikembalikan adapter — build tetap sukses, tapi datanya salah (mis. `Rp NaN`).
Jalan pulang: `VITE_SCHEMA=legacy`. Sebelum deploy ulang ke produksi, lihat
`MIGRATION-RUNBOOK.md` §5.

## Aturan main (dari `schema-draft-v1.md`, tidak boleh dilanggar)

- **Snapshot > hitung ulang.** Harga, modifier, zone, dan fee di-*freeze* saat order dibuat.
  Menu naik harga tidak mengubah order lama.
- **`number/pk` = auto-increment.** Semua referensi = FK ke pk. (Skema lama memakai `text` id
  seperti `merchant-1`; ini berubah.)
- **`UNRESOLVED` jangan ditebak.** Sumber dan pemilik keputusan dicatat, task berstatus
  `blocked-by-decision`.
- Nominal uang: **JOD** (display) dengan **IDR** sebagai settlement (DEC: v2). Tarif pajak dua
  lapis (GST Jordan + fee platform) — angka final `UNRESOLVED`.
- `quotation` vs `placed` belum disamakan bahasanya → `UNRESOLVED`.

## Milestone

| ID | Milestone | Bergantung pada | Acceptance criteria | Keluaran |
|---|---|---|---|---|
| **M0** | **Freeze scope & tutup blocker** | — | Daftar `UNRESOLVED` punya pemilik + status; item yang memblokir DB ditandai `blocked-by-decision`; tidak ada angka yang ditebak | `docs/backend/BLOCKERS.md` |
| **M1** | **ERD final + peta migrasi** | M0 | Setiap entitas punya pk/FK/tipe/constraint; tabel → entitas lama terpetakan (termasuk field yang hilang/berubah arti); relasi 1-N & snapshot ditandai | `docs/backend/ERD.md` + diagram |
| **M2** | **DB fase 1 — identitas & katalog** | M1 | Tabel `users`, `phone_verifications`, `addresses`, `customers`, `merchants`, `couriers`, `fav_merchants`, `menus`, `menu_variants`, `zones` + constraint + FK lulus | `supabase/migrations/00X_*.sql` |
| **M3** | **DB fase 2 — order & uang** | M2 | Tabel `orders`, `order_items`, `batches`, `wallets`, `wallet_holds`, `wallet_ledgers`, `topups`, `cashouts`, `merchant_credit`, `disputes`, `protection_fund`, `exchange_rates`; hold lifecycle `none/reserved/settled/released`; ledger append-only + double-entry lulus | `supabase/migrations/00X_*.sql` |
| **M4** | **DB fase 3 — ops & platform** | M3 | Tabel `chats`, `chat_messages`, `incident_resolutions`, `rating_reviews`, `review_replies`, `marketing`, `push_subscriptions`, `checkpoints`, `operators`, `roles`, `audit_logs`, `tax_reports`, `platform_profit`, `platform_switches` lulus | `supabase/migrations/00X_*.sql` |
| **M5** | **Constraint, index, RLS, realtime, seed** | M4 | Index untuk query panas (order by merchant/status, ledger by user, chat by order); RLS per peran (bukan permissive); realtime publication dipilih sadar (bukan semua tabel); seed Irbid JOD (merchant + menu + zone + kurir) | `supabase/migrations/00X_*.sql` + `scripts/seed-supabase.mjs` |
| **M6** | **Adapter backend → tabel ternormalisasi** | M5 | `irbidBackend.js` membaca/menulis tabel baru dan menjadi **default**; `orders.data` JSONB dihapus; semua method adapter punya pemetaan ke kolom. **DoD direvisi 2026-10-09**: bukan lagi "4 portal lama berjalan", tetapi "skema baru bisa dikonsumsi UI baru" — portal lama boleh putus (`M6-ADAPTER.md` §1) | `packages/shared/src/lib/backend/*.js` |
| **M7** | **API spec (REST + Realtime)** | M5 | Kontrak endpoint lengkap: auth, resource, event realtime, format error, idempotency, pagination, webhook Xendit, aturan otorisasi per peran; setiap endpoint memetakan `event → entity`; item tanpa sumber ditandai `UNRESOLVED` | `docs/backend/API-SPEC.md` |
| **M8** | **Verifikasi & handover** | M6, M7 | Runbook migrasi (backup → apply → seed → verifikasi); uji E2E 4 portal di atas skema baru; `docs/SRS.md`/`FSD.md` + Word doc diselaraskan; deploy ulang Vercel | `docs/backend/MIGRATION-RUNBOOK.md` + docs tersinkron |

### Urutan kritis

```
M0 ─▶ M1 ─▶ M2 ─▶ M3 ─▶ M4 ─▶ M5 ─┬─▶ M6 ─┐
                                    └─▶ M7 ─┴─▶ M8
```

M2→M4 boleh dikerjakan berurutan ketat (FK antar fase). M6 dan M7 paralel setelah M5.

## Rincian task

Format kolom mengikuti konvensi repo: `sourceRef`, `affectedFiles`, `owner`, `dependency`,
`acceptance`, `backendContract`.

### M0 — Freeze scope & tutup blocker

| ID | Task | sourceRef | affectedFiles | dependency | acceptance |
|---|---|---|---|---|---|
| M0-1 | Catat keputusan repo-target + ganti-total + REST sebagai keputusan PO | jawaban PO 2026-10-09 | dokumen ini | — | Keputusan tertulis dengan tanggal, tidak bisa terlewat |
| M0-2 | Inventaris `UNRESOLVED`: SLA, pajak, cash-out fee, kurs, dispute window, insentif, expiry reserve, taksonomi audit target, `quotation` vs `placed`, auth SA/CS | `schema-draft-v1.md` §UNRESOLVED, `decision-irbid-mvp.md` | `docs/backend/BLOCKERS.md` | M0-1 | Tiap item punya pemilik + status + dampak ke tabel mana |
| M0-3 | Tandai task `blocked-by-decision` (jangan diisi tebakan) | `AGENTS.md` | dokumen ini | M0-2 | Tidak ada angka/atribut hasil tebakan di dokumen |

### M1 — ERD final + peta migrasi

| ID | Task | sourceRef | affectedFiles | dependency | acceptance |
|---|---|---|---|---|---|
| M1-1 | Tentukan pk/FK/tipe untuk 17 entitas draft + entitas tambahan dari flow | `schema-draft-v1.md` §Entitas | `docs/backend/ERD.md` | M0-3 | Setiap entitas punya pk auto-increment + FK eksplisit |
| M1-2 | Tambahkan entitas yang hanya muncul di flow (bukan di draft) | `flows/INDEX.json` §trace | `docs/backend/ERD.md` | M1-1 | Tidak ada `entities` di trace yang belum punya tabel |
| M1-3 | Petakan 7 tabel lama → entitas baru; tandai field hilang/berubah arti | `supabase/schema.sql` | `docs/backend/ERD.md` | M1-1 | Tiap tabel lama punya baris pemetaan (atau `dropped` + alasan) |
| M1-4 | Tandai kolom snapshot (freeze saat order) | `schema-draft-v1.md` §Aturan main | `docs/backend/ERD.md` | M1-1 | Kolom harga/fee/zone terdaftar sebagai snapshot |

### M2 — DB fase 1 (identitas & katalog)

| ID | Task | sourceRef | affectedFiles | acceptance |
|---|---|---|---|---|
| M2-1 | `users`, `phone_verifications` (E.164 +962/+62, Level 1 tanpa OTP WA) | DEC-1370, DEC-1379 | `migrations/` | Registrasi nomor WA wajib + validasi format |
| M2-2 | `addresses` (+ `zone` A/B/C dihitung saat save pin) | flow f20 | `migrations/` | Zone terisi saat simpan pin, bukan saat tampil |
| M2-3 | `customers` (+ `riskFlag`), `merchants` (+ `tenantStatus`, `deposit`, `depositStatus`, `deliveryConfig`) | schema draft 3–4 | `migrations/` | `deliveryConfig` mendukung mode `radius` **dan** `area` |
| M2-4 | `couriers` (+ `availability`), `fav_merchants` | schema draft 5–6, C-06 | `migrations/` | Kurir milik merchant (maks 3 dijaga di API, bukan FK) |
| M2-5 | `menus`, `menu_variants` (options JSONB bersarang) | schema draft 7–8 | `migrations/` | `maxSelect` menentukan radio vs checkbox di kontrak |
| M2-6 | `zones` (master zona Hijazi/Syimali — milik Super Admin) | DEC 2026-09-23, f20/f22 | `migrations/` | Merchant hanya mengaktifkan, tidak mendefinisikan |

### M3 — DB fase 2 (order & uang)

| ID | Task | sourceRef | affectedFiles | acceptance |
|---|---|---|---|---|
| M3-1 | `orders` + `order_items`; enum 9 status + `paymentMethod` (cod/transfer/xendit_va/xendit_qris) + `paymentStatus` | schema draft 9–10, C-17 | `migrations/` | Semua nominal (subTotal/deliveryFee/platformFee/total/tip/promoAmount) tersimpan, bukan dihitung ulang |
| M3-2 | `batches` + `slaPrepareDeadline`/`slaDeliveryDeadline`/`escalatedToAdmin` | schema draft 11 | `migrations/` | Angka SLA diisi dari konfigurasi (angka final `UNRESOLVED`) |
| M3-3 | `wallets` (`balance` + `reservedBalance`) | schema draft 12, DEC-1042 | `migrations/` | Reserve saat order dibuat, berkurang saat order `done` |
| M3-4 | `wallet_holds` — lifecycle `none/reserved/settled/released` (tahap `cut` dihapus) | DEC 2026-09-25 | `migrations/` | Tidak ada state `cut`; batal sebelum done hanya `released` |
| M3-5 | `wallet_ledgers` double-entry append-only (`cr`/`db`, reference `topUp|order|delivery|withdrawal|refund|hold|release`) | schema draft 13, R-LEDGER-01 | `migrations/` | Tidak ada UPDATE/DELETE (dijaga trigger/rule) |
| M3-6 | `topups`, `cashouts` (fee cash-out `UNRESOLVED` OQ-22) | flow f3/f6 | `migrations/` | Kolom fee ada; nilainya dari konfigurasi, bukan hardcode |
| M3-7 | `merchant_credit` (modal 5 JOD + cashback non-withdrawal) | I-2/I-3/DEK, DEC-2006 | `migrations/` | Nama kolom mengikuti kontrak (`rebate_tier`, `rebate_period`, …) |
| M3-8 | `disputes`, `protection_fund` (window 24 jam sementara) | schema draft 15, OQ-29 | `migrations/` | Window & kategori dari konfigurasi, ditandai sementara |
| M3-9 | `exchange_rates` (IDR settlement ↔ JOD display) | R-CURR-01, OQ-26/28 | `migrations/` | Provider kurs `UNRESOLVED` → kolom `source` disiapkan |

### M4 — DB fase 3 (ops & platform)

| ID | Task | sourceRef | affectedFiles | acceptance |
|---|---|---|---|---|
| M4-1 | `chats`, `chat_messages` (maks 3 peserta, retensi `UNRESOLVED`) | schema draft 14, C-18 | `migrations/` | Peserta = referensi id user, bukan nama |
| M4-2 | `incident_resolutions` (tipe + status + resolusi refund/resettle) | schema draft 15 | `migrations/` | `resolvedBy` menunjuk operator, bukan string |
| M4-3 | `rating_reviews`, `review_replies` | schema draft 17, R-RATE-01 | `migrations/` | `merchant` XOR `menu` dijaga constraint |
| M4-4 | `marketing` (promo delivery / discount) — scope MVP `UNRESOLVED` MARK-1 | schema draft 16 | `migrations/` | Status task `blocked-by-decision` sampai MARK-1 diputuskan |
| M4-5 | `checkpoints` (4 titik verifikasi kirim + OTP) | f5, R-DELIV-01 | `migrations/` | Tiap checkpoint menyimpan waktu + bukti |
| M4-6 | `push_subscriptions` | f11, R-PUSH-01 | `migrations/` | Endpoint + keys tersimpan per user |
| M4-7 | `operators`, `roles`, `audit_logs` (`actorId`; `target` taksonomi `UNRESOLVED`) | DEC 2026-09-23 | `migrations/` | Setiap aksi CS/SA tercatat dengan pelaku |
| M4-8 | `tax_reports`, `platform_profit`, `platform_switches` (kill switch) | DEC 2026-09-23 | `migrations/` | Saldo profit platform terpisah dari dana user (liability) |

### M5–M8

| ID | Task | dependency | acceptance |
|---|---|---|---|
| M5-1 | Index query panas (order by merchant+status, ledger by user+date, chat by order) | M4 | `explain` tidak full-scan untuk query daftar |
| M5-2 | RLS per peran (ganti `using(true)`) | M4 | Customer tidak bisa membaca order/ledger milik orang lain |
| M5-3 | Realtime publication dipilih sadar | M4 | Hanya tabel yang butuh push yang dipublikasikan |
| M5-4 | Seed Irbid (JOD): merchant, menu + variant, zone, kurir, operator CS/SA | M4 | `seed:supabase` idempoten, tanpa menyentuh saldo |
| M6-1 | `supabaseBackend.js` → tabel baru; `orders.data` JSONB dihapus | M5 | Tidak ada SELECT/INSERT ke `orders.data` |
| M6-2 | `localBackend.js` diselaraskan ke bentuk data baru | M5 | Mode lokal & Supabase punya bentuk objek identik |
| M6-3 | 4 portal berjalan di atas skema baru | M6-1 | E2E: order → accept → assign → deliver → done |
| M7-1 | Auth: registrasi/login (Google + nomor WA E.164), sesi, peran | M5 | Kontrak sesi + error konsisten |
| M7-2 | Resource endpoint per entitas (CRUD + aksi) | M7-1 | Tiap endpoint: method, path, auth, body, respons, error |
| M7-3 | Realtime channel + nama event (`reserve_created`, `ledger_entry`, `courier_match`, …) | M7-2 | Nama event sama dengan `flows/INDEX.json` |
| M7-4 | Webhook Xendit (VA/QRIS) + idempotency key + retry | DEC-1039, OQ-25 | Idempotency & urutan webhook didefinisikan |
| M7-5 | Format error + pagination + rate limit + otorisasi per peran | — | Satu format error untuk semua endpoint |
| M8-1 | Runbook migrasi (backup → apply → seed → verifikasi → rollback) | M6, M7 | Bisa dijalankan orang lain tanpa bertanya |
| M8-2 | Selaraskan `docs/SRS.md`, `docs/FSD.md`, Word doc | M8-1 | Tidak ada sisa aturan IDR/radius A-B-C/skema lama |
| M8-3 | Deploy ulang Vercel + verifikasi E2E | M8-1 | 4 portal live di atas skema baru |

## `UNRESOLVED` — jangan ditebak

Diambil dari `schema-draft-v1.md` + `decision-irbid-mvp.md`. Task terkait berstatus
`blocked-by-decision`.

| ID | Topik | Dampak | Pemilik |
|---|---|---|---|
| SLA-1 | Angka SLA prepare/delivery (15/30/10 sementara) | `batches.sla*Deadline`, timer UI | PO |
| FEE-1 | Rincian fee final per metode (0,37 PO / 0,22 I-1) | `orders.platformFee`, `fees` | PO + konsultan pajak |
| TAX-1 | Tarif pajak final (GST Jordan + PPh) — OQ-2/3/4, OQ-17/18 | `tax_reports`, `orders` | Konsultan pajak |
| CO-1 | Fee cash-out (OQ-22) | `cashouts` | PO |
| FX-1 | Provider kurs + jadwal (OQ-26/28) | `exchange_rates.source` | PO |
| DSP-1 | Kategori + SLA dispute (OQ-29, sementara) | `disputes` | PO |
| INC-1 | Insentif I-4/I-5 | `merchant_credit` | PO |
| RSV-1 | Expiry reserve kalau order menggantung | `wallet_holds` | PO |
| AUD-1 | Taksonomi `audit_logs.target` | `audit_logs` | PO |
| OST-1 | `quotation` vs `placed` (bahasa status) | enum `orders.status` | PO |
| AUT-1 | Auth Super Admin & operator CS | `operators`, API auth | PO |
| MKT-1 | Scope marketing masuk MVP atau tidak | tabel `marketing` | PO |

## Risiko

1. **Portal live akan rusak.** Ganti-total berarti 4 portal Vercel tidak cocok dengan skema baru
   sampai M6 selesai. Mitigasi: kerjakan M2–M6 di branch terpisah; jangan merge ke `main` sebelum
   M8 lulus. `main` tetap melayani portal lama.
2. **Seed & akun demo ikut berubah.** Email `@sa7tein.app` → model user baru (nomor WA + Google).
   Akun demo lama tidak akan bisa login setelah M5.
3. **Ledger append-only sulit dibatalkan.** Salah bentuk `wallet_ledgers` mahal diperbaiki setelah
   ada data. M1 harus selesai dan ditinjau sebelum M3.
4. **Banyak task `blocked-by-decision`.** M0 wajib jalan lebih dulu; tanpa itu M3/M4 akan diisi
   tebakan yang melanggar aturan main.

## Di luar cakupan

- Konsol Super Admin (website penuh non-PWA) — belum ada requirement; cakupan sudah diputuskan
  tetapi prefix/route belum.
- UI/UX di repo `za7tein-pwa` — repo itu front-end saja (`AGENTS.md` §1).
