/**
 * Service API Students
 *
 * Appels HTTP vers le backend NestJS pour la gestion des étudiants
 */

import { BackendStudent } from '@/types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export interface StudentStats {
  total: number;
  active: number;
  inactive: number;
  graduated: number;
  byClass?: Record<string, number>;
}

// Types
export interface CreateStudentDto {
  firstName: string;
  lastName: string;
  classId: string;
  dateOfBirth?: string;
  gender?: string;
  parentName?: string;
  parentPhone?: string;
  parentEmail?: string;
  parentProfession?: string;
  address?: string;
  photo?: string;
}

export interface UpdateStudentDto {
  firstName?: string;
  lastName?: string;
  classId?: string;
  dateOfBirth?: string;
  gender?: string;
  parentName?: string;
  parentPhone?: string;
  parentEmail?: string;
  parentProfession?: string;
  address?: string;
  status?: string;
  paymentStatus?: string;
}

export interface StudentFilters {
  classId?: string;
  status?: string;
  paymentStatus?: string;
  search?: string;
  academicYear?: string;
  limit?: number;  // Max résultats (défaut backend: 500, max: 5000 pour export)
  skip?: number;
}

/**
 * Récupérer tous les étudiants (avec filtres optionnels)
 */
export async function getStudents(token: string, filters?: StudentFilters): Promise<BackendStudent[]> {
  const queryParams = new URLSearchParams();

  if (filters?.classId)       queryParams.append('classId', filters.classId);
  if (filters?.status)        queryParams.append('status', filters.status);
  if (filters?.paymentStatus) queryParams.append('paymentStatus', filters.paymentStatus);
  if (filters?.search)        queryParams.append('search', filters.search);
  if (filters?.academicYear)  queryParams.append('academicYear', filters.academicYear);
  if (filters?.limit != null) queryParams.append('limit', String(filters.limit));
  if (filters?.skip  != null) queryParams.append('skip',  String(filters.skip));

  const url = `${API_BASE_URL}/students${queryParams.toString() ? `?${queryParams}` : ''}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to fetch students' }));
    throw new Error(error.message || 'Failed to fetch students');
  }

  const result = await response.json();
  // Le backend retourne { data, total, page, limit } — on extrait le tableau
  return Array.isArray(result) ? result : (result.data ?? []);
}

/**
 * Récupérer un étudiant par son ID
 */
export async function getStudentById(token: string, id: string): Promise<BackendStudent> {
  const response = await fetch(`${API_BASE_URL}/students/${id}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to fetch student' }));
    throw new Error(error.message || 'Failed to fetch student');
  }

  return response.json() as Promise<BackendStudent>;
}

/**
 * Créer un nouvel étudiant
 */
export async function createStudent(token: string, data: CreateStudentDto): Promise<BackendStudent> {
  const response = await fetch(`${API_BASE_URL}/students`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to create student' }));
    throw new Error(error.message || 'Failed to create student');
  }

  return response.json() as Promise<BackendStudent>;
}

/**
 * Créer plusieurs élèves en une seule requête (import CSV).
 * Le backend génère les matricules séquentiellement et insère en une transaction.
 */
export async function bulkCreateStudents(
  token: string,
  students: CreateStudentDto[],
): Promise<{ created: number; students: BackendStudent[] }> {
  const response = await fetch(`${API_BASE_URL}/students/bulk`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ students }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Erreur lors de l\'import' }));
    throw new Error(error.message || 'Erreur lors de l\'import');
  }

  return response.json();
}

/**
 * Mettre à jour un étudiant
 */
export async function updateStudent(token: string, id: string, data: UpdateStudentDto): Promise<BackendStudent> {
  const response = await fetch(`${API_BASE_URL}/students/${id}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to update student' }));
    throw new Error(error.message || 'Failed to update student');
  }

  return response.json() as Promise<BackendStudent>;
}

/**
 * Supprimer un étudiant
 */
export async function deleteStudent(token: string, id: string): Promise<{ message: string }> {
  const response = await fetch(`${API_BASE_URL}/students/${id}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to delete student' }));
    throw new Error(error.message || 'Failed to delete student');
  }

  return response.json() as Promise<{ message: string }>;
}

export interface PaginatedStudents {
  data: BackendStudent[];
  total: number;
  page: number;
  limit: number;
}

export interface PaginatedFilters {
  search?: string;
  classId?: string;
  academicYear?: string;
  limit?: number;
  skip?: number;
}

/**
 * Récupérer les étudiants avec pagination server-side.
 * Retourne { data, total, page, limit } — utiliser dans la page liste élèves.
 * Ne pas confondre avec getStudents() qui retourne un tableau simple.
 */
export async function getStudentsPaginated(
  token: string,
  filters?: PaginatedFilters,
): Promise<PaginatedStudents> {
  const params = new URLSearchParams();
  if (filters?.search)        params.append('search',       filters.search);
  if (filters?.classId)       params.append('classId',      filters.classId);
  if (filters?.academicYear)  params.append('academicYear', filters.academicYear);
  if (filters?.limit != null) params.append('limit',        String(filters.limit));
  if (filters?.skip  != null) params.append('skip',         String(filters.skip));

  const url = `${API_BASE_URL}/students${params.toString() ? `?${params}` : ''}`;
  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Erreur chargement élèves' }));
    throw new Error(error.message || 'Erreur chargement élèves');
  }

  const result = await response.json();
  // Le backend retourne toujours { data, total, page, limit }
  return {
    data:  Array.isArray(result) ? result : (result.data  ?? []),
    total: result.total ?? 0,
    page:  result.page  ?? 1,
    limit: result.limit ?? 50,
  };
}

/**
 * Récupérer les statistiques des étudiants
 */
export async function getStudentsStats(token: string): Promise<StudentStats> {
  const response = await fetch(`${API_BASE_URL}/students/stats`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to fetch students stats' }));
    throw new Error(error.message || 'Failed to fetch students stats');
  }

  return response.json() as Promise<StudentStats>;
}
