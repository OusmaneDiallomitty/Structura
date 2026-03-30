/**
 * Pre-fetch offline
 *
 * Charge en arrière-plan les données critiques dans IndexedDB juste après
 * la connexion (ou à chaque ouverture d'app si le cooldown est écoulé).
 *
 * Objectif : toutes les pages sont disponibles hors ligne sans que
 * l'utilisateur ait besoin de les visiter d'abord.
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
  /**
   * Type de module du tenant connecté.
   * 'COMMERCE' : prefetch produits, catégories, clients.
   * 'SCHOOL' (défaut) : prefetch élèves, classes, paiements.
   */
  moduleType?: string;
  /** tenantId — nécessaire pour les clés de cache commerce localStorage */
  tenantId?: string;
}

// ─── Clés cache localStorage pour le module commerce ────────────────────────
const CACHE_PRODUCTS   = (tid: string) => `structura_commerce_products_${tid}`;
const CACHE_CATEGORIES = (tid: string) => `structura_commerce_categories_${tid}`;
const CACHE_CUSTOMERS  = (tid: string) => `structura_commerce_customers_${tid}`;

function writeLS(key: string, data: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(data)); } catch { /* quota */ }
}

/**
 * Charge toutes les données critiques en arrière-plan.
 *
 * Usage : prefetchOfflineData(token, { force: true, moduleType, tenantId }).catch(() => {})
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

  const isCommerce = options.moduleType === 'COMMERCE';

  if (isCommerce) {
    await prefetchCommerce(token, options.tenantId ?? '');
  } else {
    await prefetchSchool(token);
  }
}

// ─── Prefetch module SCHOOL ─────────────────────────────────────────────────
async function prefetchSchool(token: string): Promise<void> {
  const [studentsResult, classesResult, paymentsResult] = await Promise.allSettled([
    getStudents(token),
    getClasses(token),
    getPayments(token),
  ]);

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

  await Promise.allSettled(saves);

  const anySuccess = [studentsResult, classesResult, paymentsResult].some(
    (r) => r.status === 'fulfilled',
  );
  if (anySuccess) markPrefetchDone();

  if (process.env.NODE_ENV !== 'production') {
    console.log(
      '[offline-prefetch:school]',
      studentsResult.status === 'fulfilled'
        ? `✅ ${(studentsResult.value as unknown[]).length} élèves`
        : `❌ élèves (${(studentsResult.reason as Error)?.message})`,
      '|',
      classesResult.status === 'fulfilled'
        ? `✅ ${(classesResult.value as unknown[]).length} classes`
        : `❌ classes (${(classesResult.reason as Error)?.message})`,
      '|',
      paymentsResult.status === 'fulfilled'
        ? `✅ ${(paymentsResult.value as unknown[]).length} paiements`
        : `❌ paiements (${(paymentsResult.reason as Error)?.message})`,
    );
  }
}

// ─── Prefetch module COMMERCE ────────────────────────────────────────────────
// Import dynamique pour ne pas alourdir le bundle des tenants SCHOOL
async function prefetchCommerce(token: string, tenantId: string): Promise<void> {
  if (!tenantId) return;

  // Import dynamique — évite de charger commerce.service.ts pour les tenants SCHOOL
  const { getProducts, getCategories, getCustomers } = await import(
    '@/lib/api/commerce.service'
  );

  const [productsResult, categoriesResult, customersResult] = await Promise.allSettled([
    getProducts(token, { limit: 500 }),
    getCategories(token),
    getCustomers(token),
  ]);

  // Sauvegarder dans localStorage (utilisé comme placeholderData par React Query)
  if (productsResult.status === 'fulfilled') {
    const items = productsResult.value?.data ?? productsResult.value;
    if (Array.isArray(items) && items.length > 0) {
      writeLS(CACHE_PRODUCTS(tenantId), items);
    }
  }
  if (categoriesResult.status === 'fulfilled' && Array.isArray(categoriesResult.value)) {
    if (categoriesResult.value.length > 0) {
      writeLS(CACHE_CATEGORIES(tenantId), categoriesResult.value);
    }
  }
  if (customersResult.status === 'fulfilled' && Array.isArray(customersResult.value)) {
    if (customersResult.value.length > 0) {
      writeLS(CACHE_CUSTOMERS(tenantId), customersResult.value);
    }
  }

  const anySuccess = [productsResult, categoriesResult, customersResult].some(
    (r) => r.status === 'fulfilled',
  );
  if (anySuccess) markPrefetchDone();

  if (process.env.NODE_ENV !== 'production') {
    const pCount = (() => {
      if (productsResult.status !== 'fulfilled') return '❌ produits';
      const d = productsResult.value?.data ?? productsResult.value;
      return `✅ ${Array.isArray(d) ? d.length : 0} produits`;
    })();
    console.log(
      '[offline-prefetch:commerce]',
      pCount, '|',
      categoriesResult.status === 'fulfilled'
        ? `✅ ${(categoriesResult.value as unknown[]).length} catégories`
        : `❌ catégories (${(categoriesResult.reason as Error)?.message})`,
      '|',
      customersResult.status === 'fulfilled'
        ? `✅ ${(customersResult.value as unknown[]).length} clients`
        : `❌ clients (${(customersResult.reason as Error)?.message})`,
    );
  }
}
