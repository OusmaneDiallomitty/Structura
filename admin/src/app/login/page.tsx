'use client';

import { useState, FormEvent, Suspense } from 'react';
import { useRouter, useSearchParams }    from 'next/navigation';
import { Eye, EyeOff }                  from 'lucide-react';
import { login, setToken, setRefreshToken } from '@/lib/api';
import { storeUser, isSuperAdmin }          from '@/lib/auth';

// ─── Bannière session expirée ────────────────────────────────────────────────

function SessionExpiredNotice() {
  const params = useSearchParams();
  if (params.get('reason') !== 'session_expired') return null;

  return (
    <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm
                    px-4 py-3 rounded-xl mb-6 flex items-center gap-2">
      <span>⚠️</span>
      <span>Votre session a expiré. Reconnectez-vous pour continuer.</span>
    </div>
  );
}

// ─── Page login ──────────────────────────────────────────────────────────────

export default function LoginPage() {
  const router = useRouter();
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const [showPwd,  setShowPwd]  = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await login(email, password);

      if (!isSuperAdmin(res.user)) {
        setError('Accès refusé. Ce panneau est réservé aux Super Admins.');
        return;
      }

      setToken(res.token);
      setRefreshToken(res.refreshToken);
      storeUser(res.user);
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message ?? 'Connexion impossible');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-600 to-brand-900">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">

        {/* Logo / Titre */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-brand-600 mb-4">
            <span className="text-white text-2xl font-bold">S</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Structura Admin</h1>
          <p className="text-sm text-gray-500 mt-1">Panneau d'administration plateforme</p>
        </div>

        {/* Notice session expirée */}
        <Suspense fallback={null}>
          <SessionExpiredNotice />
        </Suspense>

        {/* Formulaire */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Adresse email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              placeholder="admin@structura.app"
              className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm
                         focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent
                         transition"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Mot de passe
            </label>
            <div className="relative">
              <input
                type={showPwd ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••••••"
                className="w-full px-4 py-3 pr-12 border border-gray-300 rounded-xl text-sm
                           focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent
                           transition"
              />
              <button
                type="button"
                onClick={() => setShowPwd(!showPwd)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPwd ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 bg-brand-600 hover:bg-brand-700 disabled:opacity-60
                       text-white font-semibold rounded-xl transition text-sm"
          >
            {loading ? 'Connexion…' : 'Se connecter'}
          </button>
        </form>

        <p className="text-center text-xs text-gray-400 mt-6">
          Accès strictement réservé aux administrateurs Structura.
        </p>
      </div>
    </div>
  );
}
