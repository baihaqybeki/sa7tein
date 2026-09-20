import { useRef, useState } from 'react';
import { prepareImageFile, isPhoto } from '../lib/image.js';

// Pemilih foto yang bisa dipakai ulang: menampilkan gambar saat ini (atau
// fallback emoji) dan memungkinkan pengguna mengunggah foto dari perangkatnya.
// Gambar dikompres otomatis sebelum disimpan.
export default function PhotoUploader({ value, onChange, emoji = '🍽️', label = 'Photo', size = 'lg', round = false, hint }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const pick = () => inputRef.current?.click();

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    setBusy(true);
    try {
      const dataUrl = await prepareImageFile(file);
      onChange(dataUrl);
    } catch (err) {
      console.error(err);
      setError('Could not read that image. Please try another file.');
    } finally {
      setBusy(false);
    }
  };

  const box = size === 'sm' ? 'h-16 w-16 text-2xl' : 'h-24 w-24 text-4xl';
  const hasPhoto = isPhoto(value);

  return (
    <div className="flex items-center gap-3">
      <div className={`${box} shrink-0 overflow-hidden bg-go-50 ring-1 ring-gray-100 ${round ? 'rounded-full' : 'rounded-2xl'}`}>
        {hasPhoto ? (
          <img
            src={value}
            alt={label}
            className="h-full w-full object-cover"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        ) : (
          <div className="grid h-full w-full place-items-center">{emoji}</div>
        )}
      </div>
      <div className="min-w-0 space-y-1">
        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
        <div className="flex items-center gap-2">
          <button type="button" onClick={pick} disabled={busy} className="rounded-lg bg-go-50 px-3 py-1.5 text-xs font-bold text-go-600 hover:bg-go-100 disabled:opacity-50">
            {busy ? 'Uploading…' : hasPhoto ? '🖼️ Change photo' : '📷 Upload photo'}
          </button>
          {hasPhoto && (
            <button type="button" onClick={() => onChange(null)} className="rounded-lg px-2 py-1 text-xs font-semibold text-gray-400 hover:text-red-500">
              ✕ Remove
            </button>
          )}
        </div>
        {error && <div className="text-[11px] font-semibold text-red-500">{error}</div>}
        {hint && !error && <div className="text-[11px] text-gray-400">{hint}</div>}
      </div>
    </div>
  );
}
