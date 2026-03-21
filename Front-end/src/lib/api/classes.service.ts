/**
 * Service API Classes
 *
 * Appels HTTP vers le backend NestJS pour la gestion des classes
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

// ─── Helpers partagés ────────────────────────────────────────────────────────

function buildHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Erreur réseau' }));
    throw new Error(err.message || `Erreur ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ─── Types matières ───────────────────────────────────────────────────────────

export interface ClassSubject {
  id: string;
  name: string;
  coefficient: number;
  order: number;
}

export interface SaveSubjectItem {
  name: string;
  coefficient: number;
  order: number;
}

export interface BackendClass {
  id: string;
  name: string;
  level: string;
  section?: string | null;
  academicYear?: string;
  capacity?: number;
  studentCount?: number;
  room?: string;
  teacherId?: string;
  teacherName?: string;
  gradeMode?: string; // "PRIMARY" | "SECONDARY"
  createdAt?: string;
  updatedAt?: string;
}

export interface TransferStudentsResult {
  transferred: number;
  message: string;
}

export interface ConvertClassesResult {
  success: boolean;
  created: BackendClass[];
  converted: BackendClass;
}

// Types
export interface CreateClassDto {
  name: string;
  level: string;
  section?: string; // Section séparée (A, B, C...)
  academicYear?: string;
  capacity?: number;
  room?: string;
  teacherId?: string;
  teacherName?: string;
}

export interface UpdateClassDto {
  name?: string;
  level?: string;
  section?: string | null; // Permet de modifier la section (null pour enlever)
  academicYear?: string;
  capacity?: number;
  room?: string;
  teacherId?: string;
  teacherName?: string;
}

/**
 * Récupérer toutes les classes
 * @param academicYearId — si fourni, retourne uniquement les classes de cette année
 */
export async function getClasses(token: string, academicYearId?: string): Promise<BackendClass[]> {
  const url = new URL(`${API_BASE_URL}/classes`);
  if (academicYearId) url.searchParams.set('academicYearId', academicYearId);

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to fetch classes' }));
    throw new Error(error.message || 'Failed to fetch classes');
  }

  return response.json() as Promise<BackendClass[]>;
}

/**
 * Récupérer une classe par son ID
 */
export async function getClassById(token: string, id: string): Promise<BackendClass> {
  const response = await fetch(`${API_BASE_URL}/classes/${id}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to fetch class' }));
    throw new Error(error.message || 'Failed to fetch class');
  }

  return response.json() as Promise<BackendClass>;
}

/**
 * Créer une nouvelle classe
 */
export async function createClass(token: string, data: CreateClassDto): Promise<BackendClass> {
  const response = await fetch(`${API_BASE_URL}/classes`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to create class' }));
    throw new Error(error.message || 'Failed to create class');
  }

  return response.json() as Promise<BackendClass>;
}

/**
 * Mettre à jour une classe
 */
export async function updateClass(token: string, id: string, data: UpdateClassDto): Promise<BackendClass> {
  const response = await fetch(`${API_BASE_URL}/classes/${id}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to update class' }));
    throw new Error(error.message || 'Failed to update class');
  }

  return response.json() as Promise<BackendClass>;
}

/**
 * Transférer les élèves d'une classe vers une autre
 */
export async function transferStudents(
  token: string,
  sourceClassId: string,
  targetClassId: string
): Promise<TransferStudentsResult> {
  const response = await fetch(`${API_BASE_URL}/classes/${sourceClassId}/transfer-students`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ targetClassId }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to transfer students' }));
    throw new Error(error.message || 'Failed to transfer students');
  }

  return response.json() as Promise<TransferStudentsResult>;
}

/**
 * Supprimer une classe (supprime aussi tous les élèves et leurs données)
 */
export async function deleteClass(token: string, id: string): Promise<{ message: string }> {
  const response = await fetch(`${API_BASE_URL}/classes/${id}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to delete class' }));
    throw new Error(error.message || 'Failed to delete class');
  }

  return response.json() as Promise<{ message: string }>;
}

/**
 * Conversion automatique : Renommer classe existante + créer nouvelles sections
 * Exemple : CP1 (sans section) → CP1 A + créer CP1 B
 */
export async function convertAndCreateClasses(
  token: string,
  data: {
    academicYearId: string;
    existingClassId: string;
    className: string;
    sectionsToCreate: string[];
  }
): Promise<ConvertClassesResult> {
  const response = await fetch(`${API_BASE_URL}/classes/convert-and-create`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to convert and create classes' }));
    throw new Error(error.message || 'Failed to convert and create classes');
  }

  return response.json() as Promise<ConvertClassesResult>;
}

// ─── Matières d'une classe ────────────────────────────────────────────────────

/**
 * GET /classes/:classId/subjects
 * Récupère les matières configurées pour une classe depuis la base de données.
 * Retourne [] si aucune matière n'a encore été configurée.
 */
export async function getClassSubjects(
  token: string,
  classId: string,
): Promise<ClassSubject[]> {
  const res = await fetch(`${API_BASE_URL}/classes/${classId}/subjects`, {
    headers: buildHeaders(token),
  });
  return handleResponse<ClassSubject[]>(res);
}

/**
 * POST /classes/:classId/subjects
 * Sauvegarde la liste complète des matières d'une classe (upsert).
 * Remplace les matières existantes par la nouvelle liste.
 */
export async function saveClassSubjects(
  token: string,
  classId: string,
  subjects: SaveSubjectItem[],
): Promise<ClassSubject[]> {
  const res = await fetch(`${API_BASE_URL}/classes/${classId}/subjects`, {
    method: 'POST',
    headers: buildHeaders(token),
    body: JSON.stringify({ subjects }),
  });
  return handleResponse<ClassSubject[]>(res);
}
