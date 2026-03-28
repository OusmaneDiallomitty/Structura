/**
 * Retourne true si l'utilisateur a les droits d'un directeur :
 *  - soit son rôle JWT est "director" (fondateur)
 *  - soit un fondateur lui a accordé la délégation isCoDirector (directeur)
 *
 * À utiliser partout à la place de `user?.role === "director"`.
 */
export function isDirectorLevel(user: { role?: string; permissions?: { isCoDirector?: boolean } | null } | null | undefined): boolean {
  if (!user) return false;
  if (user.role === "director") return true;
  return user.permissions?.isCoDirector === true;
}

/**
 * Retourne true uniquement pour le fondateur (role === "director").
 * À utiliser pour les fonctionnalités exclusives : paie, stats financières globales, abonnement.
 */
export function isFounder(user: { role?: string } | null | undefined): boolean {
  if (!user) return false;
  return user.role === "director";
}
