'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import * as storage from '@/lib/storage';

function VerifyEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const [dashboardUrl, setDashboardUrl] = useState('/dashboard');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('Token de vérification manquant ou invalide');
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    (async () => {
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/verify-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
          signal: controller.signal,
        });

        if (cancelled) return;

        const data = await response.json();

        if (response.ok && data.token) {
          // Sauvegarder le JWT en localStorage (persistant) — indispensable sur mobile
          // car le lien email s'ouvre dans un Chrome Custom Tab (onglet isolé) qui a
          // son propre sessionStorage. Si on utilise sessionStorage ici, le token
          // disparaît quand l'onglet se ferme et l'utilisateur arrive déconnecté.
          localStorage.setItem('structura_token', data.token);
          localStorage.setItem('structura_refresh_token', data.refreshToken);
          localStorage.setItem('structura_user', JSON.stringify(data.user));

          const target = data.user?.moduleType === 'COMMERCE' ? '/dashboard/commerce' : '/dashboard';
          setDashboardUrl(target);
          setStatus('success');
          setMessage('Votre email a été vérifié avec succès !');
          // Utiliser window.location.href (navigation dure) plutôt que router.push
          // pour forcer le rechargement complet de la page dans le bon contexte d'onglet
          setTimeout(() => {
            if (!cancelled) window.location.href = target;
          }, 2000);
        } else {
          setStatus('error');
          setMessage('Le lien de vérification est invalide ou a expiré.');
        }
      } catch (err: any) {
        if (err.name === 'AbortError' || cancelled) return;
        setStatus('error');
        setMessage('Impossible de contacter le serveur. Vérifiez votre connexion.');
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [token]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            {status === 'loading' && (
              <Loader2 className="h-16 w-16 text-blue-600 animate-spin" />
            )}
            {status === 'success' && (
              <CheckCircle2 className="h-16 w-16 text-green-600" />
            )}
            {status === 'error' && (
              <XCircle className="h-16 w-16 text-red-600" />
            )}
          </div>

          <CardTitle className="text-2xl">
            {status === 'loading' && 'Vérification en cours...'}
            {status === 'success' && 'Email vérifié !'}
            {status === 'error' && 'Erreur de vérification'}
          </CardTitle>

          <CardDescription className="text-base mt-2">
            {message}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {status === 'success' && (
            <div className="text-center space-y-4">
              <p className="text-sm text-gray-600">
                Votre compte a été activé. Redirection vers votre tableau de bord...
              </p>
              <Button onClick={() => router.push(dashboardUrl)} className="w-full">
                Accéder au tableau de bord
              </Button>
            </div>
          )}

          {status === 'error' && (
            <div className="text-center space-y-4">
              <p className="text-sm text-gray-600">
                Le lien de vérification est invalide ou a expiré.
              </p>
              <div className="flex flex-col gap-2">
                <Button onClick={() => router.push('/login')} variant="outline" className="w-full">
                  Retour à la connexion
                </Button>
                <Button onClick={() => router.push('/register')} className="w-full">
                  Créer un nouveau compte
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    }>
      <VerifyEmailContent />
    </Suspense>
  );
}
