/**
 * CSV Handler - Import/Export de données
 * Mode Production avec validation et gestion d'erreurs
 * Supporte : CSV (.csv) + Excel (.xlsx, .xls)
 */

// xlsx chargé dynamiquement — ne bloque pas le bundle initial
let _XLSX: typeof import("xlsx") | null = null;
async function getXLSX() {
  if (!_XLSX) _XLSX = await import("xlsx");
  return _XLSX;
}
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
  // Charger xlsx avant de lancer le FileReader (dynamic import)
  const XLSX = await getXLSX();

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

// ─── Helpers Excel natif ────────────────────────────────────────────────────

function styleHeaderRow(row: import("exceljs").Row): void {
  row.height = 26;
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11, name: "Calibri" };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2563EB" } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: false };
    cell.border = { bottom: { style: "medium", color: { argb: "FF1D4ED8" } } };
  });
}

function styleGroupRow(row: import("exceljs").Row, label: string, colCount: number): void {
  row.height = 22;
  for (let c = 1; c <= colCount; c++) row.getCell(c).value = c === 1 ? label : "";
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FF1E3A8A" }, size: 11, name: "Calibri" };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDBEAFE" } };
    cell.alignment = { vertical: "middle" };
  });
}

function styleDataRow(row: import("exceljs").Row): void {
  row.height = 18;
  row.eachCell((cell) => {
    cell.font = { size: 10, name: "Calibri" };
    cell.alignment = { vertical: "middle" };
  });
}

async function triggerXLSXDownload(workbook: import("exceljs").Workbook, filename: string): Promise<void> {
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filename}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Exporte la liste des élèves en Excel natif (.xlsx)
 * - Trié par classe (ordre naturel) puis par nom
 * - Regroupé par classe avec en-tête de groupe + ligne vide entre chaque classe
 */
export async function exportStudentsToXLSX(students: any[], filename: string): Promise<void> {
  const sorted = [...students].sort((a, b) => {
    const ca = a.class?.name ?? a.classId ?? "";
    const cb = b.class?.name ?? b.classId ?? "";
    const cc = ca.localeCompare(cb, "fr", { numeric: true });
    if (cc !== 0) return cc;
    return (a.lastName ?? "").localeCompare(b.lastName ?? "", "fr");
  });

  const groups = new Map<string, any[]>();
  for (const s of sorted) {
    const cls = s.class?.name ?? s.classId ?? "Sans classe";
    if (!groups.has(cls)) groups.set(cls, []);
    groups.get(cls)!.push(s);
  }

  const { Workbook } = await import("exceljs");
  const workbook = new Workbook();
  workbook.creator = "Structura";
  workbook.created = new Date();

  const ws = workbook.addWorksheet("Élèves");
  const COLS = [
    { header: "Matricule",         key: "matricule", width: 18 },
    { header: "Prénom",            key: "prenom",    width: 20 },
    { header: "Nom",               key: "nom",       width: 20 },
    { header: "Classe",            key: "classe",    width: 16 },
    { header: "Statut",            key: "statut",    width: 12 },
    { header: "Date de naissance", key: "dob",       width: 20 },
    { header: "Genre",             key: "genre",     width: 12 },
    { header: "Parent / Tuteur",   key: "parent",    width: 22 },
    { header: "Téléphone",         key: "tel",       width: 16 },
    { header: "Email parent",      key: "email",     width: 26 },
    { header: "Profession parent", key: "profession",width: 22 },
    { header: "Adresse",           key: "adresse",   width: 24 },
  ];
  ws.columns = COLS;
  styleHeaderRow(ws.getRow(1));
  ws.views = [{ state: "frozen", xSplit: 0, ySplit: 1 }];

  for (const [className, classStudents] of groups) {
    const groupLabel = `  ${className}  —  ${classStudents.length} élève${classStudents.length > 1 ? "s" : ""}`;
    const groupRow = ws.addRow(Array(COLS.length).fill(""));
    styleGroupRow(groupRow, groupLabel, COLS.length);
    ws.mergeCells(`A${groupRow.number}:L${groupRow.number}`);

    for (const s of classStudents) {
      const row = ws.addRow({
        matricule:   s.matricule ?? "",
        prenom:      s.firstName ?? "",
        nom:         s.lastName ?? "",
        classe:      s.class?.name ?? "",
        statut:      s.status === "active" ? "Actif" : s.status === "inactive" ? "Inactif" : (s.status ?? ""),
        dob:         s.dateOfBirth ? new Date(s.dateOfBirth).toLocaleDateString("fr-FR") : "",
        genre:       s.gender === "M" ? "Masculin" : s.gender === "F" ? "Féminin" : "",
        parent:      s.parentName ?? "",
        tel:         s.parentPhone ?? "",
        email:       s.parentEmail ?? "",
        profession:  s.parentProfession ?? "",
        adresse:     s.address ?? "",
      });
      styleDataRow(row);
    }

    // Ligne vide entre les classes
    ws.addRow([]);
  }

  await triggerXLSXDownload(workbook, filename);
  showSuccess("Export réussi !", `${filename}.xlsx — ${students.length} élève${students.length > 1 ? "s" : ""} exporté${students.length > 1 ? "s" : ""}.`);
}

