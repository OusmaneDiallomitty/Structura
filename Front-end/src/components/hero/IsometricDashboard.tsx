"use client";

import { motion } from "framer-motion";
import { useRef } from "react";
import { BarChart3, Users, DollarSign, TrendingUp, Activity, CheckCircle2 } from "lucide-react";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Dashboard 3D isométrique qui rotate au scroll
 * Mockup visuel premium pour le Hero
 */
export function IsometricDashboard() {
  const containerRef = useRef(null);
  const prefersReducedMotion = useReducedMotion();

  // Disabled scroll-based 3D rotation for performance
  // const { scrollYProgress } = useScroll({
  //   target: containerRef,
  //   offset: ["start start", "end start"],
  // });
  // const rotateX = useTransform(scrollYProgress, [0, 1], [0, prefersReducedMotion ? 0 : 15]);
  // const rotateY = useTransform(scrollYProgress, [0, 1], [0, prefersReducedMotion ? 0 : -10]);
  // const scale = useTransform(scrollYProgress, [0, 0.5], [1, 0.9]);

  const stats = [
    {
      icon: BarChart3,
      label: "Performance globale",
      value: "96.8%",
      color: "from-blue-500 to-blue-600",
      bgColor: "bg-blue-50",
    },
    {
      icon: Users,
      label: "Équipe active",
      value: "2,847",
      color: "from-violet-500 to-violet-600",
      bgColor: "bg-violet-50",
    },
    {
      icon: DollarSign,
      label: "Chiffre d'affaires",
      value: "€128.5K",
      color: "from-emerald-500 to-emerald-600",
      bgColor: "bg-emerald-50",
    },
  ];

  return (
    <div ref={containerRef} className="relative w-full h-full flex items-center justify-center py-12">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.4 }}
        className="relative w-full max-w-4xl"
      >
        {/* Browser chrome mockup */}
        <div className="relative bg-white rounded-2xl shadow-2xl overflow-hidden border border-gray-200">
          {/* Browser header */}
          <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-b border-gray-200">
            <div className="flex gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500" />
              <div className="w-3 h-3 rounded-full bg-yellow-500" />
              <div className="w-3 h-3 rounded-full bg-green-500" />
            </div>
            <div className="flex-1 mx-4">
              <div className="bg-white rounded-md px-3 py-1 text-xs text-gray-500 border border-gray-200">
                structura.app/dashboard
              </div>
            </div>
          </div>

          {/* Dashboard content */}
          <div className="p-8 bg-gradient-to-br from-gray-50 to-white">
            {/* Organization Type Badges */}
            <motion.div
              className="flex flex-wrap gap-2 mb-6"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <span className="px-3 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">
                🏫 Écoles
              </span>
              <span className="px-3 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full">
                🏪 Commerces
              </span>
              <span className="px-3 py-1 bg-purple-100 text-purple-700 text-xs font-medium rounded-full">
                🤝 ONG
              </span>
              <span className="px-3 py-1 bg-amber-100 text-amber-700 text-xs font-medium rounded-full">
                💼 PME
              </span>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {stats.map((stat, index) => (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 + 0.3, duration: 0.5 }}
                >
                  <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow">
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between mb-3">
                        <div
                          className={`inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br ${stat.color}`}
                        >
                          <stat.icon className="w-6 h-6 text-white" />
                        </div>
                        <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
                          <TrendingUp className="w-3 h-3" />
                          +12%
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 mb-1">{stat.label}</p>
                      <p className="text-3xl font-bold text-gray-900">{stat.value}</p>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>

            {/* Advanced chart with multiple data sets */}
            <motion.div
              className="mt-8 space-y-3"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
            >
              <div className="flex items-center justify-between text-xs text-gray-600">
                <span>Activité des 7 derniers jours</span>
                <div className="flex gap-4">
                  <span className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-indigo-500" />
                    Opérations
                  </span>
                  <span className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-emerald-500" />
                    Utilisateurs
                  </span>
                </div>
              </div>
              <div className="flex items-end justify-around gap-2 h-32">
                {[
                  { primary: 40, secondary: 30 },
                  { primary: 70, secondary: 60 },
                  { primary: 45, secondary: 50 },
                  { primary: 80, secondary: 70 },
                  { primary: 60, secondary: 65 },
                  { primary: 90, secondary: 85 },
                  { primary: 75, secondary: 80 },
                ].map((data, i) => (
                  <div key={i} className="flex-1 flex gap-1 items-end">
                    <div
                      className="flex-1 bg-gradient-to-t from-indigo-500 to-indigo-400 rounded-t-md"
                      style={{ height: `${data.primary}%` }}
                    />
                    <div
                      className="flex-1 bg-gradient-to-t from-emerald-500 to-emerald-400 rounded-t-md"
                      style={{ height: `${data.secondary}%` }}
                    />
                  </div>
                ))}
              </div>
            </motion.div>

            {/* Quick Stats Row */}
            <motion.div
              className="mt-6 grid grid-cols-3 gap-4"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.8 }}
            >
              <div className="flex items-center gap-2 p-3 bg-white rounded-lg shadow-sm">
                <Activity className="w-4 h-4 text-blue-500" />
                <div>
                  <p className="text-xs text-gray-600">Uptime</p>
                  <p className="text-sm font-semibold text-gray-900">99.9%</p>
                </div>
              </div>
              <div className="flex items-center gap-2 p-3 bg-white rounded-lg shadow-sm">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                <div>
                  <p className="text-xs text-gray-600">Tâches</p>
                  <p className="text-sm font-semibold text-gray-900">847/920</p>
                </div>
              </div>
              <div className="flex items-center gap-2 p-3 bg-white rounded-lg shadow-sm">
                <TrendingUp className="w-4 h-4 text-purple-500" />
                <div>
                  <p className="text-xs text-gray-600">Croissance</p>
                  <p className="text-sm font-semibold text-gray-900">+24%</p>
                </div>
              </div>
            </motion.div>
          </div>
        </div>

        {/* 3D depth shadow */}
        <div
          className="absolute inset-0 bg-gradient-to-br from-indigo-600/20 to-purple-600/20 rounded-2xl -z-10 blur-3xl"
          style={{ transform: "translateZ(-50px)" }}
        />
      </motion.div>
    </div>
  );
}
