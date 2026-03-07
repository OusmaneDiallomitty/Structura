"use client";

import { motion, useInView, Variants } from "framer-motion";
import { useRef, ReactNode } from "react";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { fadeInUp, fadeIn } from "@/lib/animation-variants";

interface ScrollRevealProps {
  children: ReactNode;
  variant?: Variants;
  amount?: number; // % visible avant trigger (0-1)
  delay?: number;
  duration?: number;
  className?: string;
  once?: boolean;
}

/**
 * Wrapper pour animations déclenchées par scroll
 * Utilise useInView pour détecter visibilité
 */
export function ScrollReveal({
  children,
  variant = fadeInUp,
  amount = 0.3,
  delay = 0,
  duration,
  className = "",
  once = true,
}: ScrollRevealProps) {
  const ref = useRef(null);
  const isInView = useInView(ref, {
    once,
    amount,
    margin: "0px 0px -100px 0px", // Trigger 100px avant entrée viewport
  });

  const prefersReducedMotion = useReducedMotion();

  // Si reduced motion, utiliser fade simple
  const animationVariant = prefersReducedMotion ? fadeIn : variant;

  // Override duration si fourni
  const customVariant = duration
    ? {
        ...animationVariant,
        visible: {
          ...(typeof animationVariant.visible === 'object' ? animationVariant.visible : {}),
          transition: {
            ...(typeof animationVariant.visible === 'object' && 'transition' in animationVariant.visible
              ? animationVariant.visible.transition
              : {}),
            duration,
          },
        },
      }
    : animationVariant;

  return (
    <motion.div
      ref={ref}
      initial="hidden"
      animate={isInView ? "visible" : "hidden"}
      variants={customVariant}
      transition={{ delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
