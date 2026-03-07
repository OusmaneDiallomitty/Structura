// Système de permissions pour Structura

// Type pour le payload du token JWT
export interface TokenPayload {
  sub: string;
  email: string;
  role: string;
  tenantId: string;
  iat?: number;
  exp?: number;
}

// Définition des rôles et leurs permissions
export const ROLES = {
  DIRECTOR: 'DIRECTOR',
  ACCOUNTANT: 'ACCOUNTANT', 
  TEACHER: 'TEACHER',
  SUPERVISOR: 'SUPERVISOR',
  SECRETARY: 'SECRETARY',
  ADMIN: 'ADMIN',
} as const;

// Définition des permissions
export const PERMISSIONS = {
  // Étudiants
  STUDENTS_READ: 'students:read',
  STUDENTS_CREATE: 'students:create',
  STUDENTS_UPDATE: 'students:update',
  STUDENTS_DELETE: 'students:delete',

  // Classes
  CLASSES_READ: 'classes:read',
  CLASSES_CREATE: 'classes:create',
  CLASSES_UPDATE: 'classes:update',
  CLASSES_DELETE: 'classes:delete',

  // Paiements
  PAYMENTS_READ: 'payments:read',
  PAYMENTS_CREATE: 'payments:create',
  PAYMENTS_UPDATE: 'payments:update',
  PAYMENTS_DELETE: 'payments:delete',

  // Présences
  ATTENDANCE_READ: 'attendance:read',
  ATTENDANCE_CREATE: 'attendance:create',
  ATTENDANCE_UPDATE: 'attendance:update',
  ATTENDANCE_DELETE: 'attendance:delete',

  // Notes
  GRADES_READ: 'grades:read',
  GRADES_CREATE: 'grades:create',
  GRADES_UPDATE: 'grades:update',
  GRADES_DELETE: 'grades:delete',

  // Utilisateurs
  USERS_READ: 'users:read',
  USERS_CREATE: 'users:create',
  USERS_UPDATE: 'users:update',
  USERS_DELETE: 'users:delete',

  // Rapports
  REPORTS_READ: 'reports:read',
  REPORTS_EXPORT: 'reports:export',

  // Administration
  ADMIN_SETTINGS: 'admin:settings',
  ADMIN_TENANT: 'admin:tenant',
} as const;

// Matrice des permissions par rôle
export const ROLE_PERMISSIONS: Record<string, string[]> = {
  [ROLES.DIRECTOR]: [
    // Accès total
    PERMISSIONS.STUDENTS_READ,
    PERMISSIONS.STUDENTS_CREATE,
    PERMISSIONS.STUDENTS_UPDATE,
    PERMISSIONS.STUDENTS_DELETE,
    PERMISSIONS.CLASSES_READ,
    PERMISSIONS.CLASSES_CREATE,
    PERMISSIONS.CLASSES_UPDATE,
    PERMISSIONS.CLASSES_DELETE,
    PERMISSIONS.PAYMENTS_READ,
    PERMISSIONS.PAYMENTS_CREATE,
    PERMISSIONS.PAYMENTS_UPDATE,
    PERMISSIONS.PAYMENTS_DELETE,
    PERMISSIONS.ATTENDANCE_READ,
    PERMISSIONS.ATTENDANCE_CREATE,
    PERMISSIONS.ATTENDANCE_UPDATE,
    PERMISSIONS.ATTENDANCE_DELETE,
    PERMISSIONS.GRADES_READ,
    PERMISSIONS.GRADES_CREATE,
    PERMISSIONS.GRADES_UPDATE,
    PERMISSIONS.GRADES_DELETE,
    PERMISSIONS.USERS_READ,
    PERMISSIONS.USERS_CREATE,
    PERMISSIONS.USERS_UPDATE,
    PERMISSIONS.USERS_DELETE,
    PERMISSIONS.REPORTS_READ,
    PERMISSIONS.REPORTS_EXPORT,
    PERMISSIONS.ADMIN_SETTINGS,
    PERMISSIONS.ADMIN_TENANT,
  ],

  [ROLES.ACCOUNTANT]: [
    // Gestion financière
    PERMISSIONS.STUDENTS_READ,
    PERMISSIONS.PAYMENTS_READ,
    PERMISSIONS.PAYMENTS_CREATE,
    PERMISSIONS.PAYMENTS_UPDATE,
    PERMISSIONS.REPORTS_READ,
    PERMISSIONS.REPORTS_EXPORT,
  ],

  [ROLES.TEACHER]: [
    // Gestion pédagogique
    PERMISSIONS.STUDENTS_READ,
    PERMISSIONS.STUDENTS_UPDATE, // Peut modifier les infos de ses élèves
    PERMISSIONS.CLASSES_READ,
    PERMISSIONS.ATTENDANCE_READ,
    PERMISSIONS.ATTENDANCE_CREATE,
    PERMISSIONS.ATTENDANCE_UPDATE,
    PERMISSIONS.GRADES_READ,
    PERMISSIONS.GRADES_CREATE,
    PERMISSIONS.GRADES_UPDATE,
    PERMISSIONS.REPORTS_READ,
  ],

  [ROLES.SUPERVISOR]: [
    // Gestion des présences
    PERMISSIONS.STUDENTS_READ,
    PERMISSIONS.CLASSES_READ,
    PERMISSIONS.ATTENDANCE_READ,
    PERMISSIONS.ATTENDANCE_CREATE,
    PERMISSIONS.ATTENDANCE_UPDATE,
    PERMISSIONS.REPORTS_READ,
  ],

  [ROLES.SECRETARY]: [
    // Gestion administrative
    PERMISSIONS.STUDENTS_READ,
    PERMISSIONS.STUDENTS_CREATE,
    PERMISSIONS.STUDENTS_UPDATE,
    PERMISSIONS.CLASSES_READ,
    PERMISSIONS.PAYMENTS_READ,
    PERMISSIONS.REPORTS_READ,
  ],

  [ROLES.ADMIN]: [
    // Accès système complet
    ...Object.values(PERMISSIONS),
  ],
};

