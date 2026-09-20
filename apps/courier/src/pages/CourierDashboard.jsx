import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '@sa7tein/shared/lib/store.js';
import { getBackend } from '@sa7tein/shared/lib/backend/index.js';
import { acceptOffer, rejectOffer } from '@sa7tein/shared/lib/orders.js';
import { formatRupiah, formatDistance, formatDuration, haversineMeters } from '@sa7tein/shared/lib/geo.js';
import StatusBadge from '@sa7tein/shared/components/StatusBadge.jsx';
import OrderChat from '@sa7tein/shared/components/OrderChat.jsx';
import PhotoUploader from '@sa7tein/shared/components/PhotoUploader.jsx';

export default function CourierDashboard() {
  const orders = useStore((s) => s.orders);
  const setOrders = useStore((s) => s.setOrders);
  const currentUser = useStore((s) => s.currentUser);
  const courierOnline = useStore((s) => s.courierOnline);
  const setCourierOnline = useStore((s) => s.setCourierOnline);
  const navigate = useNavigate();
  const [couriers, setCouriers] = useState([]);
  const [onlineOpen, setOnlineOpen] = useState(false);

  // Muat profil kurir (beserta lokasi) dari backend
  useEffect(() => {
    getBackend().getCouriers().then(setCouriers).catch(console.error);
  }, []);

  // Setiap akun kurir terikat ke satu profil kurir (lewat courierId, dengan
  // nama sebagai cadangan) — tidak ada lagi pengalih persona.
  const selectedCourier = couriers.find((c) => c.id === currentUser?.courierId) || couriers.find((c) => (c.name || '').toLowerCase() === (currentUser?.name || '').toLowerCase()) || null;

  // Inisialisasi status online dari profil kurir (dipilih manual via dropdown)
  useEffect(() => {
    if (courierOnline === null && selectedCourier) {
      setCourierOnline(!!selectedCourier.online);
    }
  }, [selectedCourier?.id, courierOnline, setCourierOnline]);

  // Ganti status online/offline secara manual (tetap bisa login saat offline)
  const toggleOnline = async (on) => {
    if (!selectedCourier) return;
    setCourierOnline(on);
    setOnlineOpen(false);
    await getBackend()
      .updateCourier(selectedCourier.id, { online: on, lastSeenAt: on ? Date.now() : null })
      .catch(console.error);
    getBackend().getCouriers().then(setCouriers).catch(console.error);
  };

  const savePhoto = async (photo) => {
    if (!selectedCourier) return;
    await getBackend().updateCourier(selectedCourier.id, { photo: photo || null });
    // Segarkan agar foto tersimpan langsung tampil dan dipakai untuk offer berikutnya
    getBackend().getCouriers().then(setCouriers).catch(console.error);
  };

  // Offer yang dikirim ke kurir ini karena dia yang paling dekat
  const offers = orders.filter((o) => o.status === 'ready' && o.assignedCourierId === selectedCourier?.id && o.offerStatus === 'pending');
  // Order siap yang belum punya kurir (cadangan, mis. setelah semua menolak)
  const available = orders.filter((o) => o.status === 'ready' && !o.assignedCourierId);
  const mine = orders.filter((o) => ['picked_up', 'on_the_way'].includes(o.status) && o.courierId === selectedCourier?.id);
  const done = orders.filter((o) => o.status === 'delivered' && o.courierId === selectedCourier?.id);
  const earnings = done.reduce((sum, o) => sum + o.courierCost, 0);

  const courierDistanceTo = (o) => {
    if (!selectedCourier || typeof selectedCourier.lat !== 'number') return null;
    return haversineMeters(selectedCourier, { lat: o.restaurantLat, lng: o.restaurantLng });
  };

  // Segarkan daftar order setelah gagal claim (agar antrean tidak menampilkan
  // order yang ternyata sudah diambil kurir lain).
  const refreshOrders = () => getBackend().getOrders().then(setOrders).catch(console.error);

  const accept = async (o) => {
    if (!selectedCourier) return;
    try {
      // acceptOffer melempar ORDER_ALREADY_TAKEN bila claim tidak menang.
      await acceptOffer(getBackend(), o, selectedCourier);
      navigate(`/order/${o.id}`);
    } catch (e) {
      alert('Offer sudah tidak berlaku — pesanan sudah diambil/ditugaskan kurir lain.');
      refreshOrders();
    }
  };

  const reject = async (o) => {
    await rejectOffer(getBackend(), o, selectedCourier?.id, { orders });
  };

  const takeOrder = async (o) => {
    if (!selectedCourier) return;
    try {
      await acceptOffer(getBackend(), o, selectedCourier);
      navigate(`/order/${o.id}`);
    } catch (e) {
      alert('This order was just taken by another courier — please choose another one.');
      refreshOrders();
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-extrabold">Courier · Deliveries</h1>
        {selectedCourier && (
          <div className="flex items-center gap-2">
            {/* Dropdown status online/offline (manual) */}
            <div className="relative">
              <button onClick={() => setOnlineOpen((o) => !o)} className={`badge cursor-pointer ${courierOnline ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-600'}`}>
                {courierOnline ? '🟢 Online' : '⚪ Offline'} ▾
              </button>
              {onlineOpen && (
                <div className="absolute right-0 z-30 mt-1 w-56 rounded-xl border border-gray-200 bg-white p-1 shadow-xl">
                  <button onClick={() => toggleOnline(true)} className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-bold ${courierOnline ? 'bg-go-50 text-go-700' : 'text-gray-600 hover:bg-gray-50'}`}>
                    🟢 Online
                    <span className="ml-auto font-normal text-gray-400">Receive offers</span>
                  </button>
                  <button onClick={() => toggleOnline(false)} className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-bold ${!courierOnline ? 'bg-gray-100 text-gray-700' : 'text-gray-600 hover:bg-gray-50'}`}>
                    ⚪ Offline
                    <span className="ml-auto font-normal text-gray-400">Resting / inactive</span>
                  </button>
                </div>
              )}
            </div>
            <span className="badge bg-go-100 text-go-700">🛵 {selectedCourier.name}</span>
          </div>
        )}
      </div>

      {/* Foto profil kurir — tampil ke customer saat Anda mengantar */}
      <div className="card flex items-center justify-between gap-4 p-4">
        <PhotoUploader value={selectedCourier?.photo} onChange={savePhoto} emoji="🛵" label={selectedCourier?.name || 'Courier'} round hint="Customers see your photo while your delivery is on the way." />
        <div className="min-w-0 text-right">
          <div className="text-sm font-bold text-gray-800">{selectedCourier?.name || 'Select a courier'}</div>
          <div className="text-xs text-gray-400">Profile photo</div>
        </div>
      </div>

      {/* Statistik */}
      <div className="grid grid-cols-3 gap-2">
        <div className="card p-3 text-center">
          <div className="text-lg font-extrabold text-go-600">{offers.length}</div>
          <div className="text-[11px] text-gray-400">New offers</div>
        </div>
        <div className="card p-3 text-center">
          <div className="text-lg font-extrabold">{mine.length}</div>
          <div className="text-[11px] text-gray-400">On the way</div>
        </div>
        <div className="card p-3 text-center">
          <div className="text-lg font-extrabold">{formatRupiah(earnings)}</div>
          <div className="text-[11px] text-gray-400">Earnings</div>
        </div>
      </div>

      {/* Status offline: sembunyikan tawaran & beri tahu kurir */}
      {courierOnline === false && (
        <div className="card p-6 text-center text-sm">
          <div className="text-2xl">⚪</div>
          <p className="mt-2 font-bold text-gray-700">You are offline</p>
          <p className="text-xs text-gray-400">
            Turn <b>Online</b> (dropdown top-right) to receive delivery offers.
          </p>
        </div>
      )}
      {courierOnline !== false && (
        <div>
          <h2 className="mb-2 text-sm font-bold text-gray-700">🔔 New Delivery Offers</h2>
          {offers.length === 0 && available.length === 0 && <div className="card p-6 text-center text-sm text-gray-400">No nearby orders right now</div>}
          <div className="space-y-3">
            {offers.map((o) => {
              const dist = courierDistanceTo(o);
              return (
                <div key={o.id} className="card border-2 border-go-500/40 p-4">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-extrabold">{o.code}</div>
                    <StatusBadge status={o.status} />
                  </div>
                  <p className="mt-1 line-clamp-1 text-xs text-gray-500">{o.items.map((i) => `${i.qty}× ${i.name}`).join(', ')}</p>
                  <div className="mt-1 text-xs text-gray-400">
                    📍 {o.customerAddress} · {formatDistance(o.distanceMeters)} · {formatDuration(o.travelTimeSeconds)} on foot
                  </div>
                  {dist != null && <div className="mt-1 text-xs font-bold text-go-600">📍 {formatDistance(dist)} from your location</div>}
                  <div className="mt-3 flex gap-2 border-t border-gray-100 pt-3">
                    <button onClick={() => accept(o)} className="btn-primary flex-1">
                      ✅ Accept Delivery
                    </button>
                    <button onClick={() => reject(o)} className="btn-ghost text-red-500">
                      Reject
                    </button>
                  </div>
                  <div className="mt-2 border-t border-gray-100 pt-2">
                    <OrderChat order={o} currentUser={currentUser} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Order siap tanpa kurir yang ditugaskan (fallback) */}
      {courierOnline !== false && available.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-bold text-gray-700">📦 Ready at Restaurant</h2>
          <div className="space-y-3">
            {available.map((o) => (
              <div key={o.id} className="card p-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-extrabold">{o.code}</div>
                  <StatusBadge status={o.status} />
                </div>
                <p className="mt-1 line-clamp-1 text-xs text-gray-500">{o.items.map((i) => `${i.qty}× ${i.name}`).join(', ')}</p>
                <div className="mt-1 text-xs text-gray-400">
                  📍 {o.customerAddress} · {formatDistance(o.distanceMeters)} · {formatDuration(o.travelTimeSeconds)} on foot
                </div>
                <div className="mt-2 flex items-center justify-between border-t border-gray-100 pt-2">
                  <span className="font-extrabold text-go-600">{formatRupiah(o.total)}</span>
                  <button onClick={() => takeOrder(o)} className="btn-primary">
                    Pick Up & Deliver →
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pesanan dalam proses */}
      <div>
        <h2 className="mb-2 text-sm font-bold text-gray-700">🛵 In Progress</h2>
        {mine.length === 0 && <div className="card p-6 text-center text-sm text-gray-400">No active deliveries</div>}
        <div className="space-y-3">
          {mine.map((o) => (
            <div key={o.id} className="card p-4">
              <button onClick={() => navigate(`/order/${o.id}`)} className="block w-full text-left">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-extrabold">{o.code}</div>
                  <StatusBadge status={o.status} />
                </div>
                <p className="mt-1 line-clamp-1 text-xs text-gray-500">{o.customerAddress}</p>
                {o.remainingMeters != null && (
                  <p className="mt-1 text-xs font-bold text-go-600">
                    {formatDistance(o.remainingMeters)} left · {formatDuration(o.remainingMeters / 1.35)}
                  </p>
                )}
              </button>
              <div className="mt-2 border-t border-gray-100 pt-2">
                <OrderChat order={o} currentUser={currentUser} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
