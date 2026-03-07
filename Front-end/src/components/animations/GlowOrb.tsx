"use client";

import { motion } from "framer-motion";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { cn } from "@/lib/utils";

interface GlowOrbProps {
  color?: string;
  size?: number;
  blur?: number;
  x?: string | number;
  y?: string | number;
  delay?: number;
  duration?: number;
  className?: string;
}

/**
 * Orbe lumineux flottant avec animation parallaxe
 * Ajoute profondeur et ambiance au Hero
 */
export function GlowOrb({
  color = "rgba(99, 102, 241, 0.6)",
  size = 300,
  blur = 100,
  x = "50%",
  y = "50%",
  delay = 0,
  duration = 8,
  className = "",
}: GlowOrbProps) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.div
      className={cn("absolute pointer-events-none", className)}
      style={{
        left: x,
        top: y,
        width: size,
        height: size,
      }}
      initial={{ opacity: 0, scale: 0 }}
      animate={
        prefersReducedMotion
          ? { opacity: 0.6, scale: 1 }
          : {
              opacity: [0.4, 0.6, 0.4],
              scale: [1, 1.2, 1],
              x: [0, 20, 0],
              y: [0, -20, 0],
            }
      }
      transition={{
        duration: duration,
        repeat: Infinity,
        repeatType: "reverse",
        delay,
        ease: "easeInOut",
      }}
    >
      <div
        className="w-full h-full rounded-full"
        style={{
          background: color,
          filter: `blur(${blur}px)`,
        }}
      />
    </motion.div>
  );
}
