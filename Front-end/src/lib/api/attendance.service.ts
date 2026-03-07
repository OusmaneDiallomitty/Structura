/**
 * Service API Attendance (Présences)
 *
 * Appels HTTP vers le backend NestJS pour la gestion des présences
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

// Types
export interface BackendAttendance {
  id: string;
  studentId: string;
  classId?: string;
  date: string;
  status: 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';
  notes?: string;
  markedBy?: string;
  createdAt?: string;
  updatedAt?: string;
  // Inclus par le backend via include: { student: true, class: true }
  student?: {
    id: string;
    firstName: string;
    lastName: string;
    matricule: string;
    parentName?: string;
    parentPhone?: string;
  };
  class?: {
    id: string;
    name: string;
    level?: string;
    section?: string | null;
  };
}

export interface CreateAttendanceDto {
  studentId: string;
  date: string;
  status: 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';
  classId?: string;
  notes?: string;
  markedBy?: string;
}

export interface UpdateAttendanceDto {
  status?: 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';
  notes?: string;
}

export interface AttendanceFilters {
  studentId?: string;
  classId?: string;
  date?: string;
  startDate?: string;
  endDate?: string;
  status?: string;
  limit?: number;
  skip?: number;
}

/** Corps du bulk create — correspond exactement au DTO backend */
export interface BulkCreateAttendanceDto {
  date: string;       // YYYY-MM-DD
  classId: string;
  markedBy: string;
  attendances: {
    studentId: string;
    status: 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';
    notes?: string;
  }[];
}

/** Réponse du bulk create */
export interface BulkCreateResult {
  count: number;
  message: string;
}

/**
 * Récupérer toutes les présences (avec filtres optionnels)
 */
export async function getAttendances(token: string, filters?: AttendanceFilters): Promise<BackendAttendance[]> {
  const queryParams = new URLSearchParams();

  if (filters?.studentId) queryParams.append('studentId', filters.studentId);
  if (filters?.classId) queryParams.append('classId', filters.classId);
  if (filters?.date) queryParams.append('date', filters.date);
  if (filters?.startDate) queryParams.append('startDate', filters.startDate);
  if (filters?.endDate) queryParams.append('endDate', filters.endDate);
  if (filters?.status) queryParams.append('status', filters.status);
  if (filters?.limit !== undefined) queryParams.append('limit', String(filters.limit));
  if (filters?.skip !== undefined) queryParams.append('skip', String(filters.skip));

  const url = `${API_BASE_URL}/attendance${queryParams.toString() ? `?${queryParams}` : ''}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to fetch attendances' }));
    throw new Error(error.message || 'Failed to fetch attendances');
  }

  return response.json() as Promise<BackendAttendance[]>;
}

/**
 * Récupérer les présences d'une date (endpoint optimisé)
 */
export async function getAttendanceByDate(token: string, date: string, classId?: string): Promise<BackendAttendance[]> {
  const url = classId
    ? `${API_BASE_URL}/attendance/date/${date}?classId=${classId}`
    : `${API_BASE_URL}/attendance/date/${date}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to fetch attendances' }));
    throw new Error(error.message || 'Failed to fetch attendances');
  }

  return response.json() as Promise<BackendAttendance[]>;
}

/**
 * Créer un enregistrement de présence
 */
export async function createAttendance(token: string, data: CreateAttendanceDto): Promise<BackendAttendance> {
  const response = await fetch(`${API_BASE_URL}/attendance`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to create attendance' }));
    throw new Error(error.message || 'Failed to create attendance');
  }

  return response.json() as Promise<BackendAttendance>;
}

/**
 * Mettre à jour une présence
 */
export async function updateAttendance(token: string, id: string, data: UpdateAttendanceDto): Promise<BackendAttendance> {
  const response = await fetch(`${API_BASE_URL}/attendance/${id}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to update attendance' }));
    throw new Error(error.message || 'Failed to update attendance');
  }

  return response.json() as Promise<BackendAttendance>;
}

/**
 * Enregistrer les présences de toute une classe en une seule requête (bulk)
 * Le backend ignore silencieusement les doublons (même élève, même date).
 * Pour les mises à jour, utiliser updateAttendance() individuellement.
 */
export async function bulkCreateAttendance(token: string, data: BulkCreateAttendanceDto): Promise<BulkCreateResult> {
  const response = await fetch(`${API_BASE_URL}/attendance/bulk`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to create bulk attendances' }));
    throw new Error(error.message || 'Failed to create bulk attendances');
  }

  return response.json() as Promise<BulkCreateResult>;
}
