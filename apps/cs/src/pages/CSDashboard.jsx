// ============================================================
//  Sa7tein CS — Dashboard monitoring pesanan
//  Menampilkan KPI + SEMUA order lintas semua merchant (CS tidak
//  terikat satu restoran). Aksi CS: batalkan (cs_cancelled),
//  force-assign kurir, teruskan offer (re-offer), tandai selesai
//  manual, dan chat sebagai penengah (semua channel).
//  Semua aksi memakai method backend yang sama dengan portal lain
//  (updateOrderStatus, rejectOffer) — tidak ada logika khusus.
// ============================================================
import { useEffect, useMemo, useState } from 'react';
import { useStore } from '@sa7tein/shared/lib/store.js';
import { getBackend } from '@sa7tein/shared/lib/backend/index.js';
import { rejectOffer } from '@sa7tein/shared/lib/orders.js';
import { formatRupiah, formatDistance, formatDuration, ONLINE_WINDOW_MS } from '@sa7tein/shared/lib/geo.js';
import StatusBadge from '@sa7tein/shared/components/StatusBadge.jsx';
import OrderItemsList from '@sa7tein/shared/components/OrderItemsList.jsx';
import OrderChat from '@sa7tein/shared/components/OrderChat.jsx';

const ACTIVE = ['pending', 'accepted', 'preparing', 'ready', 'picked_up', 'on_the_way'];
const DELIVERING = ['picked_up', 'on_the_way'];
const CLOSED = ['cancelled', 'rejected'];

