/**
 * Configuration et initialisation de Lenis pour smooth scroll
 */

import Lenis from "lenis";

export interface LenisOptions {
  duration?: number;
  easing?: (t: number) => number;
  smooth?: boolean;
  smoothTouch?: boolean;
  wheelMultiplier?: number;
  touchMultiplier?: number;
}

/**
 * Fonction d'easing custom pour scroll ultra-smooth
 */
export const smoothEasing = (t: number): number => {
  return Math.min(1, 1.001 - Math.pow(2, -10 * t));
};

/**
 * Configuration par défaut pour Lenis
 */
export const defaultLenisOptions: LenisOptions = {
  duration: 0.8,
  easing: smoothEasing,
  smooth: true,
  smoothTouch: false, // Désactivé sur mobile pour feel natif
  wheelMultiplier: 1,
  touchMultiplier: 2,
};

/**
 * Initialise Lenis avec options personnalisées
 */
export function initLenis(options: LenisOptions = {}): Lenis {
  const lenisOptions = { ...defaultLenisOptions, ...options };

  const lenis = new Lenis(lenisOptions);

  return lenis;
}

/**
 * Start RAF loop pour Lenis
 */
export function startLenisRAF(lenis: Lenis): () => void {
  let rafId: number;

  function raf(time: number) {
    lenis.raf(time);
    rafId = requestAnimationFrame(raf);
  }

  rafId = requestAnimationFrame(raf);

  // Retourne fonction cleanup
  return () => {
    if (rafId) cancelAnimationFrame(rafId);
    lenis.destroy();
  };
}

/**
 * Scroll vers un élément avec animation smooth
 */
export function scrollToElement(
  lenis: Lenis,
  target: string | HTMLElement,
  options?: {
    offset?: number;
    duration?: number;
    easing?: (t: number) => number;
  }
): void {
  lenis.scrollTo(target, {
    offset: options?.offset ?? 0,
    duration: options?.duration,
    easing: options?.easing,
  });
}

/**
 * Scroll vers le top de la page
 */
export function scrollToTop(lenis: Lenis, duration?: number): void {
  lenis.scrollTo(0, { duration: duration ?? 1 });
}
