// ============================================================
//  Backend Supabase (cloud, realtime lintas perangkat)
//  Aktif saat VITE_SUPABASE_URL & VITE_SUPABASE_ANON_KEY di-set.
//  Jalankan `supabase/schema.sql` di SQL Editor sebelum memakainya.
// ============================================================
import { supabase } from '../supabaseClient.js';
import { seedMenu, seedCouriers, seedMerchants } from '../../data/seed.js';

// Helper: cek & seed tabel menu dan restoran saat pertama kali dipakai
let seeded = false;
async function ensureSeed() {
  if (seeded) return;
  seeded = true;
  const { data, error } = await supabase.from('menu_items').select('id').limit(1);
  if (!error && (!data || data.length === 0)) {
    await supabase.from('menu_items').insert(
      seedMenu.map((m) => ({
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
      })),
    );
  }
  const { data: mData } = await supabase.from('merchants').select('id').limit(1);
  if (!mData || mData.length === 0) {
    await supabase.from('merchants').insert(seedMerchants);
  }
}

async function toPublicUser(authUser, profile) {
  const meta = authUser?.user_metadata || {};
  const base = {
    id: authUser?.id,
    name: profile?.name || meta.name || authUser?.email || '',
    email: authUser?.email || '',
    phone: profile?.phone || meta.phone || '',
    role: profile?.role || meta.role || '',
    merchantId: profile?.merchant_id || meta.merchantId || null,
    courierId: profile?.courier_id || meta.courierId || null,
    address: profile?.address || '',
  };
  // Nama & alamat tunggal yang ditampilkan merchant adalah milik restoran.
  if (base.role === 'merchant' && base.merchantId) {
    const { data: merchant } = await supabase.from('merchants').select('name, address').eq('id', base.merchantId).maybeSingle();
    if (merchant) {
      if (merchant.name) base.name = merchant.name;
      if (merchant.address) base.address = merchant.address;
    }
  }
  return base;
}

