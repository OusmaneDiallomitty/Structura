import { fetchWithTimeout } from '@/lib/fetch-with-timeout';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

export interface SubscriptionStatus {
  plan: {
    key: 'FREE' | 'PRO' | 'PRO_PLUS';
    name: string;
    description: string;
  };
  status: string;
  trial: {
    isTrialing: boolean;
    endsAt: string | null;
  };
  period: {
    start: string | null;
    end: string | null;
  };
  usage: {
    students: { current: number; limit: number | null };
    classes:  { current: number; limit: number | null };
    users:    { current: number; limit: number | null };
  };
  features: Record<string, boolean>;
  pricing: {
    PRO:      { monthly: number; annual: number };
    PRO_PLUS: { monthly: number; annual: number };
  };
}

export interface CheckoutResult {
  paymentUrl: string;
  transactionId: string;
  amount: number;
  currency: string;
}

export interface VerifyPaymentResult {
  success: boolean;
  plan?: string;
  period?: string;
  amount?: number;
}

/**
 * Récupère le statut d'abonnement du tenant courant
 */
export async function getSubscriptionStatus(token: string): Promise<SubscriptionStatus> {
  const response = await fetchWithTimeout(`${API_BASE_URL}/subscriptions/status`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message ?? 'Impossible de récupérer le statut d\'abonnement');
  }
  return response.json();
}

/**
 * Crée un paiement d'abonnement via Djomy
 * Retourne l'URL de redirection vers la page de paiement
 */
export async function createCheckout(
  token: string,
  plan: 'PRO' | 'PRO_PLUS',
  period: 'monthly' | 'annual',
  payerNumber: string,
): Promise<CheckoutResult> {
  const response = await fetchWithTimeout(`${API_BASE_URL}/subscriptions/checkout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ plan, period, payerNumber }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message ?? 'Impossible de créer le paiement');
  }
  return response.json();
}

/**
 * Vérifie si un paiement est confirmé après retour de Djomy
 */
export async function verifyPayment(
  token: string,
  ref: string,
): Promise<VerifyPaymentResult> {
  const response = await fetchWithTimeout(
    `${API_BASE_URL}/subscriptions/verify?ref=${encodeURIComponent(ref)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok) return { success: false };
  return response.json();
}
