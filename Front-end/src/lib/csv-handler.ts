/**
 * CSV Handler - Import/Export de données
 * Mode Production avec validation et gestion d'erreurs
 * Supporte : CSV (.csv) + Excel (.xlsx, .xls)
 */

import * as XLSX from "xlsx";
import { showSuccess, showError, showWarning } from "./notifications";

const SUPPORTED_EXTENSIONS = [".csv", ".xlsx", ".xls", ".txt"];

export function isSupportedFile(file: File): boolean {
  return SUPPORTED_EXTENSIONS.some((ext) =>
    file.name.toLowerCase().endsWith(ext)
  );
}

/**
 * Détecte si le fichier est Excel
 */
function isExcelFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return name.endsWith(".xlsx") || name.endsWith(".xls");
}

/**
 * Parse un fichier Excel (.xlsx / .xls) vers un tableau d'objets
 */
async function parseExcel<T>(
  file: File,
  validator?: (row: any, index: number) => { valid: boolean; errors: string[] }
): Promise<ImportResult<T>> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    const errors: ImportError[] = [];
    const validData: T[] = [];

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array", cellDates: true });

        // Prendre la première feuille
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];

        // raw: true → les dates Excel (déjà converties en Date JS par cellDates:true dans XLSX.read)
        // arrivent comme objets Date JS — le format de sortie ne dépend plus du locale Excel
        const rows: any[] = XLSX.utils.sheet_to_json(worksheet, {
          defval: "",
          raw: true,
        });

        if (rows.length === 0) {
          resolve({
            success: false,
            data: [],
            errors: [{ row: 0, message: "Le fichier est vide ou ne contient aucune donnée" }],
            warnings: [],
            totalRows: 0,
            successRows: 0,
            errorRows: 0,
          });
          return;
        }

        let processedRows = 0;
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];

          // Normaliser les clés et les valeurs
          const normalizedRow: any = {};
          Object.keys(row).forEach((key) => {
            const val = row[key];
            const k   = key.trim();

            if (val instanceof Date) {
              // Date Excel → YYYY-MM-DD (indépendant du locale)
              const y = val.getFullYear();
              const m = String(val.getMonth() + 1).padStart(2, "0");
              const d = String(val.getDate()).padStart(2, "0");
              normalizedRow[k] = `${y}-${m}-${d}`;
            } else if (typeof val === "number") {
              normalizedRow[k] = String(val);
            } else if (typeof val === "string") {
              normalizedRow[k] = val.trim();
            } else {
              normalizedRow[k] = val != null ? String(val) : "";
            }
          });

          // Ignorer les lignes entièrement vides (lignes placeholder du template)
          const allEmpty = Object.values(normalizedRow).every((v) => !v || !String(v).trim());
          if (allEmpty) continue;

          processedRows++;

          if (validator) {
            const validation = validator(normalizedRow, i + 1);
            if (!validation.valid) {
              // errors.length === 0 → skip silencieux (ligne placeholder partielle)
              if (validation.errors.length > 0) {
                errors.push({
                  row: i + 2,
                  message: validation.errors.join(", "),
                  data: normalizedRow,
                });
              }
              continue;
            }
          }

          validData.push(normalizedRow as T);
        }

        resolve({
          success: errors.length === 0,
          data: validData,
          errors,
          warnings: [],
          totalRows: processedRows,
          successRows: validData.length,
          errorRows: errors.length,
        });
      } catch (error) {
        resolve({
          success: false,
          data: [],
          errors: [{
            row: 0,
            message: `Erreur lors de la lecture du fichier Excel : ${error instanceof Error ? error.message : "Erreur inconnue"}`,
          }],
          warnings: [],
          totalRows: 0,
          successRows: 0,
          errorRows: 0,
        });
      }
    };

    reader.onerror = () => {
      resolve({
        success: false,
        data: [],
        errors: [{ row: 0, message: "Erreur lors de la lecture du fichier" }],
        warnings: [],
        totalRows: 0,
        successRows: 0,
        errorRows: 0,
      });
    };

    reader.readAsArrayBuffer(file);
  });
}

// Types pour l'import/export
export interface ImportResult<T> {
  success: boolean;
  data: T[];
  errors: ImportError[];
  warnings: string[];
  totalRows: number;
  successRows: number;
  errorRows: number;
}

export interface ImportError {
  row: number;
  field?: string;
  message: string;
  data?: any;
}

export interface ExportOptions {
  filename: string;
  headers: string[];
  data: any[];
  dateFormat?: string;
}

/**
 * Parse CSV ou Excel automatiquement selon l'extension du fichier
 */
