/**
 * Service API Payments (Paiements)
 *
 * Appels HTTP vers le backend NestJS pour la gestion des paiements
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

// Types
export interface BackendPayment {
  id: string;
  studentId: string;
  amount: number;
  method: 'CASH' | 'MOBILE_MONEY' | 'BANK_TRANSFER' | 'CHECK';
  status: 'PENDING' | 'COMPLETED' | 'FAILED' | 'REFUNDED';
  academicPeriod: string;
  term?: string;
  receiptNumber?: string;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}


export interface CreatePaymentDto {
  studentId: string;
  amount: number;
  method: 'CASH' | 'MOBILE_MONEY' | 'BANK_TRANSFER' | 'CHECK';
  currency?: string;
  status?: string;
  description?: string;
  academicYear?: string;
  term?: string;
  paidDate?: string;
  dueDate?: string;
}

export interface UpdatePaymentDto {
  amount?: number;
  method?: 'CASH' | 'MOBILE_MONEY' | 'BANK_TRANSFER' | 'CHECK';
  status?: 'PENDING' | 'COMPLETED' | 'FAILED' | 'REFUNDED';
  notes?: string;
}

export interface PaymentFilters {
  studentId?: string;
  status?: string;
  method?: string;
  startDate?: string;
  endDate?: string;
  academicYear?: string;
  limit?: number;  // Max résultats (défaut backend: 500, max: 5000 pour export)
  skip?: number;
}

/**
 * Récupérer tous les paiements (avec filtres optionnels)
 */
export async function getPayments(token: string, filters?: PaymentFilters): Promise<BackendPayment[]> {
  const queryParams = new URLSearchParams();

  if (filters?.studentId)     queryParams.append('studentId',     filters.studentId);
  if (filters?.status)        queryParams.append('status',        filters.status);
  if (filters?.method)        queryParams.append('method',        filters.method);
  if (filters?.startDate)     queryParams.append('startDate',     filters.startDate);
  if (filters?.endDate)       queryParams.append('endDate',       filters.endDate);
  if (filters?.academicYear) queryParams.append('academicYear', filters.academicYear);
  if (filters?.limit != null) queryParams.append('limit',         String(filters.limit));
  if (filters?.skip  != null) queryParams.append('skip',          String(filters.skip));

  const url = `${API_BASE_URL}/payments${queryParams.toString() ? `?${queryParams}` : ''}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to fetch payments' }));
    throw new Error(error.message || 'Failed to fetch payments');
  }

  return await response.json();
}

/**
 * Récupérer un paiement par son ID
 */
export async function getPaymentById(token: string, id: string) {
  const response = await fetch(`${API_BASE_URL}/payments/${id}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to fetch payment' }));
    throw new Error(error.message || 'Failed to fetch payment');
  }

  return await response.json();
}

/**
 * Créer un nouveau paiement
 */
export async function createPayment(token: string, data: CreatePaymentDto) {
  const response = await fetch(`${API_BASE_URL}/payments`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to create payment' }));
    throw new Error(error.message || 'Failed to create payment');
  }

  return await response.json();
}

/**
 * Supprimer un paiement
 */
export async function deletePayment(token: string, id: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/payments/${id}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to delete payment' }));
    throw new Error(error.message || 'Failed to delete payment');
  }
}

/**
 * Mettre à jour un paiement
 */
export async function updatePayment(token: string, id: string, data: UpdatePaymentDto) {
  const response = await fetch(`${API_BASE_URL}/payments/${id}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to update payment' }));
    throw new Error(error.message || 'Failed to update payment');
  }

  return await response.json();
}
