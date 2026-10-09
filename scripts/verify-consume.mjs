// ============================================================
//  Verifikasi "DB bisa dikonsumsi" — dijalankan ke Supabase CLOUD.
//
//  Membuktikan 4 hal yang menentukan apakah frontend baru bisa memakai DB:
//    1. TULIS  : customer bisa membuat order (policy insert + kolom NOT NULL terisi)
//    2. BACA   : pihak yang terlibat melihat order itu, pihak lain TIDAK (RLS)
//    3. OPS    : CS/Super Admin melihat lintas tenant (app_is_ops)
//    4. REALTIME: event INSERT benar-benar sampai ke klien
//
//  Data uji dibersihkan lagi di akhir (pakai service role), jadi DB tidak
//  ditinggalkan kotor.
//
//  Pemakaian:  node scripts/verify-consume.mjs
//  Exit 1 bila ada langkah yang gagal.
// ============================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function env(name) {
  const p = path.join(ROOT, '.env');
  if (!fs.existsSync(p)) return '';
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    if (line.startsWith(name + '=')) return line.slice(name.length + 1).trim().replace(/^["']|["']$/g, '');
  }
  return '';
}

const URL_ = env('VITE_SUPABASE_URL');
const ANON = env('VITE_SUPABASE_ANON_KEY');
const SERVICE = env('SUPABASE_SERVICE_ROLE_KEY');
const PASSWORD = process.env.DEMO_PASSWORD || 'demo1234';

const results = [];
const check = (label, ok, detail = '') => {
  results.push({ label, ok });
  console.log(`  ${ok ? 'ok   ' : 'GAGAL'} ${label}${detail ? ` — ${detail}` : ''}`);
};

async function signIn(email) {
  const c = createClient(URL_, ANON, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`login ${email}: ${error.message}`);
  return { client: c, token: data.session.access_token };
}