export async function parseCSV<T>(
  file: File,
  validator?: (row: any, index: number) => { valid: boolean; errors: string[] }
): Promise<ImportResult<T>> {
  if (isExcelFile(file)) {
    return parseExcel<T>(file, validator);
  }
  return parseCSVInternal<T>(file, validator);
}

/**
 * Parse CSV file to array of objects (interne)
 */
async function parseCSVInternal<T>(
  file: File,
  validator?: (row: any, index: number) => { valid: boolean; errors: string[] }
): Promise<ImportResult<T>> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    const errors: ImportError[] = [];
    const warnings: string[] = [];
    const validData: T[] = [];

    reader.onload = (e) => {
      try {
        // Décoder avec UTF-8 en premier ; si des caractères de remplacement (U+FFFD)
        // apparaissent, c'est qu'Excel a sauvegardé en Windows-1252 (ANSI) → on réessaie
        const arrayBuffer = e.target?.result as ArrayBuffer;
        let text = new TextDecoder("utf-8").decode(arrayBuffer);
        if (text.includes("\uFFFD")) {
          text = new TextDecoder("windows-1252").decode(arrayBuffer);
        }
        const lines = text.split("\n").filter((line) => line.trim());

        if (lines.length === 0) {
          resolve({
            success: false,
            data: [],
            errors: [{ row: 0, message: "Le fichier est vide" }],
            warnings: [],
            totalRows: 0,
            successRows: 0,
            errorRows: 0,
          });
          return;
        }

        // Détecter le séparateur (point-virgule, tabulation ou virgule)
        let separator = ";";
        if (lines[0].includes("\t")) {
          separator = "\t"; // Excel parfois utilise des tabulations
        } else if (lines[0].includes(";")) {
          separator = ";";
        } else {
          separator = ",";
        }

        // Parse header
        const headers = lines[0].split(separator).map((h) => h.trim().replace(/"/g, ""));

        // Parse data rows
        let processedRows = 0;
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;

          try {
            const values = parseCSVLine(line);
            const row: any = {};

            headers.forEach((header, index) => {
              row[header] = values[index]?.trim() || "";
            });

            // Ignorer les lignes entièrement vides (lignes placeholder du template)
            const allEmpty = Object.values(row).every((v) => !v || !String(v).trim());
            if (allEmpty) continue;

            processedRows++;

            // Validate if validator provided
            if (validator) {
              const validation = validator(row, i);
              if (!validation.valid) {
                // errors.length === 0 → skip silencieux (ligne placeholder partielle)
                if (validation.errors.length > 0) {
                  errors.push({
                    row: i + 1,
                    message: validation.errors.join(", "),
                    data: row,
                  });
                }
                continue;
              }
            }

            validData.push(row as T);
          } catch (error) {
            errors.push({
              row: i + 1,
              message: `Erreur de parsing: ${error instanceof Error ? error.message : "Erreur inconnue"}`,
            });
          }
        }

        const totalRows = processedRows;
        const successRows = validData.length;
        const errorRows = errors.length;

        resolve({
          success: errorRows === 0,
          data: validData,
          errors,
          warnings,
          totalRows,
          successRows,
          errorRows,
        });
      } catch (error) {
        resolve({
          success: false,
          data: [],
          errors: [
            {
              row: 0,
              message: `Erreur lors de la lecture du fichier: ${error instanceof Error ? error.message : "Erreur inconnue"}`,
            },
          ],
          warnings: [],
          totalRows: 0,
          successRows: 0,
          errorRows: 0,
        });
      }
    };

    reader.onerror = () => {
      resolve({
        success: false,
        data: [],
        errors: [{ row: 0, message: "Erreur lors de la lecture du fichier" }],
        warnings: [],
        totalRows: 0,
        successRows: 0,
        errorRows: 0,
      });
    };

    reader.readAsArrayBuffer(file);
  });
}

/**
 * Parse a single CSV line handling quotes and separators
 * Supporte virgule (,), point-virgule (;) et tabulation (\t)
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  // Détecter le séparateur (tabulation, point-virgule ou virgule)
  let separator = ",";
  if (line.includes("\t")) {
    separator = "\t";
  } else if (line.includes(";")) {
    separator = ";";
  }

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === separator && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current);
  return result.map((v) => v.replace(/^"|"$/g, ""));
}

/**
 * Export data to CSV file
 * Compatible avec Excel (utilise point-virgule pour les systèmes français)
 */
