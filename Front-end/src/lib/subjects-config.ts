/**
 * Configuration des matières par niveau scolaire — Système guinéen
 * Source : Programme officiel de la République de Guinée
 *
 * Utilisation :
 *  - getSubjectsForLevel(level) → liste des matières du niveau
 *  - mergeWithExisting(level, existingSubjects) → fusionner config + BDD
 */

export interface SubjectConfig {
  name: string;
  coefficient: number;
}

// ─── Matières par niveau ───────────────────────────────────────────────────

const SUBJECTS_MATERNELLE: SubjectConfig[] = [
  { name: "Langage",              coefficient: 2 },
  { name: "Éveil",                coefficient: 2 },
  { name: "Mathématiques",        coefficient: 2 },
  { name: "Activités manuelles",  coefficient: 1 },
  { name: "Dessin",               coefficient: 1 },
  { name: "Chant",                coefficient: 1 },
  { name: "EPS",                  coefficient: 1 },
];

const SUBJECTS_PRIMAIRE: SubjectConfig[] = [
  { name: "Calcul",                  coefficient: 4 },
  { name: "Français",               coefficient: 4 },
  { name: "Lecture",                 coefficient: 3 },
  { name: "Rédaction",              coefficient: 3 },
  { name: "Écriture",               coefficient: 2 },
  { name: "Histoire",               coefficient: 2 },
  { name: "Géographie",             coefficient: 2 },
  { name: "Sciences d'observation", coefficient: 2 },
  { name: "ECM",                    coefficient: 2 },
  { name: "Dessin",                 coefficient: 1 },
  { name: "EPS",                    coefficient: 1 },
  { name: "Chant",                  coefficient: 1 },
];

const SUBJECTS_COLLEGE: SubjectConfig[] = [
  { name: "Français",              coefficient: 4 },
  { name: "Mathématiques",         coefficient: 4 },
  { name: "Histoire",              coefficient: 2 },
  { name: "Géographie",            coefficient: 2 },
  { name: "Sciences Naturelles",   coefficient: 3 },
  { name: "Anglais",               coefficient: 3 },
  { name: "Physique",              coefficient: 2 },
  { name: "Chimie",                coefficient: 2 },
  { name: "ECM",                   coefficient: 2 },
  { name: "Arabe",                 coefficient: 2 },
  { name: "Dessin",                coefficient: 1 },
  { name: "EPS",                   coefficient: 1 },
];

const SUBJECTS_LYCEE: SubjectConfig[] = [
  { name: "Français",              coefficient: 4 },
  { name: "Mathématiques",         coefficient: 4 },
  { name: "Histoire",              coefficient: 2 },
  { name: "Géographie",            coefficient: 2 },
  { name: "Biologie",              coefficient: 3 },
  { name: "Anglais",               coefficient: 3 },
  { name: "Chimie",                coefficient: 3 },
  { name: "Physique",              coefficient: 3 },
  { name: "Philosophie",           coefficient: 3 },
  { name: "ECM",                   coefficient: 2 },
  { name: "Arabe",                 coefficient: 2 },
  { name: "EPS",                   coefficient: 1 },
];

// ─── Map niveau → matières ─────────────────────────────────────────────────

const SUBJECTS_MAP: Record<string, SubjectConfig[]> = {
  // Maternelle
  Maternelle:  SUBJECTS_MATERNELLE,
  maternelle:  SUBJECTS_MATERNELLE,
  Maternel:    SUBJECTS_MATERNELLE,
  maternel:    SUBJECTS_MATERNELLE,

  // Primaire
  Primaire:    SUBJECTS_PRIMAIRE,
  primaire:    SUBJECTS_PRIMAIRE,

  // Collège
  "Collège":   SUBJECTS_COLLEGE,
  "collège":   SUBJECTS_COLLEGE,
  College:     SUBJECTS_COLLEGE,
  college:     SUBJECTS_COLLEGE,

  // Lycée
  "Lycée":     SUBJECTS_LYCEE,
  "lycée":     SUBJECTS_LYCEE,
  Lycee:       SUBJECTS_LYCEE,
  lycee:       SUBJECTS_LYCEE,

  // Secondaire (alias Collège + Lycée → on retourne Collège par défaut)
  Secondaire:  SUBJECTS_COLLEGE,
  secondaire:  SUBJECTS_COLLEGE,
};

// ─── Fonctions utilitaires ─────────────────────────────────────────────────

/**
 * Retourne le barème maximum selon le niveau.
 * Maternelle / Primaire → /10
 * Collège / Lycée       → /20
 */
export function getMaxScoreForLevel(level: string): number {
  const lower = level.toLowerCase();
  if (lower.includes("maternelle") || lower.includes("primaire") || lower.includes("maternel")) {
    return 10;
  }
  return 20;
}

/**
 * Retourne les matières par défaut pour un niveau donné.
 * Si le niveau est inconnu, retourne les matières primaire.
 */
export function getSubjectsForLevel(level: string): SubjectConfig[] {
  return SUBJECTS_MAP[level] ?? SUBJECTS_PRIMAIRE;
}

/**
 * Retourne le coefficient par défaut d'une matière.
 * Cherche dans tous les niveaux, retourne 1 si non trouvé.
 */
export function getDefaultCoefficient(subjectName: string): number {
  const allSubjects = [
    ...SUBJECTS_MATERNELLE,
    ...SUBJECTS_PRIMAIRE,
    ...SUBJECTS_COLLEGE,
    ...SUBJECTS_LYCEE,
  ];
  return allSubjects.find(
    (s) => s.name.toLowerCase() === subjectName.toLowerCase()
  )?.coefficient ?? 1;
}

/**
 * Fusionne les matières de la config avec celles déjà existantes en BDD.
 * Garantit l'unicité (pas de doublons) et place les matières config en premier.
 *
 * @param level - Niveau de la classe (ex: "Primaire")
 * @param existingNames - Noms de matières déjà présents en BDD pour ce tenant
 */
export function mergeSubjects(
  level: string,
  existingNames: string[]
): SubjectConfig[] {
  const defaults = getSubjectsForLevel(level);
  const defaultNames = new Set(defaults.map((s) => s.name.toLowerCase()));

  // Matières en BDD qui ne sont PAS dans la config par défaut
  const customSubjects: SubjectConfig[] = existingNames
    .filter((name) => !defaultNames.has(name.toLowerCase()))
    .map((name) => ({
      name,
      coefficient: getDefaultCoefficient(name),
    }));

  return [...defaults, ...customSubjects];
}

// ─── Trimestres ────────────────────────────────────────────────────────────

export const TRIMESTERS = [
  { value: "Trimestre 1", label: "1er Trimestre" },
  { value: "Trimestre 2", label: "2ème Trimestre" },
  { value: "Trimestre 3", label: "3ème Trimestre" },
] as const;

export type TrimesterValue = (typeof TRIMESTERS)[number]["value"];
