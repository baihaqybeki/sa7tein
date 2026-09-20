import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore, getCartLines, cartSubtotal, deliveryInfo } from '@sa7tein/shared/lib/store.js';
import { getBackend } from '@sa7tein/shared/lib/backend/index.js';
import { formatRupiah, formatDistance, RESTAURANT, reverseGeocode, getCurrentPosition } from '@sa7tein/shared/lib/geo.js';
import MapView from '@sa7tein/shared/components/MapView.jsx';
import AddressAutocomplete from '@sa7tein/shared/components/AddressAutocomplete.jsx';

export default function CheckoutPage() {
  const menu = useStore((s) => s.menu);
  const cart = useStore((s) => s.cart);
  const merchants = useStore((s) => s.merchants);
  const selectedMerchantId = useStore((s) => s.selectedMerchantId);
  const customer = useStore((s) => s.customer);
  const setCustomer = useStore((s) => s.setCustomer);
  const clearCart = useStore((s) => s.clearCart);
  const storeOpen = useStore((s) => s.storeOpen);
  const currentUser = useStore((s) => s.currentUser);
  const navigate = useNavigate();

  const [payment, setPayment] = useState('COD');
  const [note, setNote] = useState('');
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState('');

  const merchant = merchants.find((m) => m.id === selectedMerchantId) || null;
  // Restoran bisa tutup saat customer sedang di halaman checkout — blokir
  // pemesanan dan beri tahu mereka dengan jelas. `storeOpen` diperbarui otomatis.
  const closed = !!merchant && !storeOpen;
  const lines = getCartLines(menu, cart);
  const subtotal = cartSubtotal(lines);
  const info = deliveryInfo(customer, merchant ? { lat: merchant.lat, lng: merchant.lng } : RESTAURANT);
  const total = subtotal + info.courierCost;

  // Pindahkan pin titik antar sekaligus isi alamat yang sesuai, agar peta dan
  // kolom "Full address" selalu selaras.
  const handleMapPick = async (ll) => {
    setCustomer({ lat: ll.lat, lng: ll.lng });
    const addr = await reverseGeocode(ll.lat, ll.lng);
    if (addr) {
      // Terapkan hanya jika pin belum berpindah lagi saat kita mengambil data
      const latest = useStore.getState().customer;
      if (latest.lat === ll.lat && latest.lng === ll.lng) setCustomer({ address: addr });
    }
  };

  const useMyLocation = () => {
    getCurrentPosition()
      .then(({ latitude, longitude }) => handleMapPick({ lat: latitude, lng: longitude }))
      .catch(() => alert('Unable to get your location.'));
  };

  const placeOrder = async () => {
    if (!customer.name || !customer.phone || !customer.address) {
      return setError('Please fill in your name, phone number, and address.');
    }
    if (lines.length === 0) return setError('Your cart is empty.');
    if (closed) return setError(`${merchant.name} is currently closed. Your order can't be placed right now — please try again later.`);
    setPlacing(true);
    setError('');
    try {
      const order = {
        customerId: 'cust-' + Math.random().toString(36).slice(2, 8),
        customerUserId: currentUser?.id || null,
        customerName: customer.name,
        customerPhone: customer.phone,
        customerAddress: customer.address,
        customerLat: customer.lat,
        customerLng: customer.lng,
        restaurantId: merchant ? merchant.id : 'merchant-1',
        restaurantName: merchant ? merchant.name : RESTAURANT.name,
        restaurantLat: merchant ? merchant.lat : RESTAURANT.lat,
        restaurantLng: merchant ? merchant.lng : RESTAURANT.lng,
        restaurantPhoto: merchant ? merchant.photo : null,
        items: lines.map((l) => ({
          itemId: l.item.id,
          name: l.item.name,
          image: l.item.image,
          photo: l.item.photo || null,
          price: l.item.price,
          qty: l.qty,
          note: '',
        })),
        orderNote: note,
        subtotal,
        courierCost: info.courierCost,
        total,
        distanceMeters: info.distanceMeters,
        travelTimeSeconds: info.travelTimeSeconds,
        payment,
        prepTimeMinutes: 15,
        courierId: null,
        courierName: null,
        courierLat: null,
        courierLng: null,
        remainingMeters: null,
      };
      const created = await getBackend().createOrder(order);
      clearCart();
      navigate(`/order/${created.id}`);
    } catch (e) {
      console.error(e);
      setError('Unable to place the order: ' + (e.message || e));
    } finally {
      setPlacing(false);
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-extrabold">Checkout</h1>

      {/* Restoran tutup saat checkout berlangsung */}
      {closed && (
        <div className="card border border-red-200 bg-red-50 p-4 text-center">
          <div className="text-2xl">🔴</div>
          <p className="mt-1 text-sm font-extrabold text-red-600">{merchant.name} just closed.</p>
          <p className="mt-1 text-xs text-red-500">Orders are paused while the restaurant is closed. Please come back when it reopens.</p>
        </div>
      )}

      {/* Lokasi pengantaran */}
      <div className="card p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-bold text-gray-700">📍 Delivery Location</h2>
          <button onClick={useMyLocation} className="text-xs font-bold text-go-600 hover:underline">
            Use my location
          </button>
        </div>
        <MapView center={[customer.lat, customer.lng]} restaurant={merchant || RESTAURANT} editablePoint={customer} onPointChange={handleMapPick} editableShowRestaurant className="h-56" />
        <p className="mt-2 text-center text-[11px] text-gray-400">Drag the pin or click the map to set your drop-off point — the address fills in automatically</p>
        <div className="mt-2 flex items-center gap-2 rounded-xl bg-go-50 px-3 py-2 text-xs font-semibold text-go-700">
          <span>Distance from restaurant:</span>
          <span className="font-extrabold">{formatDistance(info.distanceMeters)}</span>
        </div>
      </div>

      {/* Detail penerima */}
      <div className="card space-y-3 p-4">
        <h2 className="text-sm font-bold text-gray-700">👤 Recipient Details</h2>
        <div>
          <label className="label">Full name</label>
          <input className="input" value={customer.name} onChange={(e) => setCustomer({ name: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Phone number</label>
            <input className="input" value={customer.phone} onChange={(e) => setCustomer({ phone: e.target.value })} />
          </div>
          <div>
            <label className="label">Payment method</label>
            <select className="input" value={payment} onChange={(e) => setPayment(e.target.value)}>
              <option value="COD">Cash on delivery (COD)</option>
              <option value="QRIS">QRIS</option>
              <option value="Transfer">Bank transfer</option>
            </select>
          </div>
        </div>
        <div>
          <label className="label">Full address</label>
          <AddressAutocomplete value={customer.address} onChange={(address) => setCustomer({ address })} onPick={({ address, lat, lng }) => setCustomer({ address, lat, lng })} placeholder="Search address or type it…" />
        </div>
        <div>
          <label className="label">Note (optional)</label>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. no chili" />
        </div>
      </div>

      {/* Ringkasan pesanan */}
      <div className="card p-4 text-sm">
        <h2 className="mb-2 text-sm font-bold text-gray-700">🧾 Order Summary</h2>
        <ul className="divide-y divide-gray-100">
          {lines.map((l) => (
            <li key={l.item.id} className="flex justify-between py-1.5 text-gray-600">
              <span>
                {l.qty}× {l.item.name}
              </span>
              <span className="font-semibold">{formatRupiah(l.item.price * l.qty)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-2 space-y-1 border-t border-gray-100 pt-2">
          <div className="flex justify-between text-gray-500">
            <span>Subtotal</span>
            <span>{formatRupiah(subtotal)}</span>
          </div>
          <div className="flex justify-between text-gray-500">
            <span>Delivery fee (on-foot courier, {formatDistance(info.distanceMeters)})</span>
            <span>{formatRupiah(info.courierCost)}</span>
          </div>
          <div className="flex justify-between pt-1 text-base font-extrabold">
            <span>Total</span>
            <span className="text-go-600">{formatRupiah(total)}</span>
          </div>
        </div>
      </div>

      {error && <div className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">{error}</div>}

      <button onClick={placeOrder} disabled={placing || lines.length === 0 || closed} className="btn-primary w-full py-3.5 text-base disabled:opacity-50">
        {placing ? 'Processing…' : closed ? 'Restaurant closed — order paused' : `Place Order · ${formatRupiah(total)}`}
      </button>
    </div>
  );
}
