"use client";

import { useEffect, useRef, ReactNode } from "react";
import Lenis from "lenis";
import { initLenis, startLenisRAF } from "@/lib/smooth-scroll";
import { useReducedMotion } from "@/hooks/useReducedMotion";

interface SmoothScrollProviderProps {
  children: ReactNode;
}

/**
 * Provider pour smooth scrolling avec Lenis
 * Désactive automatiquement si l'utilisateur préfère reduced motion
 */
export function SmoothScrollProvider({ children }: SmoothScrollProviderProps) {
  const lenisRef = useRef<Lenis | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    // Ne pas initialiser si reduced motion
    if (prefersReducedMotion) return;

    // Initialiser Lenis
    const lenis = initLenis();
    lenisRef.current = lenis;

    // Start RAF loop
    const cleanup = startLenisRAF(lenis);
    cleanupRef.current = cleanup;

    // Cleanup
    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
      }
    };
  }, [prefersReducedMotion]);

  return <>{children}</>;
}
