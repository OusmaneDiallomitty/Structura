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
  students: Permission;
  classes: Permission;
  attendance: Permission;
  grades: Permission;
  team: Permission;
  reports: {
    view: boolean;
    export: boolean;
  };
};

export type RoleType = "director" | "accountant" | "teacher" | "supervisor" | "secretary";

// Permissions par défaut pour chaque rôle
export const DEFAULT_PERMISSIONS: Record<RoleType, UserPermissions> = {
  director: {
    payments: { view: true, create: true, edit: true, delete: true, configure: true },
    students: { view: true, create: true, edit: true, delete: true },
    classes: { view: true, create: true, edit: true, delete: true },
    attendance: { view: true, create: true, edit: true, delete: true },
    grades: { view: true, create: true, edit: true, delete: true },
    team: { view: true, create: true, edit: true, delete: true },
    reports: { view: true, export: true },
  },
  accountant: {
    payments: { view: true, create: true, edit: true, delete: false, configure: false },
    students: { view: false, create: false, edit: false, delete: false },
    classes: { view: false, create: false, edit: false, delete: false },
    attendance: { view: false, create: false, edit: false, delete: false },
    grades: { view: false, create: false, edit: false, delete: false },
    team: { view: false, create: false, edit: false, delete: false },
    reports: { view: true, export: true },
  },
  teacher: {
    payments: { view: false, create: false, edit: false, delete: false, configure: false },
    students: { view: true, create: true, edit: true, delete: false },
    classes: { view: true, create: false, edit: false, delete: false },
    attendance: { view: true, create: true, edit: true, delete: false },
    grades: { view: true, create: true, edit: true, delete: false },
    team: { view: false, create: false, edit: false, delete: false },
    reports: { view: false, export: false },
  },
  supervisor: {
    payments: { view: false, create: false, edit: false, delete: false, configure: false },
    students: { view: true, create: false, edit: false, delete: false },
    classes: { view: true, create: false, edit: false, delete: false },
    attendance: { view: true, create: true, edit: true, delete: false },
    grades: { view: true, create: false, edit: false, delete: false },
    team: { view: false, create: false, edit: false, delete: false },
    reports: { view: false, export: false },
  },
  secretary: {
    payments: { view: true, create: true, edit: false, delete: false, configure: false },
    students: { view: true, create: true, edit: true, delete: false },
    classes: { view: true, create: false, edit: false, delete: false },
    attendance: { view: true, create: false, edit: false, delete: false },
    grades: { view: false, create: false, edit: false, delete: false },
    team: { view: false, create: false, edit: false, delete: false },
    reports: { view: false, export: false },
  },
};

// Labels des rôles
export const ROLE_LABELS: Record<RoleType, string> = {
  director: "Directeur",
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
