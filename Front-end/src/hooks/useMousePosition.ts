"use client";

import { useEffect, useState } from "react";

interface MousePosition {
  x: number;
  y: number;
}

/**
 * Hook pour tracker la position de la souris en temps réel
 * Utilisé pour les effets magnétiques et interactions curseur
 */
export function useMousePosition(): MousePosition {
  const [mousePosition, setMousePosition] = useState<MousePosition>({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      setMousePosition({
        x: event.clientX,
        y: event.clientY,
      });
    };

    window.addEventListener("mousemove", handleMouseMove);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
    };
  }, []);

  return mousePosition;
}
