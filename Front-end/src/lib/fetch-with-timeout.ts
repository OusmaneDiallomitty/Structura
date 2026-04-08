/**
 * Wrapper fetch avec timeout configurable.
 *
 * Responsabilités :
 *  1. Timeout configurable (défaut 10s) — évite les requêtes bloquées indéfiniment.
 *  2. Détection SESSION_INVALIDATED — déclenche déconnexion automatique via AuthContext.
 *  3. Détection vraie connectivité réseau — dispatche `network:offline` / `network:online`
 *     pour corriger `navigator.onLine` qui est unreliable sur EDGE/connexions mobiles :
 *     navigator.onLine = true même quand le débit est coupé → useOnline() reflète la réalité.
 *     En interceptant les erreurs réseau réelles ici, useOnline() reflète la réalité.
 */

/**
 * Messages backend qui indiquent que la session est définitivement invalide.
 * Partagé entre fetchWithTimeout et tous les services API (commerce, users, auth…).
 */
const FATAL_SESSION_MESSAGES = [
  'SESSION_INVALIDATED',
  'Compte invalide ou désactivé',
  'Organisation désactivée',
  'Token invalide',
];

/**
 * Vérifie si un message d'erreur API indique une session invalidée,
 * et si oui dispatche l'événement global `auth:session-invalidated`.
 * À appeler dans tous les services API après avoir reçu un 401.
 * Retourne true si l'événement a été dispatché.
 */
export function checkAndDispatchSessionInvalidated(message: string): boolean {
  if (typeof window === 'undefined') return false;
  if (FATAL_SESSION_MESSAGES.includes(message)) {
    window.dispatchEvent(new CustomEvent('auth:session-invalidated'));
    return true;
  }
  return false;
}

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
      response.clone().json().then((body) => {
        checkAndDispatchSessionInvalidated(body?.message ?? '');
      }).catch(() => {});
    }

    return response;
  } catch (err) {
    // TypeError = erreur réseau réelle (pas de connexion, DNS, CORS, etc.)
    // AbortError  = timeout déclenché par notre controller
    if (typeof window !== 'undefined') {
      _networkWasOffline = true;
      window.dispatchEvent(new CustomEvent('network:offline'));
    }
    throw err;
  } finally {
    clearTimeout(id);
  }
}
