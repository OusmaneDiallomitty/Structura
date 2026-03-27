/**
 * Retourne true si l'utilisateur a les droits d'un directeur :
 *  - soit son rôle JWT est "director"
 *  - soit un directeur lui a accordé la délégation isCoDirector
 *
 * À utiliser partout à la place de `user?.role === "director"`.
 */
export function isDirectorLevel(user: { role?: string; permissions?: { isCoDirector?: boolean } | null } | null | undefined): boolean {
  if (!user) return false;
  if (user.role === "director") return true;
  return user.permissions?.isCoDirector === true;
}
