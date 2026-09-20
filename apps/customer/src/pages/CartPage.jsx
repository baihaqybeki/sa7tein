import { Link, useNavigate } from 'react-router-dom';
import { useStore, getCartLines, cartSubtotal, deliveryInfo } from '@sa7tein/shared/lib/store.js';
import { formatRupiah, RESTAURANT } from '@sa7tein/shared/lib/geo.js';

export default function CartPage() {
  const menu = useStore((s) => s.menu);
  const cart = useStore((s) => s.cart);
  const merchants = useStore((s) => s.merchants);
  const selectedMerchantId = useStore((s) => s.selectedMerchantId);
  const customer = useStore((s) => s.customer);
  const storeOpen = useStore((s) => s.storeOpen);
  const navigate = useNavigate();

  const merchant = merchants.find((m) => m.id === selectedMerchantId) || null;
  // Blokir checkout saat restoran tutup (status toko diperbarui otomatis)
  const closed = !!merchant && !storeOpen;
  const lines = getCartLines(menu, cart);
  const subtotal = cartSubtotal(lines);
  const info = deliveryInfo(customer, merchant ? { lat: merchant.lat, lng: merchant.lng } : RESTAURANT);
  const total = subtotal + info.courierCost;

  if (lines.length === 0) {
    return (
      <div className="card p-10 text-center">
        <div className="text-5xl">🛒</div>
        <h2 className="mt-3 text-lg font-bold">Your cart is empty</h2>
        <p className="mt-1 text-sm text-gray-500">Add something you like to get started</p>
        <Link to="/" className="btn-primary mt-5">
          Browse Menu
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-extrabold">Cart</h1>

      {/* Restoran tutup saat ada item di keranjang */}
      {closed && (
        <div className="card border border-red-200 bg-red-50 p-4 text-center">
          <div className="text-2xl">🔴</div>
          <p className="mt-1 text-sm font-extrabold text-red-600">{merchant.name} is currently closed.</p>
          <p className="mt-1 text-xs text-red-500">Checkout is paused while the restaurant is closed. It will be available again once it reopens.</p>
        </div>
      )}

      <div className="card divide-y divide-gray-100 p-4">
        {lines.map(({ item, qty }) => (
          <div key={item.id} className="flex items-center gap-3 py-3">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-go-50 text-xl">{item.image}</span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold">{item.name}</div>
              <div className="text-xs text-gray-400">
                {formatRupiah(item.price)} · {item.stock} in stock
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => useStore.getState().decreaseFromCart(item.id)} className="grid h-7 w-7 place-items-center rounded-full border border-gray-300 text-gray-600">
                −
              </button>
              <span className="w-5 text-center text-sm font-bold">{qty}</span>
              <button onClick={() => useStore.getState().addToCart(item)} disabled={qty >= item.stock || closed} className="grid h-7 w-7 place-items-center rounded-full bg-go-500 text-white disabled:opacity-30">
                +
              </button>
            </div>
            <div className="w-16 text-right text-sm font-bold">{formatRupiah(item.price * qty)}</div>
          </div>
        ))}
      </div>

      <div className="card p-4 text-sm">
        <div className="flex justify-between py-1">
          <span className="text-gray-500">Subtotal</span>
          <span className="font-semibold">{formatRupiah(subtotal)}</span>
        </div>
        <div className="flex justify-between py-1">
          <span className="text-gray-500">
            Delivery fee <span className="text-xs text-gray-400">(on-foot courier)</span>
          </span>
          <span className="font-semibold">{formatRupiah(info.courierCost)}</span>
        </div>
        <div className="mt-2 flex justify-between border-t border-gray-100 pt-3 text-base font-extrabold">
          <span>Total</span>
          <span className="text-go-600">{formatRupiah(total)}</span>
        </div>
      </div>

      <button onClick={() => navigate('/checkout')} disabled={closed} className="btn-primary w-full py-3.5 text-base disabled:opacity-50">
        {closed ? 'Store closed — checkout paused' : 'Proceed to Checkout →'}
      </button>
    </div>
  );
}
