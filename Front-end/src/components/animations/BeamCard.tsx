"use client";

import { useState, useRef, ReactNode } from "react";
import { motion } from "framer-motion";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { cn } from "@/lib/utils";

interface BeamCardProps {
  children: ReactNode;
  className?: string;
  beamColor?: string;
}

/**
 * Carte avec effet de faisceau lumineux au survol
 * Le faisceau suit le curseur sur la carte
 */
export function BeamCard({
  children,
  className = "",
  beamColor = "rgba(99, 102, 241, 0.4)",
}: BeamCardProps) {
  const [beamPosition, setBeamPosition] = useState({ x: 0, y: 0 });
  const [isHovering, setIsHovering] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useReducedMotion();

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current || prefersReducedMotion) return;

    const rect = cardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setBeamPosition({ x, y });
  };

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      className={cn("relative overflow-hidden", className)}
    >
      {/* Beam effect */}
      {isHovering && !prefersReducedMotion && (
        <motion.div
          className="absolute pointer-events-none"
          style={{
            width: "400px",
            height: "400px",
            left: beamPosition.x,
            top: beamPosition.y,
            background: `radial-gradient(circle, ${beamColor} 0%, transparent 70%)`,
            transform: "translate(-50%, -50%)",
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        />
      )}

      {/* Card content */}
      <div className="relative z-10">{children}</div>
    </div>
  );
}
