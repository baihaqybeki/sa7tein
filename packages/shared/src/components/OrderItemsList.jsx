import { formatRupiah } from '../lib/geo.js';
import { isPhoto } from '../lib/image.js';

export default function OrderItemsList({ items }) {
  return (
    <ul className="divide-y divide-gray-100">
      {items.map((li, i) => (
        <li key={i} className="flex items-center gap-3 py-2 text-sm">
          {isPhoto(li.photo) ? (
            <img src={li.photo} alt={li.name} className="h-9 w-9 shrink-0 rounded-lg object-cover ring-1 ring-gray-100" />
          ) : (
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-go-50 text-lg">{li.image || '🍽️'}</span>
          )}
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-gray-800">
              {li.qty}× {li.name}
            </div>
            {li.note && <div className="text-xs text-gray-400">Note: {li.note}</div>}
          </div>
          <span className="font-semibold text-gray-600">{formatRupiah(li.price * li.qty)}</span>
        </li>
      ))}
    </ul>
  );
}
