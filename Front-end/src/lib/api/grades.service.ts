/**
 * Service API Grades — Secondaire (Collège + Lycée)
 * Architecture : Évaluations (notes mensuelles) + Compositions (examens) + Bulletins
 */

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

function hdrs(token: string) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}
async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Erreur réseau' }));
    throw new Error(err.message || `Erreur ${res.status}`);
  }
  return res.json();
}

// ── Types ─────────────────────────────────────────────────────────────────

export interface Evaluation {
  id: string;
  studentId: string;
  classId: string;
  subject: string;
  term: string;
  month: string;
  score: number;
  academicYear: string;
  teacherName?: string;
  notes?: string;
  student?: { id: string; firstName: string; lastName: string; matricule: string };
}

export interface Composition {
  id: string;
  studentId: string;
  classId: string;
  subject: string;
  term: string;
  academicYear: string;
  compositionScore: number;
  teacherName?: string;
  notes?: string;
  student?: { id: string; firstName: string; lastName: string; matricule: string };
}

export interface SubjectCoefficient {
  id: string;
  classId: string;
  subject: string;
  coefficient: number;
  academicYear: string;
}

export interface StudentSubjectResult {
  subject: string;
  averageCourse: number | null; // null pour le primaire (pas d'évals mensuelles)
  compositionScore: number;
  averageSubject: number;
  coefficient: number;
  countsInAverage?: boolean;
  teacherName?: string;
}

export interface StudentReport {
  student: {
    id: string;
    firstName: string;
    lastName: string;
    matricule: string;
    enrollmentMonth?: string | null;
    class?: { name: string; section?: string | null };
  };
  term: string;
  academicYear: string;
  gradeMode: string;   // "PRIMARY" | "SECONDARY"
  scoreMax: number;    // 10 (primaire) | 20 (secondaire)
  subjects: StudentSubjectResult[];
  generalAverage: number;
  totalSubjects: number;
}

export interface AnnualReport {
  student: { id: string; firstName: string; lastName: string; matricule: string };
  academicYear: string;
  gradeMode: string;
  scoreMax: number;
  termAverages: { term: string; average: number }[];
  termsCount: number;
  annualAverage: number;
  decision: 'ADMIS' | 'REDOUBLE';
  passThreshold: number;
}

export interface ClassReportStudent {
  student: { id: string; firstName: string; lastName: string; matricule: string; gender?: string | null };
  generalAverage: number;
  totalSubjects: number;
  rank: number;
}

export interface ClassReport {
  class: { id: string; name: string; section?: string | null } | null;
  term: string;
  academicYear: string;
  students: ClassReportStudent[];
  classAverage: number;
  totalStudents: number;
  gradeMode?: string;
  scoreMax?: number;
  passThreshold?: number;
}

export interface TrimesterLock {
  id: string;
  classId: string;
  trimester: string;
  academicYear: string;
  lockedAt: string;
  lockedByName?: string;
}

// ── Évaluations ───────────────────────────────────────────────────────────

export async function getEvaluations(token: string, filters?: {
  classId?: string; subject?: string; term?: string;
  studentId?: string; academicYear?: string;
}): Promise<Evaluation[]> {
  const p = new URLSearchParams();
  if (filters?.classId)      p.set('classId', filters.classId);
  if (filters?.subject)      p.set('subject', filters.subject);
  if (filters?.term)         p.set('term', filters.term);
  if (filters?.studentId)    p.set('studentId', filters.studentId);
  if (filters?.academicYear) p.set('academicYear', filters.academicYear);
  return handle<Evaluation[]>(await fetch(`${API}/grades/evaluations?${p}`, { headers: hdrs(token) }));
}

export async function bulkSaveEvaluations(token: string, data: {
  classId: string; subject: string; term: string; month: string;
  academicYear?: string; teacherName?: string;
  evaluations: { studentId: string; score: number; notes?: string }[];
}) {
  return handle<{ count: number; message: string }>(
    await fetch(`${API}/grades/evaluations/bulk`, {
      method: 'POST', headers: hdrs(token), body: JSON.stringify(data),
    })
  );
}

// ── Compositions ──────────────────────────────────────────────────────────

