/**
 * Helper pour les classes - Descriptions et formatage
 * Mode production : Centralise la logique d'affichage des classes
 * Gère les anciens et nouveaux formats pour robustesse
 */

/**
 * Mapping des noms de classes vers leurs descriptions
 */
const CLASS_DESCRIPTIONS: Record<string, string> = {
  // MATERNELLE
  'Petite Section': 'Maternelle',
  'Moyenne Section': 'Maternelle',
  'Grande Section': 'Maternelle',

  // PRIMAIRE
  'CP1': '1ère année',
  'CP2': '2ème année',
  'CE1': '3ème année',
  'CE2': '4ème année',
  'CM1': '5ème année',
  'CM2': '6ème année',

  // COLLÈGE
  '7ème année': 'Collège',
  '8ème année': 'Collège',
  '9ème année': 'Collège',
  '10ème année': 'Collège',

  // LYCÉE
  '11ème année': 'Lycée',
  '12ème année': 'Lycée',
  'terminale': 'Lycée',
};

/**
 * Extraire le nom de base d'une classe (sans section)
 * Gère les deux formats : "CP1" ou "CP1 A"
 */
function extractBaseName(name: string): string {
  const trimmed = name.trim();

  // Pattern : nom de classe suivi d'une section (A, B, C, etc.)
  const match = trimmed.match(/^(.+?)\s+([A-Z])$/);

  if (match) {
    return match[1]; // Retourne "CP1" depuis "CP1 A"
  }

  return trimmed; // Retourne tel quel si pas de section
}

/**
 * Formater le nom d'une classe avec sa description
 * PRODUCTION-READY : Gère les anciens et nouveaux formats
 *
 * Exemples :
 * - formatClassName("CP1", null) → "CP1 (1ère année)"
 * - formatClassName("CP1", "A") → "CP1 A (1ère année)"
 * - formatClassName("CP1 A", null) → "CP1 A (1ère année)"  [ancien format]
 * - formatClassName("CM1 A", null) → "CM1 A (5ème année)"  [ancien format]
 */
export function formatClassName(name: string, section?: string | null): string {
  if (!name) return section?.trim() || "Classe";
  const trimmedName = name.trim();

  // Extraire le nom de base (gère "CP1" et "CP1 A")
  const baseName = extractBaseName(trimmedName);

  // Récupérer la description — recherche insensible à la casse
  // Ex: "7ème Année" (capital A via CLASS_CATALOG) trouve quand même "7ème année" → "Collège"
  const description =
    CLASS_DESCRIPTIONS[baseName] ||
    Object.entries(CLASS_DESCRIPTIONS).find(
      ([key]) => key.toLowerCase() === baseName.toLowerCase()
    )?.[1];

  // Si pas de description trouvée, retourner le nom tel quel
  if (!description) {
    return section ? `${trimmedName} ${section}` : trimmedName;
  }

  // Construire le nom complet
  let fullName = baseName;
  let fullDescription = description;

  // Ajouter la section si elle existe
  if (section) {
    fullName = `${baseName} ${section}`;
    // Pour les séries lycée (multi-mots) on n'ajoute pas la série à la description
    if (section.length === 1) {
      fullDescription = `${description} ${section}`;
    }
  } else if (trimmedName !== baseName) {
    // Cas ancien format : "CP1 A" sans section séparée
    fullName = trimmedName;
    // Extraire la section de l'ancien format
    const sectionMatch = trimmedName.match(/\s+([A-Z])$/);
    if (sectionMatch) {
      fullDescription = `${description} ${sectionMatch[1]}`;
    }
  }

  // Retourner avec description complète
  return `${fullName} (${fullDescription})`;
}

/**
 * Obtenir la description d'une classe
 * Ex: "CP1" → "1ère année"
 * Ex: "CM1 A" → "5ème année"
 */
export function getClassDescription(name: string): string | undefined {
  const baseName = extractBaseName(name);
  return CLASS_DESCRIPTIONS[baseName];
}
