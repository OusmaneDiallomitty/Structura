"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { GraduationCap, AlertTriangle, Loader2 } from "lucide-react";
import * as storage from "@/lib/storage";
import { getClasses, convertAndCreateClasses } from "@/lib/api/classes.service";

/**
 * Classes prédéfinies du système éducatif guinéen
 */
const DEFAULT_CLASSES = [
  // MATERNELLE
  { name: 'Petite Section', level: 'Maternelle', description: 'Maternelle' },
  { name: 'Moyenne Section', level: 'Maternelle', description: 'Maternelle' },
  { name: 'Grande Section', level: 'Maternelle', description: 'Maternelle' },

  // PRIMAIRE (1ère à 6ème année)
  { name: 'CP1', level: 'Primaire', description: '1ère année' },
  { name: 'CP2', level: 'Primaire', description: '2ème année' },
  { name: 'CE1', level: 'Primaire', description: '3ème année' },
  { name: 'CE2', level: 'Primaire', description: '4ème année' },
  { name: 'CM1', level: 'Primaire', description: '5ème année' },
  { name: 'CM2', level: 'Primaire', description: '6ème année' },

  // COLLÈGE (7ème à 10ème année)
  { name: '7ème année', level: 'Collège', description: 'Collège' },
  { name: '8ème année', level: 'Collège', description: 'Collège' },
  { name: '9ème année', level: 'Collège', description: 'Collège' },
  { name: '10ème année', level: 'Collège', description: 'Collège' },
];

/** Classes lycée avec leurs séries guinéennes */
const LYCEE_CLASSES = [
  { name: '11ème Année', displayName: '11ème Année' },
  { name: '12ème Année', displayName: '12ème Année' },
  { name: 'Terminale', displayName: 'Terminale' },
];

const LYCEE_SERIES_LIST = ['Sciences Sociales', 'Mathématiques', 'Expérimental'];

interface CreateDefaultClassesDialogProps {
  academicYearId: string | null;
  onSuccess?: () => void;
}

