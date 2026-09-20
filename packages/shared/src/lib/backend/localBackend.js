// ============================================================
//  Backend Demo Lokal
//  Data disimpan di localStorage; sinkron realtime antar tab
//  berjalan lewat BroadcastChannel. Cocok untuk mencoba semua
//  fitur tanpa perlu menyiapkan server/backend sendiri.
// ============================================================
import { seedMenu, seedCouriers, seedUsers, seedMerchants, DEMO_PASSWORD, SEED_VERSION } from '../../data/seed.js';
import { hashPassword, randomSalt } from '../password.js';

const PREFIX = 'sa7tein:';
const CHANNEL = 'sa7tein-sync';

function read(key, fallback) {
  try {
    const v = localStorage.getItem(PREFIX + key);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}
function write(key, value) {
  localStorage.setItem(PREFIX + key, JSON.stringify(value));
}

function ensureSeed() {
  // Segarkan data demo saat bentuk seed berubah (mis. ada kolom foto baru)
  if (read('seedVersion', 0) !== SEED_VERSION) {
    write('menu', seedMenu);
    write('couriers', seedCouriers);
    write('merchants', seedMerchants);
    write('seedVersion', SEED_VERSION);
  }
  if (!localStorage.getItem(PREFIX + 'orders')) write('orders', []);
  if (!localStorage.getItem(PREFIX + 'orderCounter')) write('orderCounter', 1000);
}

// Buat akun demo (dengan kata sandi yang di-hash). Akun yang sudah ada tidak
// diubah, tetapi akun demo yang hilang (mis. merchant2/merchant3 dari seed
// terbaru) ditambahkan lagi agar data demo lama tetap lengkap. Akun yang
// dibuat sebelum ada merchantId/courierId juga dilengkapi lewat email agar
// tetap berfungsi (mis. courier@ lama kembali mendapat courierId-nya).
async function ensureUsers() {
  const existing = read('users', []);
  let current = existing;
  if (existing.length > 0) {
    let changed = false;
    const next = existing.map((u) => {
      const su = seedUsers.find((s) => s.email === u.email);
      const patch = { ...u };
      if (u.role === 'merchant' && !patch.merchantId && su?.merchantId) {
        patch.merchantId = su.merchantId;
        changed = true;
      }
      if (u.role === 'courier' && !patch.courierId && su?.courierId) {
        patch.courierId = su.courierId;
        changed = true;
      }
      return patch;
    });
    if (changed) {
      write('users', next);
      current = next;
    }
  }
  const byEmail = new Map(current.map((u) => [u.email, u]));
  const missing = seedUsers.filter((su) => !byEmail.has(su.email));
  if (missing.length === 0 && existing.length > 0) return;
  const seeded = current.slice();
  for (const su of missing) {
    const salt = randomSalt();
    const passwordHash = await hashPassword(DEMO_PASSWORD, salt);
    seeded.push({
      id: su.id,
      name: su.name,
      email: su.email,
      phone: su.phone,
      role: su.role,
      merchantId: su.merchantId || null,
      courierId: su.courierId || null,
      salt,
      passwordHash,
      createdAt: Date.now(),
    });
  }
  write('users', seeded);
}

// Jangan pernah mengekspos salt atau hash ke luar backend.
function sanitizeUser(u) {
  return { id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role, merchantId: u.merchantId || null, courierId: u.courierId || null, address: u.address || '' };
}

// Untuk merchant, nama & alamat yang ditampilkan selalu diambil dari data
// restoran, sehingga halaman Settings, navbar, dan dashboard menampilkan
// satu nama & alamat yang sama.
async function toPublicUser(u) {
  const base = sanitizeUser(u);
  if (u.role === 'merchant' && u.merchantId) {
    const merchant = read('merchants', seedMerchants).find((m) => m.id === u.merchantId);
    if (merchant) {
      if (merchant.name) base.name = merchant.name;
      if (merchant.address) base.address = merchant.address;
    }
  }
  return base;
}

const listeners = new Set();
let channel = null;
function getChannel() {
  if (!channel && typeof BroadcastChannel !== 'undefined') {
    channel = new BroadcastChannel(CHANNEL);
    channel.onmessage = (e) => listeners.forEach((l) => l(e.data));
  }
  return channel;
}

function notify(type, payload) {
  const msg = { type, payload };
  listeners.forEach((l) => l(msg));
  const ch = getChannel();
  if (ch) ch.postMessage(msg);
}

export function subscribe(fn) {
  listeners.add(fn);
  getChannel();
  return () => listeners.delete(fn);
}

function decrementStock(orderedItems) {
  const items = read('menu', []);
  for (const li of orderedItems) {
    const it = items.find((i) => i.id === li.itemId);
    if (it) it.stock = Math.max(0, (it.stock ?? 0) - li.qty);
  }
  write('menu', items);
  notify('menu', items);
}

export const localBackend = {
  mode: 'local',
  isSupabase: false,

  // --- Autentikasi ---
  async register({ name, email, phone, password, role }) {
    await ensureUsers();
    const users = read('users', []);
    const normalized = String(email || '')
      .trim()
      .toLowerCase();
    if (!normalized || !password) throw new Error('Email and password are required.');
    if (!name || !name.trim()) throw new Error('Please enter your name.');
    if (users.some((u) => u.email === normalized)) throw new Error('An account with this email already exists.');

    // Mendaftar sebagai merchant juga membuat restorannya; mendaftar sebagai
    // kurir juga membuat profil kurirnya (supaya mendapat offer).
    let merchantId = null;
    let courierId = null;
    if (role === 'merchant') {
      const merchants = read('merchants', seedMerchants);
      const merchant = {
        id: 'merchant-' + Date.now(),
        name: name.trim(),
        address: 'Jl. Demo No. 1, Jakarta Pusat',
        lat: -6.202,
        lng: 106.817,
        emoji: '🍽️',
        category: 'General',
        open: true,
      };
      merchants.push(merchant);
      write('merchants', merchants);
      notify('merchants', merchants);
      merchantId = merchant.id;
    } else if (role === 'courier') {
      const couriers = read('couriers', seedCouriers);
      const courier = {
        id: 'c-' + Date.now(),
        name: name.trim(),
        phone: phone || '',
        vehicle: 'On foot',
        status: 'idle',
        lat: -6.201,
        lng: 106.819,
        photo: null,
      };
      couriers.push(courier);
      write('couriers', couriers);
      notify('couriers', couriers);
      courierId = courier.id;
    }

    const salt = randomSalt();
    const passwordHash = await hashPassword(password, salt);
    const user = {
      id: 'u-' + Date.now(),
      name: name.trim(),
      email: normalized,
      phone: phone || '',
      role,
      merchantId,
      courierId,
      salt,
      passwordHash,
      createdAt: Date.now(),
    };
    users.push(user);
    write('users', users);
    write('session', user.id);
    return await toPublicUser(user);
  },
  async login({ email, password, role }) {
    await ensureUsers();
    const users = read('users', []);
    const normalized = String(email || '')
      .trim()
      .toLowerCase();
    const user = users.find((u) => u.email === normalized);
    if (!user) throw new Error('No account found with this email address.');
    if (role && user.role !== role) {
      throw new Error(`This account is registered for the ${user.role} portal, not ${role}.`);
    }
    const passwordHash = await hashPassword(password, user.salt);
    if (passwordHash !== user.passwordHash) throw new Error('Incorrect password. Please try again.');
    write('session', user.id);
    return await toPublicUser(user);
  },
  async logout() {
    localStorage.removeItem(PREFIX + 'session');
  },
  async getCurrentUser() {
    await ensureUsers();
    const id = read('session', null);
    if (!id) return null;
    const user = read('users', []).find((u) => u.id === id);
    return user ? await toPublicUser(user) : null;
  },

  // --- Profil & verifikasi (demo) ---
  // Verifikasi email/telepon yang disimulasikan: kode 6 digit "dikirim" dan
  // dikembalikan agar bisa ditampilkan di layar (tidak ada SMS/email sungguhan
  // dalam demo).
  async sendVerificationCode(channel) {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = Date.now() + 10 * 60 * 1000;
    write('verifyCode:' + channel, { code, expiresAt });
    return { demoCode: code };
  },
  async verifyCode(channel, code) {
    const stored = read('verifyCode:' + channel, null);
    // Verifikasi tidak menghabiskan kode: kode tetap valid saat dicek, dan baru
    // benar-benar terpakai setelah penyimpanan berhasil (dipakai UI settings & updateProfile).
    return !!stored && stored.code === code && stored.expiresAt >= Date.now();
  },
  async updateProfile(patch, { emailCode, phoneCode } = {}) {
    const users = read('users', []);
    const id = read('session', null);
    const u = users.find((x) => x.id === id);
    if (!u) throw new Error('Not signed in.');
    const next = { ...u };
    if (patch.name !== undefined) next.name = String(patch.name).trim();
    if (patch.address !== undefined) next.address = patch.address || '';
    if (patch.email !== undefined && patch.email !== next.email) {
      if (!emailCode || !(await this.verifyCode('email', emailCode))) throw new Error('Please verify your new email address first.');
      localStorage.removeItem(PREFIX + 'verifyCode:email');
      const normalized = String(patch.email).trim().toLowerCase();
      if (!normalized) throw new Error('Email is required.');
      if (users.some((x) => x.email === normalized && x.id !== id)) throw new Error('An account with this email already exists.');
      next.email = normalized;
    }
    if (patch.phone !== undefined && patch.phone !== next.phone) {
      if (!phoneCode || !(await this.verifyCode('phone', phoneCode))) throw new Error('Please verify your new phone number first.');
      localStorage.removeItem(PREFIX + 'verifyCode:phone');
      next.phone = String(patch.phone).trim();
    }
    users[users.indexOf(u)] = next;
    write('users', users);
    // Nama & alamat merchant ADALAH milik restoran: jaga record restoran tetap
    // sinkron agar Settings dan dashboard menampilkan satu nama & alamat yang sama.
    if (next.role === 'merchant' && next.merchantId) {
      const merchantPatch = {};
      if (patch.name !== undefined) merchantPatch.name = next.name;
      if (patch.address !== undefined) merchantPatch.address = next.address;
      if (patch.lat !== undefined) merchantPatch.lat = patch.lat;
      if (patch.lng !== undefined) merchantPatch.lng = patch.lng;
      if (Object.keys(merchantPatch).length > 0) await this.updateMerchant(next.merchantId, merchantPatch);
    }
    // Nama kurir juga merupakan nama profil kurirnya.
    if (next.role === 'courier' && next.courierId && patch.name !== undefined) {
      const couriers = read('couriers', []);
      const c = couriers.find((x) => x.id === next.courierId);
      if (c && c.name !== next.name) {
        c.name = next.name;
        write('couriers', couriers);
        notify('couriers', couriers);
      }
    }
    return await toPublicUser(next);
  },

  // --- Restoran ---
  async getMerchants() {
    ensureSeed();
    return read('merchants', seedMerchants);
  },
  // Perbarui detail restoran (mis. foto restorannya). Nama/alamat profil
  // merchant yang sedang masuk tetap sinkron sehingga Settings dan dashboard
  // selalu menampilkan nama & alamat restoran yang sama.
  async updateMerchant(merchantId, patch) {
    ensureSeed();
    const merchants = read('merchants', seedMerchants);
    const next = merchants.map((m) => (m.id === merchantId ? { ...m, ...patch } : m));
    write('merchants', next);
    notify('merchants', next);
    if (patch.name === undefined && patch.address === undefined) return;
    const id = read('session', null);
    if (!id) return;
    const users = read('users', []);
    const u = users.find((x) => x.id === id);
    if (u && u.role === 'merchant' && u.merchantId === merchantId) {
      const updated = { ...u };
      if (patch.name !== undefined) updated.name = patch.name;
      if (patch.address !== undefined) updated.address = patch.address;
      users[users.indexOf(u)] = updated;
      write('users', users);
    }
  },
  onMerchantsChange(cb) {
    return subscribe((msg) => {
      if (msg.type === 'merchants') cb(msg.payload);
    });
  },

  // --- Status buka/tutup toko (per restoran) ---
  async getStoreStatus(merchantId) {
    ensureSeed();
    return read('storeStatus:' + merchantId, true) === true;
  },
  async setStoreStatus(merchantId, open) {
    ensureSeed();
    write('storeStatus:' + merchantId, !!open);
    // Saat toko tutup, batalkan otomatis pesanan yang masih menunggu konfirmasi
    // agar customer tidak terjebak menunggu pesanan yang tidak akan terpenuhi.
    // Pesanan yang sudah berjalan (accepted → delivered) tetap lanjut.
    if (!open) {
      const orders = read('orders', []);
      let changed = false;
      const next = orders.map((o) => {
        if (o.restaurantId === merchantId && o.status === 'pending') {
          changed = true;
          return {
            ...o,
            status: 'cancelled',
            cancelledReason: 'store_closed',
            statusTimestamps: { ...(o.statusTimestamps || {}), cancelled: Date.now() },
          };
        }
        return o;
      });
      if (changed) {
        write('orders', next);
        notify('orders', next);
      }
    }
    notify('store-status', { merchantId, open: !!open });
  },
  onStoreStatusChange(cb) {
    return subscribe((msg) => {
      if (msg.type === 'store-status') cb(msg.payload);
    });
  },

  // --- Menu & stok ---
  async getMenu(merchantId) {
    ensureSeed();
    const all = read('menu', []);
    return merchantId ? all.filter((i) => i.merchantId === merchantId) : all;
  },
  async saveMenu(merchantId, items) {
    ensureSeed();
    const all = read('menu', []);
    const kept = all.filter((i) => i.merchantId !== merchantId);
    const next = [...kept, ...items.map((i) => ({ ...i, merchantId }))];
    write('menu', next);
    notify('menu', next);
  },
  async updateStock(itemId, delta) {
    ensureSeed();
    const items = read('menu', []);
    const it = items.find((i) => i.id === itemId);
    if (it) {
      it.stock = Math.max(0, (it.stock ?? 0) + delta);
      write('menu', items);
      notify('menu', items);
    }
  },
  onMenuChange(cb) {
    return subscribe((msg) => {
      if (msg.type === 'menu') cb(msg.payload);
    });
  },

  // --- Pesanan ---
  async createOrder(order) {
    ensureSeed();
    // Pengaman: tolak pesanan jika restoran tutup (dicek ulang saat submit,
    // sehingga toko yang tutup di tengah checkout tidak bisa menerima pesanan).
    const open = await this.getStoreStatus(order.restaurantId);
    if (!open) {
      throw new Error(`${order.restaurantName || 'This restaurant'} is currently closed. Please try again later.`);
    }
    const orders = read('orders', []);
    const counter = read('orderCounter', 1000) + 1;
    write('orderCounter', counter);
    const now = Date.now();
    const full = {
      ...order,
      id: String(counter),
      code: 'SA-' + counter,
      createdAt: now,
      status: 'pending',
      statusTimestamps: { pending: now },
    };
    orders.unshift(full);
    write('orders', orders);
    decrementStock(order.items); // stok berkurang langsung saat pesanan masuk
    notify('orders', orders);
    return full;
  },
  async getOrders() {
    ensureSeed();
    return read('orders', []);
  },
  onOrdersChange(cb) {
    return subscribe((msg) => {
      if (msg.type === 'orders') cb(msg.payload);
    });
  },
  async updateOrderStatus(orderId, status, extra = {}) {
    ensureSeed();
    const orders = read('orders', []);
    const o = orders.find((x) => x.id === orderId);
    if (!o) return;
    const wasClosed = o.status === 'cancelled' || o.status === 'rejected';
    Object.assign(o, extra, {
      status,
      statusTimestamps: { ...(o.statusTimestamps || {}), [status]: Date.now() },
    });
    // Kembalikan stok saat order dibatalkan/ditolak (jendela cancel, toko tutup,
    // atau ditolak merchant) — hanya sekali, kalau belum berstatus batal.
    if (!wasClosed && (status === 'cancelled' || status === 'rejected')) {
      for (const li of o.items || []) this.updateStock(li.itemId, li.qty);
    }
    write('orders', orders);
    notify('orders', orders);
  },
  // Claim order siap untuk kurir tertentu (anti double-claim, best-effort).
  // Di mode lokal (localStorage) tidak ada operasi atomik antar tab, jadi ini
  // membaca ulang data terbaru, memverifikasi masih bisa diambil, lalu menulis —
  // mempersempit jendela race (tidak menghilangkan sepenuhnya; untuk demo cukup).
  async claimOrder(orderId, courier, { expectedAssignedCourierId = null } = {}) {
    ensureSeed();
    const orders = read('orders', []);
    const o = orders.find((x) => x.id === orderId);
    if (!o) return false;
    if (o.status !== 'ready') return false;
    // Order yang ditugaskan (offer): hanya kurir tersebut yang boleh meng-claim & offer masih pending.
    if (expectedAssignedCourierId && (o.assignedCourierId !== expectedAssignedCourierId || o.offerStatus !== 'pending')) return false;
    // Order bebas (available): hanya boleh di-claim bila belum ada kurir.
    if (!expectedAssignedCourierId && o.assignedCourierId) return false;
    Object.assign(o, {
      courierId: courier.id,
      courierName: courier.name,
      courierPhoto: courier.photo || null,
      offerStatus: 'accepted',
      courierLat: o.restaurantLat,
      courierLng: o.restaurantLng,
      remainingMeters: o.distanceMeters,
      status: 'picked_up',
      statusTimestamps: { ...(o.statusTimestamps || {}), picked_up: Date.now() },
    });
    write('orders', orders);
    notify('orders', orders);
    return true;
  },

  // --- Pelacakan kurir ---
  async updateCourierLocation(orderId, loc) {
    ensureSeed();
    const orders = read('orders', []);
    const o = orders.find((x) => x.id === orderId);
    if (!o) return;
    Object.assign(o, loc);
    write('orders', orders);
    notify('orders', orders);
    notify('courier-location', { orderId, loc });
  },
  onCourierLocation(orderId, cb) {
    return subscribe((msg) => {
      if (msg.type === 'courier-location' && msg.payload.orderId === orderId) {
        cb(msg.payload.loc);
      }
    });
  },

  async getCouriers() {
    ensureSeed();
    return read('couriers', []);
  },
  // Perbarui profil kurir (mis. fotonya)
  async updateCourier(courierId, patch) {
    ensureSeed();
    const couriers = read('couriers', []);
    const next = couriers.map((c) => (c.id === courierId ? { ...c, ...patch } : c));
    write('couriers', next);
    notify('couriers', next);
  },
  onCouriersChange(cb) {
    return subscribe((msg) => {
      if (msg.type === 'couriers') cb(msg.payload);
    });
  },

  // --- Chat (pesan per-order, dikelompokkan per channel) ---
  // Channel: 'customer-merchant' | 'merchant-courier' | 'courier-customer'
  // Setiap portal berlangganan ke order yang sedang dibuka; pesan baru
  // dikirim ke semua tab lewat BroadcastChannel agar chat langsung diperbarui.
  async getMessages(orderId) {
    ensureSeed();
    return read('messages:' + orderId, []);
  },
  async sendMessage(orderId, msg) {
    ensureSeed();
    const key = 'messages:' + orderId;
    const list = read(key, []);
    const full = {
      id: 'm-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      orderId,
      channel: msg.channel,
      senderId: msg.senderId,
      senderName: msg.senderName,
      senderRole: msg.senderRole,
      text: msg.text,
      createdAt: Date.now(),
    };
    list.push(full);
    write(key, list);
    notify('chat', { orderId, messages: list });
    return full;
  },
  onMessagesChange(orderId, cb) {
    return subscribe((msg) => {
      if (msg.type === 'chat' && msg.payload.orderId === orderId) cb(msg.payload.messages);
    });
  },

  async resetDemo() {
    localStorage.removeItem(PREFIX + 'menu');
    localStorage.removeItem(PREFIX + 'orders');
    localStorage.removeItem(PREFIX + 'couriers');
    localStorage.removeItem(PREFIX + 'merchants');
    localStorage.removeItem(PREFIX + 'orderCounter');
    localStorage.removeItem(PREFIX + 'seedVersion');
    localStorage.removeItem(PREFIX + 'users');
    localStorage.removeItem(PREFIX + 'session');
    Object.keys(localStorage)
      .filter((k) => k.startsWith(PREFIX + 'storeStatus:'))
      .forEach((k) => localStorage.removeItem(k));
    Object.keys(localStorage)
      .filter((k) => k.startsWith(PREFIX + 'messages:'))
      .forEach((k) => localStorage.removeItem(k));
    ensureSeed();
    notify('menu', read('menu', []));
    notify('orders', read('orders', []));
    notify('merchants', read('merchants', []));
  },
};
