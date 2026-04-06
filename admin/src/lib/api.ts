/**
 * Client HTTP Structura Admin
 * - Refresh automatique sur 401
 * - Déconnexion forcée si refresh échoue
 */

const API_BASE          = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';
const TOKEN_KEY         = 'structura_admin_token';
const REFRESH_TOKEN_KEY = 'structura_admin_refresh_token';

// ─── Tokens ─────────────────────────────────────────────────────────────────

export const getToken        = (): string | null => typeof window === 'undefined' ? null : localStorage.getItem(TOKEN_KEY);
export const setToken        = (t: string)       => localStorage.setItem(TOKEN_KEY, t);
export const clearToken      = ()                => { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem('structura_admin_user'); };
export const getRefreshToken = (): string | null => typeof window === 'undefined' ? null : localStorage.getItem(REFRESH_TOKEN_KEY);
export const setRefreshToken = (t: string)       => localStorage.setItem(REFRESH_TOKEN_KEY, t);
export const clearRefreshToken = ()              => localStorage.removeItem(REFRESH_TOKEN_KEY);

// ─── Refresh silencieux (anti-concurrence) ───────────────────────────────────

let isRefreshing      = false;
let refreshPromise: Promise<string | null> | null = null;

async function tryRefreshToken(): Promise<string | null> {
  if (isRefreshing && refreshPromise) return refreshPromise;
  const stored = getRefreshToken();
  if (!stored) return null;

  isRefreshing   = true;
  refreshPromise = fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: stored }),
  })
    .then(async (res) => {
      if (!res.ok) return null;
      const data = await res.json();
      setToken(data.token);
      if (data.refreshToken) setRefreshToken(data.refreshToken);
      return data.token as string;
    })
    .catch(() => null)
    .finally(() => { isRefreshing = false; refreshPromise = null; });

  return refreshPromise;
}

function forceLogout(): void {
  clearToken(); clearRefreshToken();
  localStorage.removeItem('structura_admin_user');
  document.cookie = 'structura_admin_session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
  window.location.href = '/login?reason=session_expired';
}

// ─── Classe erreur ───────────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); this.name = 'ApiError'; }
}

// ─── Client HTTP ─────────────────────────────────────────────────────────────

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const buildHeaders = (tkn: string | null): Record<string, string> => ({
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string>),
    ...(tkn ? { Authorization: `Bearer ${tkn}` } : {}),
  });

  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), 15_000);

  try {
    const res = await fetch(`${API_BASE}${path}`, { ...options, headers: buildHeaders(getToken()), signal: controller.signal });

    if (res.status === 401) {
      const newToken = await tryRefreshToken();
      if (!newToken) { forceLogout(); throw new ApiError('Session expirée', 401); }
      const retry = await fetch(`${API_BASE}${path}`, { ...options, headers: buildHeaders(newToken), signal: controller.signal });
      if (!retry.ok) { const b = await retry.json().catch(() => ({})); throw new ApiError(b.message ?? `Erreur ${retry.status}`, retry.status); }
      if (retry.status === 204) return {} as T;
      return retry.json() as Promise<T>;
    }

    if (!res.ok) { const b = await res.json().catch(() => ({})); throw new ApiError(b.message ?? `Erreur ${res.status}`, res.status); }
    if (res.status === 204) return {} as T;
    return res.json() as Promise<T>;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ─── Auth ────────────────────────────────────────────────────────────────────

export interface LoginResponse {
  token: string; refreshToken: string;
  user: { id: string; email: string; firstName: string; lastName: string; role: string; tenantId: string };
}
export const login = (email: string, password: string) =>
  request<LoginResponse>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });

