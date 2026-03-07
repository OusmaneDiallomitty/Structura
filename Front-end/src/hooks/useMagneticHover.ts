"use client";

import { useState, useCallback, useRef } from "react";

interface MagneticHoverOptions {
  strength?: number; // Force d'attraction (0-1)
  radius?: number;   // Rayon d'effet en pixels
}

interface MagneticHoverReturn {
  x: number;
  y: number;
  handleMouseMove: (e: React.MouseEvent<HTMLElement>) => void;
  handleMouseLeave: () => void;
  ref: React.RefObject<HTMLElement>;
}

/**
 * Hook pour créer un effet magnétique sur un élément
 * L'élément "suit" le curseur quand il est à proximité
 */
export function useMagneticHover(options: MagneticHoverOptions = {}): MagneticHoverReturn {
  const { strength = 0.3, radius = 50 } = options;

  const [position, setPosition] = useState({ x: 0, y: 0 });
  const ref = useRef<HTMLElement>(null);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      const element = ref.current;
      if (!element) return;

      const rect = element.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      const deltaX = e.clientX - centerX;
      const deltaY = e.clientY - centerY;
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

      // Appliquer l'effet seulement dans le rayon
      if (distance < radius) {
        const factor = strength * (1 - distance / radius);
        setPosition({
          x: deltaX * factor,
          y: deltaY * factor,
        });
      } else {
        setPosition({ x: 0, y: 0 });
      }
    },
    [strength, radius]
  );

  const handleMouseLeave = useCallback(() => {
    setPosition({ x: 0, y: 0 });
  }, []);

  return {
    x: position.x,
    y: position.y,
    handleMouseMove,
    handleMouseLeave,
    ref: ref as React.RefObject<HTMLElement>,
  };
}