// Vérifier si un utilisateur a une permission
export function hasPermission(user: TokenPayload, permission: string): boolean {
  const userPermissions = ROLE_PERMISSIONS[user.role] || [];
  return userPermissions.includes(permission);
}

// Vérifier si un utilisateur a au moins une des permissions
export function hasAnyPermission(user: TokenPayload, permissions: string[]): boolean {
  return permissions.some(permission => hasPermission(user, permission));
}

// Vérifier si un utilisateur a toutes les permissions
export function hasAllPermissions(user: TokenPayload, permissions: string[]): boolean {
  return permissions.every(permission => hasPermission(user, permission));
}

// Middleware pour vérifier les permissions
export function requirePermission(permission: string) {
  return (user: TokenPayload) => {
    if (!hasPermission(user, permission)) {
      throw new Error(`Permission denied: ${permission}`);
    }
  };
}

// Middleware pour vérifier plusieurs permissions (OR)
export function requireAnyPermission(permissions: string[]) {
  return (user: TokenPayload) => {
    if (!hasAnyPermission(user, permissions)) {
      throw new Error(`Permission denied: one of [${permissions.join(', ')}]`);
    }
  };
}

// Middleware pour vérifier plusieurs permissions (AND)
export function requireAllPermissions(permissions: string[]) {
  return (user: TokenPayload) => {
    if (!hasAllPermissions(user, permissions)) {
      throw new Error(`Permission denied: all of [${permissions.join(', ')}]`);
    }
  };
}

// Obtenir toutes les permissions d'un utilisateur
export function getUserPermissions(user: TokenPayload): string[] {
  return ROLE_PERMISSIONS[user.role] || [];
}

// Vérifier si un rôle existe
export function isValidRole(role: string): boolean {
  return Object.values(ROLES).includes(role as any);
}

// Obtenir la hiérarchie des rôles (pour l'interface)
export const ROLE_HIERARCHY = [
  { role: ROLES.ADMIN, label: 'Administrateur Système', level: 100 },
  { role: ROLES.DIRECTOR, label: 'Directeur', level: 90 },
  { role: ROLES.ACCOUNTANT, label: 'Comptable', level: 70 },
  { role: ROLES.TEACHER, label: 'Enseignant', level: 60 },
  { role: ROLES.SUPERVISOR, label: 'Surveillant', level: 50 },
  { role: ROLES.SECRETARY, label: 'Secrétaire', level: 40 },
];

// Vérifier si un utilisateur peut gérer un autre utilisateur
export function canManageUser(manager: TokenPayload, targetRole: string): boolean {
  const managerLevel = ROLE_HIERARCHY.find(r => r.role === manager.role)?.level || 0;
  const targetLevel = ROLE_HIERARCHY.find(r => r.role === targetRole)?.level || 0;
  
  return managerLevel > targetLevel;
}