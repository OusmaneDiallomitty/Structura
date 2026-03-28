// Types pour le système de permissions

export type Permission = {
  view: boolean;
  create: boolean;
  edit: boolean;
  delete: boolean;
};

/** Permission étendue pour les paiements : inclut le droit de configurer les frais de scolarité */
export type PaymentsPermission = Permission & {
  /** Autorise la modification de la configuration des frais (montants, fréquence, calendrier scolaire) */
  configure: boolean;
};

export type UserPermissions = {
  payments: PaymentsPermission;
  expenses: Permission;
  students: Permission;
  classes: Permission;
  attendance: Permission;
  grades: Permission;
  team: Permission;
  reports: {
    view: boolean;
    export: boolean;
  };
  /** Délégation complète : ce membre a les mêmes droits qu'un directeur sur toute l'interface */
  isCoDirector?: boolean;
  /**
   * Accès à la comptabilité (paie du personnel + statistiques financières globales).
   * Réservé au fondateur par défaut. Le fondateur peut l'activer pour un directeur.
   * Non applicable pour role === "director" (fondateur) — il a toujours accès.
   */
  accounting?: {
    view: boolean;
  };
};

export type RoleType = "director" | "accountant" | "teacher" | "supervisor" | "secretary";

// Permissions par défaut pour chaque rôle
export const DEFAULT_PERMISSIONS: Record<RoleType, UserPermissions> = {
  director: {
    payments:   { view: true,  create: true,  edit: true,  delete: true,  configure: true },
    expenses:   { view: true,  create: true,  edit: true,  delete: true  },
    students:   { view: true,  create: true,  edit: true,  delete: true  },
    classes:    { view: true,  create: true,  edit: true,  delete: true  },
    attendance: { view: true,  create: true,  edit: true,  delete: true  },
    grades:     { view: true,  create: true,  edit: true,  delete: true  },
    team:       { view: true,  create: true,  edit: true,  delete: true  },
    reports:    { view: true,  export: true },
  },
  accountant: {
    payments:   { view: true,  create: true,  edit: true,  delete: false, configure: false },
    expenses:   { view: true,  create: true,  edit: true,  delete: false },
    students:   { view: true,  create: false, edit: false, delete: false },
    classes:    { view: true,  create: false, edit: false, delete: false },
    attendance: { view: true,  create: false, edit: false, delete: false },
    grades:     { view: false, create: false, edit: false, delete: false },
    team:       { view: false, create: false, edit: false, delete: false },
    reports:    { view: true,  export: true },
  },
  teacher: {
    payments:   { view: false, create: false, edit: false, delete: false, configure: false },
    expenses:   { view: false, create: false, edit: false, delete: false },
    students:   { view: true,  create: true,  edit: true,  delete: false },
    classes:    { view: true,  create: false, edit: false, delete: false },
    attendance: { view: true,  create: true,  edit: true,  delete: false },
    grades:     { view: true,  create: true,  edit: true,  delete: false },
    team:       { view: false, create: false, edit: false, delete: false },
    reports:    { view: false, export: false },
  },
  supervisor: {
    payments:   { view: false, create: false, edit: false, delete: false, configure: false },
    expenses:   { view: false, create: false, edit: false, delete: false },
    students:   { view: true,  create: false, edit: false, delete: false },
    classes:    { view: true,  create: false, edit: false, delete: false },
    attendance: { view: true,  create: true,  edit: true,  delete: false },
    grades:     { view: true,  create: false, edit: false, delete: false },
    team:       { view: false, create: false, edit: false, delete: false },
    reports:    { view: false, export: false },
  },
  secretary: {
    payments:   { view: true,  create: true,  edit: false, delete: false, configure: false },
    expenses:   { view: true,  create: false, edit: false, delete: false },
    students:   { view: true,  create: true,  edit: true,  delete: false },
    classes:    { view: true,  create: false, edit: false, delete: false },
    attendance: { view: true,  create: false, edit: false, delete: false },
    grades:     { view: false, create: false, edit: false, delete: false },
    team:       { view: false, create: false, edit: false, delete: false },
    reports:    { view: false, export: false },
  },
};

// Labels des rôles
export const ROLE_LABELS: Record<RoleType, string> = {
  director: "Fondateur",
  accountant: "Comptable",
  teacher: "Professeur",
  supervisor: "Surveillant",
  secretary: "Secrétaire",
};

// Couleurs des badges par rôle
export const ROLE_COLORS: Record<RoleType, string> = {
  director: "bg-violet-100 text-violet-700 border-violet-200",
  accountant: "bg-emerald-100 text-emerald-700 border-emerald-200",
  teacher: "bg-blue-100 text-blue-700 border-blue-200",
  supervisor: "bg-orange-100 text-orange-700 border-orange-200",
  secretary: "bg-pink-100 text-pink-700 border-pink-200",
};

// Descriptions des rôles
export const ROLE_DESCRIPTIONS: Record<RoleType, string> = {
  director: "Accès complet à toutes les fonctionnalités",
  accountant: "Gère les paiements et les rapports financiers",
  teacher: "Gère les présences et les notes de ses classes",
  supervisor: "Gère les présences et surveille les élèves",
  secretary: "Gère les élèves et enregistre les paiements",
};

/**
 * Retourne le label d'affichage d'un utilisateur selon son rôle et permissions.
 * - role === "director" → "Fondateur"
 * - isCoDirector === true → "Directeur"
 * - autres → ROLE_LABELS[role]
 */
export function getUserRoleLabel(user: { role?: string; permissions?: { isCoDirector?: boolean } | null } | null | undefined): string {
  if (!user) return "—";
  if (user.role === "director") return "Fondateur";
  if ((user.permissions as any)?.isCoDirector === true) return "Directeur";
  return ROLE_LABELS[user.role as RoleType] ?? user.role ?? "—";
}

/**
 * Retourne true si l'utilisateur a accès à la comptabilité (paie + stats financières).
 * - Le fondateur (role === "director") : toujours true
 * - Un directeur (isCoDirector) : seulement si permissions.accounting.view === true
 * - Autres rôles : false
 */
export function canViewAccounting(user: { role?: string; permissions?: { isCoDirector?: boolean; accounting?: { view: boolean } } | null } | null | undefined): boolean {
  if (!user) return false;
  if (user.role === "director") return true;
  if (user.permissions?.isCoDirector === true) {
    return user.permissions?.accounting?.view === true;
  }
  return false;
}

// Type pour un membre de l'équipe
export interface TeamMember {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  role: RoleType;
  permissions: UserPermissions;
  assignedClasses?: string[]; // Pour les professeurs
  isActive: boolean;
  createdAt: Date;
  createdBy: string;
}
