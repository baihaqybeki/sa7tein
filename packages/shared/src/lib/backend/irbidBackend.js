// ============================================================
//  Backend Supabase — SKEMA BARU (ERD Irbid, 42 tabel) — M6
//
//  Adapter ini menulis & membaca tabel ternormalisasi (docs/backend/ERD.md),
//  BUKAN lagi `orders.data` (jsonb) atau `profiles`/`settings`.
//
//  Aktif hanya bila `VITE_SCHEMA=irbid` (lihat lib/backend/index.js), supaya
//  4 portal produksi yang masih memakai skema lama tidak ikut berubah.
//
//  Bentuk objek yang dikembalikan SENGAJA tetap memuat nama field lama
//  (subtotal, courierCost, restaurantId, status legacy, …) sekaligus field
//  baru (subTotalJod, zoneCode, holdStatus, …). Alasannya: UI 4 portal belum
//  dimigrasikan, jadi data layer bisa ditukar lebih dulu tanpa memecah layar.
//  Kolom `statusNew` selalu berisi status skema baru yang sebenarnya.
//
//  CATATAN PENTING (jangan dianggap selesai):
//   • OST-1 — enum status baru (8 nilai) TIDAK bisa membedakan seluruh status
//     lama (9 nilai). Mapping di bawah bersifat MENYUSUTKAN: 'accepted' dan
//     'preparing' sama-sama menjadi 'prepare'. Perlu keputusan PO.
//   • Mata uang: nilai uang kini JOD. UI masih memformat Rupiah → tampilan
//     salah sampai pass UI JOD dikerjakan (bagian dari M6 lanjutan / M8).
//   • Reserve/hold (wallet) belum dibuat otomatis saat order: customer demo
//     belum punya saldo. Jalur top-up + reserve menyusul bersama UI wallet.
// ============================================================
import { supabase } from '../supabaseClient.js';
import { seedCouriers, seedMenu, seedMerchants } from '../../data/seed.js';

// ------------------------------------------------------------
//  Konversi nilai
// ------------------------------------------------------------
// Postgres `numeric` dikembalikan sebagai string oleh PostgREST — wajib diubah.
const num = (v, fallback = 0) => (v === null || v === undefined ? fallback : Number(v));
const toMs = (ts) => (ts ? new Date(ts).getTime() : null);
const toIso = (ms) => (ms ? new Date(ms).toISOString() : null);

// ------------------------------------------------------------
//  Mapping status — legacy (UI sekarang) ↔ skema baru (ERD)
//  Sumber status baru: docs/backend/ERD.md §4 (orders.status)
//  Sumber status lama : repo referensi §2 (pending…cancelled)
//  UNRESOLVED OST-1: 9 → 8 nilai, jadi ada yang menyusut (accepted+preparing).
// ------------------------------------------------------------
const LEGACY_TO_NEW = {
  pending: 'quotation',      // order masuk antrean merchant
  accepted: 'prepare',       // ⚠️ menyusut: 'accepted' & 'preparing' sama-sama 'prepare'
  preparing: 'prepare',
  ready: 'waitingCourier',
  picked_up: 'waitingDelivery',
  on_the_way: 'delivery',
  delivered: 'done',
  rejected: 'canceled',
  cancelled: 'canceled',
};
const NEW_TO_LEGACY = {
  cart: 'pending',
  quotation: 'pending',
  prepare: 'preparing',
  waitingCourier: 'ready',
  waitingDelivery: 'picked_up',
  delivery: 'on_the_way',
  done: 'delivered',
  canceled: 'cancelled',
};
const toNewStatus = (s) => LEGACY_TO_NEW[s] || s;
const toLegacyStatus = (s) => NEW_TO_LEGACY[s] || s;

// pembayaran: legacy 'cod' | 'transfer' | 'wallet' → skema baru
const PAYMENT_TO_NEW = { cod: 'cod', transfer: 'transfer', wallet: 'xendit_qris' };

