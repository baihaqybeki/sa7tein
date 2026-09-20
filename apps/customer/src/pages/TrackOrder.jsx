import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useStore, ORDER_STATUS_LABEL } from '@sa7tein/shared/lib/store.js';
import { getBackend } from '@sa7tein/shared/lib/backend/index.js';
import { formatRupiah, formatDuration, formatDistance, WALKING_SPEED_MS, haversineMeters } from '@sa7tein/shared/lib/geo.js';
import { isPhoto } from '@sa7tein/shared/lib/image.js';
import MapView from '@sa7tein/shared/components/MapView.jsx';
import StatusBadge from '@sa7tein/shared/components/StatusBadge.jsx';
import OrderChat from '@sa7tein/shared/components/OrderChat.jsx';
import OrderStatusTimeline from '@sa7tein/shared/components/OrderStatusTimeline.jsx';
import OrderItemsList from '@sa7tein/shared/components/OrderItemsList.jsx';

export default function TrackOrder() {
  const { id } = useParams();
  const orders = useStore((s) => s.orders);
  const currentUser = useStore((s) => s.currentUser);
  const order = orders.find((o) => o.id === id);

  const [courierPos, setCourierPos] = useState(null);
  const [now, setNow] = useState(Date.now());

  // Berlangganan pembaruan lokasi kurir
  useEffect(() => {
    const backend = getBackend();
    const initial = order && order.courierLat != null ? { lat: order.courierLat, lng: order.courierLng } : null;
    if (initial) setCourierPos(initial);
    const unsub = backend.onCourierLocation(id, (loc) => {
      if (loc && typeof loc.lat === 'number') setCourierPos({ lat: loc.lat, lng: loc.lng });
    });
    return unsub;
  }, [id, !!order]);

  // Penghitung waktu ETA
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  if (!order) {
    return (
      <div className="card p-10 text-center">
        <div className="text-4xl">🔍</div>
        <p className="mt-3 text-sm text-gray-500">Order not found</p>
        <Link to="/orders" className="btn-primary mt-5">
          Back
        </Link>
      </div>
    );
  }

  const isInDelivery = ['picked_up', 'on_the_way'].includes(order.status);
  const restaurant = { name: order.restaurantName, lat: order.restaurantLat, lng: order.restaurantLng };
  const customer = { lat: order.customerLat, lng: order.customerLng };

  // Hitung jarak dan waktu tersisa dari posisi kurir saat ini
  let remainingMeters = order.remainingMeters;
  if (courierPos && isInDelivery) {
    remainingMeters = haversineMeters(courierPos, customer);
  }
  const remainingTimeSec = remainingMeters != null ? remainingMeters / WALKING_SPEED_MS : order.travelTimeSeconds;

  // Notifikasi "pesanan hampir tiba" — memakai estimasi waktu pengiriman.
  // Saat kurir tinggal beberapa saat lagi (<= ambang), tampilkan banner ke customer.
  const ALMOST_THERE_SEC = 90;
  const almostThere = isInDelivery && remainingTimeSec > 0 && remainingTimeSec <= ALMOST_THERE_SEC;

  // Waktu selesai penyiapan makanan
  const prepAt = order.statusTimestamps?.preparing;
  const prepEndsAt = prepAt ? prepAt + (order.prepTimeMinutes || 15) * 60 * 1000 : null;
  const prepRemaining = prepEndsAt ? Math.max(0, Math.round((prepEndsAt - now) / 1000)) : null;

  const etaTotal = order.status === 'on_the_way' || order.status === 'picked_up' ? remainingTimeSec : prepRemaining != null ? prepRemaining + remainingTimeSec : (order.prepTimeMinutes || 15) * 60 + order.travelTimeSeconds;

  const progress = order.distanceMeters > 0 ? Math.max(0, Math.min(1, 1 - remainingMeters / order.distanceMeters)) : 0;

  // --- Jendela konfirmasi 15 detik (ala GoFood) ---
  // Customer bisa batal selama order masih 'pending' dan dalam 15 detik
  // setelah dipesan (antisipasi salah pencet / salah order).
  const CANCEL_WINDOW_MS = 15000;
  const cancelLeftMs = order.status === 'pending' && order.createdAt ? order.createdAt + CANCEL_WINDOW_MS - now : 0;
  const isCancellable = cancelLeftMs > 0;
  const cancelLeftSec = Math.max(0, Math.round(cancelLeftMs / 1000));

  const cancelOrder = async () => {
    if (!window.confirm('Cancel this order? You will not be charged.')) return;
    try {
      await getBackend().updateOrderStatus(order.id, 'cancelled', { cancelledReason: 'customer_cancelled' });
    } catch (e) {
      console.error(e);
      alert('Failed to cancel the order. Please try again.');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-extrabold">Track Order</h1>
        <StatusBadge status={order.status} />
      </div>
      <p className="-mt-3 text-xs text-gray-400">
        {order.code} · {new Date(order.createdAt).toLocaleString('en-US')}
      </p>

      {/* Jendela batal 15 detik (ala GoFood) — biar customer bisa mengurungkan
          order yang salah pencet / salah pesan sebelum restoran konfirmasi */}
      {isCancellable && (
        <div className="card border border-amber-200 bg-amber-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-extrabold text-amber-700">⏳ Confirm your order</div>
              <p className="mt-0.5 text-xs text-amber-600">
                You can cancel within <b className="text-amber-700">{cancelLeftSec}s</b> in case you made a mistake.
              </p>
            </div>
            <button onClick={cancelOrder} className="btn-outline !border-red-300 !text-red-600 hover:bg-red-50">
              ✕ Cancel order
            </button>
          </div>
        </div>
      )}

      {/* Notifikasi pembatalan (mis. restoran tutup sebelum mengonfirmasi) */}
      {order.status === 'cancelled' && (
        <div className="card border border-red-200 bg-red-50 p-4 text-center">
          <div className="text-2xl">😔</div>
          <p className="mt-1 text-sm font-extrabold text-red-600">
            {order.cancelledReason === 'store_closed' ? 'Your order was cancelled because the restaurant closed.' : order.cancelledReason === 'customer_cancelled' ? 'You cancelled this order.' : 'This order was cancelled.'}
          </p>
          <p className="mt-1 text-xs text-red-500">You were not charged, and the items were returned to stock.</p>
        </div>
      )}

      {/* Notifikasi: pesanan hampir tiba (dari estimasi waktu pengiriman) */}
      {almostThere && (
        <div className="card border border-go-500/40 bg-go-50 p-4">
          <div className="flex items-center gap-3">
            <span className="animate-bounce text-2xl">🛵</span>
            <div>
              <div className="text-sm font-extrabold text-go-700">Your order is almost here! 🎉</div>
              <p className="text-xs text-go-600">
                {order.courierName || 'Your courier'} will arrive in about <b>{formatDuration(remainingTimeSec)}</b>. Please get ready.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Peta pelacakan langsung */}
      <div className="card overflow-hidden">
        <MapView
          center={courierPos ? [courierPos.lat, courierPos.lng] : [(restaurant.lat + customer.lat) / 2, (restaurant.lng + customer.lng) / 2]}
          restaurant={restaurant}
          customer={customer}
          courier={courierPos}
          route={
            courierPos
              ? [
                  [restaurant.lat, restaurant.lng],
                  [courierPos.lat, courierPos.lng],
                  [customer.lat, customer.lng],
                ]
              : null
          }
          className="h-64"
        />
        <div className="flex items-center justify-between bg-gray-900 px-4 py-3 text-white">
          <div>
            <div className="text-[11px] text-gray-400">Courier distance left</div>
            <div className="text-lg font-extrabold">{order.status === 'delivered' ? '0 m' : isInDelivery && courierPos ? formatDistance(remainingMeters) : formatDistance(order.distanceMeters)}</div>
          </div>
          <div className="text-right">
            <div className="text-[11px] text-gray-400">Estimated arrival</div>
            <div className="text-lg font-extrabold text-go-400">{order.status === 'delivered' ? 'Arrived 🎉' : isInDelivery ? formatDuration(remainingTimeSec) : formatDuration(etaTotal)}</div>
          </div>
        </div>
      </div>

      {/* Bar progres pengantaran */}
      {isInDelivery && (
        <div className="card p-4">
          <div className="mb-1.5 flex justify-between text-xs font-bold text-gray-500">
            <span>Courier {courierPos ? 'is on the move…' : 'is preparing the route'}</span>
            <span>{Math.round(progress * 100)}%</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-gray-100">
            <div className="h-full rounded-full bg-go-500 transition-all duration-1000" style={{ width: `${progress * 100}%` }} />
          </div>
          <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
            <span className="animate-pulse text-go-500">🛵</span>
            {courierPos ? `Courier ${order.courierName || 'Sa7tein'} is heading to you` : 'Courier is picking up your order at the restaurant'}
          </div>
        </div>
      )}

      {/* Kartu kurir — siapa yang mengantarkan pesanan Anda */}
      {(isInDelivery || order.status === 'delivered') && (
        <div className="card flex items-center gap-3 p-4">
          {isPhoto(order.courierPhoto) ? (
            <img src={order.courierPhoto} alt={order.courierName || 'Courier'} className="h-14 w-14 shrink-0 rounded-full object-cover ring-2 ring-go-500/40" />
          ) : (
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-go-100 text-2xl">🛵</span>
          )}
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold text-gray-800">{order.courierName || 'Sa7tein courier'}</div>
            <div className="text-xs text-gray-400">{order.status === 'delivered' ? 'Delivered your order' : 'Carrying your order right now'}</div>
          </div>
          {order.status === 'delivered' ? <span className="text-2xl">🎉</span> : <span className="animate-pulse text-xl">🛵</span>}
        </div>
      )}

      {/* Chat: dengan restoran, dan dengan kurir setelah pengantaran dimulai */}
      <OrderChat order={order} currentUser={currentUser} className="card p-4" />

      {/* Linimasa status */}
      <div className="card p-4">
        <h2 className="mb-3 text-sm font-bold text-gray-700">Order Status</h2>
        <OrderStatusTimeline status={order.status} />
      </div>

      {/* Detail */}
      <div className="card p-4">
        <h2 className="mb-2 text-sm font-bold text-gray-700">Order Details</h2>
        {order.restaurantName && (
          <div className="mb-2 flex items-center gap-2 border-b border-gray-100 pb-2">
            {isPhoto(order.restaurantPhoto) ? (
              <img src={order.restaurantPhoto} alt={order.restaurantName} className="h-9 w-9 shrink-0 rounded-lg object-cover ring-1 ring-gray-100" />
            ) : (
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-go-50 text-lg">🏪</span>
            )}
            <span className="text-sm font-semibold text-gray-800">{order.restaurantName}</span>
          </div>
        )}
        <OrderItemsList items={order.items} />
        <div className="mt-3 space-y-1 border-t border-gray-100 pt-2 text-sm">
          <div className="flex justify-between text-gray-500">
            <span>Subtotal</span>
            <span>{formatRupiah(order.subtotal)}</span>
          </div>
          <div className="flex justify-between text-gray-500">
            <span>Delivery fee</span>
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
