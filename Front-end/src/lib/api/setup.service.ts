/**
 * Service API pour l'onboarding et les templates d'école
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export enum SchoolType {
  PRIMAIRE = 'PRIMAIRE',
  COLLEGE = 'COLLEGE',
  LYCEE = 'LYCEE',
  COMPLET = 'COMPLET',
}

export interface SchoolTemplate {
  type: SchoolType;
  displayName: string;
  description: string;
  icon: string;
  classes: Array<{
    name: string;
    level: string;
    section?: string;
    capacity: number;
  }>;
}

/**
 * Obtenir tous les templates d'école disponibles
 */
export async function getSchoolTemplates(token: string): Promise<SchoolTemplate[]> {
  const response = await fetch(`${API_BASE_URL}/setup/templates`, {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to fetch templates');
  }

  return response.json();
}

/**
 * Appliquer un template d'école (créer les classes automatiquement)
 */
export async function applySchoolTemplate(
  token: string,
  templateType: SchoolType
): Promise<{ template: string; classesCreated: number; classes: any[] }> {
  const response = await fetch(`${API_BASE_URL}/setup/apply-template`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ templateType }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to apply template');
  }

  return response.json();
}

/**
 * Marquer l'onboarding comme complété
 */
export async function completeOnboarding(token: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/setup/complete-onboarding`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to complete onboarding');
  }
}

/**
 * Vérifier si l'onboarding est complété.
 * Lève une erreur sur 429 (à retenter) et sur les autres erreurs serveur.
 * Ne retourne jamais false silencieusement — le caller décide du fallback.
 */
export async function getOnboardingStatus(token: string): Promise<boolean> {
  const response = await fetch(`${API_BASE_URL}/setup/onboarding-status`, {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  if (response.status === 429) {
    throw new Error('THROTTLED');
  }

  if (!response.ok) {
    throw new Error(`HTTP_${response.status}`);
  }

  const data = await response.json();
  return data.onboardingCompleted;
}
