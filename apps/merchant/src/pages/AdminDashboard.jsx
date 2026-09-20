import { useEffect, useState } from 'react';
import { useStore } from '@sa7tein/shared/lib/store.js';
import { getBackend } from '@sa7tein/shared/lib/backend/index.js';
import { offerToNearestCourier } from '@sa7tein/shared/lib/orders.js';
import { formatRupiah, formatDistance, formatDuration, reverseGeocode, getCurrentPosition } from '@sa7tein/shared/lib/geo.js';
import StatusBadge from '@sa7tein/shared/components/StatusBadge.jsx';
import OrderItemsList from '@sa7tein/shared/components/OrderItemsList.jsx';
import OrderChat from '@sa7tein/shared/components/OrderChat.jsx';
import PhotoUploader from '@sa7tein/shared/components/PhotoUploader.jsx';
import MapView from '@sa7tein/shared/components/MapView.jsx';
import AddressAutocomplete from '@sa7tein/shared/components/AddressAutocomplete.jsx';

const QUEUE = ['pending', 'accepted', 'preparing', 'ready'];
const IN_PROGRESS = ['picked_up', 'on_the_way'];
const CANCELLED = ['cancelled', 'rejected'];

export default function AdminDashboard() {
  const orders = useStore((s) => s.orders);
  const merchants = useStore((s) => s.merchants);
  const currentUser = useStore((s) => s.currentUser);
  const storeOpen = useStore((s) => s.storeOpen);
  const setStoreOpen = useStore((s) => s.setStoreOpen);
  const [tab, setTab] = useState('queue');
  const [prepMinutes, setPrepMinutes] = useState(15);
  const [locForm, setLocForm] = useState({ address: '', lat: -6.2, lng: 106.8166 });
  const [locSaved, setLocSaved] = useState(false);
  // Edit lokasi bersifat opsional: peta yang bisa diklik hanya dipasang saat
  // mode edit, jadi klik tak sengaja di dashboard tidak bisa memindahkan lokasi restoran.
  const [editingLoc, setEditingLoc] = useState(false);

  const merchantId = currentUser?.merchantId || null;
  const merchant = merchants.find((m) => m.id === merchantId) || null;

  // Sinkronkan editor lokasi dengan lokasi restoran yang tersimpan
  useEffect(() => {
    if (merchant) {
      setLocForm({ address: merchant.address || '', lat: merchant.lat, lng: merchant.lng });
      setLocSaved(false);
    }
  }, [merchant?.id]);

  const toggleStore = async () => {
    const next = !storeOpen;
    if (!merchantId) return;
    await getBackend().setStoreStatus(merchantId, next);
    setStoreOpen(next);
  };

  const savePhoto = async (photo) => {
    if (!merchantId) return;
    await getBackend().updateMerchant(merchantId, { photo: photo || null });
  };

  const saveLocation = async () => {
    if (!merchantId) return;
    if (!locForm.address || !locForm.address.trim()) return alert('Please enter your restaurant address.');
    await getBackend().updateMerchant(merchantId, { address: locForm.address, lat: locForm.lat, lng: locForm.lng });
    setLocSaved(true);
    setEditingLoc(false);
    setTimeout(() => setLocSaved(false), 2000);
  };

  const startEdit = () => {
    if (merchant) setLocForm({ address: merchant.address || '', lat: merchant.lat, lng: merchant.lng });
    setEditingLoc(true);
  };

  const cancelEdit = () => {
    if (merchant) setLocForm({ address: merchant.address || '', lat: merchant.lat, lng: merchant.lng });
    setEditingLoc(false);
  };

  const useMyLocation = () => {
    getCurrentPosition()
      .then(({ latitude, longitude }) => handlePointChange({ lat: latitude, lng: longitude }))
      .catch(() => alert('Unable to get your location.'));
  };

  // Dipanggil setiap pin berpindah (drag, klik peta, atau geolokasi): perbarui
  // koordinat segera dan reverse-geocode untuk mengisi alamat otomatis.
  const handlePointChange = async (ll) => {
    setLocForm((f) => ({ ...f, lat: ll.lat, lng: ll.lng }));
    const addr = await reverseGeocode(ll.lat, ll.lng);
    if (addr) {
      // Terapkan hanya jika pin belum berpindah lagi saat kita mengambil data
      setLocForm((f) => (f.lat === ll.lat && f.lng === ll.lng ? { ...f, address: addr } : f));
    }
  };

  // Hanya pesanan restoran ini
  const myOrders = orders.filter((o) => o.restaurantId === merchantId);
  const queue = myOrders.filter((o) => QUEUE.includes(o.status));
  const inProgress = myOrders.filter((o) => IN_PROGRESS.includes(o.status));
  // Selesai = hanya yang delivered; cancelled/rejected masuk ke tab sendiri.
  const done = myOrders.filter((o) => o.status === 'delivered');
  const cancelled = myOrders.filter((o) => CANCELLED.includes(o.status));
  const list = tab === 'queue' ? queue : tab === 'progress' ? inProgress : tab === 'cancelled' ? cancelled : done;

  const setStatus = async (id, status, extra = {}) => {
    await getBackend().updateOrderStatus(id, status, extra);
  };

  // Saat order siap, cari kurir terbaik (tidak sibuk, terdekat, paling sedikit
  // pengiriman) lalu kirim offer.
  const markReady = async (o) => {
    await offerToNearestCourier(getBackend(), o, { orders });
  };

  return (
    <div className="space-y-4">
      {/* Toggle buka/tutup toko */}
      <div className="card flex items-center justify-between gap-3 p-4">
        <div>
          <div className="text-sm font-bold text-gray-800">Store status</div>
          <div className="text-xs text-gray-400">{storeOpen ? 'Open — new orders are accepted' : 'Closed — new orders are paused; unconfirmed orders are cancelled'}</div>
        </div>
        <button onClick={toggleStore} className={storeOpen ? 'btn-outline !border-red-300 text-red-500 hover:bg-red-50' : 'btn-primary'}>
          {storeOpen ? '🔴 Close Store' : '🟢 Open Store'}
        </button>
      </div>

      {/* Foto profil restoran */}
      <div className="card flex items-center justify-between gap-4 p-4">
        <PhotoUploader value={merchant?.photo} onChange={savePhoto} emoji={merchant?.emoji || '🍽️'} label={merchant?.name || 'Restaurant'} round hint="This photo appears in the customer's restaurant list and on your store banner." />
        <div className="min-w-0 text-right">
          <div className="text-sm font-bold text-gray-800">{merchant?.name || 'Your restaurant'}</div>
          <div className="text-xs text-gray-400">Restaurant photo</div>
        </div>
      </div>

      {/* Lokasi restoran — hanya-baca secara bawaan; edit bersifat opsional agar
          klik tak sengaja di peta tidak bisa memindahkan lokasi restoran */}
      <div className="card p-4">
        {!editingLoc ? (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-bold text-gray-800">📍 Restaurant location</div>
              <div className="truncate text-xs text-gray-500">{merchant?.address || 'No address set'}</div>
              <div className="mt-1 text-[11px] text-gray-400">📍 {merchant ? `${merchant.lat.toFixed(5)}, ${merchant.lng.toFixed(5)}` : '—'}</div>
            </div>
            <button onClick={startEdit} className="btn-ghost !px-3 !py-1.5 text-xs">
              ✏️ Edit location
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-gray-700">📍 Restaurant location</h2>
              <div className="flex gap-2">
                <button onClick={cancelEdit} className="btn-ghost !px-3 !py-1.5 text-xs">
                  Cancel
                </button>
                <button onClick={saveLocation} className="btn-primary !px-3 !py-1.5 text-xs">
                  💾 {locSaved ? 'Saved ✓' : 'Save'}
                </button>
              </div>
            </div>
            <p className="text-xs text-gray-400">Drag the pin, click the map, or search the address below. The address fills in automatically.</p>
            <MapView center={[locForm.lat, locForm.lng]} editablePoint={locForm} onPointChange={handlePointChange} className="h-52" />
            <div>
              <label className="label">Address</label>
              <AddressAutocomplete
                value={locForm.address}
                onChange={(address) => setLocForm((f) => ({ ...f, address }))}
                onPick={({ address, lat, lng }) => setLocForm((f) => ({ ...f, address, lat, lng }))}
                placeholder="Search address or type it…"
              />
            </div>
            <div className="flex items-center justify-between text-[11px] text-gray-400">
              <span>
                📍 {locForm.lat.toFixed(5)}, {locForm.lng.toFixed(5)}
              </span>
              <button onClick={useMyLocation} className="text-xs font-bold text-go-600 hover:underline">
                📡 Use my location
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <h1 className="text-xl font-extrabold">Kitchen · {merchant ? merchant.name : 'Incoming Orders'}</h1>
        <div className="flex gap-2">
          {[
            ['queue', `Queue ${queue.length}`],
            ['progress', `In progress ${inProgress.length}`],
            ['done', `Completed ${done.length}`],
            ['cancelled', `Cancelled ${cancelled.length}`],
          ].map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)} className={`rounded-full px-3 py-1.5 text-xs font-bold ${tab === k ? 'bg-go-500 text-white' : 'bg-white text-gray-600 ring-1 ring-gray-200'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {list.length === 0 && <div className="card p-10 text-center text-sm text-gray-400">{tab === 'queue' ? 'No incoming orders 🎉' : 'Nothing here yet'}</div>}

      <div className="space-y-3">
        {list.map((o) => (
          <div key={o.id} className="card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-extrabold">
                {o.code} <span className="font-normal text-gray-400">· {o.customerName}</span>
              </div>
              <StatusBadge status={o.status} />
            </div>

            <div className="mt-1 text-xs text-gray-500">
              📍 {o.customerAddress} · {formatDistance(o.distanceMeters)} · {formatDuration(o.travelTimeSeconds)} on foot
            </div>

            <div className="mt-2">
              <OrderItemsList items={o.items} />
            </div>

            <div className="mt-2 flex justify-between text-sm">
              <span className="text-gray-400">{o.payment}</span>
              <span className="font-extrabold text-go-600">{formatRupiah(o.total)}</span>
            </div>

            {/* Aksi merchant */}
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3">
              {o.status === 'pending' && (
                <>
                  <button onClick={() => setStatus(o.id, 'accepted')} className="btn-primary flex-1">
                    ✓ Accept Order
                  </button>
                  <button onClick={() => setStatus(o.id, 'rejected')} className="btn-ghost text-red-500">
                    Reject
                  </button>
                </>
              )}
              {o.status === 'accepted' && (
                <div className="flex w-full flex-wrap items-center gap-2">
                  <div className="flex items-center gap-2 rounded-xl bg-gray-100 px-3 py-1.5 text-sm">
                    <span className="text-xs text-gray-500">⏱️ Prep time</span>
                    <input type="number" min={1} max={120} value={prepMinutes} onChange={(e) => setPrepMinutes(Number(e.target.value))} className="w-14 rounded-md border border-gray-300 px-2 py-1 text-sm" />
                    <span className="text-xs text-gray-500">min</span>
                  </div>
                  <button onClick={() => setStatus(o.id, 'preparing', { prepTimeMinutes: prepMinutes })} className="btn-primary flex-1">
                    🔥 Start Preparing ({prepMinutes} min)
                  </button>
                </div>
              )}
              {o.status === 'preparing' && (
                <div className="flex w-full items-center justify-between">
                  <span className="text-xs font-semibold text-orange-600 animate-pulse">⏳ Preparing… ({o.prepTimeMinutes || 15} min)</span>
                  <button onClick={() => markReady(o)} className="btn-primary">
                    ✓ Done · Ready for Pickup
                  </button>
                </div>
              )}
              {o.status === 'ready' && (
                <div className="flex w-full items-center justify-between">
                  <span className="text-xs font-semibold text-violet-600">📦 Offered to {o.assignedCourierName || 'a nearby courier'}</span>
                  <span className="text-xs text-gray-400">Waiting for the courier to accept</span>
                </div>
              )}
              {IN_PROGRESS.includes(o.status) && (
                <div className="w-full text-xs text-gray-400">
                  🛵 Delivered by <b>{o.courierName || '-'}</b>
                </div>
              )}
            </div>

            {/* Chat dengan customer (selalu) dan kurir (setelah ditugaskan) */}
            <div className="mt-2 border-t border-gray-100 pt-2">
              <OrderChat order={o} currentUser={currentUser} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
