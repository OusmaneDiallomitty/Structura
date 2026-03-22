import jsPDF from "jspdf";

/**
 * Formate un montant dans la devise donnée avec espace ordinaire comme séparateur de milliers.
 * On évite toLocaleString("fr-FR") qui génère une espace insécable (NBSP U+00A0)
 * que jsPDF rend souvent comme "/" dans sa police Helvetica par défaut.
 */
function fmtAmount(amount: number, currency: string): string {
  return Math.round(amount)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " " + currency;
}

/**
 * Formate le terme de paiement de façon lisible pour le reçu.
 * "Annuel 2026-2027"              → "Scolarité annuelle complète"
 * "Trimestre 1"                   → "Trimestre 1"
 * "Octobre 2026"                  → "Octobre 2026"
 * "Octobre 2026, Novembre 2026"   → "Octobre 2026 · Novembre 2026"
 */
function formatReceiptTerm(term?: string): string {
  if (!term) return "";
  if (term.startsWith("Annuel")) return "Scolarité annuelle complète";
  if (term.startsWith("Trimestre")) return term;
  if (term.includes(",")) {
    const months = term.split(",").map((s) => s.trim());
    if (months.length <= 4) return months.join(" · ");
    return `${months[0]} → ${months[months.length - 1]} (${months.length} mois)`;
  }
  return term;
}

// Configuration de base
const COLORS = {
  primary: "#3b82f6",
  secondary: "#6b7280",
  success: "#10b981",
  danger: "#ef4444",
  dark: "#1f2937",
  light: "#f3f4f6",
};

// Fonction helper pour ajouter le header
function addHeader(doc: jsPDF, title: string, schoolName: string) {
  // Logo/Nom de l'école
  doc.setFillColor(COLORS.primary);
  doc.rect(0, 0, 210, 40, "F");
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(24);
  doc.setFont("helvetica", "bold");
  doc.text(schoolName, 105, 20, { align: "center" });
  
  doc.setFontSize(12);
  doc.setFont("helvetica", "normal");
  doc.text(title, 105, 30, { align: "center" });
  
  // Reset couleur
  doc.setTextColor(COLORS.dark);
}

// Fonction helper pour ajouter le footer
function addFooter(doc: jsPDF, pageNumber: number) {
  const pageHeight = doc.internal.pageSize.height;
  doc.setFontSize(8);
  doc.setTextColor(COLORS.secondary);
  doc.text(
    `Page ${pageNumber} — Généré le ${new Date().toLocaleString("fr-FR", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    })}`,
    105,
    pageHeight - 10,
    { align: "center" }
  );
}

// ─── Types exportés ──────────────────────────────────────────────────────────

/** Mode de sortie du PDF. Par défaut : "download". */
export type ReceiptOutputMode = "download" | "preview" | "print";

/**
 * Paramètres du reçu de paiement.
 * Interface exportée pour permettre aux consommateurs de stocker
 * les paramètres et de choisir le mode de sortie plus tard (ex: dialog succès).
 */
export interface PaymentReceiptData {
  receiptNumber: string;
  studentName: string;
  studentMatricule?: string;
  className: string;
  amount: number;
  totalPaid?: number;
  expectedFee?: number;
  remaining?: number;
  date: string;
  paymentMethod: string;
  description?: string;
  academicYear?: string;
  term?: string;
  schoolName: string;
  schoolAddress: string;
  schoolPhone: string;
  /** Logo de l'école en base64 (data:image/...) ou URL publique */
  schoolLogo?: string;
  /** Liste ordonnée des mois couverts par ce paiement, ex: ["Octobre 2026", "Novembre 2026"] */
  months?: string[];
  /** Frais mensuel unitaire pour remplir la colonne "Frais mensuel" */
  monthlyFee?: number;
  /** Code devise actif (ex: "GNF", "XOF", "EUR"). Défaut : "GNF". */
  currency?: string;
  /**
   * Mode contribution (école publique) — change tous les libellés :
   * "REÇU DE PAIEMENT" → "REÇU DE CONTRIBUTION", supprime le récapitulatif annuel, etc.
   */
  isContribution?: boolean;
  /**
   * Décomposition par trimestre — active le rendu groupé.
   * Envoyé quand le paiement couvre des mois de trimestres différents
   * ou un trimestre partiellement. Chaque groupe = un sous-en-tête coloré.
   */
  trimestreBreakdown?: {
    label: string;       // "T1", "T2", "T3"
    trimestre: string;   // "Trimestre 1", "Trimestre 2", "Trimestre 3"
    paidMonths: string[];  // mois de ce trimestre couverts par ce paiement
    totalMonths: number;   // nb total de mois du trimestre dans le calendrier
  }[];
  /**
   * Mode de sortie du PDF.
   * - "download" (défaut) : force le téléchargement du fichier
   * - "preview"           : ouvre dans un nouvel onglet (affichage)
   * - "print"             : ouvre dans un nouvel onglet avec impression automatique
   */
  outputMode?: ReceiptOutputMode;
}

