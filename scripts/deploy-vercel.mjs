// ============================================================
//  Sa7tein — Deploy satu portal ke Vercel (monorepo-friendly)
//  Masalah: Vercel cloud build hanya meng-upload folder app, sehingga
//  package monorepo `@sa7tein/shared` tidak ketemu saat npm install.
//  Solusi: build LOKAL di repo root (monorepo utuh), lalu deploy hasilnya
//  dengan `vercel deploy --prebuilt` (hanya upload output build).
//
//  Usage:  node scripts/deploy-vercel.mjs <customer|merchant|courier|cs>
//  Prasyarat: sudah `vercel login`, dan env VITE_SUPABASE_* sudah di-set
//  di project Vercel (atau cukup dibaca dari `.env` lokal saat build).
// ============================================================
import { execSync } from 'node:child_process';
import { writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const app = process.argv[2];
const valid = ['customer', 'merchant', 'courier', 'cs'];
if (!valid.includes(app)) {
  console.error('Usage: node scripts/deploy-vercel.mjs <customer|merchant|courier|cs>');
  process.exit(1);
}

const root = process.cwd();
const project = `sa7tein-${app}`;

// Root vercel.json yang dipakai build dari repo root (sementara).
const vercelJson = {
  $schema: 'https://openapi.vercel.sh/vercel.json',
  framework: 'vite',
  buildCommand: `npm run build:vercel -w @sa7tein/${app}`,
  outputDirectory: `apps/${app}/dist`,
  rewrites: [{ source: '/(.*)', destination: '/index.html' }],
};

const run = (cmd) => {
  console.log(`\n$ ${cmd}`);
  execSync(cmd, { stdio: 'inherit', env: { ...process.env, PATH: `${process.env.HOME}/.nvm/versions/node/v24.18.0/bin:/usr/bin:/bin:/usr/sbin:/sbin` } });
};

const tmpJson = join(root, 'vercel.json');
const hadJson = existsSync(tmpJson);

try {
  if (!hadJson) writeFileSync(tmpJson, JSON.stringify(vercelJson, null, 2));

  console.log(`\n🚀 Deploy portal "${app}" ke Vercel (project ${project})...`);
  // 1) Link repo root ke project Vercel (env vars project sudah ada).
  run(`vercel link --yes --project ${project}`);
  // 2) Build lokal di repo root (monorepo utuh) untuk target PRODUCTION.
  run('vercel build --prod --yes');
  // 3) Deploy hasil build (prebuilt) ke PRODUCTION.
  run('vercel deploy --prod --prebuilt --yes');
  console.log(`\n✔ Deploy ${app} selesai.`);
} catch (e) {
  console.error('\n✖ Gagal deploy:', e.message);
  process.exitCode = 1;
} finally {
  if (!hadJson) rmSync(tmpJson, { force: true });
}