export function CreateDefaultClassesDialog({
  academicYearId,
  onSuccess,
}: CreateDefaultClassesDialogProps) {
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [classCounts, setClassCounts] = useState<{ [key: string]: number }>({});
  // Séries lycée sélectionnées : { "11ème Année": ["Sciences Sociales", "Mathématiques"] }
  const [lyceeSeriesSelected, setLyceeSeriesSelected] = useState<{ [className: string]: string[] }>({});

  // États pour la conversion automatique
  const [showConversionDialog, setShowConversionDialog] = useState(false);
  const [conversionData, setConversionData] = useState<{
    className: string;
    existingClassId: string;
    studentCount: number;
    sectionsToCreate: string[];
  } | null>(null);

  // État pour les classes existantes (détection UX)
  const [existingClassesByName, setExistingClassesByName] = useState<{ [key: string]: number }>({});

  // Charger les classes existantes quand le dialog s'ouvre
  useEffect(() => {
    if (open) {
      loadExistingClasses();
    }
  }, [open]);

  async function loadExistingClasses() {
    try {
      const token = storage.getAuthItem("structura_token");
      if (!token) return;

      const classes = await getClasses(token);

      // Grouper par nom de classe et compter
      const countByName: { [key: string]: number } = {};
      classes.forEach((c: any) => {
        countByName[c.name] = (countByName[c.name] || 0) + 1;
      });

      setExistingClassesByName(countByName);
    } catch (error) {
      console.error("Erreur chargement classes existantes:", error);
    }
  }

  const handleCountChange = (className: string, value: string) => {
    const raw = value.replace(/\D/g, "");
    const count = raw === "" ? 0 : Math.max(0, Math.min(10, parseInt(raw)));
    setClassCounts({
      ...classCounts,
      [className]: count,
    });
  };

  const toggleLyceeSerie = (className: string, serie: string) => {
    const current = lyceeSeriesSelected[className] || [];
    const updated = current.includes(serie)
      ? current.filter((s) => s !== serie)
      : [...current, serie];
    setLyceeSeriesSelected({ ...lyceeSeriesSelected, [className]: updated });
  };

  const handleSubmit = async () => {
    if (!academicYearId) {
      toast.error("Veuillez d'abord créer une année académique");
      return;
    }

    // Calculer les classes à créer
    const selectedClasses: string[] = [];
    const sections: { [key: string]: string[] } = {};

    // Classes normales (Maternelle, Primaire, Collège) — sections A, B, C…
    Object.entries(classCounts).forEach(([className, count]) => {
      if (count > 0) {
        selectedClasses.push(className);
        if (count > 1) {
          sections[className] = Array.from({ length: count }, (_, i) =>
            String.fromCharCode(65 + i)
          );
        }
      }
    });

    // Classes lycée — séries comme sections
    Object.entries(lyceeSeriesSelected).forEach(([className, series]) => {
      if (series.length > 0) {
        selectedClasses.push(className);
        // Toujours passer les séries comme sections (même si 1 seule sélectionnée)
        sections[className] = series;
      }
    });

    if (selectedClasses.length === 0) {
      toast.error("Veuillez indiquer au moins une classe");
      return;
    }

    setIsSubmitting(true);

    try {
      const token = storage.getAuthItem("structura_token");
      if (!token) {
        toast.error("Session expirée");
        setIsSubmitting(false);
        return;
      }

      // DÉTECTION INTELLIGENTE : Vérifier les classes existantes
      const existingClasses = await getClasses(token);

      for (const className of selectedClasses) {
        const requestedSections = sections[className];

        // Si on veut créer 2+ sections (ex: CP1 A et CP1 B)
        if (requestedSections && requestedSections.length > 1) {
          // Trouver toutes les classes existantes avec ce nom
          const existingWithName = existingClasses.filter(
            (c: any) => c.name === className
          );

          if (existingWithName.length > 0) {
            // Cas 1 : Une classe existe SANS section
            const existingWithoutSection = existingWithName.find((c: any) => !c.section);

            if (existingWithoutSection) {
              // PROPOSER LA CONVERSION AUTOMATIQUE
              setConversionData({
                className,
                existingClassId: existingWithoutSection.id,
                studentCount: existingWithoutSection.studentCount || 0,
                sectionsToCreate: requestedSections,
              });
              setShowConversionDialog(true);
              setIsSubmitting(false);
              return; // Arrêter ici, attendre la confirmation
            }

            // Cas 2 : Des classes existent AVEC sections (ex: CP2 A, CP2 B)
            // → Créer seulement les sections manquantes
            const existingSections = existingWithName
              .filter((c: any) => c.section)
              .map((c: any) => c.section);

            // Filtrer pour ne garder que les sections qui n'existent pas encore
            const newSections = requestedSections.filter(
              (s: string) => !existingSections.includes(s)
            );

            if (newSections.length === 0) {
              // Toutes les sections existent déjà
              toast.error(`Toutes les sections de ${className} existent déjà.`);
              setIsSubmitting(false);
              return;
            }

            // Mettre à jour les sections à créer (seulement les nouvelles)
            sections[className] = newSections;
          }
        }
      }

      // Aucun conflit détecté → Créer normalement
      const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api";

      const response = await fetch(`${API_BASE_URL}/classes/default`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          academicYearId,
          selectedClasses,
          sections,
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: "Erreur lors de la création" }));
        throw new Error(error.message || "Erreur lors de la création");
      }

      const result = await response.json();

      toast.success(`${result.created} classe(s) créée(s) avec succès !`);
      setOpen(false);
      setClassCounts({});
      setLyceeSeriesSelected({});

      if (onSuccess) {
        onSuccess();
      }
    } catch (error: any) {
      console.error("❌ Erreur:", error);
      toast.error(error.message || "Erreur lors de la création des classes");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Fonction pour exécuter la conversion automatique
  const handleConversionConfirm = async () => {
    if (!conversionData || !academicYearId) return;

    setShowConversionDialog(false);
    setIsSubmitting(true);

    try {
      const token = storage.getAuthItem("structura_token");
      if (!token) {
        toast.error("Session expirée");
        return;
      }

      // Appeler l'API de conversion automatique
      const result = await convertAndCreateClasses(token, {
        academicYearId,
        existingClassId: conversionData.existingClassId,
        className: conversionData.className,
        sectionsToCreate: conversionData.sectionsToCreate,
      });

      toast.success(
        `${result.created.length + 1} classe(s) créée(s) avec succès !\n` +
        `• "${result.converted.name} ${result.converted.section ?? ''}" (mise à jour)\n` +
        `• ${result.created.map((c) => `${c.name} ${c.section ?? ''}`).join(", ")} (nouvelles)`
      );

      setOpen(false);
      setClassCounts({});
      setLyceeSeriesSelected({});
      setConversionData(null);

      if (onSuccess) {
        onSuccess();
      }
    } catch (error: any) {
      console.error("❌ Erreur conversion:", error);
      toast.error(error.message || "Erreur lors de la conversion");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Calculer le nombre total de classes à créer
  const totalClasses =
    Object.values(classCounts).reduce((sum, count) => sum + count, 0) +
    Object.values(lyceeSeriesSelected).reduce((sum, series) => sum + series.length, 0);

  // Grouper par niveau
  const maternelleClasses = DEFAULT_CLASSES.filter((c) => c.level === "Maternelle");
  const primaryClasses = DEFAULT_CLASSES.filter((c) => c.level === "Primaire");
  const collegeClasses = DEFAULT_CLASSES.filter((c) => c.level === "Collège");

  return (
    <>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2 border-indigo-300 text-indigo-700 hover:bg-indigo-50 hover:border-indigo-400 hover:text-indigo-800 transition-colors">
          <GraduationCap className="h-4 w-4" />
          Créer classes prédéfinies
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="text-lg md:text-xl">Créer les classes prédéfinies</DialogTitle>
          <DialogDescription className="text-sm">
            Indiquez le <strong>nombre total de classes</strong> pour chaque année.
            <br />
            <span className="text-xs text-muted-foreground">
              Exemple : 2 pour CP1 → créera "CP1 A" et "CP1 B"
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4 overflow-y-auto flex-1 pr-2">
          {/* MATERNELLE */}
          <div>
            <h3 className="font-semibold text-base md:text-lg mb-3 text-pink-600">Maternelle</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {maternelleClasses.map((classItem) => {
                const count = classCounts[classItem.name] || 0;
                const existingCount = existingClassesByName[classItem.name] || 0;

                return (
                  <div key={classItem.name} className="flex flex-col gap-2 border rounded-lg p-2.5 md:p-3 hover:border-pink-300 transition-colors">
                    <div className="flex items-start sm:items-center gap-2 sm:gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                          <Label className="text-xs sm:text-sm font-medium truncate">
                            {classItem.name} <span className="text-muted-foreground">({classItem.description})</span>
                          </Label>
                          {existingCount > 0 && (
                            <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[10px] sm:text-xs font-medium rounded whitespace-nowrap w-fit">
                              {existingCount} existante{existingCount > 1 ? "s" : ""}
                            </span>
                          )}
                        </div>
                      </div>
                      <Input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={count === 0 ? "" : String(count)}
                        onChange={(e) => handleCountChange(classItem.name, e.target.value)}
                        className="w-14 sm:w-16 text-center text-sm flex-shrink-0"
                        placeholder="0"
                      />
                    </div>
                    {existingCount > 0 && count > existingCount && (
                      <p className="text-[10px] sm:text-xs text-pink-600 bg-pink-50 px-2 py-1 rounded">
                        💡 Ajouter {count - existingCount} section{count - existingCount > 1 ? "s" : ""} (total: {count})
                      </p>
                    )}
                    {existingCount > 0 && count === existingCount && (
                      <p className="text-[10px] sm:text-xs text-muted-foreground">
                        ✓ Garder {count} classe{count > 1 ? "s" : ""}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* PRIMAIRE */}
          <div>
            <h3 className="font-semibold text-base md:text-lg mb-3 text-blue-700">Primaire</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {primaryClasses.map((classItem) => {
                const count = classCounts[classItem.name] || 0;
                const existingCount = existingClassesByName[classItem.name] || 0;

                return (
                  <div key={classItem.name} className="flex flex-col gap-2 border rounded-lg p-2.5 md:p-3 hover:border-blue-300 transition-colors">
                    <div className="flex items-start sm:items-center gap-2 sm:gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                          <Label className="text-xs sm:text-sm font-medium truncate">
                            {classItem.name} <span className="text-muted-foreground">({classItem.description})</span>
                          </Label>
                          {existingCount > 0 && (
                            <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[10px] sm:text-xs font-medium rounded whitespace-nowrap w-fit">
                              {existingCount} existante{existingCount > 1 ? "s" : ""}
                            </span>
                          )}
                        </div>
                      </div>
                      <Input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={count === 0 ? "" : String(count)}
                        onChange={(e) => handleCountChange(classItem.name, e.target.value)}
                        className="w-14 sm:w-16 text-center text-sm flex-shrink-0"
                        placeholder="0"
                      />
                    </div>
                    {existingCount > 0 && count > existingCount && (
                      <p className="text-[10px] sm:text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded">
                        💡 Ajouter {count - existingCount} section{count - existingCount > 1 ? "s" : ""} (total: {count})
                      </p>
                    )}
                    {existingCount > 0 && count === existingCount && (
                      <p className="text-[10px] sm:text-xs text-muted-foreground">
                        ✓ Garder {count} classe{count > 1 ? "s" : ""}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* COLLÈGE */}
          <div>
            <h3 className="font-semibold text-base md:text-lg mb-3 text-green-700">Collège</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {collegeClasses.map((classItem) => {
                const count = classCounts[classItem.name] || 0;
                const existingCount = existingClassesByName[classItem.name] || 0;

                return (
                  <div key={classItem.name} className="flex flex-col gap-2 border rounded-lg p-2.5 md:p-3 hover:border-blue-300 transition-colors">
                    <div className="flex items-start sm:items-center gap-2 sm:gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                          <Label className="text-xs sm:text-sm font-medium truncate">
                            {classItem.name} <span className="text-muted-foreground">({classItem.description})</span>
                          </Label>
                          {existingCount > 0 && (
                            <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[10px] sm:text-xs font-medium rounded whitespace-nowrap w-fit">
                              {existingCount} existante{existingCount > 1 ? "s" : ""}
                            </span>
                          )}
                        </div>
                      </div>
                      <Input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={count === 0 ? "" : String(count)}
                        onChange={(e) => handleCountChange(classItem.name, e.target.value)}
                        className="w-14 sm:w-16 text-center text-sm flex-shrink-0"
                        placeholder="0"
                      />
                    </div>
                    {existingCount > 0 && count > existingCount && (
                      <p className="text-[10px] sm:text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded">
                        💡 Ajouter {count - existingCount} section{count - existingCount > 1 ? "s" : ""} (total: {count})
                      </p>
                    )}
                    {existingCount > 0 && count === existingCount && (
                      <p className="text-[10px] sm:text-xs text-muted-foreground">
                        ✓ Garder {count} classe{count > 1 ? "s" : ""}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* LYCÉE — séries fixes */}
          <div>
            <h3 className="font-semibold text-base md:text-lg mb-1 text-purple-700">Lycée</h3>
            <p className="text-xs text-muted-foreground mb-3">
              Cochez les séries à créer pour chaque niveau
            </p>
            <div className="grid grid-cols-1 gap-3">
              {LYCEE_CLASSES.map((classItem) => {
                const selectedSeries = lyceeSeriesSelected[classItem.name] || [];
                return (
                  <div key={classItem.name} className="border rounded-lg p-3 hover:border-purple-300 transition-colors">
                    <Label className="text-sm font-semibold text-purple-800 mb-2 block">
                      {classItem.displayName}
                    </Label>
                    <div className="flex flex-wrap gap-2">
                      {LYCEE_SERIES_LIST.map((serie) => {
                        const isSelected = selectedSeries.includes(serie);
                        // Vérifier si cette série existe déjà en BDD
                        const alreadyExists = Object.entries(existingClassesByName).some(
                          ([name]) => name === classItem.name
                        );
                        return (
                          <button
                            key={serie}
                            type="button"
                            onClick={() => toggleLyceeSerie(classItem.name, serie)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                              isSelected
                                ? "bg-purple-600 text-white border-purple-600"
                                : "bg-white text-gray-700 border-gray-300 hover:border-purple-400"
                            }`}
                          >
                            {isSelected ? "✓ " : ""}{serie}
                          </button>
                        );
                      })}
                    </div>
                    {selectedSeries.length > 0 && (
                      <p className="text-[10px] text-purple-600 mt-1.5">
                        {selectedSeries.length} série{selectedSeries.length > 1 ? "s" : ""} sélectionnée{selectedSeries.length > 1 ? "s" : ""}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Aperçu */}
          {totalClasses > 0 && (
            <div className="border-t pt-4 mt-2">
              <h4 className="font-medium text-xs sm:text-sm mb-2">Aperçu des classes à créer :</h4>
              <div className="flex flex-wrap gap-1.5 sm:gap-2">
                {Object.entries(classCounts).map(([className, count]) => {
                  if (count === 0) return null;
                  if (count === 1) {
                    return (
                      <div key={className} className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs">
                        {className}
                      </div>
                    );
                  }
                  return Array.from({ length: count }, (_, i) => (
                    <div key={`${className}-${i}`} className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs">
                      {className} {String.fromCharCode(65 + i)}
                    </div>
                  ));
                })}
                {Object.entries(lyceeSeriesSelected).map(([className, series]) =>
                  series.map((serie) => (
                    <div key={`${className}-${serie}`} className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs">
                      {className} — {serie}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 border-t pt-4 mt-4 flex-col sm:flex-row gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            className="w-full sm:w-auto hover:bg-gray-100 transition-colors"
          >
            Annuler
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || totalClasses === 0}
            className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Création en cours…
              </>
            ) : totalClasses === 0 ? (
              "Sélectionnez au moins une classe"
            ) : (
              <>
                <GraduationCap className="h-4 w-4 mr-2" />
                Créer {totalClasses} classe{totalClasses > 1 ? "s" : ""}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

      {/* Dialog de confirmation pour conversion automatique */}
      <AlertDialog open={showConversionDialog} onOpenChange={setShowConversionDialog}>
        <AlertDialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Classe {conversionData?.className} existe déjà
            </AlertDialogTitle>
            <AlertDialogDescription>
              Vous voulez créer {conversionData?.sectionsToCreate.length} classes {conversionData?.className}.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
              <div className="font-medium text-amber-900 mb-1">
                Une classe "{conversionData?.className}" existe déjà{" "}
                {conversionData?.studentCount ? (
                  <span className="text-amber-700">
                    ({conversionData.studentCount} élève{conversionData.studentCount > 1 ? "s" : ""})
                  </span>
                ) : (
                  "(vide)"
                )}
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2">
              <div className="font-semibold text-blue-900 flex items-center gap-2">
                <span className="text-lg">💡</span>
                Solution automatique proposée :
              </div>
              <ul className="space-y-1.5 text-sm text-blue-800 ml-6">
                <li className="flex items-start gap-2">
                  <span className="font-bold mt-0.5">•</span>
                  <span>
                    Renommer "{conversionData?.className}" → "{conversionData?.className}{" "}
                    {conversionData?.sectionsToCreate[0]}"
                    {conversionData?.studentCount ? (
                      <span className="text-blue-600">
                        {" "}
                        (conserve les {conversionData.studentCount} élève{conversionData.studentCount > 1 ? "s" : ""})
                      </span>
                    ) : null}
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-bold mt-0.5">•</span>
                  <span>
                    Créer{" "}
                    {conversionData?.sectionsToCreate.slice(1).map((section, i) => (
                      <span key={section}>
                        {i > 0 && ", "}
                        <strong>
                          {conversionData.className} {section}
                        </strong>
                      </span>
                    ))}{" "}
                    (nouvelle{conversionData?.sectionsToCreate.length && conversionData.sectionsToCreate.length > 2 ? "s" : ""})
                  </span>
                </li>
              </ul>
            </div>

            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <div className="text-sm font-medium text-green-900 flex items-center gap-2">
                <span className="text-lg">✅</span>
                Aucune donnée ne sera perdue
              </div>
              <div className="text-xs text-green-700 mt-1 ml-7">
                Tous les élèves, notes, présences et paiements restent intacts
              </div>
            </div>
          </div>
          <AlertDialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowConversionDialog(false);
                setConversionData(null);
                setIsSubmitting(false);
              }}
            >
              Annuler
            </Button>
            <Button onClick={handleConversionConfirm} disabled={isSubmitting}>
              {isSubmitting ? "Conversion..." : "Oui, convertir et créer"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