export function exportToCSV(options: ExportOptions): void {
  try {
    const { filename, headers, data } = options;

    // Utiliser point-virgule pour Excel français
    const separator = ";";

    // sep=; force Excel à utiliser le bon séparateur quelle que soit la langue du système
    let csv = "sep=;\n" + headers.join(separator) + "\n";

    data.forEach((row) => {
      const values = headers.map((header) => {
        const value = row[header] ?? "";
        const stringValue = String(value);
        // Escape quotes and wrap in quotes if contains separator or quotes
        if (stringValue.includes(separator) || stringValue.includes('"') || stringValue.includes("\n")) {
          return `"${stringValue.replace(/"/g, '""')}"`;
        }
        return stringValue;
      });
      csv += values.join(separator) + "\n";
    });

    // Create blob and download with BOM for Excel
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);

    link.setAttribute("href", url);
    link.setAttribute("download", `${filename}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showSuccess("Export réussi!", `Le fichier ${filename}.csv a été téléchargé.`);
  } catch (error) {
    showError("Erreur d'export", "Impossible d'exporter les données.");
    console.error("Export error:", error);
  }
}

/**
 * Export data to Excel-compatible CSV
 */
export function exportToExcel(options: ExportOptions): void {
  exportToCSV({
    ...options,
    filename: options.filename.replace(".csv", "") + "_excel",
  });
}

/**
 * Télécharge un template Excel (.xlsx) prêt à remplir.
 * - En-têtes en gras sur fond bleu, ligne gelée
 * - Lignes d'exemple en italique grisé (repères visuels)
 * - Colonnes ajustées automatiquement à la largeur du contenu
 * L'utilisateur peut le remplir et le réimporter directement sans message Excel.
 */
export async function downloadTemplate(
  templateName: string,
  headers: string[],
  sampleData?: any[]
): Promise<void> {
  try {
    const { Workbook } = await import("exceljs");
    const workbook = new Workbook();
    const worksheet = workbook.addWorksheet("Données");

    const rows = sampleData ?? [
      headers.reduce((acc, h) => { acc[h] = `Exemple ${h}`; return acc; }, {} as any),
    ];

    // Définir les colonnes avec largeurs auto (min 20, max 45)
    worksheet.columns = headers.map((h) => {
      const maxLen = Math.max(
        h.length,
        ...rows.map((r) => String(r[h] ?? "").length)
      );
      return {
        header: h,
        key: h,
        width: Math.min(Math.max(maxLen + 4, 20), 45),
      };
    });

    // Styliser la ligne d'en-tête (ligne 1)
    const headerRow = worksheet.getRow(1);
    headerRow.height = 28;
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11, name: "Calibri" };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF2563EB" }, // Bleu Tailwind blue-600
      };
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: false };
      cell.border = {
        bottom: { style: "medium", color: { argb: "FF1D4ED8" } },
      };
    });

    // Ajouter les lignes d'exemple (italique grisé — guide visuel uniquement)
    rows.forEach((rowData: any) => {
      const dataRow = worksheet.addRow(headers.map((h) => rowData[h] ?? ""));
      dataRow.height = 20;
      dataRow.eachCell((cell) => {
        cell.font = { italic: true, color: { argb: "FF9CA3AF" }, size: 11, name: "Calibri" };
        cell.alignment = { vertical: "middle", horizontal: "left" };
        // Forcer le format texte pour éviter qu'Excel interprète les dates
        cell.numFmt = "@";
      });
    });

    // Geler la première ligne (en-têtes toujours visibles en défilant)
    worksheet.views = [{ state: "frozen", xSplit: 0, ySplit: 1 }];

    // Générer le buffer et déclencher le téléchargement
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `template_${templateName}.xlsx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showSuccess(
      "Template téléchargé !",
      `Ouvrez template_${templateName}.xlsx dans Excel, remplissez les lignes et réimportez-le directement.`
    );
  } catch (error) {
    showError("Erreur de téléchargement", "Impossible de générer le template Excel.");
    console.error("Template download error:", error);
  }
}

/**
 * Validate student import data
 * Normalise automatiquement les formats français
 */
