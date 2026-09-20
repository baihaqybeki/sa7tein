import { useState } from 'react';
import { useStore } from '../lib/store.js';
import { getBackend } from '../lib/backend/index.js';
import { DEMO_PASSWORD } from '../data/seed.js';

const DEMO_EMAILS = {
  customer: ['customer@sa7tein.app'],
  merchant: ['merchant@sa7tein.app'],
  courier: ['courier@sa7tein.app', 'courier2@sa7tein.app', 'courier3@sa7tein.app'],
  cs: ['cs@sa7tein.app'],
};

/**
 * Layar masuk / pendaftaran bersama.
 * Dipakai sebagai pintu masuk setiap portal (customer, merchant, kurir).
 */
export default function AuthPage({ role, appName = 'Sa7tein', emoji = '🍽️', title, subtitle }) {
  const setCurrentUser = useStore((s) => s.setCurrentUser);

  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const switchMode = (next) => {
    setMode(next);
    setError('');
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const backend = getBackend();
      const user = mode === 'login' ? await backend.login({ email, password, role }) : await backend.register({ name, email, phone, password, role });
      setCurrentUser(user);
    } catch (err) {
      setError(err?.message || 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const isLogin = mode === 'login';

  return (
    <div className="flex min-h-[70vh] items-center justify-center py-8">
      <div className="w-full max-w-md">
        {/* Branding */}
        <div className="mb-6 text-center">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-gradient-to-br from-go-500 to-go-600 text-3xl shadow-lg shadow-go-500/30">{emoji}</div>
          <h1 className="mt-4 text-2xl font-extrabold text-gray-800">
            {appName} <span className="text-go-500">{title}</span>
          </h1>
          {subtitle && <p className="mt-1 text-sm text-gray-500">{subtitle}</p>}
        </div>

        <div className="card overflow-hidden">
          {/* Toggle mode */}
          <div className="grid grid-cols-2 border-b border-gray-100">
            {[
              ['login', 'Sign in'],
              ['register', 'Create account'],
            ].map(([key, label]) => (
              <button key={key} type="button" onClick={() => switchMode(key)} className={`py-3 text-sm font-bold transition ${mode === key ? 'border-b-2 border-go-500 text-go-600' : 'text-gray-400 hover:text-gray-600'}`}>
                {label}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="space-y-4 p-5">
            {!isLogin && (
              <div>
                <label className="label">Full name</label>
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your full name" autoComplete="name" required />
              </div>
            )}

            <div>
              <label className="label">Email address</label>
              <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" required />
            </div>

            {!isLogin && (
              <div>
                <label className="label">Phone number</label>
                <input className="input" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="08xx-xxxx-xxxx" autoComplete="tel" />
              </div>
            )}

            <div>
              <label className="label">Password</label>
              <input
                className="input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={isLogin ? 'Your password' : 'At least 6 characters'}
                autoComplete={isLogin ? 'current-password' : 'new-password'}
                minLength={6}
                required
              />
            </div>

            {error && <div className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-600">{error}</div>}

            <button type="submit" disabled={busy} className="btn-primary w-full py-3">
              {busy ? 'Please wait…' : isLogin ? 'Sign in' : 'Create account'}
            </button>
          </form>
        </div>

        {/* Demo access */}
        <div className="mt-4 rounded-2xl bg-gray-50 p-4 ring-1 ring-black/5">
          <div className="text-xs font-bold uppercase tracking-wide text-gray-400">Demo access</div>
          <p className="mt-1 text-sm text-gray-600">
            Demo accounts: <span className="font-semibold text-gray-800">{DEMO_EMAILS[role].join(', ')}</span>
          </p>
          <p className="text-sm text-gray-600">
            Password: <span className="font-semibold text-gray-800">{DEMO_PASSWORD}</span>
          </p>
        </div>
      </div>
    </div>
  );
}
