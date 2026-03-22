/**
 * Query key canonique pour les paiements, isolé par tenant.
 * Utilisé dans : payments/page
 */
export const PAYMENTS_QUERY_KEY = (tenantId?: string) => ["payments", tenantId] as const;
