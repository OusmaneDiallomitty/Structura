"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { MagneticButton } from "@/components/animations/MagneticButton";
import { Logo } from "@/components/ui/Logo";
import { cn } from "@/lib/utils";

/**
 * Navigation premium avec glassmorphism et effets scroll
 * Se transforme au scroll pour effet premium
 */
export function EnhancedNavigation() {
  const router = useRouter();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const navLinks = [
    { href: "#features",  label: "Fonctionnalités" },
    { href: "#solutions", label: "Solutions"        },
    { href: "/tarifs",    label: "Tarifs"           },
    { href: "/contact",   label: "Contact"          },
  ];

  return (
    <motion.nav
      className={cn(
        "fixed top-0 left-0 right-0 z-40 transition-all duration-300",
        scrolled
          ? "bg-white/80 backdrop-blur-lg shadow-sm border-b border-gray-200/50"
          : "bg-white border-b border-gray-200"
      )}
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
    >
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <motion.div
            className="flex items-center gap-2 cursor-pointer"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => router.push("/")}
          >
            <Logo variant="dark" size="md" />
          </motion.div>

          {/* Navigation Links */}
          <div className="hidden md:flex items-center gap-8">
            {navLinks.map((link, index) => (
              <motion.div
                key={link.href}
                className="relative"
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 + 0.2 }}
              >
                <Link
                  href={link.href}
                  className="text-sm text-gray-600 hover:text-gray-900 transition-colors group"
                >
                  {link.label}
                </Link>
                <motion.div
                  className="absolute -bottom-1 left-0 right-0 h-0.5 bg-indigo-600"
                  initial={{ scaleX: 0 }}
                  whileHover={{ scaleX: 1 }}
                  transition={{ duration: 0.3 }}
                />
              </motion.div>
            ))}
          </div>

          {/* CTA Buttons */}
          <motion.div
            className="flex items-center gap-3"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.4 }}
          >
            <Button
              variant="ghost"
              onClick={() => router.push("/login")}
              className="text-sm hidden sm:inline-flex"
            >
              Connexion
            </Button>
            <MagneticButton
              strength={0.2}
              radius={40}
              onClick={() => router.push("/register")}
            >
              <Button className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm">
                Commencer
              </Button>
            </MagneticButton>
          </motion.div>
        </div>
      </div>

      {/* Decorative gradient line */}
      <AnimatePresence>
        {scrolled && (
          <motion.div
            className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-indigo-500 to-transparent"
            initial={{ opacity: 0, scaleX: 0 }}
            animate={{ opacity: 1, scaleX: 1 }}
            exit={{ opacity: 0, scaleX: 0 }}
            transition={{ duration: 0.5 }}
          />
        )}
      </AnimatePresence>
    </motion.nav>
  );
}
