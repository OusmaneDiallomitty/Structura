'use client';

import { useState, useEffect, useCallback } from 'react';
import { getSubscriptionStatus, SubscriptionStatus } from '@/lib/api/subscriptions.service';
import * as storage from '@/lib/storage';

const CACHE_KEY = 'structura_subscription_cache';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CachedSubscription {
  data: SubscriptionStatus;
  expiresAt: number;
}

/**
 * Hook useSubscription
 *
 * Fournit le statut d'abonnement du tenant connecté avec cache 5 minutes.
 * Utilisé dans toute l'app pour afficher/masquer les fonctionnalités selon le plan.
 *
 * Usage :
 *   const { plan, hasFeature, isLoading } = useSubscription();
 *   if (!hasFeature('bulletins')) return <UpgradeBadge feature="bulletins" />;
 */
export function useSubscription() {
  const [status, setStatus] = useState<SubscriptionStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadStatus = useCallback(async () => {
    const token = storage.getAuthItem('structura_token');
    if (!token) {
      setIsLoading(false);
      return;
    }

    // Vérifier le cache localStorage (persiste entre les refreshs de page)
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const parsed: CachedSubscription = JSON.parse(cached);
        if (parsed.expiresAt > Date.now()) {
          setStatus(parsed.data);
          setIsLoading(false);
          return;
        }
      }
    } catch {
      // Cache corrompu — on le supprime
      localStorage.removeItem(CACHE_KEY);
    }

    // Fetch depuis l'API
    try {
      const data = await getSubscriptionStatus(token);
      setStatus(data);
      // Mettre en cache pour 5 minutes (localStorage = persiste entre les refreshs)
      const cache: CachedSubscription = {
        data,
        expiresAt: Date.now() + CACHE_TTL_MS,
      };
      localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    } catch {
      // Silencieux : si l'API échoue, on affiche FREE par défaut
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  /** Invalide le cache et recharge (appeler après un paiement réussi) */
  const refresh = useCallback(() => {
    sessionStorage.removeItem(CACHE_KEY);
    setIsLoading(true);
    loadStatus();
  }, [loadStatus]);

  /** Vérifie si le plan courant possède une feature */
  const hasFeature = useCallback(
    (feature: keyof SubscriptionStatus['features']): boolean => {
      // En phase bêta : toutes les features sont disponibles
      if (process.env.NEXT_PUBLIC_BETA_MODE === 'true') return true;
      if (!status) return false;
      return status.features[feature] === true;
    },
    [status],
  );

  const planKey = status?.plan.key ?? 'FREE';
  const isPro     = planKey === 'PRO' || planKey === 'PRO_PLUS';
  const isProPlus = planKey === 'PRO_PLUS';
  const isFree    = planKey === 'FREE';

  return {
    status,
    isLoading,
    refresh,
    hasFeature,
    planKey,
    isPro,
    isProPlus,
    isFree,
  };
}

/** Invalide manuellement le cache abonnement (après paiement webhook reçu) */
export function invalidateSubscriptionCache(): void {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    // Silencieux
  }
}
