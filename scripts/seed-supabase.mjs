// ============================================================
//  Sa7tein — Seed data demo ke Supabase (cloud)
//  Idempotent: aman dijalankan berulang kali (tidak membuat duplikat).
//
//  Cara pakai:
//    1. Pastikan `.env` sudah berisi VITE_SUPABASE_URL & VITE_SUPABASE_ANON_KEY
//       DAN tambahkan satu baris lagi:
//         SUPABASE_SERVICE_ROLE_KEY=eyJ...
//       (Supabase Dashboard → Project Settings → API → service_role / secret key)
//    2. Jalankan:  npm run seed:supabase
//
//  Catatan keamanan: service_role adalah SECRET, hanya dipakai server-side
//  (script ini). JANGAN pernah dimasukkan ke kode frontend / aplikasi.
// ============================================================
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { seedMerchants, seedMenu, seedCouriers, seedUsers, DEMO_PASSWORD } from '../packages/shared/src/data/seed.js';

function loadEnv(file) {
  const env = {};
  try {
    const raw = readFileSync(file, 'utf8');
    for (const line of raw.split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq === -1) continue;
      const key = t.slice(0, eq).trim();
      let val = t.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      env[key] = val;
    }
  } catch {
    // file tidak ada
  }
  return env;
}

const env = loadEnv('.env');
const SUPABASE_URL = env.VITE_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

const missing = [];
if (!SUPABASE_URL) missing.push('VITE_SUPABASE_URL');
if (!env.VITE_SUPABASE_ANON_KEY) missing.push('VITE_SUPABASE_ANON_KEY');
if (!SERVICE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY');
if (missing.length) {
  console.error('✖ `.env` belum lengkap. Tambahkan baris berikut:');
  for (const k of missing) console.error(`   - ${k}=...`);
  console.error('  (Supabase Dashboard → Project Settings → API → service_role / secret key)');
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
});

const ok = (label, n) => console.log(`  ✓ ${label}${n !== undefined ? ` (${n})` : ''}`);
const fail = (label, e) => {
  console.error(`  ✖ ${label}: ${e.message}`);
  return false;
};

async function upsertRows(table, rows) {
  if (!rows || rows.length === 0) return 0;
  const { error } = await admin.from(table).upsert(rows, { onConflict: 'id' });
  if (error) throw error;
  return rows.length;
}

async function main() {
  console.log('\n🌱 Sa7tein — Seed Supabase');
  console.log(`   Project: ${SUPABASE_URL}\n`);

  // 1) Merchants
  console.log('1) Merchants');
  try {
    ok('seeded', await upsertRows('merchants', seedMerchants));
  } catch (e) {
    fail('merchants', e);
  }

  // 2) Menu items
  console.log('2) Menu items');
  try {
    const menu = seedMenu.map((m) => ({
      id: m.id,
      merchant_id: m.merchantId,
      name: m.name,
      description: m.description,
      price: m.price,
      category: m.category,
      stock: m.stock,
      image: m.image,
      photo: m.photo || null,
      available: m.available,
    }));
    ok('seeded', await upsertRows('menu_items', menu));
  } catch (e) {
    fail('menu_items', e);
  }

  // 3) Couriers — field online/lastSeenAt TIDAK ikut di-seed ulang agar status
  // online kurir yang sedang aktif tidak ter-reset saat seed dijalankan ulang.
  console.log('3) Couriers');
  try {
    const courierRows = seedCouriers.map(({ online, lastSeenAt, ...c }) => c);
    ok('seeded', await upsertRows('couriers', courierRows));
  } catch (e) {
    fail('couriers', e);
  }

  // 4) Demo accounts (Supabase Auth + profiles)
  console.log('4) Demo accounts (auth + profiles)');
  const { data: existing, error: luErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const byEmail = new Map();
  if (!luErr) for (const u of existing.users || []) byEmail.set(u.email, u);

  let created = 0;
  let already = 0;
  let failed = 0;
  for (const u of seedUsers) {
    const meta = {
      name: u.name,
      phone: u.phone || '',
      role: u.role,
      merchantId: u.merchantId || null,
      courierId: u.courierId || null,
    };
    let userId = byEmail.get(u.email)?.id || null;

    if (!userId) {
      const { data, error } = await admin.auth.admin.createUser({
        email: u.email,
        password: DEMO_PASSWORD,
        email_confirm: true,
        user_metadata: meta,
      });
      if (error) {
        failed++;
        console.error(`  ✖ ${u.email}: ${error.message}`);
        continue;
      }
      userId = data.user.id;
      created++;
    } else {
      already++;
    }

    const { error: pErr } = await admin.from('profiles').upsert(
      {
        id: userId,
        email: u.email,
        name: u.name,
        phone: u.phone || '',
        role: u.role,
        merchant_id: u.merchantId || null,
        courier_id: u.courierId || null,
      },
      { onConflict: 'id' },
    );
    if (pErr) {
      failed++;
      console.error(`  ✖ profile ${u.email}: ${pErr.message}`);
    } else {
      ok(u.email);
    }
  }
  console.log(`  → user baru: ${created}, sudah ada: ${already}, gagal: ${failed}`);

  console.log('\n✔ Selesai. Data demo siap dipakai.\n');
}

main().catch((e) => {
  console.error('✖ Gagal:', e.message);
  process.exit(1);
});
