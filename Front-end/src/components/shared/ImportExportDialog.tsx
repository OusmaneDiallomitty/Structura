"use client";

import { useState, useRef, useEffect } from "react";
import { Upload, Download, FileText, AlertCircle, CheckCircle2, Info } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { parseCSV, isSupportedFile, downloadTemplate, type ImportResult, type ImportError } from "@/lib/csv-handler";
import { showSuccess, showError } from "@/lib/notifications";

interface ImportExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  templateName: string;
  templateHeaders: string[];
  sampleData?: any[];
  onImport: (data: any[]) => Promise<void>;
  validator?: (row: any, index: number) => { valid: boolean; errors: string[] };
}

export function ImportExportDialog({
  open,
  onOpenChange,
  title,
  description,
  templateName,
  templateHeaders,
  sampleData,
  onImport,
  validator,
}: ImportExportDialogProps) {
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult<any> | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const errorsRef = useRef<HTMLDivElement>(null);

  // Scroll automatique vers les erreurs dès qu'elles apparaissent
  useEffect(() => {
    if (importResult && importResult.errorRows > 0 && errorsRef.current) {
      errorsRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [importResult]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!isSupportedFile(file)) {
      const ext = file.name.split(".").pop()?.toUpperCase() ?? "inconnu";
      showError(
        `Format .${ext} non supporté`,
        "Formats acceptés : Excel (.xlsx, .xls), CSV (.csv) ou texte (.txt exporté depuis Excel)."
      );
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setSelectedFile(file);
    setImportResult(null);
  };

  const handleImport = async () => {
    if (!selectedFile) return;

    setIsImporting(true);
    try {
      const result = await parseCSV(selectedFile, validator);
      setImportResult(result);

      if (result.success && result.data.length > 0) {
        await onImport(result.data);
        showSuccess(
          "Import réussi!",
          `${result.successRows} ligne(s) importée(s) avec succès.`
        );
        setTimeout(() => {
          onOpenChange(false);
          resetDialog();
        }, 2000);
      } else if (result.errorRows > 0) {
        showError(
          "Erreurs d'import",
          `${result.errorRows} ligne(s) contiennent des erreurs.`
        );
      }
    } catch (error) {
      showError("Erreur d'import", "Une erreur est survenue lors de l'import.");
      console.error("Import error:", error);
    } finally {
      setIsImporting(false);
    }
  };

  const handleDownloadTemplate = async () => {
    await downloadTemplate(templateName, templateHeaders, sampleData);
  };

  const resetDialog = () => {
    setSelectedFile(null);
    setImportResult(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    resetDialog();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Download Template Section */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">1. Télécharger le modèle</h3>
            <Button
              variant="outline"
              className="w-full justify-start gap-2"
              onClick={handleDownloadTemplate}
            >
              <Download className="h-4 w-4" />
              Télécharger le modèle Excel (.xlsx)
            </Button>
            <Alert className="border-blue-200 bg-blue-50 py-2">
              <Info className="h-4 w-4 text-blue-600 mt-0.5" />
              <AlertDescription className="text-blue-800 text-xs">
                Le fichier <span className="font-semibold">.xlsx</span> s&apos;ouvre directement dans Excel.
                Remplissez-le, faites <span className="font-semibold">Ctrl+S</span> (pas de message
                d&apos;avertissement), puis réimportez-le ici.
              </AlertDescription>
            </Alert>
          </div>

          {/* Upload Section */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">2. Sélectionner le fichier</h3>
            <div
              className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                selectedFile
                  ? "border-emerald-400 bg-emerald-50"
                  : "hover:border-primary/50"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleFileSelect}
                className="hidden"
                id="csv-upload"
              />
              <label
                htmlFor="csv-upload"
                className="cursor-pointer flex flex-col items-center gap-2"
              >
                {selectedFile ? (
                  <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                ) : (
                  <Upload className="h-8 w-8 text-muted-foreground" />
                )}
                <div>
                  <p className={`text-sm font-medium ${selectedFile ? "text-emerald-700" : ""}`}>
                    {selectedFile ? selectedFile.name : "Cliquez pour sélectionner un fichier"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {selectedFile
                      ? `${(selectedFile.size / 1024).toFixed(1)} Ko`
                      : "Excel (.xlsx), CSV (.csv) ou texte (.txt)"}
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* Import Results */}
          {importResult && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold">Résultat de l'import</h3>

              {/* Summary */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-muted rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold">{importResult.totalRows}</div>
                  <div className="text-xs text-muted-foreground">Total</div>
                </div>
                <div className="bg-emerald-500/10 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-emerald-600">
                    {importResult.successRows}
                  </div>
                  <div className="text-xs text-muted-foreground">Réussis</div>
                </div>
                <div className="bg-red-500/10 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-red-600">
                    {importResult.errorRows}
                  </div>
                  <div className="text-xs text-muted-foreground">Erreurs</div>
                </div>
              </div>

              {/* Progress */}
              {importResult.totalRows > 0 && (
                <div className="space-y-2">
                  <Progress
                    value={(importResult.successRows / importResult.totalRows) * 100}
                    className="h-2"
                  />
                  <p className="text-xs text-center text-muted-foreground">
                    {((importResult.successRows / importResult.totalRows) * 100).toFixed(1)}%
                    importé avec succès
                  </p>
                </div>
              )}

              {/* Errors List */}
              {importResult.errors.length > 0 && (
                <div ref={errorsRef}>
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    <div className="space-y-2">
                      <p className="font-semibold">
                        {importResult.errors.length} erreur(s) détectée(s) — corrigez ces lignes et réimportez :
                      </p>
                      <div className="max-h-48 overflow-y-auto space-y-1.5">
                        {importResult.errors.slice(0, 15).map((error, index) => (
                          <div key={index} className="text-xs bg-red-50/60 rounded px-2 py-1.5">
                            <Badge variant="outline" className="mr-2 border-red-400 text-red-700">
                              Ligne {error.row}
                            </Badge>
                            {error.message}
                          </div>
                        ))}
                        {importResult.errors.length > 15 && (
                          <p className="text-xs italic">
                            ... et {importResult.errors.length - 15} autre(s) erreur(s)
                          </p>
                        )}
                      </div>
                    </div>
                  </AlertDescription>
                </Alert>
                </div>
              )}

              {/* Success Message */}
              {importResult.success && importResult.successRows > 0 && (
                <Alert className="border-emerald-500 bg-emerald-500/10">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <AlertDescription className="text-emerald-600">
                    Import réussi! {importResult.successRows} ligne(s) importée(s).
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

          {/* Instructions détaillées par outil */}
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="instructions" className="border rounded-lg px-3">
              <AccordionTrigger className="text-sm font-semibold hover:no-underline py-3">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  Comment préparer mon fichier CSV ?
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-4 pb-4">
                {/* Excel */}
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold flex items-center gap-2">
                    <span className="text-base">📊</span> Microsoft Excel
                  </p>
                  <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside pl-1">
                    <li>Téléchargez le modèle (bouton ci-dessus) → fichier <span className="font-medium text-foreground">.xlsx</span></li>
                    <li>Ouvrez-le dans Excel, remplissez les lignes sous les en-têtes</li>
                    <li>Faites <span className="font-medium text-foreground">Ctrl+S</span> — Excel le sauvegarde en .xlsx <span className="text-emerald-700 font-medium">sans message d&apos;avertissement</span></li>
                    <li>Importez ce fichier .xlsx directement ici</li>
                  </ol>
                </div>

                {/* Google Sheets */}
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold flex items-center gap-2">
                    <span className="text-base">📝</span> Google Sheets
                  </p>
                  <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside pl-1">
                    <li>Importez le fichier dans Google Sheets (<span className="font-medium text-foreground">Fichier → Importer</span>)</li>
                    <li>Remplissez les données</li>
                    <li>Exportez : <span className="font-medium text-foreground">Fichier → Télécharger → CSV (.csv)</span></li>
                    <li>Importez le fichier téléchargé ici</li>
                  </ol>
                </div>

                {/* LibreOffice */}
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold flex items-center gap-2">
                    <span className="text-base">📋</span> LibreOffice Calc
                  </p>
                  <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside pl-1">
                    <li>Ouvrez le fichier .csv (choisissez encodage UTF-8)</li>
                    <li>Remplissez les données</li>
                    <li>Enregistrez en gardant le format <span className="font-medium text-foreground">CSV</span> (pas .ods)</li>
                  </ol>
                </div>

                {/* Format technique */}
                <div className="rounded-md bg-muted p-3 space-y-1">
                  <p className="text-xs font-semibold">Spécifications techniques</p>
                  <ul className="text-xs text-muted-foreground space-y-0.5 list-disc list-inside">
                    <li>Encodage : UTF-8</li>
                    <li>Séparateurs acceptés : virgule <code className="bg-background px-1 rounded">,</code> ou point-virgule <code className="bg-background px-1 rounded">;</code></li>
                    <li>Dates : <code className="bg-background px-1 rounded">YYYY-MM-DD</code> ou <code className="bg-background px-1 rounded">DD/MM/YYYY</code></li>
                    <li>Genre : <code className="bg-background px-1 rounded">M</code>, <code className="bg-background px-1 rounded">F</code>, <code className="bg-background px-1 rounded">Masculin</code> ou <code className="bg-background px-1 rounded">Féminin</code></li>
                  </ul>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Annuler
          </Button>
          <Button
            onClick={handleImport}
            disabled={!selectedFile || isImporting}
            className="gap-2"
          >
            {isImporting ? (
              <>
                <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Import en cours...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" />
                Importer
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
