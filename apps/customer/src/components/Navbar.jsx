import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useStore, cartCount } from '@sa7tein/shared/lib/store.js';
import { getBackend } from '@sa7tein/shared/lib/backend/index.js';
import ProfileMenu from '@sa7tein/shared/components/ProfileMenu.jsx';

const NAV = [
  { to: '/', label: 'Menu' },
  { to: '/orders', label: 'Orders' },
];

export default function Navbar() {
  const cart = useStore((s) => s.cart);
  const currentUser = useStore((s) => s.currentUser);
  const setCurrentUser = useStore((s) => s.setCurrentUser);
  const location = useLocation();
  const navigate = useNavigate();
  const count = cartCount(cart);

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
          <span className="badge bg-gray-100 text-gray-600 hidden sm:inline-flex">Customer</span>
        </Link>

        <nav className="flex items-center gap-1">
          {NAV.map((n) => (
            <Link key={n.to} to={n.to} className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${location.pathname === n.to ? 'bg-go-500 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
              {n.label}
            </Link>
          ))}
          <Link to="/cart" className="relative rounded-lg px-3 py-1.5 text-sm font-semibold text-gray-600 hover:bg-gray-100">
            🛒
            {count > 0 && <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">{count}</span>}
          </Link>

          {currentUser && <ProfileMenu user={currentUser} onSignOut={signOut} />}
        </nav>
      </div>
    </header>
  );
}
