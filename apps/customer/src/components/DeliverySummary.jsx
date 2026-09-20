import { formatRupiah, formatDistance, formatDuration } from '@sa7tein/shared/lib/geo.js';

// Ringkasan pengantaran: jarak, ongkos kurir jalan kaki, estimasi waktu
export default function DeliverySummary({ info, prepTimeMinutes = 15 }) {
  return (
    <div className="card divide-y divide-gray-100 p-4 text-sm">
      <div className="pb-2 text-xs font-bold uppercase tracking-wide text-gray-400">Delivery Estimate · On-Foot Courier</div>
      <div className="grid grid-cols-3 gap-2 py-3 text-center">
        <div>
          <div className="text-base font-extrabold text-gray-800">{formatDistance(info.distanceMeters)}</div>
          <div className="text-[11px] text-gray-400">Distance</div>
        </div>
        <div>
          <div className="text-base font-extrabold text-gray-800">{formatDuration(info.travelTimeSeconds)}</div>
          <div className="text-[11px] text-gray-400">Walking time</div>
        </div>
        <div>
          <div className="text-base font-extrabold text-go-600">{formatDuration((prepTimeMinutes || 0) * 60 + info.travelTimeSeconds)}</div>
          <div className="text-[11px] text-gray-400">Estimated total</div>
        </div>
      </div>
      <div className="flex items-center justify-between pt-3">
        <span className="text-gray-600">
          Delivery fee <span className="text-[11px] text-gray-400">(courier cost)</span>
        </span>
        <span className="font-extrabold text-go-600">{formatRupiah(info.courierCost)}</span>
      </div>
    </div>
  );
}
