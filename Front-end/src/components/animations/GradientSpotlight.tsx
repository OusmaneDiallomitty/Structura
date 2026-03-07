"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useMousePosition } from "@/hooks/useMousePosition";
import { useReducedMotion } from "@/hooks/useReducedMotion";

interface GradientSpotlightProps {
  color1?: string;
  color2?: string;
  size?: number;
  opacity?: number;
}

/**
 * Spotlight gradient qui suit le curseur
 * Crée un effet premium pour sections CTA
 */
export function GradientSpotlight({
  color1 = "rgba(99, 102, 241, 0.3)",
  color2 = "rgba(168, 85, 247, 0.2)",
  size = 500,
  opacity = 1,
}: GradientSpotlightProps) {
  const mousePosition = useMousePosition();
  const [smoothPosition, setSmoothPosition] = useState({ x: 0, y: 0 });
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    if (prefersReducedMotion) return;

    // Smooth interpolation
    const rafId = requestAnimationFrame(() => {
      setSmoothPosition((prev) => ({
        x: prev.x + (mousePosition.x - prev.x) * 0.1,
        y: prev.y + (mousePosition.y - prev.y) * 0.1,
      }));
    });

    return () => cancelAnimationFrame(rafId);
  }, [mousePosition, prefersReducedMotion]);

  if (prefersReducedMotion) return null;

  return (
    <motion.div
      className="absolute inset-0 pointer-events-none overflow-hidden"
      style={{ opacity }}
    >
      <div
        className="absolute"
        style={{
          width: size,
          height: size,
          left: smoothPosition.x,
          top: smoothPosition.y,
          transform: "translate(-50%, -50%)",
          background: `radial-gradient(circle, ${color1} 0%, ${color2} 40%, transparent 70%)`,
          filter: "blur(40px)",
          transition: "opacity 0.3s ease",
        }}
      />
    </motion.div>
  );
}
