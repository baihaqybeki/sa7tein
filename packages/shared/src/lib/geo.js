// ============================================================
//  Utilitas geo: jarak, waktu tempuh, dan ongkos kurir per jarak
// ============================================================
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';

// Lokasi restoran demo (Warung Nusantara, Jakarta Pusat)
export const RESTAURANT = {
  name: 'Warung Nusantara',
  address: 'Jl. Kebon Sirih No. 8, Jakarta Pusat',
  lat: -6.2,
  lng: 106.8166,
};

// Kecepatan jalan kurir: ±4,9 km/jam ≈ 1,35 m/detik
export const WALKING_SPEED_MS = 1.35;

// Tarif kurir jalan kaki (Rupiah)
export const COURIER_COST = {
  base: 5000, // biaya dasar
  perKm: 2500, // per km
  min: 5000, // biaya minimum
  round: 500, // pembulatan ke kelipatan 500
};

// Jarak Haversine antara dua koordinat (meter)
export function haversineMeters(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// Perkiraan waktu jalan kaki (detik)
export function walkingTimeSeconds(meters) {
  return meters / WALKING_SPEED_MS;
}

// Perkiraan waktu order siap (merchant mengatur waktu prep, default 15 menit)
export function estimateEta(prepTimeMinutes, travelTimeSeconds) {
  return prepTimeMinutes * 60 + travelTimeSeconds;
}

// Ongkos kurir berdasarkan jarak (jalan kaki)
export function calculateCourierCost(distanceMeters) {
  const km = distanceMeters / 1000;
  const raw = COURIER_COST.base + km * COURIER_COST.perKm;
  const rounded = Math.max(COURIER_COST.min, Math.ceil(raw / COURIER_COST.round) * COURIER_COST.round);
  return rounded;
}

export function formatDuration(sec) {
  if (!isFinite(sec) || sec <= 0) return '—';
  const m = Math.round(sec / 60);
  if (m < 1) return '< 1 min';
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return mm ? `${h} hr ${mm} min` : `${h} hr`;
}

export function formatDistance(meters) {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(2)} km`;
}

export function formatRupiah(n) {
  return 'Rp' + Math.round(n || 0).toLocaleString('id-ID');
}

// Interpolasi linier dari titik A menuju B dengan sedikit jitter
// (dipakai untuk mensimulasikan kurir yang bergerak)
export function stepToward(from, to, distanceMeters) {
  const total = haversineMeters(from, to);
  if (total <= distanceMeters) return { lat: to.lat, lng: to.lng, arrived: true };
  const t = distanceMeters / total;
  const jitter = () => (Math.random() - 0.5) * 0.00004;
  return {
    lat: from.lat + (to.lat - from.lat) * t + jitter(),
    lng: from.lng + (to.lng - from.lng) * t + jitter(),
    arrived: false,
  };
}
// Cari kurir yang paling dekat dengan titik tujuan, opsional mengecualikan
// beberapa kurir (mis. yang sudah menolak offer).
export function findNearestCourier(couriers, target, excludeIds = []) {
  const candidates = couriers
    .filter((c) => !excludeIds.includes(c.id) && typeof c.lat === 'number' && typeof c.lng === 'number')
    .map((c) => ({ courier: c, distance: haversineMeters(target, c) }))
    .sort((a, b) => a.distance - b.distance);
  return candidates[0]?.courier || null;
}

// Jendela waktu kurir dianggap masih online sejak heartbeat terakhirnya.
// Jika lebih dari ini tanpa heartbeat (mis. app ditutup tanpa logout),
// kurir otomatis dianggap offline dan tidak menerima penawaran.
export const ONLINE_WINDOW_MS = 120 * 1000; // 2 menit

// Distribusi kurir saat order siap diantar — JARAK menjadi prioritas utama:
// 1. Hanya kurir yang ONLINE (login + heartbeat aktif) yang dipertimbangkan —
//    kurir yang tidak login/tidak aktif dilewati.
// 2. Skip kurir yang menolak / timeout (excludeIds).
// 3. Pilih kurir yang PALING DEKAT dulu; jika jarak sama, prioritaskan yang
//    paling sedikit jumlah pengirimannya (done).
// 4. Hanya kurir yang senggang (tidak sedang mengantar) yang dipilih —
//    kurir yang sedang mengantar dilewati.
// 5. Jika SEMUA kurir sibuk, fallback kembali ke kurir terdekat (jadi satu
//    kurir boleh mengantar lebih dari satu pesanan), tetap dengan prioritas
//    yang paling sedikit sedang mengantar.
export function findBestCourier(couriers, target, { excludeIds = [], orders = [] } = {}) {
  // Jumlah order yang sedang dipegang tiap kurir (picked_up / on_the_way)
  const activeCount = {};
  for (const o of orders || []) {
    if (['picked_up', 'on_the_way'].includes(o.status) && o.courierId) {
      activeCount[o.courierId] = (activeCount[o.courierId] || 0) + 1;
    }
  }
  const busy = new Set(Object.keys(activeCount));
  // Jumlah pengiriman yang sudah selesai tiap kurir (untuk tie-break)
  const doneCount = {};
  for (const o of orders || []) {
    if (o.status === 'delivered' && o.courierId) doneCount[o.courierId] = (doneCount[o.courierId] || 0) + 1;
  }
  const withDist = (list) =>
    list
      .filter((c) => typeof c.lat === 'number' && typeof c.lng === 'number')
      .map((c) => ({
        courier: c,
        distance: haversineMeters(target, c),
        done: doneCount[c.id] || 0,
        active: activeCount[c.id] || 0,
      }));

  // Hanya kurir yang ONLINE yang dipertimbangkan: online=true DAN heartbeat
  // masih segar (lastSeenAt dalam ONLINE_WINDOW_MS). Kurir tanpa online (akun
  // lama) dianggap offline.
  const now = Date.now();
  const isOnline = (c) => c.online === true && (!c.lastSeenAt || now - c.lastSeenAt <= ONLINE_WINDOW_MS);
  const candidates = withDist(couriers.filter((c) => !excludeIds.includes(c.id) && isOnline(c)));

  // Prioritaskan kurir yang senggang: urutkan berdasarkan jarak (utama),
  // lalu sedikitnya pengiriman (tie-break).
  const idle = candidates.filter((c) => !busy.has(c.courier.id));
  if (idle.length) {
    idle.sort((a, b) => a.distance - b.distance || a.done - b.done);
    return idle[0].courier;
  }
  // Semua sibuk → kembali ke yang terdekat (satu kurir boleh antar >1 pesanan),
  // dengan prioritas yang paling sedikit sedang mengantar.
  candidates.sort((a, b) => a.distance - b.distance || a.active - b.active);
  return candidates[0]?.courier || null;
}

// ============================================================
//  Geolokasi — bekerja di browser MAUPUN di aplikasi native (Capacitor).
//  Di WebView native, navigator.geolocation saja tidak memunculkan izin;
//  butuh plugin @capacitor/geolocation (dengan NSLocationWhenInUseUsageDescription
//  di iOS / izin lokasi di Android). Di web ia kembali ke navigator.geolocation.
// ============================================================

// Bernilai true ketika berjalan di dalam aplikasi native Capacitor (bukan browser/PWA).
export function isNativePlatform() {
  return typeof window !== 'undefined' && !!Capacitor.isNativePlatform?.();
}

// Posisi perangkat berbasis Promise. Menghasilkan { latitude, longitude }.
export function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    const fail = (err) => reject(err instanceof Error ? err : new Error(String(err?.message || err) || 'Unable to get your location.'));
    if (isNativePlatform()) {
      // App native: pakai plugin Capacitor (memunculkan izin native)
      Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 15000 })
        .then((pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }))
        .catch(fail);
      return;
    }
    // Browser / PWA: navigator.geolocation (butuh HTTPS + izin pengguna)
    if (!navigator.geolocation) return reject(new Error('Geolocation is not supported on this device.'));
    navigator.geolocation.getCurrentPosition((pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }), fail, { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 });
  });
}

// Reverse geocode koordinat menjadi alamat terbaca menggunakan OpenStreetMap
// Nominatim (gratis, tanpa API key). Mengembalikan null jika tidak bisa diurai
// agar pemanggil bisa memakai alamat yang diketik. Dipakai mengisi alamat otomatis
// saat pin lokasi dipindah di peta.
export async function reverseGeocode(lat, lng) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&zoom=18&addressdetails=1`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || data.error || !data.display_name) return null;
    return data.display_name;
  } catch (err) {
    console.warn('Reverse geocode failed:', err);
    return null;
  }
}

// Forward geocode / autocomplete kueri alamat menggunakan OpenStreetMap
// Nominatim (gratis, tanpa API key). Mengembalikan hingga 5 saran berupa
// { display_name, lat, lng } sehingga memilih satu bisa mengisi alamat dan
// lokasi pin peta sekaligus.
export async function searchAddress(query) {
  const q = String(query || '').trim();
  if (q.length < 3) return [];
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(q)}&addressdetails=1&limit=5`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return data.filter((r) => r.display_name && r.lat && r.lon).map((r) => ({ display_name: r.display_name, lat: Number(r.lat), lng: Number(r.lon) }));
  } catch (err) {
    console.warn('Address search failed:', err);
    return [];
  }
}
