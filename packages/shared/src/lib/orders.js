// ============================================================
//  Helper penawaran / penugasan kurir
//  Dipakai bersama oleh portal merchant (mengirim offer) dan
//  portal kurir (menerima atau menolaknya).
// ============================================================
import { findBestCourier } from './geo.js';

// Berapa lama kurir boleh diam (tidak ACC juga tidak REJECT) sebelum offer
// otomatis diteruskan ke kurir berikutnya.
export const OFFER_TIMEOUT_MS = 60 * 1000; // 60 detik

// Menugaskan kurir terbaik ke order yang siap diantar lalu mengirim offer.
// "Terbaik" = paling dekat (prioritas utama), tidak sedang sibuk, lalu paling
// sedikit pengiriman (lihat findBestCourier). Ketika semua kurir menolak/
// timeout, order tetap ready dan tanpa penugasan sehingga kurir mana pun
// bisa mengambilnya dari dashboard.
export async function offerToNearestCourier(backend, order, { excludeIds = [], orders = [] } = {}) {
  const couriers = await backend.getCouriers();
  const from = { lat: order.restaurantLat, lng: order.restaurantLng };
  const nearest = findBestCourier(couriers, from, { excludeIds, orders });
  await backend.updateOrderStatus(order.id, 'ready', {
    assignedCourierId: nearest ? nearest.id : null,
    assignedCourierName: nearest ? nearest.name : null,
    offerStatus: nearest ? 'pending' : null,
    rejectedBy: excludeIds,
    offerSentAt: Date.now(),
  });
  return nearest;
}

// Kurir menerima offer / mengambil order siap → order berpindah ke picked_up.
// Memakai backend.claimOrder() (conditional update ATOMIK) agar tidak terjadi
// double-claim bila beberapa kurir menekan tombol bersamaan. Melempar error
// ORDER_ALREADY_TAKEN bila order sudah diambil/ditugaskan ke kurir lain.
export async function acceptOffer(backend, order, courier) {
  const ok = await backend.claimOrder(order.id, courier, { expectedAssignedCourierId: order.assignedCourierId || null });
  if (!ok) throw new Error('ORDER_ALREADY_TAKEN');
  return true;
}

// Kurir menolak offer → offer diteruskan ke kurir terbaik berikutnya.
export async function rejectOffer(backend, order, courierId, { orders = [] } = {}) {
  const excludeIds = [...new Set([...(order.rejectedBy || []), courierId])];
  await offerToNearestCourier(backend, order, { excludeIds, orders });
}

// Auto-reoffer: cek order yang statusnya 'ready' dengan offer 'pending' tapi
// kurir tidak merespons dalam OFFER_TIMEOUT_MS → anggap tidak bersedia dan
// teruskan ke kurir terdekat berikutnya (atau jadi tersedia untuk semua kurir
// kalau semua sudah dicoba). Dipanggil berkala oleh portal merchant sebagai
// satu-satunya "orchestrator" agar tidak terjadi reoffer ganda.
export async function handleStaleOffers(backend, orders) {
  const now = Date.now();
  for (const o of orders || []) {
    if (o.status !== 'ready' || o.offerStatus !== 'pending' || !o.assignedCourierId) continue;
    const sentAt = o.offerSentAt || o.statusTimestamps?.ready || o.createdAt;
    if (!sentAt || now - sentAt < OFFER_TIMEOUT_MS) continue;
    const ignored = o.assignedCourierName || o.assignedCourierId;
    const excludeIds = [...new Set([...(o.rejectedBy || []), o.assignedCourierId])];
    const next = await offerToNearestCourier(backend, o, { excludeIds, orders });
    console.log(`[reoffer] ${o.code} kurir "${ignored}" tidak merespons → ${next ? `offer ke "${next.name}"` : 'menjadi tersedia untuk semua kurir'}`);
  }
}
