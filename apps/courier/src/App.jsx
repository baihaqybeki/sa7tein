import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useStore } from '@sa7tein/shared/lib/store.js';
import { getBackend, getBackendMode } from '@sa7tein/shared/lib/backend/index.js';
import { startPolling, onForeground } from '@sa7tein/shared/lib/live.js';
import AuthPage from '@sa7tein/shared/components/AuthPage.jsx';
import Navbar from './components/Navbar.jsx';
import CourierDashboard from './pages/CourierDashboard.jsx';
import CourierDelivery from './pages/CourierDelivery.jsx';
import ProfileSettings from '@sa7tein/shared/components/ProfileSettings.jsx';
import SplashScreen from '@sa7tein/shared/components/SplashScreen.jsx';
const basename = import.meta.env.BASE_URL.replace(/\/$/, '');
export default function App() {
  const setMenu = useStore((s) => s.setMenu);
  const setOrders = useStore((s) => s.setOrders);
  const currentUser = useStore((s) => s.currentUser);
  const authReady = useStore((s) => s.authReady);
  const setCurrentUser = useStore((s) => s.setCurrentUser);
  const setAuthReady = useStore((s) => s.setAuthReady);
  const courierOnline = useStore((s) => s.courierOnline);
  const [dataReady, setDataReady] = useState(false);

  useEffect(() => {
    const backend = getBackend();

    const refresh = () => {
      backend.getMenu().then(setMenu).catch(console.error);
      backend.getOrders().then(setOrders).catch(console.error);
    };
    // Muat data awal — splash screen hilang setelah semua selesai.
    Promise.all([
      backend
        .getMenu()
        .then(setMenu)
        .catch(() => {}),
      backend
        .getOrders()
        .then(setOrders)
        .catch(() => {}),
    ]).finally(() => setDataReady(true));

    // Muat + berlangganan menu (stok langsung)
    const unsubMenu = backend.onMenuChange(setMenu);

    // Muat + berlangganan pesanan (status realtime)
    const unsubOrders = backend.onOrdersChange(setOrders);

    // Fallback realtime: di app native WebSocket bisa mati, jadi polling +
    // refresh saat kembali ke foreground menjaga data tetap segar.
    const stopPoll = startPolling([refresh]);
    const stopFg = onForeground(refresh);

    return () => {
      unsubMenu();
      unsubOrders();
      stopPoll();
      stopFg();
    };
  }, [setMenu, setOrders, setDataReady]);

  // Pulihkan sesi saat dimuat
  useEffect(() => {
    const backend = getBackend();
    backend
      .getCurrentUser()
      .then((user) => {
        if (user && user.role === 'courier') setCurrentUser(user);
      })
      .catch(console.error)
      .finally(() => setAuthReady(true));
  }, [setCurrentUser, setAuthReady]);

  // Status online dikendalikan MANUAL oleh kurir (dropdown Online/Offline).
  // Heartbeat (online=true + lastSeenAt) hanya berjalan saat courierOnline=true,
  // sehingga penawaran hanya jatuh ke kurir yang benar-benar aktif. Saat
  // courierOnline=false, status tersimpan dipaksa offline dan tidak menerima
  // tawaran baru (kurir tetap bisa login).
  useEffect(() => {
    const backend = getBackend();
    const courierId = currentUser?.courierId || null;
    if (!courierId) return undefined;
    // courierOnline === null berarti belum diinisialisasi dari profil (dashboard
    // yang membacanya) — jangan dipaksa offline dulu. Hanya saat EXPLICIT false
    // (kurir memilih offline) status tersimpan dipaksa offline.
    if (courierOnline === false) {
      backend.updateCourier(courierId, { online: false }).catch(() => {});
      return undefined;
    }
    const goOnline = () => backend.updateCourier(courierId, { online: true, lastSeenAt: Date.now() }).catch(console.error);
    goOnline();
    const t = setInterval(goOnline, 30000);
    const goOffline = () => backend.updateCourier(courierId, { online: false }).catch(() => {});
    window.addEventListener('beforeunload', goOffline);
    return () => {
      clearInterval(t);
      window.removeEventListener('beforeunload', goOffline);
      goOffline();
    };
  }, [currentUser?.courierId, courierOnline]);

  return (
    <BrowserRouter basename={basename}>
      <div className="min-h-screen bg-gray-50">
        {currentUser && <Navbar />}
        <main className={`mx-auto w-full max-w-3xl px-4 ${currentUser ? 'main-offset pb-28' : 'py-8'}`}>
          {!authReady || !dataReady ? (
            <SplashScreen emoji="🛵" title="Courier" subtitle="Loading your data…" />
          ) : currentUser ? (
            <Routes>
              <Route path="/" element={<CourierDashboard />} />
              <Route path="/order/:id" element={<CourierDelivery />} />
              <Route path="/settings" element={<ProfileSettings />} />
            </Routes>
          ) : (
            <AuthPage role="courier" emoji="🛵" title="Courier" subtitle="Pick up orders and deliver them with live tracking." />
          )}
        </main>
        <footer className="pb-8 text-center text-xs text-gray-400">Sa7tein Courier · {getBackendMode() === 'supabase' ? 'Cloud (Supabase)' : 'Local demo'}</footer>
      </div>
    </BrowserRouter>
  );
}
