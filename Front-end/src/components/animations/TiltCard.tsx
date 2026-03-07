"use client";

import { motion } from "framer-motion";
import { ReactNode } from "react";
import { useTilt } from "@/hooks/useTilt";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { cn } from "@/lib/utils";

interface TiltCardProps {
  children: ReactNode;
  maxTilt?: number;
  scale?: number;
  perspective?: number;
  className?: string;
}

/**
 * Carte avec effet 3D tilt au survol
 * La carte s'incline en suivant la position du curseur
 */
export function TiltCard({
  children,
  maxTilt = 10,
  scale = 1.02,
  perspective = 1000,
  className = "",
}: TiltCardProps) {
  const { rotateX, rotateY, scale: currentScale, handleMouseMove, handleMouseLeave } = useTilt({
    maxTilt,
    scale,
  });
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.div
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      animate={
        prefersReducedMotion
          ? {}
          : {
              rotateX,
              rotateY,
              scale: currentScale,
            }
      }
      transition={{
        type: "spring",
        stiffness: 400,
        damping: 30,
      }}
      style={{
        transformStyle: "preserve-3d",
        perspective,
      }}
      className={cn("will-change-transform", className)}
    >
      {children}
    </motion.div>
  );
}
