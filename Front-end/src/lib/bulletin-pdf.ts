/**
 * Générateur PDF de bulletins scolaires — Design Premium v2
 * Utilise jsPDF 4.x — WinAnsi couvre tous les caractères français (U+00C0–U+00FF)
 * Barèmes /20 (Collège/Lycée)
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
  /** Genre de l'élève — "Masculin" ou "Féminin" — pour accord du rang (1er / 1ère) */
  gender?: string | null;
}

// ─── Palette de couleurs ───────────────────────────────────────────────────────

const COLORS = {
  primary:    [30, 58, 138]   as [number,number,number], // indigo-900
  primaryMid: [37, 99, 235]   as [number,number,number], // indigo-600
  primaryLight:[239, 246, 255] as [number,number,number], // indigo-50
  accent:     [16, 185, 129]  as [number,number,number], // emerald-500
  accentLight:[236, 253, 245] as [number,number,number], // emerald-50
  danger:     [220, 38, 38]   as [number,number,number], // red-600
  dangerLight:[254, 242, 242] as [number,number,number], // red-50
  warning:    [245, 158, 11]  as [number,number,number], // amber-500
  warningLight:[255, 251, 235] as [number,number,number], // amber-50
  white:      [255, 255, 255] as [number,number,number],
  gray50:     [249, 250, 251] as [number,number,number],
  gray100:    [243, 244, 246] as [number,number,number],
  gray200:    [229, 231, 235] as [number,number,number],
  gray400:    [156, 163, 175] as [number,number,number],
  gray600:    [75, 85, 99]    as [number,number,number],
  gray800:    [31, 41, 55]    as [number,number,number],
};

// ─── Layout constants ─────────────────────────────────────────────────────────
const BREAK_ROW    = 255;
const BREAK_BOTTOM = 225;
const PAGE_W  = 210;
const MARGIN  = 12;
const CONTENT_W = PAGE_W - 2 * MARGIN;

// Colonnes du tableau
const COL = {
  subject: MARGIN,
  coef:    MARGIN + 78,
  score:   MARGIN + 98,
  pct:     MARGIN + 122,
  appre:   MARGIN + 143,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function scoreColor(score: number, maxScore: number): [number,number,number] {
  const pct = score / maxScore;
  if (pct >= 0.8) return COLORS.accent;
  if (pct >= 0.5) return COLORS.primaryMid;
  return COLORS.danger;
}

function scoreBg(score: number, maxScore: number): [number,number,number] {
  const pct = score / maxScore;
  if (pct >= 0.8) return COLORS.accentLight;
  if (pct >= 0.5) return COLORS.primaryLight;
  return COLORS.dangerLight;
}

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

/** Applique une couleur de remplissage */
function fill(doc: jsPDF, c: [number,number,number]) {
  doc.setFillColor(c[0], c[1], c[2]);
}

/** Applique une couleur de trait */
function stroke(doc: jsPDF, c: [number,number,number]) {
  doc.setDrawColor(c[0], c[1], c[2]);
}

/** Applique une couleur de texte */
function textColor(doc: jsPDF, c: [number,number,number]) {
  doc.setTextColor(c[0], c[1], c[2]);
}

// ─── En-tête du tableau (réutilisé après saut de page) ────────────────────────

function drawTableHeader(doc: jsPDF, y: number): number {
  // Fond header
  fill(doc, COLORS.primary);
  doc.rect(MARGIN, y, CONTENT_W, 8, 'F');

  // Accent stripe sur la gauche
  fill(doc, COLORS.accent);
  doc.rect(MARGIN, y, 2, 8, 'F');

  textColor(doc, COLORS.white);
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.text('Matière / Professeur', COL.subject + 4, y + 5.5);
  doc.text('Coef',                  COL.coef    + 2, y + 5.5);
  doc.text('Moy.',                  COL.score   + 2, y + 5.5);
  doc.text('%',                     COL.pct     + 2, y + 5.5);
  doc.text('Appréciation',          COL.appre   + 2, y + 5.5);
  doc.setFont('helvetica', 'normal');
  return y + 8;
}

// ─── Pied de page ─────────────────────────────────────────────────────────────

function drawFooter(doc: jsPDF): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pageNum = (doc as any).internal.getCurrentPageInfo().pageNumber as number;

  // Ligne décorative
  stroke(doc, COLORS.gray200);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, 285, PAGE_W - MARGIN, 285);

  doc.setFontSize(6.5);
  textColor(doc, COLORS.gray400);
  doc.text(
    `Document généré le ${new Date().toLocaleDateString('fr-FR')} · Structura · Page ${pageNum}/{total_pages}`,
    PAGE_W / 2,
    289,
    { align: 'center' },
  );
}

