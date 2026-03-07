"use client";

import { useState, useEffect, useMemo } from "react";
import { Calendar, ChevronDown, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import * as storage from "@/lib/storage";
import {
  getCurrentAcademicYear,
  getAcademicYears,
  setCurrentAcademicYear,
  type AcademicYear,
} from "@/lib/api/academic-years.service";
import { NewYearWizard } from "./NewYearWizard";
import { useAuth } from "@/contexts/AuthContext";

export function CurrentYearBadge() {
  const { user } = useAuth();
  const isDirector = user?.role === "director";

  const [currentYear, setCurrentYear] = useState<AcademicYear | null>(null);
  const [allYears, setAllYears] = useState<AcademicYear[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  // Vrai si endDate est renseignée et dépassée
  const isExpired = useMemo(() => {
    if (!currentYear?.endDate) return false;
    return new Date(currentYear.endDate) < new Date();
  }, [currentYear]);

  useEffect(() => {
    loadCurrentYear();
    if (isDirector) loadAllYears();
  }, [isDirector]);

  async function loadCurrentYear() {
    try {
      const token = storage.getAuthItem("structura_token");
      if (!token) return;

      const year = await getCurrentAcademicYear(token);
      setCurrentYear(year);
    } catch {
      // Ignorer silencieusement : aucune année courante n'existe encore (normal au début)
      setCurrentYear(null);
    } finally {
      setIsLoading(false);
    }
  }

  async function loadAllYears() {
    try {
      const token = storage.getAuthItem("structura_token");
      if (!token) return;
      const years = await getAcademicYears(token);
      setAllYears(years);
    } catch {
      // Silencieux
    }
  }

  async function handleSwitchYear(yearId: string) {
    setIsSwitching(true);
    try {
      const token = storage.getAuthItem("structura_token");
      if (!token) {
        toast.error("Session expirée");
        return;
      }

      toast.loading("Changement d'année...", { id: "switch-year" });
      await setCurrentAcademicYear(token, yearId);
      toast.success("Année changée avec succès !", { id: "switch-year" });
      window.location.reload();
    } catch (error: any) {
      toast.error("Erreur lors du changement", {
        id: "switch-year",
        description: error.message,
      });
    } finally {
      setIsSwitching(false);
    }
  }

  function handleWizardSuccess() {
    loadCurrentYear();
    loadAllYears();
    setTimeout(() => window.location.reload(), 1000);
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-100">
        <Loader2 className="h-4 w-4 animate-spin text-gray-500" />
        <span className="text-sm text-gray-600">Chargement...</span>
      </div>
    );
  }

  // Aucune année scolaire créée — seul le directeur peut agir
  if (!currentYear) {
    if (!isDirector) {
      return (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-100">
          <Calendar className="h-4 w-4 text-gray-500" />
          <span className="text-sm text-gray-500">Aucune année</span>
        </div>
      );
    }

    return (
      <>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsWizardOpen(true)}
          className="gap-2 border-2 border-orange-300 bg-orange-50 hover:bg-orange-100 text-orange-700"
        >
          <Calendar className="h-4 w-4" />
          <span className="font-medium">Créer l'année scolaire</span>
        </Button>

        <NewYearWizard
          open={isWizardOpen}
          onOpenChange={setIsWizardOpen}
          currentYear={null}
          onSuccess={handleWizardSuccess}
        />
      </>
    );
  }

  // ── Badge lecture seule pour les membres (non-directeur) ─────────────────
  if (!isDirector) {
    return (
      <div
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border-2 ${
          isExpired
            ? "border-orange-300 bg-orange-50"
            : "border-blue-300 bg-blue-50"
        }`}
      >
        <Calendar className={`h-4 w-4 ${isExpired ? "text-orange-600" : "text-blue-600"}`} />
        <span className={`text-sm font-medium ${isExpired ? "text-orange-900" : "text-blue-900"}`}>
          {currentYear.name}
        </span>
      </div>
    );
  }

  // ── Contrôles complets pour le directeur ─────────────────────────────────
  return (
    <>
      {/* Bannière d'expiration — directeur uniquement */}
      {isExpired && !bannerDismissed && (
        <div className="fixed top-16 left-0 right-0 z-40 flex items-center justify-between gap-4 bg-orange-50 border-b-2 border-orange-300 px-4 py-2.5 shadow-sm">
          <div className="flex items-center gap-2 min-w-0">
            <AlertTriangle className="h-4 w-4 text-orange-600 shrink-0" />
            <p className="text-sm text-orange-900 truncate">
              <strong>L'année {currentYear.name} est terminée.</strong>{" "}
              <span className="hidden sm:inline">Créez la nouvelle année pour continuer à enregistrer les données.</span>
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="sm"
              className="bg-orange-600 hover:bg-orange-700 text-white text-xs h-7"
              onClick={() => setIsWizardOpen(true)}
            >
              Créer nouvelle année
            </Button>
            <button
              onClick={() => setBannerDismissed(true)}
              className="text-orange-400 hover:text-orange-600 text-lg leading-none"
              aria-label="Fermer"
            >
              ×
            </button>
          </div>
        </div>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            disabled={isSwitching}
            className={
              isExpired
                ? "gap-1.5 border-2 border-orange-400 bg-orange-50 hover:bg-orange-100 px-2 sm:px-3"
                : "gap-1.5 border-2 border-blue-300 bg-blue-50 hover:bg-blue-100 px-2 sm:px-3"
            }
          >
            {isExpired
              ? <AlertTriangle className="h-4 w-4 text-orange-600 shrink-0" />
              : <Calendar className="h-4 w-4 text-blue-600 shrink-0" />
            }
            <span className={`font-medium hidden sm:inline ${isExpired ? "text-orange-900" : "text-blue-900"}`}>
              {currentYear.name}
            </span>
            {isExpired && (
              <span className="text-[10px] font-semibold text-orange-600 bg-orange-100 px-1.5 py-0.5 rounded-full hidden sm:inline">
                Terminée
              </span>
            )}
            {!isSwitching && <ChevronDown className={`h-3 w-3 ${isExpired ? "text-orange-600" : "text-blue-600"}`} />}
            {isSwitching && (
              <Loader2 className={`h-3 w-3 animate-spin ${isExpired ? "text-orange-600" : "text-blue-600"}`} />
            )}
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-64">
          <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
            Année courante
          </div>
          <DropdownMenuItem className="flex items-center gap-2 bg-blue-50" disabled>
            <div className="flex-1">
              <p className="font-medium text-blue-900">{currentYear.name}</p>
              {currentYear._count && (
                <p className="text-xs text-blue-700">
                  {currentYear._count.classes} classes •{" "}
                  {currentYear._count.students} élèves
                </p>
              )}
            </div>
            <span className="text-blue-600">✓</span>
          </DropdownMenuItem>

          {allYears.filter((y) => y.id !== currentYear.id).length > 0 && (
            <>
              <DropdownMenuSeparator />
              <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                Autres années
              </div>
              {allYears
                .filter((y) => y.id !== currentYear.id)
                .map((year) => (
                  <DropdownMenuItem
                    key={year.id}
                    onClick={() => handleSwitchYear(year.id)}
                    className="flex items-center gap-2"
                  >
                    <div className="flex-1">
                      <p className="font-medium">{year.name}</p>
                      {year._count && (
                        <p className="text-xs text-muted-foreground">
                          {year._count.classes} classes •{" "}
                          {year._count.students} élèves
                        </p>
                      )}
                    </div>
                    {year.isArchived && (
                      <span className="text-xs text-amber-600">📦</span>
                    )}
                  </DropdownMenuItem>
                ))}
            </>
          )}

          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => setIsWizardOpen(true)}
            className="gap-2 text-blue-600 font-medium"
          >
            <span>🎓</span>
            Nouvelle année scolaire
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <NewYearWizard
        open={isWizardOpen}
        onOpenChange={setIsWizardOpen}
        currentYear={currentYear}
        onSuccess={handleWizardSuccess}
      />
    </>
  );
}
