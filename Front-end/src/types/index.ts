// Types globaux pour Structura

/** Affectation classe+matières pour un professeur */
export interface ClassAssignment {
  classId: string;
  subjects: string[];
}

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  tenantId: string;
  schoolName?: string | null;
  schoolLogo?: string | null;
  avatar?: string;
  phone?: string;
  emailVerified?: boolean;
  onboardingCompleted?: boolean; // Flag pour savoir si l'onboarding est terminé
  isActive: boolean;
  permissions?: import("@/types/permissions").UserPermissions | null;
  assignedClassIds?: string[];
  /** Détail des matières par classe pour les professeurs */
  classAssignments?: ClassAssignment[] | null;
  createdAt: Date;
  updatedAt: Date;
}

export type UserRole = 
  | "director"      // Directeur
  | "accountant"    // Comptable
  | "teacher"       // Enseignant
  | "supervisor"    // Surveillant
  | "secretary"     // Secrétaire
  | "admin";        // Administrateur système

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

export interface LoginCredentials {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    field?: string;
  };
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
  };
}

// Types pour l'organisation
export type OrganizationType = "school" | "business" | "service";

export type SchoolLevel = "maternelle" | "primaire" | "secondaire" | "lycee";

export interface Organization {
  id: string;
  name: string;
  type: OrganizationType;
  country: string;
  city: string;
  createdAt: Date;
  updatedAt: Date;
}

// Types pour les classes (écoles)
export interface SchoolClass {
  id: string;
  name: string; // Ex: "1ère année A", "CP", "6ème B"
  level: SchoolLevel; // maternelle, primaire, secondaire, lycee
  capacity: number; // Nombre max d'élèves
  currentStudents: number; // Nombre actuel d'élèves
  organizationId: string;
  createdAt: Date;
  updatedAt: Date;
}

// Types pour l'onboarding
export interface OnboardingData {
  // Étape 1: Sélection des niveaux (pour les écoles)
  selectedLevels?: SchoolLevel[];
  
  // Étape 2: Classes créées/modifiées
  classes?: {
    name: string;
    level: SchoolLevel;
    capacity: number;
  }[];
  
  // Pour les commerces
  businessType?: string;
  businessActivity?: string;
  
  // Statut
  completed: boolean;
  currentStep: number;
}


/**
 * Réponse brute du backend pour un élève (avant mapping vers Student).
 * Reflète exactement ce que retourne GET /students et POST /students.
 */
export interface BackendStudent {
  id: string;
  firstName: string;
  lastName: string;
  matricule: string;
  classId: string;
  class?: {
    id: string;
    name: string;
    section?: string | null;
  };
  status: string;
  parentName: string;
  parentPhone: string;
  paymentStatus: string;
  dateOfBirth?: string;
  gender?: string;
  address?: string;
  parentEmail?: string;
  parentProfession?: string;
}

/**
 * Représentation légère d'une classe pour les selects/dropdowns.
 * Utilisée dans les pages students et add/student.
 */
export interface ClassOption {
  id: string;
  name: string;
  section?: string | null;
  level?: string;
}

// Types pour les élèves
export interface Student {
  id: string;
  name: string;
  firstName?: string;
  lastName?: string;
  matricule: string;
  class: string; // Nom de la classe (pour affichage)
  classId?: string; // ID de la classe (pour le backend)
  dateOfBirth?: string;
  gender?: "M" | "F";
  photo?: string;
  status: "active" | "inactive" | "graduated";
  parentName?: string;
  parentPhone?: string;
  parentEmail?: string;
  parentProfession?: string;
  address?: string;
  medicalInfo?: string;
  enrollmentDate?: string;
  paymentStatus?: "paid" | "pending" | "late"; // Statut de paiement
  needsSync?: boolean; // Flag pour synchronisation offline
  createdAt?: string;
  updatedAt?: string;
}

// Types pour les classes
export interface Class {
  id: string;
  name: string;
  level: string;
  capacity: number;
  studentCount: number;
  teacherId?: string;
  teacherName?: string;
  room?: string;
  schedule?: string;
  needsSync?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

// Types pour les présences
export interface Attendance {
  id: string;
  studentId: string;
  classId: string;
  date: string; // Format: YYYY-MM-DD
  status: "present" | "absent" | "late" | "excused";
  markedAt: string; // ISO timestamp
  markedBy: string; // User ID
  notes?: string;
  needsSync?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

// Types pour les paiements
export interface Payment {
  id: string;
  studentId: string;
  studentName?: string;
  amount: number;
  currency: string;
  method: "cash" | "mobile_money" | "bank_transfer" | "check";
  status: "paid" | "partial" | "pending" | "overdue" | "cancelled";
  dueDate?: string;
  paidDate?: string;
  description?: string;
  receiptNumber?: string;
  academicYear?: string;
  term?: string;
  needsSync?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

// Types pour les notes
export interface Grade {
  id: string;
  studentId: string;
  classId: string;
  subject: string;
  term: string; // Trimestre/Semestre
  academicYear: string;
  score: number;
  maxScore: number;
  coefficient?: number;
  teacherId?: string;
  notes?: string;
  needsSync?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

// Types pour les membres de l'équipe
export interface TeamMember {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  role: UserRole;
  photo?: string;
  status: "active" | "inactive" | "pending";
  permissions?: string[];
  hireDate?: string;
  needsSync?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

// Types pour les notifications
export interface Notification {
  id: string;
  userId: string;
  type: "success" | "error" | "warning" | "info";
  title: string;
  message: string;
  read: boolean;
  actionUrl?: string;
  timestamp: string;
  createdAt?: string;
}
