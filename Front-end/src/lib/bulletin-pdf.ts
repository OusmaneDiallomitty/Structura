/**
 * Générateur PDF de bulletins scolaires
 * Utilise jsPDF 4.x — WinAnsi couvre tous les caractères français (U+00C0–U+00FF)
 * Barèmes /10 (Primaire) et /20 (Collège/Lycée)
 */

import jsPDF from 'jspdf';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BulletinGrade {
  subject: string;
  score: number;
  maxScore: number;
  coefficient: number;
  teacherName?: string;
}

export interface BulletinData {
  studentName: string;
  matricule: string;
  className: string;
  level?: string;
  trimester: string;
  academicYear: string;
  schoolName?: string;
  /** Logo de l'école en base64 data URL (optionnel) */
  schoolLogo?: string;
  grades: BulletinGrade[];
  weightedAvg: number | null;
  maxScore: number;
  classAvg?: number | null;
  classRank?: number | null;
  totalStudents?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function appre(score: number, maxScore: number): string {
  const pct = score / maxScore;
  if (pct >= 0.9) return 'Excellent';
  if (pct >= 0.8) return 'Très bien';
  if (pct >= 0.7) return 'Bien';
  if (pct >= 0.6) return 'Assez bien';
  if (pct >= 0.5) return 'Passable';
  return 'Insuffisant';
}

function appreText(avg: number, maxScore: number): string {
  const pct = avg / maxScore;
  if (pct >= 0.9) return 'Félicitations ! Excellent travail, continuez ainsi.';
  if (pct >= 0.8) return 'Très bien ! Des résultats remarquables ce trimestre.';
  if (pct >= 0.7) return 'Bien ! La classe peut encore progresser.';
  if (pct >= 0.6) return 'Assez bien. Des efforts supplémentaires sont souhaitables.';
  if (pct >= 0.5) return 'Passable. Des efforts sont nécessaires pour progresser.';
  return "Insuffisant. Un travail sérieux s'impose pour redresser la situation.";
}

// ─── Layout constants ─────────────────────────────────────────────────────────
// Seuils A4 (297 mm) :
//   BREAK_ROW   : si une ligne de matière dépasse ce seuil → nouvelle page
//   BREAK_BOTTOM: si les sections basses (moyenne+stats+signature ≈ 55 mm)
//                 ne tiendraient plus → nouvelle page avant de les dessiner
const BREAK_ROW    = 262;
const BREAK_BOTTOM = 230;
const PAGE_W = 210;
const MARGIN = 14;
const CONTENT_W = PAGE_W - 2 * MARGIN;

// Positions des colonnes (définies une seule fois)
const COL = {
  subject: MARGIN,
  coef:    MARGIN + 76,
  score:   MARGIN + 96,
  pct:     MARGIN + 120,
  appre:   MARGIN + 141,
};

/** Dessine l'en-tête du tableau de notes (réutilisé après saut de page) */
function drawTableHeader(doc: jsPDF, y: number): number {
  doc.setFillColor(37, 99, 235);
  doc.rect(MARGIN, y, CONTENT_W, 8, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('Matière',       COL.subject + 2, y + 5.5);
  doc.text('Coef',          COL.coef    + 2, y + 5.5);
  doc.text('Note',          COL.score   + 2, y + 5.5);
  doc.text('%',             COL.pct     + 2, y + 5.5);
  doc.text('Appréciation',  COL.appre   + 2, y + 5.5);
  doc.setFont('helvetica', 'normal');
  return y + 8;
}

/** Dessine le pied de page sur la page courante avec numéro de page */
function drawFooter(doc: jsPDF): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pageNum = (doc as any).internal.getCurrentPageInfo().pageNumber as number;
  doc.setFontSize(7);
  doc.setTextColor(170, 170, 170);
  doc.text(
    `Généré le ${new Date().toLocaleDateString('fr-FR')} par Structura · Page ${pageNum}/{total_pages}`,
    PAGE_W / 2,
    290,
    { align: 'center' },
  );
}

// ─── Dessin d'un bulletin sur la/les page(s) courante(s) ──────────────────────

function drawBulletin(doc: jsPDF, data: BulletinData): void {

  // ── HEADER ──────────────────────────────────────────────────────────────────
  doc.setFillColor(37, 99, 235);
  doc.rect(0, 0, PAGE_W, 38, 'F');

  // Logo (si disponible) — affiché en haut à gauche du header
  if (data.schoolLogo) {
    try {
      const fmt = data.schoolLogo.startsWith('data:image/png') ? 'PNG'
        : data.schoolLogo.startsWith('data:image/webp') ? 'WEBP'
        : 'JPEG';
      doc.addImage(data.schoolLogo, fmt, MARGIN, 5, 22, 22);
    } catch {
      // Logo invalide — on continue sans lui
    }
  }

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(17);
  doc.setFont('helvetica', 'bold');
  doc.text(data.schoolName || 'Mon École', PAGE_W / 2, 13, { align: 'center' });

  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text('BULLETIN DE NOTES', PAGE_W / 2, 23, { align: 'center' });

  doc.setFontSize(9);
  doc.text(`${data.academicYear}   |   ${data.trimester}`, PAGE_W / 2, 31, { align: 'center' });

  // ── INFORMATIONS ÉLÈVE ───────────────────────────────────────────────────────
  let y = 45;

  doc.setFillColor(243, 244, 246);
  doc.rect(MARGIN, y, CONTENT_W, 26, 'F');
  doc.setDrawColor(209, 213, 219);
  doc.setLineWidth(0.3);
  doc.rect(MARGIN, y, CONTENT_W, 26, 'S');

  doc.setTextColor(30, 30, 30);
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.text('INFORMATIONS ÉLÈVE', MARGIN + 3, y + 6);

  doc.setFont('helvetica', 'normal');
  doc.text(`Nom et Prénom : ${data.studentName}`, MARGIN + 3,  y + 13);
  doc.text(`Matricule : ${data.matricule}`,        MARGIN + 3,  y + 20);
  doc.text(`Classe : ${data.className}`,            MARGIN + 98, y + 13);
  if (data.level) doc.text(`Niveau : ${data.level}`, MARGIN + 98, y + 20);

  // ── TABLEAU DES NOTES ────────────────────────────────────────────────────────
  y += 32;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(37, 99, 235);
  doc.text('RÉSULTATS DU TRIMESTRE', MARGIN, y);
  y += 5;

  y = drawTableHeader(doc, y);

  doc.setFont('helvetica', 'normal');

  for (let i = 0; i < data.grades.length; i++) {
    const g = data.grades[i];
    const rowH = 7;

    // Saut de page si la ligne déborde
    if (y + rowH > BREAK_ROW) {
      drawFooter(doc);
      doc.addPage();
      y = 15;
      y = drawTableHeader(doc, y);
    }

    // Alternance couleur
    if (i % 2 === 0) {
      doc.setFillColor(249, 250, 251);
      doc.rect(MARGIN, y, CONTENT_W, rowH, 'F');
    }

    // Bordures légères
    doc.setDrawColor(229, 231, 235);
    doc.setLineWidth(0.2);
    doc.line(COL.coef,  y, COL.coef,  y + rowH);
    doc.line(COL.score, y, COL.score, y + rowH);
    doc.line(COL.pct,   y, COL.pct,   y + rowH);
    doc.line(COL.appre, y, COL.appre, y + rowH);
    doc.rect(MARGIN, y, CONTENT_W, rowH, 'S');

    const pct = g.score / g.maxScore;

    // Couleur selon score
    if (pct >= 0.8)      doc.setTextColor(5, 150, 105);
    else if (pct >= 0.5) doc.setTextColor(37, 99, 235);
    else                  doc.setTextColor(220, 38, 38);

    doc.setFontSize(8);
    doc.text(`${g.score.toFixed(1)}/${g.maxScore}`, COL.score + 2, y + 5);
    doc.text(`${(pct * 100).toFixed(0)}%`,          COL.pct   + 2, y + 5);

    doc.setTextColor(30, 30, 30);
    const label = g.subject.length > 42 ? g.subject.substring(0, 40) + '..' : g.subject;
    doc.text(label,                      COL.subject + 2, y + 5);
    doc.text(String(g.coefficient),      COL.coef    + 2, y + 5);
    doc.text(appre(g.score, g.maxScore), COL.appre   + 2, y + 5);

    y += rowH;
  }

  // Saut de page si les sections basses ne tiennent plus
  // Sections basses = moyenne (14) + stats (18) + signature (25) ≈ 57 mm
  if (y > BREAK_BOTTOM) {
    drawFooter(doc);
    doc.addPage();
    y = 15;
  }

  // ── MOYENNE GÉNÉRALE ─────────────────────────────────────────────────────────
  y += 3;
  const avg = data.weightedAvg;

  if (avg !== null && avg !== undefined) {
    const avgPct = avg / data.maxScore;
    const [r, g2, b] = avgPct >= 0.8
      ? [5, 150, 105]
      : avgPct >= 0.5
      ? [37, 99, 235]
      : [220, 38, 38];

    doc.setFillColor(r, g2, b);
    doc.rect(MARGIN, y, CONTENT_W, 10, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('MOYENNE GÉNÉRALE',                  MARGIN + 3,   y + 7);
    doc.text(`${avg.toFixed(2)} / ${data.maxScore}`, MARGIN + 98, y + 7);
    doc.text(appre(avg, data.maxScore),            MARGIN + 138, y + 7);
    y += 14;
  }

  // ── STATISTIQUES DE CLASSE ───────────────────────────────────────────────────
  doc.setFillColor(249, 250, 251);
  doc.rect(MARGIN, y, CONTENT_W, 14, 'F');
  doc.setDrawColor(209, 213, 219);
  doc.setLineWidth(0.3);
  doc.rect(MARGIN, y, CONTENT_W, 14, 'S');

  doc.setTextColor(80, 80, 80);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');

  const row1 = y + 6;
  const row2 = y + 11;

  if (data.classAvg !== null && data.classAvg !== undefined) {
    doc.text(`Moy. de classe : ${data.classAvg.toFixed(2)} / ${data.maxScore}`, MARGIN + 3, row1);
  }
  if (data.classRank !== null && data.classRank !== undefined && data.totalStudents) {
    doc.text(`Rang : ${data.classRank} / ${data.totalStudents}`, MARGIN + 90, row1);
  }
  if (avg !== null && avg !== undefined) {
    doc.setFont('helvetica', 'italic');
    doc.text(`Appréciation : ${appreText(avg, data.maxScore)}`, MARGIN + 3, row2);
  }

  y += 18;

  // ── SIGNATURE ────────────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(30, 30, 30);
  doc.text('Signature du Directeur :', MARGIN + 98, y + 5);
  doc.setDrawColor(100, 100, 100);
  doc.setLineWidth(0.4);
  doc.line(MARGIN + 132, y + 13, MARGIN + 165, y + 13);

  // ── PIED DE PAGE ─────────────────────────────────────────────────────────────
  drawFooter(doc);
}

// ─── API publique ──────────────────────────────────────────────────────────────

/** Génère et télécharge le PDF d'un seul bulletin */
export function generateBulletinPDF(data: BulletinData): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  drawBulletin(doc, data);
  doc.putTotalPages('{total_pages}');
  const name = data.studentName.replace(/\s+/g, '-');
  const trim = data.trimester.replace(/\s+/g, '-');
  doc.save(`bulletin-${name}-${trim}.pdf`);
}

/** Génère et télécharge un PDF contenant tous les bulletins (1 par page) */
export function generateAllBulletinsPDF(
  bulletins: BulletinData[],
  className: string,
  trimester: string,
): void {
  if (bulletins.length === 0) return;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  for (let i = 0; i < bulletins.length; i++) {
    if (i > 0) doc.addPage();
    drawBulletin(doc, bulletins[i]);
  }
  doc.putTotalPages('{total_pages}');
  const cls  = className.replace(/\s+/g, '-');
  const trim = trimester.replace(/\s+/g, '-');
  doc.save(`bulletins-${cls}-${trim}.pdf`);
}