async function rest(token, pathAndQuery) {
  const r = await fetch(`${URL_}/rest/v1/${pathAndQuery}`, {
    headers: { apikey: ANON, Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  const body = await r.text();
  return { status: r.status, body: body ? JSON.parse(body) : null };
}

const admin = () => createClient(URL_, SERVICE, { auth: { persistSession: false } });

async function main() {
  if (!URL_ || !ANON || !SERVICE) {
    console.log('SKIP: .env belum lengkap (butuh VITE_SUPABASE_URL, ANON_KEY, SERVICE_ROLE_KEY)');
    return 0;
  }
  console.log(`project: ${URL_.replace('https://', '')}\n`);

  // ---------- 1. siapkan konteks sebagai customer ----------
  console.log('1. konteks customer (tulis)');
  const cust = await signIn('customer@sa7tein.app');
  const me = await rest(cust.token, 'users?select=id,role,customers(id,name)&limit=1');
  const customerId = me.body?.[0]?.customers?.id;
  check('customer membaca profilnya sendiri (users + customers)', !!customerId, `customer_id=${customerId}`);

  const addr = await rest(cust.token, 'addresses?select=id,address&order=is_default.desc&limit=1');
  const addressId = addr.body?.[0]?.id;
  check('customer membaca buku alamatnya', !!addressId, `address_id=${addressId}`);

  const merch = await rest(cust.token, 'merchants?select=id,store_name&tenant_status=eq.approved&limit=1');
  const merchantId = merch.body?.[0]?.id;
  check('customer membaca katalog merchant (publik)', !!merchantId, merch.body?.[0]?.store_name);

  const menu = await rest(cust.token, 'menus?select=id,name,price_jod&limit=1');
  const item = menu.body?.[0];
  check('customer membaca menu (publik)', !!item, item ? `${item.name} = ${item.price_jod} JOD` : '');

  if (!customerId || !addressId || !merchantId || !item) {
    console.log('\nHASIL: GAGAL — konteks dasar tidak lengkap, sisanya dilewati');
    return 1;
  }

  // ---------- 2. realtime: pasang dulu, baru tulis ----------
  console.log('\n2. realtime (pasang langganan sebelum menulis)');
  const rt = createClient(URL_, ANON, { auth: { persistSession: false } });
  await rt.auth.setSession({ access_token: cust.token, refresh_token: 'x' }).catch(() => {});
  let gotEvent = null;
  const channel = rt
    .channel('verify-orders')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, (p) => {
      gotEvent = p.new;
    })
    .subscribe();
  await new Promise((r) => setTimeout(r, 2500));   // beri waktu WS tersambung

  // ---------- 3. tulis order ----------
  console.log('\n3. tulis order (pembuktian jalur tulis + policy insert)');
  const price = Number(item.price_jod);
  const row = {
    code: 'SA-VERIFY-' + Date.now(),
    status: 'quotation',
    customer_id: customerId,
    merchant_id: merchantId,
    delivery_address_id: addressId,
    sub_total_jod: price,
    delivery_fee_jod: 1.5,
    platform_fee_jod: 0.37,
    total_jod: price + 1.5 + 0.37,
    payment_method: 'cod',
  };
  const ins = await fetch(`${URL_}/rest/v1/orders`, {
    method: 'POST',
    headers: {
      apikey: ANON, Authorization: `Bearer ${cust.token}`,
      'Content-Type': 'application/json', Prefer: 'return=representation',
    },
    body: JSON.stringify(row),
  });
  const inserted = await ins.json();
  const orderId = Array.isArray(inserted) ? inserted[0]?.id : undefined;
  check('customer membuat order (policy insert customer)', ins.status < 300 && !!orderId,
    ins.status < 300 ? `order_id=${orderId}` : JSON.stringify(inserted).slice(0, 160));
  if (!orderId) {
    await rt.removeChannel(channel);
    return 1;
  }

  await new Promise((r) => setTimeout(r, 4000));
  check('realtime INSERT orders sampai ke klien', !!gotEvent,
    gotEvent ? `diterima untuk order_id=${gotEvent.id}` : 'tidak ada event dalam 4s');
  await rt.removeChannel(channel);

  // ---------- 4. RLS lintas pihak ----------
  console.log('\n4. RLS: siapa yang boleh melihat order itu');
  const custSee = await rest(cust.token, `orders?select=id&id=eq.${orderId}`);
  check('customer melihat order miliknya', custSee.body?.length === 1);

  const merc = await signIn('merchant@sa7tein.app');
  const mercSee = await rest(merc.token, `orders?select=id,code,status,total_jod&id=eq.${orderId}`);
  check('merchant pemilik melihat order masuk', mercSee.body?.length === 1,
    mercSee.body?.[0] ? `${mercSee.body[0].code} ${mercSee.body[0].status} ${mercSee.body[0].total_jod} JOD` : '');

  const cour = await signIn('courier@sa7tein.app');
  const courSee = await rest(cour.token, `orders?select=id&id=eq.${orderId}`);
  check('kurir BELUM melihat order (belum ditugaskan) — sesuai RLS', courSee.body?.length === 0,
    `terlihat=${courSee.body?.length}`);

  const cs = await signIn('cs@sa7tein.app');
  const csSee = await rest(cs.token, `orders?select=id&id=eq.${orderId}`);
  check('CS melihat order lintas tenant (app_is_ops)', csSee.body?.length === 1);

  // ---------- 5. bersihkan ----------
  console.log('\n5. bersihkan data uji');
  const db = admin();
  const del = await db.from('orders').delete().eq('id', orderId);
  check('data uji terhapus (tanpa meninggalkan sampah)', !del.error, del.error?.message || '');
  const left = await rest(SERVICE, `orders?select=id&id=eq.${orderId}`);
  check('order uji benar-benar tidak ada lagi', left.body?.length === 0);

  const failed = results.filter((r) => !r.ok).length;
  console.log('\n' + '-'.repeat(66));
  console.log(failed === 0
    ? `HASIL: LULUS — ${results.length} pemeriksaan, DB siap dikonsumsi`
    : `HASIL: GAGAL — ${failed} dari ${results.length} pemeriksaan`);
  return failed === 0 ? 0 : 1;
}

main()
  .then((c) => process.exit(c))
  .catch((e) => {
    console.error('\nERROR:', e.message);
    process.exit(1);
  });
