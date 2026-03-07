'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams }    from 'next/navigation';
import * as storage from '@/lib/storage';

const TOKEN_KEY       = 'structura_token';
const USER_KEY        = 'structura_user';
const IMPERSONATE_KEY = 'structura_impersonated';
const API_BASE        = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

/**
 * Page de réception du code d'impersonation.
 *
 * URL : /impersonate?code=<uuid>
 *
 * Flux sécurisé :
 *   1. L'admin génère un code opaque via POST /admin/tenants/:id/impersonate
 *   2. Le code (UUID, TTL 2min, usage unique) est passé en paramètre d'URL
 *   3. Cette page échange le code contre le JWT via POST /auth/impersonate-exchange
 *   4. Le JWT est stocké en sessionStorage (jamais dans l'URL)
 *   5. /auth/me est appelé pour récupérer les données complètes du directeur
 *
 * Avantages vs token en URL :
 *   - Le JWT ne transite jamais dans l'historique du navigateur
 *   - Les logs nginx/proxy ne voient que le code UUID (2min d'exposition max)
 *   - Usage unique : un code ne peut être utilisé qu'une fois
 */
function ImpersonateInner() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'error'>('loading');
  const [error,  setError]  = useState('');

  useEffect(() => {
    const code = searchParams.get('code');

    if (!code || code.length < 10) {
      setError("Code d'impersonation manquant ou invalide dans l'URL");
      setStatus('error');
      return;
    }

    async function activate() {
      try {
        // 1. Échanger le code opaque contre le JWT (usage unique)
        const exchangeRes = await fetch(`${API_BASE}/auth/impersonate-exchange`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ code }),
        });

        if (!exchangeRes.ok) {
          const body = await exchangeRes.json().catch(() => ({}));
          throw new Error(body.message ?? `Code invalide ou expiré (${exchangeRes.status})`);
        }

        const { token } = await exchangeRes.json();

        // 2. Vérifier l'expiration côté client (vérification basique du payload JWT)
        const parts = token.split('.');
        if (parts.length === 3) {
          const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
          if (payload.exp * 1000 < Date.now()) {
            throw new Error('Token expiré — contactez un administrateur');
          }
        }

        // 3. Stocker le token en sessionStorage (persist=false)
        storage.setAuthItem(TOKEN_KEY, token, false);
        sessionStorage.setItem(IMPERSONATE_KEY, '1');

        // 4. Récupérer les données complètes du directeur via /auth/me
        const meRes = await fetch(`${API_BASE}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!meRes.ok) {
          throw new Error(`Impossible de récupérer le profil (${meRes.status})`);
        }

        const userData = await meRes.json();

        // 5. Stocker les données user en sessionStorage
        storage.setAuthItem(USER_KEY, JSON.stringify(userData), false);

        // 6. Rediriger vers le dashboard
        router.replace('/dashboard');
      } catch (e: any) {
        // Nettoyer en cas d'erreur
        storage.removeAuthItem(TOKEN_KEY);
        storage.removeAuthItem(USER_KEY);
        sessionStorage.removeItem(IMPERSONATE_KEY);
        setError(e.message ?? "Erreur lors de la connexion par impersonation");
        setStatus('error');
      }
    }

    activate();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, router]);

  if (status === 'loading') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-gray-500">Connexion en cours…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4 p-8">
      <div className="bg-red-50 border border-red-200 rounded-2xl p-6 max-w-md text-center">
        <p className="text-red-700 font-semibold mb-2">Impersonation impossible</p>
        <p className="text-red-600 text-sm">{error}</p>
      </div>
    </div>
  );
}

export default function ImpersonatePage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col items-center justify-center min-h-screen gap-4">
          <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-500">Chargement…</p>
        </div>
      }
    >
      <ImpersonateInner />
    </Suspense>
  );
}
