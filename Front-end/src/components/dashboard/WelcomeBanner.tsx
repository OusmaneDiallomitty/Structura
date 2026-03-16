"use client";

import { useState } from "react";
import { X, Users, UserPlus, Settings, CheckCircle2, ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

interface WelcomeBannerProps {
  organizationName: string;
  onDismiss: () => void;
}

export function WelcomeBanner({
  organizationName,
  onDismiss,
}: WelcomeBannerProps) {
  const [isClosing, setIsClosing] = useState(false);

  const handleDismiss = () => {
    setIsClosing(true);
    setTimeout(() => {
      onDismiss();
    }, 200);
  };

  const quickActions = [
    {
      icon: Users,
      title: "Ajouter des élèves",
      description: "Commencez par enregistrer vos premiers élèves",
      href: "/dashboard/students/add",
      badge: "Étape 1",
    },
    {
      icon: UserPlus,
      title: "Inviter votre équipe",
      description: "Collaborez avec vos enseignants",
      href: "/dashboard/team",
      badge: "Étape 2",
    },
    {
      icon: Settings,
      title: "Configurer les classes",
      description: "Ajoutez des sections et ajustez les capacités",
      href: "/dashboard/classes",
      badge: "Étape 3",
    },
  ];

  return (
    <div
      className={`relative bg-white border border-gray-200 rounded-2xl p-8 shadow-sm transition-all duration-200 ${
        isClosing ? "opacity-0 scale-[0.98]" : "opacity-100 scale-100"
      }`}
    >
      {/* Close button */}
      <button
        onClick={handleDismiss}
        className="absolute top-6 right-6 p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
        aria-label="Fermer"
      >
        <X className="h-4 w-4" />
      </button>

      {/* Header */}
      <div className="max-w-3xl">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-50 text-indigo-700 text-sm font-medium rounded-full mb-4">
          <Sparkles className="h-3.5 w-3.5" />
          Bienvenue
        </div>
        
        <h2 className="text-2xl font-semibold text-gray-900 mb-2">
          {organizationName} est prête
        </h2>

        <p className="text-gray-600 text-base leading-relaxed">
          Voici les prochaines étapes pour démarrer rapidement.
        </p>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
        {quickActions.map((action, index) => (
          <Link
            key={action.title}
            href={action.href}
            className="group relative"
          >
            <div className="h-full p-5 border border-gray-200 rounded-xl hover:border-gray-300 hover:shadow-sm transition-all duration-200 bg-white">
              {/* Badge */}
              <div className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-gray-100 text-gray-600 text-xs font-medium rounded mb-3">
                {action.badge}
              </div>

              {/* Icon */}
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 bg-gray-50 rounded-lg group-hover:bg-gray-100 transition-colors">
                  <action.icon className="h-5 w-5 text-gray-700" />
                </div>
                <h3 className="font-medium text-gray-900">
                  {action.title}
                </h3>
              </div>

              {/* Description */}
              <p className="text-sm text-gray-600 leading-relaxed mb-4">
                {action.description}
              </p>

              {/* CTA */}
              <div className="flex items-center gap-1.5 text-sm font-medium text-indigo-600 group-hover:text-indigo-700">
                <span>Commencer</span>
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between mt-6 pt-6 border-t border-gray-100">
        <p className="text-sm text-gray-500">
          Vous pourrez toujours modifier ces paramètres plus tard
        </p>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDismiss}
          className="text-gray-600 hover:text-gray-900"
        >
          Ne plus afficher
        </Button>
      </div>
    </div>
  );
}
