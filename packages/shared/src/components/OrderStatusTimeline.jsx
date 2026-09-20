import { ORDER_STATUS_LABEL } from '../lib/store.js';

// Alur status pesanan yang ditampilkan ke customer
const STEPS = ['pending', 'accepted', 'preparing', 'ready', 'picked_up', 'on_the_way', 'delivered'];

export default function OrderStatusTimeline({ status }) {
  // Order yang dibatalkan menampilkan status akhir yang jelas, bukan langkah-langkah kosong
  if (status === 'cancelled') {
    return (
      <div className="flex items-start gap-3 text-sm">
        <div className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-red-100 text-[11px] font-black text-red-600">✕</div>
        <div>
          <div className="font-semibold text-red-600">{ORDER_STATUS_LABEL.cancelled}</div>
          <div className="text-xs text-gray-400">This order was cancelled and will not be delivered.</div>
        </div>
      </div>
    );
  }

  const idx = STEPS.indexOf(status);
  const current = idx === -1 ? -1 : idx;
  const activeSteps = STEPS.slice(0, current + 1);

  return (
    <ol className="space-y-1">
      {STEPS.map((s, i) => {
        const done = i <= current;
        const isNow = i === current;
        return (
          <li key={s} className="flex items-center gap-3">
            <div className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-black ${done ? 'bg-go-500 text-white' : 'bg-gray-200 text-gray-400'} ${isNow ? 'ring-4 ring-go-500/20' : ''}`}>{done ? '✓' : i + 1}</div>
            <div>
              <div className={`text-sm font-semibold ${done ? 'text-gray-800' : 'text-gray-400'}`}>
                {ORDER_STATUS_LABEL[s]}
                {isNow && <span className="ml-2 animate-pulse text-[10px] text-go-500">●</span>}
              </div>
            </div>
          </li>
        );
      })}
      {activeSteps.length === 0 && <li className="text-xs text-gray-400">Awaiting restaurant confirmation…</li>}
    </ol>
  );
}
