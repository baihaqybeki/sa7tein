// ============================================================
//  Sa7tein — Panduan handover (serah terima)
//  Jalankan:  npm run handover
//  Menampilkan quick-start ringkas + petunjuk untuk developer baru
//  yang mengambil alih project. (Node 24: tanpa komentar '#' di sini.)
// ============================================================
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  magenta: '\x1b[35m',
  red: '\x1b[31m',
};

const line = (s = '') => console.log(s);
const h1 = (s) => line(`\n${c.bold}${c.cyan}${s}${c.reset}`);
const h2 = (s) => line(`\n${c.bold}${s}${c.reset}`);
const kv = (k, v) => line(`  ${c.green}${k}${c.reset}  ${v}`);
const cmd = (k, v) => line(`  ${c.magenta}${k}${c.reset}  ${c.dim}${v}${c.reset}`);

line(`${c.bold}${c.green}🍽️  Sa7tein — Handover Guide${c.reset}`);
line(`${c.dim}Monorepo: 4 portals (Customer / Merchant / Courier / CS) + shared package${c.reset}`);

h1('1) Satu menit memahami arsitektur');
line('  React 18 + Vite 5 + Tailwind 3 + Zustand + React Router + Leaflet + Supabase + Capacitor.');
kv('apps/', '4 aplikasi web terpisah (customer / merchant / courier / cs)');
kv('packages/shared/', 'Kode bersama: store, backend, helper geo, komponen UI');
kv('Backend', 'Auto-pilih: Supabase (cloud) atau Local (localStorage + BroadcastChannel)');
kv('Native', 'Android & iOS via Capacitor (folder android/ + ios/ tiap app)');

h1('2) Quick start');
cmd('npm install', '# install semua workspace');
cmd('npm run dev', '# jalankan 4 portal dev (:5173/5174/5175/5176)');
cmd('npm run demo', '# build + serve satu origin di :8080 (realtime lokal tersinkron) → /cs/ juga');
cmd('npm run tunnel', '# HTTPS tunnel (cloudflared) → coba di iPhone/PWA + geolokasi');
cmd('npm run doctor', '# cek lingkungan (node/java/android-sdk/xcode)');
cmd('npm run handover', '# panduan ini');

h1('3) Akun demo (password: demo1234)');
kv('Customer', 'customer@sa7tein.app');
kv('Merchant', 'merchant@sa7tein.app · merchant2@sa7tein.app · merchant3@sa7tein.app');
kv('Courier', 'courier@sa7tein.app · courier2@sa7tein.app · courier3@sa7tein.app');
kv('CS', 'cs@sa7tein.app (monitoring & manajemen transaksi lintas semua merchant)');

h1('4) Alur demo (4 tab browser, satu origin)');
line('  1. Customer: pilih restoran → keranjang → checkout (pin peta) → Place Order');
line('  2. Merchant: terima → mulai persiapan → siap → otomatis menawarkan ke kurir');
line('  3. Courier: terima offer → Start Delivery → simulasi berjalan → selesai');
line('  4. Customer: lihat pelacakan live + chat dengan merchant/kurir');
line('  5. CS (opsional): pantau semua order di /cs/ → batalkan, tugaskan kurir, selesai manual');

h1('5) Build & native');
cmd('npm run build', '# build web semua portal → apps/*/dist');
cmd('npm run mobile', '# build mobile (base /, dist-mobile, tanpa PWA)');
cmd('npm run cap:sync', '# build mobile + salin aset ke android/ & ios/ (semua app)');
cmd('npm run apk', '# build 3 APK Android debug sekaligus → mobile-builds/');
cmd('npm run ipa', '# build .ipa iOS (butuh Xcode + signing) → mobile-builds/ios/');
cmd('  HP: buka /apk/ di server', '# unduh APK langsung di HP (http://<ip-mac>:8080/apk/ atau via tunnel)');
cmd('npm run cap:android -w @sa7tein/customer', '# buka di Android Studio');
cmd('npm run cap:ios -w @sa7tein/customer', '# buka di Xcode (butuh Xcode)');

h1('6) Dokumentasi');
kv('docs/SRS.md', 'Software Requirements Specification');
kv('docs/FSD.md', 'Functional Specification Document');
kv('README.md', 'Panduan lengkap menjalankan & deploy');
kv('supabase/schema.sql', 'Skema database cloud');

h1('7) Gotcha yang sudah diketahui');
line(`  ${c.yellow}⚠${c.reset} Node 24 menolak komentar '#' di file .mjs — pakai '//'.`);
line(`  ${c.yellow}⚠${c.reset} Mode lokal hanya tersinkron antar portal bila satu origin (pakai npm run demo).`);
line(`  ${c.yellow}⚠${c.reset} Build APK butuh JDK 21 + Android SDK 36; cek dengan npm run doctor.`);
line(`  ${c.yellow}⚠${c.reset} Build iOS butuh Xcode (belum terpasang di mesin ini).`);
line(`  ${c.yellow}⚠${c.reset} Browser dengan PWA bisa menyajikan bundle lama — hard refresh / unregister SW.`);

h1('8) Fitur yang sudah ada');
line('  Foto (menu/resto/kurir) · peta & autocomplete alamat · buka/tutup toko dengan auto-cancel');
line('  akun per kurir · profil + verifikasi email/telepon · chat per order (3 channel) ·');
line('  identitas merchant tunggal · PWA · native Android/iOS (Capacitor) ·');
line('  portal CS: monitoring order lintas merchant + transaksi (status bayar simulasi) ·');
line('  penawaran kurir HANYA untuk kurir yang online (dropdown manual Online/Offline) ·');
line('  live tracking pakai GPS sungguhan (fallback simulasi) · penyelesaian delivery manual ·');
line('  notifikasi "pesanan hampir tiba" ke customer dari estimasi waktu pengiriman.');

line(`\n${c.bold}${c.green}Selamat bekerja! 🚀${c.reset}\n`);
