import { useState, useEffect } from 'react';

/**
 * Retarde la mise à jour d'une valeur jusqu'à ce que l'utilisateur arrête de taper.
 * Évite de déclencher un appel API à chaque frappe clavier.
 *
 * @param value  La valeur à debouncer (ex: valeur d'un champ de recherche)
 * @param delay  Délai en ms avant la mise à jour (défaut: 500ms)
 */
export function useDebounce<T>(value: T, delay = 500): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}
