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

    // Détecter SESSION_INVALIDATED globalement — AuthContext écoute cet événement
    if (response.status === 401 && typeof window !== 'undefined') {
      response.clone().json().then((body) => {
        if (body?.message === 'SESSION_INVALIDATED') {
          window.dispatchEvent(new CustomEvent('auth:session-invalidated'));
        }
      }).catch(() => {});
    }

    return response;
  } finally {
    clearTimeout(id);
  }
}
