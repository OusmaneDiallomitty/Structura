/**
 * Utilitaire pour gérer les mois scolaires dynamiques
 * Basé sur academicYear.startMonth et durationMonths
 */

const MONTHS_GREGORIAN = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
];

export interface TermMonths {
  term: string;
  months: string[];
}

/**
 * Calcule les mois pour T1, T2, T3 selon le mois de rentrée et la durée
 * @param startMonth ex: "Octobre"
 * @param durationMonths ex: 9 (Octobre à Juin)
 * @returns Array<TermMonths>
 */
export function getTermsMonths(startMonth: string, durationMonths: number): TermMonths[] {
  const startIdx = MONTHS_GREGORIAN.indexOf(startMonth);
  if (startIdx === -1) {
    throw new Error(`Mois invalide: ${startMonth}`);
  }

  const months: string[] = [];
  for (let i = 0; i < Math.min(durationMonths, 12); i++) {
    months.push(MONTHS_GREGORIAN[(startIdx + i) % 12]);
  }

  if (months.length === 0) {
    throw new Error('Durée invalide');
  }

  // Diviser en T1/T2/T3 équilibrés
  const t1End = Math.ceil(months.length / 3);
  const t2End = t1End + Math.ceil((months.length - t1End) / 2);

  return [
    { term: 'Trimestre 1', months: months.slice(0, t1End) },
    { term: 'Trimestre 2', months: months.slice(t1End, t2End) },
    { term: 'Trimestre 3', months: months.slice(t2End) },
  ].filter((t) => t.months.length > 0);
}

/**
 * Obtient les 3 mois d'un trimestre
 */
export function getMonthsForTerm(startMonth: string, durationMonths: number, term: string): string[] {
  const terms = getTermsMonths(startMonth, durationMonths);
  const found = terms.find((t) => t.term === term);
  return found?.months || [];
}

/**
 * Vérifie si un mois appartient à un trimestre
 */
export function isMonthInTerm(
  startMonth: string,
  durationMonths: number,
  term: string,
  month: string
): boolean {
  const months = getMonthsForTerm(startMonth, durationMonths, term);
  return months.includes(month);
}
