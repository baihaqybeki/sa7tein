import { useEffect, useState, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useStore } from '@sa7tein/shared/lib/store.js';
import { getBackend } from '@sa7tein/shared/lib/backend/index.js';
import { haversineMeters, stepToward, WALKING_SPEED_MS, getCurrentPosition, formatDistance, formatDuration, formatRupiah } from '@sa7tein/shared/lib/geo.js';
import MapView from '@sa7tein/shared/components/MapView.jsx';
import StatusBadge from '@sa7tein/shared/components/StatusBadge.jsx';
import OrderChat from '@sa7tein/shared/components/OrderChat.jsx';
import OrderItemsList from '@sa7tein/shared/components/OrderItemsList.jsx';

// Frekuensi update posisi saat mengantar; GPS diprioritaskan, simulasi sebagai
// cadangan bila GPS gagal/tidak tersedia (mis. demo di browser).
const STEP_MS = 3000;
const GPS_TIMEOUT_MS = 4000;

export default function CourierDelivery() {
  const { id } = useParams();
  const navigate = useNavigate();
  const orders = useStore((s) => s.orders);
  const currentUser = useStore((s) => s.currentUser);
  const order = orders.find((o) => o.id === id);

  const [courierPos, setCourierPos] = useState(null);
  const intervalRef = useRef(null);

  // Jaga peta tetap sinkron dengan posisi kurir yang tersimpan, sehingga kembali
  // ke halaman ini memulihkan posisi terakhir kurir, bukan memulai ulang.
  useEffect(() => {
    if (order && order.courierLat != null && order.courierLng != null) {
      setCourierPos({ lat: order.courierLat, lng: order.courierLng });
    }
  }, [order?.courierLat, order?.courierLng, order?.id]);

  // Mulai pengantaran
  const startDelivery = async () => {
    if (!order) return;
    await getBackend().updateOrderStatus(order.id, 'on_the_way', {
      courierLat: order.restaurantLat,
      courierLng: order.restaurantLng,
      remainingMeters: order.distanceMeters,
    });
  };

  // Penyelesaian manual — pengaman bila kurir tiba di customer lebih dulu
  // daripada deteksi selesai dari simulasi berjalan kaki.
  const completeDelivery = async () => {
    if (!order) return;
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;
    const loc = courierPos || { lat: order.restaurantLat, lng: order.restaurantLng };
    await getBackend().updateOrderStatus(order.id, 'delivered', {
      courierLat: loc.lat,
      courierLng: loc.lng,
      remainingMeters: 0,
    });
  };

  // Pengantaran berlangsung selama order sedang dalam perjalanan.
  // Karena ini diikuti dari status order (bukan state komponen),
  // simulasi tetap berjalan benar setelah keluar & kembali ke halaman ini.
  const delivering = order?.status === 'on_the_way';

  // Simulasi berjalan kaki: perbarui posisi kurir secara real time
  useEffect(() => {
    if (!delivering || !order) return;
    if (intervalRef.current) clearInterval(intervalRef.current);

    let gpsBusy = false;
    intervalRef.current = setInterval(async () => {
      if (gpsBusy) return; // hindari tumpukan jika GPS lambat
      gpsBusy = true;
      try {
        const latest = useStore.getState().orders.find((o) => o.id === id);
        if (!latest) return;
        const to = { lat: latest.customerLat, lng: latest.customerLng };

        // Prioritas GPS sungguhan untuk live tracking. Gagal/timeout → simulasi.
        let pos = null;
        try {
          const gps = await Promise.race([getCurrentPosition(), new Promise((_, rej) => setTimeout(() => rej(new Error('GPS timeout')), GPS_TIMEOUT_MS))]);
          if (gps && typeof gps.latitude === 'number') pos = { lat: gps.latitude, lng: gps.longitude };
        } catch (e) {
          pos = null;
        }
        if (!pos) {
          const from = {
            lat: latest.courierLat != null ? latest.courierLat : latest.restaurantLat,
            lng: latest.courierLng != null ? latest.courierLng : latest.restaurantLng,
          };
          pos = stepToward(from, to, WALKING_SPEED_MS * (STEP_MS / 1000));
        }
        const remaining = Math.max(0, haversineMeters(pos, to));
        setCourierPos({ lat: pos.lat, lng: pos.lng });
        // Penyelesaian TIDAK otomatis — kurir menekan tombol "Complete Delivery"
        // secara manual (menghindari bug peta / kendala waktu pengiriman).
        await getBackend().updateCourierLocation(id, {
          courierLat: pos.lat,
          courierLng: pos.lng,
          remainingMeters: remaining,
        });
      } finally {
        gpsBusy = false;
      }
    }, STEP_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
    };
  }, [delivering, order?.id]);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  if (!order) {
    return (
      <div className="card p-10 text-center">
        <p className="text-sm text-gray-500">Delivery not found</p>
        <Link to="/" className="btn-primary mt-5">
          Back
        </Link>
      </div>
    );
  }

  const restaurant = { name: order.restaurantName, lat: order.restaurantLat, lng: order.restaurantLng };
  const customer = { lat: order.customerLat, lng: order.customerLng };
  const pos = courierPos || (order.courierLat != null ? { lat: order.courierLat, lng: order.courierLng } : { lat: order.restaurantLat, lng: order.restaurantLng });
  const remainingMeters = order.remainingMeters != null ? order.remainingMeters : order.distanceMeters;
  const isDone = order.status === 'delivered';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button onClick={() => navigate('/')} className="text-gray-400 hover:text-gray-600">
            ←
          </button>
          <h1 className="text-xl font-extrabold">{order.code}</h1>
        </div>
        <StatusBadge status={order.status} />
      </div>

      {/* Peta */}
      <div className="card overflow-hidden">
        <MapView
          center={[pos.lat, pos.lng]}
          restaurant={restaurant}
          customer={customer}
          courier={pos}
          route={[
            [restaurant.lat, restaurant.lng],
            [pos.lat, pos.lng],
            [customer.lat, customer.lng],
          ]}
          className="h-64"
        />
        <div className="flex items-center justify-between bg-gray-900 px-4 py-3 text-white">
          <div>
            <div className="text-[11px] text-gray-400">Distance left</div>
            <div className="text-lg font-extrabold">{formatDistance(remainingMeters)}</div>
          </div>
          <div className="text-right">
            <div className="text-[11px] text-gray-400">Estimated arrival</div>
            <div className="text-lg font-extrabold text-go-400">{formatDuration(remainingMeters / WALKING_SPEED_MS)}</div>
          </div>
        </div>
      </div>

      {/* Kontrol */}
      {order.status === 'picked_up' && (
        <div className="card p-4">
          <button onClick={startDelivery} className="btn-primary w-full py-3">
            🛵 Start Delivery (on foot)
          </button>
        </div>
      )}

      {order.status === 'on_the_way' && (
        <div className="card p-4 text-center">
          <span className="text-sm font-bold text-go-600 animate-pulse">🚶 Courier is walking to the customer…</span>
        </div>
      )}

      {/* Penyelesaian delivery DILAKUKAN MANUAL oleh kurir — hindari bug peta
          / kendala waktu pengiriman. Tidak ada auto-complete dari simulasi. */}
      {order.status === 'on_the_way' && (
        <div className="card flex items-center justify-between gap-3 border-2 border-go-500/40 p-4">
          <div>
            <div className="text-sm font-bold text-gray-800">📍 Already at the customer?</div>
            <div className="text-xs text-gray-400">Tap Complete Delivery to finish — no need to wait for the map/simulation.</div>
          </div>
          <button onClick={completeDelivery} className="btn-primary shrink-0">
            ✅ Complete Delivery
          </button>
        </div>
      )}

      {isDone && (
        <div className="card bg-go-50 p-4 text-center">
          <div className="text-3xl">🎉</div>
          <div className="mt-1 text-sm font-extrabold text-go-700">Order delivered to customer</div>
          <button onClick={() => navigate('/')} className="btn-primary mt-3">
            Back to Dashboard
          </button>
        </div>
      )}

      {order.status === 'ready' && (
        <div className="card p-4 text-center text-sm text-gray-500">
          Order is ready at the restaurant. Press <b>Pick Up & Deliver</b> on the dashboard first.
        </div>
      )}

      {/* Chat: dengan merchant setelah ditugaskan, dengan customer saat mengantar */}
      <OrderChat order={order} currentUser={currentUser} className="card p-4" />

      {/* Detail */}
      <div className="card p-4">
        <h2 className="mb-2 text-sm font-bold text-gray-700">Order Details</h2>
        <OrderItemsList items={order.items} />
        <div className="mt-3 space-y-1 border-t border-gray-100 pt-2 text-sm">
          <div className="flex justify-between text-gray-500">
            <span>📍 {order.customerAddress}</span>
          </div>
          <div className="flex justify-between text-gray-500">
            <span>Subtotal</span>
            <span>{formatRupiah(order.subtotal)}</span>
          </div>
          <div className="flex justify-between text-gray-500">
            <span>Delivery fee (on foot)</span>
            <span>{formatRupiah(order.courierCost)}</span>
          </div>
          <div className="flex justify-between pt-1 text-base font-extrabold">
            <span>Total</span>
            <span className="text-go-600">{formatRupiah(order.total)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
