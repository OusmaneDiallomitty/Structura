/**
 * Plans, limites, prix et features — Structura SaaS
 *
 * Stratégie freemium :
 *  FREE     → Gestion quotidienne (élèves, présences, notes, paiements basiques) — offline complet
 *  PRO      → Outils professionnels (bulletins PDF, reçus PDF, CSV, multi-utilisateurs, historique)
 *  PRO_PLUS → Grand établissement (logo PDF, bulletins en masse, rapports avancés, équipe illimitée)
 *
 * Principes :
 *  - Élèves et classes : jamais limités (même en FREE)
 *  - Offline : toujours disponible (même en FREE) — critique pour la Guinée
 *  - Les features bloquées redirigent vers /dashboard/billing avec message clair
 */

export enum Plan {
  FREE     = 'FREE',
  PRO      = 'PRO',
  PRO_PLUS = 'PRO_PLUS',
}

export interface PlanFeatures {
  // ── Disponible sur FREE ──────────────────────────────────────────────────────
  payments:            boolean; // Suivi paiements (marquer payé/impayé)
  grades:              boolean; // Saisie + consultation des notes
  offlineWrite:        boolean; // Mode offline complet (lecture + écriture)
  multiUser:           boolean; // Membres équipe (limité par maxUsers)

  // ── Disponible à partir de PRO ───────────────────────────────────────────────
  bulletins:           boolean; // Bulletins PDF individuels + rapports
  exportCSV:           boolean; // Export CSV des données
  importCSV:           boolean; // Import CSV élèves en masse
  multipleYears:       boolean; // Gestion de plusieurs années scolaires

  // ── Exclusif PRO_PLUS ────────────────────────────────────────────────────────
  logoOnPdf:           boolean; // Logo école sur bulletins + reçus PDF
  bulkBulletins:       boolean; // ZIP bulletins toute une classe en 1 clic
  advancedReports:     boolean; // Rapports financiers avancés (MRR, taux paiement)
  unlimitedUsers:      boolean; // Équipe illimitée (plus de 5 membres)
  parentNotifications: boolean; // Notifications email automatiques aux parents
}

export interface PlanLimit {
  maxStudents: number;
  maxClasses:  number;
  maxUsers:    number;
  features:    PlanFeatures;
}

export const PLAN_LIMITS: Record<Plan, PlanLimit> = {

  // ─── FREE ────────────────────────────────────────────────────────────────────
  [Plan.FREE]: {
    maxStudents: Number.MAX_SAFE_INTEGER, // Illimité
    maxClasses:  Number.MAX_SAFE_INTEGER, // Illimité
    maxUsers:    2,                       // Directeur + 1 secrétaire/enseignant

    features: {
      // Fonctions quotidiennes disponibles offline
      payments:            true,  // Marquer payé/impayé (sans reçu PDF)
      grades:              true,  // Saisie + vue des notes (sans bulletins PDF)
      offlineWrite:        true,  // Toujours offline — critique pour la Guinée
      multiUser:           true,  // Limité à 2 utilisateurs (maxUsers)

      // Bloqué — upgrade vers PRO
      bulletins:           false,
      exportCSV:           false,
      importCSV:           false,
      multipleYears:       false,

      // Bloqué — upgrade vers PRO+
      logoOnPdf:           false,
      bulkBulletins:       false,
      advancedReports:     false,
      unlimitedUsers:      false,
      parentNotifications: false,
    },
  },

  // ─── PRO ─────────────────────────────────────────────────────────────────────
  [Plan.PRO]: {
    maxStudents: Number.MAX_SAFE_INTEGER,
    maxClasses:  Number.MAX_SAFE_INTEGER,
    maxUsers:    5, // Directeur + 4 membres

    features: {
      payments:            true,
      grades:              true,
      offlineWrite:        true,
      multiUser:           true,
      bulletins:           true,
      exportCSV:           true,
      importCSV:           true,
      multipleYears:       true,

      // Bloqué — upgrade vers PRO+
      logoOnPdf:           false,
      bulkBulletins:       false,
      advancedReports:     false,
      unlimitedUsers:      false,
      parentNotifications: false,
    },
  },

  // ─── PRO+ ────────────────────────────────────────────────────────────────────
  [Plan.PRO_PLUS]: {
    maxStudents: Number.MAX_SAFE_INTEGER,
    maxClasses:  Number.MAX_SAFE_INTEGER,
    maxUsers:    Number.MAX_SAFE_INTEGER,

    features: {
      payments:            true,
      grades:              true,
      offlineWrite:        true,
      multiUser:           true,
      bulletins:           true,
      exportCSV:           true,
      importCSV:           true,
      multipleYears:       true,
      logoOnPdf:           true,
      bulkBulletins:       true,
      advancedReports:     true,
      unlimitedUsers:      true,
      parentNotifications: true,
    },
  },
};

// ─── Prix en GNF ─────────────────────────────────────────────────────────────

export const PLAN_PRICES_GNF: Record<Exclude<Plan, Plan.FREE>, { monthly: number; annual: number }> = {
  [Plan.PRO]: {
    monthly: 50_000,   // 50 000 GNF/mois
    annual:  450_000,  // 450 000 GNF/an (2 mois offerts)
  },
  [Plan.PRO_PLUS]: {
    monthly: 100_000,  // 100 000 GNF/mois
    annual:  900_000,  // 900 000 GNF/an (3 mois offerts)
  },
};

// ─── Noms et descriptions ─────────────────────────────────────────────────────

export const PLAN_NAMES: Record<Plan, string> = {
  [Plan.FREE]:     'Gratuit',
  [Plan.PRO]:      'Pro',
  [Plan.PRO_PLUS]: 'Pro+',
};

export const PLAN_DESCRIPTIONS: Record<Plan, string> = {
  [Plan.FREE]:
    'Gestion quotidienne : élèves, présences, notes et paiements. Mode offline inclus.',
  [Plan.PRO]:
    'Tout le Gratuit + bulletins PDF, reçus PDF, import/export CSV, équipe (5 membres) et historique.',
  [Plan.PRO_PLUS]:
    'Tout le Pro + logo école sur PDF, bulletins en masse, rapports avancés et équipe illimitée.',
};

// ─── Utilitaires ─────────────────────────────────────────────────────────────

const PLAN_HIERARCHY: Plan[] = [Plan.FREE, Plan.PRO, Plan.PRO_PLUS];

/** Vérifie si un plan possède une feature */
export function hasFeature(plan: Plan, feature: keyof PlanFeatures): boolean {
  return PLAN_LIMITS[plan].features[feature];
}

/** Vérifie si un plan est supérieur ou égal à un autre */
export function isPlanAtLeast(plan: Plan, minimum: Plan): boolean {
  return PLAN_HIERARCHY.indexOf(plan) >= PLAN_HIERARCHY.indexOf(minimum);
}

/** Retourne le plan minimum requis pour une feature */
export function getMinimumPlanForFeature(feature: keyof PlanFeatures): Plan {
  for (const plan of PLAN_HIERARCHY) {
    if (PLAN_LIMITS[plan].features[feature]) return plan;
  }
  return Plan.PRO;
}
