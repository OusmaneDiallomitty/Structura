/**
 * Service API — Configuration des frais de scolarité (tenant)
 * Les frais sont stockés en base de données et partagés entre tous les utilisateurs du tenant.
 * Plus de localStorage comme source de vérité : la BDD est la référence unique.
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

// ── Types ────────────────────────────────────────────────────────────────────

export interface FeeConfig {
  mode: 'global' | 'by-level' | 'by-class';
  globalFee: number;
  byLevel: Record<string, number>;   // { "Primaire": 150000 }
  byClass: Record<string, number>;   // { "classId": 150000 }
}

export interface SchoolCalendar {
  startMonth: string;     // ex: "Octobre"
  durationMonths: number; // ex: 9
}

export interface FeeItem {
  id: string;
  name: string;
  amount: number;
  classIds: string[]; // empty = all classes
  academicYear: string;
  createdAt: string;
}

export interface FeesConfigResponse {
  feeConfig: FeeConfig | null;
  paymentFrequency: string;          // "monthly" | "quarterly" | "annual"
  schoolCalendar: SchoolCalendar | null;
  schoolType?: string;               // "private" | "public"
  feeItems?: FeeItem[] | null;
}

export interface UpdateFeesPayload {
  feeConfig?: FeeConfig;
  paymentFrequency?: string;
  schoolCalendar?: SchoolCalendar;
  schoolType?: string;
  feeItems?: FeeItem[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: `Erreur ${res.status}` }));
    throw new Error(err.message || `Erreur ${res.status}`);
  }
  return res.json() as Promise<T>;
}

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

// ── API ───────────────────────────────────────────────────────────────────────

/**
 * GET /auth/fees
 * Récupère la configuration des frais du tenant.
 * Accessible à tous les rôles authentifiés.
 */
export async function getFeesConfig(token: string): Promise<FeesConfigResponse> {
  const res = await fetch(`${API_BASE_URL}/auth/fees`, {
    headers: authHeaders(token),
  });
  return handleResponse<FeesConfigResponse>(res);
}

/**
 * PATCH /auth/fees
 * Met à jour la configuration des frais du tenant.
 * Réservé au DIRECTOR ou membre avec permissions.payments.configure = true.
 */
export async function updateFeesConfig(
  token: string,
  data: UpdateFeesPayload,
): Promise<FeesConfigResponse> {
  const res = await fetch(`${API_BASE_URL}/auth/fees`, {
    method: 'PATCH',
    headers: authHeaders(token),
    body: JSON.stringify(data),
  });
  return handleResponse<FeesConfigResponse>(res);
}
