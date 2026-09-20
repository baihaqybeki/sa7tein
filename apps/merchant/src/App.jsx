import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useStore } from '@sa7tein/shared/lib/store.js';
import { getBackend, getBackendMode } from '@sa7tein/shared/lib/backend/index.js';
import { startPolling, onForeground } from '@sa7tein/shared/lib/live.js';
import { handleStaleOffers } from '@sa7tein/shared/lib/orders.js';
import AuthPage from '@sa7tein/shared/components/AuthPage.jsx';
import Navbar from './components/Navbar.jsx';
import AdminDashboard from './pages/AdminDashboard.jsx';
import MenuManager from './pages/MenuManager.jsx';
import ProfileSettings from '@sa7tein/shared/components/ProfileSettings.jsx';
import SplashScreen from '@sa7tein/shared/components/SplashScreen.jsx';
const basename = import.meta.env.BASE_URL.replace(/\/$/, '');
export default function App() {
  const setMenu = useStore((s) => s.setMenu);
  const setOrders = useStore((s) => s.setOrders);
  const setMerchants = useStore((s) => s.setMerchants);
  const setMerchantStatus = useStore((s) => s.setMerchantStatus);
  const setStoreOpen = useStore((s) => s.setStoreOpen);
  const currentUser = useStore((s) => s.currentUser);
  const authReady = useStore((s) => s.authReady);
  const setCurrentUser = useStore((s) => s.setCurrentUser);
  const setAuthReady = useStore((s) => s.setAuthReady);
  const [dataReady, setDataReady] = useState(false);

  const merchantId = currentUser?.merchantId || null;

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

    // Muat + berlangganan daftar restoran terdaftar
    const unsubMerchants = backend.onMerchantsChange(setMerchants);

    // Muat + berlangganan menu (stok langsung)
    const unsubMenu = backend.onMenuChange(setMenu);

    // Muat + berlangganan pesanan (status realtime)
    const unsubOrders = backend.onOrdersChange(setOrders);

    // Fallback realtime: di app native WebSocket bisa mati, jadi polling +
    // refresh saat kembali ke foreground menjaga data tetap segar.
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

  // Muat status buka/tutup restoran ini
  useEffect(() => {
    if (!merchantId) return;
    const backend = getBackend();
    const refresh = () => backend.getStoreStatus(merchantId).then(setStoreOpen).catch(console.error);
    refresh();
    const stopPoll = startPolling([refresh]);
    return () => stopPoll();
  }, [merchantId, setStoreOpen]);

  // Auto-reoffer: jika kurir tidak merespons offer dalam OFFER_TIMEOUT_MS,
  // offer diteruskan ke kurir terdekat berikutnya agar customer & merchant
  // tidak menunggu lama. Dijalankan berkala (orchestrator: portal merchant).
  useEffect(() => {
    const backend = getBackend();
    const check = () => handleStaleOffers(backend, useStore.getState().orders).catch(console.error);
    check();
    const t = setInterval(check, 15000);
    return () => clearInterval(t);
  }, []);

  // Status toko realtime untuk restoran ini
  useEffect(() => {
    const backend = getBackend();
    return backend.onStoreStatusChange(({ merchantId: id, open }) => {
      setMerchantStatus(id, open);
      if (id === useStore.getState().currentUser?.merchantId) setStoreOpen(open);
    });
  }, [setMerchantStatus, setStoreOpen]);

  // Pulihkan sesi saat dimuat
  useEffect(() => {
    const backend = getBackend();
    backend
      .getCurrentUser()
      .then((user) => {
        if (user && user.role === 'merchant') setCurrentUser(user);
      })
      .catch(console.error)
      .finally(() => setAuthReady(true));
  }, [setCurrentUser, setAuthReady]);

  return (
    <BrowserRouter basename={basename}>
      <div className="min-h-screen bg-gray-50">
        {currentUser && <Navbar />}
        <main className={`mx-auto w-full max-w-3xl px-4 ${currentUser ? 'main-offset pb-28' : 'py-8'}`}>
          {!authReady || !dataReady ? (
            <SplashScreen emoji="👨‍🍳" title="Merchant" subtitle="Loading your data…" />
          ) : currentUser ? (
            <Routes>
              <Route path="/" element={<AdminDashboard />} />
              <Route path="/menu" element={<MenuManager />} />
              <Route path="/settings" element={<ProfileSettings />} />
            </Routes>
          ) : (
            <AuthPage role="merchant" emoji="👨‍🍳" title="Merchant" subtitle="Manage incoming orders, your menu, and live stock." />
          )}
        </main>
        <footer className="pb-8 text-center text-xs text-gray-400">Sa7tein Merchant · {getBackendMode() === 'supabase' ? 'Cloud (Supabase)' : 'Local demo'}</footer>
      </div>
    </BrowserRouter>
  );
}
