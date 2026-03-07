"use client";

import { useState, useCallback } from "react";

interface TiltOptions {
  maxTilt?: number;
  perspective?: number;
  scale?: number;
}

interface TiltReturn {
  rotateX: number;
  rotateY: number;
  scale: number;
  handleMouseMove: (e: React.MouseEvent<HTMLElement>) => void;
  handleMouseLeave: () => void;
}

/**
 * Hook pour créer un effet 3D tilt sur un élément
 * Calcule les rotations X/Y basées sur la position de la souris
 */
export function useTilt(options: TiltOptions = {}): TiltReturn {
  const { maxTilt = 10, scale = 1.05 } = options;

  const [rotateX, setRotateX] = useState(0);
  const [rotateY, setRotateY] = useState(0);
  const [currentScale, setCurrentScale] = useState(1);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      const element = e.currentTarget;
      const rect = element.getBoundingClientRect();

      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const centerX = rect.width / 2;
      const centerY = rect.height / 2;

      const rotateXValue = ((y - centerY) / centerY) * -maxTilt;
      const rotateYValue = ((x - centerX) / centerX) * maxTilt;

      setRotateX(rotateXValue);
      setRotateY(rotateYValue);
      setCurrentScale(scale);
    },
    [maxTilt, scale]
  );

  const handleMouseLeave = useCallback(() => {
    setRotateX(0);
    setRotateY(0);
    setCurrentScale(1);
  }, []);

  return {
    rotateX,
    rotateY,
    scale: currentScale,
    handleMouseMove,
    handleMouseLeave,
  };
}
