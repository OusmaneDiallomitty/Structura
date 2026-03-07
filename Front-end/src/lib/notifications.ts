import { toast } from "sonner";

// Notifications de succès
export const showSuccess = (title: string, description?: string) => {
  toast.success(title, {
    description,
    duration: 4000,
  });
};

// Alias pour compatibilité
export const showSuccessToast = showSuccess;

// Notifications d'erreur
export const showError = (title: string, description?: string) => {
  toast.error(title, {
    description: description || "Une erreur est survenue. Veuillez réessayer.",
    duration: 5000,
  });
};

// Alias pour compatibilité
export const showErrorToast = showError;

// Notifications d'information
export const showInfo = (title: string, description?: string) => {
  toast.info(title, {
    description,
    duration: 3000,
  });
};

// Alias pour compatibilité
export const showInfoToast = showInfo;

// Notifications d'avertissement
export const showWarning = (title: string, description?: string) => {
  toast.warning(title, {
    description,
    duration: 4000,
  });
};

// Alias pour compatibilité
export const showWarningToast = showWarning;

// Notifications spécifiques pour les actions CRUD
export const notifications = {
  // Classes
  classAdded: (className: string) =>
    showSuccess("Classe ajoutée!", `La classe ${className} a été créée avec succès.`),
  classUpdated: (className: string) =>
    showSuccess("Classe modifiée!", `La classe ${className} a été mise à jour.`),
  classDeleted: (className: string) =>
    showSuccess("Classe supprimée!", `La classe ${className} a été supprimée.`),

  // Élèves
  studentAdded: (studentName: string) =>
    showSuccess("Élève ajouté!", `${studentName} a été ajouté avec succès.`),
  studentUpdated: (studentName: string) =>
    showSuccess("Élève modifié!", `Les informations de ${studentName} ont été mises à jour.`),
  studentDeleted: (studentName: string) =>
    showSuccess("Élève supprimé!", `${studentName} a été retiré de la liste.`),

  // Présences
  attendanceSaved: (presentCount: number, totalCount: number) =>
    showSuccess(
      "Présences enregistrées!",
      `${presentCount} présents sur ${totalCount} élèves.`
    ),

  // Paiements
  paymentRecorded: (studentName: string, amount: number) =>
    showSuccess(
      "Paiement enregistré!",
      `Paiement de ${amount.toLocaleString()} GNF pour ${studentName}.`
    ),

  // Notes
  gradesSaved: (className: string) =>
    showSuccess("Notes enregistrées!", `Les notes de ${className} ont été sauvegardées.`),

  // Équipe
  memberAdded: (memberName: string, role: string) =>
    showSuccess("Membre ajouté!", `${memberName} (${role}) a rejoint l'équipe.`),
  memberUpdated: (memberName: string) =>
    showSuccess("Membre modifié!", `Les informations de ${memberName} ont été mises à jour.`),
  memberDeleted: (memberName: string) =>
    showSuccess("Membre retiré!", `${memberName} a été retiré de l'équipe.`),

  // Paramètres
  settingsSaved: () =>
    showSuccess("Paramètres enregistrés!", "Vos modifications ont été sauvegardées."),
  
  // Alias pour compatibilité
  showErrorToast: showError,
};