/**
 * Charge une image (URL ou data URL) et retourne une base64 data URL.
 * Retourne null en cas d'échec (logo non critique — le PDF est généré sans).
 */
async function loadLogoBase64(src: string): Promise<string | null> {
  if (!src) return null;
  if (src.startsWith("data:")) return src;
  try {
    const response = await fetch(src);
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror  = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/**
 * Ouvre un Blob PDF dans un nouvel onglet.
 * Utilise createObjectURL (jamais bloqué par les bloqueurs de popups)
 * et révoque l'URL automatiquement après usage.
 */
function openBlobInTab(blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const tab = window.open(url, "_blank");
  // Révoquer l'URL dès que l'onglet est chargé, ou après un timeout de sécurité
  if (tab) {
    tab.addEventListener("load", () => URL.revokeObjectURL(url), { once: true });
  }
  // Timeout de sécurité si l'événement load ne se déclenche pas
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

// Générer un reçu de paiement
export async function generatePaymentReceipt(data: PaymentReceiptData) {
  // Devise active pour tous les montants de ce reçu
  const fmt = (n: number) => fmtAmount(n, data.currency ?? "GNF");

  const doc   = new jsPDF();
  const ML    = 20;   // margin left
  const MR    = 190;  // margin right
  const TW    = 170;  // table/content width

  // ─────────────────────── EN-TÊTE (fond blanc, style document officiel) ───────────────────────
  // Fond blanc total
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, 210, 52, "F");

  // Barre bleue fine à gauche (accent vertical)
  doc.setFillColor(59, 130, 246);
  doc.rect(0, 0, 5, 52, "F");

  // Logo (optionnel) — directement sur fond blanc, aucun conteneur
  const logoB64 = data.schoolLogo ? await loadLogoBase64(data.schoolLogo) : null;
  if (logoB64) {
    try {
      doc.addImage(logoB64, "PNG", 12, 6, 38, 38);
    } catch { /* logo ignoré si format non supporté */ }
  }

  // Nom de l'école — texte sombre sur blanc
  const textX = logoB64 ? 130 : 105;
  doc.setTextColor(17, 24, 39);   // quasi-noir
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.text(data.schoolName, textX, 20, { align: "center" });

  // Badge "REÇU DE PAIEMENT" ou "REÇU DE CONTRIBUTION" — rectangle centré
  const badgeW = data.isContribution ? 72 : 62; const badgeH = 8;
  const badgeX = textX - badgeW / 2;
  doc.setFillColor(data.isContribution ? 16 : 59, data.isContribution ? 185 : 130, data.isContribution ? 129 : 246);
  doc.roundedRect(badgeX, 25, badgeW, badgeH, 2, 2, "F");
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  doc.text(data.isContribution ? "REÇU DE CONTRIBUTION" : "REÇU DE PAIEMENT", textX, 30.5, { align: "center" });

  if (data.schoolAddress || data.schoolPhone) {
    const contact = [data.schoolAddress, data.schoolPhone].filter(Boolean).join("  •  ");
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(107, 114, 128); // gris
    doc.text(contact, textX, 40, { align: "center" });
  }

  // Ligne de séparation fine
  doc.setDrawColor(229, 231, 235);
  doc.setLineWidth(0.5);
  doc.line(0, 52, 210, 52);

  // ─────────────────── N° REÇU & DATE ───────────────────
  doc.setTextColor(31, 41, 55);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text(`Reçu N° ${data.receiptNumber}`, ML, 58);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  // Tente de reformater la date ; si elle est déjà en français (ex: "21/03/2026"), on l'utilise telle quelle
  const parsedDate = new Date(data.date);
  const dateLabel = !isNaN(parsedDate.getTime())
    ? parsedDate.toLocaleString("fr-FR", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : data.date;
  doc.text(`Date : ${dateLabel}`, MR, 58, { align: "right" });

  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.4);
  doc.line(ML, 62, MR, 62);

  // ───────────────────── INFOS ÉLÈVE ─────────────────────
  const isAnnuel = !!data.term?.startsWith("Annuel");

  doc.setFillColor(248, 250, 252);
  doc.roundedRect(ML, 66, TW, 26, 2, 2, "F");

  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.setFont("helvetica", "bold");
  doc.text("ÉLÈVE", ML + 5, 73);

  doc.setTextColor(31, 41, 55);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(data.studentName, ML + 5, 81);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  const meta = [
    data.studentMatricule && `Matricule : ${data.studentMatricule}`,
    `Classe : ${data.className}`,
    data.academicYear && `Année : ${data.academicYear}`,
  ].filter(Boolean).join("     ");
  doc.text(meta, ML + 5, 88);

  // Mode de paiement + type (coin droit)
  const payType = data.term?.startsWith("Annuel")
    ? "Annuel"
    : data.term?.startsWith("Trimestre")
    ? "Trimestriel"
    : data.months && data.months.length > 1
    ? "Plurimensuel"
    : "Mensuel";
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 116, 139);
  doc.text(`Mode : ${data.paymentMethod}`, MR - 2, 73, { align: "right" });
  doc.setFont("helvetica", "bold");
  doc.setTextColor(59, 130, 246);
  doc.text(`Type : ${payType}`, MR - 2, 80, { align: "right" });

  // Badge SCOLARITÉ COMPLÈTE
  if (isAnnuel) {
    doc.setFillColor(16, 185, 129);
    doc.roundedRect(130, 78, 60, 8, 1, 1, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.text("SCOLARITE COMPLETE", 160, 83.5, { align: "center" });
  }

  // ─────────────────── TABLEAU DES MOIS ──────────────────
  let yPos = 100;

  const months   = data.months ?? [];
  const perMonth = data.monthlyFee
    ?? (months.length > 0 ? Math.round(data.amount / months.length) : data.amount);

  // Positions des colonnes
  // Col1 (Mois)   : ML       → ML+95   (95 mm)
  // Col2 (Frais)  : ML+95    → ML+150  (55 mm)
  // Col3 (Statut) : ML+150   → MR      (20 mm)
  const C1    = ML;
  const C2    = ML + 95;
  const C3    = ML + 150;
  const ROW_H = 8;

  // Helper : dessine une ligne de mois (mutualisé)
  const drawMonthRow = (month: string, indented: boolean, rowIndex: number) => {
    if (rowIndex % 2 === 0) {
      doc.setFillColor(248, 250, 252);
      doc.rect(ML, yPos, TW, ROW_H, "F");
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(31, 41, 55);
    doc.text(month, indented ? C1 + 10 : C1 + 4, yPos + 5.5);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(31, 41, 55);
    doc.text(fmt(perMonth), C3 - 4, yPos + 5.5, { align: "right" });
    doc.setFillColor(209, 250, 229);
    doc.roundedRect(C3 + 1, yPos + 1.5, MR - C3 - 1, ROW_H - 3, 1, 1, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(16, 185, 129);
    doc.text("Paye", (C3 + MR) / 2, yPos + 5.5, { align: "center" });
    yPos += ROW_H;
  };

  // Helper : dessine un sous-en-tête de trimestre (complet = indigo, partiel = amber)
  const drawTrimestreHeader = (label: string, isComplete: boolean) => {
    if (isComplete) {
      doc.setFillColor(224, 231, 255); // indigo-100
    } else {
      doc.setFillColor(254, 243, 199); // amber-100
    }
    doc.rect(ML, yPos, TW, ROW_H - 1, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    if (isComplete) {
      doc.setTextColor(79, 70, 229);  // indigo-600
    } else {
      doc.setTextColor(180, 83, 9);   // amber-700
    }
    doc.text(label, C1 + 4, yPos + 5);
    // Badge COMPLET / PARTIEL
    const badgeText = isComplete ? "COMPLET" : "PARTIEL";
    if (isComplete) {
      doc.setFillColor(99, 102, 241);  // indigo-500
    } else {
      doc.setFillColor(217, 119, 6);   // amber-600
    }
    doc.roundedRect(MR - 22, yPos + 1.5, 21, 5, 1, 1, "F");
    doc.setFontSize(6);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.text(badgeText, MR - 11.5, yPos + 5, { align: "center" });
    yPos += ROW_H - 1;
  };

  // Titre de section
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(data.isContribution ? "DETAIL DE LA CONTRIBUTION" : "DETAIL DES PAIEMENTS", ML, yPos);
  yPos += 5;

  // En-tête de tableau
  doc.setFillColor(data.isContribution ? 16 : 59, data.isContribution ? 185 : 130, data.isContribution ? 129 : 246);
  doc.rect(ML, yPos, TW, ROW_H + 1, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  const col2Label = data.isContribution
    ? "Montant"
    : payType === "Annuel"
    ? "Frais / mois"
    : payType === "Trimestriel"
    ? "Frais / mois"
    : "Frais mensuel";
  doc.text(data.isContribution ? "Libelle" : "Mois / Periode", C1 + 4, yPos + 5.5);
  doc.text(col2Label, C2 + (C3 - C2) / 2, yPos + 5.5, { align: "center" });
  doc.text("Statut", MR - 3, yPos + 5.5, { align: "right" });
  yPos += ROW_H + 1;

  // ── Rendu selon le mode ──────────────────────────────────

  if (data.trimestreBreakdown && data.trimestreBreakdown.length > 0) {
    // MODE GROUPÉ PAR TRIMESTRE
    // Utilisé quand le paiement couvre plusieurs trimestres ou un trimestre partiel.
    // Chaque groupe = sous-en-tête coloré (indigo=complet, amber=partiel) + lignes mois.
    data.trimestreBreakdown.forEach((group, groupIdx) => {
      const isComplete = group.paidMonths.length === group.totalMonths;
      const headerLabel = isComplete
        ? `${group.trimestre}  —  ${group.paidMonths.length} mois  (complet)`
        : `${group.trimestre}  —  ${group.paidMonths.length} mois sur ${group.totalMonths}  (partiel)`;
      drawTrimestreHeader(headerLabel, isComplete);
      group.paidMonths.forEach((month, i) => drawMonthRow(month, true, i));
      // Espace visuel entre les groupes (sauf après le dernier)
      if (groupIdx < data.trimestreBreakdown!.length - 1) yPos += 2;
    });

  } else if (data.term?.startsWith("Trimestre") && months.length > 0) {
    // MODE TRIMESTRE UNIQUE (rétrocompatibilité — paiement exactement T1/T2/T3)
    drawTrimestreHeader(`${data.term}  —  ${months.length} mois  (complet)`, true);
    months.forEach((month, i) => drawMonthRow(month, true, i));

  } else if (months.length > 0) {
    // MODE LISTE PLATE (mois individuels ou CSV sans info trimestre)
    months.forEach((month, i) => drawMonthRow(month, false, i));

  } else {
    // MODE FALLBACK — aucun mois détaillé, juste le terme textuel
    const termLabel = data.term
      ? formatReceiptTerm(data.term)
      : (data.description || "Frais de scolarite");
    doc.setFillColor(248, 250, 252);
    doc.rect(ML, yPos, TW, ROW_H, "F");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(31, 41, 55);
    doc.text(termLabel, C1 + 4, yPos + 5.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(31, 41, 55);
    doc.text(fmt(data.amount), C3 - 4, yPos + 5.5, { align: "right" });
    doc.setFillColor(209, 250, 229);
    doc.roundedRect(C3 + 1, yPos + 1.5, MR - C3 - 1, ROW_H - 3, 1, 1, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(16, 185, 129);
    doc.text("Paye", (C3 + MR) / 2, yPos + 5.5, { align: "center" });
    yPos += ROW_H;
  }

  // Ligne séparatrice avant le total
  doc.setDrawColor(59, 130, 246);
  doc.setLineWidth(0.5);
  doc.line(ML, yPos, MR, yPos);
  yPos += 0.5;

  // Ligne TOTAL (fond vert)
  doc.setFillColor(16, 185, 129);
  doc.rect(ML, yPos, TW, ROW_H + 2, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  const totalMonthCount = data.trimestreBreakdown
    ? data.trimestreBreakdown.reduce((s, g) => s + g.paidMonths.length, 0)
    : months.length;
  const totalLabel = totalMonthCount > 1
    ? `TOTAL  (${totalMonthCount} mois)`
    : "TOTAL";
  doc.text(totalLabel, C1 + 4, yPos + 6);
  doc.text(fmt(data.amount), MR - 4, yPos + 6, { align: "right" });
  yPos += ROW_H + 7;

  // ─────────────── RÉCAPITULATIF ─────────────────────────
  if (data.expectedFee && data.expectedFee > 0 && data.totalPaid !== undefined) {
    // En mode contribution, on n'affiche pas de "récapitulatif annuel" : just un résumé simple
    if (data.isContribution) {
      // Bloc résumé compact pour contribution
      doc.setFillColor(240, 253, 244); // green-50
      doc.roundedRect(ML, yPos, TW, 20, 2, 2, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(16, 185, 129);
      doc.text("Contribution versee avec succes", ML + 5, yPos + 13);
      doc.text(fmt(data.totalPaid), MR - 5, yPos + 13, { align: "right" });
      yPos += 26;
    } else {
      // Récapitulatif annuel standard (école privée)
      const hasRemainder = !!(data.remaining && data.remaining > 0);
      const recapH = hasRemainder ? 42 : 36;
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(ML, yPos, TW, recapH, 2, 2, "F");

      // Barre titre recap
      doc.setFillColor(59, 130, 246);
      doc.roundedRect(ML, yPos, TW, 10, 2, 2, "F");
      doc.rect(ML, yPos + 5, TW, 5, "F"); // carré bas pour arrondi top seulement
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(255, 255, 255);
      doc.text("RECAPITULATIF ANNUEL", ML + 5, yPos + 7);

      // Séparateur interne
      doc.setDrawColor(229, 231, 235);
      doc.setLineWidth(0.3);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(100, 116, 139);
      doc.text("Total attendu :", ML + 5, yPos + 20);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(31, 41, 55);
      doc.text(fmt(data.expectedFee), MR - 5, yPos + 20, { align: "right" });

      doc.line(ML + 5, yPos + 23, MR - 5, yPos + 23);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(100, 116, 139);
      doc.text("Total verse :", ML + 5, yPos + 30);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(16, 185, 129);
      doc.text(fmt(data.totalPaid), MR - 5, yPos + 30, { align: "right" });

      if (hasRemainder) {
        doc.line(ML + 5, yPos + 33, MR - 5, yPos + 33);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.setTextColor(100, 116, 139);
        doc.text("Reste a payer :", ML + 5, yPos + 40);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(239, 68, 68);
        doc.text(fmt(data.remaining!), MR - 5, yPos + 40, { align: "right" });
      } else {
        doc.line(ML + 5, yPos + 33, MR - 5, yPos + 33);
        doc.setFillColor(209, 250, 229);
        doc.roundedRect(ML + 5, yPos + 35, TW - 10, 8, 1, 1, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(16, 185, 129);
        doc.text("Scolarite integralement reglee", 105, yPos + 40.5, { align: "center" });
      }

      yPos += recapH + 6;
    }
  }

  // ──────────────────── NOTE LÉGALE ──────────────────────
  yPos += 4;
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text("Ce recu est valable comme preuve de paiement officielle.", 105, yPos, { align: "center" });

  // ─────────────────────── SIGNATURE ─────────────────────
  yPos += 18;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(31, 41, 55);
  doc.text("Signature & Cachet :", 140, yPos);
  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.3);
  doc.line(140, yPos + 14, 185, yPos + 14);

  // ───────────────────────── FOOTER ──────────────────────
  addFooter(doc, 1);

  // ────────────────────── SORTIE ─────────────────────────
  const safeName = data.studentName.replace(/\s+/g, "-");
  const filename  = `recu-${data.receiptNumber}-${safeName}.pdf`;

  switch (data.outputMode ?? "download") {
    case "preview":
      openBlobInTab(doc.output("blob"));
      break;
    case "print":
      // autoPrint() insère une instruction d'impression dans le PDF
      // → le navigateur ouvre la boîte de dialogue d'impression automatiquement
      doc.autoPrint();
      openBlobInTab(doc.output("blob"));
      break;
    default:
      doc.save(filename);
  }
}

// Générer un bulletin de notes
export function generateReportCard(data: {
  studentName: string;
  className: string;
  trimester: string;
  grades: {
    subject: string;
    grade: number;
    coefficient: number;
    teacher: string;
  }[];
  schoolName: string;
  schoolYear: string;
}) {
  const doc = new jsPDF();
  
  // Header
  addHeader(doc, "BULLETIN DE NOTES", data.schoolName);
  
  // Année scolaire
  doc.setFontSize(10);
  doc.setTextColor(COLORS.secondary);
  doc.text(`Année scolaire: ${data.schoolYear}`, 105, 45, { align: "center" });
  doc.text(`Trimestre: ${data.trimester}`, 105, 50, { align: "center" });
  
  // Informations de l'élève
  doc.setFontSize(11);
  doc.setTextColor(COLORS.dark);
  doc.setFont("helvetica", "bold");
  doc.text("ÉLÈVE", 20, 65);
  
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Nom: ${data.studentName}`, 20, 72);
  doc.text(`Classe: ${data.className}`, 20, 79);
  
  // Ligne de séparation
  doc.setDrawColor(COLORS.light);
  doc.line(20, 85, 190, 85);
  
  // Tableau des notes
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("NOTES", 20, 95);
  
  // En-tête du tableau
  doc.setFillColor(COLORS.primary);
  doc.rect(20, 100, 170, 10, "F");
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.text("Matière", 25, 107);
  doc.text("Note/20", 110, 107);
  doc.text("Coef.", 140, 107);
  doc.text("Professeur", 160, 107);
  
  // Lignes du tableau
  doc.setTextColor(COLORS.dark);
  doc.setFont("helvetica", "normal");
  
  let yPos = 117;
  let totalPoints = 0;
  let totalCoef = 0;
  
  data.grades.forEach((grade, index) => {
    // Alternance de couleur
    if (index % 2 === 0) {
      doc.setFillColor(COLORS.light);
      doc.rect(20, yPos - 7, 170, 10, "F");
    }
    
    doc.text(grade.subject, 25, yPos);
    
    // Couleur de la note selon la valeur
    if (grade.grade >= 16) {
      doc.setTextColor(COLORS.success);
    } else if (grade.grade >= 10) {
      doc.setTextColor(COLORS.primary);
    } else {
      doc.setTextColor(COLORS.danger);
    }
    doc.text(grade.grade.toFixed(2), 115, yPos);
    
    doc.setTextColor(COLORS.dark);
    doc.text(grade.coefficient.toString(), 145, yPos);
    doc.text(grade.teacher, 160, yPos);
    
    totalPoints += grade.grade * grade.coefficient;
    totalCoef += grade.coefficient;
    
    yPos += 10;
  });
  
  // Ligne de séparation
  doc.setDrawColor(COLORS.dark);
  doc.setLineWidth(1);
  doc.line(20, yPos, 190, yPos);
  
  // Moyenne générale
  const average = totalPoints / totalCoef;
  yPos += 10;
  
  doc.setFillColor(average >= 10 ? COLORS.success : COLORS.danger);
  doc.roundedRect(20, yPos, 170, 15, 3, 3, "F");
  
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("MOYENNE GÉNÉRALE", 30, yPos + 10);
  doc.setFontSize(14);
  doc.text(`${average.toFixed(2)}/20`, 150, yPos + 10);
  
  // Appréciation
  doc.setTextColor(COLORS.dark);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  yPos += 25;
  doc.text("Appréciation:", 20, yPos);
  
  let appreciation = "";
  if (average >= 16) appreciation = "Excellent travail!";
  else if (average >= 14) appreciation = "Très bien";
  else if (average >= 12) appreciation = "Bien";
  else if (average >= 10) appreciation = "Assez bien";
  else appreciation = "Doit faire plus d'efforts";
  
  doc.setFont("helvetica", "italic");
  doc.text(appreciation, 20, yPos + 7);
  
  // Footer
  addFooter(doc, 1);
  
  // Télécharger
  doc.save(`bulletin-${data.studentName.replace(/\s+/g, "-")}.pdf`);
}

// Générer un certificat de scolarité
export function generateSchoolCertificate(data: {
  studentName: string;
  dateOfBirth: string;
  className: string;
  schoolName: string;
  schoolAddress: string;
  directorName: string;
  certificateNumber: string;
}) {
  const doc = new jsPDF();
  
  // Header
  addHeader(doc, "CERTIFICAT DE SCOLARITÉ", data.schoolName);
  
  // Adresse
  doc.setFontSize(9);
  doc.setTextColor(COLORS.secondary);
  doc.text(data.schoolAddress, 105, 45, { align: "center" });
  
  // Numéro de certificat
  doc.setFontSize(10);
  doc.setTextColor(COLORS.dark);
  doc.text(`N° ${data.certificateNumber}`, 20, 60);
  
  // Contenu du certificat
  doc.setFontSize(12);
  doc.setFont("helvetica", "normal");
  
  const content = [
    "",
    "Le Directeur de l'établissement soussigné certifie que :",
    "",
    `Nom et Prénom : ${data.studentName}`,
    `Né(e) le : ${new Date(data.dateOfBirth).toLocaleDateString("fr-FR")}`,
    `Classe : ${data.className}`,
    "",
    `Est régulièrement inscrit(e) dans notre établissement`,
    `pour l'année scolaire en cours.`,
    "",
    "Ce certificat est délivré pour servir et valoir ce que de droit.",
  ];
  
  let yPos = 80;
  content.forEach((line) => {
    if (line.includes("Nom et Prénom") || line.includes("Né(e)") || line.includes("Classe")) {
      doc.setFont("helvetica", "bold");
    } else {
      doc.setFont("helvetica", "normal");
    }
    doc.text(line, 105, yPos, { align: "center", maxWidth: 160 });
    yPos += 10;
  });
  
  // Date et lieu
  yPos += 20;
  doc.setFont("helvetica", "normal");
  doc.text(
    `Fait à Conakry, le ${new Date().toLocaleDateString("fr-FR")}`,
    105,
    yPos,
    { align: "center" }
  );
  
  // Signature
  yPos += 20;
  doc.setFont("helvetica", "bold");
  doc.text("Le Directeur", 140, yPos);
  doc.setFont("helvetica", "normal");
  doc.text(data.directorName, 140, yPos + 7);
  doc.line(130, yPos + 15, 180, yPos + 15);
  
  // Cachet (cercle)
  doc.setDrawColor(COLORS.primary);
  doc.setLineWidth(2);
  doc.circle(50, yPos + 10, 15, "S");
  doc.setFontSize(8);
  doc.text("CACHET", 50, yPos + 10, { align: "center" });
  doc.text("DE L'ÉCOLE", 50, yPos + 15, { align: "center" });
  
  // Footer
  addFooter(doc, 1);
  
  // Télécharger
  doc.save(`certificat-${data.studentName.replace(/\s+/g, "-")}.pdf`);
}
