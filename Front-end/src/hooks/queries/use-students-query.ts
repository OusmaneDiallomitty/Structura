/**
 * Query key canonique pour les élèves, isolé par tenant.
 * Utilisé dans : students/page, payments/page
 */
export const STUDENTS_QUERY_KEY = (tenantId?: string) => ["students", tenantId] as const;
