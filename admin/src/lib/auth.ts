/**
 * Helpers d'authentification côté client.
 * Stocke/lit le user courant en localStorage.
 */

import { clearToken, clearRefreshToken, getToken } from './api';

const USER_KEY = 'structura_admin_user';

export interface AdminUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  tenantId: string;
}

export function getStoredUser(): AdminUser | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AdminUser;
  } catch {
    return null;
  }
}

export function storeUser(user: AdminUser): void {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  // Poser un cookie de session pour le middleware Next.js
  // (pas httpOnly car le JS en a besoin pour le supprimer au logout)
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `structura_admin_session=1; path=/; SameSite=Strict${secure}`;
}

export function logout(): void {
  clearToken();
  clearRefreshToken();
  localStorage.removeItem(USER_KEY);
  // Supprimer le cookie de session
  document.cookie = 'structura_admin_session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
}

/** Vérifie que le token JWT n'est pas expiré (décode le payload base64 sans lib). */
export function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp * 1000 < Date.now();
  } catch {
    return true;
  }
}

/** Vérifie que le user est bien SUPER_ADMIN. */
export function isSuperAdmin(user: AdminUser | null): boolean {
  return user?.role?.toUpperCase() === 'SUPER_ADMIN';
}

/** Retourne le token si valide, null sinon. */
export function getValidToken(): string | null {
  const token = getToken();
  if (!token || isTokenExpired(token)) return null;
  return token;
}
