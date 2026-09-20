import { useEffect, useState } from 'react';
import { useStore } from '../lib/store.js';
import { getBackend } from '../lib/backend/index.js';
import { reverseGeocode, getCurrentPosition } from '../lib/geo.js';
import MapView from './MapView.jsx';
import AddressAutocomplete from './AddressAutocomplete.jsx';

// Pengaturan akun yang dipakai semua portal: nama, email terverifikasi, telepon
// terverifikasi, dan alamat. Perubahan email/telepon butuh kode verifikasi (demo).
// Untuk merchant ada satu identitas — restorannya — sehingga nama dan alamat yang
// ditampilkan di sini ADALAH milik restoran (tetap sinkron dengan dashboard).
export default function ProfileSettings() {
  const currentUser = useStore((s) => s.currentUser);
  const setCurrentUser = useStore((s) => s.setCurrentUser);
  const setCustomer = useStore((s) => s.setCustomer);
  const customer = useStore((s) => s.customer);
  const merchants = useStore((s) => s.merchants);
  const role = currentUser?.role;
  const merchant = role === 'merchant' ? merchants.find((m) => m.id === currentUser?.merchantId) : null;

  const [form, setForm] = useState({
    name: merchant?.name || currentUser?.name || '',
    email: currentUser?.email || '',
    phone: currentUser?.phone || '',
    address: merchant?.address || currentUser?.address || '',
    lat: role === 'customer' ? (typeof customer?.lat === 'number' ? customer.lat : -6.2) : (merchant?.lat ?? -6.2),
    lng: role === 'customer' ? (typeof customer?.lng === 'number' ? customer.lng : 106.8166) : (merchant?.lng ?? 106.8166),
  });
  const [emailCode, setEmailCode] = useState('');
  const [phoneCode, setPhoneCode] = useState('');
  const [emailSent, setEmailSent] = useState(false);
  const [phoneSent, setPhoneSent] = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [error, setError] = useState('');

  const emailChanged = form.email !== currentUser?.email;
  const phoneChanged = form.phone !== currentUser?.phone;

  // Untuk merchant, tampilkan nama/alamat/koordinat restoran yang tersimpan
  // setiap record berubah (mis. lokasi diedit di dashboard), tanpa menimpa
  // apa yang sedang diketik pengguna di sini.
  useEffect(() => {
    if (role !== 'merchant') return;
    setForm((f) => ({
      ...f,
      name: merchant?.name || f.name,
      address: merchant?.address || f.address,
      lat: merchant?.lat ?? f.lat,
      lng: merchant?.lng ?? f.lng,
    }));
  }, [merchant?.name, merchant?.address, merchant?.lat, merchant?.lng]);

  // Untuk customer, tampilkan lokasi pengantaran yang tersimpan (mis. dari kartu
  // "Deliver to" di Home) tanpa menimpa apa yang sedang diketik pengguna di sini.
  useEffect(() => {
    if (role !== 'customer') return;
    setForm((f) => ({
      ...f,
      address: customer?.address || f.address,
      lat: typeof customer?.lat === 'number' ? customer.lat : f.lat,
      lng: typeof customer?.lng === 'number' ? customer.lng : f.lng,
    }));
  }, [customer?.address, customer?.lat, customer?.lng]);

  const sendCode = async (channel) => {
    setError('');
    setMsg(null);
    try {
      const res = await getBackend().sendVerificationCode(channel);
      if (channel === 'email') setEmailSent(true);
      else setPhoneSent(true);
      setMsg({
        type: 'info',
        text: res?.demoCode ? `Verification code sent. Demo code: ${res.demoCode}` : 'Verification code sent.',
      });
    } catch (e) {
      setError(e?.message || 'Could not send the code.');
    }
  };

  const verify = async (channel) => {
    setError('');
    const code = channel === 'email' ? emailCode : phoneCode;
    if (!code) return setError(`Enter the code that was sent to your ${channel}.`);
    try {
      const ok = await getBackend().verifyCode(channel, code);
      if (!ok) return setError('Incorrect or expired code. Please request a new one.');
      if (channel === 'email') setEmailVerified(true);
      else setPhoneVerified(true);
      setMsg({ type: 'success', text: `${channel[0].toUpperCase()}${channel.slice(1)} verified ✓` });
    } catch (e) {
      setError(e?.message || 'Verification failed.');
    }
  };

  // Pin peta berpindah (klik/seret/geolokasi) memperbarui koordinat dan
  // reverse-geocode alamat, persis seperti editor lokasi di dashboard.
  const handleMapPick = async (ll) => {
    setForm((f) => ({ ...f, lat: ll.lat, lng: ll.lng }));
    const addr = await reverseGeocode(ll.lat, ll.lng);
    if (addr) {
      // Terapkan hanya jika pin belum berpindah lagi saat kita mengambil data
      setForm((f) => (f.lat === ll.lat && f.lng === ll.lng ? { ...f, address: addr } : f));
    }
  };

  const useMyLocation = () => {
    getCurrentPosition()
      .then(({ latitude, longitude }) => handleMapPick({ lat: latitude, lng: longitude }))
      .catch(() => alert('Unable to get your location.'));
  };

  const save = async () => {
    setError('');
    setMsg(null);
    if (!form.name || !form.name.trim()) return setError(role === 'merchant' ? 'Please enter your restaurant name.' : 'Please enter your name.');
    if (emailChanged && !emailVerified) return setError('Verify your new email address before saving.');
    if (phoneChanged && !phoneVerified) return setError('Verify your new phone number before saving.');
    setBusy(true);
    try {
      const patch = { name: form.name, address: form.address || '' };
      if (role === 'merchant') {
        patch.lat = form.lat;
        patch.lng = form.lng;
      }
      if (emailChanged) patch.email = form.email;
      if (phoneChanged) patch.phone = form.phone;
      const updated = await getBackend().updateProfile(patch, {
        emailCode: emailChanged ? emailCode : undefined,
        phoneCode: phoneChanged ? phoneCode : undefined,
      });
      setCurrentUser(updated);
      // Jaga detail pengantaran customer tetap sinkron (termasuk pin peta)
      if (role === 'customer') setCustomer({ name: updated.name, phone: updated.phone, address: updated.address, lat: form.lat, lng: form.lng });
      setMsg({ type: 'success', text: 'Profile updated.' });
    } catch (e) {
      setError(e?.message || 'Could not update your profile.');
    } finally {
      setBusy(false);
    }
  };

  const inputCls = 'input flex-1';

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-extrabold">Settings</h1>

      <div className="card space-y-4 p-4">
        <div>
          <label className="label">{role === 'merchant' ? 'Restaurant name' : 'Full name'}</label>
          <input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>

        <div>
          <label className="label">Email address</label>
          <div className="flex gap-2">
            <input
              className={inputCls}
              type="email"
              value={form.email}
              onChange={(e) => {
                setForm({ ...form, email: e.target.value });
                setEmailVerified(false);
              }}
            />
            {emailChanged && !emailVerified && (
              <button onClick={() => sendCode('email')} className="btn-ghost !px-3 !py-1.5 text-xs">
                Send code
              </button>
            )}
          </div>
          {emailChanged && emailSent && !emailVerified && (
            <div className="mt-2 flex gap-2">
              <input className={inputCls} value={emailCode} onChange={(e) => setEmailCode(e.target.value)} placeholder="Verification code" inputMode="numeric" />
              <button onClick={() => verify('email')} className="btn-primary !px-3 !py-1.5 text-xs">
                Verify
              </button>
            </div>
          )}
          {emailChanged && !emailVerified && <p className="mt-1 text-[11px] font-semibold text-amber-600">Verify your new email before saving.</p>}
          {emailVerified && <p className="mt-1 text-[11px] font-semibold text-go-600">Email verified ✓</p>}
          {!emailChanged && <p className="mt-1 text-[11px] text-gray-400">Current email — change it to verify a new address.</p>}
        </div>

        <div>
          <label className="label">Phone number</label>
          <div className="flex gap-2">
            <input
              className={inputCls}
              value={form.phone}
              onChange={(e) => {
                setForm({ ...form, phone: e.target.value });
                setPhoneVerified(false);
              }}
              placeholder="08xx-xxxx-xxxx"
            />
            {phoneChanged && !phoneVerified && (
              <button onClick={() => sendCode('phone')} className="btn-ghost !px-3 !py-1.5 text-xs">
                Send code
              </button>
            )}
          </div>
          {phoneChanged && phoneSent && !phoneVerified && (
            <div className="mt-2 flex gap-2">
              <input className={inputCls} value={phoneCode} onChange={(e) => setPhoneCode(e.target.value)} placeholder="Verification code" inputMode="numeric" />
              <button onClick={() => verify('phone')} className="btn-primary !px-3 !py-1.5 text-xs">
                Verify
              </button>
            </div>
          )}
          {phoneChanged && !phoneVerified && <p className="mt-1 text-[11px] font-semibold text-amber-600">Verify your new phone number before saving.</p>}
          {phoneVerified && <p className="mt-1 text-[11px] font-semibold text-go-600">Phone verified ✓</p>}
        </div>

        <div>
          <label className="label">{role === 'merchant' ? 'Restaurant address' : role === 'customer' ? 'Delivery address' : 'Address'}</label>
          {role === 'merchant' || role === 'customer' ? (
            <div className="space-y-2">
              <p className="text-xs text-gray-400">Drag the pin, click the map, or search the address below. The address fills in automatically.</p>
              <MapView center={[form.lat, form.lng]} editablePoint={{ address: form.address, lat: form.lat, lng: form.lng }} onPointChange={handleMapPick} className="h-52" />
              <AddressAutocomplete
                value={form.address}
                onChange={(address) => setForm((f) => ({ ...f, address }))}
                onPick={({ address, lat, lng }) => setForm((f) => ({ ...f, address, lat, lng }))}
                placeholder="Search address or type it…"
              />
              <div className="flex items-center justify-between text-[11px] text-gray-400">
                <span>
                  📍 {typeof form.lat === 'number' ? form.lat.toFixed(5) : '—'}, {typeof form.lng === 'number' ? form.lng.toFixed(5) : '—'}
                </span>
                <button onClick={useMyLocation} className="text-xs font-bold text-go-600 hover:underline">
                  📡 Use my location
                </button>
              </div>
            </div>
          ) : (
            <input className={inputCls} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Your address" />
          )}
        </div>

        {error && <div className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">{error}</div>}
        {msg && <div className={`rounded-xl px-4 py-3 text-sm font-semibold ${msg.type === 'success' ? 'bg-go-50 text-go-700' : 'bg-sky-50 text-sky-700'}`}>{msg.text}</div>}

        <button onClick={save} disabled={busy} className="btn-primary w-full py-3">
          {busy ? 'Saving…' : '💾 Save changes'}
        </button>
      </div>
    </div>
  );
}
