/**
 * Service API Expenses (Dépenses)
 *
 * Appels HTTP vers le backend NestJS pour la gestion des dépenses de l'école.
 * Pattern identique aux autres services API du projet.
 */

import { fetchWithTimeout } from '@/lib/fetch-with-timeout';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

// ─── Types ────────────────────────────────────────────────────────────────────

export const EXPENSE_CATEGORIES = [
  'PEDAGOGY',
  'INFRASTRUCTURE',
  'HR',
  'ACTIVITIES',
  'GENERAL',
  'OTHER',
] as const;

export type ExpenseCategory = typeof EXPENSE_CATEGORIES[number];

export const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  PEDAGOGY:       'Pédagogie',
  INFRASTRUCTURE: 'Infrastructure & Maintenance',
  HR:             'Ressources Humaines',
  ACTIVITIES:     'Activités & Sorties',
  GENERAL:        'Charges Générales',
  OTHER:          'Autre',
};

export const CATEGORY_COLORS: Record<ExpenseCategory, string> = {
  PEDAGOGY:       'bg-blue-100 text-blue-700 border-blue-200',
  INFRASTRUCTURE: 'bg-orange-100 text-orange-700 border-orange-200',
  HR:             'bg-violet-100 text-violet-700 border-violet-200',
  ACTIVITIES:     'bg-emerald-100 text-emerald-700 border-emerald-200',
  GENERAL:        'bg-amber-100 text-amber-700 border-amber-200',
  OTHER:          'bg-gray-100 text-gray-600 border-gray-200',
};

export const CATEGORY_ICONS: Record<ExpenseCategory, string> = {
  PEDAGOGY:       '📚',
  INFRASTRUCTURE: '🏗️',
  HR:             '👥',
  ACTIVITIES:     '🎒',
  GENERAL:        '⚡',
  OTHER:          '📋',
};

/** Description courte affichée sous le nom de chaque catégorie */
export const CATEGORY_DESCRIPTIONS: Record<ExpenseCategory, string> = {
  PEDAGOGY:       'Livres, cahiers, fournitures, matériel de classe',
  INFRASTRUCTURE: 'Réparations, électricité, eau, entretien du bâtiment',
  HR:             'Salaires, primes, formations du personnel',
  ACTIVITIES:     'Sorties scolaires, événements, cérémonies',
  GENERAL:        'Internet, téléphone, frais bancaires, divers',
  OTHER:          'Toute dépense ne rentrant pas dans les autres catégories',
};

export interface Expense {
  id:          string;
  tenantId:    string;
  amount:      number;
  currency:    string;
  category:    ExpenseCategory;
  description: string;
  method:      string;
  date:        string;
  academicYear?: string | null;
  reference?:  string | null;
  note?:       string | null;
  recordedBy?: string | null;
  createdAt:   string;
  updatedAt:   string;
}

export interface CreateExpenseDto {
  amount:      number;
  category:    ExpenseCategory;
  description: string;
  method?:     string;
  date:        string;
  academicYear?: string;
  reference?:  string;
  note?:       string;
}

export interface ExpenseStats {
  totalAmount: number;
  count:       number;
  byCategory:  Record<string, number>;
  byMonth:     Record<string, number>;
}

export interface ExpenseFilters {
  academicYear?: string;
  category?:     string;
  from?:         string;
  to?:           string;
}

// ─── API calls ────────────────────────────────────────────────────────────────

function authHeaders(token: string): HeadersInit {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

export async function getExpenses(
  token: string,
  filters: ExpenseFilters = {},
): Promise<Expense[]> {
  const params = new URLSearchParams();
  if (filters.academicYear) params.set('academicYear', filters.academicYear);
  if (filters.category)     params.set('category',     filters.category);
  if (filters.from)         params.set('from',          filters.from);
  if (filters.to)           params.set('to',            filters.to);

  const qs = params.toString() ? `?${params.toString()}` : '';
  const res = await fetchWithTimeout(`${API_BASE_URL}/expenses${qs}`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error((await res.json()).message ?? 'Erreur chargement dépenses');
  return res.json();
}

export async function getExpenseStats(
  token: string,
  academicYear?: string,
): Promise<ExpenseStats> {
  const qs = academicYear ? `?academicYear=${academicYear}` : '';
  const res = await fetchWithTimeout(`${API_BASE_URL}/expenses/stats${qs}`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error((await res.json()).message ?? 'Erreur stats dépenses');
  return res.json();
}

export async function createExpense(
  token: string,
  dto: CreateExpenseDto,
): Promise<Expense> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/expenses`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(dto),
  });
  if (!res.ok) throw new Error((await res.json()).message ?? 'Erreur création dépense');
  return res.json();
}

export async function updateExpense(
  token: string,
  id: string,
  dto: Partial<CreateExpenseDto>,
): Promise<Expense> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/expenses/${id}`, {
    method: 'PATCH',
    headers: authHeaders(token),
    body: JSON.stringify(dto),
  });
  if (!res.ok) throw new Error((await res.json()).message ?? 'Erreur modification dépense');
  return res.json();
}

export async function deleteExpense(token: string, id: string): Promise<void> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/expenses/${id}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error((await res.json()).message ?? 'Erreur suppression dépense');
}