/**
 * Exporte les paiements en Excel natif (.xlsx)
 * - Trié par classe, puis par nom élève, puis par date
 * - Regroupé par classe avec en-tête + ligne vide
 */
export async function exportPaymentsToXLSX(payments: any[], filename: string): Promise<void> {
  const sorted = [...payments].sort((a, b) => {
    const ca = a.student?.class?.name ?? a.student?.classId ?? "";
    const cb = b.student?.class?.name ?? b.student?.classId ?? "";
    const cc = ca.localeCompare(cb, "fr", { numeric: true });
    if (cc !== 0) return cc;
    const na = `${a.student?.lastName ?? ""} ${a.student?.firstName ?? ""}`;
    const nb = `${b.student?.lastName ?? ""} ${b.student?.firstName ?? ""}`;
    const nc = na.localeCompare(nb, "fr");
    if (nc !== 0) return nc;
    return new Date(a.paidDate ?? a.createdAt ?? 0).getTime() - new Date(b.paidDate ?? b.createdAt ?? 0).getTime();
  });

  const groups = new Map<string, any[]>();
  for (const p of sorted) {
    const cls = p.student?.class?.name ?? p.student?.classId ?? "Sans classe";
    if (!groups.has(cls)) groups.set(cls, []);
    groups.get(cls)!.push(p);
  }

  const METHOD_LABELS: Record<string, string> = {
    cash: "Espèces", mobile_money: "Mobile Money", bank_transfer: "Virement",
    check: "Chèque", card: "Carte bancaire",
  };
  const STATUS_LABELS: Record<string, string> = {
    paid: "Payé", partial: "Partiel", pending: "En attente", overdue: "En retard",
  };

  const { Workbook } = await import("exceljs");
  const workbook = new Workbook();
  workbook.creator = "Structura";
  workbook.created = new Date();

  const ws = workbook.addWorksheet("Paiements");
  const COLS = [
    { header: "N° Reçu",          key: "receipt",    width: 18 },
    { header: "Élève",             key: "eleve",      width: 24 },
    { header: "Classe",            key: "classe",     width: 16 },
    { header: "Montant",           key: "montant",    width: 14 },
    { header: "Devise",            key: "devise",     width: 10 },
    { header: "Méthode",           key: "methode",    width: 18 },
    { header: "Statut",            key: "statut",     width: 14 },
    { header: "Période",           key: "terme",      width: 20 },
    { header: "Année scolaire",    key: "annee",      width: 16 },
    { header: "Description",       key: "desc",       width: 28 },
    { header: "Date de paiement",  key: "date",       width: 22 },
  ];
  ws.columns = COLS;
  styleHeaderRow(ws.getRow(1));
  ws.views = [{ state: "frozen", xSplit: 0, ySplit: 1 }];

  for (const [className, classPayments] of groups) {
    const total = classPayments.reduce((s: number, p: any) => s + (p.amount ?? 0), 0);
    const groupLabel = `  ${className}  —  ${classPayments.length} paiement${classPayments.length > 1 ? "s" : ""}  |  Total : ${total.toLocaleString("fr-FR")} GNF`;
    const groupRow = ws.addRow(Array(COLS.length).fill(""));
    styleGroupRow(groupRow, groupLabel, COLS.length);
    ws.mergeCells(`A${groupRow.number}:K${groupRow.number}`);

    for (const p of classPayments) {
      const studentName = p.student
        ? `${p.student.firstName ?? ""} ${p.student.lastName ?? ""}`.trim()
        : (p.studentId ?? "");
      const dateStr = p.paidDate
        ? new Date(p.paidDate).toLocaleDateString("fr-FR")
        : p.createdAt ? new Date(p.createdAt).toLocaleDateString("fr-FR") : "";
      const row = ws.addRow({
        receipt: p.receiptNumber ?? "",
        eleve:   studentName,
        classe:  p.student?.class?.name ?? "",
        montant: p.amount != null ? p.amount : "",
        devise:  p.currency ?? "GNF",
        methode: METHOD_LABELS[p.method] ?? (p.method ?? ""),
        statut:  STATUS_LABELS[p.status] ?? (p.status ?? ""),
        terme:   p.term ?? "",
        annee:   p.academicYear ?? "",
        desc:    p.description ?? "",
        date:    dateStr,
      });
      styleDataRow(row);
      // Montant en nombre pour pouvoir faire des formules dans Excel
      if (p.amount != null) {
        row.getCell("montant").numFmt = '#,##0';
        row.getCell("montant").value = p.amount;
      }
    }

    ws.addRow([]);
  }

  await triggerXLSXDownload(workbook, filename);
  showSuccess("Export réussi !", `${filename}.xlsx — ${payments.length} paiement${payments.length > 1 ? "s" : ""} exporté${payments.length > 1 ? "s" : ""}.`);
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
    workbook.creator = "Structura";
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet("Import");
    const nCols = headers.length;

    // Largeurs par colonne connue
    const COL_WIDTHS: Record<string, number> = {
      prenom: 22, nom: 22, classe: 20, dateNaissance: 20,
      genre: 12, nomParent: 26, telephoneParent: 20,
      email: 28, professionParent: 24, adresse: 30,
    };
    // Colonnes obligatoires
    const REQUIRED = new Set(["prenom", "nom"]);

    // Définir largeurs (sans header — on ajoute les lignes manuellement)
    worksheet.columns = headers.map((h) => ({
      key: h,
      width: COL_WIDTHS[h] ?? Math.min(Math.max(h.length + 6, 18), 36),
    }));

    // ── Ligne 1 : Bannière instructions ─────────────────────────────────────
    const instrRow = worksheet.addRow(
      [" STRUCTURA — Template d'importation   ·   Les colonnes marquées * sont obligatoires   ·   Supprimez la ligne EXEMPLE avant d'importer"]
        .concat(Array(nCols - 1).fill(""))
    );
    instrRow.height = 24;
    worksheet.mergeCells(1, 1, 1, nCols);
    const instrCell = instrRow.getCell(1);
    instrCell.font  = { bold: true, color: { argb: "FFFFFFFF" }, size: 10, name: "Calibri" };
    instrCell.fill  = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A8A" } };
    instrCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };

    // ── Ligne 2 : En-têtes ───────────────────────────────────────────────────
    const headerValues = headers.map((h) => (REQUIRED.has(h) ? `${h} *` : h));
    const headerRow = worksheet.addRow(headerValues);
    headerRow.height = 32;
    headerRow.eachCell((cell, colIdx) => {
      const h = headers[colIdx - 1];
      const isReq = REQUIRED.has(h);
      cell.font      = { bold: true, color: { argb: "FFFFFFFF" }, size: 11, name: "Calibri" };
      cell.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: isReq ? "FF1D4ED8" : "FF3B82F6" } };
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: false };
      cell.border    = {
        top:    { style: "medium", color: { argb: "FF1E40AF" } },
        bottom: { style: "medium", color: { argb: "FF1E40AF" } },
        left:   { style: "thin",   color: { argb: "FF1E40AF" } },
        right:  { style: "thin",   color: { argb: "FF1E40AF" } },
      };
    });

    // ── Ligne 3 : Ligne EXEMPLE (fond jaune, texte sombre bien lisible) ─────
    const firstSample = sampleData?.[0] ?? headers.reduce((a, h) => { a[h] = `ex. ${h}`; return a; }, {} as any);
    const exValues = headers.map((h, i) =>
      i === 0
        ? `EXEMPLE — ${firstSample[h] ?? ""}`
        : firstSample[h] ?? ""
    );
    const exRow = worksheet.addRow(exValues);
    exRow.height = 22;
    exRow.eachCell((cell) => {
      cell.font      = { italic: true, bold: false, color: { argb: "FF78350F" }, size: 10, name: "Calibri" };
      cell.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF9C3" } }; // yellow-100
      cell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
      cell.numFmt    = "@";
      cell.border    = {
        top:    { style: "thin", color: { argb: "FFFBBF24" } },
        bottom: { style: "medium", color: { argb: "FFFBBF24" } },
        left:   { style: "thin", color: { argb: "FFFBBF24" } },
        right:  { style: "thin", color: { argb: "FFFBBF24" } },
      };
    });

    // ── Lignes 4+ : Lignes de saisie (fond alterné, bordures visibles) ───────
    const extraRows = sampleData ? sampleData.slice(1) : [];
    const TOTAL_DATA_ROWS = Math.max(extraRows.length, 30); // au moins 30 lignes prêtes

    for (let r = 0; r < TOTAL_DATA_ROWS; r++) {
      const rowData = extraRows[r] ?? {};
      const values  = headers.map((h) => rowData[h] ?? "");
      const dataRow = worksheet.addRow(values);
      dataRow.height = 22;

      const isEven = r % 2 === 0;
      const bgArgb  = isEven ? "FFFFFFFF" : "FFF0F9FF"; // blanc / bleu très clair

      dataRow.eachCell({ includeEmpty: true }, (cell) => {
        cell.font      = { size: 11, name: "Calibri", color: { argb: "FF111827" } };
        cell.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: bgArgb } };
        cell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
        cell.numFmt    = "@";
        cell.border    = {
          top:    { style: "hair",  color: { argb: "FFD1D5DB" } },
          bottom: { style: "hair",  color: { argb: "FFD1D5DB" } },
          left:   { style: "thin",  color: { argb: "FFD1D5DB" } },
          right:  { style: "thin",  color: { argb: "FFD1D5DB" } },
        };
      });
    }

    // ── Validation : dropdown Genre (M / F) ──────────────────────────────────
    const genreIdx = headers.indexOf("genre");
    if (genreIdx >= 0) {
      const col = String.fromCharCode(65 + genreIdx);
      (worksheet as any).dataValidations.add(`${col}4:${col}${3 + TOTAL_DATA_ROWS}`, {
        type: "list",
        allowBlank: true,
        formulae: ['"M,F"'],
        showErrorMessage: true,
        errorTitle: "Valeur invalide",
        error: "Utilisez M (Masculin) ou F (Féminin)",
      });
    }

    // ── Figer lignes 1-2 (bannière + en-têtes toujours visibles) ────────────
    worksheet.views = [{ state: "frozen", xSplit: 0, ySplit: 2 }];

    // ── Téléchargement ────────────────────────────────────────────────────────
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
      `Supprimez la ligne EXEMPLE, remplissez et réimportez template_${templateName}.xlsx.`
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

