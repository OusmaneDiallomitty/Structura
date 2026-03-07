"use client";

import { motion, useScroll, useSpring } from "framer-motion";

/**
 * Barre de progression du scroll en haut de la page
 * Gradient coloré qui suit la progression
 */
export function ScrollProgress() {
  const { scrollYProgress } = useScroll();

  // Spring animation pour smoothness
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 100,
    damping: 30,
    restDelta: 0.001,
  });

  return (
    <motion.div
      className="fixed top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 origin-left z-50"
      style={{ scaleX }}
    />
  );
}
