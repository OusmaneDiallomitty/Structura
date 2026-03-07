"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { MagneticButton } from "@/components/animations/MagneticButton";
import { Logo } from "@/components/ui/Logo";
import { cn } from "@/lib/utils";
import { Menu, X, ArrowRight } from "lucide-react";

export function EnhancedNavigation() {
  const router   = useRouter();
  const pathname = usePathname();
  const [scrolled,   setScrolled]   = useState(false);
  const [menuOpen,   setMenuOpen]   = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Fermer le menu mobile au changement de page
  useEffect(() => { setMenuOpen(false); }, [pathname]);

  const navLinks = [
    { href: "/#features",  label: "Fonctionnalités" },
    { href: "/#solutions", label: "Solutions"        },
    { href: "/tarifs",     label: "Tarifs"           },
    { href: "/contact",    label: "Contact"          },
  ];

  const isActive = (href: string) => {
    if (href.startsWith("/#")) return pathname === "/";
    return pathname === href;
  };

  return (
    <>
      <motion.nav
        className={cn(
          "fixed top-0 left-0 right-0 z-40 transition-all duration-300",
          scrolled
            ? "bg-white/90 backdrop-blur-xl shadow-md border-b border-gray-100"
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
              className="flex items-center gap-2 cursor-pointer shrink-0"
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => router.push("/")}
            >
              <Logo variant="dark" size="md" />
            </motion.div>

            {/* Navigation desktop */}
            <div className="hidden md:flex items-center gap-1">
              {navLinks.map((link, index) => {
                const active = isActive(link.href);
                return (
                  <motion.div
                    key={link.href}
                    initial={{ opacity: 0, y: -16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.08 + 0.15 }}
                  >
                    <Link
                      href={link.href}
                      className={cn(
                        "relative px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200",
                        active
                          ? "text-indigo-700 bg-indigo-50"
                          : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                      )}
                    >
                      {link.label}
                      {active && (
                        <motion.span
                          layoutId="nav-active"
                          className="absolute inset-0 rounded-xl bg-indigo-50 -z-10"
                          transition={{ type: "spring", stiffness: 400, damping: 30 }}
                        />
                      )}
                    </Link>
                  </motion.div>
                );
              })}
            </div>

            {/* CTA buttons desktop */}
            <motion.div
              className="hidden md:flex items-center gap-2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.4 }}
            >
              <Button
                variant="ghost"
                onClick={() => router.push("/login")}
                className="text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 font-medium"
              >
                Connexion
              </Button>
              <MagneticButton strength={0.2} radius={40} onClick={() => router.push("/register")}>
                <Button className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-5 shadow-sm shadow-indigo-200">
                  Commencer
                  <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                </Button>
              </MagneticButton>
            </motion.div>

            {/* Hamburger mobile */}
            <button
              className="md:hidden p-2 rounded-xl text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition"
              onClick={() => setMenuOpen((o) => !o)}
              aria-label="Menu"
            >
              {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Ligne dégradée au scroll */}
        <AnimatePresence>
          {scrolled && (
            <motion.div
              className="absolute bottom-0 left-0 right-0 h-px bg-linear-to-r from-transparent via-indigo-400 to-transparent"
              initial={{ opacity: 0, scaleX: 0 }}
              animate={{ opacity: 1, scaleX: 1 }}
              exit={{ opacity: 0, scaleX: 0 }}
              transition={{ duration: 0.4 }}
            />
          )}
        </AnimatePresence>
      </motion.nav>

      {/* Menu mobile */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            className="fixed inset-0 z-30 md:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {/* Overlay */}
            <div
              className="absolute inset-0 bg-black/20 backdrop-blur-sm"
              onClick={() => setMenuOpen(false)}
            />
            {/* Drawer */}
            <motion.div
              className="absolute top-16 left-0 right-0 bg-white border-b border-gray-100 shadow-xl px-4 py-4 space-y-1"
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -20, opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              {navLinks.map((link) => {
                const active = isActive(link.href);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={cn(
                      "flex items-center px-4 py-3 rounded-xl text-sm font-medium transition",
                      active
                        ? "text-indigo-700 bg-indigo-50"
                        : "text-gray-700 hover:bg-gray-50"
                    )}
                  >
                    {link.label}
                  </Link>
                );
              })}

              <div className="pt-3 border-t border-gray-100 flex flex-col gap-2">
                <Button
                  variant="outline"
                  onClick={() => router.push("/login")}
                  className="w-full text-sm font-medium"
                >
                  Connexion
                </Button>
                <Button
                  onClick={() => router.push("/register")}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold"
                >
                  Commencer gratuitement
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