/**
 * Exporte le tableau récapitulatif des paiements (page Paiements) en Excel natif.
 * - Trié par classe (ordre naturel), puis Payé → Partiel → Non payé, puis nom
 * - En-tête de classe avec totaux : attendu / payé / reste
 * - Ligne vide entre chaque classe
 */
export async function exportPaymentSummaryToXLSX(
  summaries: Array<{
    student:     { matricule: string; firstName: string; lastName: string; classId?: string };
    className:   string;
    expectedFee: number;
    totalPaid:   number;
    remaining:   number;
    status:      string;
  }>,
  period: string,
  academicYear: string,
  filename: string,
): Promise<void> {
  const STATUS_ORDER: Record<string, number> = { unpaid: 0, partial: 1, paid: 2 };
  const STATUS_LABEL: Record<string, string>  = { paid: "Payé", partial: "Partiel", unpaid: "Non payé" };

  // Trier : classe → statut (impayé d'abord) → nom
  const sorted = [...summaries].sort((a, b) => {
    const cc = a.className.localeCompare(b.className, "fr", { numeric: true });
    if (cc !== 0) return cc;
    const sc = (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9);
    if (sc !== 0) return sc;
    return `${a.student.lastName} ${a.student.firstName}`.localeCompare(
      `${b.student.lastName} ${b.student.firstName}`, "fr"
    );
  });

  // Grouper par classe
  const groups = new Map<string, typeof sorted>();
  for (const s of sorted) {
    if (!groups.has(s.className)) groups.set(s.className, []);
    groups.get(s.className)!.push(s);
  }

  const { Workbook } = await import("exceljs");
  const workbook = new Workbook();
  workbook.creator = "Structura";
  workbook.created = new Date();

  const ws = workbook.addWorksheet("Paiements");
  const COLS = [
    { header: "Matricule",    key: "mat",       width: 18 },
    { header: "Prénom",       key: "prenom",    width: 20 },
    { header: "Nom",          key: "nom",       width: 20 },
    { header: "Classe",       key: "classe",    width: 16 },
    { header: "Période",      key: "periode",   width: 20 },
    { header: "Année",        key: "annee",     width: 14 },
    { header: "Attendu",      key: "attendu",   width: 14 },
    { header: "Payé",         key: "paye",      width: 14 },
    { header: "Reste",        key: "reste",     width: 14 },
    { header: "Statut",       key: "statut",    width: 14 },
  ];
  ws.columns = COLS;
  styleHeaderRow(ws.getRow(1));
  ws.views = [{ state: "frozen", xSplit: 0, ySplit: 1 }];

  const numFmt = '#,##0';

  for (const [className, rows] of groups) {
    const totalAttendu = rows.reduce((s, r) => s + (r.expectedFee ?? 0), 0);
    const totalPaye    = rows.reduce((s, r) => s + (r.totalPaid  ?? 0), 0);
    const totalReste   = rows.reduce((s, r) => s + (r.remaining  ?? 0), 0);
    const nbPaids      = rows.filter(r => r.status === "paid").length;

    const groupLabel = `  ${className}  —  ${rows.length} élève${rows.length > 1 ? "s" : ""}  |  Attendu : ${totalAttendu.toLocaleString("fr-FR")} GNF  |  Payé : ${totalPaye.toLocaleString("fr-FR")} GNF  |  Reste : ${totalReste.toLocaleString("fr-FR")} GNF  |  ${nbPaids}/${rows.length} payés`;
    const groupRow = ws.addRow(Array(COLS.length).fill(""));
    styleGroupRow(groupRow, groupLabel, COLS.length);
    ws.mergeCells(`A${groupRow.number}:J${groupRow.number}`);

    for (const s of rows) {
      const row = ws.addRow({
        mat:     s.student.matricule,
        prenom:  s.student.firstName,
        nom:     s.student.lastName,
        classe:  s.className,
        periode: period,
        annee:   academicYear,
        attendu: s.expectedFee ?? 0,
        paye:    s.totalPaid   ?? 0,
        reste:   s.remaining   ?? 0,
        statut:  STATUS_LABEL[s.status] ?? s.status,
      });
      styleDataRow(row);
      // Format numérique pour Attendu / Payé / Reste
      (["attendu", "paye", "reste"] as const).forEach(k => {
        row.getCell(k).numFmt = numFmt;
      });
      // Couleur statut
      const statusColor = s.status === "paid" ? "FF16A34A" : s.status === "partial" ? "FFB45309" : "FFDC2626";
      row.getCell("statut").font = { bold: true, color: { argb: statusColor }, size: 10, name: "Calibri" };
    }

    ws.addRow([]); // séparateur
  }

  await triggerXLSXDownload(workbook, filename);
  showSuccess(
    "Export réussi !",
    `${filename}.xlsx — ${summaries.length} élève${summaries.length > 1 ? "s" : ""} · ${period} · ${academicYear}`
  );
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
