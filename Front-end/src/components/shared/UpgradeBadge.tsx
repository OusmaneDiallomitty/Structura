'use client';

import Link from 'next/link';
import { Lock, Sparkles } from 'lucide-react';

interface UpgradeBadgeProps {
  /** Message affiché dans le badge */
  message?: string;
  /** Plan requis (affiché dans le badge) */
  requiredPlan?: 'Pro' | 'Pro+';
  /** Variante d'affichage */
  variant?: 'badge' | 'button' | 'inline' | 'block';
  className?: string;
}

/**
 * Badge/bouton affiché à la place des fonctionnalités verrouillées selon le plan.
 * Redirige vers /dashboard/billing au clic.
 */
export function UpgradeBadge({
  message,
  requiredPlan = 'Pro',
  variant = 'badge',
  className = '',
}: UpgradeBadgeProps) {
  const label = message ?? `Disponible en ${requiredPlan}`;

  if (variant === 'block') {
    return (
      <div className={`flex flex-col items-center justify-center py-10 px-6 rounded-xl border-2 border-dashed border-amber-200 bg-linear-to-b from-amber-50 to-orange-50/20 text-center gap-4 ${className}`}>
        <div className="relative">
          <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center ring-4 ring-amber-50">
            <Lock className="w-7 h-7 text-amber-500" />
          </div>
          <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-white">
            <Sparkles className="w-3 h-3" />
          </span>
        </div>

        <div className="space-y-1.5">
          <p className="font-bold text-base text-foreground">
            Fonctionnalité réservée au plan {requiredPlan}
          </p>
          <p className="text-sm text-muted-foreground max-w-xs mx-auto leading-relaxed">
            {label}
          </p>
        </div>

        <Link
          href="/dashboard/billing"
          className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-semibold bg-amber-500 text-white hover:bg-amber-600 active:scale-95 transition-all shadow-sm shadow-amber-200"
        >
          <Sparkles className="w-4 h-4" />
          Passer au {requiredPlan}
        </Link>

        <p className="text-xs text-muted-foreground">
          Déjà abonné ?{' '}
          <Link href="/dashboard/billing" className="underline hover:text-foreground transition-colors">
            Vérifier mon plan
          </Link>
        </p>
      </div>
    );
  }

  if (variant === 'button') {
    return (
      <Link
        href="/dashboard/billing"
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors ${className}`}
      >
        <Lock className="w-3 h-3" />
        {label}
      </Link>
    );
  }

  if (variant === 'inline') {
    return (
      <Link
        href="/dashboard/billing"
        className={`inline-flex items-center gap-1 text-xs text-amber-600 hover:text-amber-800 hover:underline ${className}`}
      >
        <Lock className="w-3 h-3" />
        {label}
      </Link>
    );
  }

  // variant === 'badge' (default)
  return (
    <Link href="/dashboard/billing">
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 hover:bg-amber-200 transition-colors cursor-pointer ${className}`}
      >
        <Lock className="w-3 h-3" />
        {label}
      </span>
    </Link>
  );
}