// ─── Dessin du bulletin complet ────────────────────────────────────────────────

function drawBulletin(doc: jsPDF, data: BulletinData): void {

  // ════════════════════════════════════════
  // HEADER PREMIUM
  // ════════════════════════════════════════

  // Fond principal header
  fill(doc, COLORS.primary);
  doc.rect(0, 0, PAGE_W, 46, 'F');

  // Bande décorative bas du header
  fill(doc, COLORS.accent);
  doc.rect(0, 44, PAGE_W, 2.5, 'F');

  // ── Logo école (gauche) ──────────────────
  if (data.schoolLogo) {
    try {
      const fmt = data.schoolLogo.startsWith('data:image/png')  ? 'PNG'
        : data.schoolLogo.startsWith('data:image/webp') ? 'WEBP'
        : 'JPEG';
      doc.addImage(data.schoolLogo, fmt, MARGIN, 5, 28, 28);
    } catch {
      // Logo invalide — continue sans lui
    }
  }

  // ── République de Guinée (droite) ────────
  const rightX = PAGE_W - MARGIN;

  // "REPUBLIQUE DE GUINEE"
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  textColor(doc, COLORS.white);
  doc.text('REPUBLIQUE DE GUINEE', rightX, 11, { align: 'right' });

  // Ligne séparatrice fine sous le titre
  doc.setLineWidth(0.3);
  doc.setDrawColor(255, 255, 255);
  doc.setGState(doc.GState({ opacity: 0.3 }));
  const repW = doc.getTextWidth('REPUBLIQUE DE GUINEE');
  doc.line(rightX - repW, 13, rightX, 13);
  doc.setGState(doc.GState({ opacity: 1 }));

  // Devise : Travail · Justice · Solidarité (couleurs du drapeau guinéen)
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');

  const sep = ' - ';
  const sepW = doc.getTextWidth(sep);
  const travailW    = doc.getTextWidth('Travail');
  const justiceW    = doc.getTextWidth('Justice');
  const solidariteW = doc.getTextWidth('Solidarit\u00E9');
  const totalMottoW = travailW + sepW + justiceW + sepW + solidariteW;
  const mottoStartX = rightX - totalMottoW;
  const mottoY = 20;

  // "Travail" — rouge drapeau (#CE1126)
  doc.setTextColor(206, 17, 38);
  doc.text('Travail', mottoStartX, mottoY);

  // " - " blanc
  textColor(doc, COLORS.white);
  doc.text(sep, mottoStartX + travailW, mottoY);

  // "Justice" — jaune drapeau (#FCD116)
  doc.setTextColor(252, 209, 22);
  doc.text('Justice', mottoStartX + travailW + sepW, mottoY);

  // " - " blanc
  textColor(doc, COLORS.white);
  doc.text(sep, mottoStartX + travailW + sepW + justiceW, mottoY);

  // "Solidarité" — vert drapeau (#009460)
  doc.setTextColor(0, 148, 96);
  doc.text('Solidarit\u00E9', mottoStartX + travailW + sepW + justiceW + sepW, mottoY);

  // ── Nom de l'école (centre) ───────────────
  textColor(doc, COLORS.white);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(data.schoolName || 'Mon École', PAGE_W / 2, 14, { align: 'center' });

  // Sous-titre
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  textColor(doc, [199, 210, 254]); // indigo-200
  doc.text('BULLETIN DE NOTES', PAGE_W / 2, 23, { align: 'center' });

  // Année | Trimestre
  doc.setFontSize(8);
  textColor(doc, COLORS.white);
  doc.text(`${data.academicYear}   ·   ${data.trimester}`, PAGE_W / 2, 33, { align: 'center' });

  // ════════════════════════════════════════
  // INFORMATIONS ÉLÈVE
  // ════════════════════════════════════════

  let y = 54;

  // Carte élève avec bordure colorée à gauche
  fill(doc, COLORS.gray50);
  doc.rect(MARGIN, y, CONTENT_W, 28, 'F');

  fill(doc, COLORS.primaryMid);
  doc.rect(MARGIN, y, 3, 28, 'F');

  stroke(doc, COLORS.gray200);
  doc.setLineWidth(0.3);
  doc.rect(MARGIN, y, CONTENT_W, 28, 'S');

  // Titre section
  textColor(doc, COLORS.primary);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.text('INFORMATIONS ÉLÈVE', MARGIN + 6, y + 6);

  // Séparateur interne
  stroke(doc, COLORS.gray200);
  doc.setLineWidth(0.2);
  doc.line(MARGIN + 6, y + 8, MARGIN + CONTENT_W - 6, y + 8);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);

  // Colonne gauche
  textColor(doc, COLORS.gray400);
  doc.text('Nom & Prénom', MARGIN + 6, y + 15);
  doc.text('Matricule',    MARGIN + 6, y + 22);

  textColor(doc, COLORS.gray800);
  doc.setFont('helvetica', 'bold');
  doc.text(data.studentName, MARGIN + 30, y + 15);
  doc.text(data.matricule,   MARGIN + 30, y + 22);

  // Colonne droite
  textColor(doc, COLORS.gray400);
  doc.setFont('helvetica', 'normal');
  doc.text('Classe',  MARGIN + 100, y + 15);
  if (data.level) doc.text('Niveau', MARGIN + 100, y + 22);

  textColor(doc, COLORS.gray800);
  doc.setFont('helvetica', 'bold');
  doc.text(data.className, MARGIN + 115, y + 15);
  if (data.level) doc.text(data.level, MARGIN + 115, y + 22);

  // ════════════════════════════════════════
  // TABLEAU DES NOTES
  // ════════════════════════════════════════

  y += 34;

  // Titre section avec barre accent
  fill(doc, COLORS.primaryMid);
  doc.rect(MARGIN, y - 1, 3, 9, 'F');
  textColor(doc, COLORS.primary);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('RÉSULTATS DU TRIMESTRE', MARGIN + 6, y + 5.5);
  y += 10;

  y = drawTableHeader(doc, y);
  doc.setFont('helvetica', 'normal');

  for (let i = 0; i < data.grades.length; i++) {
    const g = data.grades[i];
    const hasTeacher = !!g.teacherName;
    const rowH = hasTeacher ? 10 : 8;

    // Saut de page si débordement
    if (y + rowH > BREAK_ROW) {
      drawFooter(doc);
      doc.addPage();
      y = 15;
      y = drawTableHeader(doc, y);
    }

    // Fond alternance
    if (i % 2 === 0) {
      fill(doc, COLORS.gray50);
      doc.rect(MARGIN, y, CONTENT_W, rowH, 'F');
    }

    // Accent stripe gauche (toutes les lignes)
    const [sr, sg, sb] = scoreColor(g.score, g.maxScore);
    doc.setFillColor(sr, sg, sb);
    doc.setGState(doc.GState({ opacity: 0.35 }));
    doc.rect(MARGIN, y, 2, rowH, 'F');
    doc.setGState(doc.GState({ opacity: 1 }));

    // Score — fond coloré dans la cellule
    const [br, bg2, bb] = scoreBg(g.score, g.maxScore);
    doc.setFillColor(br, bg2, bb);
    doc.rect(COL.score, y + 0.5, 21, rowH - 1, 'F');

    // Séparateurs verticaux
    stroke(doc, COLORS.gray200);
    doc.setLineWidth(0.15);
    doc.line(COL.coef,  y, COL.coef,  y + rowH);
    doc.line(COL.score, y, COL.score, y + rowH);
    doc.line(COL.pct,   y, COL.pct,   y + rowH);
    doc.line(COL.appre, y, COL.appre, y + rowH);

    // Bordure basse
    stroke(doc, COLORS.gray200);
    doc.setLineWidth(0.2);
    doc.line(MARGIN, y + rowH, MARGIN + CONTENT_W, y + rowH);

    const midY = hasTeacher ? y + 5 : y + (rowH / 2) + 2;

    // Matière
    textColor(doc, COLORS.gray800);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    const label = g.subject.length > 40 ? g.subject.substring(0, 38) + '..' : g.subject;
    doc.text(label, COL.subject + 4, midY);

    // Nom du professeur (si disponible)
    if (hasTeacher) {
      textColor(doc, COLORS.gray400);
      doc.setFontSize(6.5);
      doc.setFont('helvetica', 'italic');
      const tLabel = `Prof. ${g.teacherName}`;
      doc.text(tLabel.length > 45 ? tLabel.substring(0, 43) + '..' : tLabel, COL.subject + 4, y + 8);
    }

    // Coefficient
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    textColor(doc, COLORS.gray600);
    doc.text(String(g.coefficient), COL.coef + 2, midY);

    // Score — texte coloré
    const midYScore = y + rowH / 2 + 2;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    textColor(doc, scoreColor(g.score, g.maxScore));
    doc.text(`${g.score.toFixed(1)}/${g.maxScore}`, COL.score + 2, midYScore);

    // Pourcentage
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    textColor(doc, COLORS.gray600);
    const pct = g.score / g.maxScore;
    doc.text(`${(pct * 100).toFixed(0)}%`, COL.pct + 2, midY);

    // Appréciation
    doc.setFontSize(7.5);
    textColor(doc, COLORS.gray600);
    doc.text(appre(g.score, g.maxScore), COL.appre + 2, midY);

    y += rowH;
  }

  // Saut de page si sections basses ne tiennent plus
  if (y > BREAK_BOTTOM) {
    drawFooter(doc);
    doc.addPage();
    y = 15;
  }

  // ════════════════════════════════════════
  // MOYENNE GÉNÉRALE
  // ════════════════════════════════════════

  y += 4;
  const avg = data.weightedAvg;

  if (avg !== null && avg !== undefined) {
    const [r, g2, b] = scoreColor(avg, data.maxScore);

    // Fond coloré de la moyenne
    doc.setFillColor(r, g2, b);
    doc.rect(MARGIN, y, CONTENT_W, 12, 'F');

    // Motif décoratif
    doc.setFillColor(255, 255, 255);
    doc.setGState(doc.GState({ opacity: 0.08 }));
    for (let k = 0; k < 5; k++) {
      doc.rect(MARGIN + CONTENT_W - 25 + k * 6, y, 4, 12, 'F');
    }
    doc.setGState(doc.GState({ opacity: 1 }));

    textColor(doc, COLORS.white);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text('MOYENNE GÉNÉRALE', MARGIN + 6, y + 8);

    doc.setFontSize(13);
    doc.text(`${avg.toFixed(2)} / ${data.maxScore}`, MARGIN + 95, y + 8.5);

    doc.setFontSize(8.5);
    doc.text(appre(avg, data.maxScore), MARGIN + 142, y + 8);

    y += 16;
  }

  // ════════════════════════════════════════
  // STATISTIQUES DE CLASSE
  // ════════════════════════════════════════

  fill(doc, COLORS.gray50);
  doc.rect(MARGIN, y, CONTENT_W, 18, 'F');
  stroke(doc, COLORS.gray200);
  doc.setLineWidth(0.3);
  doc.rect(MARGIN, y, CONTENT_W, 18, 'S');

  // Titre section
  fill(doc, COLORS.primaryMid);
  doc.rect(MARGIN, y, 3, 18, 'F');

  textColor(doc, COLORS.primary);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.text('STATISTIQUES DE CLASSE', MARGIN + 6, y + 6);

  // Ligne de séparation interne
  stroke(doc, COLORS.gray200);
  doc.setLineWidth(0.2);
  doc.line(MARGIN + 6, y + 8, MARGIN + CONTENT_W - 6, y + 8);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);

  const statsY = y + 13.5;

  if (data.classAvg !== null && data.classAvg !== undefined) {
    textColor(doc, COLORS.gray400);
    doc.text('Moy. de classe :', MARGIN + 6, statsY);
    textColor(doc, COLORS.gray800);
    doc.setFont('helvetica', 'bold');
    doc.text(`${data.classAvg.toFixed(2)} / ${data.maxScore}`, MARGIN + 35, statsY);
  }

  if (data.classRank !== null && data.classRank !== undefined && data.totalStudents) {
    doc.setFont('helvetica', 'normal');
    textColor(doc, COLORS.gray400);
    doc.text('Rang :', MARGIN + 85, statsY);
    textColor(doc, COLORS.gray800);
    doc.setFont('helvetica', 'bold');
    doc.text(`${data.classRank}${ordinal(data.classRank, data.gender)} / ${data.totalStudents} élèves`, MARGIN + 98, statsY);
  }

  if (avg !== null && avg !== undefined) {
    y += 22;
    // Appréciation générale sur fond léger
    const [ar, ag, ab] = scoreBg(avg, data.maxScore);
    doc.setFillColor(ar, ag, ab);
    doc.rect(MARGIN, y, CONTENT_W, 9, 'F');
    stroke(doc, COLORS.gray200);
    doc.setLineWidth(0.2);
    doc.rect(MARGIN, y, CONTENT_W, 9, 'S');

    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7.5);
    textColor(doc, COLORS.gray600);
    const appreStr = appreText(avg, data.maxScore);
    doc.text(appreStr, MARGIN + 4, y + 5.5);
    y += 13;
  } else {
    y += 22;
  }

  // ════════════════════════════════════════
  // SIGNATURE
  // ════════════════════════════════════════

  y += 2;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  textColor(doc, COLORS.gray600);
  doc.text('Lu et approuvé par le parent / tuteur :', MARGIN + 3, y + 5);
  doc.text('Signature du Directeur :', MARGIN + 100, y + 5);

  stroke(doc, COLORS.gray400);
  doc.setLineWidth(0.4);
  doc.line(MARGIN + 3, y + 18, MARGIN + 70, y + 18);
  doc.line(MARGIN + 100, y + 18, MARGIN + 170, y + 18);

  // ─── Pied de page ────────────────────────────────────────────────────────────
  drawFooter(doc);
}

