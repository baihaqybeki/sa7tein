import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useStore } from '@sa7tein/shared/lib/store.js';
import { getBackend } from '@sa7tein/shared/lib/backend/index.js';
import ProfileMenu from '@sa7tein/shared/components/ProfileMenu.jsx';

const NAV = [
  { to: '/', label: 'Incoming Orders' },
  { to: '/menu', label: 'Menu & Stock' },
];

export default function Navbar() {
  const location = useLocation();
  const currentUser = useStore((s) => s.currentUser);
  const merchants = useStore((s) => s.merchants);
  const setCurrentUser = useStore((s) => s.setCurrentUser);
  const navigate = useNavigate();

  const merchant = merchants.find((m) => m.id === currentUser?.merchantId) || null;

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
          <span className="badge gap-1.5 bg-gray-100 text-gray-600 hidden sm:inline-flex">
            {merchant?.photo && (
              <img
                src={merchant.photo}
                alt=""
                className="h-4 w-4 rounded-full object-cover"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            )}
            {merchant ? merchant.name : 'Merchant'}
          </span>
        </Link>

        <nav className="flex items-center gap-1">
          {NAV.map((n) => (
            <Link key={n.to} to={n.to} className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${location.pathname === n.to ? 'bg-go-500 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
              {n.label}
            </Link>
          ))}

          {currentUser && <ProfileMenu user={currentUser} onSignOut={signOut} />}
        </nav>
      </div>
    </header>
  );
}