// ------------------------------------------------------------
//  Bentuk objek (mapper)
// ------------------------------------------------------------
function mapMerchant(r) {
  return {
    id: r.id,
    name: r.store_name,
    storeName: r.store_name,
    address: r.store_address || '',
    storeAddress: r.store_address || '',
    lat: r.latitude,
    lng: r.longitude,
    // kolom emoji/category tidak ada di draft → lihat ERD §8 butir 4 (butuh keputusan)
    emoji: '🍽️',
    category: null,
    photo: r.photo || null,
    open: r.available,
    available: r.available,
    deliveryConfig: r.delivery_config || {},
    tenantStatus: r.tenant_status,
    depositJod: num(r.deposit_jod),
    depositStatus: r.deposit_status,
  };
}

function mapMenu(r, variants = []) {
  return {
    id: r.id,
    merchantId: r.merchant_id,
    name: r.name,
    description: r.description || '',
    price: num(r.price_jod),          // legacy name (UI lama)
    priceJod: num(r.price_jod),
    category: r.category || null,     // kolom legacy, lihat ERD §8 butir 4
    stock: r.stock,                   // kolom legacy; null = stok tak dilacak
    image: r.image || null,
    photo: r.photo || null,
    available: r.available,
    variants: variants.map(mapVariant),
  };
}

function mapVariant(v) {
  return {
    id: v.id,
    menuId: v.menu_id,
    name: v.name,
    required: v.required,
    maxSelect: v.max_select,
    options: (v.options || []).map((o) => ({
      id: o.id,
      name: o.name,
      priceDelta: num(o.priceDeltaJod),
    })),
  };
}

function mapCourier(r) {
  return {
    id: r.id,
    name: r.name,
    phone: '',
    vehicle: r.vehicle || null,
    status: r.availability,
    availability: r.availability,
    lat: r.latitude,
    lng: r.longitude,
    photo: r.photo || null,
    merchantId: r.merchant_id,
    // UI lama memakai boolean `online`; sekarang turunan dari availability
    online: r.availability === 'available',
    lastSeenAt: toMs(r.last_seen_at),
  };
}

function mapOrder(r) {
  const m = r.merchants || {};
  const c = r.couriers || {};
  const cust = r.customers || {};
  const addr = r.addresses || {};
  const items = (r.order_items || []).map((it) => ({
    // legacy
    itemId: it.menu_id,
    name: it.name,
    price: num(it.unit_price_jod),
    qty: it.qty,
    note: it.note || '',
    image: null,
    photo: null,
    // baru
    orderId: it.order_id,
    menuId: it.menu_id,
    unitPriceJod: num(it.unit_price_jod),
    modifiers: it.modifiers || [],
    lineTotalJod: num(it.line_total_jod),
  }));

  return {
    id: r.id,
    code: r.code,
    // status: legacy untuk UI, `statusNew` = kebenaran skema baru
    status: toLegacyStatus(r.status),
    statusNew: r.status,
    createdAt: toMs(r.created_at),
    placedAt: toMs(r.placed_at),
    statusTimestamps: {},
    // pihak
    customerId: r.customer_id,
    customerName: cust.name || '',
    customerAddress: addr.address || '',
    customerLat: addr.latitude ?? null,
    customerLng: addr.longitude ?? null,
    restaurantId: r.merchant_id,
    restaurantName: m.store_name || '',
    restaurantLat: m.latitude ?? null,
    restaurantLng: m.longitude ?? null,
    restaurantPhoto: m.photo || null,
    courierId: r.courier_id,
    courierName: c.name || '',
    courierPhoto: c.photo || null,
    courierLat: c.latitude ?? null,
    courierLng: c.longitude ?? null,
    remainingMeters: null,
    // uang — legacy + baru
    subtotal: num(r.sub_total_jod),
    courierCost: num(r.delivery_fee_jod),
    total: num(r.total_jod),
    subTotalJod: num(r.sub_total_jod),
    deliveryFeeJod: num(r.delivery_fee_jod),
    platformFeeJod: num(r.platform_fee_jod),
    tipJod: num(r.tip_jod),
    promoAmountJod: num(r.promo_amount_jod),
    totalJod: num(r.total_jod),
    totalIdr: r.total_idr === null ? null : num(r.total_idr),
    zoneCode: r.zone_code,
    promoId: r.promo_id,
    // pembayaran & reserve
    payment: r.payment_method,
    paymentMethod: r.payment_method,
    paymentStatus: r.payment_status,
    paidAt: toMs(r.paid_at),
    holdStatus: r.hold_status,
    // pembatalan
    cancelReason: r.cancel_reason,
    cancelBy: r.cancel_by,
    orderNote: r.order_note,
    prepTimeMinutes: null,
    items,
  };
}

