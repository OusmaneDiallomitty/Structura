/**
 * Hook partagé pour l'année scolaire courante.
 *
 * PROBLÈME : getCurrentAcademicYear() était appelé indépendamment dans
 * 5 pages (dashboard, students, payments, classes, grades) → 5 requêtes
 * API séparées par session de navigation. L'année ne change qu'1 fois/an.
 *
 * SOLUTION : queryKey identique + staleTime 24h → React Query partage
 * le même cache entre toutes les pages. Résultat : 1 requête/24h.
 */

import { useQuery } from "@tanstack/react-query";
import { getCurrentAcademicYear, type AcademicYear } from "@/lib/api/academic-years.service";
import * as storage from "@/lib/storage";
import { useAuth } from "@/contexts/AuthContext";
import { useOnline } from "@/hooks/use-online";

export const ACADEMIC_YEAR_QUERY_KEY = (tenantId?: string) =>
  ["current-academic-year", tenantId] as const;

export function useCurrentAcademicYear() {
  const { user } = useAuth();
  const isOnline = useOnline();

  return useQuery<AcademicYear | null>({
    queryKey: ACADEMIC_YEAR_QUERY_KEY(user?.tenantId),
    queryFn: async () => {
      const token = storage.getAuthItem("structura_token");
      if (!token) return null;
      return getCurrentAcademicYear(token).catch(() => null);
    },
    enabled: isOnline && !!user,
    staleTime: 24 * 60 * 60 * 1000,      // 24h — change 1 fois par an
    gcTime:    7  * 24 * 60 * 60 * 1000,  // garde en mémoire 7 jours
  });
}
