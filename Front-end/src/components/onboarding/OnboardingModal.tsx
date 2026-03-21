"use client";

import { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Sparkles, Calendar, GraduationCap, Users, ChevronDown } from 'lucide-react';
import { useOnboarding } from '@/hooks/use-onboarding';

interface OnboardingModalProps {
  onComplete: (yearConfig?: { startMonth: string; durationMonths: number; schoolType: string }) => void;
  onSkip: () => void;
}

const MONTHS = [
  "Janvier","Février","Mars","Avril","Mai","Juin",
  "Juillet","Août","Septembre","Octobre","Novembre","Décembre",
];

/** Calcule le nom de l'année scolaire depuis le mois de rentrée et la date actuelle */
function computeYearName(startMonth: string): string {
  const now = new Date();
  const currentMonth = now.getMonth() + 1; // 1-12
  const startIdx = MONTHS.indexOf(startMonth) + 1; // 1-12
  const currentYear = now.getFullYear();
  // Si le mois de rentrée est déjà passé dans l'année civile en cours → ex: rentrée Sept 2025 → "2025-2026"
  // Si on est avant le mois de rentrée → ex: rentrée Sept, on est en Juin 2025 → "2024-2025"
  if (startIdx <= currentMonth) {
    return `${currentYear}-${currentYear + 1}`;
  } else {
    return `${currentYear - 1}-${currentYear}`;
  }
}

/**
 * Onboarding simplifié — guide l'utilisateur + configure l'année scolaire
 * Champ mois de rentrée + durée → transmis à handleOnboardingComplete dans dashboard/page.tsx
 */
export default function OnboardingModal({ onComplete, onSkip }: OnboardingModalProps) {
  const { markOnboardingComplete } = useOnboarding();
  const [startMonth, setStartMonth] = useState('Septembre');
  const [durationMonths, setDurationMonths] = useState(9);
  const [schoolType, setSchoolType] = useState<'private' | 'public'>('private');

  const yearName = computeYearName(startMonth);

  async function handleStart() {
    try {
      await markOnboardingComplete();
      onComplete({ startMonth, durationMonths, schoolType });
    } catch (error) {
      console.error('Failed to complete onboarding:', error);
      onComplete({ startMonth, durationMonths, schoolType });
    }
  }

  async function handleSkip() {
    try {
      await markOnboardingComplete();
      onSkip();
    } catch (error) {
      console.error('Failed to skip onboarding:', error);
      onSkip();
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4"
      onTouchMove={(e) => e.stopPropagation()}
    >
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl max-w-2xl w-full p-4 sm:p-6 relative border max-h-[92vh] overflow-y-auto"
      >
        <button
          onClick={handleSkip}
          className="absolute top-3 right-3 text-gray-400 hover:text-gray-700 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="text-center mb-4 sm:mb-5">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: 'spring' }}
            className="inline-flex items-center justify-center w-12 h-12 sm:w-16 sm:h-16 bg-blue-100 rounded-full mb-3"
          >
            <Sparkles className="w-6 h-6 sm:w-8 sm:h-8 text-blue-600" />
          </motion.div>

          <h2 className="text-xl sm:text-3xl font-bold text-gray-900 mb-1">
            Bienvenue sur Structura ! 🎉
          </h2>
          <p className="text-gray-600 text-sm sm:text-base">
            Configurez votre année scolaire pour commencer
          </p>
        </div>

        {/* ── Type d'école ── */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <button
            type="button"
            onClick={() => setSchoolType('private')}
            className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-colors text-left ${
              schoolType === 'private'
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-200 bg-white hover:bg-gray-50'
            }`}
          >
            <span className="text-2xl">🏫</span>
            <div>
              <p className="font-semibold text-sm text-gray-900">École privée</p>
              <p className="text-xs text-gray-500 mt-0.5">Frais mensuels / trimestriels</p>
            </div>
          </button>
          <button
            type="button"
            onClick={() => setSchoolType('public')}
            className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-colors text-left ${
              schoolType === 'public'
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-200 bg-white hover:bg-gray-50'
            }`}
          >
            <span className="text-2xl">🏛️</span>
            <div>
              <p className="font-semibold text-sm text-gray-900">École publique</p>
              <p className="text-xs text-gray-500 mt-0.5">Frais ponctuels configurables</p>
            </div>
          </button>
        </div>

        {/* ── Configuration de l'année scolaire ── */}
        <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4 mb-4 space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <Calendar className="w-5 h-5 text-blue-600 shrink-0" />
            <h3 className="font-bold text-gray-900">Votre année scolaire</h3>
            <span className="ml-auto text-sm font-semibold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
              {yearName}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Mois de rentrée */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Mois de rentrée
              </label>
              <div className="relative">
                <select
                  value={startMonth}
                  onChange={(e) => setStartMonth(e.target.value)}
                  className="w-full appearance-none bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-8"
                >
                  {MONTHS.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              </div>
            </div>

            {/* Durée */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Durée (mois de cours)
              </label>
              <div className="relative">
                <select
                  value={durationMonths}
                  onChange={(e) => setDurationMonths(Number(e.target.value))}
                  className="w-full appearance-none bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-8"
                >
                  {[6,7,8,9,10,11,12].map((n) => (
                    <option key={n} value={n}>{n} mois</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              </div>
            </div>
          </div>

          <p className="text-xs text-blue-700">
            📅 Année <strong>{yearName}</strong> · de <strong>{startMonth}</strong> · {durationMonths} mois de cours
          </p>
        </div>

        {/* ── Étapes suivantes ── */}
        <div className="space-y-2 mb-4">
          {[
            { icon: GraduationCap, label: 'Créez vos classes', sub: 'Classes → "Créer classes prédéfinies"' },
            { icon: Users, label: 'Ajoutez vos élèves', sub: 'Élèves → "Ajouter" ou "Importer CSV"' },
          ].map(({ icon: Icon, label, sub }, i) => (
            <div key={i} className="flex items-start gap-3 p-3 bg-gray-50 border border-gray-200 rounded-lg">
              <div className="shrink-0 w-8 h-8 bg-gray-400 rounded-full flex items-center justify-center text-white text-sm font-bold">
                {i + 2}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <Icon className="w-4 h-4 text-gray-500" />
                  <p className="font-semibold text-sm text-gray-900">{label}</p>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">📍 {sub}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 mb-4">
          <p className="text-xs sm:text-sm text-amber-900">
            💡 <span className="font-semibold">Important :</span> Suivez ces étapes dans l'ordre pour éviter les erreurs.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 pb-2">
          <button
            onClick={handleStart}
            className="flex-1 bg-blue-600 text-white px-4 py-3 rounded-lg hover:bg-blue-700 transition-colors font-semibold flex items-center justify-center gap-2 text-sm sm:text-base"
          >
            <Calendar className="w-4 h-4 sm:w-5 sm:h-5" />
            Créer l'année {yearName}
          </button>
          <button
            onClick={handleSkip}
            className="px-4 py-3 rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors font-semibold text-gray-900 text-sm sm:text-base"
          >
            Plus tard
          </button>
        </div>
      </motion.div>
    </div>
  );
}