export function validateStudentRow(row: any, index: number): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Ligne placeholder du template : ni prénom ni nom → skip silencieux
  const hasPrenom = row.prenom && String(row.prenom).trim();
  const hasNom = row.nom && String(row.nom).trim();
  if (!hasPrenom && !hasNom) {
    return { valid: false, errors: [] };
  }

  // Champs obligatoires
  if (!row.prenom || !String(row.prenom).trim()) {
    errors.push("Colonne 'prenom' manquante ou vide");
  }
  if (!row.nom || !String(row.nom).trim()) {
    errors.push("Colonne 'nom' manquante ou vide");
  }
  if (!row.classe || !String(row.classe).trim()) {
    errors.push("Colonne 'classe' manquante ou vide");
  }
  if (!row.dateNaissance || !String(row.dateNaissance).trim()) {
    errors.push("Colonne 'dateNaissance' manquante — format attendu : AAAA-MM-JJ ou JJ/MM/AAAA");
  } else {
    const normalized = normalizeDateFormat(String(row.dateNaissance));
    if (!normalized) {
      errors.push(
        `'dateNaissance' invalide : "${row.dateNaissance}" — formats acceptés : AAAA-MM-JJ, JJ/MM/AAAA, JJ-MM-AAAA ou JJ.MM.AAAA`
      );
    } else {
      row.dateNaissance = normalized;
    }
  }

  // Genre — facultatif mais validé si présent
  if (row.genre && String(row.genre).trim()) {
    const normalized = normalizeGender(String(row.genre));
    if (!normalized) {
      errors.push(
        `'genre' invalide : "${row.genre}" — valeurs acceptées : M, F, Masculin, Féminin`
      );
    } else {
      row.genre = normalized;
    }
  }

  // Email — facultatif mais validé si présent
  if (row.email && String(row.email).trim() && !isValidEmail(String(row.email))) {
    errors.push(`'email' invalide : "${row.email}"`);
  }

  // Téléphone — facultatif mais validé si présent
  if (row.telephoneParent && String(row.telephoneParent).trim() && !isValidPhone(String(row.telephoneParent))) {
    errors.push(`'telephoneParent' invalide : "${row.telephoneParent}" — doit contenir au moins 8 chiffres`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Normalise le format de date
 * Accepte: YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY
 * Retourne: YYYY-MM-DD ou null si invalide
 */
function normalizeDateFormat(date: string): string | null {
  if (!date) return null;

  const trimmed = date.trim();

  // Format ISO avec tirets (YYYY-MM-DD)
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  // Format ISO avec barres obliques (YYYY/MM/DD) — courant dans Excel
  const isoSlashMatch = trimmed.match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
  if (isoSlashMatch) {
    const [, year, month, day] = isoSlashMatch;
    return `${year}-${month}-${day}`;
  }

  // Format français avec / ou - ou . (DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY)
  // Accepte 1 ou 2 chiffres pour jour/mois
  const frMatch = trimmed.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
  if (frMatch) {
    const [, day, month, year] = frMatch;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  // Format Excel sérialisé (nombre de jours depuis 1900-01-01)
  // Ex: "43966" → peut arriver quand Excel transforme une date
  if (/^\d{5}$/.test(trimmed)) {
    const serial = parseInt(trimmed, 10);
    // Excel utilise 1900-01-01 = 1, avec un bug volontaire au 29/02/1900
    const date = new Date((serial - 25569) * 86400 * 1000);
    if (!isNaN(date.getTime())) {
      return date.toISOString().split("T")[0];
    }
  }

  return null;
}

/**
 * Normalise le genre
 * Accepte: M, F, Masculin, Féminin, Feminin
 * Retourne: M ou F
 */
function normalizeGender(genre: string): string | null {
  if (!genre) return null;

  const normalized = genre.trim().toLowerCase();

  if (normalized === 'm' || normalized === 'masculin') {
    return 'M';
  }
  if (normalized === 'f' || normalized === 'féminin' || normalized === 'feminin') {
    return 'F';
  }

  return null;
}

/**
 * Validate payment import data
 */
export function validatePaymentRow(row: any, index: number): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!row.matricule || !row.matricule.trim()) {
    errors.push("Le matricule est requis");
  }
  if (!row.montant || isNaN(Number(row.montant))) {
    errors.push("Le montant doit être un nombre valide");
  }
  if (!row.date) {
    errors.push("La date est requise");
  }
  if (!row.methode || !row.methode.trim()) {
    errors.push("La méthode de paiement est requise");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate grade import data
 */
export function validateGradeRow(row: any, index: number): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!row.matricule || !row.matricule.trim()) {
    errors.push("Le matricule est requis");
  }
  if (!row.matiere || !row.matiere.trim()) {
    errors.push("La matière est requise");
  }
  if (!row.note || isNaN(Number(row.note))) {
    errors.push("La note doit être un nombre valide");
  } else {
    const note = Number(row.note);
    if (note < 0 || note > 20) {
      errors.push("La note doit être entre 0 et 20");
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// Helper functions
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function isValidPhone(phone: string): boolean {
  const phoneRegex = /^\+?[\d\s-()]+$/;
  return phoneRegex.test(phone) && phone.replace(/\D/g, "").length >= 8;
}
