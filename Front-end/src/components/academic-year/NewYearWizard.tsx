"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Info,
  ArrowRight,
  ChevronDown,
  Settings2,
  ArrowLeft,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  getPromotionPreview,
  StudentTransitionMode,
  type AcademicYear,
  type PromotionPreviewClass,
  type PromotionDecision,
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
  const [step, setStep] = useState<"promotion" | "form" | "confirm">(
    currentYear ? "promotion" : "form"
  );
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    startDate: "",
    endDate: "",
    startMonth: currentYear?.startMonth ?? "Septembre",
    durationMonths: currentYear?.durationMonths ?? 9,
    transitionMode: StudentTransitionMode.PROMOTE,
  });

  // État promotion
  const [promotionData, setPromotionData] = useState<PromotionPreviewClass[]>(
    []
  );
  const [studentDecisions, setStudentDecisions] = useState<
    Record<string, PromotionDecision>
  >({});
  const [isLoadingPromotion, setIsLoadingPromotion] = useState(false);
  const [promotionError, setPromotionError] = useState<string | null>(null);

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

  // Charger la promotion preview quand le dialog s'ouvre avec une année courante
  const loadPromotionPreview = useCallback(async () => {
    if (!currentYear) return;
    setIsLoadingPromotion(true);
    setPromotionError(null);
    try {
      const token = storage.getAuthItem("structura_token");
      if (!token) return;
      const data = await getPromotionPreview(token);
      setPromotionData(data);
      // Initialiser les décisions avec les suggestions du backend
      const initialDecisions: Record<string, PromotionDecision> = {};
      for (const cls of data) {
        for (const student of cls.students) {
          initialDecisions[student.id] = student.suggestedDecision;
        }
      }
      setStudentDecisions(initialDecisions);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setPromotionError(message);
    } finally {
      setIsLoadingPromotion(false);
    }
  }, [currentYear]);

  // Reset le step à chaque ouverture selon l'état de currentYear
  // (important si l'user crée la 1ère année puis rouvre le wizard)
  useEffect(() => {
    if (open) {
      setStep(currentYear ? "promotion" : "form");
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (open && currentYear) {
      loadPromotionPreview();
    }
  }, [open, currentYear, loadPromotionPreview]);

  // Reset quand le dialog se ferme
  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setStep(currentYear ? "promotion" : "form");
      setAdvancedOpen(false);
      setPromotionData([]);
      setStudentDecisions({});
      setPromotionError(null);
      setFormData({
        name: "",
        startDate: "",
        endDate: "",
        startMonth: currentYear?.startMonth ?? "Septembre",
        durationMonths: currentYear?.durationMonths ?? 9,
        transitionMode: StudentTransitionMode.PROMOTE,
      });
    }
    onOpenChange(isOpen);
  };

  // Changer la décision d'un élève
  const setDecision = (studentId: string, decision: PromotionDecision) => {
    setStudentDecisions((prev) => ({ ...prev, [studentId]: decision }));
  };

  // Compter les décisions
  const decisionCounts = Object.values(studentDecisions).reduce(
    (acc, d) => {
      acc[d] = (acc[d] ?? 0) + 1;
      return acc;
    },
    {} as Record<PromotionDecision, number>
  );

  /**
   * Validation du formulaire et passage à la confirmation
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      toast.error("Le nom de l'année est obligatoire");
      return;
    }

    if (!currentYear) {
      await handleConfirmCreate();
      return;
    }

    setStep("confirm");
  };

  /**
   * Création effective de l'année après confirmation
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
          description:
            "Première année scolaire initialisée. Créez maintenant vos classes !",
          duration: 5000,
        });
      }
      // Création avec transition (archivage année actuelle)
      else {
        const decisionsArray = Object.entries(studentDecisions).map(
          ([studentId, decision]) => ({ studentId, decision })
        );

        const result = await createNewYearWithTransition(token, {
          name: formData.name.trim(),
          startDate: formData.startDate || undefined,
          endDate: formData.endDate || undefined,
          startMonth: formData.startMonth || undefined,
          durationMonths: formData.durationMonths || undefined,
          studentTransitionMode: StudentTransitionMode.PROMOTE,
          studentDecisions:
            decisionsArray.length > 0 ? decisionsArray : undefined,
        });

        toast.success(`Année ${result.newYear.name} créée avec succès !`, {
          id: "new-year-creation",
          description: `${result.summary.classesCreated} classes créées. L'année ${result.summary.oldYear} a été archivée.`,
          duration: 6000,
        });
      }

      onOpenChange(false);
      onSuccess();

      setFormData({
        name: "",
        startDate: "",
        endDate: "",
        startMonth: "Septembre",
        durationMonths: 9,
        transitionMode: StudentTransitionMode.PROMOTE,
      });
      setStep(currentYear ? "promotion" : "form");
      setStudentDecisions({});
      setPromotionData([]);
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : "Une erreur est survenue. Vérifiez votre connexion.";
      console.error("[NewYearWizard] Erreur création année:", error);

      toast.error("Échec de la création", {
        id: "new-year-creation",
        description: message,
        duration: 6000,
      });

      setStep("form");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl flex flex-col max-h-[90vh]">
        {/* ── ÉTAPE 1 : Promotion par élève ────────────────────────── */}
        {step === "promotion" && (
          <>
            <DialogHeader className="flex-shrink-0">
              <DialogTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-blue-600" />
                Décisions de promotion
              </DialogTitle>
              <DialogDescription>
                Définissez le devenir de chaque élève avant de passer à la
                nouvelle année scolaire.
              </DialogDescription>
            </DialogHeader>

            {/* Zone scrollable */}
            <div className="flex-1 min-h-0 overflow-y-auto pr-1 pb-2 mt-1">
              {isLoadingPromotion ? (
                <PromotionSkeleton />
              ) : promotionError ||
                promotionData.length === 0 ? (
                <div className="rounded-lg bg-blue-50 border border-blue-200 p-4 flex items-start gap-3">
                  <Info className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-blue-900">
                      Aucune note disponible
                    </p>
                    <p className="text-sm text-blue-700 mt-1">
                      Les compositions n'ont pas encore été saisies. Tous les
                      élèves seront promus par défaut dans la nouvelle année.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {promotionData.map((cls) => (
                    <ClassPromotionBlock
                      key={cls.classId}
                      cls={cls}
                      studentDecisions={studentDecisions}
                      setDecision={setDecision}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Footer fixe */}
            <div className="flex-shrink-0 flex gap-3 justify-between pt-3 border-t mt-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isLoading}
              >
                Annuler
              </Button>
              <Button
                type="button"
                onClick={() => setStep("form")}
                disabled={isLoadingPromotion}
                className="bg-blue-600 hover:bg-blue-700"
              >
                Suivant
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </>
        )}

        {/* ── ÉTAPE 2 : Formulaire ────────────────────────────────── */}
        {step === "form" && (
          <>
            <DialogHeader className="flex-shrink-0">
              <DialogTitle>Nouvelle Année Scolaire</DialogTitle>
              <DialogDescription>
                Passez à l'année suivante en quelques clics
              </DialogDescription>
            </DialogHeader>

            <form
              onSubmit={handleSubmit}
              className="flex flex-col flex-1 min-h-0 mt-1"
            >
              {/* Zone scrollable */}
              <div className="flex-1 min-h-0 overflow-y-auto space-y-4 pr-1 pb-2">
                {/* ── Visuel AVANT → APRÈS ───────────────────────────── */}
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
                          {currentYear._count.classes} classe
                          {currentYear._count.classes > 1 ? "s" : ""}
                        </p>
                        <p className="text-xs text-gray-500">
                          {currentYear._count.students} élève
                          {currentYear._count.students > 1 ? "s" : ""}
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

                {/* ── Paramètres optionnels (collapsible) ─────────── */}
                <div className="rounded-lg border border-gray-200 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setAdvancedOpen(!advancedOpen)}
                    disabled={isLoading}
                    className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Settings2 className="h-3.5 w-3.5 text-gray-400" />
                      <span className="text-sm font-medium text-gray-700">
                        Paramètres
                      </span>
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

                  {advancedOpen && (
                    <div className="px-3 pb-4 pt-3 space-y-4 border-t border-gray-100 bg-gray-50/50">
                      {/* Dates optionnelles */}
                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label htmlFor="startDate" className="text-xs">
                            Date de début{" "}
                            <span className="text-muted-foreground">
                              (optionnel)
                            </span>
                          </Label>
                          <Input
                            id="startDate"
                            type="date"
                            value={formData.startDate}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                startDate: e.target.value,
                              })
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
                            Date de fin{" "}
                            <span className="text-muted-foreground">
                              (optionnel)
                            </span>
                          </Label>
                          <Input
                            id="endDate"
                            type="date"
                            value={formData.endDate}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                endDate: e.target.value,
                              })
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
                              onValueChange={(v) =>
                                setFormData({ ...formData, startMonth: v })
                              }
                              disabled={isLoading}
                            >
                              <SelectTrigger className="border-blue-200 bg-white text-sm">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {ALL_MONTHS_GREGORIAN.map((m) => (
                                  <SelectItem key={m} value={m}>
                                    {m}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="space-y-1.5">
                            <Label className="text-xs">Durée de l'année</Label>
                            <Select
                              value={String(formData.durationMonths)}
                              onValueChange={(v) =>
                                setFormData({
                                  ...formData,
                                  durationMonths: parseInt(v),
                                })
                              }
                              disabled={isLoading}
                            >
                              <SelectTrigger className="border-blue-200 bg-white text-sm">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {[6, 7, 8, 9, 10, 11, 12].map((n) => (
                                  <SelectItem key={n} value={String(n)}>
                                    {n} mois
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        {/* Aperçu T1/T2/T3 en temps réel */}
                        {(() => {
                          const groups = buildTrimestrePreview(
                            formData.startMonth,
                            formData.durationMonths,
                            formData.name
                          );
                          const offMonths = buildOffMonths(
                            formData.startMonth,
                            formData.durationMonths
                          );
                          return (
                            <div className="space-y-1.5 pt-1 border-t border-blue-200">
                              <p className="text-[10px] font-semibold text-blue-600 uppercase tracking-wide">
                                Aperçu des trimestres
                              </p>
                              <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                                {groups.map((g) => (
                                  <div
                                    key={g.label}
                                    className="flex items-center gap-1.5"
                                  >
                                    <span className="text-[11px] font-bold text-blue-700">
                                      {g.label} :
                                    </span>
                                    <span className="text-[11px] text-blue-800">
                                      {g.months.join(" · ")}
                                    </span>
                                  </div>
                                ))}
                                {offMonths.length > 0 && (
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[11px] font-bold text-gray-400">
                                      HC :
                                    </span>
                                    <span className="text-[11px] text-gray-400">
                                      {offMonths.join(" · ")}
                                    </span>
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
              </div>
              {/* fin zone scrollable */}

              {/* Footer fixe */}
              <div className="flex-shrink-0 flex gap-3 justify-between pt-3 border-t mt-3">
                {currentYear ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setStep("promotion")}
                    disabled={isLoading}
                  >
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Retour
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => onOpenChange(false)}
                    disabled={isLoading}
                  >
                    Annuler
                  </Button>
                )}
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
                  ) : currentYear ? (
                    <>
                      Suivant
                      <ArrowRight className="h-4 w-4 ml-2" />
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
        )}

        {/* ── ÉTAPE 3 : Confirmation ──────────────────────────────── */}
        {step === "confirm" && (
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
                  {currentYear?._count?.students || 0} élèves •{" "}
                  {currentYear?._count?.classes || 0} classes
                </p>
                {currentYear?.endDate && (
                  <p className="text-sm text-blue-800 mt-1">
                    Date de fin prévue :{" "}
                    {new Date(currentYear.endDate).toLocaleDateString("fr-FR", {
                      day: "2-digit",
                      month: "long",
                      year: "numeric",
                    })}
                  </p>
                )}
              </div>

              {/* Résumé des décisions de promotion */}
              {Object.keys(studentDecisions).length > 0 && (
                <div className="rounded-lg border border-gray-200 p-3 space-y-2">
                  <p className="text-sm font-semibold text-gray-800">
                    Résumé des décisions de promotion
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {(decisionCounts.promote ?? 0) > 0 && (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-100 text-green-800 text-sm font-medium">
                        ⬆ {decisionCounts.promote} promu
                        {(decisionCounts.promote ?? 0) > 1 ? "s" : ""}
                      </span>
                    )}
                    {(decisionCounts.repeat ?? 0) > 0 && (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-100 text-orange-800 text-sm font-medium">
                        🔄 {decisionCounts.repeat} redoublant
                        {(decisionCounts.repeat ?? 0) > 1 ? "s" : ""}
                      </span>
                    )}
                    {(decisionCounts.graduate ?? 0) > 0 && (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-100 text-blue-800 text-sm font-medium">
                        🎓 {decisionCounts.graduate} diplômé
                        {(decisionCounts.graduate ?? 0) > 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Ce qui va se passer */}
              <div>
                <p className="font-semibold text-gray-900 mb-3 text-sm">
                  Voici ce qui va se passer :
                </p>
                <ul className="space-y-2.5">
                  {[
                    <>
                      L'année "<strong>{currentYear?.name}</strong>" sera{" "}
                      <strong>archivée</strong>
                    </>,
                    <>
                      L'année "<strong>{formData.name}</strong>" deviendra
                      l'<strong>année courante</strong>
                    </>,
                    <>
                      De <strong>nouvelles classes</strong> seront créées pour{" "}
                      {formData.name}
                    </>,
                    <>
                      Les <strong>élèves</strong> seront affectés selon vos
                      décisions de promotion
                    </>,
                    <>
                      Le <strong>dashboard</strong> affichera les statistiques
                      de {formData.name}
                    </>,
                  ].map((text, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm">
                      <span className="flex-shrink-0 flex items-center justify-center w-5 h-5 rounded-full bg-orange-100 text-orange-700 font-semibold text-xs">
                        {i + 1}
                      </span>
                      <span className="text-gray-700 pt-0.5">{text}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Note importante */}
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
                <p className="text-sm text-amber-900">
                  Vous pourrez toujours accéder aux données de{" "}
                  <strong>{currentYear?.name}</strong> en consultant les années
                  archivées.
                </p>
              </div>
            </div>
            {/* fin zone scrollable */}

            {/* Footer fixe */}
            <div className="flex-shrink-0 flex gap-3 justify-between pt-3 border-t mt-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep("form")}
                disabled={isLoading}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Retour
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

// ── Composant bloc classe ──────────────────────────────────────────────────

interface ClassPromotionBlockProps {
  cls: PromotionPreviewClass;
  studentDecisions: Record<string, PromotionDecision>;
  setDecision: (studentId: string, decision: PromotionDecision) => void;
}

function ClassPromotionBlock({
  cls,
  studentDecisions,
  setDecision,
}: ClassPromotionBlockProps) {
  return (
    <div className="rounded-lg border border-gray-200 overflow-hidden">
      {/* En-tête classe */}
      <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-800">
            {cls.className}
          </span>
          {cls.nextClassName && (
            <>
              <ArrowRight className="h-3.5 w-3.5 text-gray-400" />
              <span className="text-sm text-gray-500">{cls.nextClassName}</span>
            </>
          )}
        </div>
        <span className="text-xs text-gray-500">
          {cls.students.length} élève{cls.students.length > 1 ? "s" : ""}
        </span>
      </div>

      {/* Liste élèves */}
      <div className="divide-y divide-gray-100">
        {cls.students.map((student) => {
          const decision = studentDecisions[student.id] ?? student.suggestedDecision;
          const avg = student.finalAverage;
          const max = student.scoreMax ?? 20;
          return (
            <div
              key={student.id}
              className="flex items-center gap-3 px-3 py-2.5"
            >
              {/* Identité */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {student.firstName} {student.lastName}
                </p>
                {student.matricule && (
                  <p className="text-xs text-gray-400">{student.matricule}</p>
                )}
              </div>

              {/* Moyenne */}
              <div className="flex-shrink-0 w-20 text-right">
                {avg !== null ? (
                  <span
                    className={cn(
                      "text-sm font-semibold tabular-nums",
                      avg >= max / 2 ? "text-green-600" : "text-red-500"
                    )}
                  >
                    {avg.toFixed(2)}/{max}
                  </span>
                ) : (
                  <span className="text-xs text-gray-400">—</span>
                )}
              </div>

              {/* Boutons décision */}
              <div className="flex-shrink-0 flex items-center gap-1">
                <DecisionButton
                  active={decision === "promote"}
                  color="green"
                  onClick={() => setDecision(student.id, "promote")}
                  label="⬆ Promouvoir"
                />
                <DecisionButton
                  active={decision === "repeat"}
                  color="orange"
                  onClick={() => setDecision(student.id, "repeat")}
                  label="🔄 Redoubler"
                />
                <DecisionButton
                  active={decision === "graduate"}
                  color="blue"
                  onClick={() => setDecision(student.id, "graduate")}
                  label="🎓 Diplômé"
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Bouton de décision ─────────────────────────────────────────────────────

interface DecisionButtonProps {
  active: boolean;
  color: "green" | "orange" | "blue";
  onClick: () => void;
  label: string;
}

const COLOR_CLASSES: Record<
  DecisionButtonProps["color"],
  { active: string; inactive: string }
> = {
  green: {
    active: "bg-green-500 text-white border-green-600",
    inactive:
      "bg-white text-gray-500 border-gray-200 hover:border-green-300 hover:text-green-600",
  },
  orange: {
    active: "bg-orange-500 text-white border-orange-600",
    inactive:
      "bg-white text-gray-500 border-gray-200 hover:border-orange-300 hover:text-orange-600",
  },
  blue: {
    active: "bg-blue-500 text-white border-blue-600",
    inactive:
      "bg-white text-gray-500 border-gray-200 hover:border-blue-300 hover:text-blue-600",
  },
};

function DecisionButton({ active, color, onClick, label }: DecisionButtonProps) {
  const classes = COLOR_CLASSES[color];
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "text-[11px] font-medium px-2 py-1 rounded border transition-colors whitespace-nowrap",
        active ? classes.active : classes.inactive
      )}
    >
      {label}
    </button>
  );
}

// ── Skeleton chargement promotion ─────────────────────────────────────────

function PromotionSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2].map((i) => (
        <div key={i} className="rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 flex items-center gap-2">
            <Loader2 className="h-4 w-4 text-gray-400 animate-spin" />
            <div className="h-4 w-32 bg-gray-200 rounded animate-pulse" />
          </div>
          <div className="divide-y divide-gray-100">
            {[1, 2, 3].map((j) => (
              <div key={j} className="flex items-center gap-3 px-3 py-2.5">
                <div className="flex-1 space-y-1.5">
                  <div className="h-3.5 w-40 bg-gray-200 rounded animate-pulse" />
                  <div className="h-3 w-24 bg-gray-100 rounded animate-pulse" />
                </div>
                <div className="h-4 w-16 bg-gray-200 rounded animate-pulse" />
                <div className="flex gap-1">
                  {[1, 2, 3].map((k) => (
                    <div
                      key={k}
                      className="h-6 w-20 bg-gray-200 rounded animate-pulse"
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** Mois dans l'ordre grégorien (Janvier=0 … Décembre=11) */
const ALL_MONTHS_GREGORIAN = [
  "Janvier",
  "Février",
  "Mars",
  "Avril",
  "Mai",
  "Juin",
  "Juillet",
  "Août",
  "Septembre",
  "Octobre",
  "Novembre",
  "Décembre",
];

const MONTH_SHORT: Record<string, string> = {
  Janvier: "Jan",
  Février: "Fév",
  Mars: "Mar",
  Avril: "Avr",
  Mai: "Mai",
  Juin: "Jun",
  Juillet: "Jul",
  Août: "Aoû",
  Septembre: "Sep",
  Octobre: "Oct",
  Novembre: "Nov",
  Décembre: "Déc",
};

/**
 * Construit les groupes T1/T2/T3 avec l'année dans chaque mois.
 */
function buildTrimestrePreview(
  startMonth: string,
  durationMonths: number,
  yearName: string
): { label: string; months: string[] }[] {
  const startIdx = ALL_MONTHS_GREGORIAN.indexOf(startMonth);
  if (startIdx === -1) return [];
  const startYear =
    parseInt(yearName.split("-")[0], 10) || new Date().getFullYear();
  const all: string[] = [];
  for (let i = 0; i < Math.min(durationMonths, 12); i++) {
    const monthIdx = (startIdx + i) % 12;
    const yearOffset = Math.floor((startIdx + i) / 12);
    const m = ALL_MONTHS_GREGORIAN[monthIdx];
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

/** Retourne les mois hors calendrier scolaire */
function buildOffMonths(
  startMonth: string,
  durationMonths: number
): string[] {
  const startIdx = ALL_MONTHS_GREGORIAN.indexOf(startMonth);
  if (startIdx === -1) return [];
  const schoolSet = new Set<number>();
  for (let i = 0; i < Math.min(durationMonths, 12); i++) {
    schoolSet.add((startIdx + i) % 12);
  }
  return ALL_MONTHS_GREGORIAN.filter((_, idx) => !schoolSet.has(idx)).map(
    (m) => MONTH_SHORT[m] ?? m.slice(0, 3)
  );
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
  const currentYear = new Date().getFullYear();
  return `${currentYear}-${currentYear + 1}`;
}

/**
 * Générer la liste des années scolaires à proposer dans le select
 */
function generateYearOptions(suggestedName: string): string[] {
  const match = suggestedName.match(/(\d{4})/);
  const baseYear = match ? parseInt(match[1], 10) : new Date().getFullYear();
  return [-3, -2, -1, 0, 1, 2].map((offset) => {
    const y = baseYear + offset;
    return `${y}-${y + 1}`;
  });
}
