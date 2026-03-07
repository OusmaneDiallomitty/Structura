"use client";

import { motion } from "framer-motion";
import { ReactNode } from "react";
import { useMagneticHover } from "@/hooks/useMagneticHover";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { cn } from "@/lib/utils";

interface MagneticButtonProps {
  children: ReactNode;
  strength?: number;
  radius?: number;
  className?: string;
  onClick?: () => void;
}

/**
 * Bouton magnétique premium qui "suit" le curseur
 * Effet signature des sites haut de gamme
 */
export function MagneticButton({
  children,
  strength = 0.3,
  radius = 50,
  className = "",
  onClick,
}: MagneticButtonProps) {
  const { x, y, handleMouseMove, handleMouseLeave, ref } = useMagneticHover({
    strength,
    radius,
  });
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.div
      ref={ref as any}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={onClick}
      animate={
        prefersReducedMotion
          ? {}
          : {
              x,
              y,
            }
      }
      transition={{
        type: "spring",
        stiffness: 150,
        damping: 15,
        mass: 0.1,
      }}
      whileHover={{ scale: prefersReducedMotion ? 1 : 1.05 }}
      whileTap={{ scale: 0.95 }}
      className={cn(
        "relative inline-flex items-center justify-center",
        "transition-shadow duration-300",
        "hover:shadow-[0_0_30px_rgba(99,102,241,0.4)]",
        className
      )}
    >
      {children}
    </motion.div>
  );
}
