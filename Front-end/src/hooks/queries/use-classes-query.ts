/**
 * Query key canonique pour les classes, isolé par tenant.
 * Utilisé dans : classes/page, attendance/page, grades/page, payments/page
 *
 * Toutes ces pages écrivent et lisent le cache via :
 *   queryClient.setQueryData(CLASSES_QUERY_KEY(tenantId), data)
 *   queryClient.getQueryData(CLASSES_QUERY_KEY(tenantId))
 */
export const CLASSES_QUERY_KEY = (tenantId?: string) => ["classes", tenantId] as const;