// Format waktu untuk tampilan CS (dari timestamp numerik)
const fmtTime = (t) => (t ? new Date(t).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' }) : '—');

export default function CSDashboard() {
  const orders = useStore((s) => s.orders);
  const currentUser = useStore((s) => s.currentUser);
  const [tab, setTab] = useState('all');
  const [couriers, setCouriers] = useState([]);
  // Kurir terpilih per order (untuk force-assign)
  const [assignSel, setAssignSel] = useState({});
  const [busyId, setBusyId] = useState(null);

  // Muat daftar kurir agar CS bisa menugaskan ulang
  useEffect(() => {
    getBackend().getCouriers().then(setCouriers).catch(console.error);
  }, []);

  // Hanya kurir ONLINE yang bisa ditugaskan CS (online=true + heartbeat masih
  // segar dalam ONLINE_WINDOW_MS). Kurir offline/stale tidak ditampilkan.
  const onlineCouriers = useMemo(() => {
    const now = Date.now();
    return couriers.filter((c) => c.online === true && (!c.lastSeenAt || now - c.lastSeenAt <= ONLINE_WINDOW_MS));
  }, [couriers]);

  // Kelompok pesanan untuk dashboard CS
  const groups = useMemo(() => {
    const active = orders.filter((o) => ACTIVE.includes(o.status));
    const attention = orders.filter((o) => o.status === 'ready' && (!o.assignedCourierId || o.offerStatus === 'pending'));
    const delivering = orders.filter((o) => DELIVERING.includes(o.status));
    const done = orders.filter((o) => o.status === 'delivered');
    const closed = orders.filter((o) => CLOSED.includes(o.status));
    const revenue = done.reduce((s, o) => s + (o.total || 0), 0);
    const list = tab === 'all' ? active : tab === 'attention' ? attention : tab === 'done' ? done : closed;
    return { active, attention, delivering, done, closed, revenue, list };
  }, [orders, tab]);

  const cancelOrder = async (o) => {
    if (!window.confirm(`Cancel order ${o.code} on behalf of CS?`)) return;
    setBusyId(o.id);
    try {
      await getBackend().updateOrderStatus(o.id, 'cancelled', { cancelledReason: 'cs_cancelled' });
    } catch (e) {
      console.error(e);
    } finally {
      setBusyId(null);
    }
  };

  // Paksa menugaskan order ke kurir pilihan CS (offer baru ke kurir tersebut).
  // Guard: hanya kurir ONLINE yang boleh ditugaskan.
  const forceAssign = async (o, courierId) => {
    const courier = couriers.find((c) => c.id === courierId);
    if (!courier) return;
    if (courier.online !== true) {
      alert('Courier is not online — only online couriers can be assigned.');
      return;
    }
    setBusyId(o.id);
    try {
      await getBackend().updateOrderStatus(o.id, 'ready', {
        assignedCourierId: courier.id,
        assignedCourierName: courier.name,
        offerStatus: 'pending',
        offerSentAt: Date.now(),
        rejectedBy: (o.rejectedBy || []).filter((x) => x !== courier.id),
      });
    } catch (e) {
      console.error(e);
    } finally {
      setBusyId(null);
    }
  };

  // Teruskan offer ke kurir terbaik berikutnya (yang sekarang tidak merespons)
  const reoffer = async (o) => {
    setBusyId(o.id);
    try {
      await rejectOffer(getBackend(), o, o.assignedCourierId, { orders });
    } catch (e) {
      console.error(e);
    } finally {
      setBusyId(null);
    }
  };

  const markDelivered = async (o) => {
    if (!window.confirm(`Mark order ${o.code} as delivered manually?`)) return;
    setBusyId(o.id);
    try {
      await getBackend().updateOrderStatus(o.id, 'delivered', { courierLat: o.courierLat, courierLng: o.courierLng, remainingMeters: 0 });
    } catch (e) {
      console.error(e);
    } finally {
      setBusyId(null);
    }
  };

  const kpis = [
    { label: 'Active', value: groups.active.length, color: 'bg-go-100 text-go-700' },
    { label: '⚠️ Awaiting courier', value: groups.attention.length, color: 'bg-amber-100 text-amber-700' },
    { label: '🛵 Out for delivery', value: groups.delivering.length, color: 'bg-sky-100 text-sky-700' },
    { label: '✅ Completed', value: groups.done.length, color: 'bg-emerald-100 text-emerald-700' },
    { label: '💰 Revenue', value: formatRupiah(groups.revenue), color: 'bg-go-100 text-go-700' },
    { label: '❌ Cancelled/Rejected', value: groups.closed.length, color: 'bg-red-100 text-red-600' },
  ];

  return (
    <div className="space-y-4">
      {/* Kartu KPI */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {kpis.map((k) => (
          <div key={k.label} className="card p-3">
            <div className="text-[11px] font-bold text-gray-400">{k.label}</div>
            <div className={`mt-1 text-lg font-extrabold ${k.color.split(' ')[1]}`}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Filter tab */}
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-extrabold">Order Monitoring</h1>
        <div className="flex flex-wrap gap-2">
          {[
            ['all', `Active ${groups.active.length}`],
            ['attention', `Needs attention ${groups.attention.length}`],
            ['done', `Completed ${groups.done.length}`],
            ['closed', `Cancelled/Rejected ${groups.closed.length}`],
          ].map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)} className={`rounded-full px-3 py-1.5 text-xs font-bold ${tab === k ? 'bg-go-500 text-white' : 'bg-white text-gray-600 ring-1 ring-gray-200'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {groups.list.length === 0 && <div className="card p-10 text-center text-sm text-gray-400">{tab === 'all' ? 'No active orders 🎉' : 'No data'}</div>}

      <div className="space-y-3">
        {groups.list.map((o) => {
          const selCourier = assignSel[o.id] || onlineCouriers[0]?.id || '';
          const awaiting = o.status === 'ready';
          return (
            <div key={o.id} className="card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-extrabold">
                  {o.code} <span className="font-normal text-gray-400">· {o.customerName}</span>
                </div>
                <StatusBadge status={o.status} />
              </div>

              <div className="mt-1 text-xs text-gray-500">
                🏪 {o.restaurantName || '—'} · 📍 {o.customerAddress || '—'} · {formatDistance(o.distanceMeters)} · {formatDuration(o.travelTimeSeconds)} on foot
              </div>
              <div className="mt-0.5 text-[11px] text-gray-400">
                🛵 Courier: {o.courierName || o.assignedCourierName || 'not assigned yet'} · 🕐 Created {fmtTime(o.createdAt)}
              </div>

              <div className="mt-2">
                <OrderItemsList items={o.items} />
              </div>

              <div className="mt-2 flex justify-between text-sm">
                <span className="text-gray-400">{o.payment}</span>
                <span className="font-extrabold text-go-600">{formatRupiah(o.total)}</span>
              </div>

              {/* Aksi CS */}
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3">
                {o.status === 'pending' && (
                  <button onClick={() => cancelOrder(o)} disabled={busyId === o.id} className="btn-danger flex-1">
                    ✕ Cancel (CS)
                  </button>
                )}

                {['accepted', 'preparing'].includes(o.status) && (
                  <button onClick={() => cancelOrder(o)} disabled={busyId === o.id} className="btn-danger flex-1">
                    ✕ Cancel (CS)
                  </button>
                )}

                {awaiting && (
                  <>
                    <div className="flex flex-1 flex-wrap items-center gap-2">
                      {onlineCouriers.length === 0 ? (
                        <span className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-bold text-gray-500">⚠️ No couriers online</span>
                      ) : (
                        <select value={selCourier} onChange={(e) => setAssignSel((s) => ({ ...s, [o.id]: e.target.value }))} className="input !w-auto !py-1.5 text-xs">
                          {onlineCouriers.map((c) => (
                            <option key={c.id} value={c.id}>
                              🛵 {c.name}
                            </option>
                          ))}
                        </select>
                      )}
                      <button onClick={() => forceAssign(o, selCourier)} disabled={busyId === o.id || !selCourier || onlineCouriers.length === 0} className="btn-primary !px-3 !py-1.5 text-xs">
                        ⚡ Assign to this courier
                      </button>
                    </div>
                    {o.assignedCourierId && o.offerStatus === 'pending' && (
                      <button onClick={() => reoffer(o)} disabled={busyId === o.id} className="btn-ghost !px-3 !py-1.5 text-xs text-amber-600">
                        ⏩ Offer to next courier (unresponsive)
                      </button>
                    )}
                    <button onClick={() => cancelOrder(o)} disabled={busyId === o.id} className="btn-ghost !px-3 !py-1.5 text-xs text-red-500">
                      ✕ Cancel
                    </button>
                  </>
                )}

                {DELIVERING.includes(o.status) && (
                  <>
                    <button onClick={() => markDelivered(o)} disabled={busyId === o.id} className="btn-primary flex-1">
                      ✅ Mark as delivered (manual)
                    </button>
                    <button onClick={() => cancelOrder(o)} disabled={busyId === o.id} className="btn-ghost text-red-500">
                      ✕ Cancel
                    </button>
                  </>
                )}
              </div>

              {/* Chat sebagai penengah */}
              <div className="mt-2 border-t border-gray-100 pt-2">
                <OrderChat order={o} currentUser={currentUser} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
