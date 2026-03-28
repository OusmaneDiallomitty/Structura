import { useState, useEffect } from 'react';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

/**
 * Hook canonique pour détecter l'état de connectivité RÉELLE.
 *
 * Pourquoi pas seulement navigator.onLine ?
 *   navigator.onLine = true si l'appareil est connecté à un réseau (WiFi, EDGE...).
 *   Mais sur une connexion EDGE/mobile africaine, tu peux être "connecté" sans avoir
 *   accès à internet. navigator.onLine ne fire pas 'offline' dans ce cas.
 *
 * Solution : écouter 3 sources complémentaires :
 *   1. navigator.onLine / événements 'online'/'offline' du navigateur (déconnexion franche)
 *   2. 'network:offline' dispatché par fetchWithTimeout quand un appel API échoue réellement
 *   3. 'network:online'  dispatché par fetchWithTimeout quand un appel API réussit
 *
 * + Ping proactif : quand 'online' se déclenche, on confirme avec /api/health avant
 *   de passer en ligne — évite les faux positifs sur EDGE.
 *
 * Résultat : isOnline reflète si le serveur est joignable, pas juste si le réseau existe.
 * SSR-safe : retourne true côté serveur (fallback sûr pour Next.js).
 */
export function useOnline(): boolean {
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof window !== 'undefined' ? window.navigator.onLine : true,
  );

  useEffect(() => {
    // Vérifie la connectivité réelle via /api/health
    const pingServer = async (): Promise<boolean> => {
      try {
        const res = await fetch(`${API_BASE_URL}/health`, {
          method: 'GET',
          cache: 'no-store',
          signal: AbortSignal.timeout(5_000),
        });
        return res.ok;
      } catch {
        return false;
      }
    };

    // Source 1 : événements navigateur natifs (WiFi coupé, mode avion…)
    const handleOffline = () => setIsOnline(false);

    // Quand le navigateur pense qu'on est en ligne, on confirme avec un ping
    const handleOnline = async () => {
      const reachable = await pingServer();
      setIsOnline(reachable);
    };

    // Source 2 & 3 : vrais résultats des appels API (fiable sur EDGE/connexions mobiles)
    const handleNetworkOffline = () => setIsOnline(false);
    const handleNetworkOnline  = () => setIsOnline(true);

    window.addEventListener('online',          handleOnline);
    window.addEventListener('offline',         handleOffline);
    window.addEventListener('network:offline', handleNetworkOffline);
    window.addEventListener('network:online',  handleNetworkOnline);

    return () => {
      window.removeEventListener('online',          handleOnline);
      window.removeEventListener('offline',         handleOffline);
      window.removeEventListener('network:offline', handleNetworkOffline);
      window.removeEventListener('network:online',  handleNetworkOnline);
    };
  }, []);

  return isOnline;
}