export const changePassword = (currentPassword: string, newPassword: string) =>
  request<{ message: string }>('/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) });

// ─── Stats ───────────────────────────────────────────────────────────────────

export interface GlobalStats {
  tenants:  { total: number; active: number; inactive: number; trial: number; newThisMonth: number; newThisWeek: number; byPlan: { plan: string; count: number }[]; byModule: { module: string; count: number }[] };
  users:    { total: number };
  students: { total: number };
  revenue:  { total: number; thisMonth: number; currency: string };
  churn:    { thisMonth: number };
}
export const getGlobalStats = () => request<GlobalStats>('/admin/stats');

// ─── Alertes ─────────────────────────────────────────────────────────────────

export interface AlertItem {
  type: 'TRIAL_EXPIRING_SOON' | 'TRIAL_EXPIRING_WEEK' | 'TRIAL_EXPIRED'
      | 'PAST_DUE' | 'INACTIVE_7DAYS' | 'NO_SETUP' | 'LONG_FREE';
  label:        string;
  tenant:       Tenant & { healthScore: number };
  director:     { email: string; lastLoginAt: string | null } | null;
  hoursLeft:    number | null;
  daysExpired:  number | null;
  snoozedUntil: string | null;
}
export interface AlertsResponse {
  urgent:  AlertItem[];
  warning: AlertItem[];
  info:    AlertItem[];
  counts:  { urgent: number; warning: number; info: number; total: number };
}
export const getAlerts = () => request<AlertsResponse>('/admin/alerts');

// ─── Snooze alertes ──────────────────────────────────────────────────────────

export const snoozeAlert   = (tenantId: string, alertType: string, days: number) =>
  request<{ message: string; snoozedUntil: string }>('/admin/alerts/snooze', {
    method: 'POST', body: JSON.stringify({ tenantId, alertType, days }),
  });
export const unsnoozeAlert = (tenantId: string, alertType: string) =>
  request<{ message: string }>(`/admin/alerts/snooze/${tenantId}/${alertType}`, { method: 'DELETE' });

// ─── Notes internes par tenant ───────────────────────────────────────────────

export interface TenantNote {
  id: string; tenantId: string; content: string;
  authorEmail: string; createdAt: string; updatedAt: string;
}
export const getTenantNotes   = (id: string)                      => request<TenantNote[]>(`/admin/tenants/${id}/notes`);
export const addTenantNote    = (id: string, content: string)     => request<TenantNote>(`/admin/tenants/${id}/notes`, { method: 'POST', body: JSON.stringify({ content }) });
export const deleteTenantNote = (tenantId: string, noteId: string) => request<{ message: string }>(`/admin/tenants/${tenantId}/notes/${noteId}`, { method: 'DELETE' });

// ─── Activité récente par tenant ─────────────────────────────────────────────

export interface TenantActivity {
  id: string; action: string; actorEmail: string | null;
  details: Record<string, unknown> | null; createdAt: string;
}
export const getTenantRecentActivity = (id: string) => request<TenantActivity[]>(`/admin/tenants/${id}/recent-activity`);

// ─── Activité ────────────────────────────────────────────────────────────────

export interface ActivityLog {
  id: string; action: string; actorEmail: string | null;
  tenantId: string | null; tenantName: string | null;
  details: Record<string, unknown> | null; createdAt: string;
}
export interface ActivityResponse {
  data: ActivityLog[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}
export const getActivity = (params?: { page?: number; limit?: number; tenantId?: string }) => {
  const qs = new URLSearchParams();
  if (params?.page)     qs.set('page',     String(params.page));
  if (params?.limit)    qs.set('limit',    String(params.limit));
  if (params?.tenantId) qs.set('tenantId', params.tenantId);
  return request<ActivityResponse>(`/admin/activity?${qs}`);
};

// ─── Tenants ─────────────────────────────────────────────────────────────────

export interface Tenant {
  id: string; name: string; type: string; subdomain: string | null;
  city: string | null; country: string; email: string | null; phone: string | null;
  logo: string | null; isActive: boolean; subscriptionPlan: string; subscriptionStatus: string;
  trialEndsAt: string | null; currentPeriodEnd: string | null;
  currentStudentCount: number; currentClassCount: number; currentUserCount: number;
  moduleType: 'SCHOOL' | 'COMMERCE' | null;
  healthScore?: number; createdAt: string; updatedAt: string;
  _count?: { users: number; students: number; classes: number };
}
export interface TenantDetail extends Tenant {
  address: string | null; feeConfig: unknown; paymentFrequency: string | null;
  notifMonthlyReport: boolean; notifOverdueAlert: boolean;
  subscriptionHistory: unknown[];
  users: { id: string; email: string; firstName: string; lastName: string; role: string; isActive: boolean; emailVerified: boolean; lastLoginAt: string | null; createdAt: string }[];
  _count: { users: number; students: number; classes: number; payments: number; attendance: number };
}
export interface TenantsResponse {
  data: Tenant[]; meta: { total: number; page: number; limit: number; totalPages: number };
}

export const getTenants = (params?: { page?: number; limit?: number; search?: string; status?: 'active' | 'inactive'; plan?: string; country?: string; moduleType?: string }) => {
  const qs = new URLSearchParams();
  if (params?.page)       qs.set('page',       String(params.page));
  if (params?.limit)      qs.set('limit',       String(params.limit));
  if (params?.search)     qs.set('search',      params.search);
  if (params?.status)     qs.set('status',      params.status);
  if (params?.plan)       qs.set('plan',        params.plan);
  if (params?.country)    qs.set('country',     params.country);
  if (params?.moduleType) qs.set('moduleType',  params.moduleType);
  return request<TenantsResponse>(`/admin/tenants?${qs}`);
};
export const getTenant        = (id: string)         => request<TenantDetail>(`/admin/tenants/${id}`);
export const updateTenant     = (id: string, data: Record<string, unknown>) => request<Tenant>(`/admin/tenants/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
export const suspendTenant    = (id: string)         => request<{ message: string }>(`/admin/tenants/${id}/suspend`,     { method: 'POST' });
export const activateTenant   = (id: string)         => request<{ message: string }>(`/admin/tenants/${id}/activate`,    { method: 'POST' });
export const deleteTenant     = (id: string)         => request<{ message: string }>(`/admin/tenants/${id}`,             { method: 'DELETE' });
/** Réponse d'impersonation : code opaque au lieu du JWT (sécurité) */
export interface ImpersonateResponse { code: string; expiresIn: number; impersonating: { tenantId: string; tenantName: string; directorEmail: string } }
export const impersonateTenant = (id: string)        => request<ImpersonateResponse>(`/admin/tenants/${id}/impersonate`, { method: 'POST' });
export const extendTrial          = (id: string, days: number) => request<{ message: string; newTrialEnd: string }>(`/admin/tenants/${id}/extend-trial`, { method: 'POST', body: JSON.stringify({ days }) });
export const resendDirectorInvite = (id: string) => request<{ message: string }>(`/admin/tenants/${id}/resend-invite`, { method: 'POST' });
export const sendReminder         = (id: string, subject: string, message: string) => request<{ message: string }>(`/admin/tenants/${id}/send-reminder`, { method: 'POST', body: JSON.stringify({ subject, message }) });
export const createTenantAdmin = (data: {
  name: string; directorEmail: string; directorFirstName: string; directorLastName: string;
  type?: string; country?: string; city?: string; trialDays?: number; moduleType?: string;
}) => request<{ tenant: { id: string; name: string; trialEndsAt: string }; director: { email: string; firstName: string; lastName: string }; message: string }>('/admin/tenants', { method: 'POST', body: JSON.stringify(data) });

// ─── Alertes count (léger, pour la sidebar) ───────────────────────────────────

export interface AlertsCountResponse { urgent: number; warning: number; total: number }
export const getAlertsCount = () => request<AlertsCountResponse>('/admin/alerts/count');

// ─── Finance ──────────────────────────────────────────────────────────────────

export interface FinanceStats {
  monthly: { month: string; revenue: number }[];
  byPlan:  { plan: string; revenue: number }[];
  totals:  { allTime: number; thisMonth: number; currency: string };
  payingTenants: number;
}
export const getFinanceStats = () => request<FinanceStats>('/admin/finance');

// ─── Paiements Djomy (SubscriptionPayment) ────────────────────────────────────

export interface SubscriptionPaymentItem {
  id:                       string;
  tenantId:                 string;
  tenant:                   { id: string; name: string };
  djomyTransactionId:       string | null;
  merchantPaymentReference: string;
  amount:                   number;
  currency:                 string;
  status:                   'CREATED' | 'PENDING' | 'SUCCESS' | 'FAILED' | 'CANCELLED' | 'REDIRECTED';
  plan:                     'PRO' | 'PRO_PLUS';
  period:                   'monthly' | 'annual';
  paymentMethod:            string | null;
  payerIdentifier:          string | null;
  createdAt:                string;
  updatedAt:                string;
}

export interface SubscriptionPaymentsResponse {
  data: SubscriptionPaymentItem[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export const getSubscriptionPayments = (params?: {
  page?:     number;
  limit?:    number;
  status?:   string;
  plan?:     string;
  tenantId?: string;
}) => {
  const qs = new URLSearchParams();
  if (params?.page)     qs.set('page',     String(params.page));
  if (params?.limit)    qs.set('limit',    String(params.limit));
  if (params?.status)   qs.set('status',   params.status);
  if (params?.plan)     qs.set('plan',     params.plan);
  if (params?.tenantId) qs.set('tenantId', params.tenantId);
  return request<SubscriptionPaymentsResponse>(`/admin/payments?${qs}`);
};
