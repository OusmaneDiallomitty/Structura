"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  CheckCircle2,
  Loader2,
  GraduationCap,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  APP_NAME,
  SCHOOL_LEVELS,
  SCHOOL_LEVEL_LABELS,
  ROUTES,
} from "@/lib/constants";
import type { SchoolLevel } from "@/types";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import * as storage from "@/lib/storage";

export default function SchoolOnboardingPage() {
  const router = useRouter();
  const { user, updateUser } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [selectedLevels, setSelectedLevels] = useState<SchoolLevel[]>([]);

  // Récupérer le pays depuis l'inscription
  const [userCountry, setUserCountry] = useState("GN");
  const [orgName, setOrgName] = useState("");

  useState(() => {
    // Récupérer les infos stockées lors de l'inscription
    const country = storage.getItem("onboarding_country") || "GN";
    const name = storage.getItem("onboarding_org_name") || "votre école";
    setUserCountry(country);
    setOrgName(name);
  });

  const toggleLevel = (level: SchoolLevel) => {
    setSelectedLevels((prev) =>
      prev.includes(level)
        ? prev.filter((l) => l !== level)
        : [...prev, level]
    );
  };

  const handleSubmit = async () => {
    if (selectedLevels.length === 0) return;

    setIsLoading(true);

    try {
      // Calculer le nombre total de classes qui seront créées
      const totalClasses = selectedLevels.reduce((total, level) => {
        const countryLevels =
          SCHOOL_LEVELS[userCountry as keyof typeof SCHOOL_LEVELS] ||
          SCHOOL_LEVELS.DEFAULT;
        return total + countryLevels[level].length;
      }, 0);

      // TODO: Appel API pour créer les classes automatiquement
      // Le backend va générer toutes les classes selon le pays et les niveaux sélectionnés
      await new Promise((resolve) => setTimeout(resolve, 2000));

      console.log("Niveaux sélectionnés:", selectedLevels);
      console.log("Pays:", userCountry);
      console.log("Classes à créer automatiquement par le backend:", totalClasses);

      // Stocker le nombre de classes créées pour le banner de bienvenue
      storage.setItem("onboarding_classes_created", totalClasses.toString());

      // Marquer l'onboarding comme complété
      await updateUser({ onboardingCompleted: true });

      // Nettoyer le localStorage après onboarding (sauf classes_created)
      storage.removeItem("onboarding_org_type");
      // On garde onboarding_org_name pour le banner
      storage.removeItem("onboarding_country");

      // Toast de succès
      toast.success("Espace créé avec succès !", {
        description: `${totalClasses} classes créées. Bienvenue dans ${orgName} !`,
      });

      // Redirection vers le dashboard
      router.push(ROUTES.DASHBOARD);
    } catch (error) {
      console.error("Erreur:", error);
      toast.error("Erreur", {
        description: "Une erreur est survenue. Veuillez réessayer.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 py-12 bg-gradient-to-br from-slate-50 via-indigo-50/30 to-violet-50/20 relative overflow-hidden">
      {/* Decorative elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-gradient-to-br from-indigo-400/20 to-violet-400/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-gradient-to-tr from-blue-400/20 to-indigo-400/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
      </div>

      <div className="w-full max-w-2xl space-y-6 animate-in fade-in duration-700 relative z-10">
        {/* Header */}
        <div className="text-center space-y-4 animate-in fade-in slide-in-from-top-4 duration-700">
          <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-indigo-600 via-indigo-700 to-violet-700 flex items-center justify-center shadow-xl mx-auto transition-all duration-300 hover:scale-110 hover:shadow-2xl hover:shadow-indigo-500/50">
            <GraduationCap className="h-9 w-9 text-white" />
          </div>
          <div>
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight bg-gradient-to-r from-indigo-600 via-violet-600 to-indigo-800 bg-clip-text text-transparent">
              {orgName || "Votre École"}
            </h1>
            <p className="text-base text-gray-600 mt-2">
              Dernière étape : sélectionnez vos niveaux
            </p>
          </div>
        </div>

        {/* Card principale */}
        <Card className="border-0 shadow-2xl bg-white/90 backdrop-blur-xl animate-in fade-in slide-in-from-bottom-4 ring-1 ring-gray-200/50">
          <CardHeader className="space-y-2 pb-6">
            <CardTitle className="text-2xl md:text-3xl font-bold text-gray-900">
              Quels niveaux proposez-vous ?
            </CardTitle>
            <CardDescription className="text-base text-gray-600">
              Sélectionnez tous les niveaux de votre école. Nous créerons automatiquement toutes les classes pour vous. ⚡
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 p-8">
            {/* Liste des niveaux */}
            <div className="space-y-3">
              {(Object.keys(SCHOOL_LEVEL_LABELS) as SchoolLevel[]).map(
                (level) => {
                  const countryLevels =
                    SCHOOL_LEVELS[userCountry as keyof typeof SCHOOL_LEVELS] ||
                    SCHOOL_LEVELS.DEFAULT;
                  const levelClasses = countryLevels[level];

                  return (
                    <div
                      key={level}
                      className={`flex items-start space-x-3 p-5 rounded-xl border-2 transition-all duration-200 cursor-pointer hover:border-indigo-400 hover:shadow-lg ${
                        selectedLevels.includes(level)
                          ? "border-indigo-600 bg-indigo-50 shadow-md ring-2 ring-indigo-600/20"
                          : "border-gray-200 bg-white hover:bg-gray-50"
                      }`}
                      onClick={() => toggleLevel(level)}
                    >
                      <Checkbox
                        id={level}
                        checked={selectedLevels.includes(level)}
                        onCheckedChange={() => toggleLevel(level)}
                        className="mt-1"
                      />
                      <div className="flex-1 min-w-0">
                        <Label
                          htmlFor={level}
                          className="text-base font-semibold cursor-pointer block text-gray-900"
                        >
                          {SCHOOL_LEVEL_LABELS[level]}
                        </Label>
                        <p className="text-sm text-gray-600 mt-1 break-words">
                          {levelClasses.join(", ")}
                        </p>
                        {selectedLevels.includes(level) && (
                          <p className="text-xs text-indigo-700 font-semibold mt-2 flex items-center gap-1">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            {levelClasses.length} classe
                            {levelClasses.length > 1 ? "s" : ""} seront créées
                          </p>
                        )}
                      </div>
                    </div>
                  );
                }
              )}
            </div>

            {/* Message si aucun niveau sélectionné */}
            {selectedLevels.length === 0 && (
              <div className="text-center py-8 px-4 bg-gray-50 rounded-xl border-2 border-dashed border-gray-300">
                <p className="text-sm text-gray-600 font-medium">
                  👆 Sélectionnez au moins un niveau pour continuer
                </p>
              </div>
            )}

            {/* Récapitulatif */}
            {selectedLevels.length > 0 && (
              <div className="bg-gradient-to-r from-indigo-50 to-violet-50 border-2 border-indigo-200 rounded-xl p-5 space-y-3 animate-in fade-in slide-in-from-bottom-2">
                <h4 className="font-bold text-base flex items-center gap-2 text-indigo-900">
                  <CheckCircle2 className="h-5 w-5 text-indigo-600" />
                  Récapitulatif
                </h4>
                <div className="text-sm text-gray-700 space-y-2">
                  <p className="flex items-center gap-2">
                    <span className="font-semibold text-indigo-700">
                      {selectedLevels.length}
                    </span>{" "}
                    niveau{selectedLevels.length > 1 ? "x" : ""} sélectionné
                    {selectedLevels.length > 1 ? "s" : ""}
                  </p>
                  <p className="flex items-center gap-2">
                    <span className="font-semibold text-indigo-700">
                      {selectedLevels.reduce((total, level) => {
                        const countryLevels =
                          SCHOOL_LEVELS[
                            userCountry as keyof typeof SCHOOL_LEVELS
                          ] || SCHOOL_LEVELS.DEFAULT;
                        return total + countryLevels[level].length;
                      }, 0)}
                    </span>{" "}
                    classes seront créées automatiquement
                  </p>
                  <div className="flex items-start gap-2 mt-3 pt-3 border-t border-indigo-200">
                    <span className="text-lg">💡</span>
                    <p className="text-xs text-indigo-700 font-medium">
                      Vous pourrez ajouter des sections (A, B, C) et personnaliser depuis le tableau de bord
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Bouton de soumission */}
            <Button
              onClick={handleSubmit}
              disabled={selectedLevels.length === 0 || isLoading}
              className="w-full h-14 text-base bg-gradient-to-r from-indigo-600 via-indigo-700 to-violet-700 hover:from-indigo-700 hover:via-indigo-800 hover:to-violet-800 font-bold shadow-xl hover:shadow-2xl hover:shadow-indigo-500/50 transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98]"
              size="lg"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Création de votre espace...
                </>
              ) : (
                <>
                  <CheckCircle2 className="mr-2 h-5 w-5" />
                  Créer mon espace maintenant
                </>
              )}
            </Button>

            {/* Note informative */}
            <div className="text-center pt-2">
              <p className="text-xs text-gray-500 px-4">
                ⚡ Cette étape prend moins de 30 secondes
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
