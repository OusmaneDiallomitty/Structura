"use client";

import { motion } from "framer-motion";
import { ReactNode } from "react";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { cn } from "@/lib/utils";

interface ShimmerTextProps {
  children: ReactNode;
  className?: string;
  shimmerColor?: string;
  duration?: number;
}

/**
 * Texte avec effet shimmer animé
 * Ajoute un éclat premium aux titres
 */
export function ShimmerText({
  children,
  className = "",
  shimmerColor = "rgba(255, 255, 255, 0.8)",
  duration = 3,
}: ShimmerTextProps) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <span className={cn("relative inline-block", className)}>
      <span className="relative z-10">{children}</span>
      {!prefersReducedMotion && (
        <motion.span
          className="absolute inset-0 z-20 bg-gradient-to-r from-transparent via-white to-transparent opacity-0"
          style={{
            backgroundImage: `linear-gradient(90deg, transparent 0%, ${shimmerColor} 50%, transparent 100%)`,
            backgroundSize: "200% 100%",
          }}
          animate={{
            backgroundPosition: ["200% 0", "-200% 0"],
            opacity: [0, 1, 0],
          }}
          transition={{
            duration,
            repeat: Infinity,
            repeatDelay: 2,
            ease: "linear",
          }}
        />
      )}
    </span>
  );
}
