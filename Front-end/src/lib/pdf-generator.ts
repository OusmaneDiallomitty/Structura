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
  /**
   * Montant réellement payé PAR mois — dictionnaire { "Octobre 2026": 120000, "Novembre 2026": 60000 }.
   * Plus robuste qu'un tableau indexé (pas de risque de décalage si indexOf échoue).
   * Utilisé pour les paiements mixtes (certains mois complets, dernier partiel).
   */
  monthAmounts?: Record<string, number>;
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
   * Catégorie du paiement — adapte le titre et le récapitulatif :
   * - "inscription"    → "REÇU D'INSCRIPTION", pas de récap scolarité annuelle
   * - "reinscription"  → "REÇU DE RÉINSCRIPTION", pas de récap scolarité annuelle
   * - "scolarite"      → comportement par défaut (récap annuel affiché)
   * - undefined        → comportement par défaut
   */
  paymentCategory?: "scolarite" | "inscription" | "reinscription";
  /**
   * Lignes supplémentaires affichées dans le tableau (paiement combiné).
   * Ex : [{ label: "Frais de réinscription 2026-2027", amount: 50000 }]
   * Le TOTAL inclut ces montants en plus de `amount`.
   */
  extraLines?: { label: string; amount: number }[];
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
  /**
   * Montant déjà versé lors d'un précédent paiement partiel pour ce même mois.
   * Permet au PDF d'afficher correctement un paiement complémentaire (mois soldé).
   */
  completionAlreadyPaid?: number;
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

  // Badge titre — adapté selon la catégorie
  const badgeTitles: Record<string, string> = {
    inscription:   "RECU D'INSCRIPTION",
    reinscription: "RECU DE REINSCRIPTION",
    contribution:  "RECU DE CONTRIBUTION",
    default:       "RECU DE PAIEMENT",
  };
  const badgeTitle = data.isContribution
    ? badgeTitles.contribution
    : data.paymentCategory === "inscription"
    ? badgeTitles.inscription
    : data.paymentCategory === "reinscription"
    ? badgeTitles.reinscription
    : badgeTitles.default;
  const badgeW = badgeTitle.length > 20 ? 80 : 62; const badgeH = 8;
  const badgeX = textX - badgeW / 2;
  const isInscReceipt = data.paymentCategory === "inscription" || data.paymentCategory === "reinscription";
  if (isInscReceipt) {
    doc.setFillColor(139, 92, 246); // violet pour inscription
  } else if (data.isContribution) {
    doc.setFillColor(16, 185, 129);
  } else {
    doc.setFillColor(59, 130, 246);
  }
  doc.roundedRect(badgeX, 25, badgeW, badgeH, 2, 2, "F");
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  doc.text(badgeTitle, textX, 30.5, { align: "center" });

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
  const payType = data.paymentCategory === "inscription"
    ? "Inscription"
    : data.paymentCategory === "reinscription"
    ? "Reinscription"
    : data.term?.startsWith("Annuel")
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
  doc.setTextColor(isInscReceipt ? 139 : 59, isInscReceipt ? 92 : 130, isInscReceipt ? 246 : 246);
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
  // Montant réellement payé par mois (peut être inférieur à monthlyFee pour un paiement partiel)
  const perMonth = months.length > 0
    ? Math.round(data.amount / months.length)
    : data.amount;
  // En mode complétion, le seuil "complet" est réduit (montant déjà versé déduit)
  const completionAlreadyPaid = data.completionAlreadyPaid ?? 0;
  // Frais mensuel attendu (pour détecter les paiements partiels)
  const expectedPerMonth = completionAlreadyPaid > 0
    ? Math.max(0, (data.monthlyFee ?? perMonth) - completionAlreadyPaid)
    : (data.monthlyFee ?? perMonth);
  // monthAmounts : montants individuels par mois (paiement mixte complet+partiel)
  const monthAmounts = data.monthAmounts ?? null;

  // Positions des colonnes
  // Col1 (Mois)   : ML       → ML+95   (95 mm)
  // Col2 (Frais)  : ML+95    → ML+150  (55 mm)
  // Col3 (Statut) : ML+150   → MR      (20 mm)
  const C1    = ML;
  const C2    = ML + 95;
  const C3    = ML + 150;
  const ROW_H = 8;

  // Helper : dessine une ligne de mois (mutualisé)
  // Utilise monthAmounts[month] (dictionnaire) pour un lookup robuste par nom de mois.
  const drawMonthRow = (month: string, indented: boolean, rowIndex: number) => {
    if (rowIndex % 2 === 0) {
      doc.setFillColor(248, 250, 252);
      doc.rect(ML, yPos, TW, ROW_H, "F");
    }
    // Montant pour ce mois : dictionnaire en priorité, sinon perMonth global
    const rowAmount = (monthAmounts && monthAmounts[month] !== undefined)
      ? monthAmounts[month]
      : perMonth;
    const rowIsPartial = rowAmount < expectedPerMonth;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(31, 41, 55);
    doc.text(month, indented ? C1 + 10 : C1 + 4, yPos + 5.5);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(31, 41, 55);
    doc.text(fmt(rowAmount), C3 - 4, yPos + 5.5, { align: "right" });
    // Badge : PARTIEL (amber) ou PAYE (vert)
    if (rowIsPartial) {
      doc.setFillColor(254, 243, 199);
      doc.roundedRect(C3 + 1, yPos + 1.5, MR - C3 - 1, ROW_H - 3, 1, 1, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.setTextColor(180, 83, 9);
      doc.text("Partiel", (C3 + MR) / 2, yPos + 5.5, { align: "center" });
    } else {
      doc.setFillColor(209, 250, 229);
      doc.roundedRect(C3 + 1, yPos + 1.5, MR - C3 - 1, ROW_H - 3, 1, 1, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.setTextColor(16, 185, 129);
      doc.text("Paye", (C3 + MR) / 2, yPos + 5.5, { align: "center" });
    }
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
      const isComplete = completionAlreadyPaid > 0
        ? true  // Mode complétion : le mois est soldé dans ce reçu
        : group.paidMonths.length === group.totalMonths;
      const headerLabel = completionAlreadyPaid > 0
        ? `${group.trimestre}  —  Complément (mois soldé)`
        : isComplete
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

  // Lignes supplémentaires (paiement combiné : inscription + scolarité)
  const extraLines = data.extraLines ?? [];
  if (extraLines.length > 0) {
    extraLines.forEach((line, i) => {
      if (i % 2 === 0) {
        doc.setFillColor(245, 243, 255); // violet très léger
        doc.rect(ML, yPos, TW, ROW_H, "F");
      }
      doc.setFont("helvetica", "italic");
      doc.setFontSize(9);
      doc.setTextColor(109, 40, 217); // violet-700
      doc.text(`+ ${line.label}`, C1 + 4, yPos + 5.5);
      doc.setFont("helvetica", "bold");
      doc.text(fmt(line.amount), C3 - 4, yPos + 5.5, { align: "right" });
      doc.setFillColor(237, 233, 254); // violet-100
      doc.roundedRect(C3 + 1, yPos + 1.5, MR - C3 - 1, ROW_H - 3, 1, 1, "F");
      doc.setFontSize(7);
      doc.setTextColor(109, 40, 217);
      doc.text("Paye", (C3 + MR) / 2, yPos + 5.5, { align: "center" });
      yPos += ROW_H;
    });
  }

  // Ligne note "reste à payer" — affichée pour chaque mois partiel (via monthAmounts ou paiement global partiel)
  const partialNotes: { month: string; remain: number }[] = [];
  if (monthAmounts && months.length > 0) {
    // Dictionnaire : lookup par nom de mois (robuste)
    months.forEach((month) => {
      const paid = monthAmounts[month] ?? perMonth;
      if (paid < expectedPerMonth) {
        partialNotes.push({ month, remain: expectedPerMonth - paid });
      }
    });
  } else if (perMonth < expectedPerMonth && months.length > 0) {
    partialNotes.push({ month: months[months.length - 1], remain: expectedPerMonth - perMonth });
  }
  if (partialNotes.length > 0) {
    doc.setFillColor(255, 251, 235);
    doc.rect(ML, yPos, TW, (ROW_H - 1) * partialNotes.length, "F");
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    doc.setTextColor(180, 83, 9);
    partialNotes.forEach((note) => {
      doc.text(`${note.month} — Reste a regler : ${fmt(note.remain)}  (mensuel : ${fmt(expectedPerMonth)})`, C1 + 4, yPos + 4.5);
      yPos += ROW_H - 1;
    });
  }

  // Ligne séparatrice avant le total
  doc.setDrawColor(isInscReceipt ? 139 : 59, isInscReceipt ? 92 : 130, 246);
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
  const extraTotal = extraLines.reduce((s, l) => s + l.amount, 0);
  const grandTotal = data.amount + extraTotal;
  const totalLabel = totalMonthCount > 1
    ? `TOTAL  (${totalMonthCount} mois)`
    : "TOTAL";
  doc.text(totalLabel, C1 + 4, yPos + 6);
  doc.text(fmt(grandTotal), MR - 4, yPos + 6, { align: "right" });
  yPos += ROW_H + 7;

  // ─────────────── RÉCAPITULATIF ─────────────────────────
  // Pour inscription/réinscription : pas de récapitulatif scolarité annuelle
  if (data.expectedFee && data.expectedFee > 0 && data.totalPaid !== undefined && !isInscReceipt) {
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

// ─── Proclamation des résultats ───────────────────────────────────────────────

export interface ProclamationStudent {
  rank: number;
  firstName: string;
  lastName: string;
  gender: string | null | undefined;
  generalAverage: number;
  totalSubjects: number;
}

export interface ProclamationData {
  schoolName: string;
  className: string;
  term: string;
  academicYear: string;
  passThreshold: number;
  scoreMax: number;
  students: ProclamationStudent[];
  classAverage: number;
}

function getMention(avg: number, scoreMax: number): string {
  const ratio = avg / scoreMax;
  if (ratio >= 0.9) return "Excellent";
  if (ratio >= 0.8) return "Très bien";
  if (ratio >= 0.7) return "Bien";
  if (ratio >= 0.6) return "Assez bien";
  if (ratio >= 0.5) return "Passable";
  return "Insuffisant";
}

function ordinal(n: number, gender: string | null | undefined): string {
  const isFemale = gender === "F";
  if (n === 1) return isFemale ? "1ère" : "1er";
  return `${n}ème`;
}

/** Supprime les accents pour jsPDF Helvetica (ne supporte pas Unicode) */
function ascii(str: string): string {
  return str
    .replace(/[àâä]/g, "a").replace(/[ÀÂÄÁ]/g, "A")
    .replace(/[éèêë]/g, "e").replace(/[ÉÈÊË]/g, "E")
    .replace(/[îï]/g,   "i").replace(/[ÎÏ]/g,   "I")
    .replace(/[ôö]/g,   "o").replace(/[ÔÖ]/g,   "O")
    .replace(/[ùûü]/g,  "u").replace(/[ÙÛÜ]/g,  "U")
    .replace(/[ç]/g,    "c").replace(/[Ç]/g,     "C")
    .replace(/[æ]/g,   "ae").replace(/[Æ]/g,    "AE")
    .replace(/[œ]/g,   "oe").replace(/[Œ]/g,    "OE")
    .replace(/[≥]/g,   ">=").replace(/[≤]/g,    "<=");
}

export function generateProclamationPDF(data: ProclamationData) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.width;   // 210
  const pageH = doc.internal.pageSize.height;  // 297
  const margin = 12;
  const contentW = pageW - margin * 2;         // 186

  // ── Calculs statistiques ──────────────────────────────────────────────────
  const composed  = data.students.filter((s) => s.totalSubjects > 0);
  const admitted  = composed.filter((s) => s.generalAverage >= data.passThreshold);
  const failed    = composed.filter((s) => s.generalAverage < data.passThreshold);
  const girls     = data.students.filter((s) => s.gender === "F");
  const boys      = data.students.filter((s) => s.gender === "M");
  const girlsComp = girls.filter((s) => s.totalSubjects > 0);
  const boysComp  = boys.filter((s) => s.totalSubjects > 0);
  const girlsAdm  = girlsComp.filter((s) => s.generalAverage >= data.passThreshold);
  const boysAdm   = boysComp.filter((s)  => s.generalAverage >= data.passThreshold);
  const rate      = composed.length > 0 ? Math.round((admitted.length / composed.length) * 100) : 0;
  const girlsRate = girlsComp.length > 0 ? Math.round((girlsAdm.length / girlsComp.length) * 100) : 0;
  const boysRate  = boysComp.length  > 0 ? Math.round((boysAdm.length  / boysComp.length)  * 100) : 0;

  // Rangs partagés (ex aequo)
  const rankCount: Record<number, number> = {};
  for (const st of data.students) {
    if (st.totalSubjects > 0) rankCount[st.rank] = (rankCount[st.rank] ?? 0) + 1;
  }

  // ── HEADER ────────────────────────────────────────────────────────────────
  doc.setFillColor(37, 99, 235);
  doc.rect(0, 0, pageW, 28, "F");
  doc.setFillColor(251, 191, 36);
  doc.rect(0, 28, pageW, 1.5, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(ascii(data.schoolName.toUpperCase()), pageW / 2, 10, { align: "center" });
  doc.setFontSize(9);
  doc.text("PROCLAMATION DES RESULTATS", pageW / 2, 17, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  const dateStr = new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
  doc.text(
    ascii(`${data.term}  |  Classe : ${data.className}  |  Annee scolaire : ${data.academicYear}  |  ${dateStr}`),
    pageW / 2, 24, { align: "center" }
  );

  // ── 3 BADGES RÉSUMÉ ───────────────────────────────────────────────────────
  let y = 34;
  const badgeW = (contentW - 6) / 3;
  const badgeH = 15;
  const badges: { label: string; value: string; sub: string; color: [number,number,number] }[] = [
    { label: "EFFECTIF COMPOSE", value: `${composed.length} / ${data.students.length}`, sub: `${data.students.length - composed.length} absent(s)`, color: [59, 130, 246] },
    { label: "ADMIS(ES)",        value: `${admitted.length} eleve(s)`,                  sub: `Taux : ${rate}%`,                                     color: [16, 185, 129] },
    { label: "MOYENNE CLASSE",   value: `${data.classAverage.toFixed(2)} / ${data.scoreMax}`, sub: ascii(`Seuil >= ${data.passThreshold}/${data.scoreMax}`), color: [124, 58, 237] },
  ];
  badges.forEach((b, i) => {
    const bx = margin + i * (badgeW + 3);
    doc.setFillColor(...b.color);
    doc.roundedRect(bx, y, badgeW, badgeH, 2, 2, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(b.value, bx + badgeW / 2, y + 7, { align: "center" });
    doc.setFontSize(6);
    doc.setFont("helvetica", "normal");
    doc.text(b.label, bx + badgeW / 2, y + 11, { align: "center" });
    doc.text(ascii(b.sub), bx + badgeW / 2, y + 14, { align: "center" });
  });

  y += badgeH + 6;

  // ── TABLEAU STATISTIQUES ──────────────────────────────────────────────────
  const sLW = 68;                          // largeur colonne label
  const sDW = (contentW - sLW) / 3;       // largeur colonnes données
  const sCols = [
    { x: margin,               w: sLW,  label: "",        al: "left"   as const },
    { x: margin + sLW,         w: sDW,  label: "TOTAL",   al: "center" as const },
    { x: margin + sLW + sDW,   w: sDW,  label: "FILLES",  al: "center" as const },
    { x: margin + sLW + 2*sDW, w: sDW,  label: "GARCONS", al: "center" as const },
  ];
  const sRowH = 6.5;

  // En-tête stats
  doc.setFillColor(30, 41, 55);
  doc.rect(margin, y, contentW, sRowH, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  for (const c of sCols) {
    if (!c.label) continue;
    const tx = c.al === "left" ? c.x + 3 : c.x + c.w / 2;
    doc.text(c.label, tx, y + sRowH * 0.70, { align: c.al === "left" ? "left" : "center" });
  }
  y += sRowH;

  const statRows: [string, string|number, string|number, string|number, number][] = [
    ["Inscrits",                              data.students.length, girls.length,               boys.length,               0],
    ["Ont compose",                           composed.length,      girlsComp.length,            boysComp.length,            0],
    [ascii(`Ont la moyenne (>= ${data.passThreshold})`), admitted.length, girlsAdm.length,       boysAdm.length,             2],
    ["N'ont pas la moyenne",                  failed.length,        girlsComp.length-girlsAdm.length, boysComp.length-boysAdm.length, 3],
    ["Taux de reussite",                      `${rate}%`,           `${girlsRate}%`,             `${boysRate}%`,             4],
  ];

  statRows.forEach(([label, tot, f, b, colorIdx], i) => {
    const ry = y + i * sRowH;
    const bgColors: [number,number,number][] = [
      [247,248,250],[255,255,255],[236,253,245],[255,243,243],[239,246,255],
    ];
    doc.setFillColor(...bgColors[colorIdx] ?? [255,255,255]);
    doc.rect(margin, ry, contentW, sRowH, "F");
    doc.setDrawColor(215, 220, 230);
    doc.rect(margin, ry, contentW, sRowH);
    for (const c of sCols.slice(1)) doc.line(c.x, ry, c.x, ry + sRowH);

    doc.setFont("helvetica", i === 4 ? "bold" : "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(30, 41, 55);
    doc.text(ascii(String(label)), sCols[0].x + 3, ry + sRowH * 0.72);

    const textColors: [number,number,number][] = [
      [30,41,55],[30,41,55],[5,150,80],[185,28,28],[37,99,235],
    ];
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...textColors[colorIdx] ?? [30,41,55]);
    [[tot,1],[f,2],[b,3]].forEach(([val, ci]) => {
      const col = sCols[ci as number];
      doc.text(String(val), col.x + col.w / 2, ry + sRowH * 0.72, { align: "center" });
    });
  });

  y += statRows.length * sRowH + 6;

  // ── TITRE CLASSEMENT ─────────────────────────────────────────────────────
  doc.setFillColor(251, 191, 36);
  doc.rect(margin, y, contentW, 1, "F");
  y += 4;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(30, 41, 59);
  doc.text("CLASSEMENT PAR ORDRE DE MERITE", margin, y + 4);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text(
    ascii(`${composed.length} classe(s)  |  ${admitted.length} admis(es)  |  ${failed.length} non admis(es)`),
    pageW - margin, y + 4, { align: "right" }
  );
  y += 9;

  // ── COLONNES CLASSEMENT (portrait : largeurs réduites) ───────────────────
  const rankRowH = 6.5;
  const rW = { rang: 20, nom: 72, moy: 22, mention: 36, decision: contentW - 20 - 72 - 22 - 36 };
  let rx = margin;
  const rX: Record<string, number> = {};
  for (const [k, v] of Object.entries(rW)) { rX[k] = rx; rx += v; }

  type ColDef = { x: number; w: number; label: string; al: "left"|"center" };
  const rCols: ColDef[] = [
    { x: rX.rang,     w: rW.rang,     label: "RANG",        al: "center" },
    { x: rX.nom,      w: rW.nom,      label: "NOM & PRENOM",al: "left"   },
    { x: rX.moy,      w: rW.moy,      label: "MOYENNE",     al: "center" },
    { x: rX.mention,  w: rW.mention,  label: "MENTION",     al: "center" },
    { x: rX.decision, w: rW.decision, label: "DECISION",    al: "center" },
  ];

  const drawRankHeader = (yh: number) => {
    doc.setFillColor(30, 41, 55);
    doc.rect(margin, yh, contentW, rankRowH, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    for (const c of rCols) {
      const tx = c.al === "left" ? c.x + 3 : c.x + c.w / 2;
      doc.text(c.label, tx, yh + rankRowH * 0.70, { align: c.al === "left" ? "left" : "center" });
    }
    return yh + rankRowH;
  };

  y = drawRankHeader(y);
  let page = 1;

  for (let ri = 0; ri < data.students.length; ri++) {
    const st = data.students[ri];

    if (y + rankRowH > pageH - 12) {
      addFooter(doc, page);
      doc.addPage();
      page++;
      y = 10;
      y = drawRankHeader(y);
    }

    const isFemale = st.gender === "F";
    const isAdmis  = st.totalSubjects > 0 && st.generalAverage >= data.passThreshold;
    const noComp   = st.totalSubjects === 0;
    const isExAeq  = !noComp && rankCount[st.rank] > 1;

    // Fond ligne
    if (isAdmis)      { doc.setFillColor(240, 253, 244); }
    else if (!noComp) { doc.setFillColor(ri % 2 === 0 ? 255 : 250, ri % 2 === 0 ? 255 : 250, ri % 2 === 0 ? 255 : 254); }
    else              { doc.setFillColor(249, 250, 251); }
    doc.rect(margin, y, contentW, rankRowH, "F");
    doc.setDrawColor(220, 225, 235);
    doc.rect(margin, y, contentW, rankRowH);
    for (const c of rCols.slice(1)) doc.line(c.x, y, c.x, y + rankRowH);

    const cy = y + rankRowH * 0.72;
    doc.setFontSize(7.5);

    // Rang
    if (noComp) {
      doc.setTextColor(160, 160, 160); doc.setFont("helvetica", "normal");
      doc.text("-", rX.rang + rW.rang / 2, cy, { align: "center" });
    } else if (isExAeq) {
      doc.setTextColor(124, 58, 237); doc.setFont("helvetica", "bold");
      doc.setFontSize(6.5);
      doc.text(ordinal(st.rank, st.gender), rX.rang + rW.rang / 2, y + 3.2, { align: "center" });
      doc.setFontSize(5); doc.setFont("helvetica", "normal");
      doc.text("Ex Aequo", rX.rang + rW.rang / 2, y + 5.6, { align: "center" });
    } else {
      doc.setTextColor(30, 41, 59); doc.setFont("helvetica", "bold"); doc.setFontSize(7.5);
      doc.text(ordinal(st.rank, st.gender), rX.rang + rW.rang / 2, cy, { align: "center" });
    }

    // Nom
    doc.setFont("helvetica", noComp ? "normal" : "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(noComp ? 150 : 30, noComp ? 150 : 41, noComp ? 150 : 59);
    doc.text(ascii(`${st.lastName.toUpperCase()} ${st.firstName}`), rX.nom + 3, cy);

    // Moyenne
    doc.setFont("helvetica", "bold"); doc.setFontSize(8);
    if (noComp) { doc.setTextColor(160,160,160); doc.text("-", rX.moy + rW.moy/2, cy, { align: "center" }); }
    else if (isAdmis) { doc.setTextColor(5,150,105); doc.text(st.generalAverage.toFixed(2), rX.moy + rW.moy/2, cy, { align: "center" }); }
    else              { doc.setTextColor(220,38,38);  doc.text(st.generalAverage.toFixed(2), rX.moy + rW.moy/2, cy, { align: "center" }); }

    // Mention
    doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(71,85,105);
    doc.text(noComp ? "-" : ascii(getMention(st.generalAverage, data.scoreMax)), rX.mention + rW.mention/2, cy, { align: "center" });

    // Décision
    if (!noComp) {
      const decLabel = isAdmis ? (isFemale ? "ADMISE" : "ADMIS") : (isFemale ? "REFUSEE" : "REFUSE");
      const [dr,dg,db]   = isAdmis ? [5,150,105]   : [220,38,38];
      const [br,bg,bb]   = isAdmis ? [209,250,229]  : [254,226,226];
      const decCx = rX.decision + rW.decision / 2;
      const bw = 22;
      doc.setFillColor(br, bg, bb);
      doc.roundedRect(decCx - bw/2, y + 1, bw, rankRowH - 2, 1, 1, "F");
      doc.setTextColor(dr, dg, db);
      doc.setFont("helvetica", "bold"); doc.setFontSize(6.5);
      doc.text(decLabel, decCx, cy, { align: "center" });
    } else {
      doc.setTextColor(150,150,150); doc.setFont("helvetica","normal"); doc.setFontSize(7);
      doc.text(isFemale ? "Absente" : "Absent", rX.decision + rW.decision/2, cy, { align: "center" });
    }

    y += rankRowH;
  }

  addFooter(doc, page);
  const safeClass = data.className.replace(/[^a-zA-Z0-9]/g, "-");
  doc.save(`proclamation-${safeClass}-${ascii(data.term).replace(/\s+/g, "-")}.pdf`);
}
