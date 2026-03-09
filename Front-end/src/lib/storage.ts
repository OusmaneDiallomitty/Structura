/**
 * Utilitaires pour gérer le stockage local de manière sécurisée
 * Compatible avec SSR (Server-Side Rendering)
 *
 * Deux modes pour les tokens d'authentification :
 *  - persist=true  → localStorage   (survit à la fermeture du navigateur, 7 jours)
 *  - persist=false → sessionStorage  (effacé à la fermeture du navigateur)
 */

const isClient = typeof window !== "undefined";

// ─── Auth storage (sessionStorage ↔ localStorage selon rememberMe) ────────────

/**
 * Indique si la session courante est persistante (rememberMe coché).
 */
export function isPersistent(): boolean {
  if (!isClient) return false;
  return localStorage.getItem("structura_remember_me") === "true";
}

/**
 * Lit un item d'auth : cherche d'abord dans localStorage, puis sessionStorage.
 */
export function getAuthItem(key: string): string | null {
  if (!isClient) return null;
  try {
    return localStorage.getItem(key) ?? sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * Écrit un item d'auth dans le bon storage selon `persist`.
 * Nettoie automatiquement l'autre storage pour éviter les doublons.
 */
export function setAuthItem(key: string, value: string, persist: boolean): void {
  if (!isClient) return;
  if (persist) {
    try {
      localStorage.setItem(key, value);
      sessionStorage.removeItem(key);
    } catch {
      // localStorage plein (mode privé, quota) → fallback sessionStorage
      try {
        sessionStorage.setItem(key, value);
      } catch { /* ignore : rien à faire si les deux storages sont inaccessibles */ }
    }
  } else {
    try {
      sessionStorage.setItem(key, value);
      localStorage.removeItem(key);
    } catch {
      // sessionStorage inaccessible (iframe sandboxé, etc.) → silencieux
    }
  }
}

/**
 * Supprime un item d'auth des deux storages.
 */
export function removeAuthItem(key: string): void {
  if (!isClient) return;
  try {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  } catch {
    // Silencieux
  }
}

/**
 * Récupérer un élément du localStorage
 */
export function getItem(key: string): string | null {
  if (!isClient) return null;
  
  try {
    return localStorage.getItem(key);
  } catch (error) {
    console.error(`Error getting item from localStorage: ${key}`, error);
    return null;
  }
}

/**
 * Sauvegarder un élément dans le localStorage
 */
export function setItem(key: string, value: string): void {
  if (!isClient) return;
  
  try {
    localStorage.setItem(key, value);
  } catch (error) {
    console.error(`Error setting item in localStorage: ${key}`, error);
  }
}

/**
 * Supprimer un élément du localStorage
 */
export function removeItem(key: string): void {
  if (!isClient) return;
  
  try {
    localStorage.removeItem(key);
  } catch (error) {
    console.error(`Error removing item from localStorage: ${key}`, error);
  }
}

/**
 * Vider tout le localStorage
 */
export function clear(): void {
  if (!isClient) return;
  
  try {
    localStorage.clear();
  } catch (error) {
    console.error("Error clearing localStorage", error);
  }
}

/**
 * Récupérer et parser un objet JSON du localStorage
 */
export function getJSON<T>(key: string): T | null {
  const item = getItem(key);
  if (!item) return null;
  
  try {
    return JSON.parse(item) as T;
  } catch (error) {
    console.error(`Error parsing JSON from localStorage: ${key}`, error);
    return null;
  }
}

/**
 * Récupérer la devise active depuis les préférences régionales de l'utilisateur.
 * Lit `structura_regional_prefs` (JSON : { language, currency }).
 * Retourne "GNF" par défaut si absent ou illisible.
 */
export function getActiveCurrency(): string {
  try {
    const raw = getItem("structura_regional_prefs");
    if (raw) return JSON.parse(raw).currency || "GNF";
  } catch {}
  return "GNF";
}

/**
 * Sauvegarder un objet JSON dans le localStorage
 */
export function setJSON<T>(key: string, value: T): void {
  try {
    const json = JSON.stringify(value);
    setItem(key, json);
  } catch (error) {
    console.error(`Error stringifying JSON for localStorage: ${key}`, error);
  }
}
