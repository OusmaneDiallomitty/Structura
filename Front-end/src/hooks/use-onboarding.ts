"use client";

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import * as storage from '@/lib/storage';
import { getOnboardingStatus, completeOnboarding } from '@/lib/api/setup.service';

export function useOnboarding() {
  const { user } = useAuth();
  const [isOnboardingCompleted, setIsOnboardingCompleted] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkOnboardingStatus();
  }, [user]);

  async function checkOnboardingStatus(retries = 3) {
    if (!user) {
      setIsLoading(false);
      return;
    }

    const token = storage.getAuthItem('structura_token');
    if (!token) {
      setIsOnboardingCompleted(false);
      setIsLoading(false);
      return;
    }

    try {
      const completed = await getOnboardingStatus(token);
      setIsOnboardingCompleted(completed);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : '';

      if (msg === 'THROTTLED' && retries > 0) {
        // Serveur surchargé (429) — réessayer après 1s
        setTimeout(() => checkOnboardingStatus(retries - 1), 1000);
        return;
      }

      // Toute autre erreur réseau : ne PAS afficher le wizard
      // (on ne sait pas si l'onboarding est fait ou non — on reste prudent)
      console.error('Failed to check onboarding status:', error);
      setIsOnboardingCompleted(null);
    } finally {
      setIsLoading(false);
    }
  }

  async function markOnboardingComplete() {
    try {
      const token = storage.getAuthItem('structura_token');
      if (!token) throw new Error('No token');

      await completeOnboarding(token);
      setIsOnboardingCompleted(true);
    } catch (error) {
      console.error('Failed to complete onboarding:', error);
      throw error;
    }
  }

  return {
    isOnboardingCompleted,
    isLoading,
    markOnboardingComplete,
    shouldShowOnboarding: !isLoading && isOnboardingCompleted === false,
  };
}
