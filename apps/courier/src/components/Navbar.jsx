import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useStore } from '@sa7tein/shared/lib/store.js';
import { getBackend } from '@sa7tein/shared/lib/backend/index.js';
import ProfileMenu from '@sa7tein/shared/components/ProfileMenu.jsx';

const NAV = [{ to: '/', label: 'Deliveries' }];

export default function Navbar() {
  const location = useLocation();
  const currentUser = useStore((s) => s.currentUser);
  const setCurrentUser = useStore((s) => s.setCurrentUser);
  const orders = useStore((s) => s.orders);
  const navigate = useNavigate();
  const [couriers, setCouriers] = useState([]);

  // Muat profil kurir agar lonceng menghitung offer untuk kurir yang masuk
  useEffect(() => {
    getBackend().getCouriers().then(setCouriers).catch(console.error);
  }, []);

  const myCourier = couriers.find((c) => c.id === currentUser?.courierId) || couriers.find((c) => (c.name || '').toLowerCase() === (currentUser?.name || '').toLowerCase()) || null;

  // Jumlah offer pengantaran yang menunggu kurir ini
  const pendingOffers = orders.filter((o) => o.status === 'ready' && o.assignedCourierId === myCourier?.id && o.offerStatus === 'pending').length;

  const signOut = async () => {
    await getBackend().logout();
    setCurrentUser(null);
    navigate('/');
  };

  return (
    <header className="fixed inset-x-0 top-0 z-40 safe-top bg-white/90 backdrop-blur border-b border-gray-200">
      <div className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-go-500 text-white font-black">ح</span>
          <span className="text-lg font-extrabold text-gray-800">
            Sa7<span className="text-go-500">tein</span>
          </span>
          <span className="badge bg-gray-100 text-gray-600 hidden sm:inline-flex">Courier</span>
        </Link>

        <nav className="flex items-center gap-1">
          {NAV.map((n) => (
            <Link key={n.to} to={n.to} className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${location.pathname === n.to ? 'bg-go-500 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
              {n.label}
            </Link>
          ))}

          <Link to="/" className="relative rounded-lg px-3 py-1.5 text-sm font-semibold text-gray-600 hover:bg-gray-100" title="Delivery offers">
            🔔
            {pendingOffers > 0 && <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">{pendingOffers}</span>}
          </Link>

          {currentUser && <ProfileMenu user={currentUser} onSignOut={signOut} />}
        </nav>
      </div>
    </header>
  );
}