/** Suffixe ordinal français (1er/1ère, 2e, 3e…) — accordé selon le genre */
function ordinal(n: number, gender?: string | null): string {
  if (n === 1) return gender === 'Féminin' ? 'ère' : 'er';
  return 'e';
}

// ─── API publique ──────────────────────────────────────────────────────────────

/** Télécharge le PDF d'un seul bulletin */
export function generateBulletinPDF(data: BulletinData): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  drawBulletin(doc, data);
  doc.putTotalPages('{total_pages}');
  const name = data.studentName.replace(/\s+/g, '-');
  const trim = data.trimester.replace(/\s+/g, '-');
  doc.save(`bulletin-${name}-${trim}.pdf`);
}

/** Ouvre le bulletin d'un élève dans un onglet pour impression */
export function printBulletinPDF(data: BulletinData): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  drawBulletin(doc, data);
  doc.putTotalPages('{total_pages}');
  const url = doc.output('bloburi') as unknown as string;
  const win = window.open(url, '_blank');
  if (win) win.focus();
}

/** Télécharge un PDF contenant tous les bulletins (1 par page) */
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

/** Ouvre tous les bulletins dans un onglet pour impression */
export function printAllBulletinsPDF(
  bulletins: BulletinData[],
  _className: string,
): void {
  if (bulletins.length === 0) return;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  for (let i = 0; i < bulletins.length; i++) {
    if (i > 0) doc.addPage();
    drawBulletin(doc, bulletins[i]);
  }
  doc.putTotalPages('{total_pages}');
  const url = doc.output('bloburi') as unknown as string;
  const win = window.open(url, '_blank');
  if (win) win.focus();
}
