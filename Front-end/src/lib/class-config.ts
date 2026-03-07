/**
 * Configuration des niveaux et classes pour le système éducatif guinéen
 *
 * Design Pattern: Configuration centralisée avec validation stricte
 * Principe: Single Source of Truth pour éviter les incohérences
 */

export const CLASS_LEVELS = {
  MATERNEL: "Maternelle",
  PRIMAIRE: "Primaire",
  SECONDAIRE: "Secondaire",
} as const;

export type ClassLevel = typeof CLASS_LEVELS[keyof typeof CLASS_LEVELS];

/**
 * Interface pour définir une classe avec ses variantes de nomenclature
 */
export interface ClassDefinition {
  id: string;
  displayName: string; // Nom principal affiché
  alternativeNames: string[]; // Variantes (ex: ["CP"] pour 1ère Année)
  level: ClassLevel;
  order: number; // Pour le tri
}

/**
 * Catalogue complet des classes par niveau
 * Suit les standards éducatifs guinéens avec équivalences françaises
 */
export const CLASS_CATALOG: Record<ClassLevel, ClassDefinition[]> = {
  [CLASS_LEVELS.MATERNEL]: [
    {
      id: "mat-ps",
      displayName: "Petite Section",
      alternativeNames: ["PS"],
      level: CLASS_LEVELS.MATERNEL,
      order: 1,
    },
    {
      id: "mat-ms",
      displayName: "Moyenne Section",
      alternativeNames: ["MS"],
      level: CLASS_LEVELS.MATERNEL,
      order: 2,
    },
    {
      id: "mat-gs",
      displayName: "Grande Section",
      alternativeNames: ["GS"],
      level: CLASS_LEVELS.MATERNEL,
      order: 3,
    },
  ],
  [CLASS_LEVELS.PRIMAIRE]: [
    {
      id: "prim-1",
      displayName: "CP1",
      alternativeNames: ["1ère année", "Cours Préparatoire 1"],
      level: CLASS_LEVELS.PRIMAIRE,
      order: 1,
    },
    {
      id: "prim-2",
      displayName: "CP2",
      alternativeNames: ["2ème année", "Cours Préparatoire 2"],
      level: CLASS_LEVELS.PRIMAIRE,
      order: 2,
    },
    {
      id: "prim-3",
      displayName: "CE1",
      alternativeNames: ["3ème année", "Cours Élémentaire 1"],
      level: CLASS_LEVELS.PRIMAIRE,
      order: 3,
    },
    {
      id: "prim-4",
      displayName: "CE2",
      alternativeNames: ["4ème année", "Cours Élémentaire 2"],
      level: CLASS_LEVELS.PRIMAIRE,
      order: 4,
    },
    {
      id: "prim-5",
      displayName: "CM1",
      alternativeNames: ["5ème année", "Cours Moyen 1"],
      level: CLASS_LEVELS.PRIMAIRE,
      order: 5,
    },
    {
      id: "prim-6",
      displayName: "CM2",
      alternativeNames: ["6ème année", "Cours Moyen 2"],
      level: CLASS_LEVELS.PRIMAIRE,
      order: 6,
    },
  ],
  [CLASS_LEVELS.SECONDAIRE]: [
    {
      id: "sec-7",
      displayName: "7ème Année",
      alternativeNames: ["6ème", "Sixième"],
      level: CLASS_LEVELS.SECONDAIRE,
      order: 1,
    },
    {
      id: "sec-8",
      displayName: "8ème Année",
      alternativeNames: ["5ème", "Cinquième"],
      level: CLASS_LEVELS.SECONDAIRE,
      order: 2,
    },
    {
      id: "sec-9",
      displayName: "9ème Année",
      alternativeNames: ["4ème", "Quatrième"],
      level: CLASS_LEVELS.SECONDAIRE,
      order: 3,
    },
    {
      id: "sec-10",
      displayName: "10ème Année",
      alternativeNames: ["3ème", "Troisième"],
      level: CLASS_LEVELS.SECONDAIRE,
      order: 4,
    },
    {
      id: "sec-11",
      displayName: "11ème Année",
      alternativeNames: ["2nde", "Seconde"],
      level: CLASS_LEVELS.SECONDAIRE,
      order: 5,
    },
    {
      id: "sec-12",
      displayName: "12ème Année",
      alternativeNames: ["1ère", "Première"],
      level: CLASS_LEVELS.SECONDAIRE,
      order: 6,
    },
    {
      id: "sec-term",
      displayName: "Terminale",
      alternativeNames: ["Term", "Tle"],
      level: CLASS_LEVELS.SECONDAIRE,
      order: 7,
    },
  ],
};

