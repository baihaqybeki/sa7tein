// ============================================================
//  Sa7tein CS — App utama (BrowserRouter + gate peran 'cs')
//  Hanya menerima akun berperan 'cs' (lihat AuthPage).
//  Memuat data awal (merchants/menu/orders) lalu berlangganan
//  realtime; polling + refresh saat foreground sebagai fallback
//  untuk app native. Rute: / (Dashboard), /transactions, /settings.
// ============================================================
import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useStore } from '@sa7tein/shared/lib/store.js';
import { getBackend, getBackendMode } from '@sa7tein/shared/lib/backend/index.js';
import { startPolling, onForeground } from '@sa7tein/shared/lib/live.js';
import AuthPage from '@sa7tein/shared/components/AuthPage.jsx';
import ProfileSettings from '@sa7tein/shared/components/ProfileSettings.jsx';
import SplashScreen from '@sa7tein/shared/components/SplashScreen.jsx';
import Navbar from './components/Navbar.jsx';
import CSDashboard from './pages/CSDashboard.jsx';
import Transactions from './pages/Transactions.jsx';

const basename = import.meta.env.BASE_URL.replace(/\/$/, '');
export default function App() {
  const setMenu = useStore((s) => s.setMenu);
  const setOrders = useStore((s) => s.setOrders);
  const setMerchants = useStore((s) => s.setMerchants);
  const currentUser = useStore((s) => s.currentUser);
  const authReady = useStore((s) => s.authReady);
  const setCurrentUser = useStore((s) => s.setCurrentUser);
  const setAuthReady = useStore((s) => s.setAuthReady);
  const [dataReady, setDataReady] = useState(false);

  useEffect(() => {
    const backend = getBackend();

    const refresh = () => {
      backend.getMerchants().then(setMerchants).catch(console.error);
      backend.getMenu().then(setMenu).catch(console.error);
      backend.getOrders().then(setOrders).catch(console.error);
    };
    // Muat data awal — splash screen hilang setelah semua selesai.
    Promise.all([
      backend
        .getMerchants()
        .then(setMerchants)
        .catch(() => {}),
      backend
        .getMenu()
        .then(setMenu)
        .catch(() => {}),
      backend
        .getOrders()
        .then(setOrders)
        .catch(() => {}),
    ]).finally(() => setDataReady(true));

    // Muat + berlangganan data (status realtime lintas semua merchant)
    const unsubMerchants = backend.onMerchantsChange(setMerchants);
    const unsubMenu = backend.onMenuChange(setMenu);
    const unsubOrders = backend.onOrdersChange(setOrders);

    // Fallback realtime: polling + refresh saat kembali ke foreground.
    const stopPoll = startPolling([refresh]);
    const stopFg = onForeground(refresh);

    return () => {
      unsubMerchants();
      unsubMenu();
      unsubOrders();
      stopPoll();
      stopFg();
    };
  }, [setMerchants, setMenu, setOrders, setDataReady]);

  // Pulihkan sesi saat dimuat
  useEffect(() => {
    const backend = getBackend();
    backend
      .getCurrentUser()
      .then((user) => {
        if (user && user.role === 'cs') setCurrentUser(user);
      })
      .catch(console.error)
      .finally(() => setAuthReady(true));
  }, [setCurrentUser, setAuthReady]);

  return (
    <BrowserRouter basename={basename}>
      <div className="min-h-screen bg-gray-50">
        {currentUser && <Navbar />}
        <main className={`mx-auto w-full max-w-5xl px-4 ${currentUser ? 'main-offset pb-28' : 'py-8'}`}>
          {!authReady || !dataReady ? (
            <SplashScreen emoji="🎧" title="Customer Service" subtitle="Loading your data…" />
          ) : currentUser ? (
            <Routes>
              <Route path="/" element={<CSDashboard />} />
              <Route path="/transactions" element={<Transactions />} />
              <Route path="/settings" element={<ProfileSettings />} />
            </Routes>
          ) : (
            <AuthPage role="cs" emoji="🎧" title="Customer Service" subtitle="Monitor and manage transactions across all merchants." />
          )}
        </main>
        <footer className="pb-8 text-center text-xs text-gray-400">Sa7tein CS · {getBackendMode() === 'supabase' ? 'Cloud (Supabase)' : 'Local demo'}</footer>
      </div>
    </BrowserRouter>
  );
}
