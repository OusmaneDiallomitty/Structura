/**
 * Wrapper fetch avec timeout configurable.
 * Évite les requêtes bloquées indéfiniment si le backend ne répond pas.
 * Intercepte aussi les 401 SESSION_INVALIDATED pour déclencher une déconnexion automatique.
 * @param url     URL à appeler
 * @param options Options fetch standard
 * @param timeout Délai maximum en ms (défaut : 10 000 ms)
 */
export async function fetchWithTimeout(
  url: string,
  options?: RequestInit,
  timeout = 10_000,
): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });

    // Détecter toute invalidation de session — AuthContext écoute cet événement
    // Cas couverts :
    //   SESSION_INVALIDATED  → autre appareil connecté / session révoquée
    //   Compte invalide      → compte supprimé entre deux requêtes
    //   Organisation désact. → tenant supprimé ou suspendu
    //   Token invalide       → tenantId corrompu dans le JWT
    if (response.status === 401 && typeof window !== 'undefined') {
      const FATAL_MESSAGES = [
        'SESSION_INVALIDATED',
        'Compte invalide ou désactivé',
        'Organisation désactivée',
        'Token invalide',
      ];
      response.clone().json().then((body) => {
        if (FATAL_MESSAGES.includes(body?.message)) {
          window.dispatchEvent(new CustomEvent('auth:session-invalidated'));
        }
      }).catch(() => {});
    }

    return response;
  } finally {
    clearTimeout(id);
  }
}
