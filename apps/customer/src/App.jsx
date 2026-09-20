import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useStore } from '@sa7tein/shared/lib/store.js';
import { getBackend, getBackendMode } from '@sa7tein/shared/lib/backend/index.js';
import { startPolling, onForeground } from '@sa7tein/shared/lib/live.js';
import AuthPage from '@sa7tein/shared/components/AuthPage.jsx';
import Navbar from './components/Navbar.jsx';
import Home from './pages/Home.jsx';
import CartPage from './pages/CartPage.jsx';
import CheckoutPage from './pages/CheckoutPage.jsx';
import TrackOrder from './pages/TrackOrder.jsx';
import OrderHistory from './pages/OrderHistory.jsx';
import ProfileSettings from '@sa7tein/shared/components/ProfileSettings.jsx';
import SplashScreen from '@sa7tein/shared/components/SplashScreen.jsx';
const basename = import.meta.env.BASE_URL.replace(/\/$/, '');
export default function App() {
  const setMenu = useStore((s) => s.setMenu);
  const setOrders = useStore((s) => s.setOrders);
  const setMerchants = useStore((s) => s.setMerchants);
  const selectedMerchantId = useStore((s) => s.selectedMerchantId);
  const setStoreOpen = useStore((s) => s.setStoreOpen);
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

  // Muat status buka/tutup restoran yang sedang dipilih
  useEffect(() => {
    if (!selectedMerchantId) return;
    const backend = getBackend();
    const refresh = () => backend.getStoreStatus(selectedMerchantId).then(setStoreOpen).catch(console.error);
    refresh();
    const stopPoll = startPolling([refresh]);
    return () => stopPoll();
  }, [selectedMerchantId, setStoreOpen]);

  // Status toko realtime — memperbarui daftar dan restoran yang dipilih
  useEffect(() => {
    const backend = getBackend();
    const setMerchantStatus = useStore.getState().setMerchantStatus;
    return backend.onStoreStatusChange(({ merchantId, open }) => {
      setMerchantStatus(merchantId, open);
      if (merchantId === useStore.getState().selectedMerchantId) setStoreOpen(open);
    });
  }, [setStoreOpen]);

  // Pulihkan sesi saat dimuat
  useEffect(() => {
    const backend = getBackend();
    backend
      .getCurrentUser()
      .then((user) => {
        if (user && user.role === 'customer') {
          setCurrentUser(user);
          // Jaga detail pengantaran tetap sinkron dengan profil akun
          if (user.address) useStore.getState().setCustomer({ name: user.name, phone: user.phone, address: user.address });
        }
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
            <SplashScreen emoji="🛍️" title="Customer" subtitle="Loading your data…" />
          ) : currentUser ? (
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/cart" element={<CartPage />} />
              <Route path="/checkout" element={<CheckoutPage />} />
              <Route path="/order/:id" element={<TrackOrder />} />
              <Route path="/orders" element={<OrderHistory />} />
              <Route path="/settings" element={<ProfileSettings />} />
            </Routes>
          ) : (
            <AuthPage role="customer" emoji="🛍️" title="Customer" subtitle="Order food and track your courier in real time." />
          )}
        </main>
        <footer className="pb-8 text-center text-xs text-gray-400">Sa7tein · {getBackendMode() === 'supabase' ? 'Cloud (Supabase)' : 'Local demo'}</footer>
      </div>
    </BrowserRouter>
  );
}
