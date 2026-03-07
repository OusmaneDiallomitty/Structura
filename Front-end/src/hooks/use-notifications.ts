'use client';

import { useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import * as storage from '@/lib/storage';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

async function saveSubscriptionToBackend(subscriptionId: string, token: string) {
  try {
    await fetch(`${API_BASE_URL}/notifications/subscribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ subscriptionId }),
    });
  } catch {
    // Silencieux — pas bloquant
  }
}

export function useNotifications() {
  const { user } = useAuth();
  const initialized = useRef(false);

  useEffect(() => {
    // Ne s'exécute que côté navigateur, une seule fois, et seulement si l'utilisateur est connecté
    if (initialized.current || !user || typeof window === 'undefined') return;
    if (!process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID) return;

    initialized.current = true;

    (async () => {
      try {
        const OneSignal = (await import('react-onesignal')).default;

        await OneSignal.init({
          appId: process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID!,
          serviceWorkerPath: '/OneSignalSDKWorker.js',
          // Demande la permission automatiquement après 3 secondes
          promptOptions: {
            slidedown: {
              prompts: [
                {
                  type: 'push',
                  autoPrompt: true,
                  text: {
                    actionMessage: 'Activez les notifications pour rester informé (présences, paiements, etc.)',
                    acceptButton: 'Activer',
                    cancelButton: 'Plus tard',
                  },
                  delay: {
                    timeDelay: 3,
                    pageViews: 1,
                  },
                },
              ],
            },
          },
          allowLocalhostAsSecureOrigin: process.env.NODE_ENV === 'development',
        });

        // Récupère le subscription ID et le sauvegarde en BDD
        const subscriptionId = await OneSignal.User.PushSubscription.id;
        if (subscriptionId) {
          const token = storage.getAuthItem('structura_token');
          if (token) await saveSubscriptionToBackend(subscriptionId, token);
        }

        // Écoute les changements de subscription (quand l'utilisateur accepte)
        OneSignal.User.PushSubscription.addEventListener('change', async (event) => {
          const id = event.current.id;
          if (id) {
            const token = storage.getAuthItem('structura_token');
            if (token) await saveSubscriptionToBackend(id, token);
          }
        });
      } catch {
        // OneSignal non disponible (navigateur incompatible, bloqué, etc.) — silencieux
      }
    })();
  }, [user]);
}
