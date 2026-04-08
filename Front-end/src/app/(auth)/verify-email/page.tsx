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
      setMessage('Token de vérification manquant. Utilisez le lien reçu par email.');
      return;
    }

    let cancelled = false;
    // Timeout 60s — Render peut mettre 20-30s à se réveiller sur mobile avec connexion lente
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60_000);

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
          localStorage.setItem('structura_token', data.token);
          localStorage.setItem('structura_refresh_token', data.refreshToken);
          localStorage.setItem('structura_user', JSON.stringify(data.user));

          const target = data.user?.moduleType === 'COMMERCE' ? '/dashboard/commerce' : '/dashboard';
          setDashboardUrl(target);
          setStatus('success');
          setMessage('Votre email a été vérifié avec succès !');
          setTimeout(() => {
            if (!cancelled) window.location.href = target;
          }, 2000);
        } else {
          // Le compte est peut-être déjà activé (double clic, lien cliqué deux fois)
          setStatus('error');
          setMessage('already_verified');
        }
      } catch (err: any) {
        if (cancelled) return;
        if (err.name === 'AbortError') {
          // Timeout — le serveur a peut-être quand même traité la demande
          setStatus('error');
          setMessage('timeout');
        } else {
          setStatus('error');
          setMessage('network');
        }
      } finally {
        clearTimeout(timeoutId);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timeoutId);
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
            {status === 'error' && (message === 'timeout' || message === 'network')
              ? 'Connexion lente'
              : status === 'error' && 'Lien déjà utilisé'}
          </CardTitle>

          <CardDescription className="text-base mt-2">
            {status === 'loading' && 'Veuillez patienter, cela peut prendre quelques secondes…'}
            {status === 'success' && 'Votre email a été vérifié avec succès !'}
            {status === 'error' && message === 'timeout' && 'La connexion a pris trop de temps.'}
            {status === 'error' && message === 'network' && 'Impossible de contacter le serveur.'}
            {status === 'error' && message === 'already_verified' && 'Ce lien a déjà été utilisé.'}
            {status === 'error' && !['timeout','network','already_verified'].includes(message) && message}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {status === 'success' && (
            <div className="text-center space-y-4">
              <p className="text-sm text-gray-600">
                Votre compte a été activé. Redirection vers votre tableau de bord...
              </p>
              <Button onClick={() => window.location.href = dashboardUrl} className="w-full">
                Accéder au tableau de bord
              </Button>
            </div>
          )}

          {status === 'error' && (
            <div className="text-center space-y-4">
              {/* Message rassurant dans tous les cas d'erreur */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
                {message === 'timeout' || message === 'network' ? (
                  <>
                    <p className="font-medium mb-1">Votre compte est probablement activé.</p>
                    <p>La connexion était lente mais la vérification a peut-être réussi. Essayez de vous connecter directement.</p>
                  </>
                ) : (
                  <>
                    <p className="font-medium mb-1">Déjà vérifié ?</p>
                    <p>Si vous venez de créer votre compte, il est peut-être déjà activé. Essayez de vous connecter.</p>
                  </>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <Button onClick={() => router.push('/login')} className="w-full">
                  Se connecter
                </Button>
                <Button onClick={() => router.push('/register')} variant="outline" className="w-full">
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
