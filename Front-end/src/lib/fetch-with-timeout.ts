/**
 * Wrapper fetch avec timeout configurable.
 * Évite les requêtes bloquées indéfiniment si le backend ne répond pas.
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
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}
