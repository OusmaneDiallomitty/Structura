// Constants pour Structura

export const APP_NAME = "Structura";
export const APP_DESCRIPTION = "Plateforme de Gestion Professionnelle";

// Routes
export const ROUTES = {
  HOME: "/",
  LOGIN: "/login",
  REGISTER: "/register",
  DASHBOARD: "/dashboard",
  STUDENTS: "/dashboard/students",
  CLASSES: "/dashboard/classes",
  ATTENDANCE: "/dashboard/attendance",
  PAYMENTS: "/dashboard/payments",
  GRADES: "/dashboard/grades",
  TEAM: "/dashboard/team",
  SETTINGS: "/dashboard/settings",
} as const;

// Rôles et leurs labels
export const ROLE_LABELS: Record<string, string> = {
  director: "Directeur",
  accountant: "Comptable",
  teacher: "Enseignant",
  supervisor: "Surveillant",
  secretary: "Secrétaire",
  admin: "Administrateur",
};

// Types d'organisations
// comingSoon : fonctionnalité non encore disponible — affiché comme désactivé dans le formulaire
export const ORGANIZATION_TYPES = [
  { value: "school",   label: "École",    description: "Maternelle, Primaire, Secondaire, Lycée", comingSoon: false },
  { value: "business", label: "Commerce", description: "Boutique, Magasin, Restaurant",           comingSoon: true  },
] as const;

// Niveaux scolaires par pays
export const SCHOOL_LEVELS = {
  GN: { // Guinée
    maternelle: ["Petite Section", "Moyenne Section", "Grande Section"],
    primaire: ["1ère année", "2ème année", "3ème année", "4ème année", "5ème année", "6ème année"],
    secondaire: ["7ème année", "8ème année", "9ème année", "10ème année"],
    lycee: ["11ème année", "12ème année", "Terminale"],
  },
  CM: { // Cameroun
    maternelle: ["Petite Section", "Moyenne Section", "Grande Section"],
    primaire: ["CP", "CE1", "CE2", "CM1", "CM2"],
    secondaire: ["6ème", "5ème", "4ème", "3ème"],
    lycee: ["2nde", "1ère", "Terminale"],
  },
  CI: { // Côte d'Ivoire
    maternelle: ["Petite Section", "Moyenne Section", "Grande Section"],
    primaire: ["CP1", "CP2", "CE1", "CE2", "CM1", "CM2"],
    secondaire: ["6ème", "5ème", "4ème", "3ème"],
    lycee: ["2nde", "1ère", "Terminale"],
  },
  SN: { // Sénégal — système français (CP/CE/CM + 6ème-Terminale)
    maternelle: ["Petite Section", "Moyenne Section", "Grande Section"],
    primaire: ["CI", "CP", "CE1", "CE2", "CM1", "CM2"],
    secondaire: ["6ème", "5ème", "4ème", "3ème"],
    lycee: ["2nde", "1ère", "Terminale"],
  },
  ML: { // Mali — système numéroté proche de la Guinée
    maternelle: ["Petite Section", "Moyenne Section", "Grande Section"],
    primaire: ["1ère année", "2ème année", "3ème année", "4ème année", "5ème année", "6ème année"],
    secondaire: ["7ème année", "8ème année", "9ème année", "10ème année"],
    lycee: ["11ème année", "12ème année", "Terminale"],
  },
  BF: { // Burkina Faso — système français (CP/CE/CM + 6ème-Terminale)
    maternelle: ["Petite Section", "Moyenne Section", "Grande Section"],
    primaire: ["CP1", "CP2", "CE1", "CE2", "CM1", "CM2"],
    secondaire: ["6ème", "5ème", "4ème", "3ème"],
    lycee: ["2nde", "1ère", "Terminale"],
  },
  BJ: { // Bénin — système français (CP/CE/CM + 6ème-Terminale)
    maternelle: ["Petite Section", "Moyenne Section", "Grande Section"],
    primaire: ["CP", "CE1", "CE2", "CM1", "CM2"],
    secondaire: ["6ème", "5ème", "4ème", "3ème"],
    lycee: ["2nde", "1ère", "Terminale"],
  },
  NE: { // Niger — système numéroté proche de la Guinée
    maternelle: ["Petite Section", "Moyenne Section", "Grande Section"],
    primaire: ["1ère année", "2ème année", "3ème année", "4ème année", "5ème année", "6ème année"],
    secondaire: ["7ème année", "8ème année", "9ème année", "10ème année"],
    lycee: ["11ème année", "12ème année", "Terminale"],
  },
  TG: { // Togo — système français (CP/CE/CM + 6ème-Terminale)
    maternelle: ["Petite Section", "Moyenne Section", "Grande Section"],
    primaire: ["CP1", "CP2", "CE1", "CE2", "CM1", "CM2"],
    secondaire: ["6ème", "5ème", "4ème", "3ème"],
    lycee: ["2nde", "1ère", "Terminale"],
  },
  MR: { // Mauritanie — système français adapté
    maternelle: ["Petite Section", "Moyenne Section", "Grande Section"],
    primaire: ["1ère année", "2ème année", "3ème année", "4ème année", "5ème année", "6ème année"],
    secondaire: ["7ème année", "8ème année", "9ème année", "10ème année"],
    lycee: ["11ème année", "12ème année", "Terminale"],
  },
  // Système par défaut (Guinée) pour les autres pays
  DEFAULT: {
    maternelle: ["Petite Section", "Moyenne Section", "Grande Section"],
    primaire: ["1ère année", "2ème année", "3ème année", "4ème année", "5ème année", "6ème année"],
    secondaire: ["7ème année", "8ème année", "9ème année", "10ème année"],
    lycee: ["11ème année", "12ème année", "Terminale"],
  },
} as const;