export const supabaseBackend = {
  mode: 'supabase',
  isSupabase: true,

  // --- Autentikasi (Supabase Auth) ---
  async register({ name, email, phone, password, role }) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name, phone, role } },
    });
    if (error) throw error;
    const user = data?.user;
    if (!user) throw new Error('Unable to create the account. Please try again.');

    // Mendaftar sebagai merchant juga membuat restorannya; mendaftar sebagai
    // kurir juga membuat profil kurirnya (supaya mendapat offer).
    let merchantId = null;
    let courierId = null;
    if (role === 'merchant') {
      const merchant = {
        id: 'merchant-' + Date.now(),
        name: name || 'New Restaurant',
        address: 'Jl. Demo No. 1, Jakarta Pusat',
        lat: -6.202,
        lng: 106.817,
        emoji: '🍽️',
        category: 'General',
        open: true,
      };
      const { error: mErr } = await supabase.from('merchants').insert(merchant);
      if (mErr) throw mErr;
      merchantId = merchant.id;
    } else if (role === 'courier') {
      const courier = {
        id: 'c-' + Date.now(),
        name: name || 'Courier',
        phone: phone || '',
        vehicle: 'On foot',
        status: 'idle',
        lat: -6.201,
        lng: 106.819,
        photo: null,
      };
      const { error: cErr } = await supabase.from('couriers').insert(courier);
      if (cErr) throw cErr;
      courierId = courier.id;
    }

    const profile = { id: user.id, email: user.email, name: name || '', phone: phone || '', role, merchant_id: merchantId, courier_id: courierId };
    const { error: pErr } = await supabase.from('profiles').upsert(profile);
    if (pErr) throw pErr;
    return await toPublicUser(user, profile);
  },
  async login({ email, password, role }) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    const user = data?.user;
    if (!user) throw new Error('Unable to sign in. Please try again.');
    const profile = await this.fetchProfile(user.id);
    if (role && profile?.role && profile.role !== role) {
      throw new Error(`This account is registered for the ${profile.role} portal, not ${role}.`);
    }
    return await toPublicUser(user, profile);
  },
  async logout() {
    await supabase.auth.signOut();
  },
  async getCurrentUser() {
    const { data } = await supabase.auth.getUser();
    const user = data?.user;
    if (!user) return null;
    const profile = await this.fetchProfile(user.id);
    return await toPublicUser(user, profile);
  },
  async fetchProfile(userId) {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
    return data || null;
  },

  // --- Profil & verifikasi (demo) ---
  // Verifikasi email/telepon yang disimulasikan: kode 6 digit "dikirim" dan
  // dikembalikan agar bisa ditampilkan di layar (tidak ada SMS/email sungguhan
  // dalam demo).
  async sendVerificationCode(channel) {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = Date.now() + 10 * 60 * 1000;
    localStorage.setItem('sa7tein:verifyCode:' + channel, JSON.stringify({ code, expiresAt }));
    return { demoCode: code };
  },
  async verifyCode(channel, code) {
    try {
      const stored = JSON.parse(localStorage.getItem('sa7tein:verifyCode:' + channel) || 'null');
      // Verifikasi tidak menghabiskan kode: kode tetap valid saat dicek, dan baru
      // benar-benar terpakai setelah penyimpanan berhasil (dipakai UI settings & updateProfile).
      return !!stored && stored.code === code && stored.expiresAt >= Date.now();
    } catch {
      return false;
    }
  },
  async updateProfile(patch, { emailCode, phoneCode } = {}) {
    const { data } = await supabase.auth.getUser();
    const user = data?.user;
    if (!user) throw new Error('Not signed in.');
    const profile = await this.fetchProfile(user.id);
    const row = {};
    if (patch.name !== undefined) row.name = String(patch.name).trim();
    if (patch.address !== undefined) row.address = patch.address || '';
    if (patch.phone !== undefined && patch.phone !== (profile?.phone || '')) {
      if (!phoneCode || !(await this.verifyCode('phone', phoneCode))) throw new Error('Please verify your new phone number first.');
      localStorage.removeItem('sa7tein:verifyCode:phone');
      row.phone = String(patch.phone).trim();
    }
    if (patch.email !== undefined && patch.email !== user.email) {
      if (!emailCode || !(await this.verifyCode('email', emailCode))) throw new Error('Please verify your new email address first.');
      localStorage.removeItem('sa7tein:verifyCode:email');
      row.email = String(patch.email).trim().toLowerCase();
      // Catatan: mengganti email asli Supabase auth butuh admin API;
      // untuk demo, email baru disimpan di profil.
    }
    const { error } = await supabase.from('profiles').update(row).eq('id', user.id);
    if (error) throw error;
    // Nama & alamat merchant ADALAH milik restoran: jaga baris merchants tetap
    // sinkron agar Settings dan dashboard menampilkan satu nama/alamat yang sama.
    const updated = { ...(profile || {}), ...row };
    if (updated.role === 'merchant' && updated.merchant_id) {
      const mRow = {};
      if (row.name !== undefined) mRow.name = row.name;
      if (row.address !== undefined) mRow.address = row.address;
      if (patch.lat !== undefined) mRow.lat = patch.lat;
      if (patch.lng !== undefined) mRow.lng = patch.lng;
      if (Object.keys(mRow).length > 0) {
        await supabase.from('merchants').update(mRow).eq('id', updated.merchant_id);
      }
    }
    // Nama kurir juga merupakan nama profil kurirnya.
    if (updated.role === 'courier' && updated.courier_id && row.name !== undefined) {
      await supabase.from('couriers').update({ name: row.name }).eq('id', updated.courier_id);
    }
    return await toPublicUser(user, updated);
  },

  // --- Restoran ---
  async getMerchants() {
    const { data, error } = await supabase.from('merchants').select('*').order('name');
    if (error) throw error;
    return data;
  },
  onMerchantsChange(cb) {
    const ch = supabase
      .channel('merchants')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'merchants' }, async () => {
        const merchants = await this.getMerchants();
        cb(merchants);
      })
      .subscribe();
    return () => supabase.removeChannel(ch);
  },
  async updateMerchant(merchantId, patch) {
    const { error } = await supabase.from('merchants').update(patch).eq('id', merchantId);
    if (error) throw error;
    // Jaga nama/alamat profil merchant yang sedang masuk tetap sinkron.
    if (patch.name === undefined && patch.address === undefined) return;
    const { data: authData } = await supabase.auth.getUser();
    const authUser = authData?.user;
    if (!authUser) return;
    const { data: profile } = await supabase.from('profiles').select('*').eq('id', authUser.id).maybeSingle();
    if (profile && profile.role === 'merchant' && profile.merchant_id === merchantId) {
      const pRow = {};
      if (patch.name !== undefined) pRow.name = patch.name;
      if (patch.address !== undefined) pRow.address = patch.address;
      await supabase.from('profiles').update(pRow).eq('id', authUser.id);
    }
  },

  // --- Status buka/tutup toko (per restoran) ---
  async getStoreStatus(merchantId) {
    const { data, error } = await supabase.from('settings').select('value').eq('key', `store_status:${merchantId}`).maybeSingle();
    if (error) throw error;
    return data ? data.value === true : true;
  },
  async setStoreStatus(merchantId, open) {
    const { error } = await supabase.from('settings').upsert({ key: `store_status:${merchantId}`, value: !!open }, { onConflict: 'key' });
    if (error) throw error;
    // Batalkan otomatis pesanan pending saat toko tutup (pesanan berjalan tetap lanjut)
    if (!open) {
      const orders = await this.getOrders();
      for (const o of orders) {
        if (o.restaurantId === merchantId && o.status === 'pending') {
          await this.updateOrderStatus(o.id, 'cancelled', { cancelledReason: 'store_closed' });
        }
      }
    }
  },
  onStoreStatusChange(cb) {
    const ch = supabase
      .channel('store-status')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'settings' }, (payload) => {
        const r = payload.new || payload.old;
        if (r && r.key && r.key.startsWith('store_status:')) {
          cb({ merchantId: r.key.replace('store_status:', ''), open: r.value === true });
        }
      })
      .subscribe();
    return () => supabase.removeChannel(ch);
  },

  async getMenu(merchantId) {
    await ensureSeed();
    let query = supabase.from('menu_items').select('*').order('name');
    if (merchantId) query = query.eq('merchant_id', merchantId);
    const { data, error } = await query;
    if (error) throw error;
    // App membaca `merchantId` (camelCase); Supabase menyimpan `merchant_id`.
    // Petakan baris agar UI (filter menu, keranjang, stok) bekerja sama dengan mode lokal.
    return (data || []).map((r) => ({ ...r, merchantId: r.merchant_id }));
  },
  async saveMenu(merchantId, items) {
    // Ganti hanya item restoran ini
    const { error: delErr } = await supabase.from('menu_items').delete().eq('merchant_id', merchantId);
    if (delErr) throw delErr;
    if (!items || items.length === 0) return;
    const rows = items.map((i) => ({
      id: i.id,
      merchant_id: merchantId,
      name: i.name,
      description: i.description,
      price: i.price,
      category: i.category,
      stock: i.stock,
      image: i.image,
      photo: i.photo || null,
      available: i.available,
    }));
    const { error } = await supabase.from('menu_items').insert(rows);
    if (error) throw error;
  },
  async updateStock(itemId, delta) {
    await ensureSeed();
    const { data } = await supabase.from('menu_items').select('stock').eq('id', itemId).single();
    const newStock = Math.max(0, (data?.stock ?? 0) + delta);
    const { error } = await supabase.from('menu_items').update({ stock: newStock }).eq('id', itemId);
    if (error) throw error;
  },
  onMenuChange(cb) {
    const ch = supabase
      .channel('menu-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'menu_items' }, async () => {
        const items = await this.getMenu();
        cb(items);
      })
      .subscribe();
    return () => supabase.removeChannel(ch);
  },

  async createOrder(order) {
    // Pengaman: tolak pesanan jika restoran tutup (dicek ulang saat submit,
    // sehingga toko yang tutup di tengah checkout tidak bisa menerima pesanan).
    const open = await this.getStoreStatus(order.restaurantId);
    if (!open) {
      throw new Error(`${order.restaurantName || 'This restaurant'} is currently closed. Please try again later.`);
    }
    // App web tidak mengisi id/code (backend lokal yang membuatnya), jadi
    // dibuat juga di sini — UI memakai order.id untuk routing dan order.code.
    const id = String(Date.now());
    const now = Date.now();
    const full = {
      ...order,
      id,
      code: order.code || 'SA-' + id,
      createdAt: now,
      status: 'pending',
      statusTimestamps: { pending: now },
    };
    const { data, error } = await supabase.from('orders').insert({ id, code: full.code, status: 'pending', data: full }).select('*').single();
    if (error) throw error;
    // kurangi stok secara langsung
    for (const li of full.items) {
      await this.updateStock(li.itemId, -li.qty);
    }
    return data.data;
  },
  async getOrders() {
    const { data, error } = await supabase.from('orders').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return data.map((r) => r.data);
  },
  onOrdersChange(cb) {
    const ch = supabase
      .channel('orders-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, async () => {
        const orders = await this.getOrders();
        cb(orders);
      })
      .subscribe();
    return () => supabase.removeChannel(ch);
  },
  async updateOrderStatus(orderId, status, extra = {}) {
    const { data } = await supabase.from('orders').select('data').eq('id', orderId).single();
    const current = data?.data || {};
    const merged = {
      ...current,
      ...extra,
      status,
      // Milidetik numerik, sama seperti backend lokal (UI menghitung ETA prep
      // dari statusTimestamps sebagai angka).
      statusTimestamps: { ...(current.statusTimestamps || {}), [status]: Date.now() },
    };
    const { error } = await supabase.from('orders').update({ status, data: merged }).eq('id', orderId);
    if (error) throw error;
    // Kembalikan stok saat order dibatalkan/ditolak (jendela cancel, toko tutup,
    // atau ditolak merchant) — hanya sekali, kalau belum berstatus batal.
    const wasClosed = current.status === 'cancelled' || current.status === 'rejected';
    if (!wasClosed && (status === 'cancelled' || status === 'rejected')) {
      for (const li of current.items || []) {
        await this.updateStock(li.itemId, li.qty);
      }
    }
  },
  // Claim order siap untuk kurir tertentu secara ATOMIK (compare-and-swap).
  // Update hanya berhasil bila status masih 'ready' DAN kondisi penugasan sesuai:
  //   - order yang ditugaskan (offer)  → assignedCourierId = kurir tsb & offerStatus 'pending'
  //   - order bebas (available)        → belum ada kurir (assignedCourierId null)
  // Kondisi dievaluasi terhadap baris lama, jadi hanya SATU kurir yang menang;
  // sisanya mendapat false → tidak ada double-claim saat tombol ditekan bersamaan.
  async claimOrder(orderId, courier, { expectedAssignedCourierId = null } = {}) {
    const { data } = await supabase.from('orders').select('data').eq('id', orderId).single();
    const current = data?.data || {};
    if (current.status !== 'ready') return false;
    if (expectedAssignedCourierId && (current.assignedCourierId !== expectedAssignedCourierId || current.offerStatus !== 'pending')) return false;
    if (!expectedAssignedCourierId && current.assignedCourierId) return false;
    const merged = {
      ...current,
      courierId: courier.id,
      courierName: courier.name,
      courierPhoto: courier.photo || null,
      offerStatus: 'accepted',
      courierLat: current.restaurantLat,
      courierLng: current.restaurantLng,
      remainingMeters: current.distanceMeters,
      status: 'picked_up',
      statusTimestamps: { ...(current.statusTimestamps || {}), picked_up: Date.now() },
    };
    let q = supabase.from('orders').update({ status: 'picked_up', data: merged }).eq('id', orderId).eq('status', 'ready');
    if (expectedAssignedCourierId) {
      q = q.eq('data->>assignedCourierId', expectedAssignedCourierId).eq('data->>offerStatus', 'pending');
    } else {
      q = q.is('data->>assignedCourierId', null);
    }
    const { data: rows, error } = await q.select('id');
    if (error) throw error;
    return Array.isArray(rows) && rows.length === 1;
  },
  async updateCourierLocation(orderId, loc) {
    const { data } = await supabase.from('orders').select('data').eq('id', orderId).single();
    const merged = { ...(data?.data || {}), ...loc };
    const { error } = await supabase.from('orders').update({ data: merged }).eq('id', orderId);
    if (error) throw error;
  },
  onCourierLocation(orderId, cb) {
    const ch = supabase
      .channel('courier-loc-' + orderId)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${orderId}` }, async () => {
        const { data } = await supabase.from('orders').select('data').eq('id', orderId).single();
        const d = data?.data;
        if (d && typeof d.courierLat === 'number') {
          cb({ lat: d.courierLat, lng: d.courierLng, remainingMeters: d.remainingMeters });
        }
      })
      .subscribe();
    return () => supabase.removeChannel(ch);
  },

  async getCouriers() {
    const { data, error } = await supabase.from('couriers').select('*');
    if (error) throw error;
    const rows = data && data.length ? data : seedCouriers;
    // App membaca `lastSeenAt` (camelCase); Supabase menyimpan `last_seen_at`.
    return rows.map((c) => ({ ...c, lastSeenAt: c.last_seen_at ?? null }));
  },
  async updateCourier(courierId, patch) {
    // Petakan nama field camelCase aplikasi → kolom snake_case Supabase
    // (mis. lastSeenAt → last_seen_at); field satu kata (online, name, photo)
    // sudah cocok langsung dengan kolom.
    const row = { ...patch };
    if (row.lastSeenAt !== undefined) {
      row.last_seen_at = row.lastSeenAt;
      delete row.lastSeenAt;
    }
    const { error } = await supabase.from('couriers').update(row).eq('id', courierId);
    if (error) throw error;
  },

  // --- Chat (pesan per-order, dikelompokkan per channel) ---
  // Channel: 'customer-merchant' | 'merchant-courier' | 'courier-customer'
  async getMessages(orderId) {
    const { data, error } = await supabase.from('order_messages').select('*').eq('order_id', orderId).order('created_at', { ascending: true });
    if (error) throw error;
    return (data || []).map((m) => ({
      id: m.id,
      orderId: m.order_id,
      channel: m.channel,
      senderId: m.sender_id,
      senderName: m.sender_name,
      senderRole: m.sender_role,
      text: m.text,
      createdAt: new Date(m.created_at).getTime(),
    }));
  },
  async sendMessage(orderId, msg) {
    const { data, error } = await supabase
      .from('order_messages')
      .insert({
        order_id: orderId,
        channel: msg.channel,
        sender_id: msg.senderId,
        sender_name: msg.senderName,
        sender_role: msg.senderRole,
        text: msg.text,
      })
      .select('*')
      .single();
    if (error) throw error;
    return {
      id: data.id,
      orderId: data.order_id,
      channel: data.channel,
      senderId: data.sender_id,
      senderName: data.sender_name,
      senderRole: data.sender_role,
      text: data.text,
      createdAt: new Date(data.created_at).getTime(),
    };
  },
  onMessagesChange(orderId, cb) {
    const ch = supabase
      .channel('chat-' + orderId)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'order_messages', filter: `order_id=eq.${orderId}` }, async () => {
        const messages = await this.getMessages(orderId);
        cb(messages);
      })
      .subscribe();
    return () => supabase.removeChannel(ch);
  },

  async resetDemo() {
    await supabase.from('order_messages').delete().neq('id', '');
    await supabase.from('orders').delete().neq('id', '');
    await supabase.from('menu_items').delete().neq('id', '');
    seeded = false;
  },
};
