import { Link } from 'react-router-dom';
import { useStore } from '@sa7tein/shared/lib/store.js';
import { formatRupiah } from '@sa7tein/shared/lib/geo.js';
import { isPhoto } from '@sa7tein/shared/lib/image.js';
import StatusBadge from '@sa7tein/shared/components/StatusBadge.jsx';

export default function OrderHistory() {
  const orders = useStore((s) => s.orders);

  if (orders.length === 0) {
    return (
      <div className="card p-10 text-center">
        <div className="text-5xl">📋</div>
        <h2 className="mt-3 text-lg font-bold">No orders yet</h2>
        <p className="mt-1 text-sm text-gray-500">Your orders will appear here</p>
        <Link to="/" className="btn-primary mt-5">
          Browse Menu
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-extrabold">My Orders</h1>
      {orders.map((o) => (
        <Link key={o.id} to={`/order/${o.id}`} className="card block p-4 transition hover:shadow-md">
          <div className="flex items-center justify-between">
            <div className="text-sm font-extrabold text-gray-800">
              {o.code} <span className="ml-1 font-normal text-gray-400">· {new Date(o.createdAt).toLocaleDateString('en-US')}</span>
            </div>
            <StatusBadge status={o.status} />
          </div>
          <p className="mt-1 line-clamp-1 text-xs text-gray-500">{o.items.map((i) => `${i.qty}× ${i.name}`).join(', ')}</p>
          <div className="mt-2 flex items-center justify-between text-sm">
            <span className="flex items-center gap-1.5 text-gray-400">
              {isPhoto(o.courierPhoto) ? <img src={o.courierPhoto} alt={o.courierName || 'Courier'} className="h-6 w-6 rounded-full object-cover ring-1 ring-gray-200" /> : <span className="text-xs">🛵</span>}
              {o.courierName || 'Awaiting courier'}
            </span>
            <span className="font-extrabold text-go-600">{formatRupiah(o.total)}</span>
          </div>
        </Link>
      ))}
    </div>
  );
}
