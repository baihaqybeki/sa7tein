// ============================================================
//  Sa7tein — Dokter lingkungan
//  Jalankan:  npm run doctor
//  Mengecek Node, npm, JDK, Android SDK, Xcode, Capacitor dan
//  memberi tahu developer apa yang perlu diinstal. (Node 24: tanpa '#'.)
// ============================================================
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

let pass = 0;
let fail = 0;
let warn = 0;

function ok(msg) {
  pass++;
  console.log(`  ${c.green}✔${c.reset} ${msg}`);
}
function warn_(msg) {
  warn++;
  console.log(`  ${c.yellow}⚠${c.reset} ${msg}`);
}
function bad(msg) {
  fail++;
  console.log(`  ${c.red}✖${c.reset} ${msg}`);
}
function run(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}
function exists(p) {
  return fs.existsSync(p);
}
function major(v) {
  const m = /(\d+)\./.exec(v || '');
  return m ? Number(m[1]) : 0;
}

console.log(`${c.bold}${c.cyan}🧪 Sa7tein — Environment Doctor${c.reset}\n`);

// --- Node & npm ---
console.log(`${c.bold}Node / npm${c.reset}`);
const nodeV = run('node -v');
if (nodeV && major(nodeV) >= 20) ok(`Node ${nodeV} (butuh ≥ 20)`);
else if (nodeV) bad(`Node ${nodeV} terlalu lama — butuh ≥ 20.`);
else bad('Node tidak ditemukan — install dari https://nodejs.org');
const npmV = run('npm -v');
if (npmV) ok(`npm ${npmV}`);
else bad('npm tidak ditemukan');

// --- Dependencies installed? ---
console.log(`\n${c.bold}Dependencies${c.reset}`);
if (exists(path.join(root, 'node_modules'))) ok('node_modules ada (npm install sudah dijalankan)');
else warn_('node_modules belum ada — jalankan npm install');
const hasCap = exists(path.join(root, 'node_modules', '@capacitor', 'core'));
if (hasCap) ok('Capacitor terpasang');
else warn_('Capacitor belum terpasang — npm install (deps sudah di package.json)');

// --- JDK (untuk Android) ---
console.log(`\n${c.bold}Java / JDK (Android)${c.reset}`);
const jh = process.env.JAVA_HOME || '';
const javaV = run('java -version 2>&1');
const isJdk17 = (home) => {
  const javac = home && path.join(home, 'bin', 'javac');
  if (!javac || !exists(javac)) return false;
  const v = run(`"${path.join(home, 'bin', 'java')}" -version 2>&1`);
  return /version "(\d+)\./.test(v) && Number(/\d+/.exec(v)[0]) >= 17;
};
if (javaV && major(javaV.replace(/"/g, '')) >= 17 && javaV.includes('version')) ok(`Java ${javaV.trim().split('\n')[0]}`);
else {
  // scan ~/.jdks for a 17+ JDK
  const jdks = path.join(os.homedir(), '.jdks');
  let found = null;
  if (exists(jdks)) {
    for (const d of fs.readdirSync(jdks)) {
      const cand = path.join(jdks, d, 'Contents', 'Home');
      if (isJdk17(cand)) found = cand;
    }
  }
  if (found) {
    ok(`Ditemukan JDK 17+ di ${found}`);
    warn_('JAVA_HOME belum menunjuk ke sana — gunakan: export JAVA_HOME="' + found + '"');
  } else if (javaV) {
    bad(`Java terdeteksi namun bukan JDK 17+ (${javaV.trim().split('\n')[0]}) — Android butuh JDK 17+ (mis. Temurin).`);
  } else {
    bad('Java tidak ditemukan — install JDK 17+ untuk build Android.');
  }
}

// --- Android SDK ---
console.log(`\n${c.bold}Android SDK${c.reset}`);
const sdk = process.env.ANDROID_HOME || path.join(os.homedir(), 'Library', 'Android', 'sdk');
if (exists(sdk)) {
  ok(`ANDROID_HOME → ${sdk}`);
  const platforms = exists(path.join(sdk, 'platforms', 'android-36')) || exists(path.join(sdk, 'platforms', 'android-33'));
  const bt = exists(path.join(sdk, 'build-tools', '36.0.0')) || exists(path.join(sdk, 'build-tools', '33.0.2'));
  const adb = exists(path.join(sdk, 'platform-tools', 'adb'));
  if (platforms) ok('Android platform 33/36 ada');
  else warn_('Android platform 33/36 belum ada — jalankan: sdkmanager "platforms;android-33"');
  if (bt) ok('build-tools 33/36 ada');
  else warn_('build-tools 33/36 belum ada — sdkmanager "build-tools;33.0.2"');
  if (adb) ok('platform-tools (adb) ada');
  else warn_('platform-tools belum ada');
} else {
  bad('Android SDK tidak ditemukan — install Android Studio + SDK platform 33/36.');
}

// --- Xcode / iOS ---
console.log(`\n${c.bold}iOS (Xcode)${c.reset}`);
const xcode = run('xcodebuild -version 2>&1');
if (xcode) ok(xcode.split('\n')[0]);
else warn_('Xcode belum terpasang — proyek iOS sudah dibuat, tapi build butuh Xcode di macOS.');

// --- Supabase config ---
console.log(`\n${c.bold}Supabase (opsional)${c.reset}`);
const envFile = path.join(root, '.env');
if (exists(envFile)) {
  const txt = fs.readFileSync(envFile, 'utf8');
  if (txt.includes('VITE_SUPABASE_URL=') && !/VITE_SUPABASE_URL=$/.test(txt)) ok('.env terisi → mode cloud aktif');
  else warn_('.env ada tapi Supabase belum diisi → mode lokal.');
} else {
  warn_('Tidak ada .env → mode lokal (localStorage + BroadcastChannel).');
}

// --- Demo server ---
console.log(`\n${c.bold}Demo server (:8080)${c.reset}`);
const up = run('curl -s -o /dev/null -w %{http_code} http://localhost:8080/customer/');
if (up === '200') ok('Server demo aktif di http://localhost:8080');
else warn_('Server demo tidak berjalan — jalankan npm run demo');

// --- Summary ---
console.log(`\n${c.bold}${c.cyan}Ringkasan:${c.reset} ${c.green}${pass} ok${c.reset}, ${c.yellow}${warn} warning${c.reset}, ${c.red}${fail} error${c.reset}`);
if (fail === 0) console.log(`${c.bold}${c.green}Lingkungan siap untuk development.${c.reset}\n`);
else console.log(`${c.bold}${c.yellow}Ada beberapa hal yang perlu diperbaiki sebelum build Android.${c.reset}\n`);