export async function getCompositions(token: string, filters?: {
  classId?: string; subject?: string; term?: string;
  studentId?: string; academicYear?: string;
}): Promise<Composition[]> {
  const p = new URLSearchParams();
  if (filters?.classId)      p.set('classId', filters.classId);
  if (filters?.subject)      p.set('subject', filters.subject);
  if (filters?.term)         p.set('term', filters.term);
  if (filters?.studentId)    p.set('studentId', filters.studentId);
  if (filters?.academicYear) p.set('academicYear', filters.academicYear);
  return handle<Composition[]>(await fetch(`${API}/grades/compositions?${p}`, { headers: hdrs(token) }));
}

export async function bulkSaveCompositions(token: string, data: {
  classId: string; subject: string; term: string;
  academicYear?: string; teacherName?: string;
  compositions: { studentId: string; compositionScore: number; notes?: string }[];
}) {
  return handle<{ count: number; message: string }>(
    await fetch(`${API}/grades/compositions/bulk`, {
      method: 'POST', headers: hdrs(token), body: JSON.stringify(data),
    })
  );
}

// ── Coefficients ──────────────────────────────────────────────────────────

export async function getSubjectCoefficients(token: string, classId: string, academicYear?: string): Promise<SubjectCoefficient[]> {
  const p = new URLSearchParams();
  if (academicYear) p.set('academicYear', academicYear);
  return handle<SubjectCoefficient[]>(
    await fetch(`${API}/grades/subject-coefficients/${classId}?${p}`, { headers: hdrs(token) })
  );
}

export async function setSubjectCoefficients(token: string, data: {
  classId: string;
  coefficients: { subject: string; coefficient: number }[];
  academicYear?: string;
}) {
  return handle<{ count: number; message: string }>(
    await fetch(`${API}/grades/subject-coefficients`, {
      method: 'POST', headers: hdrs(token), body: JSON.stringify(data),
    })
  );
}

// ── Rapports (Bulletins) ──────────────────────────────────────────────────

export async function getStudentReport(token: string, studentId: string, term: string, academicYear?: string): Promise<StudentReport> {
  const p = new URLSearchParams({ term });
  if (academicYear) p.set('academicYear', academicYear);
  return handle<StudentReport>(
    await fetch(`${API}/grades/student/${studentId}/report?${p}`, { headers: hdrs(token) })
  );
}

export async function getClassReport(token: string, classId: string, term: string, academicYear?: string): Promise<ClassReport> {
  const p = new URLSearchParams({ term });
  if (academicYear) p.set('academicYear', academicYear);
  return handle<ClassReport>(
    await fetch(`${API}/grades/class/${classId}/report?${p}`, { headers: hdrs(token) })
  );
}

export async function getAnnualReport(token: string, studentId: string, academicYear?: string): Promise<AnnualReport> {
  const p = new URLSearchParams();
  if (academicYear) p.set('academicYear', academicYear);
  return handle<AnnualReport>(
    await fetch(`${API}/grades/student/${studentId}/annual-report?${p}`, { headers: hdrs(token) })
  );
}

// ── Verrous ───────────────────────────────────────────────────────────────

export async function getTrimesterLock(token: string, classId: string, trimester: string, academicYear: string): Promise<TrimesterLock | null> {
  const p = new URLSearchParams({ classId, trimester, academicYear });
  const res = await fetch(`${API}/grades/trimester-lock?${p}`, { headers: hdrs(token) });
  if (!res.ok || res.status === 204) return null;
  try {
    const text = await res.text();
    if (!text || text.trim() === '' || text === 'null') return null;
    const data = JSON.parse(text);
    // {} = pas de verrou (backend retourne {} quand null)
    if (!data || !data.id) return null;
    return data;
  } catch {
    return null;
  }
}

export async function lockTrimester(token: string, classId: string, trimester: string, academicYear: string): Promise<TrimesterLock> {
  return handle<TrimesterLock>(
    await fetch(`${API}/grades/trimester-lock`, {
      method: 'POST', headers: hdrs(token),
      body: JSON.stringify({ classId, trimester, academicYear }),
    })
  );
}

export async function unlockTrimester(token: string, classId: string, trimester: string, academicYear: string) {
  const p = new URLSearchParams({ classId, trimester, academicYear });
  return handle<{ message: string }>(
    await fetch(`${API}/grades/trimester-lock?${p}`, { method: 'DELETE', headers: hdrs(token) })
  );
}