function mapMessage(r) {
  return {
    id: r.id,
    orderId: r.chat?.order_id ?? r.orderId ?? null,
    channel: r.channel,
    senderId: r.sender_id,
    senderName: r.sender?.name || r.senderName || '',
    senderRole: r.sender?.role || '',
    text: r.body,
    createdAt: toMs(r.at),
  };
}

const ORDER_SELECT = `*,
  order_items(*),
  merchants(store_name, store_address, latitude, longitude, photo),
  couriers(name, latitude, longitude, photo),
  customers(name),
  addresses(address, latitude, longitude)`;

// ------------------------------------------------------------
//  Auth → tabel `users` + profil per peran
// ------------------------------------------------------------
async function loadUserRow(authUserId) {
  const { data, error } = await supabase
    .from('users')
    .select('*, customers(*), merchants(*), couriers(*)')
    .eq('auth_user_id', authUserId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

function toPublicUser(u) {
  if (!u) return null;
  const merchant = u.merchants || null;
  const courier = u.couriers || null;
  const customer = u.customers || null;
  // Nama & alamat tunggal per peran (satu sumber kebenaran, seperti skema lama).
  let name = customer?.name || '';
  let address = '';
  if (u.role === 'merchant' && merchant) {
    name = merchant.store_name;
    address = merchant.store_address || '';
  } else if (u.role === 'courier' && courier) {
    name = courier.name;
  }
  return {
    id: u.id,
    authUserId: u.auth_user_id,
    name,
    email: u.email || '',
    phone: u.phone || '',
    role: u.role,
    verified: u.verified,
    status: u.status,
    merchantId: merchant?.id ?? null,
    courierId: courier?.id ?? null,
    customerId: customer?.id ?? null,
    address,
  };
}

async function ensureWallet(userId) {
  const { data } = await supabase.from('wallets').select('id').eq('user_id', userId).maybeSingle();
  if (data) return data.id;
  const { data: created, error } = await supabase.from('wallets').insert({ user_id: userId }).select('id').single();
  if (error) throw error;
  return created.id;
}

// ------------------------------------------------------------
//  Seed (hanya bila tabel kosong) — data demo bersumber dari data/seed.js
// ------------------------------------------------------------
let seeded = false;
async function ensureSeed() {
  if (seeded) return;
  seeded = true;

  const { data: mData } = await supabase.from('merchants').select('id').limit(1);
  if (!mData || mData.length === 0) {
    // pemilik merchant demo sudah dibuat oleh seed SQL; kalau tidak ada, lewati
    const { data: owner } = await supabase
      .from('users').select('id').eq('phone', '+962790000002').maybeSingle();
    if (owner) {
      const rows = seedMerchants.map((m) => ({
        user_id: owner.id,
        store_name: m.name,
        store_address: m.address,
        latitude: m.lat,
        longitude: m.lng,
        photo: m.photo || null,
        available: m.open !== false,
        delivery_config: { mode: 'area', activeZones: ['Hijazi'] },
        tenant_status: 'approved',
      }));
      await supabase.from('merchants').insert(rows);
    }
  }

  const { data: menuData } = await supabase.from('menus').select('id').limit(1);
  if (!menuData || menuData.length === 0) {
    const { data: merchant } = await supabase.from('merchants').select('id').limit(1).maybeSingle();
    if (merchant) {
      await supabase.from('menus').insert(
        seedMenu.map((m) => ({
          merchant_id: merchant.id,
          name: m.name,
          description: m.description,
          price_jod: m.price,
          image: m.image || null,
          photo: m.photo || null,
          available: m.available !== false,
          stock: m.stock ?? null,
          category: m.category || null,
        })),
      );
    }
  }

  const { data: cData } = await supabase.from('couriers').select('id').limit(1);
  if (!cData || cData.length === 0) {
    const { data: courierUser } = await supabase
      .from('users').select('id').eq('phone', '+962790000003').maybeSingle();
    const { data: merchant } = await supabase.from('merchants').select('id').limit(1).maybeSingle();
    if (courierUser && merchant) {
      await supabase.from('couriers').insert(
        seedCouriers.map((c) => ({
          user_id: courierUser.id,
          merchant_id: merchant.id,
          name: c.name,
          availability: 'unavailable',
          latitude: c.lat,
          longitude: c.lng,
          vehicle: c.vehicle || null,
          photo: c.photo || null,
        })),
      );
    }
  }
}

export const irbidBackend = {
  mode: 'supabase',
  isSupabase: true,
  schema: 'irbid',

  // ---------------- Auth ----------------
  async register({ name, email, phone, password, role }) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name, phone, role } },
    });
    if (error) throw error;
    const authUser = data?.user;
    if (!authUser) throw new Error('Unable to create the account. Please try again.');

    // Nomor WA wajib, format E.164 (ditegakkan juga oleh check constraint di DB).
    const { data: userRow, error: uErr } = await supabase
      .from('users')
      .insert({
        auth_user_id: authUser.id,
        role,
        email,
        phone,
        verified: false,
        auth_provider: 'phone',
      })
      .select('*')
      .single();
    if (uErr) throw uErr;

    if (role === 'customer') {
      await supabase.from('customers').insert({ user_id: userRow.id, name: name || 'Customer' });
    } else if (role === 'merchant') {
      await supabase.from('merchants').insert({
        user_id: userRow.id,
        store_name: name || 'New Restaurant',
        store_address: '',
        available: false,
        delivery_config: { mode: 'area', activeZones: [] },
        tenant_status: 'pending',
      });
    } else if (role === 'courier') {
      // Kurir adalah karyawan merchant (C-06): butuh merchant_id.
      // Tanpa itu, profil kurir dibuat oleh merchant lewat konsolnya.
    }
    await ensureWallet(userRow.id);
    return toPublicUser(await loadUserRow(authUser.id));
  },

  async login({ email, password, role }) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    const authUser = data?.user;
    if (!authUser) throw new Error('Unable to sign in. Please try again.');
    const row = await loadUserRow(authUser.id);
    if (!row) throw new Error('This account has no profile in the new schema. Contact CS.');
    if (role && row.role !== role) {
      await supabase.auth.signOut();
      throw new Error(`This account is registered as "${row.role}" and cannot sign in here.`);
    }
    if (row.status === 'suspended') {
      await supabase.auth.signOut();
      throw new Error('This account is suspended. Please contact customer service.');
    }
    return toPublicUser(row);
  },

  async logout() {
    await supabase.auth.signOut();
  },

  async getCurrentUser() {
    const { data } = await supabase.auth.getSession();
    const authUser = data?.session?.user;
    if (!authUser) return null;
    const row = await loadUserRow(authUser.id);
    return row ? toPublicUser(row) : null;
  },

  // Level 1: nomor WA divalidasi format, TANPA OTP WhatsApp (DEC-1370/1379).
  // Kode tetap dibuat supaya layar verifikasi lama tetap berfungsi di demo.
  async sendVerificationCode(channel) {
    const me = await this.getCurrentUser();
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    await supabase.from('phone_verifications').insert({
      user_id: me?.id ?? null,
      phone: me?.phone ?? '',
      method: 'format_only',
      code,
      expires_at: expiresAt,
    });
    return { demoCode: code, waLink: me?.phone ? `https://wa.me/${me.phone.replace('+', '')}` : null };
  },

  async verifyCode(channel, code) {
    const me = await this.getCurrentUser();
    const { data } = await supabase
      .from('phone_verifications')
      .select('*')
      .eq('user_id', me?.id ?? -1)
      .eq('code', code)
      .gt('expires_at', new Date().toISOString())
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!data) return { ok: false };
    await supabase.from('phone_verifications').update({ verified_at: new Date().toISOString() }).eq('id', data.id);
    return { ok: true };
  },

  async updateProfile(patch = {}, codes = {}) {
    const me = await this.getCurrentUser();
    if (!me) throw new Error('Not signed in.');
    await this.verifyCode('email', codes.emailCode ?? null).catch(() => null);
    await this.verifyCode('phone', codes.phoneCode ?? null).catch(() => null);

    const upd = {};
    if (patch.email) upd.email = patch.email;
    if (patch.phone) upd.phone = patch.phone;
    if (Object.keys(upd).length) {
      const { error } = await supabase.from('users').update(upd).eq('id', me.id);
      if (error) throw error;
    }
    if (me.role === 'customer' && (patch.name || patch.address)) {
      const updC = {};
      if (patch.name) updC.name = patch.name;
      await supabase.from('customers').update(updC).eq('id', me.customerId);
    }
    if (me.role === 'merchant') {
      const updM = {};
      if (patch.name) updM.store_name = patch.name;
      if (patch.address) updM.store_address = patch.address;
      if (patch.lat !== undefined) updM.latitude = patch.lat;
      if (patch.lng !== undefined) updM.longitude = patch.lng;
      if (Object.keys(updM).length) await supabase.from('merchants').update(updM).eq('id', me.merchantId);
    }
    if (me.role === 'courier' && patch.name) {
      await supabase.from('couriers').update({ name: patch.name }).eq('id', me.courierId);
    }
    return toPublicUser(await loadUserRow(me.authUserId));
  },

  // ---------------- Merchant & status toko ----------------
  async getMerchants() {
    await ensureSeed();
    const { data, error } = await supabase
      .from('merchants')
      .select('*')
      .eq('tenant_status', 'approved');
    if (error) throw error;
    return (data || []).map(mapMerchant);
  },

  async updateMerchant(merchantId, patch = {}) {
    const upd = {};
    if (patch.name !== undefined) upd.store_name = patch.name;
    if (patch.address !== undefined) upd.store_address = patch.address;
    if (patch.lat !== undefined) upd.latitude = patch.lat;
    if (patch.lng !== undefined) upd.longitude = patch.lng;
    if (patch.photo !== undefined) upd.photo = patch.photo;
    if (patch.open !== undefined) upd.available = patch.open;
    if (patch.available !== undefined) upd.available = patch.available;
    if (patch.deliveryConfig !== undefined) upd.delivery_config = patch.deliveryConfig;
    if (Object.keys(upd).length) {
      const { error } = await supabase.from('merchants').update(upd).eq('id', merchantId);
      if (error) throw error;
    }
    return (await this.getMerchants()).find((m) => m.id === merchantId) || null;
  },

  onMerchantsChange(cb) {
    const ch = supabase
      .channel('irbid-merchants')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'merchants' }, async () => {
        cb(await this.getMerchants());
      })
      .subscribe();
    return () => supabase.removeChannel(ch);
  },

  async getStoreStatus(merchantId) {
    const { data, error } = await supabase
      .from('merchants').select('available').eq('id', merchantId).maybeSingle();
    if (error) throw error;
    return data ? data.available : true;
  },

  async setStoreStatus(merchantId, open) {
    const { error } = await supabase.from('merchants').update({ available: open }).eq('id', merchantId);
    if (error) throw error;
    if (!open) {
      // Menutup toko membatalkan order yang belum masuk dapur (perilaku skema lama).
      await supabase
        .from('orders')
        .update({ status: 'canceled', cancel_by: 'merchant', cancel_reason: 'store_closed' })
        .eq('merchant_id', merchantId)
        .in('status', ['cart', 'quotation']);
    }
  },

  onStoreStatusChange(cb) {
    const ch = supabase
      .channel('irbid-store-status')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'merchants' }, (payload) => {
        const r = payload.new;
        if (r) cb({ merchantId: r.id, open: r.available });
      })
      .subscribe();
    return () => supabase.removeChannel(ch);
  },

  // ---------------- Menu ----------------
  async getMenu(merchantId) {
    await ensureSeed();
    let q = supabase.from('menus').select('*, menu_variants(*)').order('id');
    if (merchantId) q = q.eq('merchant_id', merchantId);
    const { data, error } = await q;
    if (error) throw error;
    return (data || []).map((r) => mapMenu(r, r.menu_variants || []));
  },

  async saveMenu(merchantId, items = []) {
    if (!items.length) return;
    const rows = items.map((it) => ({
      merchant_id: merchantId,
      name: it.name,
      description: it.description || '',
      price_jod: it.priceJod ?? it.price ?? 0,
      available: it.available !== false,
      image: it.image || null,
      photo: it.photo || null,
      stock: it.stock ?? null,
      category: it.category || null,
    }));
    const { error } = await supabase.from('menus').insert(rows);
    if (error) throw error;
  },

  async updateStock(itemId, delta) {
    const { data } = await supabase.from('menus').select('stock').eq('id', itemId).maybeSingle();
    if (!data) return;
    const next = (data.stock ?? 0) + delta;
    await supabase.from('menus').update({ stock: Math.max(0, next) }).eq('id', itemId);
  },

  onMenuChange(cb) {
    const ch = supabase
      .channel('irbid-menu')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'menus' }, async () => {
        cb(await this.getMenu());
      })
      .subscribe();
    return () => supabase.removeChannel(ch);
  },

  // ---------------- Kurir ----------------
  async getCouriers() {
    await ensureSeed();
    const { data, error } = await supabase.from('couriers').select('*').order('id');
    if (error) throw error;
    return (data || []).map(mapCourier);
  },

  async updateCourier(courierId, patch = {}) {
    const upd = {};
    if (patch.availability !== undefined) upd.availability = patch.availability;
    if (patch.online !== undefined) upd.availability = patch.online ? 'available' : 'unavailable';
    if (patch.name !== undefined) upd.name = patch.name;
    if (patch.vehicle !== undefined) upd.vehicle = patch.vehicle;
    if (patch.photo !== undefined) upd.photo = patch.photo;
    if (patch.lat !== undefined) upd.latitude = patch.lat;
    if (patch.lng !== undefined) upd.longitude = patch.lng;
    if (patch.lastSeenAt !== undefined) upd.last_seen_at = toIso(patch.lastSeenAt);
    if (Object.keys(upd).length) {
      const { error } = await supabase.from('couriers').update(upd).eq('id', courierId);
      if (error) throw error;
    }
    return mapCourier((await supabase.from('couriers').select('*').eq('id', courierId).single()).data);
  },

  onCouriersChange(cb) {
    const ch = supabase
      .channel('irbid-couriers')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'couriers' }, async () => {
        cb(await this.getCouriers());
      })
      .subscribe();
    return () => supabase.removeChannel(ch);
  },

  // ---------------- Order ----------------
  async createOrder(order = {}) {
    const me = await this.getCurrentUser();
    const items = order.items || [];

    // Snapshot harga: dibaca dari `menus` SEKARANG lalu disimpan permanen.
    const menuIds = items.map((i) => i.itemId ?? i.menuId).filter(Boolean);
    const { data: menuRows } = await supabase.from('menus').select('*').in('id', menuIds);
    const byId = new Map((menuRows || []).map((m) => [m.id, m]));

    const subTotal = items.reduce((s, i) => {
      const m = byId.get(i.itemId ?? i.menuId);
      const unit = m ? num(m.price_jod) : num(i.price);
      const delta = (i.modifiers || []).reduce((d, mm) => d + num(mm.priceDelta), 0);
      return s + (unit + delta) * i.qty;
    }, 0);

    const deliveryFee = num(order.courierCost ?? order.deliveryFeeJod);
    const platformFee = num(order.platformFeeJod); // UNRESOLVED FEE-1 → dari pemanggil, bukan hardcode
    const tip = num(order.tipJod);
    const total = subTotal + deliveryFee + platformFee + tip;

    const row = {
      code: order.code || 'SA-' + Date.now(),
      status: toNewStatus(order.status || 'pending'),
      customer_id: order.customerId ?? me?.customerId ?? null,
      merchant_id: order.restaurantId ?? order.merchantId ?? null,
      delivery_address_id: order.deliveryAddressId ?? null,
      sub_total_jod: subTotal,
      delivery_fee_jod: deliveryFee,
      platform_fee_jod: platformFee,
      tip_jod: tip,
      total_jod: total,
      zone_code: order.zoneCode ?? null,
      payment_method: PAYMENT_TO_NEW[order.payment] || order.paymentMethod || 'cod',
      payment_status: 'unpaid',
      hold_status: 'none',
      order_note: order.orderNote ?? null,
      placed_at: new Date().toISOString(),
    };

    const { data: created, error } = await supabase.from('orders').insert(row).select('*').single();
    if (error) throw error;

    if (items.length) {
      const itemRows = items.map((i) => {
        const m = byId.get(i.itemId ?? i.menuId);
        const unit = m ? num(m.price_jod) : num(i.price);
        const modifiers = (i.modifiers || []).map((mm) => ({
          variantId: mm.variantId ?? null,
          optionId: mm.optionId ?? null,
          name: mm.name ?? '',
          priceDeltaJod: num(mm.priceDelta),
        }));
        const delta = modifiers.reduce((d, mm) => d + num(mm.priceDeltaJod), 0);
        return {
          order_id: created.id,
          menu_id: i.itemId ?? i.menuId,
          name: m ? m.name : i.name,        // snapshot nama
          qty: i.qty,
          unit_price_jod: unit,             // snapshot harga
          modifiers,
          line_total_jod: (unit + delta) * i.qty,
          note: i.note || null,
        };
      });
      const { error: iErr } = await supabase.from('order_items').insert(itemRows);
      if (iErr) throw iErr;
      // Stok turun (kolom legacy menus.stock; null = tidak dilacak)
      for (const i of items) await this.updateStock(i.itemId ?? i.menuId, -i.qty);
    }

    return this.getOrder(created.id);
  },

  async getOrder(id) {
    const { data, error } = await supabase.from('orders').select(ORDER_SELECT).eq('id', id).maybeSingle();
    if (error) throw error;
    return data ? mapOrder(data) : null;
  },

  async getOrders() {
    const { data, error } = await supabase.from('orders').select(ORDER_SELECT).order('id', { ascending: false });
    if (error) throw error;
    return (data || []).map(mapOrder);
  },

  onOrdersChange(cb) {
    const ch = supabase
      .channel('irbid-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, async () => {
        cb(await this.getOrders());
      })
      .subscribe();
    return () => supabase.removeChannel(ch);
  },

  async updateOrderStatus(id, status, extra = {}) {
    const upd = {};
    if (status) upd.status = toNewStatus(status);
    if (extra.cancelReason !== undefined) upd.cancel_reason = extra.cancelReason;
    if (extra.cancelBy !== undefined) upd.cancel_by = extra.cancelBy;
    if (extra.assignedCourierId !== undefined) upd.courier_id = extra.assignedCourierId;
    if (extra.paymentStatus !== undefined) upd.payment_status = extra.paymentStatus;
    if (extra.holdStatus !== undefined) upd.hold_status = extra.holdStatus;
    if (extra.paidAt !== undefined) upd.paid_at = toIso(extra.paidAt);

    const { error } = await supabase.from('orders').update(upd).eq('id', id);
    if (error) throw error;

    // Membatalkan order mengembalikan stok (perilaku skema lama).
    if (upd.status === 'canceled') {
      const { data: items } = await supabase.from('order_items').select('menu_id, qty').eq('order_id', id);
      for (const it of items || []) await this.updateStock(it.menu_id, it.qty);
    }
    return this.getOrder(id);
  },

  // Klaim atomik: hanya satu kurir yang menang (compare-and-swap).
  async claimOrder(orderId, courier, opts = {}) {
    let q = supabase
      .from('orders')
      .update({ courier_id: courier.id, status: 'waitingDelivery' })
      .eq('id', orderId)
      .eq('status', 'waitingCourier')
      .is('courier_id', null)
      .select('id');
    const { data, error } = await q;
    if (error) throw error;
    if (!data || data.length !== 1) {
      const err = new Error('Order already taken by another courier');
      err.code = 'ORDER_ALREADY_TAKEN';
      throw err;
    }
    return this.getOrder(orderId);
  },

  async updateCourierLocation(orderId, courierId, lat, lng) {
    if (courierId) {
      await supabase.from('couriers').update({ latitude: lat, longitude: lng }).eq('id', courierId);
    }
  },

  onCourierLocation(cb) {
    const ch = supabase
      .channel('irbid-courier-location')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'couriers' }, (payload) => {
        const r = payload.new;
        if (r) cb({ courierId: r.id, lat: r.latitude, lng: r.longitude });
      })
      .subscribe();
    return () => supabase.removeChannel(ch);
  },

  // ---------------- Chat ----------------
  async ensureChat(orderId, userId) {
    const { data: existing } = await supabase.from('chats').select('*').eq('order_id', orderId).maybeSingle();
    let chat = existing;
    if (!chat) {
      const { data, error } = await supabase.from('chats').insert({ order_id: orderId }).select('*').single();
      if (error) throw error;
      chat = data;
    }
    if (userId) {
      await supabase.from('chat_participants').upsert({ chat_id: chat.id, user_id: userId }, { onConflict: 'chat_id,user_id' });
    }
    return chat;
  },

  async getMessages(orderId) {
    const { data: chat } = await supabase.from('chats').select('id').eq('order_id', orderId).maybeSingle();
    if (!chat) return [];
    const { data, error } = await supabase
      .from('chat_messages')
      .select('*, sender:users(role)')
      .eq('chat_id', chat.id)
      .order('at');
    if (error) throw error;
    return (data || []).map((r) => ({ ...mapMessage(r), orderId }));
  },

  async sendMessage(orderId, msg = {}) {
    const me = await this.getCurrentUser();
    const chat = await this.ensureChat(orderId, me?.id);
    const { data, error } = await supabase
      .from('chat_messages')
      .insert({
        chat_id: chat.id,
        sender_id: me?.id ?? null,
        channel: msg.channel || 'customer-merchant',
        body: msg.text || msg.body || '',
      })
      .select('*')
      .single();
    if (error) throw error;
    await supabase
      .from('chats')
      .update({ last_message: data.body, last_at: data.at })
      .eq('id', chat.id);
    return { ...mapMessage(data), orderId, senderName: me?.name || '', senderRole: me?.role || '' };
  },

  onMessagesChange(orderId, cb) {
    const ch = supabase
      .channel('irbid-chat-' + orderId)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages' },
        async () => cb(await this.getMessages(orderId)),
      )
      .subscribe();
    return () => supabase.removeChannel(ch);
  },

  // ---------------- Demo ----------------
  async resetDemo() {
    // Penjaga append-only (migrasi 0006) MENOLAK delete pada `wallet_ledgers` dan
    // `audit_logs` untuk semua peran — dan karena FK, menghapus tabel induknya
    // (`wallets`) ikut terblokir. Kalau loop di bawah berjalan apa adanya, ia
    // melempar error di tengah jalan dan demo tertinggal setengah terhapus.
    // Karena itu: periksa dulu SEBELUM menghapus satu baris pun.
    for (const t of ['wallet_ledgers', 'audit_logs']) {
      const { count, error } = await supabase
        .from(t)
        .select('id', { count: 'exact', head: true });
      if (error) throw error;
      if (count) {
        throw new Error(
          `Reset demo dibatalkan: tabel append-only \`${t}\` berisi ${count} baris dan ` +
            'tidak boleh dihapus (jejak uang/audit, migrasi 0006). Tidak ada data yang ' +
            'dihapus. Untuk mengosongkan total di environment demo, jalankan ulang migrasi ' +
            'di database kosong (lihat docs/backend/MIGRATION-RUNBOOK.md).'
        );
      }
    }
    // Urutan penting: anak dulu, induk kemudian (FK).
    for (const t of [
      'chat_messages', 'chat_participants', 'chats',
      'checkpoints', 'dispute_appeals', 'protection_fund', 'disputes',
      'wallet_ledgers', 'wallet_holds', 'payments', 'fees', 'taxes',
      'order_items', 'orders', 'batches',
      'topups', 'cashouts', 'review_replies', 'rating_reviews',
      'push_subscriptions', 'audit_logs', 'merchant_credits', 'deposits',
      'menus', 'couriers', 'fav_merchants', 'addresses',
      'customers', 'merchants', 'wallets', 'phone_verifications', 'users',
    ]) {
      await supabase.from(t).delete().gt('id', 0);
    }
    seeded = false;
  },
};
