'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import * as storage from '@/lib/storage';
import { verifyPayment } from '@/lib/api/subscriptions.service';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { invalidateSubscriptionCache } from '@/hooks/use-subscription';

function formatGNF(amount: number): string {
  return new Intl.NumberFormat('fr-GN', {
    style: 'currency', currency: 'GNF',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(amount);
}

const PLAN_LABELS: Record<string, string> = {
  PRO:      'Pro',
  PRO_PLUS: 'Pro+',
};

const PERIOD_LABELS: Record<string, string> = {
  monthly: 'Mensuel',
  annual:  'Annuel',
};

export default function BillingSuccessPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const ref = searchParams.get('ref');

  const [state, setState] = useState<'loading' | 'success' | 'pending' | 'error'>('loading');
  const [paymentInfo, setPaymentInfo] = useState<{ plan?: string; period?: string; amount?: number } | null>(null);

  useEffect(() => {
    if (!ref) { setState('error'); return; }

    const token = storage.getAuthItem('structura_token');
    if (!token) { router.push('/login'); return; }

    // Polling — le webhook peut arriver quelques secondes après le retour
    let attempts = 0;
    const maxAttempts = 10;

    const check = async () => {
      try {
        const result = await verifyPayment(token, ref);
        if (result.success) {
          setPaymentInfo({ plan: result.plan, period: result.period, amount: result.amount });
          invalidateSubscriptionCache(); // Forcer rechargement du plan dans toute l'app
          setState('success');
        } else if (attempts >= maxAttempts) {
          setState('pending');
        } else {
          attempts++;
          setTimeout(check, 2_000); // Réessayer dans 2s
        }
      } catch {
        setState('error');
      }
    };

    check();
  }, [ref, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="max-w-md w-full text-center space-y-6">

        {state === 'loading' && (
          <>
            <Loader2 className="w-16 h-16 animate-spin text-primary mx-auto" />
            <h1 className="text-xl font-semibold">Vérification du paiement…</h1>
            <p className="text-muted-foreground text-sm">Nous confirmons votre paiement avec Djomy.</p>
          </>
        )}

        {state === 'success' && (
          <>
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto" />
            <h1 className="text-2xl font-bold">Paiement confirmé !</h1>
            <p className="text-muted-foreground">
              Votre plan{' '}
              <strong>{PLAN_LABELS[paymentInfo?.plan ?? ''] ?? paymentInfo?.plan}</strong>{' '}
              ({PERIOD_LABELS[paymentInfo?.period ?? ''] ?? paymentInfo?.period}) est maintenant actif.
              {paymentInfo?.amount && (
                <> Montant payé : <strong>{formatGNF(paymentInfo.amount)}</strong>.</>
              )}
            </p>
            <div className="space-y-2">
              <Button onClick={() => router.push('/dashboard')} className="w-full">
                Accéder au dashboard
              </Button>
              <Button onClick={() => router.push('/dashboard/billing')} variant="outline" className="w-full">
                Voir mon abonnement
              </Button>
            </div>
          </>
        )}

        {state === 'pending' && (
          <>
            <Loader2 className="w-16 h-16 text-amber-500 mx-auto" />
            <h1 className="text-xl font-semibold">Paiement en cours de traitement</h1>
            <p className="text-muted-foreground text-sm">
              Votre paiement est en cours de confirmation. Votre plan sera activé automatiquement
              dans quelques minutes. Vous pouvez fermer cette page.
            </p>
            <Button onClick={() => router.push('/dashboard')} className="w-full">
              Retour au dashboard
            </Button>
          </>
        )}

        {state === 'error' && (
          <>
            <XCircle className="w-16 h-16 text-destructive mx-auto" />
            <h1 className="text-xl font-semibold">Impossible de vérifier le paiement</h1>
            <p className="text-muted-foreground text-sm">
              Une erreur est survenue. Si vous avez été débité, votre plan sera activé
              automatiquement. Contactez le support si le problème persiste.
            </p>
            <div className="space-y-2">
              <Button onClick={() => router.push('/dashboard/billing')} className="w-full">
                Retour à la page abonnement
              </Button>
            </div>
          </>
        )}

      </div>
    </div>
  );
}
