// ============================================================
//  Sa7tein — Build iOS .ipa untuk tiap app (Customer/Merchant/Courier)
//  Jalankan:  npm run ipa            → build ketiga app
//             npm run ipa -- customer → build hanya app itu
//  Syarat: Xcode terpasang + Signing Team sudah diatur (Apple ID)
//  di tiap project Xcode (Signing & Capabilities → Team).
//  (Node 24: tanpa komentar '#' di sini.)
// ============================================================
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APPS = ['customer', 'merchant', 'courier'];
const TARGET = process.argv[2] || null;
const apps = TARGET ? APPS.filter((a) => a === TARGET) : APPS;

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
};

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', ...opts });
  return r.status ?? 1;
}

function hasXcode() {
  try {
    return spawnSync('xcodebuild', ['-version'], { stdio: 'ignore' }).status === 0;
  } catch {
    return false;
  }
}

function findNpm() {
  const candidates = ['npm', '/Users/muhammadbaihaqy/.nvm/versions/node/v24.18.0/bin/npm', '/opt/homebrew/bin/npm', '/usr/local/bin/npm'];
  for (const bin of candidates) {
    try {
      if (spawnSync(bin, ['--version'], { stdio: 'ignore' }).status === 0) return bin;
    } catch {
      // coba yang berikutnya
    }
  }
  return null;
}

function findIpa(dir) {
  if (!fs.existsSync(dir)) return null;
  const found = [];
  const walk = (d) => {
    for (const f of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, f.name);
      if (f.isDirectory()) walk(p);
      else if (f.name.endsWith('.ipa')) found.push(p);
    }
  };
  walk(dir);
  return found[0] || null;
}

console.log(`${c.bold}${c.cyan}🍎 Sa7tein — Build iOS .ipa${c.reset}\n`);
console.log(`${c.dim}Target: ${apps.join(', ')}${c.reset}\n`);

if (!hasXcode()) {
  console.log(`${c.red}✖ Xcode belum terpasang di mesin ini.${c.reset}`);
  console.log(`   .ipa hanya bisa dibuat dengan Xcode (macOS).`);
  console.log(`\n${c.bold}Langkah:${c.reset}`);
  console.log(`  1. Install Xcode dari App Store (gratis, ±12 GB).`);
  console.log(`  2. Buka sekali: xcode-select -p  → pastikan mengarah ke /Applications/Xcode.app`);
  console.log(`  3. Login akun Apple di Xcode (Preferences → Accounts).`);
  console.log(`  4. Untuk tiap app, buka apps/*/ios/App/App.xcworkspace lalu`);
  console.log(`     Signing & Capabilities → pilih Team (Apple ID / Personal Team).`);
  console.log(`  5. Jalankan lagi: ${c.bold}npm run ipa${c.reset}`);
  console.log(`\n${c.dim}Atau tanpa Xcode, gunakan PWA dari tunnel HTTPS (Add to Home Screen) di iPhone.${c.reset}`);
  process.exit(1);
}

const npm = findNpm();
const iosOut = path.join(root, 'mobile-builds', 'ios');
fs.mkdirSync(iosOut, { recursive: true });
let okCount = 0;
let failCount = 0;

for (const app of apps) {
  const iosDir = path.join(root, 'apps', app, 'ios', 'App');
  const workspace = path.join(iosDir, 'App.xcworkspace');
  const plist = path.join(root, 'apps', app, 'ios', 'ExportOptions.plist');
  console.log(`\n${c.bold}${c.cyan}=== ${app} ===${c.reset}`);

  if (!fs.existsSync(workspace)) {
    console.log(`${c.yellow}⚠${c.reset} Proyek iOS belum ada. Jalankan: npm run cap:add:ios -w @sa7tein/${app}`);
    failCount++;
    continue;
  }

  // Segarkan aset web ke project iOS
  if (npm) {
    console.log(`${c.dim}→ cap:sync (salin web assets ke ios/)…${c.reset}`);
    const syncCode = run(npm, ['run', 'cap:sync', '-w', `@sa7tein/${app}`], { cwd: root });
    if (syncCode !== 0) {
      console.log(`${c.yellow}⚠${c.reset} cap:sync gagal — lanjut pakai aset yang ada.`);
    }
  }

  const archive = path.join(iosOut, `${app}.xcarchive`);
  const exportDir = path.join(iosOut, app);
  fs.rmSync(archive, { recursive: true, force: true });
  fs.rmSync(exportDir, { recursive: true, force: true });

  // Archive — coba pakai provisioning profile yang sudah tersimpan (offline).
  // Kalau gagal (profil belum ada / kedaluwarsa), retry dengan izin update dari
  // Apple (-allowProvisioningUpdates, butuh login Xcode yang valid).
  console.log(`${c.dim}→ xcodebuild archive…${c.reset}`);
  let archCode = run('xcodebuild', ['-workspace', workspace, '-scheme', 'App', '-configuration', 'Release', '-destination', 'generic/platform=iOS', '-archivePath', archive, 'archive'], { cwd: iosDir });
  if (archCode !== 0) {
    console.log(`${c.yellow}→ retry archive dengan -allowProvisioningUpdates…${c.reset}`);
    archCode = run('xcodebuild', ['-workspace', workspace, '-scheme', 'App', '-configuration', 'Release', '-destination', 'generic/platform=iOS', '-archivePath', archive, 'archive', '-allowProvisioningUpdates'], { cwd: iosDir });
  }
  if (archCode !== 0) {
    console.log(`${c.red}✖${c.reset} Archive gagal. Pastikan Team/Signing sudah diatur di Xcode.`);
    failCount++;
    continue;
  }

  // Ekspor .ipa
  console.log(`${c.dim}→ xcodebuild export .ipa…${c.reset}`);
  let expCode = run('xcodebuild', ['-exportArchive', '-archivePath', archive, '-exportOptionsPlist', plist, '-exportPath', exportDir], { cwd: iosDir });
  if (expCode !== 0) {
    console.log(`${c.yellow}→ retry export dengan -allowProvisioningUpdates…${c.reset}`);
    expCode = run('xcodebuild', ['-exportArchive', '-archivePath', archive, '-exportOptionsPlist', plist, '-exportPath', exportDir, '-allowProvisioningUpdates'], { cwd: iosDir });
  }
  const ipa = findIpa(exportDir);
  if (expCode !== 0 || !ipa) {
    console.log(`${c.red}✖${c.reset} Export .ipa gagal. Pastikan Team/Signing sudah diatur di Xcode.`);
    failCount++;
    continue;
  }
  // Salin dengan nama yang jelas: sa7tein-<app>.ipa
  const finalPath = path.join(iosOut, `sa7tein-${app}.ipa`);
  fs.copyFileSync(ipa, finalPath);
  const kb = Math.round(fs.statSync(finalPath).size / 1024);
  console.log(`${c.green}✔${c.reset} ${app}: ${c.bold}${finalPath}${c.reset} (${kb} KB)`);
  okCount++;
}

console.log(`\n${c.bold}${c.cyan}Ringkasan:${c.reset} ${okCount} .ipa berhasil, ${failCount} gagal`);
console.log(`${c.dim}Output di folder mobile-builds/ios/${c.reset}`);
if (okCount) {
  console.log(`\n${c.dim}Install .ipa: buka di Xcode → Devices, atau pakai Sideloadly/AltStore.${c.reset}`);
}
console.log('');
process.exit(failCount ? 1 : 0);
