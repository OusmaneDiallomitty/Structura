"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { useReducedMotion } from "@/hooks/useReducedMotion";

interface TypewriterTextProps {
  text: string;
  delay?: number;
  speed?: number;
  className?: string;
  showCursor?: boolean;
  onComplete?: () => void;
}

/**
 * Animation typewriter caractère par caractère
 * Effet premium pour titres hero
 */
export function TypewriterText({
  text,
  delay = 0,
  speed = 50,
  className = "",
  showCursor = true,
  onComplete,
}: TypewriterTextProps) {
  const [displayedText, setDisplayedText] = useState("");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    // Si reduced motion, afficher tout de suite
    if (prefersReducedMotion) {
      setDisplayedText(text);
      setIsComplete(true);
      if (onComplete) onComplete();
      return;
    }

    // Délai initial
    const initialTimeout = setTimeout(() => {
      setCurrentIndex(0);
    }, delay);

    return () => clearTimeout(initialTimeout);
  }, [delay, prefersReducedMotion, text]);

  useEffect(() => {
    if (prefersReducedMotion || currentIndex >= text.length) {
      if (currentIndex >= text.length && !isComplete) {
        setIsComplete(true);
        if (onComplete) onComplete();
      }
      return;
    }

    const timeout = setTimeout(() => {
      setDisplayedText((prev) => prev + text[currentIndex]);
      setCurrentIndex((prev) => prev + 1);
    }, speed);

    return () => clearTimeout(timeout);
  }, [currentIndex, text, speed, prefersReducedMotion, isComplete, onComplete]);

  return (
    <div className={className}>
      <span>{displayedText}</span>
      {showCursor && !isComplete && (
        <motion.span
          animate={{ opacity: [1, 0] }}
          transition={{ duration: 0.8, repeat: Infinity, repeatType: "reverse" }}
          className="inline-block w-[2px] h-[1em] bg-current ml-1 align-middle"
        />
      )}
    </div>
  );
}
