/**
 * Service API Academic Years
 *
 * Appels HTTP vers le backend NestJS pour la gestion des années scolaires
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

// Types
export interface AcademicYear {
  id: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  startMonth: string | null;      // "Octobre" — mois de rentrée
  durationMonths: number | null;  // 9 — durée en mois (définit T1/T2/T3)
  isCurrent: boolean;
  isArchived: boolean;
  tenantId: string;
  createdAt: string;
  updatedAt: string;
  _count?: {
    classes: number;
    students: number;
  };
}

export interface CreateAcademicYearDto {
  name: string;
  startDate?: string;
  endDate?: string;
  startMonth?: string;      // "Octobre"
  durationMonths?: number;  // 9
  isCurrent?: boolean;
}

export enum StudentTransitionMode {
  PROMOTE = 'promote', // Passer en classe supérieure
  KEEP = 'keep', // Garder dans leurs classes actuelles
  NONE = 'none', // Ne pas transférer
}

export interface CreateNewYearTransitionDto {
  name: string;
  startDate?: string;
  endDate?: string;
  startMonth?: string;      // "Octobre"
  durationMonths?: number;  // 9
  studentTransitionMode?: StudentTransitionMode;
  studentDecisions?: StudentDecisionEntry[];
}

export interface TransitionSummary {
  newYear: AcademicYear;
  summary: {
    classesCreated: number;
    studentsTransferred: number;
    oldYear: string;
    newYear: string;
    transitionMode: StudentTransitionMode;
  };
}

/**
 * Récupérer toutes les années académiques
 */
export async function getAcademicYears(token: string): Promise<AcademicYear[]> {
  const response = await fetch(`${API_BASE_URL}/academic-years`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to fetch academic years' }));
    throw new Error(error.message || 'Failed to fetch academic years');
  }

  return await response.json();
}

/**
 * Récupérer l'année académique courante
 */
export async function getCurrentAcademicYear(token: string): Promise<AcademicYear | null> {
  const response = await fetch(`${API_BASE_URL}/academic-years/current`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  // 404 = aucune année définie pour ce tenant (cas normal premier accès)
  if (response.status === 404) return null;

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to fetch current academic year' }));
    throw new Error(error.message || 'Failed to fetch current academic year');
  }

  return await response.json();
}

/**
 * Récupérer une année académique par ID
 */
export async function getAcademicYearById(token: string, id: string): Promise<AcademicYear> {
  const response = await fetch(`${API_BASE_URL}/academic-years/${id}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to fetch academic year' }));
    throw new Error(error.message || 'Failed to fetch academic year');
  }

  return await response.json();
}

/**
 * Créer une nouvelle année académique simple
 */
export async function createAcademicYear(
  token: string,
  data: CreateAcademicYearDto
): Promise<AcademicYear> {
  // Nettoyer les chaînes vides (les remplacer par undefined)
  const cleanData = {
    name: data.name,
    startDate: data.startDate || undefined,
    endDate: data.endDate || undefined,
    startMonth: data.startMonth || undefined,
    durationMonths: data.durationMonths || undefined,
    isCurrent: data.isCurrent,
  };

  const response = await fetch(`${API_BASE_URL}/academic-years`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(cleanData),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to create academic year' }));
    throw new Error(error.message || 'Failed to create academic year');
  }

  return await response.json();
}

/**
 * Créer une nouvelle année avec transition automatique (WIZARD)
 * C'est la fonction principale utilisée par le wizard
 */
export async function createNewYearWithTransition(
  token: string,
  data: CreateNewYearTransitionDto
): Promise<TransitionSummary> {
  // Nettoyer les chaînes vides (les remplacer par undefined)
  const cleanData = {
    name: data.name,
    startDate: data.startDate || undefined,
    endDate: data.endDate || undefined,
    startMonth: data.startMonth || undefined,
    durationMonths: data.durationMonths || undefined,
    studentTransitionMode: data.studentTransitionMode,
    studentDecisions: data.studentDecisions?.length ? data.studentDecisions : undefined,
  };

  const response = await fetch(`${API_BASE_URL}/academic-years/transition`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(cleanData),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to create new year with transition' }));
    throw new Error(error.message || 'Failed to create new year with transition');
  }

  return await response.json();
}

/**
 * Définir une année comme année courante
 */
export async function setCurrentAcademicYear(token: string, id: string): Promise<AcademicYear> {
  const response = await fetch(`${API_BASE_URL}/academic-years/${id}/set-current`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to set current academic year' }));
    throw new Error(error.message || 'Failed to set current academic year');
  }

  return await response.json();
}

// ── Types promotion preview ───────────────────────────────────────────────

export type PromotionDecision = 'promote' | 'repeat' | 'graduate';

export interface PromotionPreviewStudent {
  id: string;
  firstName: string;
  lastName: string;
  matricule: string | null;
  finalAverage: number | null;
  scoreMax: number | null;
  passed: boolean;
  suggestedDecision: PromotionDecision;
}

export interface PromotionPreviewClass {
  classId: string;
  className: string;
  nextClassName: string | null;
  students: PromotionPreviewStudent[];
}

export interface StudentDecisionEntry {
  studentId: string;
  decision: PromotionDecision;
}

/**
 * Récupérer l'aperçu de promotion pour la transition d'année
 */
export async function getPromotionPreview(token: string): Promise<PromotionPreviewClass[]> {
  const response = await fetch(`${API_BASE_URL}/academic-years/promotion-preview`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to fetch promotion preview' }));
    throw new Error(error.message || 'Failed to fetch promotion preview');
  }

  return await response.json();
}

/**
 * Supprimer une année académique
 */
export async function deleteAcademicYear(token: string, id: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/academic-years/${id}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to delete academic year' }));
    throw new Error(error.message || 'Failed to delete academic year');
  }
}
