/**
 * Templates d'écoles pré-configurés - Système éducatif guinéen
 * Permet un onboarding rapide avec des structures standard
 *
 * PRODUCTION-READY: Utilise les mêmes classes que le système de classes prédéfinies
 */

export enum SchoolType {
  PRIMAIRE = 'PRIMAIRE',
  COLLEGE = 'COLLEGE',
  LYCEE = 'LYCEE',
  COMPLET = 'COMPLET',
}

export interface ClassTemplate {
  name: string;
  level: string;
  section?: string;
  capacity: number;
}

export interface SchoolTemplate {
  type: SchoolType;
  displayName: string;
  description: string;
  icon: string;
  classes: ClassTemplate[];
}

/**
 * Templates disponibles - Système guinéen
 * Classes alignées avec le système de classes prédéfinies (create-default-classes.dto.ts)
 */
export const SCHOOL_TEMPLATES: Record<SchoolType, SchoolTemplate> = {
  [SchoolType.PRIMAIRE]: {
    type: SchoolType.PRIMAIRE,
    displayName: 'École Primaire',
    description: 'CP1 à CM2 (1ère à 6ème année)',
    icon: '📚',
    classes: [
      { name: 'CP1', level: 'Primaire', capacity: 30 },
      { name: 'CP2', level: 'Primaire', capacity: 30 },
      { name: 'CE1', level: 'Primaire', capacity: 30 },
      { name: 'CE2', level: 'Primaire', capacity: 30 },
      { name: 'CM1', level: 'Primaire', capacity: 30 },
      { name: 'CM2', level: 'Primaire', capacity: 30 },
    ],
  },

  [SchoolType.COLLEGE]: {
    type: SchoolType.COLLEGE,
    displayName: 'Collège',
    description: '7ème à 10ème année (4 classes)',
    icon: '🎓',
    classes: [
      { name: '7ème année', level: 'Collège', capacity: 35 },
      { name: '8ème année', level: 'Collège', capacity: 35 },
      { name: '9ème année', level: 'Collège', capacity: 35 },
      { name: '10ème année', level: 'Collège', capacity: 35 },
    ],
  },

  [SchoolType.LYCEE]: {
    type: SchoolType.LYCEE,
    displayName: 'Lycée',
    description: '11ème à 12ème année (2 classes)',
    icon: '📖',
    classes: [
      { name: '11ème année', level: 'Lycée', capacity: 35 },
      { name: '12ème année', level: 'Lycée', capacity: 35 },
    ],
  },

  [SchoolType.COMPLET]: {
    type: SchoolType.COMPLET,
    displayName: 'École Complète',
    description: 'Primaire + Collège + Lycée (12 classes)',
    icon: '🏛️',
    classes: [
      // PRIMAIRE (1ère à 6ème année)
      { name: 'CP1', level: 'Primaire', capacity: 30 },
      { name: 'CP2', level: 'Primaire', capacity: 30 },
      { name: 'CE1', level: 'Primaire', capacity: 30 },
      { name: 'CE2', level: 'Primaire', capacity: 30 },
      { name: 'CM1', level: 'Primaire', capacity: 30 },
      { name: 'CM2', level: 'Primaire', capacity: 30 },
      // COLLÈGE (7ème à 10ème année)
      { name: '7ème année', level: 'Collège', capacity: 35 },
      { name: '8ème année', level: 'Collège', capacity: 35 },
      { name: '9ème année', level: 'Collège', capacity: 35 },
      { name: '10ème année', level: 'Collège', capacity: 35 },
      // LYCÉE (11ème à 12ème année)
      { name: '11ème année', level: 'Lycée', capacity: 35 },
      { name: '12ème année', level: 'Lycée', capacity: 35 },
    ],
  },
};

/**
 * Obtenir un template par type
 */
export function getTemplateByType(type: SchoolType): SchoolTemplate {
  return SCHOOL_TEMPLATES[type];
}

/**
 * Obtenir tous les templates disponibles
 */
export function getAllTemplates(): SchoolTemplate[] {
  return Object.values(SCHOOL_TEMPLATES);
}
