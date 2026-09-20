// ============================================================
//  Sa7tein — Build semua APK Android debug dalam satu perintah
//  Jalankan:  npm run apk
//  Langkah per app: build mobile (SA7TEIN_MOBILE=1) → gradlew
//  assembleDebug → salin APK ke mobile-builds/.
//  Mendeteksi otomatis JDK 17+ (env JAVA_HOME, ~/.jdks, atau /Library/Java).
//  (Node 24.)
// ============================================================
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APPS = ['customer', 'merchant', 'courier'];
const OUT = path.join(root, 'mobile-builds');

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
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { stdio: 'inherit', ...opts });
    p.on('close', (code) => resolve(code ?? 1));
  });
}

function jdkMajor(home) {
  if (!home || !fs.existsSync(path.join(home, 'bin', 'javac'))) return 0;
  try {
    const r = spawnSync(path.join(home, 'bin', 'java'), ['-version'], { encoding: 'utf8' });
    const m = /version "(\d+)\./.exec(r.stderr || '');
    return m ? Number(m[1]) : 0;
  } catch {
    return 0;
  }
}

function findJdk() {
  const list = [];
  const dirs = [path.join(os.homedir(), '.jdks'), '/Library/Java/JavaVirtualMachines'];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const d of fs.readdirSync(dir)) {
      const cand = path.join(dir, d, 'Contents', 'Home');
      const maj = jdkMajor(cand);
      if (maj >= 17) list.push({ home: cand, maj });
    }
  }
  const envJ = process.env.JAVA_HOME;
  const envMaj = jdkMajor(envJ);
  if (envMaj >= 17) list.push({ home: envJ, maj: envMaj });
  if (list.length === 0) return null;
  // Prefer 17-19 (Gradle 8 / Capacitor 5); otherwise any 17+.
  const pref = list.filter((x) => x.maj >= 17 && x.maj <= 19).sort((a, b) => b.maj - a.maj)[0];
  return (pref || list.sort((a, b) => b.maj - a.maj)[0]).home;
}

console.log(`${c.bold}${c.cyan}🤖 Sa7tein — Build Android APK (customer, merchant, courier)${c.reset}\n`);

const jdk = findJdk();
if (!jdk) {
  console.log(`${c.red}✖${c.reset} JDK 17+ tidak ditemukan.`);
  console.log(`  Install JDK 17-19 (mis. Temurin) lalu atur: export JAVA_HOME=/path/jdk/Contents/Home`);
  console.log(`  Atau letakkan JDK di ~/.jdks atau /Library/Java/JavaVirtualMachines (dideteksi otomatis).`);
  process.exit(1);
}
console.log(`${c.green}✔${c.reset} Menggunakan JDK: ${jdk}\n`);

fs.mkdirSync(OUT, { recursive: true });
let okCount = 0;
let failCount = 0;

for (const app of APPS) {
  const appDir = path.join(root, 'apps', app);
  const androidDir = path.join(appDir, 'android');

  console.log(`\n${c.bold}${c.cyan}=== ${app} ===${c.reset}`);

  if (!fs.existsSync(androidDir)) {
    console.log(`${c.yellow}⚠${c.reset} Proyek android/ belum ada. Tambahkan dulu: npm run cap:add:android -w @sa7tein/${app}`);
    failCount++;
    continue;
  }

  // 1) Mobile web build (base '/', dist-mobile)
  console.log(`${c.dim}→ mobile build (dist-mobile)…${c.reset}`);
  const buildCode = await run('npm', ['run', 'build:mobile', '-w', `@sa7tein/${app}`], { cwd: root });
  if (buildCode !== 0) {
    console.log(`${c.red}✖${c.reset} Mobile build gagal untuk ${app}.`);
    failCount++;
    continue;
  }

  // 2) Gradle assembleDebug
  console.log(`${c.dim}→ gradlew assembleDebug…${c.reset}`);
  const gradleCode = await run(path.join(androidDir, 'gradlew'), ['assembleDebug'], {
    cwd: androidDir,
    env: { ...process.env, JAVA_HOME: jdk },
  });
  if (gradleCode !== 0) {
    console.log(`${c.red}✖${c.reset} Gradle build gagal untuk ${app}.`);
    failCount++;
    continue;
  }

  // 3) Copy APK
  const apk = path.join(androidDir, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
  if (!fs.existsSync(apk)) {
    console.log(`${c.red}✖${c.reset} APK tidak ditemukan untuk ${app}.`);
    failCount++;
    continue;
  }
  const target = path.join(OUT, `sa7tein-${app}-debug.apk`);
  fs.copyFileSync(apk, target);
  const kb = Math.round(fs.statSync(target).size / 1024);
  console.log(`${c.green}✔${c.reset} ${app}: ${c.bold}${target}${c.reset} (${kb} KB)`);
  okCount++;
}

console.log(`\n${c.bold}${c.cyan}Ringkasan:${c.reset} ${okCount} APK berhasil, ${failCount} gagal`);
console.log(`${c.dim}Output di folder mobile-builds/${c.reset}\n`);
process.exit(failCount ? 1 : 0);
