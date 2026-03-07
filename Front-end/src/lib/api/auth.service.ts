/**
 * Service d'authentification
 * 
 * Ce fichier contient toutes les fonctions d'appel API pour l'authentification.
 * Les fonctions sont actuellement mockées pour le développement front-end.
 * 
 * TODO: Remplacer les mocks par de vrais appels API quand le backend sera prêt
 */

import { User } from "@/types/index";

// Configuration API
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api"; // Backend séparé
const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK === "true" || false; // Utiliser le vrai backend par défaut

// Types
export interface RegisterPayload {
  fullName: string;
  email: string;
  phone: string;
  password: string;
  organizationName: string;
  organizationType: string;
  country: string;
  city: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface AuthResponse {
  user: User;
  token: string;
  refreshToken: string;
  expiresIn: number;
}

export interface ApiError {
  message: string;
  code?: string;
  field?: string;
}

/**
 * Inscription d'un nouvel utilisateur
 */
export async function registerUser(data: RegisterPayload): Promise<AuthResponse> {
  if (USE_MOCK) {
    return mockRegister(data);
  }

  try {
    const response = await fetch(`${API_BASE_URL}/auth/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      let errorMessage = "Une erreur est survenue lors de l'inscription. Veuillez réessayer.";
      try {
        const errorData = await response.json();
        errorMessage = errorData.message || errorData.error || errorMessage;
      } catch {
        // JSON invalide : garder le message générique, ne pas exposer le statusText
      }
      throw new Error(errorMessage);
    }

    return await response.json();
  } catch (error) {
    throw error;
  }
}

/**
 * Connexion d'un utilisateur
 */
export async function loginUser(data: LoginPayload): Promise<AuthResponse> {
  if (USE_MOCK) {
    return mockLogin(data);
  }

  try {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      let errorMessage = "Email ou mot de passe incorrect.";
      try {
        const errorData = await response.json();
        errorMessage = errorData.message || errorData.error || errorMessage;
      } catch {
        // JSON invalide : garder le message générique, ne pas exposer le statusText
      }
      throw new Error(errorMessage);
    }

    return await response.json();
  } catch (error) {
    throw error;
  }
}

/**
 * Rafraîchir le token d'authentification
 */
export async function refreshToken(refreshToken: string): Promise<AuthResponse> {
  if (USE_MOCK) {
    return mockRefreshToken(refreshToken);
  }

  try {
    const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ refreshToken }),
    });

    if (!response.ok) {
      throw new Error("Session expirée");
    }

    return await response.json();
  } catch (error) {
    throw error;
  }
}

// ─── Types école ─────────────────────────────────────────────────────────────

export interface SchoolInfo {
  id: string;
  name: string;
  type: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  country: string;
  logo: string | null;
  notifMonthlyReport: boolean;
  notifOverdueAlert: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateSchoolPayload {
  name?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  notifMonthlyReport?: boolean;
  notifOverdueAlert?: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function apiPost<T>(url: string, token: string, body: object): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Erreur ${res.status}`);
  }
  return res.json();
}

async function apiPatch<T>(url: string, token: string, body: object): Promise<T> {
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Erreur ${res.status}`);
  }
  return res.json();
}

async function apiGet<T>(url: string, token: string): Promise<T> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Erreur ${res.status}`);
  }
  return res.json();
}

// ─── Compte connecté ─────────────────────────────────────────────────────────

/**
 * Changer son mot de passe en étant connecté.
 * POST /auth/change-password
 */
export async function changePassword(
  token: string,
  currentPassword: string,
  newPassword: string,
): Promise<{ message: string }> {
  return apiPost(`${API_BASE_URL}/auth/change-password`, token, { currentPassword, newPassword });
}

// ─── Informations de l'école ─────────────────────────────────────────────────

/**
 * Lire les informations de l'école (tenant).
 * GET /auth/school — accessible à tous les rôles.
 */
export async function getSchoolInfo(token: string): Promise<SchoolInfo> {
  return apiGet(`${API_BASE_URL}/auth/school`, token);
}

/**
 * Mettre à jour les informations de l'école (tenant).
 * PATCH /auth/school — DIRECTOR uniquement.
 */
export async function updateSchoolInfo(
  token: string,
  data: UpdateSchoolPayload,
): Promise<SchoolInfo> {
  return apiPatch(`${API_BASE_URL}/auth/school`, token, data);
}

/**
 * Upload du logo de l'école.
 * POST /auth/logo (multipart/form-data, champ "logo")
 * Retourne { logo: string } — URL publique R2.
 */
