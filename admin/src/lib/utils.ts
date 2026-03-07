import { clsx, type ClassValue } from 'clsx';

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

/** Formater un nombre en monnaie GNF */
export function formatGNF(amount: number): string {
  return new Intl.NumberFormat('fr-GN', {
    style: 'currency',
    currency: 'GNF',
    minimumFractionDigits: 0,
  }).format(amount);
}

/** Formater une date en français */
export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  return new Intl.DateTimeFormat('fr-FR', {
    day:   '2-digit',
    month: 'short',
    year:  'numeric',
  }).format(new Date(dateStr));
}

/** Badge couleur selon le plan */
export function planColor(plan: string): string {
  const map: Record<string, string> = {
    FREE:     'bg-gray-100 text-gray-700',
    PRO:      'bg-blue-100 text-blue-700',
    PRO_PLUS: 'bg-purple-100 text-purple-700',
  };
  return map[plan?.toUpperCase()] ?? 'bg-gray-100 text-gray-700';
}

/** Label lisible selon le plan */
export function planLabel(plan: string): string {
  const map: Record<string, string> = {
    FREE:     'Free',
    PRO:      'Pro',
    PRO_PLUS: 'Pro+',
  };
  return map[plan?.toUpperCase()] ?? plan;
}

/** Badge couleur selon le statut d'abonnement */
export function statusColor(status: string): string {
  const map: Record<string, string> = {
    ACTIVE:   'bg-green-100 text-green-700',
    TRIALING: 'bg-sky-100 text-sky-700',
    PAST_DUE: 'bg-orange-100 text-orange-700',
    CANCELED: 'bg-red-100 text-red-700',
    EXPIRED:  'bg-red-100 text-red-700',
  };
  return map[status?.toUpperCase()] ?? 'bg-gray-100 text-gray-700';
}
