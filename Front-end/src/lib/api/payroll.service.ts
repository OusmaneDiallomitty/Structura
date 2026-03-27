import { fetchWithTimeout } from '@/lib/fetch-with-timeout';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface SalaryConfig {
  amount: number;
  currency: string; // "GNF"
}

export interface SalaryPayment {
  id: string;
  staffId: string | null;
  staffName: string | null;
  amount: number;
  method: string;
  date: string;
  note: string | null;
  reference: string | null;
}

export interface PayrollStaffMember {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
  phone: string | null;
  salaryConfig: SalaryConfig | null;
  payment: SalaryPayment | null;
  isPaid: boolean;
}

export interface PayrollStats {
  totalStaff: number;
  paidCount: number;
  unpaidCount: number;
  unconfiguredCount: number;
  totalConfigured: number;
  totalPaid: number;
}

export interface PayrollSummary {
  month: string;
  staff: PayrollStaffMember[];
  stats: PayrollStats;
}

export interface PayrollHistory {
  data: SalaryPayment[];
  total: number;
}

export interface PaySalaryDto {
  staffId: string;
  month: string; // "YYYY-MM"
  amount: number;
  method?: string;
  note?: string;
  academicYear?: string;
}

// ── Fonctions API ──────────────────────────────────────────────────────────────

/**
 * Résumé du mois : tout le personnel + statut paiement.
 */
export async function getPayrollSummary(
  token: string,
  month: string,
): Promise<PayrollSummary> {
  const res = await fetchWithTimeout(
    `${API_BASE_URL}/payroll/summary?month=${encodeURIComponent(month)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message ?? 'Impossible de charger la paie');
  }
  return res.json();
}

/**
 * Historique paginé des salaires payés.
 */
export async function getPayrollHistory(
  token: string,
  filters: { staffId?: string; limit?: number; offset?: number } = {},
): Promise<PayrollHistory> {
  const params = new URLSearchParams();
  if (filters.staffId) params.set('staffId', filters.staffId);
  if (filters.limit)   params.set('limit', String(filters.limit));
  if (filters.offset)  params.set('offset', String(filters.offset));

  const res = await fetchWithTimeout(
    `${API_BASE_URL}/payroll/history?${params}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message ?? 'Impossible de charger l\'historique');
  }
  return res.json();
}

/**
 * Enregistre le paiement du salaire d'un membre.
 */
export async function paySalary(
  token: string,
  dto: PaySalaryDto,
): Promise<SalaryPayment> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/payroll/pay`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(dto),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message ?? 'Impossible d\'enregistrer le paiement');
  }
  return res.json();
}

/**
 * Configure le salaire mensuel d'un membre.
 */
export async function updateSalaryConfig(
  token: string,
  memberId: string,
  amount: number,
): Promise<{ id: string; salaryConfig: SalaryConfig }> {
  const res = await fetchWithTimeout(
    `${API_BASE_URL}/payroll/config/${memberId}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ amount, currency: 'GNF' }),
    },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message ?? 'Impossible de sauvegarder la configuration');
  }
  return res.json();
}

/**
 * Annule un paiement de salaire.
 */
export async function deletePayrollPayment(
  token: string,
  expenseId: string,
): Promise<void> {
  const res = await fetchWithTimeout(
    `${API_BASE_URL}/payroll/payment/${expenseId}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message ?? 'Impossible d\'annuler le paiement');
  }
}
