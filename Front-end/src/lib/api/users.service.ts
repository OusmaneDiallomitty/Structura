/**
 * Service API Users / Équipe
 * Appels HTTP vers le backend NestJS pour la gestion de l'équipe
 */

import { UserPermissions } from "@/types/permissions";
import { checkAndDispatchSessionInvalidated } from '@/lib/fetch-with-timeout';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

// ── Types backend ──────────────────────────────────────────────────────────────

export interface AssignedClass {
  id: string;
  name: string;
  level: string;
  section: string | null;
}

/** Affectation classe+matières — stockée en JSON dans le champ User.classAssignments */
export interface ClassSubjectAssignment {
  classId: string;
  subjects: string[];
}

export interface BackendTeamMember {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  role: string;           // UPPERCASE : DIRECTOR, TEACHER, ACCOUNTANT…
  permissions: UserPermissions | null;
  /** Détail des matières enseignées par classe (professeurs uniquement) */
  classAssignments?: ClassSubjectAssignment[] | null;
  /** Mois d'embauche — "YYYY-MM" — null = depuis le début de l'année scolaire */
  hireMonth?: string | null;
  isActive: boolean;
  emailVerified: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
  taughtClasses: AssignedClass[];
  /** Présent uniquement sur la réponse de création — indique si l'email d'invitation a été envoyé. */
  emailSent?: boolean;
}

export interface CreateTeamMemberPayload {
  firstName: string;
  lastName: string;
  email: string;
  role: string;           // UPPERCASE attendu par le backend
  phone?: string;
  hireMonth?: string;     // "YYYY-MM"
}

export interface UpdateTeamMemberPayload {
  firstName?: string;
  lastName?: string;
  phone?: string;
  role?: string;          // UPPERCASE
  isActive?: boolean;
  email?: string;
  hireMonth?: string | null; // "YYYY-MM" ou null pour effacer
}

export interface UpdateProfilePayload {
  firstName?: string;
  lastName?: string;
  phone?: string;
}

export type BackendUserProfile = Omit<BackendTeamMember, 'taughtClasses'> & {
  taughtClasses?: AssignedClass[];
};

// ── Helpers ───────────────────────────────────────────────────────────────────

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: `Erreur ${res.status}` }));
    const message = err.message || `Erreur ${res.status}`;
    if (res.status === 401) {
      checkAndDispatchSessionInvalidated(message);
    }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

// ── API ───────────────────────────────────────────────────────────────────────

/** GET /users/team — Accessible à tous les rôles authentifiés */
export async function getTeamMembers(token: string): Promise<BackendTeamMember[]> {
  const res = await fetch(`${API_BASE_URL}/users/team`, {
    headers: authHeaders(token),
  });
  return handleResponse<BackendTeamMember[]>(res);
}

/** POST /users/team — DIRECTOR uniquement */
export async function createTeamMember(
  token: string,
  data: CreateTeamMemberPayload,
): Promise<BackendTeamMember> {
  const res = await fetch(`${API_BASE_URL}/users/team`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(data),
  });
  return handleResponse<BackendTeamMember>(res);
}

/** PATCH /users/team/:id — DIRECTOR uniquement */
export async function updateTeamMember(
  token: string,
  id: string,
  data: UpdateTeamMemberPayload,
): Promise<BackendTeamMember> {
  const res = await fetch(`${API_BASE_URL}/users/team/${id}`, {
    method: 'PATCH',
    headers: authHeaders(token),
    body: JSON.stringify(data),
  });
  return handleResponse<BackendTeamMember>(res);
}

/** PATCH /users/team/:id/permissions — DIRECTOR uniquement */
export async function updateMemberPermissions(
  token: string,
  id: string,
  permissions: UserPermissions,
): Promise<BackendTeamMember> {
  const res = await fetch(`${API_BASE_URL}/users/team/${id}/permissions`, {
    method: 'PATCH',
    headers: authHeaders(token),
    body: JSON.stringify(permissions),
  });
  return handleResponse<BackendTeamMember>(res);
}

/** PATCH /users/team/:id/classes — DIRECTOR uniquement */
export async function assignTeacherClasses(
  token: string,
  id: string,
  classIds: string[],
  classAssignments?: ClassSubjectAssignment[],
): Promise<BackendTeamMember> {
  const res = await fetch(`${API_BASE_URL}/users/team/${id}/classes`, {
    method: 'PATCH',
    headers: authHeaders(token),
    body: JSON.stringify({ classIds, classAssignments }),
  });
  return handleResponse<BackendTeamMember>(res);
}

/** GET /users/me — Récupère son propre profil avec classAssignments à jour */
export async function getMyProfile(token: string): Promise<BackendUserProfile & { classAssignments?: ClassSubjectAssignment[] | null }> {
  const res = await fetch(`${API_BASE_URL}/users/me`, {
    headers: authHeaders(token),
  });
  return handleResponse<BackendUserProfile & { classAssignments?: ClassSubjectAssignment[] | null }>(res);
}

/** PATCH /users/me — Met à jour son propre profil (tous rôles) */
export async function updateProfile(
  token: string,
  data: UpdateProfilePayload,
): Promise<BackendUserProfile> {
  const res = await fetch(`${API_BASE_URL}/users/me`, {
    method: 'PATCH',
    headers: authHeaders(token),
    body: JSON.stringify(data),
  });
  return handleResponse<BackendUserProfile>(res);
}

/** POST /users/team/:id/resend-invite — Renvoie l'invitation à un membre non activé (DIRECTOR uniquement) */
export async function resendMemberInvite(
  token: string,
  id: string,
): Promise<{ message: string }> {
  const res = await fetch(`${API_BASE_URL}/users/team/${id}/resend-invite`, {
    method: 'POST',
    headers: authHeaders(token),
  });
  return handleResponse<{ message: string }>(res);
}

/** DELETE /users/team/:id — DIRECTOR uniquement */
export async function deleteTeamMember(
  token: string,
  id: string,
): Promise<{ message: string }> {
  const res = await fetch(`${API_BASE_URL}/users/team/${id}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  });
  return handleResponse<{ message: string }>(res);
}