export const SECTIONS = ["A", "B", "C", "D", "E", "F"] as const;
export type Section = typeof SECTIONS[number];

/**
 * Options de nomenclature pour l'école
 * Permet à l'école de choisir son système de nommage préféré
 */
export const NOMENCLATURE_OPTIONS = {
  STANDARD: "standard", // 1ère Année, 2ème Année, etc.
  FRENCH: "french", // CP, CE1, CE2, CM1, CM2, etc.
} as const;

export type NomenclatureType = typeof NOMENCLATURE_OPTIONS[keyof typeof NOMENCLATURE_OPTIONS];

/**
 * Génère le nom d'affichage selon la nomenclature choisie
 */
export function getDisplayName(
  classDef: ClassDefinition,
  nomenclature: NomenclatureType = NOMENCLATURE_OPTIONS.STANDARD
): string {
  if (nomenclature === NOMENCLATURE_OPTIONS.FRENCH && classDef.alternativeNames.length > 0) {
    return classDef.alternativeNames[0];
  }
  return classDef.displayName;
}

/**
 * Génère le label complet pour l'affichage dans le Select
 * Ex: "1ère Année (CP)" ou "CP (1ère Année)" selon la nomenclature
 */
export function getSelectLabel(
  classDef: ClassDefinition,
  nomenclature: NomenclatureType = NOMENCLATURE_OPTIONS.STANDARD
): string {
  const primaryName = getDisplayName(classDef, nomenclature);
  const alternativeName =
    nomenclature === NOMENCLATURE_OPTIONS.STANDARD && classDef.alternativeNames.length > 0
      ? classDef.alternativeNames[0]
      : classDef.displayName;

  if (primaryName === alternativeName) {
    return primaryName;
  }

  return `${primaryName} (${alternativeName})`;
}

/**
 * Suggère automatiquement un nom de classe avec section
 *
 * Algorithme:
 * 1. Si la classe de base n'existe pas → retourne le nom de base
 * 2. Sinon, cherche la première section disponible (A, B, C...)
 * 3. Si toutes les sections sont prises → ajoute un numéro
 *
 * @param baseName Nom de base de la classe (ex: "1ère Année")
 * @param existingClasses Liste des noms de classes existantes
 * @returns Nom suggéré avec section si nécessaire
 */
export function suggestClassName(
  baseName: string,
  existingClasses: string[]
): { suggestedName: string; needsSection: boolean; availableSections: Section[] } {
  // Normaliser les noms pour la comparaison (insensible à la casse et espaces)
  const normalizedExisting = existingClasses.map((n) => n.trim().toLowerCase());

  // Chercher les sections disponibles
  const availableSections = SECTIONS.filter((section) => {
    const nameWithSection = `${baseName} ${section}`.toLowerCase();
    return !normalizedExisting.includes(nameWithSection);
  });

  // TOUJOURS utiliser des sections (A, B, C...) pour éviter la confusion
  // La première classe sera "1ère Année A", la deuxième "1ère Année B", etc.
  if (availableSections.length > 0) {
    return {
      suggestedName: `${baseName} ${availableSections[0]}`,
      needsSection: true,
      availableSections,
    };
  }

  // Si toutes les sections A-F sont prises, ajouter un numéro
  let counter = 1;
  let suggestedName = `${baseName} ${counter}`;
  while (normalizedExisting.includes(suggestedName.toLowerCase())) {
    counter++;
    suggestedName = `${baseName} ${counter}`;
  }

  return {
    suggestedName,
    needsSection: true,
    availableSections: [],
  };
}

/**
 * Valide qu'une classe appartient bien au niveau spécifié
 * Prévient les incohérences de données
 */
export function validateClassLevel(className: string, level: ClassLevel): boolean {
  const classesForLevel = CLASS_CATALOG[level];
  return classesForLevel.some(
    (classDef) =>
      className.startsWith(classDef.displayName) ||
      classDef.alternativeNames.some((alt) => className.startsWith(alt))
  );
}

/**
 * Récupère la définition d'une classe par son ID
 */
export function getClassDefinition(classId: string): ClassDefinition | undefined {
  for (const level of Object.values(CLASS_LEVELS)) {
    const classDef = CLASS_CATALOG[level].find((c) => c.id === classId);
    if (classDef) return classDef;
  }
  return undefined;
}
