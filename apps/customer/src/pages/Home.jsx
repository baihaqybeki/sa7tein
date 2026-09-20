import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore, cartCount } from '@sa7tein/shared/lib/store.js';
import { haversineMeters, formatRupiah, formatDistance } from '@sa7tein/shared/lib/geo.js';
import { isPhoto } from '@sa7tein/shared/lib/image.js';
import MenuItemCard from '../components/MenuItemCard.jsx';
import DeliveryLocationCard from '../components/DeliveryLocationCard.jsx';

export default function CustomerHome() {
  const menu = useStore((s) => s.menu);
  const cart = useStore((s) => s.cart);
  const merchants = useStore((s) => s.merchants);
  const merchantStatus = useStore((s) => s.merchantStatus);
  const selectedMerchantId = useStore((s) => s.selectedMerchantId);
  const setSelectedMerchantId = useStore((s) => s.setSelectedMerchantId);
  const customer = useStore((s) => s.customer);
  const storeOpen = useStore((s) => s.storeOpen);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');

  const merchant = merchants.find((m) => m.id === selectedMerchantId) || null;

  // Menu yang ditampilkan sesuai restoran yang dipilih
  const merchantMenu = useMemo(() => (merchant ? menu.filter((m) => m.merchantId === merchant.id) : []), [merchant, menu]);

  const categories = useMemo(() => {
    const set = new Set(merchantMenu.map((m) => m.category));
    return ['All', ...set];
  }, [merchantMenu]);

  const filtered = useMemo(() => merchantMenu.filter((m) => (category === 'All' || m.category === category) && m.name.toLowerCase().includes(search.toLowerCase())), [merchantMenu, category, search]);

  const count = cartCount(cart);
  const liveStock = merchantMenu.filter((m) => m.stock <= 5 && m.stock > 0).length;
  const soldOut = merchantMenu.filter((m) => m.stock <= 0).length;

  // --- Tidak ada restoran dipilih: tampilkan semua restoran terdaftar ---
  if (!merchant) {
    return (
      <div className="space-y-4">
        <DeliveryLocationCard />
        <div>
          <h1 className="text-xl font-extrabold">Restaurants</h1>
          <p className="text-sm text-gray-500">Choose a restaurant to start your order</p>
        </div>
        <div className="space-y-3">
          {merchants.map((m) => {
            const dist = haversineMeters(customer, { lat: m.lat, lng: m.lng });
            const open = merchantStatus[m.id] ?? m.open;
            return (
              <button key={m.id} onClick={() => setSelectedMerchantId(m.id)} className="card flex w-full items-center gap-3 p-4 text-left hover:shadow-md">
                {isPhoto(m.photo) ? (
                  <img src={m.photo} alt={m.name} className="h-14 w-14 shrink-0 rounded-2xl object-cover ring-1 ring-gray-100" />
                ) : (
                  <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-go-50 text-3xl">{m.emoji}</span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-bold text-gray-800">{m.name}</h3>
                    <span className={`badge ${open ? 'bg-go-100 text-go-700' : 'bg-red-100 text-red-600'}`}>{open ? '🟢 Open' : '🔴 Closed'}</span>
                  </div>
                  <p className="text-xs text-gray-500">{m.address}</p>
                  <div className="mt-1 flex items-center gap-2 text-[11px] text-gray-400">
                    <span className="badge bg-gray-100 text-gray-600">{m.category}</span>
                    <span>📍 {formatDistance(dist)} away</span>
                  </div>
                </div>
                <span className="text-go-600">→</span>
              </button>
            );
          })}
          {merchants.length === 0 && <div className="card p-10 text-center text-sm text-gray-400">No restaurants available yet</div>}
        </div>
      </div>
    );
  }

  // --- Restoran dipilih: tampilkan menunya ---
  return (
    <div className="space-y-4">
      <DeliveryLocationCard />
      {/* Banner restoran */}
      <div className="card overflow-hidden">
        <div className="bg-gradient-to-r from-go-500 to-go-600 p-5 text-white">
          <button
            onClick={() => setSelectedMerchantId(null)}
            className="mb-4 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-extrabold text-go-600 shadow-md transition hover:bg-go-50 hover:shadow-lg active:scale-[0.98]"
          >
            ← Back to all restaurants
          </button>
          <div className="flex items-center gap-3">
            {isPhoto(merchant.photo) ? (
              <img src={merchant.photo} alt={merchant.name} className="h-14 w-14 shrink-0 rounded-2xl object-cover ring-2 ring-white/40" />
            ) : (
              <span className="grid h-14 w-14 place-items-center rounded-2xl bg-white/20 text-3xl">{merchant.emoji}</span>
            )}
            <div>
              <h1 className="text-xl font-extrabold">{merchant.name}</h1>
              <p className="text-sm text-white/80">{merchant.address}</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 text-[11px] font-bold">
            <span className="badge bg-white/20 text-white">🛵 On-foot courier</span>
            <span className="badge bg-white/20 text-white">⏱️ ~15 min prep</span>
            <span className={`badge ${storeOpen ? 'bg-white/20 text-white' : 'bg-red-500/90 text-white'}`}>{storeOpen ? '🟢 Open' : '🔴 Closed'}</span>
          </div>
        </div>
        {liveStock > 0 && (
          <div className="border-t border-orange-100 bg-orange-50 px-4 py-2 text-xs font-semibold text-orange-700">
            ⚠️ {liveStock} item{liveStock > 1 ? 's' : ''} running low · {soldOut} sold out
          </div>
        )}
      </div>

      {/* Notifikasi tutup */}
      {!storeOpen && <div className="card border border-red-200 bg-red-50 p-4 text-center text-sm font-semibold text-red-600">🔴 We&apos;re currently closed. New orders are paused — please come back later.</div>}

      {/* Pencarian */}
      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search menu…" className="input" />

      {/* Kategori */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {categories.map((c) => (
          <button key={c} onClick={() => setCategory(c)} className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold transition ${category === c ? 'bg-go-500 text-white' : 'bg-white text-gray-600 ring-1 ring-gray-200'}`}>
            {c}
          </button>
        ))}
      </div>

      {/* Daftar menu */}
      <div className="grid gap-3 sm:grid-cols-2">
        {filtered.map((item) => (
          <MenuItemCard key={item.id} item={item} disabled={!storeOpen} />
        ))}
        {filtered.length === 0 && <div className="col-span-full py-12 text-center text-sm text-gray-400">No items found</div>}
      </div>

      {/* Bar keranjang */}
      {count > 0 && (
        <div className="fixed inset-x-0 bottom-20 z-30 flex justify-center px-4">
          <Link to="/cart" className="flex w-full max-w-3xl items-center justify-between rounded-2xl bg-gray-900 px-5 py-3.5 text-white shadow-xl">
            <span className="text-sm font-bold">
              🛒 {count} item{count > 1 ? 's' : ''}
              <span className="ml-2 text-gray-300">
                {formatRupiah(
                  Object.entries(cart).reduce((sum, [id, q]) => {
                    const it = menu.find((m) => m.id === id);
                    return sum + (it ? it.price * q : 0);
                  }, 0),
                )}
              </span>
            </span>
            <span className="text-sm font-extrabold text-go-400">View Cart →</span>
          </Link>
        </div>
      )}
    </div>
  );
}
