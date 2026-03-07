/**
 * Service API Grades (Notes)
 * Aligné sur le backend NestJS — GradesController
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export interface BackendGrade {
  id: string;
  subject: string;
  score: number;
  maxScore: number;
  coefficient: number;
  term: string;
  academicYear: string;
  studentId: string;
  classId: string;
  teacherId?: string;
  teacherName?: string;
  notes?: string;
  student?: {
    id: string;
    firstName: string;
    lastName: string;
    matricule: string;
  };
  class?: {
    id: string;
    name: string;
    section?: string | null;
    level?: string;
  };
  createdAt?: string;
  updatedAt?: string;
}

export interface GradeFilters {
  studentId?: string;
  classId?: string;
  subject?: string;
  term?: string;
  academicYear?: string;
}

export interface CreateGradeDto {
  subject: string;
  score: number;
  maxScore?: number;
  coefficient?: number;
  term: string;
  academicYear?: string;
  studentId: string;
  classId: string;
  teacherName?: string;
  notes?: string;
}

export interface BulkCreateGradeDto {
  subject: string;
  maxScore?: number;
  coefficient?: number;
  term: string;
  academicYear?: string;
  classId: string;
  teacherName?: string;
  grades: {
    studentId: string;
    score: number;
    notes?: string;
  }[];
}

export interface UpdateGradeDto {
  score?: number;
  maxScore?: number;
  coefficient?: number;
  teacherName?: string;
  notes?: string;
}

export interface BulkCreateResult {
  count: number;
  message: string;
}

export interface TrimesterLock {
  id: string;
  classId: string;
  tenantId: string;
  trimester: string;
  academicYear: string;
  lockedAt: string;
  lockedByName?: string;
}

export interface StudentGradeReport {
  student: {
    id: string;
    firstName: string;
    lastName: string;
    matricule: string;
    class?: { name: string; section?: string | null };
  };
  term: string;
  academicYear: string;
  /** Barème natif retourné par le backend (10 pour Primaire, 20 pour Collège/Lycée) */
  maxScore: number;
  grades: {
    subject: string;
    score: number;
    maxScore: number;
    coefficient: number;
    percentage: number;
    teacherName?: string;
    notes?: string;
  }[];
  average: number;
  totalSubjects: number;
}

export interface ClassGradeReport {
  class: { id: string; name: string; section?: string | null };
  term: string;
  academicYear: string;
  /** Barème natif retourné par le backend (10 pour Primaire, 20 pour Collège/Lycée) */
  maxScore: number;
  students: {
    student: { id: string; firstName: string; lastName: string; matricule: string };
    average: number;
    subjectCount: number;
  }[];
  classAverage: number;
  totalStudents: number;
}

function buildHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Erreur réseau' }));
    throw new Error(error.message || `Erreur ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function getGrades(
  token: string,
  filters?: GradeFilters
): Promise<BackendGrade[]> {
  const params = new URLSearchParams();
  if (filters?.studentId)    params.append('studentId', filters.studentId);
  if (filters?.classId)      params.append('classId', filters.classId);
  if (filters?.subject)      params.append('subject', filters.subject);
  if (filters?.term)         params.append('term', filters.term);
  if (filters?.academicYear) params.append('academicYear', filters.academicYear);

  const url = `${API_BASE_URL}/grades${params.toString() ? `?${params}` : ''}`;
  const res = await fetch(url, { headers: buildHeaders(token) });
  return handleResponse<BackendGrade[]>(res);
}

export async function getGradeById(token: string, id: string): Promise<BackendGrade> {
  const res = await fetch(`${API_BASE_URL}/grades/${id}`, {
    headers: buildHeaders(token),
  });
  return handleResponse<BackendGrade>(res);
}

export async function createGrade(token: string, data: CreateGradeDto): Promise<BackendGrade> {
  const res = await fetch(`${API_BASE_URL}/grades`, {
    method: 'POST',
    headers: buildHeaders(token),
    body: JSON.stringify(data),
  });
  return handleResponse<BackendGrade>(res);
}

export async function bulkCreateGrades(
  token: string,
  data: BulkCreateGradeDto
): Promise<BulkCreateResult> {
  const res = await fetch(`${API_BASE_URL}/grades/bulk`, {
    method: 'POST',
    headers: buildHeaders(token),
    body: JSON.stringify(data),
  });
  return handleResponse<BulkCreateResult>(res);
}

export async function updateGrade(
  token: string,
  id: string,
  data: UpdateGradeDto
): Promise<BackendGrade> {
  const res = await fetch(`${API_BASE_URL}/grades/${id}`, {
    method: 'PATCH',
    headers: buildHeaders(token),
    body: JSON.stringify(data),
  });
  return handleResponse<BackendGrade>(res);
}

export async function deleteGrade(token: string, id: string): Promise<{ message: string }> {
  const res = await fetch(`${API_BASE_URL}/grades/${id}`, {
    method: 'DELETE',
    headers: buildHeaders(token),
  });
  return handleResponse<{ message: string }>(res);
}

// ── Verrous de trimestre ────────────────────────────────────────────────────

export async function checkTrimesterLock(
  token: string,
  classId: string,
  trimester: string,
  academicYear: string,
): Promise<TrimesterLock | null> {
  const params = new URLSearchParams({ classId, trimester, academicYear });
  const res = await fetch(`${API_BASE_URL}/grades/trimester-lock?${params}`, {
    headers: buildHeaders(token),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || `Erreur ${res.status}`);
  return res.json() as Promise<TrimesterLock | null>;
}

export async function lockTrimester(
  token: string,
  classId: string,
  trimester: string,
  academicYear: string,
): Promise<TrimesterLock> {
  const res = await fetch(`${API_BASE_URL}/grades/trimester-lock`, {
    method: 'POST',
    headers: buildHeaders(token),
    body: JSON.stringify({ classId, trimester, academicYear }),
  });
  return handleResponse<TrimesterLock>(res);
}

export async function unlockTrimester(
  token: string,
  classId: string,
  trimester: string,
  academicYear: string,
): Promise<{ message: string }> {
  const params = new URLSearchParams({ classId, trimester, academicYear });
  const res = await fetch(`${API_BASE_URL}/grades/trimester-lock?${params}`, {
    method: 'DELETE',
    headers: buildHeaders(token),
  });
  return handleResponse<{ message: string }>(res);
}

export async function getStudentReport(
  token: string,
  studentId: string,
  term: string,
  academicYear?: string
): Promise<StudentGradeReport> {
  const params = new URLSearchParams({ term });
  if (academicYear) params.append('academicYear', academicYear);
  const res = await fetch(
    `${API_BASE_URL}/grades/student/${studentId}/report?${params}`,
    { headers: buildHeaders(token) }
  );
  return handleResponse<StudentGradeReport>(res);
}

export async function getClassReport(
  token: string,
  classId: string,
  term: string,
  academicYear?: string
): Promise<ClassGradeReport> {
  const params = new URLSearchParams({ term });
  if (academicYear) params.append('academicYear', academicYear);
  const res = await fetch(
    `${API_BASE_URL}/grades/class/${classId}/report?${params}`,
    { headers: buildHeaders(token) }
  );
  return handleResponse<ClassGradeReport>(res);
}
