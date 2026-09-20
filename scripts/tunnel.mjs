// ============================================================
//  Sa7tein — Tunnel HTTPS untuk mencoba app di HP
//  Jalankan:  npm run tunnel
//  Mengekspos server demo lokal (:8080) melalui URL HTTPS publik
//  agar iPhone (atau perangkat lain) bisa membukanya dengan instal
//  PWA penuh + "Use my location".
//  Syarat: server demo berjalan (npm run demo) + cloudflared.
//  (Node 24: tanpa komentar '#' di sini.)
// ============================================================
import { spawn, spawnSync } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT = 8080;
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
};

function findCloudflared() {
  const onPath = spawnSync('cloudflared', ['--version'], { stdio: 'ignore' });
  if (onPath.status === 0) return 'cloudflared';
  const candidates = [path.join(os.homedir(), 'bin', 'cloudflared'), '/usr/local/bin/cloudflared', '/opt/homebrew/bin/cloudflared'];
  for (const bin of candidates) {
    if (fs.existsSync(bin)) return bin;
  }
  return null;
}

function serverUp() {
  return new Promise((resolve) => {
    const req = http.get({ host: 'localhost', port: PORT, path: '/customer/', timeout: 2500 }, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

const main = async () => {
  console.log(`${c.bold}${c.cyan}🔗 Sa7tein — HTTPS tunnel untuk coba di iPhone${c.reset}\n`);

  if (!(await serverUp())) {
    console.log(`${c.red}✖${c.reset} Server demo tidak berjalan di :${PORT}.`);
    console.log(`  Jalankan dulu: ${c.bold}npm run demo${c.reset}`);
    process.exit(1);
  }
  const bin = findCloudflared();
  if (!bin) {
    console.log(`${c.red}✖${c.reset} cloudflared tidak ditemukan.`);
    console.log(`  Install: ${c.bold}brew install cloudflared${c.reset}`);
    console.log(`  Atau unduh binary dari github.com/cloudflare/cloudflared`);
    process.exit(1);
  }

  console.log(`${c.green}✔${c.reset} Server demo aktif di :${PORT}`);
  console.log(`${c.green}✔${c.reset} Memulai tunnel HTTPS…\n`);

  const child = spawn(bin, ['tunnel', '--url', `http://localhost:${PORT}`, '--no-autoupdate'], { stdio: ['ignore', 'pipe', 'pipe'] });
  let printed = false;
  const onData = (buf) => {
    const m = /(https:\/\/[a-z0-9-]+\.trycloudflare\.com)/.exec(buf.toString());
    if (m && !printed) {
      printed = true;
      console.log(`${c.bold}${c.green}✅ Tunnel siap! Buka di iPhone (Safari):${c.reset}`);
      console.log(`  🛍️  Customer → ${c.cyan}${m[1]}/customer/${c.reset}`);
      console.log(`  👨‍🍳 Merchant → ${c.cyan}${m[1]}/merchant/${c.reset}`);
      console.log(`  🛵 Courier  → ${c.cyan}${m[1]}/courier/${c.reset}`);
      console.log(`\n${c.dim}HTTPS aktif → \"Add to Home Screen\" (PWA) & \"Use my location\" berfungsi.${c.reset}`);
      console.log(`${c.dim}Tunnel berjalan sampai dihentikan (Ctrl+C). URL berubah setiap restart.${c.reset}\n`);
    }
  };
  child.stdout.on('data', onData);
  child.stderr.on('data', onData);
  child.on('exit', (code) => {
    console.log(`\n${c.yellow}Tunnel berhenti (exit ${code}).${c.reset}`);
    process.exit(code ?? 0);
  });
  process.on('SIGINT', () => child.kill('SIGINT'));
};

main();
