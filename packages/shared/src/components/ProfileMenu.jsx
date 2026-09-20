import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

// Tombol avatar yang membuka menu dropdown: Settings di atas, Sign out di bawah.
export default function ProfileMenu({ user, settingsTo = '/settings', onSignOut }) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  // Tutup dropdown saat mengklik di luar
  useEffect(() => {
    const onDoc = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const initials = (user?.name || 'G')
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className="relative ml-1 border-l border-gray-200 pl-2" ref={boxRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        title={user?.name || 'Account'}
        aria-label="Account menu"
        className="grid h-8 w-8 place-items-center rounded-full bg-go-100 text-[11px] font-extrabold text-go-700 ring-2 ring-transparent transition hover:ring-go-500/40"
      >
        {initials}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-50 w-56 overflow-hidden rounded-2xl border border-gray-200 bg-white py-1 shadow-xl">
          <div className="border-b border-gray-100 px-4 py-2.5">
            <div className="truncate text-sm font-bold text-gray-800">{user?.name || 'Account'}</div>
            <div className="truncate text-[11px] text-gray-400">{user?.email || ''}</div>
          </div>
          <Link to={settingsTo} onClick={() => setOpen(false)} className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-go-50">
            ⚙️ Settings
          </Link>
          <div className="my-1 border-t border-gray-100" />
          <button
            onClick={() => {
              setOpen(false);
              if (onSignOut) onSignOut();
            }}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-semibold text-red-500 hover:bg-red-50"
          >
            🚪 Sign out
          </button>
        </div>
      )}
    </div>
  );
}