// Labels des niveaux scolaires
export const SCHOOL_LEVEL_LABELS = {
  maternelle: "Maternelle",
  primaire: "Primaire",
  secondaire: "Secondaire / Collège",
  lycee: "Lycée",
} as const;

// Pays cibles — Afrique de l'Ouest francophone avec système éducatif similaire
// Chaque entrée inclut : devise officielle, préfixe téléphonique, ville principale
export const COUNTRIES = [
  { value: "GN",    label: "Guinée",          currency: "GNF", phonePrefix: "+224", defaultCity: "Conakry"      },
  { value: "SN",    label: "Sénégal",          currency: "XOF", phonePrefix: "+221", defaultCity: "Dakar"        },
  { value: "CI",    label: "Côte d'Ivoire",    currency: "XOF", phonePrefix: "+225", defaultCity: "Abidjan"      },
  { value: "ML",    label: "Mali",             currency: "XOF", phonePrefix: "+223", defaultCity: "Bamako"       },
  { value: "BF",    label: "Burkina Faso",     currency: "XOF", phonePrefix: "+226", defaultCity: "Ouagadougou" },
  { value: "BJ",    label: "Bénin",            currency: "XOF", phonePrefix: "+229", defaultCity: "Cotonou"      },
  { value: "NE",    label: "Niger",            currency: "XOF", phonePrefix: "+227", defaultCity: "Niamey"       },
  { value: "TG",    label: "Togo",             currency: "XOF", phonePrefix: "+228", defaultCity: "Lomé"         },
  { value: "CM",    label: "Cameroun",         currency: "XAF", phonePrefix: "+237", defaultCity: "Yaoundé"      },
  { value: "MR",    label: "Mauritanie",       currency: "MRU", phonePrefix: "+222", defaultCity: "Nouakchott"  },
  { value: "OTHER", label: "Autre pays",       currency: "XOF", phonePrefix: "+",    defaultCity: ""             },
] as const;

export type CountryCode = typeof COUNTRIES[number]["value"];

/** Retrouve les données complètes d'un pays par son code ISO */
export function getCountryData(code: string) {
  return COUNTRIES.find((c) => c.value === code) ?? null;
}

// Messages d'erreur
export const ERROR_MESSAGES = {
  REQUIRED_FIELD: "Ce champ est requis",
  INVALID_EMAIL: "Email invalide",
  INVALID_PASSWORD: "Le mot de passe doit contenir au moins 8 caractères",
  LOGIN_FAILED: "Email ou mot de passe incorrect",
  NETWORK_ERROR: "Erreur de connexion. Veuillez réessayer.",
  UNAUTHORIZED: "Vous n'êtes pas autorisé à accéder à cette ressource",
} as const;

// Configuration
export const CONFIG = {
  API_URL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api",
  TOKEN_KEY: "structura_token",
  REFRESH_TOKEN_KEY: "structura_refresh_token",
  USER_KEY: "structura_user",
} as const;
