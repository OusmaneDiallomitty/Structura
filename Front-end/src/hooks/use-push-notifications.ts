'use client';

import { useEffect, useRef } from 'react';
import { getVapidPublicKey, subscribePush } from '@/lib/api/notifications.service';
import * as storage from '@/lib/storage';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function usePushNotifications(enabled: boolean) {
  const registeredRef = useRef(false);

  useEffect(() => {
    if (!enabled || registeredRef.current) return;
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

    registeredRef.current = true;

    const register = async () => {
      try {
        const token = storage.getAuthItem('structura_token');
        if (!token) return;

        // Enregistrer le Service Worker
        const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        await navigator.serviceWorker.ready;

        // Vérifier la permission existante
        if (Notification.permission === 'denied') return;

        // Demander la permission si pas encore accordée
        if (Notification.permission === 'default') {
          const permission = await Notification.requestPermission();
          if (permission !== 'granted') return;
        }

        // Récupérer la clé VAPID publique
        const vapidPublicKey = await getVapidPublicKey();
        if (!vapidPublicKey) return;

        // S'abonner au push
        const subscription = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
        });

        // Envoyer la subscription au backend
        await subscribePush(token, subscription.toJSON());
      } catch (err) {
        // Silencieux — les push sont une feature bonus, pas critique
        console.debug('[Push] Erreur enregistrement:', err);
      }
    };

    register();
  }, [enabled]);
}
