"use client";

import { useEffect, useRef } from "react";

/**
 * Recharge les données dès que l'utilisateur revient sur l'onglet/fenêtre.
 * Couvre les cas :
 *   - Un prof ajoute un élève → le directeur revient sur l'onglet → données fraîches
 *   - L'utilisateur passe à un autre onglet puis revient → pas de données périmées
 *
 * @param callback  Fonction de rechargement (ex: loadStudents)
 * @param minDelay  Délai minimum entre deux refreshes en ms (défaut: 30s)
 *                  Évite un rechargement si l'utilisateur n'est parti que 2 secondes.
 */
export function useRefreshOnFocus(callback: () => void, minDelay = 30_000) {
  const lastRefreshedAt = useRef<number>(Date.now());
  const callbackRef     = useRef(callback);

  // Mettre à jour la ref à chaque render sans re-créer l'effet
  callbackRef.current = callback;

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;

      const elapsed = Date.now() - lastRefreshedAt.current;
      if (elapsed < minDelay) return;

      lastRefreshedAt.current = Date.now();
      callbackRef.current();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [minDelay]);
}
