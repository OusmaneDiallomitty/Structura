"use client";

import { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Sparkles, Calendar, GraduationCap, Users } from 'lucide-react';
import { useOnboarding } from '@/hooks/use-onboarding';

interface OnboardingModalProps {
  onComplete: () => void;
  onSkip: () => void;
}

/**
 * Onboarding simplifié - Mode production
 * Guide l'utilisateur vers le bon workflow : Année → Classes → Élèves
 * Ne crée plus de classes automatiquement pour éviter les doublons
 */
export default function OnboardingModal({ onComplete, onSkip }: OnboardingModalProps) {
  const { markOnboardingComplete } = useOnboarding();

  async function handleStart() {
    try {
      await markOnboardingComplete();
      onComplete(); // handleOnboardingComplete dans dashboard/page.tsx → /dashboard/classes
    } catch (error) {
      console.error('Failed to complete onboarding:', error);
      onComplete();
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-4 sm:p-8 relative border max-h-[90vh] overflow-y-auto"
      >
        <button
          onClick={handleSkip}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="text-center mb-8">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: 'spring' }}
            className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-4"
          >
            <Sparkles className="w-8 h-8 text-blue-600" />
          </motion.div>

          <h2 className="text-3xl font-bold text-gray-900 mb-2">
            Bienvenue sur Structura ! 🎉
          </h2>
          <p className="text-gray-600 text-lg">
            Votre plateforme de gestion scolaire est prête
          </p>
        </div>

        <div className="space-y-4 mb-8">
          {/* Étape 1 : Créer année académique */}
          <div className="flex items-start gap-4 p-4 bg-blue-50 border-2 border-blue-200 rounded-lg">
            <div className="flex-shrink-0 w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-white text-lg font-bold">
              1
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <Calendar className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-gray-900">Créez votre année académique</h3>
              </div>
              <p className="text-sm text-gray-700">
                Commencez par créer l'année scolaire (ex: 2025-2026)
              </p>
              <p className="text-xs text-blue-700 mt-1 font-medium">
                📍 Dashboard → "Créer l'année scolaire"
              </p>
            </div>
          </div>

          {/* Étape 2 : Créer classes */}
          <div className="flex items-start gap-4 p-4 bg-gray-50 border border-gray-200 rounded-lg">
            <div className="flex-shrink-0 w-10 h-10 bg-gray-400 rounded-full flex items-center justify-center text-white text-lg font-bold">
              2
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <GraduationCap className="w-5 h-5 text-gray-600" />
                <h3 className="font-bold text-gray-900">Créez vos classes</h3>
              </div>
              <p className="text-sm text-gray-600">
                Utilisez le système de classes prédéfinies (CP1, CP2, 7ème, etc.)
              </p>
              <p className="text-xs text-gray-500 mt-1 font-medium">
                📍 Classes → "Créer classes prédéfinies"
              </p>
            </div>
          </div>

          {/* Étape 3 : Ajouter élèves */}
          <div className="flex items-start gap-4 p-4 bg-gray-50 border border-gray-200 rounded-lg">
            <div className="flex-shrink-0 w-10 h-10 bg-gray-400 rounded-full flex items-center justify-center text-white text-lg font-bold">
              3
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <Users className="w-5 h-5 text-gray-600" />
                <h3 className="font-bold text-gray-900">Ajoutez vos élèves</h3>
              </div>
              <p className="text-sm text-gray-600">
                Importez ou ajoutez vos élèves manuellement
              </p>
              <p className="text-xs text-gray-500 mt-1 font-medium">
                📍 Élèves → "Ajouter" ou "Importer CSV"
              </p>
            </div>
          </div>
        </div>

        {/* Note importante */}
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 mb-6">
          <p className="text-sm text-amber-900">
            💡 <span className="font-semibold">Important :</span> Suivez ces étapes dans l'ordre
            pour éviter les erreurs. Chaque étape dépend de la précédente.
          </p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleStart}
            className="flex-1 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors font-semibold flex items-center justify-center gap-2"
          >
            <Calendar className="w-5 h-5" />
            Créer mon année académique
          </button>
          <button
            onClick={handleSkip}
            className="px-6 py-3 rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors font-semibold text-gray-900"
          >
            Plus tard
          </button>
        </div>
      </motion.div>
    </div>
  );
}
