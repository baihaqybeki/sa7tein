// ============================================================
//  Sa7tein CS — Monitoring transaksi & pembayaran
//  Ringkasan dana, rincian per merchant, dan tabel transaksi
//  (metode + status bayar). Status bayar masih SIMULASI
//  (COD / Lunas / Refund) sampai payment gateway diintegrasikan.
// ============================================================
import { useMemo, useState } from 'react';
import { useStore, ORDER_STATUS_LABEL } from '@sa7tein/shared/lib/store.js';
import { formatRupiah } from '@sa7tein/shared/lib/geo.js';
import StatusBadge from '@sa7tein/shared/components/StatusBadge.jsx';

const CLOSED = ['cancelled', 'rejected'];
const fmtTime = (t) => (t ? new Date(t).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' }) : '—');

// Status pembayaran disimpulkan dari metode & status order.
// Catatan: belum ada integrasi payment gateway — semua status bersifat simulasi.
function paymentInfo(o) {
  if (o.payment === 'COD') {
    return o.status === 'delivered' ? { label: 'COD · paid on arrival', color: 'bg-emerald-100 text-emerald-700' } : { label: 'COD · awaiting payment', color: 'bg-amber-100 text-amber-700' };
  }
  if (CLOSED.includes(o.status)) return { label: 'Refund (simulated)', color: 'bg-gray-200 text-gray-600' };
  return { label: 'Paid (simulated)', color: 'bg-go-100 text-go-700' };
}

export default function Transactions() {
  const orders = useStore((s) => s.orders);
  const [filter, setFilter] = useState('all'); // all | paid | cod | refund (status pembayaran)
  const [from, setFrom] = useState(''); // filter tanggal awal (YYYY-MM-DD)
  const [to, setTo] = useState(''); // filter tanggal akhir (YYYY-MM-DD)
  const [status, setStatus] = useState(''); // filter status order ('' = semua)
  const [q, setQ] = useState(''); // pencarian teks (kode/customer/merchant/metode)

  // Baris transaksi hasil filter gabungan: tanggal (from–to), status order,
  // status pembayaran, dan pencarian.
  const rows = useMemo(() => {
    const withInfo = orders.map((o) => ({ ...o, pay: paymentInfo(o) }));
    const fromMs = from ? new Date(from + 'T00:00:00').getTime() : null;
    const toMs = to ? new Date(to + 'T23:59:59.999').getTime() : null;
    const query = q.trim().toLowerCase();
    return withInfo.filter((o) => {
      if (fromMs && (o.createdAt || 0) < fromMs) return false;
      if (toMs && (o.createdAt || 0) > toMs) return false;
      if (status && o.status !== status) return false;
      if (filter === 'paid' && o.pay.label !== 'Paid (simulated)') return false;
      if (filter === 'cod' && o.payment !== 'COD') return false;
      if (filter === 'refund' && o.pay.label !== 'Refund (simulated)') return false;
      if (query) {
        const hay = `${o.code || ''} ${o.customerName || ''} ${o.restaurantName || ''} ${o.payment || ''} ${o.status || ''}`.toLowerCase();
        if (!hay.includes(query)) return false;
      }
      return true;
    });
  }, [orders, filter, from, to, status, q]);

  // Ringkasan dana & rincian per merchant mengikuti baris hasil filter
  const stats = useMemo(() => {
    const delivered = rows.filter((o) => o.status === 'delivered');
    const totalRevenue = delivered.reduce((s, o) => s + (o.total || 0), 0);
    const totalValue = rows.reduce((s, o) => s + (o.total || 0), 0);
    const cod = rows.filter((o) => o.payment === 'COD');
    const nonCod = rows.filter((o) => o.payment !== 'COD');
    const refund = rows.filter((o) => CLOSED.includes(o.status) && o.payment !== 'COD');
    const byMerchant = {};
    for (const o of rows) {
      const key = o.restaurantName || 'Unnamed';
      byMerchant[key] = byMerchant[key] || { count: 0, value: 0, delivered: 0 };
      byMerchant[key].count += 1;
      byMerchant[key].value += o.total || 0;
      if (o.status === 'delivered') byMerchant[key].delivered += o.total || 0;
    }
    const merchantRows = Object.entries(byMerchant)
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.value - a.value);
    return { totalRevenue, totalValue, cod: cod.length, nonCod: nonCod.length, refund: refund.length, merchantRows };
  }, [rows]);

  const clearFilters = () => {
    setFrom('');
    setTo('');
    setStatus('');
    setQ('');
    setFilter('all');
  };

  const hasFilters = !!(from || to || status || q || filter !== 'all');

  const summary = [
    { label: 'Revenue (delivered)', value: formatRupiah(stats.totalRevenue), color: 'text-go-600' },
    { label: 'Total order value', value: formatRupiah(stats.totalValue), color: 'text-gray-800' },
    { label: 'Transaction count', value: rows.length, color: 'text-gray-800' },
    { label: 'COD', value: stats.cod, color: 'text-amber-600' },
    { label: 'Non-COD (simulated)', value: stats.nonCod, color: 'text-go-600' },
    { label: 'Refund (simulated)', value: stats.refund, color: 'text-red-500' },
  ];

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-amber-50 p-3 text-xs text-amber-700 ring-1 ring-amber-200">
        ℹ️ No payment gateway integration yet — payment statuses below are <b>simulated</b>. Once a gateway (e.g. Xendit/MyFatoorah) is integrated, this page will show real transaction & fund-split statuses.
      </div>

      {/* Ringkasan dana */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {summary.map((s) => (
          <div key={s.label} className="card p-3">
            <div className="text-[11px] font-bold text-gray-400">{s.label}</div>
            <div className={`mt-1 text-lg font-extrabold ${s.color}`}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Rincian per merchant */}
      <div className="card p-4">
        <h2 className="mb-2 text-sm font-extrabold text-gray-700">Breakdown by Merchant</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-gray-400">
                <th className="py-1 pr-2 font-semibold">Merchant</th>
                <th className="py-1 pr-2 font-semibold">Transactions</th>
                <th className="py-1 pr-2 font-semibold">Total value</th>
                <th className="py-1 font-semibold">Delivered (funds in)</th>
              </tr>
            </thead>
            <tbody>
              {stats.merchantRows.map((m) => (
                <tr key={m.name} className="border-t border-gray-100">
                  <td className="py-1.5 pr-2 font-semibold text-gray-700">{m.name}</td>
                  <td className="py-1.5 pr-2">{m.count}</td>
                  <td className="py-1.5 pr-2">{formatRupiah(m.value)}</td>
                  <td className="py-1.5 font-bold text-go-600">{formatRupiah(m.delivered)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Filter transaksi: tanggal (from–to), status order, pencarian */}
      <div className="card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 Search order, customer, merchant…" className="input min-w-[200px] flex-1" />
          {hasFilters && (
            <button onClick={clearFilters} className="btn-ghost !px-3 !py-2 text-xs">
              ✕ Clear filters
            </button>
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div>
            <label className="label">From</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input !w-auto" />
          </div>
          <div>
            <label className="label">To</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="input !w-auto" />
          </div>
          <div>
            <label className="label">Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="input !w-auto">
              <option value="">All statuses</option>
              {Object.entries(ORDER_STATUS_LABEL).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Filter + tabel transaksi */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-extrabold">
          Transactions List <span className="text-sm font-bold text-gray-400">({rows.length})</span>
        </h1>
        <div className="flex flex-wrap gap-2">
          {[
            ['all', 'All'],
            ['paid', 'Paid (simulated)'],
            ['cod', 'COD'],
            ['refund', 'Refund'],
          ].map(([k, label]) => (
            <button key={k} onClick={() => setFilter(k)} className={`rounded-full px-3 py-1.5 text-xs font-bold ${filter === k ? 'bg-go-500 text-white' : 'bg-white text-gray-600 ring-1 ring-gray-200'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-go-50">
              <tr className="text-gray-500">
                <th className="px-3 py-2 font-semibold">Code</th>
                <th className="px-3 py-2 font-semibold">Time</th>
                <th className="px-3 py-2 font-semibold">Customer</th>
                <th className="px-3 py-2 font-semibold">Merchant</th>
                <th className="px-3 py-2 font-semibold">Method</th>
                <th className="px-3 py-2 text-right font-semibold">Total</th>
                <th className="px-3 py-2 font-semibold">Payment</th>
                <th className="px-3 py-2 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-gray-400">
                    {hasFilters ? 'No transactions match your filters' : 'No transactions'}
                  </td>
                </tr>
              )}
              {rows.map((o) => (
                <tr key={o.id} className="border-t border-gray-100">
                  <td className="px-3 py-2 font-bold text-gray-700">{o.code}</td>
                  <td className="px-3 py-2 text-gray-500">{fmtTime(o.createdAt)}</td>
                  <td className="px-3 py-2 text-gray-700">{o.customerName}</td>
                  <td className="px-3 py-2 text-gray-700">{o.restaurantName}</td>
                  <td className="px-3 py-2 text-gray-500">{o.payment}</td>
                  <td className="px-3 py-2 text-right font-bold text-go-600">{formatRupiah(o.total)}</td>
                  <td className="px-3 py-2">
                    <span className={`badge ${o.pay.color}`}>{o.pay.label}</span>
                  </td>
                  <td className="px-3 py-2">
                    <StatusBadge status={o.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
