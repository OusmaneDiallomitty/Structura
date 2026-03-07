"use client";

import { ReactNode } from "react";
import { Parallax } from "react-scroll-parallax";
import { useReducedMotion } from "@/hooks/useReducedMotion";

interface ParallaxLayerProps {
  children: ReactNode;
  speed?: number; // Vitesse parallax (-50 à 50)
  className?: string;
  opacity?: [number, number]; // [start, end]
  scale?: [number, number];   // [start, end]
  rotate?: [number, number];  // [start, end]
}

/**
 * Wrapper pour effet parallaxe sur scroll
 * Utilise react-scroll-parallax pour performance optimale
 */
export function ParallaxLayer({
  children,
  speed = 0,
  className = "",
  opacity,
  scale,
  rotate,
}: ParallaxLayerProps) {
  const prefersReducedMotion = useReducedMotion();

  // Désactiver parallax si reduced motion
  if (prefersReducedMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <Parallax
      speed={speed}
      opacity={opacity}
      scale={scale}
      rotate={rotate}
      className={className}
    >
      {children}
    </Parallax>
  );
}
