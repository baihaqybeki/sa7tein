import { useState } from 'react';
import { useStore } from '@sa7tein/shared/lib/store.js';
import { reverseGeocode, getCurrentPosition } from '@sa7tein/shared/lib/geo.js';
import MapView from '@sa7tein/shared/components/MapView.jsx';
import AddressAutocomplete from '@sa7tein/shared/components/AddressAutocomplete.jsx';

// Memungkinkan customer mengatur alamat pengantaran dan titik antar.
// Berada di halaman Home; data yang sama dipakai saat checkout.
export default function DeliveryLocationCard() {
  const customer = useStore((s) => s.customer);
  const setCustomer = useStore((s) => s.setCustomer);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);

  const openEdit = () => {
    setForm({ address: customer.address || '', lat: customer.lat, lng: customer.lng });
    setEditing(true);
  };

  const save = () => {
    if (!form.address || !form.address.trim()) return alert('Please enter a delivery address.');
    setCustomer(form);
    setEditing(false);
  };

  // Dipanggil setiap pin berpindah (drag, klik peta, atau geolokasi): perbarui
  // koordinat segera dan reverse-geocode untuk mengisi alamat otomatis.
  const handlePointChange = async (ll) => {
    setForm((f) => ({ ...f, lat: ll.lat, lng: ll.lng }));
    const addr = await reverseGeocode(ll.lat, ll.lng);
    if (addr) {
      // Terapkan hanya jika pin belum berpindah lagi saat kita mengambil data
      setForm((f) => (f.lat === ll.lat && f.lng === ll.lng ? { ...f, address: addr } : f));
    }
  };

  const useMyLocation = () => {
    getCurrentPosition()
      .then(({ latitude, longitude }) => handlePointChange({ lat: latitude, lng: longitude }))
      .catch(() => alert('Unable to get your location.'));
  };

  if (!editing) {
    return (
      <div className="card flex items-center justify-between gap-3 p-3">
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Deliver to</div>
          <div className="truncate text-sm font-bold text-gray-800">📍 {customer.address || 'Set your delivery address'}</div>
        </div>
        <button onClick={openEdit} className="btn-ghost !px-3 !py-1.5 text-xs">
          ✏️ Edit
        </button>
      </div>
    );
  }

  return (
    <div className="card space-y-2 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-gray-700">📍 Delivery location</h2>
        <button onClick={() => setEditing(false)} className="text-gray-400 hover:text-gray-600">
          ✕
        </button>
      </div>
      <p className="text-xs text-gray-400">Drag the pin, click the map, or search the address below. The address fills in automatically.</p>
      <MapView center={[form.lat, form.lng]} editablePoint={form} onPointChange={handlePointChange} className="h-52" />
      <AddressAutocomplete value={form.address} onChange={(address) => setForm((f) => ({ ...f, address }))} onPick={({ address, lat, lng }) => setForm((f) => ({ ...f, address, lat, lng }))} placeholder="Search address or type it…" />
      <div className="flex items-center justify-between gap-2">
        <button onClick={useMyLocation} className="text-xs font-bold text-go-600 hover:underline">
          📡 Use my location
        </button>
        <div className="flex gap-2">
          <button onClick={() => setEditing(false)} className="btn-ghost !px-3 !py-1.5 text-xs">
            Cancel
          </button>
          <button onClick={save} className="btn-primary !px-3 !py-1.5 text-xs">
            💾 Save
          </button>
        </div>
      </div>
    </div>
  );
}
