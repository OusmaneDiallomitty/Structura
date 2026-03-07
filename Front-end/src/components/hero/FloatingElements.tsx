"use client";

import { motion } from "framer-motion";
import { Sparkles, Target, Award, Zap } from "lucide-react";
import { ParallaxLayer } from "@/components/animations/ParallaxLayer";

/**
 * Éléments UI flottants avec parallaxe différentielle
 * Ajoute profondeur et mouvement au Hero
 */
export function FloatingElements() {
  const elements = [
    {
      icon: Sparkles,
      color: "text-yellow-500",
      bg: "bg-yellow-50",
      size: "w-10 h-10",
      speed: -3,
      position: "top-20 left-[10%]",
    },
    {
      icon: Target,
      color: "text-blue-500",
      bg: "bg-blue-50",
      size: "w-10 h-10",
      speed: 5,
      position: "top-40 right-[15%]",
    },
  ];

  return (
    <>
      {elements.map((element, index) => (
        <ParallaxLayer key={index} speed={element.speed} className={`absolute ${element.position}`}>
          <motion.div
            initial={{ opacity: 0, scale: 0, rotate: -180 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            transition={{
              delay: 0.5 + index * 0.1,
              duration: 0.6,
              type: "spring",
              stiffness: 200,
            }}
            whileHover={{ scale: 1.1, rotate: 10 }}
            className={`${element.size} ${element.bg} rounded-2xl shadow-lg flex items-center justify-center backdrop-blur-sm border border-white/50`}
          >
            <element.icon className={`w-6 h-6 ${element.color}`} />
          </motion.div>
        </ParallaxLayer>
      ))}
    </>
  );
}
