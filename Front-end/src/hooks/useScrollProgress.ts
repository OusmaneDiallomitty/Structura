"use client";

import { useEffect, useState } from "react";

/**
 * Hook pour tracker le pourcentage de scroll de la page
 * Retourne une valeur entre 0 et 1
 */
export function useScrollProgress(): number {
  const [scrollProgress, setScrollProgress] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      const windowHeight = window.innerHeight;
      const documentHeight = document.documentElement.scrollHeight;
      const scrollTop = window.scrollY;

      const totalScroll = documentHeight - windowHeight;
      const progress = totalScroll > 0 ? scrollTop / totalScroll : 0;

      setScrollProgress(Math.min(Math.max(progress, 0), 1));
    };

    // RAF pour optimiser performance
    let rafId: number;
    const optimizedHandleScroll = () => {
      rafId = requestAnimationFrame(handleScroll);
    };

    window.addEventListener("scroll", optimizedHandleScroll, { passive: true });
    handleScroll(); // Initial call

    return () => {
      window.removeEventListener("scroll", optimizedHandleScroll);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, []);

  return scrollProgress;
}
