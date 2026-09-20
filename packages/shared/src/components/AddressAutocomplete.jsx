import { useEffect, useRef, useState } from 'react';
import { searchAddress } from '../lib/geo.js';

// Autocomplete alamat dengan debounce, ditenagai OpenStreetMap Nominatim (gratis).
// Props:
//   value, onChange(address)  — input terkontrol untuk teks yang diketik/dipilih
//   onPick({address, lat, lng}) — dipanggil saat saran dipilih (opsional;
//       memungkinkan pemanggil ikut memindahkan pin peta ke lokasi terpilih)
//   placeholder, className
export default function AddressAutocomplete({ value, onChange, onPick, placeholder = 'Search address…', className = 'input' }) {
  const [query, setQuery] = useState(value || '');
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const timerRef = useRef(null);
  const boxRef = useRef(null);

  // Jaga kolom tetap sinkron saat nilai parent berubah (mis. reverse geocoding
  // setelah pin peta berpindah, atau saat memuat alamat tersimpan).
  useEffect(() => {
    setQuery(value || '');
  }, [value]);

  const runSearch = async (q) => {
    const trimmed = String(q || '').trim();
    if (trimmed.length < 3) {
      setSuggestions([]);
      setOpen(false);
      setBusy(false);
      return;
    }
    setBusy(true);
    const results = await searchAddress(trimmed);
    setSuggestions(results);
    setOpen(results.length > 0);
    setBusy(false);
  };

  const handleChange = (q) => {
    setQuery(q);
    onChange(q);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => runSearch(q), 400);
  };

  const pick = (s) => {
    setQuery(s.display_name);
    setSuggestions([]);
    setOpen(false);
    if (onPick) onPick({ address: s.display_name, lat: s.lat, lng: s.lng });
    else onChange(s.display_name);
  };

  // Tutup dropdown saat mengklik di luar kolom
  useEffect(() => {
    const onDoc = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  return (
    <div className="relative" ref={boxRef}>
      <input className={className} value={query} onChange={(e) => handleChange(e.target.value)} onFocus={() => suggestions.length > 0 && setOpen(true)} placeholder={placeholder} autoComplete="off" />
      {busy && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-gray-400">Searching…</span>}
      {open && suggestions.length > 0 && (
        <ul className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-gray-200 bg-white py-1 shadow-lg">
          {suggestions.map((s, i) => (
            <li key={i}>
              <button type="button" onClick={() => pick(s)} className="block w-full px-3 py-2 text-left text-xs text-gray-700 hover:bg-go-50">
                📍 {s.display_name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
