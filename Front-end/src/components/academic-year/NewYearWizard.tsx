"use client";

import { useState } from "react";
import { Loader2, CheckCircle2, AlertTriangle, Info, ArrowRight, ChevronDown, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import * as storage from "@/lib/storage";
import {
  createAcademicYear,
  createNewYearWithTransition,
  StudentTransitionMode,
  type AcademicYear,
} from "@/lib/api/academic-years.service";

interface NewYearWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentYear: AcademicYear | null;
  onSuccess: () => void;
}

export function NewYearWizard({
  open,
  onOpenChange,
  currentYear,
  onSuccess,
}: NewYearWizardProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState<'form' | 'confirm'>('form');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    startDate: "",
    endDate: "",
    startMonth: currentYear?.startMonth ?? "Septembre",
    durationMonths: currentYear?.durationMonths ?? 9,
    transitionMode: StudentTransitionMode.PROMOTE,
  });

  // Calculer automatiquement la nouvelle année à partir de l'année courante
  const suggestedYearName = currentYear
    ? generateNextYearName(currentYear.name)
    : `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`;

  const yearOptions = generateYearOptions(suggestedYearName);

  // Pré-remplir le formulaire si non rempli
  if (open && !formData.name) {
    setFormData((prev) => ({
      ...prev,
      name: suggestedYearName,
    }));
  }

  /**
   * Validation du formulaire et passage à la confirmation
   * En production : toujours avertir l'utilisateur avant création
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation basique du nom
    if (!formData.name.trim()) {
      toast.error("Le nom de l'année est obligatoire");
      return;
    }

    // Si c'est la première année (pas d'année courante), créer directement
    if (!currentYear) {
      await handleConfirmCreate();
      return;
    }

    // Sinon, passer à l'étape de confirmation
    setStep('confirm');
  };

  /**
   * Création effective de l'année après confirmation
   * Production-ready : gestion d'erreurs complète, loading states, notifications
   */
  const handleConfirmCreate = async () => {
    setIsLoading(true);

    try {
      const token = storage.getAuthItem("structura_token");

      if (!token) {
        toast.error("Session expirée", {
          description: "Veuillez vous reconnecter",
        });
        return;
      }

      // Toast de chargement avec ID pour mise à jour
      toast.loading("Création de la nouvelle année scolaire...", {
        id: "new-year-creation",
      });

      // Création première année (simple)
      if (!currentYear) {
        const newYear = await createAcademicYear(token, {
          name: formData.name.trim(),
          startDate: formData.startDate || undefined,
          endDate: formData.endDate || undefined,
          startMonth: formData.startMonth || undefined,
          durationMonths: formData.durationMonths || undefined,
          isCurrent: true,
        });

        toast.success(`Année ${newYear.name} créée avec succès !`, {
          id: "new-year-creation",
          description: "Première année scolaire initialisée. Créez maintenant vos classes !",
          duration: 5000,
        });
      }
      // Création avec transition (archivage année actuelle)
      else {
        const result = await createNewYearWithTransition(token, {
          name: formData.name.trim(),
          startDate: formData.startDate || undefined,
          endDate: formData.endDate || undefined,
          startMonth: formData.startMonth || undefined,
          durationMonths: formData.durationMonths || undefined,
          studentTransitionMode: StudentTransitionMode.NONE,
        });

        toast.success(`Année ${result.newYear.name} créée avec succès !`, {
          id: "new-year-creation",
          description: `${result.summary.classesCreated} classes créées. L'année ${result.summary.oldYear} a été archivée.`,
          duration: 6000,
        });
      }

      // Fermer le dialog principal
      onOpenChange(false);

      // Callback de succès (recharger les données)
      onSuccess();

      // Reset du formulaire et du step
      setFormData({
        name: "",
        startDate: "",
        endDate: "",
        startMonth: "Septembre",
        durationMonths: 9,
        transitionMode: StudentTransitionMode.PROMOTE,
      });
      setStep('form');
    } catch (error: any) {
      console.error("[NewYearWizard] Erreur création année:", error);

      toast.error("Échec de la création", {
        id: "new-year-creation",
        description: error.message || "Une erreur est survenue. Vérifiez votre connexion.",
        duration: 6000,
      });

      // Retourner au formulaire en cas d'erreur
      setStep('form');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      if (!isOpen) {
        setStep('form');
        setAdvancedOpen(false);
      }
      onOpenChange(isOpen);
    }}>
      <DialogContent className="sm:max-w-lg flex flex-col max-h-[88vh]">
        {step === 'form' ? (
          // ÉTAPE 1 : Formulaire de saisie
          <>
            <DialogHeader className="flex-shrink-0">
              <DialogTitle>🎓 Nouvelle Année Scolaire</DialogTitle>
              <DialogDescription>
                Passez à l'année suivante en quelques clics
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 mt-1">
            {/* Zone scrollable */}
            <div className="flex-1 min-h-0 overflow-y-auto space-y-4 pr-1 pb-2">

              {/* ── Visuel AVANT → APRÈS ─────────────────────────────── */}
              <div className="grid grid-cols-[1fr,auto,1fr] items-center gap-3">

                {/* AVANT : année en cours */}
                <div className="rounded-xl border-2 border-gray-200 bg-gray-50 p-4 text-center">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">
                    En cours
                  </p>
                  <p className="text-base font-bold text-gray-800">
                    {currentYear?.name || "—"}
                  </p>
                  {currentYear?._count && (
                    <div className="mt-2 space-y-0.5">
                      <p className="text-xs text-gray-500">
                        {currentYear._count.classes} classe{currentYear._count.classes > 1 ? "s" : ""}
                      </p>
                      <p className="text-xs text-gray-500">
                        {currentYear._count.students} élève{currentYear._count.students > 1 ? "s" : ""}
                      </p>
                    </div>
                  )}
                  <span className="inline-block mt-2 text-[10px] px-2 py-0.5 rounded-full bg-gray-200 text-gray-500 font-medium">
                    Sera archivée
                  </span>
                </div>

                {/* Flèche */}
                <div className="flex items-center justify-center">
                  <ArrowRight className="h-5 w-5 text-blue-400" />
                </div>

                {/* APRÈS : nouvelle année à choisir */}
                <div className="rounded-xl border-2 border-blue-300 bg-blue-50 p-4 text-center space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-blue-500 mb-1">
                    Nouvelle année
                  </p>
                  <Select
                    value={formData.name}
                    onValueChange={(value) =>
                      setFormData({ ...formData, name: value })
                    }
                    disabled={isLoading}
                  >
                    <SelectTrigger className="border-blue-200 bg-white text-sm font-semibold">
                      <SelectValue placeholder="Sélectionner" />
                    </SelectTrigger>
                    <SelectContent>
                      {yearOptions.map((year) => (
                        <SelectItem key={year} value={year}>
                          {year}
                          {year === suggestedYearName && (
                            <span className="ml-2 text-xs text-blue-600 font-medium">
                              (suggérée)
                            </span>
                          )}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-blue-600">
                    Classes vides à remplir
                  </p>
                </div>
              </div>

              {/* ── Paramètres optionnels (collapsible) ─────────────── */}
              <div className="rounded-lg border border-gray-200 overflow-hidden">
                {/* En-tête cliquable */}
                <button
                  type="button"
                  onClick={() => setAdvancedOpen(!advancedOpen)}
                  disabled={isLoading}
                  className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Settings2 className="h-3.5 w-3.5 text-gray-400" />
                    <span className="text-sm font-medium text-gray-700">Paramètres</span>
                    {/* Résumé visible quand fermé */}
                    {!advancedOpen && (
                      <span className="text-xs text-gray-400">
                        · {formData.startMonth}, {formData.durationMonths} mois
                      </span>
                    )}
                  </div>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 text-gray-400 transition-transform duration-200",
                      advancedOpen && "rotate-180"
                    )}
                  />
                </button>

                {/* Contenu dépliable */}
                {advancedOpen && (
                  <div className="px-3 pb-4 pt-3 space-y-4 border-t border-gray-100 bg-gray-50/50">

                    {/* Dates optionnelles */}
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="startDate" className="text-xs">
                          Date de début <span className="text-muted-foreground">(optionnel)</span>
                        </Label>
                        <Input
                          id="startDate"
                          type="date"
                          value={formData.startDate}
                          onChange={(e) =>
                            setFormData({ ...formData, startDate: e.target.value })
                          }
                          className="text-sm"
                          disabled={isLoading}
                        />
                        <p className="text-[11px] text-muted-foreground">
                          À remplir quand vous connaissez la date
                        </p>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="endDate" className="text-xs">
                          Date de fin <span className="text-muted-foreground">(optionnel)</span>
                        </Label>
                        <Input
                          id="endDate"
                          type="date"
                          value={formData.endDate}
                          onChange={(e) =>
                            setFormData({ ...formData, endDate: e.target.value })
                          }
                          className="text-sm"
                          disabled={isLoading}
                        />
                        <p className="text-[11px] text-muted-foreground">
                          L'État annoncera la date officielle
                        </p>
                      </div>
                    </div>

                    {/* Calendrier scolaire */}
                    <div className="space-y-3 rounded-lg border border-blue-100 bg-blue-50/60 p-3">
                      <p className="text-xs font-bold uppercase tracking-widest text-blue-600">
                        Calendrier scolaire
                      </p>

                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label className="text-xs">Mois de rentrée</Label>
                          <Select
                            value={formData.startMonth}
                            onValueChange={(v) => setFormData({ ...formData, startMonth: v })}
                            disabled={isLoading}
                          >
                            <SelectTrigger className="border-blue-200 bg-white text-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {ALL_MONTHS_GREGORIAN.map((m) => (
                                <SelectItem key={m} value={m}>{m}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-1.5">
                          <Label className="text-xs">Durée de l'année</Label>
                          <Select
                            value={String(formData.durationMonths)}
                            onValueChange={(v) => setFormData({ ...formData, durationMonths: parseInt(v) })}
                            disabled={isLoading}
                          >
                            <SelectTrigger className="border-blue-200 bg-white text-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {[6, 7, 8, 9, 10, 11, 12].map((n) => (
                                <SelectItem key={n} value={String(n)}>{n} mois</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      {/* Aperçu T1/T2/T3 en temps réel */}
                      {(() => {
                        const groups = buildTrimestrePreview(formData.startMonth, formData.durationMonths, formData.name);
                        const offMonths = buildOffMonths(formData.startMonth, formData.durationMonths);
                        return (
                          <div className="space-y-1.5 pt-1 border-t border-blue-200">
                            <p className="text-[10px] font-semibold text-blue-600 uppercase tracking-wide">
                              Aperçu des trimestres
                            </p>
                            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                              {groups.map((g) => (
                                <div key={g.label} className="flex items-center gap-1.5">
                                  <span className="text-[11px] font-bold text-blue-700">{g.label} :</span>
                                  <span className="text-[11px] text-blue-800">{g.months.join(" · ")}</span>
                                </div>
                              ))}
                              {offMonths.length > 0 && (
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[11px] font-bold text-gray-400">HC :</span>
                                  <span className="text-[11px] text-gray-400">{offMonths.join(" · ")}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                )}
              </div>

              {/* ── Note élèves ──────────────────────────────────────── */}
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-amber-900">
                    Affectez les élèves <strong>manuellement</strong> dans leurs nouvelles classes selon leurs résultats.
                  </p>
                </div>
              </div>

            </div>{/* fin zone scrollable */}

            {/* Footer fixe — toujours visible */}
            <div className="flex-shrink-0 flex gap-3 justify-end pt-3 border-t mt-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isLoading}
              >
                Annuler
              </Button>
              <Button
                type="submit"
                disabled={isLoading}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Création en cours...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Créer l'année scolaire
                  </>
                )}
              </Button>
            </div>
          </form>
          </>
        ) : (
          // ÉTAPE 2 : Confirmation
          <>
            <DialogHeader className="flex-shrink-0">
              <DialogTitle className="flex items-center gap-2 text-lg">
                <Info className="h-5 w-5 text-blue-600" />
                Création d'une nouvelle année scolaire
              </DialogTitle>
              <DialogDescription>
                Vérifiez les informations avant de confirmer.
              </DialogDescription>
            </DialogHeader>

            {/* Zone scrollable */}
            <div className="flex-1 min-h-0 overflow-y-auto space-y-4 pr-1 py-1">

              {/* Année actuelle */}
              <div className="rounded-lg bg-blue-50 border border-blue-200 p-3">
                <p className="font-semibold text-blue-900 text-sm">
                  Année actuelle : {currentYear?.name}
                </p>
                <p className="text-sm text-blue-800 mt-1.5">
                  📊 {currentYear?._count?.students || 0} élèves •{" "}
                  {currentYear?._count?.classes || 0} classes
                </p>
                {currentYear?.endDate && (
                  <p className="text-sm text-blue-800 mt-1">
                    📅 Date de fin prévue :{" "}
                    {new Date(currentYear.endDate).toLocaleDateString("fr-FR", {
                      day: "2-digit",
                      month: "long",
                      year: "numeric",
                    })}
                  </p>
                )}
              </div>

              {/* Ce qui va se passer */}
              <div>
                <p className="font-semibold text-gray-900 mb-3 text-sm">
                  Voici ce qui va se passer :
                </p>
                <ul className="space-y-2.5">
                  <li className="flex items-start gap-2.5 text-sm">
                    <span className="flex-shrink-0 flex items-center justify-center w-5 h-5 rounded-full bg-orange-100 text-orange-700 font-semibold text-xs">1</span>
                    <span className="text-gray-700 pt-0.5">
                      L'année "<strong>{currentYear?.name}</strong>" sera <strong>archivée</strong>
                    </span>
                  </li>
                  <li className="flex items-start gap-2.5 text-sm">
                    <span className="flex-shrink-0 flex items-center justify-center w-5 h-5 rounded-full bg-orange-100 text-orange-700 font-semibold text-xs">2</span>
                    <span className="text-gray-700 pt-0.5">
                      L'année "<strong>{formData.name}</strong>" deviendra l'<strong>année courante</strong>
                    </span>
                  </li>
                  <li className="flex items-start gap-2.5 text-sm">
                    <span className="flex-shrink-0 flex items-center justify-center w-5 h-5 rounded-full bg-orange-100 text-orange-700 font-semibold text-xs">3</span>
                    <span className="text-gray-700 pt-0.5">
                      De <strong>nouvelles classes</strong> seront créées pour {formData.name}
                    </span>
                  </li>
                  <li className="flex items-start gap-2.5 text-sm">
                    <span className="flex-shrink-0 flex items-center justify-center w-5 h-5 rounded-full bg-orange-100 text-orange-700 font-semibold text-xs">4</span>
                    <span className="text-gray-700 pt-0.5">
                      Les <strong>élèves actuels</strong> resteront dans leurs classes de {currentYear?.name}
                    </span>
                  </li>
                  <li className="flex items-start gap-2.5 text-sm">
                    <span className="flex-shrink-0 flex items-center justify-center w-5 h-5 rounded-full bg-orange-100 text-orange-700 font-semibold text-xs">5</span>
                    <span className="text-gray-700 pt-0.5">
                      Le <strong>dashboard</strong> affichera les statistiques de {formData.name}
                    </span>
                  </li>
                </ul>
              </div>

              {/* Note importante */}
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
                <p className="text-sm text-amber-900">
                  💡 Vous pourrez toujours accéder aux données de{" "}
                  <strong>{currentYear?.name}</strong> en consultant les années archivées.
                </p>
              </div>
            </div>{/* fin zone scrollable */}

          {/* Footer fixe */}
          <div className="flex-shrink-0 flex gap-3 justify-end pt-3 border-t mt-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setStep('form')}
              disabled={isLoading}
            >
              ← Retour
            </Button>
            <Button
              type="button"
              onClick={handleConfirmCreate}
              disabled={isLoading}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Création...
                </>
              ) : (
                <>Créer "{formData.name}"</>
              )}
            </Button>
          </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Mois dans l'ordre grégorien (Janvier=0 … Décembre=11) */
const ALL_MONTHS_GREGORIAN = [
  "Janvier","Février","Mars","Avril","Mai","Juin",
  "Juillet","Août","Septembre","Octobre","Novembre","Décembre",
];

const MONTH_SHORT: Record<string, string> = {
  Janvier:"Jan", Février:"Fév", Mars:"Mar", Avril:"Avr",
  Mai:"Mai", Juin:"Jun", Juillet:"Jul", Août:"Aoû",
  Septembre:"Sep", Octobre:"Oct", Novembre:"Nov", Décembre:"Déc",
};

/**
 * Construit les groupes T1/T2/T3 avec l'année dans chaque mois.
 * yearName ex: "2026-2027" → startYear=2026
 * Résultat ex: T1: "Oct 2026 · Nov 2026 · Déc 2026"
 */
function buildTrimestrePreview(
  startMonth: string,
  durationMonths: number,
  yearName: string,
): { label: string; months: string[] }[] {
  const startIdx   = ALL_MONTHS_GREGORIAN.indexOf(startMonth);
  if (startIdx === -1) return [];
  const startYear  = parseInt(yearName.split("-")[0], 10) || new Date().getFullYear();
  const all: string[] = [];
  for (let i = 0; i < Math.min(durationMonths, 12); i++) {
    const monthIdx   = (startIdx + i) % 12;
    const yearOffset = Math.floor((startIdx + i) / 12);
    const m          = ALL_MONTHS_GREGORIAN[monthIdx];
    all.push(`${MONTH_SHORT[m] ?? m.slice(0, 3)} ${startYear + yearOffset}`);
  }
  const n = all.length;
  const t1e = Math.ceil(n / 3);
  const t2e = Math.ceil((n - t1e) / 2);
  return [
    { label: "T1", months: all.slice(0, t1e) },
    { label: "T2", months: all.slice(t1e, t1e + t2e) },
    { label: "T3", months: all.slice(t1e + t2e) },
  ].filter((g) => g.months.length > 0);
}

/** Retourne les mois hors calendrier scolaire (abréviations sans année) */
function buildOffMonths(startMonth: string, durationMonths: number): string[] {
  const startIdx = ALL_MONTHS_GREGORIAN.indexOf(startMonth);
  if (startIdx === -1) return [];
  const schoolSet = new Set<number>();
  for (let i = 0; i < Math.min(durationMonths, 12); i++) {
    schoolSet.add((startIdx + i) % 12);
  }
  return ALL_MONTHS_GREGORIAN
    .filter((_, idx) => !schoolSet.has(idx))
    .map((m) => MONTH_SHORT[m] ?? m.slice(0, 3));
}

/**
 * Générer le nom de la prochaine année
 * Ex: "2025-2026" → "2026-2027"
 */
function generateNextYearName(currentName: string): string {
  const match = currentName.match(/(\d{4})-(\d{4})/);
  if (match) {
    const startYear = parseInt(match[1], 10);
    const endYear = parseInt(match[2], 10);
    return `${startYear + 1}-${endYear + 1}`;
  }
  // Fallback
  const currentYear = new Date().getFullYear();
  return `${currentYear}-${currentYear + 1}`;
}

/**
 * Générer la liste des années scolaires à proposer dans le select
 * Génère 3 ans avant et 2 ans après l'année suggérée
 */
function generateYearOptions(suggestedName: string): string[] {
  const match = suggestedName.match(/(\d{4})/);
  const baseYear = match ? parseInt(match[1], 10) : new Date().getFullYear();
  return [-3, -2, -1, 0, 1, 2].map((offset) => {
    const y = baseYear + offset;
    return `${y}-${y + 1}`;
  });
}

/**
 * Générer les dates de la prochaine année
 */
function generateNextYearDates(currentEndDate: string): {
  startDate: string;
  endDate: string;
} {
  const endDate = new Date(currentEndDate);
  const nextStartDate = new Date(endDate);
  nextStartDate.setDate(nextStartDate.getDate() + 1); // Jour après la fin

  const nextEndDate = new Date(nextStartDate);
  nextEndDate.setFullYear(nextEndDate.getFullYear() + 1);
  nextEndDate.setDate(nextEndDate.getDate() - 1); // Un an moins un jour

  return {
    startDate: nextStartDate.toISOString().split("T")[0],
    endDate: nextEndDate.toISOString().split("T")[0],
  };
}