export async function uploadSchoolLogo(
  token: string,
  file: File,
): Promise<{ logo: string }> {
  const form = new FormData();
  form.append('logo', file);

  const res = await fetch(`${API_BASE_URL}/auth/logo`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}` },
    body:    form,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Erreur ${res.status}`);
  }
  return res.json();
}

/**
 * Supprime le logo de l'école.
 * DELETE /auth/logo
 */
export async function deleteSchoolLogo(token: string): Promise<{ message: string }> {
  const res = await fetch(`${API_BASE_URL}/auth/logo`, {
    method:  'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Erreur ${res.status}`);
  }
  return res.json();
}

/**
 * Accepter une invitation et définir son mot de passe (premier accès d'un membre d'équipe).
 * Retourne les tokens JWT pour une connexion automatique.
 */
export async function acceptInvite(token: string, password: string): Promise<AuthResponse> {
  const response = await fetch(`${API_BASE_URL}/auth/accept-invite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, password }),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || "Lien d'invitation invalide ou expiré");
  }

  return response.json();
}

/**
 * Vérifier l'email de l'utilisateur
 */
export async function verifyEmail(token: string): Promise<{ success: boolean }> {
  if (USE_MOCK) {
    return mockVerifyEmail(token);
  }

  try {
    const response = await fetch(`${API_BASE_URL}/auth/verify-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ token }),
    });

    if (!response.ok) {
      throw new Error("Token de vérification invalide");
    }

    return await response.json();
  } catch (error) {
    throw error;
  }
}

// ============================================================================
// MOCKS - À supprimer quand le backend sera prêt
// ============================================================================

/**
 * Mock de l'inscription
 */
async function mockRegister(data: RegisterPayload): Promise<AuthResponse> {
  // Simuler un délai réseau
  await new Promise((resolve) => setTimeout(resolve, 1500));

  // Simuler une erreur si l'email existe déjà (pour tester)
  if (data.email === "test@existe.com") {
    throw new Error("Cet email est déjà utilisé");
  }

  // Extraire prénom et nom du fullName
  const nameParts = data.fullName.trim().split(" ");
  const firstName = nameParts[0] || "";
  const lastName = nameParts.slice(1).join(" ") || "";

  const mockUser: User = {
    id: `user-${Date.now()}`,
    email: data.email,
    firstName,
    lastName,
    role: "director", // Par défaut, le créateur est directeur
    tenantId: `org-${Date.now()}`,
    isActive: true,
    emailVerified: false, // Email non vérifié au départ
    onboardingCompleted: false, // Onboarding pas encore fait
    phone: data.phone,
    avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(data.fullName)}&background=6366f1&color=fff`,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  return {
    user: mockUser,
    token: `mock-jwt-token-${Date.now()}`,
    refreshToken: `mock-refresh-token-${Date.now()}`,
    expiresIn: 3600, // 1 heure
  };
}

/**
 * Mock de la connexion
 */
async function mockLogin(data: LoginPayload): Promise<AuthResponse> {
  // Simuler un délai réseau
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // Simuler une erreur si mauvais credentials (pour tester)
  if (data.email === "error@test.com") {
    throw new Error("Email ou mot de passe incorrect");
  }

  const mockUser: User = {
    id: "user-123",
    email: data.email,
    firstName: "Jean",
    lastName: "Touré",
    role: "director",
    tenantId: "org-123",
    isActive: true,
    emailVerified: true,
    onboardingCompleted: true, // Utilisateur existant a déjà fait l'onboarding
    phone: "+237670000000",
    avatar: "https://ui-avatars.com/api/?name=Jean+Touré&background=6366f1&color=fff",
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date(),
  };

  return {
    user: mockUser,
    token: `mock-jwt-token-${Date.now()}`,
    refreshToken: `mock-refresh-token-${Date.now()}`,
    expiresIn: 3600,
  };
}

/**
 * Mock du refresh token
 */
async function mockRefreshToken(_refreshToken: string): Promise<AuthResponse> {
  await new Promise((resolve) => setTimeout(resolve, 500));

  const mockUser: User = {
    id: "user-123",
    email: "jean@example.com",
    firstName: "Jean",
    lastName: "Touré",
    role: "director",
    tenantId: "org-123",
    isActive: true,
    emailVerified: true,
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date(),
  };

  return {
    user: mockUser,
    token: `mock-jwt-token-${Date.now()}`,
    refreshToken: `mock-refresh-token-${Date.now()}`,
    expiresIn: 3600,
  };
}

/**
 * Mock de la vérification email
 */
async function mockVerifyEmail(_token: string): Promise<{ success: boolean }> {
  await new Promise((resolve) => setTimeout(resolve, 1000));
  return { success: true };
}
