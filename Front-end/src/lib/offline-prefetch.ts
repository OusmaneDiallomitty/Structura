/**
 * Pre-fetch offline
 *
 * Charge en arrière-plan les données critiques dans IndexedDB juste après
 * la connexion (ou à chaque ouverture d'app si le cooldown est écoulé).
 *
 * Objectif : toutes les pages (élèves, classes, paiements) sont disponibles
 * hors ligne sans que l'utilisateur ait besoin de les visiter d'abord.
 *
 * Principes de prod :
 *  - Fire-and-forget : ne bloque jamais la navigation
 *  - Cooldown 10 min  : évite le hammer API à chaque rechargement de page
 *  - Promise.allSettled : un store qui échoue n'en bloque pas d'autres
 *  - Silencieux        : aucun toast, aucune erreur remontée à l'UI
 *  - Force flag        : bypass cooldown au moment du login (session fraîche)
 */

import { getStudents } from '@/lib/api/students.service';
import { getClasses }  from '@/lib/api/classes.service';
import { getPayments } from '@/lib/api/payments.service';
import { offlineDB, STORES } from '@/lib/offline-db';

// ─── Cooldown ─────────────────────────────────────────────────────────────────

const PREFETCH_COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes
const LAST_PREFETCH_KEY    = 'structura_last_prefetch';

function isCooldownActive(): boolean {
  try {
    const last = localStorage.getItem(LAST_PREFETCH_KEY);
    if (!last) return false;
    return Date.now() - parseInt(last, 10) < PREFETCH_COOLDOWN_MS;
  } catch {
    return false;
  }
}

function markPrefetchDone(): void {
  try {
    localStorage.setItem(LAST_PREFETCH_KEY, String(Date.now()));
  } catch { /* quota exceeded — ignoré */ }
}

/** Réinitialise le cooldown. À appeler quand le tenant change (nouvelle session). */
export function resetPrefetchCooldown(): void {
  try {
    localStorage.removeItem(LAST_PREFETCH_KEY);
  } catch { /* quota exceeded — ignoré */ }
}

// ─── Pre-fetch ─────────────────────────────────────────────────────────────────

export interface PrefetchOptions {
  /**
   * Bypass le cooldown et force un re-fetch immédiat.
   * À utiliser uniquement au moment du login (session fraîche garantie).
   */
  force?: boolean;
}

/**
 * Charge toutes les données critiques dans IndexedDB en arrière-plan.
 *
 * Usage : prefetchOfflineData(token, { force: true }).catch(() => {})
 *
 * Ne jamais awaiter depuis un flux critique (login, navigation).
 */
export async function prefetchOfflineData(
  token: string,
  options: PrefetchOptions = {},
): Promise<void> {
  // SSR — IndexedDB n'existe pas côté serveur
  if (typeof window === 'undefined') return;

  // Hors ligne → inutile de tenter, les appels échoueraient tous
  if (!navigator.onLine) return;

  // Cooldown actif et pas de force → données encore fraîches
  if (!options.force && isCooldownActive()) return;

  // ── Fetch en parallèle ───────────────────────────────────────────────────
  const [studentsResult, classesResult, paymentsResult] = await Promise.allSettled([
    getStudents(token),
    getClasses(token),
    getPayments(token),
  ]);

  // ── Sauvegarder dans IndexedDB (upsert — safe à appeler plusieurs fois) ──
  const saves: Promise<void>[] = [];

  if (studentsResult.status === 'fulfilled' && studentsResult.value.length > 0) {
    saves.push(offlineDB.bulkAdd(STORES.STUDENTS, studentsResult.value));
  }
  if (classesResult.status === 'fulfilled' && classesResult.value.length > 0) {
    saves.push(offlineDB.bulkAdd(STORES.CLASSES, classesResult.value));
  }
  if (paymentsResult.status === 'fulfilled' && paymentsResult.value.length > 0) {
    saves.push(offlineDB.bulkAdd(STORES.PAYMENTS, paymentsResult.value));
  }

  // Ignorer les erreurs d'écriture IndexedDB (quota, corruption) — non bloquant
  await Promise.allSettled(saves);

  // Marquer le cooldown seulement si au moins un fetch a réussi
  const anySuccess = [studentsResult, classesResult, paymentsResult].some(
    (r) => r.status === 'fulfilled',
  );
  if (anySuccess) markPrefetchDone();

  // Log dev uniquement — silencieux en prod
  if (process.env.NODE_ENV !== 'production') {
    console.log(
      '[offline-prefetch]',
      studentsResult.status === 'fulfilled'
        ? `✅ ${(studentsResult.value as any[]).length} élèves`
        : `❌ élèves (${(studentsResult.reason as Error)?.message})`,
      '|',
      classesResult.status === 'fulfilled'
        ? `✅ ${(classesResult.value as any[]).length} classes`
        : `❌ classes (${(classesResult.reason as Error)?.message})`,
      '|',
      paymentsResult.status === 'fulfilled'
        ? `✅ ${(paymentsResult.value as any[]).length} paiements`
        : `❌ paiements (${(paymentsResult.reason as Error)?.message})`,
    );
  }
}
