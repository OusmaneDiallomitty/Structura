/**
 * Wrapper fetch avec timeout configurable.
 *
 * Responsabilités :
 *  1. Timeout configurable (défaut 10s) — évite les requêtes bloquées indéfiniment.
 *  2. Détection SESSION_INVALIDATED — déclenche déconnexion automatique via AuthContext.
 *  3. Détection vraie connectivité réseau — dispatche `network:offline` / `network:online`
 *     pour corriger `navigator.onLine` qui est unreliable sur EDGE/connexions mobiles :
 *     navigator.onLine = true même quand le débit est coupé → useOnline() se trompe.
 *     En interceptant les erreurs réseau réelles ici, useOnline() reflète la réalité.
 */
// Suivi de l'état réseau réel — évite de dispatcher network:online à chaque requête
let _networkWasOffline = false;

export async function fetchWithTimeout(
  url: string,
  options?: RequestInit,
  timeout = 10_000,
): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });

    // Dispatcher network:online UNIQUEMENT si on était hors ligne avant
    if (typeof window !== 'undefined' && _networkWasOffline) {
      _networkWasOffline = false;
      window.dispatchEvent(new CustomEvent('network:online'));
    }

    // Détecter toute invalidation de session — AuthContext écoute cet événement
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
  } catch (err) {
    // TypeError = erreur réseau réelle (pas de connexion, DNS, CORS, etc.)
    // AbortError  = timeout déclenché par notre controller
    // Dans les deux cas : l'utilisateur n'a pas accès au serveur → marquer offline.
    // Cela corrige le cas EDGE : navigator.onLine=true mais internet coupé.
    if (typeof window !== 'undefined') {
      _networkWasOffline = true;
      window.dispatchEvent(new CustomEvent('network:offline'));
    }
    throw err;
  } finally {
    clearTimeout(id);
  }
}
