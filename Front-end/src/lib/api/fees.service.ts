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

export interface SchoolDays {
  monday: boolean;
  tuesday: boolean;
  wednesday: boolean;
  thursday: boolean;
  friday: boolean;
  saturday: boolean;
  // sunday est toujours false, non stocké
}

/** Valeurs par défaut : Lun→Ven actifs, Sam off */
export const DEFAULT_SCHOOL_DAYS: SchoolDays = {
  monday: true,
  tuesday: true,
  wednesday: true,
  thursday: true,
  friday: true,
  saturday: false,
};

/** Migration depuis l'ancien format { saturday, thursdayOff } */
export function migrateSchoolDays(raw: unknown): SchoolDays {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SCHOOL_DAYS };
  const r = raw as Record<string, unknown>;
  // Nouveau format détecté
  if ('monday' in r) return { ...DEFAULT_SCHOOL_DAYS, ...r } as SchoolDays;
  // Ancien format { saturday, thursdayOff }
  return {
    monday: true,
    tuesday: true,
    wednesday: true,
    thursday: !(r.thursdayOff ?? false),
    friday: true,
    saturday: !!(r.saturday ?? false),
  };
}

export interface FeesConfigResponse {
  feeConfig: FeeConfig | null;
  paymentFrequency: string;          // "monthly" | "quarterly" | "annual"
  schoolCalendar: SchoolCalendar | null;
  schoolType?: string;               // "private" | "public"
  feeItems?: FeeItem[] | null;
  schoolDays?: SchoolDays | null;
}

export interface UpdateFeesPayload {
  feeConfig?: FeeConfig;
  paymentFrequency?: string;
  schoolCalendar?: SchoolCalendar;
  schoolType?: string;
  feeItems?: FeeItem[];
  schoolDays?: SchoolDays;
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
