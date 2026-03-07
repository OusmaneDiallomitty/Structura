/**
 * DTO pour créer les classes par défaut du système éducatif guinéen
 * Mode production : avec ordre et description pour clarté
 */

export interface DefaultClassTemplate {
  name: string;
  level: string;
  order: number;
  description: string; // Ex: "1ère année" pour afficher "CP1 (1ère année)"
}

/**
 * Classes prédéfinies du système éducatif guinéen
 * Format d'affichage : "CP1 (1ère année)" pour clarté utilisateur
 */
export const DEFAULT_CLASSES: DefaultClassTemplate[] = [
  // MATERNELLE
  { name: 'Petite Section', level: 'Maternelle', order: 0, description: 'Maternelle' },
  { name: 'Moyenne Section', level: 'Maternelle', order: 0, description: 'Maternelle' },
  { name: 'Grande Section', level: 'Maternelle', order: 0, description: 'Maternelle' },

  // PRIMAIRE (1ère à 6ème année)
  { name: 'CP1', level: 'Primaire', order: 1, description: '1ère année' },
  { name: 'CP2', level: 'Primaire', order: 2, description: '2ème année' },
  { name: 'CE1', level: 'Primaire', order: 3, description: '3ème année' },
  { name: 'CE2', level: 'Primaire', order: 4, description: '4ème année' },
  { name: 'CM1', level: 'Primaire', order: 5, description: '5ème année' },
  { name: 'CM2', level: 'Primaire', order: 6, description: '6ème année' },

  // COLLÈGE (7ème à 10ème année)
  { name: '7ème année', level: 'Collège', order: 7, description: 'Collège' },
  { name: '8ème année', level: 'Collège', order: 8, description: 'Collège' },
  { name: '9ème année', level: 'Collège', order: 9, description: 'Collège' },
  { name: '10ème année', level: 'Collège', order: 10, description: 'Collège' },

  // LYCÉE (11ème à 12ème année)
  { name: '11ème année', level: 'Lycée', order: 11, description: 'Lycée' },
  { name: '12ème année', level: 'Lycée', order: 12, description: 'Lycée' },
];

export interface CreateDefaultClassesDto {
  academicYearId: string;
  selectedClasses?: string[]; // Liste des noms de classes à créer (si vide, créer toutes)
  sections?: { [className: string]: string[] }; // Ex: { "CP1": ["A", "B"], "CP2": ["A"] }
}
