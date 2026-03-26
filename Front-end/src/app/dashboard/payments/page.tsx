"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CLASSES_QUERY_KEY } from "@/hooks/queries/use-classes-query";
import { STUDENTS_QUERY_KEY } from "@/hooks/queries/use-students-query";
import { PAYMENTS_QUERY_KEY } from "@/hooks/queries/use-payments-query";
import {
  Search,
  Filter,
  Download,
  DollarSign,
  AlertCircle,
  CheckCircle2,
  Clock,
  WifiOff,
  Loader2,
  RefreshCw,
  Check,
  Users,
  TrendingUp,
  AlertTriangle,
  Bell,
  Calendar,
  Settings2,
  X,
  Plus,
  FileText,
  History,
  CreditCard,
  GraduationCap,
  Lock,
  Eye,
  Printer,
  PartyPopper,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { generatePaymentReceipt, type PaymentReceiptData, type ReceiptOutputMode } from "@/lib/pdf-generator";
import { toast } from "sonner";
import { offlineDB, STORES } from "@/lib/offline-db";
import { syncQueue } from "@/lib/sync-queue";
import { useOnline } from "@/hooks/use-online";
import { useRefreshOnFocus } from "@/hooks/use-refresh-on-focus";
import { useSubscription } from "@/hooks/use-subscription";
import { UpgradeBadge } from "@/components/shared/UpgradeBadge";
import * as storage from "@/lib/storage";
import { getPayments, createPayment, deletePayment } from "@/lib/api/payments.service";
import { getExpenseStats } from "@/lib/api/expenses.service";
import { getStudents } from "@/lib/api/students.service";
import { getClasses } from "@/lib/api/classes.service";
import { getCurrentAcademicYear } from "@/lib/api/academic-years.service";
import { getFeesConfig, updateFeesConfig } from "@/lib/api/fees.service";
import type { Payment, BackendStudent } from "@/types";
import { useAuth, usePermission } from "@/contexts/AuthContext";
import { formatClassName } from "@/lib/class-helpers";
import { cn } from "@/lib/utils";
import { exportPaymentSummaryToXLSX } from "@/lib/csv-handler";

// ─── Constantes ──────────────────────────────────────────────────────────────

const PAYMENT_FREQ_KEY    = "structura_payment_frequency";
const CLASS_FEES_KEY      = "structura_class_fees_v2";
const SCHOOL_CALENDAR_KEY = "structura_school_calendar_v1";
const SCHOOL_TYPE_KEY     = "structura_school_type";
const FEE_ITEMS_KEY       = "structura_fee_items_v1";
const CURRENT_YEAR_KEY    = "structura_current_year";

/** Année scolaire courante déduite de la date (ex: mars 2026 → "2025-2026") */
function guessSchoolYear(): string {
  const now = new Date();
  const year = now.getFullYear();
  return now.getMonth() + 1 >= 9 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
}

/** Lit l'année scolaire depuis le cache localStorage, ou la calcule en fallback */
function getCachedOrGuessedYear(): string {
  if (typeof window !== "undefined") {
    const cached = localStorage.getItem(CURRENT_YEAR_KEY);
    if (cached) return cached;
  }
  return guessSchoolYear();
}

type PaymentFrequency = "monthly" | "quarterly" | "annual";
type FeeMode = "global" | "by-level" | "by-class";

interface FeeConfig {
  mode: FeeMode;
  globalFee: number;
  byLevel: Record<string, number>;   // { "Primaire": 150000 }
  byClass: Record<string, number>;   // { "classId": 150000 }
  inscriptionFee?: number;       // Frais d'inscription (nouveaux élèves)
  reinscriptionFee?: number;     // Frais de réinscription (élèves existants)
}

interface ClassInfo {
  id: string;
  name: string;
  section?: string | null;
  level: string;         // Backend : "Maternelle" | "Primaire" | "Secondaire"
  virtualLevel: string;  // UI : "Maternelle" | "Primaire" | "Collège" | "Lycée"
  isExamClass: boolean;  // CM2, 10ème Année, Terminale
  displayName: string;
}

const DEFAULT_FEE_CONFIG: FeeConfig = {
  mode: "by-class",
  globalFee: 0,
  byLevel: {},
  byClass: {},
};

interface SchoolCalendar {
  startMonth: string;     // ex: "Octobre"
  durationMonths: number; // ex: 9
}

const DEFAULT_SCHOOL_CALENDAR: SchoolCalendar = { startMonth: "Septembre", durationMonths: 9 };

/** Tous les mois de l'année (ordre calendrier scolaire : Sep → Août) */
const SCHOOL_MONTHS = [
  "Septembre","Octobre","Novembre","Décembre",
  "Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août",
];

/** Mois dans l'ordre grégorien (Janvier=0 … Décembre=11) – pour le calcul d'années correct */
const ALL_MONTHS_GRE = [
  "Janvier","Février","Mars","Avril","Mai","Juin",
  "Juillet","Août","Septembre","Octobre","Novembre","Décembre",
];

/** Abréviations 3 lettres pour les chips */
const MONTH_SHORT: Record<string, string> = {
  Septembre:"Sep", Octobre:"Oct", Novembre:"Nov", Décembre:"Déc",
  Janvier:"Jan", Février:"Fév", Mars:"Mar", Avril:"Avr",
  Mai:"Mai", Juin:"Jun", Juillet:"Jul", Août:"Aoû",
};

const TRIMESTRES = ["Trimestre 1", "Trimestre 2", "Trimestre 3"];

const RECEIPTS_DONE_KEY = "structura_receipts_done";

/** Retourne la liste ordonnée des N mois scolaires selon le calendrier configuré */
function getSchoolMonthNames(calendar: SchoolCalendar): string[] {
  const startIdx = SCHOOL_MONTHS.indexOf(calendar.startMonth);
  if (startIdx === -1) return SCHOOL_MONTHS.slice(0, Math.min(calendar.durationMonths, 12));
  const result: string[] = [];
  for (let i = 0; i < Math.min(calendar.durationMonths, 12); i++) {
    result.push(SCHOOL_MONTHS[(startIdx + i) % 12]);
  }
  return result;
}

/** Retourne les mois scolaires avec l'année correcte basée sur le calendrier grégorien */
function getSchoolMonthsWithYear(academicYear: string, calendar: SchoolCalendar): string[] {
  const startYear = parseInt(academicYear.split("-")[0] ?? String(new Date().getFullYear()), 10);
  const startIdx  = ALL_MONTHS_GRE.indexOf(calendar.startMonth);
  if (startIdx === -1) return [];
  return Array.from({ length: Math.min(calendar.durationMonths, 12) }, (_, i) => {
    const monthIdx   = (startIdx + i) % 12;
    const yearOffset = Math.floor((startIdx + i) / 12);
    return `${ALL_MONTHS_GRE[monthIdx]} ${startYear + yearOffset}`;
  });
}

/** Divise les mois scolaires en 3 trimestres équilibrés selon la durée totale */
function getCalendarTrimestreGroups(
  academicYear: string,
  calendar: SchoolCalendar,
): { label: string; trimestre: string; monthsWithYear: string[] }[] {
  const all = getSchoolMonthsWithYear(academicYear, calendar);
  const n   = all.length;
  const t1e = Math.ceil(n / 3);
  const t2e = Math.ceil((n - t1e) / 2);
  return [
    { label: "T1", trimestre: "Trimestre 1", monthsWithYear: all.slice(0, t1e) },
    { label: "T2", trimestre: "Trimestre 2", monthsWithYear: all.slice(t1e, t1e + t2e) },
    { label: "T3", trimestre: "Trimestre 3", monthsWithYear: all.slice(t1e + t2e) },
  ].filter((g) => g.monthsWithYear.length > 0);
}

/** Retourne les 12 mois de l'année scolaire (school + HC) avec l'année correcte */
function getMonthsWithYear(academicYear: string, calendar: SchoolCalendar = DEFAULT_SCHOOL_CALENDAR): string[] {
  const startYear = parseInt(academicYear.split("-")[0] ?? String(new Date().getFullYear()), 10);
  const startIdx  = ALL_MONTHS_GRE.indexOf(calendar.startMonth);
  if (startIdx === -1) return [];
  return Array.from({ length: 12 }, (_, i) => {
    const monthIdx   = (startIdx + i) % 12;
    const yearOffset = Math.floor((startIdx + i) / 12);
    return `${ALL_MONTHS_GRE[monthIdx]} ${startYear + yearOffset}`;
  });
}

/** Résout le niveau "virtuel" UI depuis le niveau backend (Secondaire → Collège ou Lycée) */
function getVirtualLevel(className: string, level: string): string {
  if (level !== "Secondaire") return level;
  const name = className.toLowerCase();
  if (
    name.includes("11") || name.includes("12") ||
    name.includes("terminale") || name.includes("term") ||
    name.includes("2nde") || name.includes("seconde") ||
    name.includes("1ère") || name.includes("premiere")
  ) return "Lycée";
  return "Collège";
}

/** Détecte si une classe est une classe d'examen (CM2/CEPD, 10ème/BEPC, Terminale/BAC) */
function detectExamClass(className: string, virtualLevel: string): boolean {
  const name = className.toLowerCase();
  if (virtualLevel === "Primaire") return name.includes("cm2") || name.includes("6");
  if (virtualLevel === "Collège")  return name.includes("10");
  if (virtualLevel === "Lycée")    return name.includes("terminale") || name.includes("term");
  return false;
}

function getCurrentMonthWithYear(): string {
  const now = new Date();
  const MONTH_NAMES = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
  return `${MONTH_NAMES[now.getMonth()]} ${now.getFullYear()}`;
}

/** Vérifie si un terme stocké correspond au terme du dialog (compatibilité ancien format sans année) */
function termsMatch(storedTerm: string | undefined, dialogTerm: string): boolean {
  if (!storedTerm || !dialogTerm) return false;
  if (storedTerm === dialogTerm) return true;
  // Compatibilité : "Février" matche "Février 2026"
  return storedTerm === dialogTerm.split(" ")[0];
}

/** Retourne les mois avec année d'un trimestre donné (selon le calendrier scolaire configuré) */
function getMonthsWithYearForTrimestre(
  trimestre: string,
  academicYear: string,
  calendar: SchoolCalendar,
): string[] {
  return (
    getCalendarTrimestreGroups(academicYear, calendar)
      .find((g) => g.trimestre === trimestre)
      ?.monthsWithYear ?? []
  );
}

/**
 * Expand un terme de paiement en liste de mois avec année.
 * Centralise la logique utilisée pour la validation et l'affichage.
 * Gère : mois unique, CSV, Trimestre X, Annuel X-Y.
 */
function expandTermToMonths(
  term: string,
  academicYear: string,
  calendar: SchoolCalendar,
): string[] {
  if (!term) return [];
  if (term.startsWith("Annuel")) return getSchoolMonthsWithYear(academicYear, calendar);
  if (term.startsWith("Trimestre")) return getMonthsWithYearForTrimestre(term, academicYear, calendar);
  if (term.includes(",")) return term.split(",").map((s) => s.trim());
  return [term]; // mois unique ex: "Octobre 2025"
}

/**
 * Vérifie si un paiement couvre la période sélectionnée en vue.
 *
 * Règles (dans l'ordre) :
 * 1. Correspondance exacte
 * 2. Paiement "Annuel" → couvre toutes les vues
 * 3. Vue "Annuel" → tous les paiements de l'année comptent
 * 4. Paiement "Trimestre X" affiché en vue mensuelle → vrai si le mois est dans ce trimestre
 * 5. Vue "Trimestre X" → un paiement mensuel qui tombe dans ce trimestre compte
 * 6. Compatibilité nom de mois sans/avec année
 * 7. Paiement CSV multi-mois
 */
function paymentCoversViewTerm(
  paymentTerm: string | undefined,
  selectedTerm: string,
  academicYear: string,
  calendar: SchoolCalendar,
): boolean {
  if (!paymentTerm || !selectedTerm) return false;

  // 1. Correspondance exacte
  if (paymentTerm === selectedTerm) return true;

  // 2. Un paiement "Annuel" couvre toutes les vues (mensuel, trimestriel, annuel)
  if (paymentTerm.startsWith("Annuel")) return true;

  // 3. Vue "Annuel" → tous les paiements de l'année (mensuel, trimestriel, partiel) comptent
  if (selectedTerm.startsWith("Annuel")) return true;

  // 4. Paiement "Trimestre X" affiché en vue mensuelle → vrai si ce mois est dans ce trimestre
  if (paymentTerm.startsWith("Trimestre")) {
    const months = getMonthsWithYearForTrimestre(paymentTerm, academicYear, calendar);
    if (months.includes(selectedTerm)) return true;
    if (months.some((m) => m.split(" ")[0] === selectedTerm.split(" ")[0])) return true;
  }

  // 5. Vue "Trimestre X" → un paiement mensuel tombant dans ce trimestre compte
  if (selectedTerm.startsWith("Trimestre")) {
    const trimMonths = getMonthsWithYearForTrimestre(selectedTerm, academicYear, calendar);
    if (trimMonths.includes(paymentTerm)) return true;
    if (trimMonths.some((m) => m.split(" ")[0] === paymentTerm.split(" ")[0])) return true;
  }

  // 6. Compatibilité nom de mois sans/avec année : "Octobre" matche "Octobre 2026"
  if (paymentTerm === selectedTerm.split(" ")[0]) return true;
  if (paymentTerm.split(" ")[0] === selectedTerm.split(" ")[0]) return true;

  // 7. Paiement CSV multi-mois : "Octobre 2026, Novembre 2026"
  if (paymentTerm.includes(",")) {
    const parts = paymentTerm.split(",").map((s) => s.trim());
    // Vérifier correspondance directe ou appartenance au trimestre sélectionné
    if (parts.some((p) => p === selectedTerm || p.split(" ")[0] === selectedTerm.split(" ")[0])) return true;
    if (selectedTerm.startsWith("Trimestre")) {
      const trimMonths = getMonthsWithYearForTrimestre(selectedTerm, academicYear, calendar);
      if (parts.some((p) => trimMonths.includes(p) || trimMonths.some((m) => m.split(" ")[0] === p.split(" ")[0]))) return true;
    }
  }

  return false;
}

/**
 * Construit la décomposition par trimestre pour le reçu PDF.
 * Retourne undefined si le paiement correspond exactement à un seul trimestre
 * complet (le mode trimestre unique du PDF suffit dans ce cas).
 * Retourne un tableau de groupes sinon (multi-trimestre ou trimestre partiel).
 */
function buildTrimestreBreakdown(
  coveredMonths: Set<string> | string[],
  academicYear: string,
  calendar: SchoolCalendar,
): { label: string; trimestre: string; paidMonths: string[]; totalMonths: number }[] | undefined {
  const covered = coveredMonths instanceof Set ? coveredMonths : new Set(coveredMonths);
  const groups = getCalendarTrimestreGroups(academicYear, calendar)
    .map((g) => ({
      label:       g.label,
      trimestre:   g.trimestre,
      paidMonths:  g.monthsWithYear.filter((m) => covered.has(m)),
      totalMonths: g.monthsWithYear.length,
    }))
    .filter((g) => g.paidMonths.length > 0);

  if (groups.length === 0) return undefined;

  // Cas simple : exactement 1 trimestre complet → pas besoin du mode groupé
  if (groups.length === 1 && groups[0].paidMonths.length === groups[0].totalMonths) {
    return undefined;
  }

  return groups;
}

function getPeriodsForFrequency(freq: PaymentFrequency, calendar?: SchoolCalendar): string[] {
  if (freq === "monthly")   return calendar ? getSchoolMonthNames(calendar) : SCHOOL_MONTHS;
  if (freq === "quarterly") return TRIMESTRES;
  return ["Annuel"];
}

function getCurrentPeriod(freq: PaymentFrequency): string {
  if (freq === "annual") return "Annuel";
  const m = new Date().getMonth();
  if (freq === "quarterly") {
    if ([8,9,10,11].includes(m)) return "Trimestre 1";
    if ([0,1,2].includes(m))    return "Trimestre 2";
    return "Trimestre 3";
  }
  const MONTH_NAMES = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
  const cur = MONTH_NAMES[m];
  return SCHOOL_MONTHS.includes(cur) ? cur : SCHOOL_MONTHS[0];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mapBackendPayment(p: any): Payment {
  return {
    id:            p.id,
    studentId:     p.studentId,
    studentName:   p.student ? `${p.student.firstName} ${p.student.lastName}` : undefined,
    amount:        p.amount,
    currency:      p.currency || "GNF",
    method:        (p.method?.toLowerCase() ?? "cash") as Payment["method"],
    status:        (p.status?.toLowerCase() ?? "pending") as Payment["status"],
    dueDate:       p.dueDate,
    paidDate:      p.paidDate,
    description:   p.description,
    receiptNumber: p.receiptNumber,
    academicYear:  p.academicYear,
    term:          p.term,
    createdAt:     p.createdAt,
    updatedAt:     p.updatedAt,
  };
}

const CURRENCY_LOCALES: Record<string, string> = {
  GNF: "fr-GN",
  XOF: "fr-SN",
  USD: "en-US",
  EUR: "fr-FR",
};

function getActiveCurrency(): string {
  try {
    const raw = typeof window !== "undefined" ? localStorage.getItem("structura_regional_prefs") : null;
    if (raw) return JSON.parse(raw).currency || "GNF";
  } catch {}
  return "GNF";
}

function formatCurrency(amount: number) {
  const currency = getActiveCurrency();
  return new Intl.NumberFormat(CURRENCY_LOCALES[currency] || "fr-GN", {
    style: "currency", currency, minimumFractionDigits: 0,
  }).format(amount);
}

function getInitials(firstName: string, lastName: string) {
  return `${firstName?.charAt(0) ?? ""}${lastName?.charAt(0) ?? ""}`.toUpperCase();
}

function formatMethod(method: string) {
  const map: Record<string, string> = {
    cash: "Espèces", mobile_money: "Mobile Money", bank_transfer: "Virement", check: "Chèque",
    CASH: "Espèces", MOBILE_MONEY: "Mobile Money", BANK_TRANSFER: "Virement", CHECK: "Chèque",
  };
  return map[method] ?? method;
}

/** Arrondit un montant au millier le plus proche (ex: 150 022 → 150 000) */
function roundFee(n: number): number {
  return Math.round(n / 1000) * 1000;
}

/** Retourne le frais mensuel attendu pour un élève donné (override classe > frais niveau > globalFee) */
function getStudentFee(classId: string, virtualLevel: string, config: FeeConfig): number {
  const classFee = config.byClass[classId];
  if (classFee && classFee > 0) return classFee;
  const levelFee = config.byLevel[virtualLevel];
  if (levelFee && levelFee > 0) return levelFee;
  return config.globalFee;
}

/**
 * Retourne le nombre de mois couverts par la période sélectionnée.
 * Ceci est critique pour calculer le montant attendu correct (expectedFee).
 * Ex : "Trimestre 1" → 3, "Octobre 2026" → 1, "Annuel 2026-2027" → durationMonths
 */
function getTermMonthCount(
  selectedTerm: string,
  academicYear: string,
  calendar: SchoolCalendar,
): number {
  if (!selectedTerm) return 1;
  if (selectedTerm.startsWith("Annuel")) return Math.max(1, calendar.durationMonths);
  if (selectedTerm.startsWith("Trimestre")) {
    const grps = getCalendarTrimestreGroups(academicYear, calendar);
    const count = grps.find((g) => g.trimestre === selectedTerm)?.monthsWithYear.length;
    return count && count > 0 ? count : 1;
  }
  // Mois unique ("Octobre 2026") ou terme inconnu → 1 mois
  return 1;
}

// ─── Types ────────────────────────────────────────────────────────────────────

type PaymentStatus = "paid" | "partial" | "unpaid";

type BulkPayRow = {
  id: string;
  firstName: string;
  lastName: string;
  amount: string;
  method: "CASH" | "MOBILE_MONEY" | "BANK_TRANSFER" | "CHECK";
  skip: boolean; // déjà payé → ligne grisée
};

interface StudentSummary {
  student:             BackendStudent;
  payments:            Payment[];
  expectedFee:         number;
  totalPaid:           number;
  remaining:           number;
  progressPct:         number;
  status:              PaymentStatus;
  className:           string;
  level:               string;
  yearPaidMonthsCount: number; // Nombre de mois scolaires payés sur toute l'année
  // Totaux sur l'année complète — utilisés pour les reçus (indépendant du filtre période)
  yearExpectedFee:     number;
  yearTotalPaid:       number;
  yearRemaining:       number;
}

// ─── Composant principal ──────────────────────────────────────────────────────

export default function PaymentsPage() {
  const isOnline = useOnline();
  const { user }  = useAuth();
  const queryClient = useQueryClient();
  const canConfigureFees  = usePermission("payments", "configure");
  const canCreatePayment  = usePermission("payments", "create");

  // Confidentialité financière : montants visibles uniquement par directeur et comptable
  const canViewAmounts = user?.role === "director" || user?.role === "accountant";
  const { hasFeature } = useSubscription();
  const hasBulletins = hasFeature('bulletins');

  // ── React Query — données serveur ─────────────────────────────────────────

  const { data: backendStudents, isLoading: studentsLoading, refetch: refetchStudents } = useQuery({
    queryKey: STUDENTS_QUERY_KEY(user?.tenantId),
    queryFn: async () => {
      const token = storage.getAuthItem("structura_token");
      if (!token) throw new Error("No token");
      const data = await getStudents(token);
      await offlineDB.clear(STORES.STUDENTS).catch(() => {});
      await offlineDB.bulkAdd(STORES.STUDENTS, data).catch(() => {});
      return data as BackendStudent[];
    },
    enabled: isOnline && !!user,
    staleTime: 5 * 60_000,  // 5 min — élèves changent rarement
  });

  const { data: backendPayments, isLoading: paymentsLoading, refetch: refetchPayments } = useQuery({
    queryKey: PAYMENTS_QUERY_KEY(user?.tenantId),
    queryFn: async () => {
      const token = storage.getAuthItem("structura_token");
      if (!token) throw new Error("No token");
      const raw = await getPayments(token);
      const mapped = raw.map(mapBackendPayment);
      await offlineDB.clear(STORES.PAYMENTS).catch(() => {});
      await offlineDB.bulkAdd(STORES.PAYMENTS, mapped).catch(() => {});
      return mapped;
    },
    enabled: isOnline && !!user,
    staleTime: 2 * 60_000,  // 2 min — paiements changent plus souvent
  });

  const { data: backendRawClasses, isLoading: classesLoading, refetch: refetchClasses } = useQuery({
    queryKey: CLASSES_QUERY_KEY(user?.tenantId),
    queryFn: async () => {
      const token = storage.getAuthItem("structura_token");
      if (!token) throw new Error("No token");
      const data = await getClasses(token);
      await offlineDB.clear(STORES.CLASSES).catch(() => {});
      await offlineDB.bulkAdd(STORES.CLASSES, data).catch(() => {});
      return data;
    },
    enabled: isOnline && !!user,
    staleTime: 5 * 60_000,  // 5 min — classes changent rarement
  });

  const { data: currentAcademicYear } = useQuery({
    // Même queryKey que useCurrentAcademicYear → partage le cache entre toutes les pages
    queryKey: ["current-academic-year", user?.tenantId],
    queryFn: async () => {
      const token = storage.getAuthItem("structura_token");
      if (!token) throw new Error("No token");
      return getCurrentAcademicYear(token).catch(() => null);
    },
    enabled: isOnline && !!user,
    staleTime: 24 * 60 * 60 * 1000, // 24h — l'année ne change qu'une fois par an
    gcTime:    7  * 24 * 60 * 60 * 1000,
  });

  // Sync année scolaire courante + mise en cache localStorage
  useEffect(() => {
    if (currentAcademicYear?.name) {
      setSelectedYear(currentAcademicYear.name);
      localStorage.setItem(CURRENT_YEAR_KEY, currentAcademicYear.name);
    }
  }, [currentAcademicYear?.name]);

  // ── Cache IndexedDB — chargé au montage comme placeholder ─────────────────
  // Permet d'afficher les données immédiatement pendant que React Query rafraîchit en arrière-plan.
  const [offlineStudents, setOfflineStudents] = useState<BackendStudent[]>([]);
  const [offlinePayments, setOfflinePayments] = useState<Payment[]>([]);
  const [offlineRawClasses, setOfflineRawClasses] = useState<any[]>([]);

  useEffect(() => {
    offlineDB.getAll<BackendStudent>(STORES.STUDENTS).then(setOfflineStudents).catch(() => {});
    offlineDB.getAll<Payment>(STORES.PAYMENTS).then(setOfflinePayments).catch(() => {});
    offlineDB.getAll<any>(STORES.CLASSES).then(setOfflineRawClasses).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Après une sync réussie → rafraîchir les données + recharger IndexedDB
  useEffect(() => {
    const handleSyncCompleted = () => {
      refetchPayments();
      refetchStudents();
      offlineDB.getAll<Payment>(STORES.PAYMENTS).then(setOfflinePayments).catch(() => {});
      offlineDB.getAll<BackendStudent>(STORES.STUDENTS).then(setOfflineStudents).catch(() => {});
    };
    window.addEventListener('sync:completed', handleSyncCompleted);
    return () => window.removeEventListener('sync:completed', handleSyncCompleted);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Données finales (online > offline) ────────────────────────────────────
  // Utiliser || au lieu de ?? pour éviter que backendStudents=[] (vide initial)
  // ne cache les données offline IndexedDB pendant le chargement.
  const students = (backendStudents && backendStudents.length > 0) ? backendStudents : offlineStudents;
  const payments = (backendPayments && backendPayments.length > 0) ? backendPayments : offlinePayments;
  // Spinner uniquement si aucune donnée disponible (ni API ni cache IndexedDB)
  const hasData = students.length > 0 || payments.length > 0;
  const isLoading = (studentsLoading || paymentsLoading || classesLoading) && !hasData;

  const rawClassesList = backendRawClasses ?? offlineRawClasses;
  const classes = useMemo<ClassInfo[]>(() =>
    rawClassesList.map((c: any) => {
      const vl = c.virtualLevel || getVirtualLevel(c.name, c.level || "");
      return {
        id: c.id, name: c.name, section: c.section, level: c.level || "",
        virtualLevel: vl,
        isExamClass: c.isExamClass ?? detectExamClass(c.name, vl),
        displayName: formatClassName(c.name, c.section),
      };
    }),
    [rawClassesList]
  );

  // Filtres
  const [activeClass,   setActiveClass]   = useState("all");
  const [searchQuery,   setSearchQuery]   = useState("");
  const [statusFilter,  setStatusFilter]  = useState("all");
  const [selectedYear,  setSelectedYear]  = useState(getCachedOrGuessedYear);

  // Dépenses — pour le widget Solde Net
  const [expensesTotal, setExpensesTotal] = useState<number | null>(null);

  // Fréquence et période — initialisées depuis le cache localStorage
  const [paymentFrequency, setPaymentFrequency] = useState<PaymentFrequency>(() => {
    if (typeof window === "undefined") return "monthly";
    const saved = localStorage.getItem(PAYMENT_FREQ_KEY);
    return (saved as PaymentFrequency) || "monthly";
  });
  const [selectedTerm, setSelectedTerm] = useState<string>(() => {
    if (typeof window === "undefined") return getCurrentPeriod("monthly");
    const saved = localStorage.getItem(PAYMENT_FREQ_KEY) as PaymentFrequency || "monthly";
    return getCurrentPeriod(saved);
  });

  // Type d'école et postes de frais (école publique)
  const [schoolType, setSchoolType] = useState<"private" | "public">(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(SCHOOL_TYPE_KEY);
      if (saved === "public" || saved === "private") return saved;
    }
    return "private";
  });
  const [feeItems,    setFeeItems]    = useState<import("@/lib/api/fees.service").FeeItem[]>(() => {
    if (typeof window === "undefined") return [];
    try { const s = localStorage.getItem(FEE_ITEMS_KEY); return s ? JSON.parse(s) : []; } catch { return []; }
  });
  // false si on a déjà un cache localStorage, true sinon (premier accès)
  const [feesLoading, setFeesLoading] = useState(() =>
    typeof window !== "undefined" ? !localStorage.getItem(CLASS_FEES_KEY) : true
  );

  // Frais — initialisés depuis le cache localStorage pour un affichage immédiat des montants
  const [feeConfig, setFeeConfig] = useState<FeeConfig>(() => {
    if (typeof window === "undefined") return DEFAULT_FEE_CONFIG;
    try { const s = localStorage.getItem(CLASS_FEES_KEY); return s ? JSON.parse(s) : DEFAULT_FEE_CONFIG; } catch { return DEFAULT_FEE_CONFIG; }
  });

  // Drawer détail élève (remplace les expand rows)
  const [drawerStudent, setDrawerStudent] = useState<StudentSummary | null>(null);

  // Dialog paiement
  const [isDialogOpen,               setIsDialogOpen]               = useState(false);
  const [selectedStudentForPayment,  setSelectedStudentForPayment]  = useState<BackendStudent | null>(null);
  const [paymentForm, setPaymentForm] = useState({
    amount: "", method: "CASH" as "CASH"|"MOBILE_MONEY"|"BANK_TRANSFER"|"CHECK",
    description: "Frais de scolarité", term: "", academicYear: selectedYear,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Montant personnalisé (paiement partiel)
  const [customAmountStr, setCustomAmountStr] = useState<string>("");
  // Mode complétion : montant déjà versé pour le mois partiel sélectionné
  const [completionAlreadyPaid, setCompletionAlreadyPaid] = useState(0);

  // Inscription / Réinscription
  const [inscriptionDialogOpen, setInscriptionDialogOpen] = useState(false);
  const [inscriptionStudent,    setInscriptionStudent]    = useState<BackendStudent | null>(null);
  const [inscriptionType,       setInscriptionType]       = useState<"inscription" | "reinscription">("reinscription");
  const [inscriptionMethod,     setInscriptionMethod]     = useState<"CASH"|"MOBILE_MONEY"|"BANK_TRANSFER"|"CHECK">("CASH");
  const [inscriptionSaving,     setInscriptionSaving]     = useState(false);

  // Rapport du jour
  const [todayReportOpen, setTodayReportOpen] = useState(false);

// État post-paiement : vue succès avec choix du reçu
  // "form"    → saisie normale  |  "success" → affichage du résultat
  const [dialogMode,        setDialogMode]        = useState<"form" | "success">("form");
  const [pendingReceiptData, setPendingReceiptData] = useState<PaymentReceiptData | null>(null);

  // Dialog sélection de mois
  const [dialogTrimestreMonths,   setDialogTrimestreMonths]   = useState<Set<string>>(new Set());
  const [generatedReceipts, setGeneratedReceipts]             = useState<Set<string>>(new Set());

  // Dialog config frais
  const [isFeeDialogOpen,  setIsFeeDialogOpen]  = useState(false);
  const [draftFeeConfig,   setDraftFeeConfig]   = useState<FeeConfig>(DEFAULT_FEE_CONFIG);

  // Calendrier scolaire — initialisé depuis le cache localStorage, mis à jour depuis l'API
  const [schoolCalendar, setSchoolCalendar] = useState<SchoolCalendar>(() => {
    if (typeof window === "undefined") return DEFAULT_SCHOOL_CALENDAR;
    try {
      const s = localStorage.getItem(SCHOOL_CALENDAR_KEY);
      return s ? JSON.parse(s) : DEFAULT_SCHOOL_CALENDAR;
    } catch { return DEFAULT_SCHOOL_CALENDAR; }
  });

  // ── Dialog "Ajouter / Éditer un poste de frais" (école publique) ─────────
  const [isFeeItemDialogOpen,  setIsFeeItemDialogOpen]  = useState(false);
  const [feeItemSaving,        setFeeItemSaving]        = useState(false);
  const [editingFeeItem, setEditingFeeItem] = useState<import("@/lib/api/fees.service").FeeItem | null>(null);
  const [feeItemForm, setFeeItemForm] = useState({
    name: "",
    amount: "",
    academicYear: getCachedOrGuessedYear(),
    classIds: [] as string[],
    allClasses: true,
  });

  // ── Vue publique — filtres & actions ──────────────────────────────────────
  const [publicSearchQuery, setPublicSearchQuery] = useState("");
  const [publicClassFilter, setPublicClassFilter] = useState("all");
  const [deletingFeeItemId, setDeletingFeeItemId] = useState<string | null>(null);
  const [markPaidDialog,    setMarkPaidDialog]    = useState<{
    student: BackendStudent;
    item: import("@/lib/api/fees.service").FeeItem;
  } | null>(null);
  const [markPaidMethod, setMarkPaidMethod] = useState<"CASH" | "MOBILE_MONEY" | "BANK_TRANSFER">("CASH");
  const [markPaidNote,   setMarkPaidNote]   = useState("");
  const [markPaidSaving, setMarkPaidSaving] = useState(false);
  const [bulkMarkingItemId, setBulkMarkingItemId] = useState<string | null>(null);

  // ── Saisie en masse des paiements ─────────────────────────────────────────
  const [bulkOpen,           setBulkOpen]           = useState(false);
  const [bulkClassId,        setBulkClassId]        = useState<string>("");
  const [bulkRows,           setBulkRows]           = useState<BulkPayRow[]>([]);
  const [bulkTerm,           setBulkTerm]           = useState<string>("");
  const [bulkFrequency,      setBulkFrequency]      = useState<PaymentFrequency>("monthly");
  const [bulkSaving,         setBulkSaving]         = useState(false);
  const [bulkProgress,       setBulkProgress]       = useState<{ done: number; total: number } | null>(null);

  // ── Alerte fin de mois ────────────────────────────────────────────────────

  const endOfMonthInfo = useMemo(() => {
    const today      = new Date();
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    const daysLeft   = endOfMonth.getDate() - today.getDate();
    return { daysLeft, show: daysLeft <= 5 && paymentFrequency === "monthly" };
  }, [paymentFrequency]);

  // ── Init config frais depuis l'API (source de vérité = BDD tenant) ──────────
  // Fallback localStorage si hors ligne.

  useEffect(() => {
    const token = storage.getAuthItem("structura_token");

    const applyConfig = (
      fee: FeeConfig | null,
      freq: string,
      cal: SchoolCalendar | null,
      sType?: string | null,
      items?: import("@/lib/api/fees.service").FeeItem[] | null,
    ) => {
      if (fee?.mode && typeof fee.globalFee === "number") setFeeConfig(fee);
      const f = (freq as PaymentFrequency) || "monthly";
      setPaymentFrequency(f);
      setSelectedTerm(getCurrentPeriod(f));
      if (cal?.startMonth && typeof cal.durationMonths === "number") setSchoolCalendar(cal);
      if (sType === "public" || sType === "private") setSchoolType(sType);
      if (Array.isArray(items)) setFeeItems(items);
    };

    if (token && isOnline) {
      getFeesConfig(token)
        .then((config) => {
          // ── Migration one-shot ──────────────────────────────────────────────
          // Si la BDD ne contient pas encore de frais configurés (premier accès après
          // la migration vers l'API) mais que le localStorage du directeur en contient,
          // on les migre automatiquement en BDD pour tout le tenant.
          const localFees = localStorage.getItem(CLASS_FEES_KEY);
          const localFreq = localStorage.getItem(PAYMENT_FREQ_KEY);
          if (!config.feeConfig && localFees) {
            try {
              const parsedFees = JSON.parse(localFees) as FeeConfig;
              updateFeesConfig(token, {
                feeConfig:        parsedFees,
                paymentFrequency: (localFreq as PaymentFrequency) || "monthly",
              }).catch(console.error);
              applyConfig(parsedFees, localFreq || "monthly", null, config.schoolType);
              if (config.schoolType) localStorage.setItem(SCHOOL_TYPE_KEY, config.schoolType);
              return;
            } catch { /* si JSON invalide, continuer normalement */ }
          }
          // ─────────────────────────────────────────────────────────────────
          applyConfig(
            config.feeConfig as FeeConfig | null,
            config.paymentFrequency,
            config.schoolCalendar as SchoolCalendar | null,
            config.schoolType,
            config.feeItems as import("@/lib/api/fees.service").FeeItem[] | null,
          );
          // Mettre en cache pour le mode hors ligne
          if (config.feeConfig)           localStorage.setItem(CLASS_FEES_KEY,      JSON.stringify(config.feeConfig));
          localStorage.setItem(PAYMENT_FREQ_KEY, config.paymentFrequency || "monthly");
          if (config.schoolCalendar)      localStorage.setItem(SCHOOL_CALENDAR_KEY, JSON.stringify(config.schoolCalendar));
          if (config.schoolType)          localStorage.setItem(SCHOOL_TYPE_KEY, config.schoolType);
          if (config.feeItems?.length)    localStorage.setItem(FEE_ITEMS_KEY,   JSON.stringify(config.feeItems));
        })
        .catch(() => {
          // Réseau indisponible malgré isOnline — utiliser le cache local
          const savedFees  = localStorage.getItem(CLASS_FEES_KEY);
          const savedCal   = localStorage.getItem(SCHOOL_CALENDAR_KEY);
          const savedFreq  = localStorage.getItem(PAYMENT_FREQ_KEY) || "monthly";
          const savedType  = localStorage.getItem(SCHOOL_TYPE_KEY);
          const savedItems = localStorage.getItem(FEE_ITEMS_KEY);
          applyConfig(
            savedFees  ? JSON.parse(savedFees)  as FeeConfig      : null,
            savedFreq,
            savedCal   ? JSON.parse(savedCal)   as SchoolCalendar : null,
            savedType,
            savedItems ? JSON.parse(savedItems) as import("@/lib/api/fees.service").FeeItem[] : null,
          );
        })
        .finally(() => setFeesLoading(false));
    } else {
      // Mode hors ligne : utiliser le cache local
      const savedFees  = localStorage.getItem(CLASS_FEES_KEY);
      const savedCal   = localStorage.getItem(SCHOOL_CALENDAR_KEY);
      const savedFreq  = localStorage.getItem(PAYMENT_FREQ_KEY) || "monthly";
      const savedType  = localStorage.getItem(SCHOOL_TYPE_KEY);
      const savedItems = localStorage.getItem(FEE_ITEMS_KEY);
      applyConfig(
        savedFees  ? JSON.parse(savedFees)  as FeeConfig      : null,
        savedFreq,
        savedCal   ? JSON.parse(savedCal)   as SchoolCalendar : null,
        savedType,
        savedItems ? JSON.parse(savedItems) as import("@/lib/api/fees.service").FeeItem[] : null,
      );
      setFeesLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline]);

  // ── Dépenses — chargement pour le widget Solde Net ────────────────────────
  const loadExpensesTotal = useCallback(() => {
    if (!isOnline) return;
    const token = storage.getAuthItem("structura_token");
    if (!token) return;
    getExpenseStats(token, selectedYear)
      .then((s) => setExpensesTotal(s.totalAmount))
      .catch(() => {}); // silencieux — widget optionnel
  }, [isOnline, selectedYear]);

  useEffect(() => { loadExpensesTotal(); }, [loadExpensesTotal]);

  // Mise à jour temps réel : écouter les mutations de la page Dépenses
  useEffect(() => {
    window.addEventListener("expenses:updated", loadExpensesTotal);
    return () => window.removeEventListener("expenses:updated", loadExpensesTotal);
  }, [loadExpensesTotal]);

  // Rafraîchir le solde net au retour sur l'onglet
  useRefreshOnFocus(loadExpensesTotal, 10_000);

  const handleFrequencyChange = (freq: PaymentFrequency) => {
    setPaymentFrequency(freq);
    const period = getCurrentPeriod(freq);
    setSelectedTerm(period);
    // Sauvegarder en BDD + cache local
    localStorage.setItem(PAYMENT_FREQ_KEY, freq);
    const token = storage.getAuthItem("structura_token");
    if (token && isOnline) {
      updateFeesConfig(token, { paymentFrequency: freq }).catch(console.error);
    }
  };

  // ── Handlers saisie en masse ──────────────────────────────────────────────

  const buildBulkRows = useCallback((classId: string, term: string) => {
    const classStudents = students.filter((s) => s.classId === classId);
    const cls = classes.find((c) => c.id === classId);
    const virtualLevel = cls?.virtualLevel ?? cls?.level ?? "";
    const monthlyFee = getStudentFee(classId, virtualLevel, feeConfig);
    const termMonths = getTermMonthCount(term, selectedYear, schoolCalendar);
    const fee = monthlyFee * termMonths;

    setBulkRows(classStudents.map((s) => {
      const alreadyPaid = payments.some(
        (p) => p.studentId === s.id &&
               p.status === "paid" &&
               (!p.academicYear || p.academicYear === selectedYear) &&
               (!p.term || paymentCoversViewTerm(p.term, term, selectedYear, schoolCalendar))
      );
      return {
        id: s.id,
        firstName: s.firstName,
        lastName: s.lastName,
        amount: alreadyPaid ? "" : fee > 0 ? String(fee) : "",
        method: "CASH" as const,
        skip: alreadyPaid,
      };
    }));
  }, [students, classes, feeConfig, payments, selectedYear, schoolCalendar]);

  const handleBulkClassChange = useCallback((classId: string) => {
    setBulkClassId(classId);
    const defaultTerm = getPeriodsForFrequency(bulkFrequency, schoolCalendar)[0] ?? selectedTerm;
    const term = bulkTerm || defaultTerm;
    setBulkTerm(term);
    buildBulkRows(classId, term);
  }, [buildBulkRows, bulkTerm, bulkFrequency, selectedTerm]);

  const handleBulkTermChange = useCallback((term: string) => {
    setBulkTerm(term);
    if (bulkClassId) buildBulkRows(bulkClassId, term);
  }, [buildBulkRows, bulkClassId]);

  const handleBulkFrequencyChange = useCallback((freq: PaymentFrequency) => {
    setBulkFrequency(freq);
    const firstTerm = getPeriodsForFrequency(freq, schoolCalendar)[0] ?? "";
    setBulkTerm(firstTerm);
    if (bulkClassId) buildBulkRows(bulkClassId, firstTerm);
  }, [buildBulkRows, bulkClassId]);

  const updateBulkRow = (studentId: string, field: "amount" | "method", value: string) => {
    setBulkRows((prev) => prev.map((r) =>
      r.id === studentId ? { ...r, [field]: value } : r
    ));
  };

  const fillAllAmounts = () => {
    if (!bulkClassId) return;
    const cls = classes.find((c) => c.id === bulkClassId);
    const virtualLevel = cls?.virtualLevel ?? cls?.level ?? "";
    const monthlyFee = getStudentFee(bulkClassId, virtualLevel, feeConfig);
    const term = bulkTerm || selectedTerm;
    const termMonths = getTermMonthCount(term, selectedYear, schoolCalendar);
    const fee = monthlyFee * termMonths;
    setBulkRows((prev) => prev.map((r) => r.skip ? r : { ...r, amount: fee > 0 ? String(fee) : r.amount }));
  };

  // Rafraîchir les paiements quand l'utilisateur revient sur l'onglet
  useRefreshOnFocus(refetchPayments);

  const handleBulkSave = async () => {
    const validRows = bulkRows.filter((r) => !r.skip && r.amount && Number(r.amount) > 0);
    if (validRows.length === 0) { toast.info("Aucun paiement à enregistrer."); return; }
    const token = storage.getAuthItem("structura_token");
    if (!token) { toast.error("Session expirée."); return; }

    // Résoudre le terme dans le même format que le paiement individuel
    // - mensuel  : "Octobre" → "Octobre 2025"
    // - annuel   : "Annuel"  → "Annuel 2025-2026"
    // - trimestr : "Trimestre 1" → inchangé (déjà le bon format)
    const rawTerm = bulkTerm || selectedTerm;
    let resolvedTerm = rawTerm;
    if (rawTerm === "Annuel") {
      resolvedTerm = `Annuel ${selectedYear}`;
    } else if (!rawTerm.startsWith("Trimestre") && !rawTerm.includes(" ")) {
      // Mois sans année → trouver la version avec année dans le calendrier scolaire
      const found = getSchoolMonthsWithYear(selectedYear, schoolCalendar).find(
        (m) => m.startsWith(rawTerm + " ")
      );
      resolvedTerm = found || rawTerm;
    }

    setBulkSaving(true);
    setBulkProgress({ done: 0, total: validRows.length });
    let succeeded = 0;
    let failed = 0;

    // Parallélisation : tous les paiements s'envoient simultanément (× ~10 plus rapide)
    await Promise.all(validRows.map(async (row) => {
      try {
        await createPayment(token, {
          studentId:    row.id,
          amount:       Number(row.amount),
          method:       row.method,
          currency:     getActiveCurrency(),
          status:       "paid",
          description:  "Frais de scolarité",
          academicYear: selectedYear,
          term:         resolvedTerm,
          paidDate:     new Date().toISOString(),
        });
        succeeded++;
      } catch { failed++; }
      setBulkProgress({ done: succeeded + failed, total: validRows.length });
    }));

    setBulkSaving(false);
    if (succeeded > 0) toast.success(`${succeeded} paiement${succeeded > 1 ? "s" : ""} enregistré${succeeded > 1 ? "s" : ""}.`);
    if (failed > 0) toast.error(`${failed} paiement${failed > 1 ? "s" : ""} ont échoué.`);
    setBulkProgress(null);
    queryClient.invalidateQueries({ queryKey: PAYMENTS_QUERY_KEY(user?.tenantId) });
    if (bulkClassId) buildBulkRows(bulkClassId, resolvedTerm);
  };

  useEffect(() => {
    const saved = localStorage.getItem(RECEIPTS_DONE_KEY);
    if (saved) {
      try { setGeneratedReceipts(new Set(JSON.parse(saved) as string[])); } catch {}
    }
  }, []);


  // ── Résumés par élève ─────────────────────────────────────────────────────

  const studentSummaries = useMemo<StudentSummary[]>(() => {
    return students.map((student) => {
      const cls         = classes.find((c) => c.id === student.classId);
      const virtualLevel = cls?.virtualLevel ?? cls?.level ?? "";
      const level        = cls?.level ?? "";
      const className    = cls?.displayName ?? (
        student.class
          ? formatClassName(student.class.name, student.class.section)
          : "—"
      );

      // Frais mensuel de base pour cet élève/classe
      const monthlyFee   = getStudentFee(student.classId, virtualLevel, feeConfig);
      // Nombre de mois couverts par la période sélectionnée (1 = mensuel, 3 = trimestre, N = annuel)
      const termMonths   = getTermMonthCount(selectedTerm, selectedYear, schoolCalendar);
      // Montant attendu pour la PERIODE ACTUELLE (pas juste le mensuel !)
      const expectedFee  = monthlyFee * termMonths;

      // Paiements filtrés pour la période + année sélectionnées
      const studentPayments = payments.filter((p) => {
        if (p.studentId !== student.id) return false;
        if (selectedTerm && p.term && !paymentCoversViewTerm(p.term, selectedTerm, selectedYear, schoolCalendar)) return false;
        if (selectedYear && p.academicYear && p.academicYear !== selectedYear) return false;
        return true;
      });

      const totalPaid    = studentPayments.filter((p) => p.status === "paid").reduce((s, p) => s + p.amount, 0);
      const remaining    = expectedFee > 0 ? Math.max(0, expectedFee - totalPaid) : 0;
      const progressPct  = expectedFee > 0 ? Math.min(100, Math.round((totalPaid / expectedFee) * 100)) : 0;

      // Paiements de l'élève sur toute l'année (sans filtre de période)
      const yearPaidAny = payments.some(
        (p) => p.studentId === student.id && p.academicYear === selectedYear && p.status === "paid"
      );

      let status: PaymentStatus = "unpaid";
      if (expectedFee > 0 && totalPaid >= expectedFee) status = "paid";
      else if (totalPaid > 0)                           status = "partial";
      // L'élève n'a pas payé ce mois précis MAIS a payé d'autres mois → "partiel"
      else if (yearPaidAny)                             status = "partial";

      // Calcul des mois annuels payés (tous paiements de l'élève, sans filtre de période)
      const annualPaidMonthsSet = new Set<string>();
      payments
        .filter((p) => p.studentId === student.id && (!selectedYear || p.academicYear === selectedYear) && p.status === "paid")
        .forEach((p) => {
          if (!p.term) return;
          if (p.term.includes(",")) {
            p.term.split(",").map((s) => s.trim()).forEach((m) => annualPaidMonthsSet.add(m));
          } else if (p.term.startsWith("Trimestre")) {
            getCalendarTrimestreGroups(selectedYear, schoolCalendar)
              .find((g) => g.trimestre === p.term)
              ?.monthsWithYear.forEach((m) => annualPaidMonthsSet.add(m));
          } else if (p.term.startsWith("Annuel")) {
            getSchoolMonthsWithYear(selectedYear, schoolCalendar).forEach((m) => annualPaidMonthsSet.add(m));
          } else {
            annualPaidMonthsSet.add(p.term);
          }
        });

      // Totaux sur l'année complète (indépendants du filtre de période → pour les reçus historiques)
      const yearAllPaid     = payments.filter(
        (p) => p.studentId === student.id && p.academicYear === selectedYear && p.status === "paid",
      );
      const yearTotalPaid   = yearAllPaid.reduce((s, p) => s + p.amount, 0);
      const yearExpectedFee = monthlyFee * Math.max(1, schoolCalendar.durationMonths);
      const yearRemaining   = Math.max(0, yearExpectedFee - yearTotalPaid);

      return { student, payments: studentPayments, expectedFee, totalPaid, remaining, progressPct, status, className, level, yearPaidMonthsCount: annualPaidMonthsSet.size, yearExpectedFee, yearTotalPaid, yearRemaining };
    });
  }, [students, payments, selectedTerm, selectedYear, feeConfig, classes, schoolCalendar]);

  const filteredSummaries = useMemo(() => {
    const STATUS_ORDER: Record<string, number> = { unpaid: 0, partial: 1, paid: 2 };
    return studentSummaries
      .filter((s) => {
        if (activeClass !== "all" && s.student.classId !== activeClass) return false;
        if (searchQuery) {
          const q    = searchQuery.toLowerCase();
          const name = `${s.student.firstName} ${s.student.lastName}`.toLowerCase();
          if (!name.includes(q) && !s.student.matricule.toLowerCase().includes(q)) return false;
        }
        if (statusFilter !== "all" && s.status !== statusFilter) return false;
        return true;
      })
      .sort((a, b) =>
        `${a.student.lastName} ${a.student.firstName}`
          .localeCompare(`${b.student.lastName} ${b.student.firstName}`)
      );
  }, [studentSummaries, activeClass, searchQuery, statusFilter]);

  // ── Export Excel ──────────────────────────────────────────────────────────
  const handleExportPayments = async () => {
    if (filteredSummaries.length === 0) {
      toast.error("Aucun paiement à exporter. Ajustez vos filtres.");
      return;
    }
    const filename = `paiements-${selectedTerm.replace(/\s+/g, "-")}-${selectedYear}`;
    await exportPaymentSummaryToXLSX(filteredSummaries, selectedTerm, selectedYear, filename);
  };

  // ── Stats ─────────────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const scope = activeClass !== "all"
      ? studentSummaries.filter((s) => s.student.classId === activeClass)
      : studentSummaries;
    const paid    = scope.filter((s) => s.status === "paid").length;
    const partial = scope.filter((s) => s.status === "partial").length;
    const unpaid  = scope.filter((s) => s.status === "unpaid").length;
    return {
      total: scope.length, paid, partial, unpaid,
      totalCollected: scope.reduce((s, x) => s + x.totalPaid, 0),
      totalExpected:  scope.reduce((s, x) => s + x.expectedFee, 0),
      totalRemaining: scope.reduce((s, x) => s + x.remaining, 0),
      recoveryRate:   scope.length > 0 ? Math.round((paid / scope.length) * 100) : 0,
    };
  }, [studentSummaries, activeClass]);

  const totalUnpaidCount = useMemo(
    () => studentSummaries.filter((s) => s.status !== "paid").length,
    [studentSummaries]
  );

  // ── Bilan annuel global — jamais filtré par période ou classe ─────────────
  const annualStats = useMemo(() => {
    // Attendu : somme des frais annuels de scolarité sur tous les élèves
    const expected = studentSummaries.reduce((s, x) => s + x.yearExpectedFee, 0);
    // Encaissé : paiements paid/partial de scolarité pour l'année sélectionnée
    const collected = payments
      .filter((p) => {
        if (p.academicYear !== selectedYear) return false;
        if (p.status !== "paid" && p.status !== "partial") return false;
        if (p.term?.startsWith("Inscription") || p.term?.startsWith("Réinscription")) return false;
        return true;
      })
      .reduce((s, p) => s + p.amount, 0);
    const remaining   = Math.max(0, expected - collected);
    const progressPct = expected > 0 ? Math.min(100, Math.round((collected / expected) * 100)) : 0;
    const fullyPaid   = studentSummaries.filter((s) => s.yearRemaining === 0 && s.yearTotalPaid > 0).length;
    const withDebt    = studentSummaries.filter((s) => s.yearRemaining > 0).length;
    return { expected, collected, remaining, progressPct, fullyPaid, withDebt, total: studentSummaries.length };
  }, [studentSummaries, payments, selectedYear]);

  /**
   * Statut inscription/réinscription par élève pour l'année sélectionnée.
   * Retourne un objet { type, paid, term } par studentId.
   */
  const inscriptionStatusMap = useMemo(() => {
    const map: Record<string, { type: "inscription" | "reinscription"; paid: boolean; term: string }> = {};
    payments.forEach((p) => {
      if (p.status !== "paid") return;
      if (!p.term) return;
      const isInsc  = p.term.startsWith("Inscription");
      const isReinsc = p.term.startsWith("Réinscription");
      if (!isInsc && !isReinsc) return;
      // On garde uniquement le paiement de l'année sélectionnée
      if (p.academicYear && p.academicYear !== selectedYear) return;
      map[p.studentId] = {
        type: isInsc ? "inscription" : "reinscription",
        paid: true,
        term: p.term,
      };
    });
    return map;
  }, [payments, selectedYear]);

/** Paiements enregistrés aujourd'hui */
  const todayReport = useMemo(() => {
    const today = new Date().toISOString().split("T")[0]; // "2026-03-26"

    // ── Inclure paid ET partial (un versement partiel est quand même de l'argent encaissé)
    const todayPayments = payments.filter((p) => {
      if (p.status !== "paid" && p.status !== "partial") return false;
      const paidDate = p.paidDate || p.createdAt;
      if (!paidDate) return false;
      return paidDate.startsWith(today);
    });

    const total      = todayPayments.reduce((s, p) => s + p.amount, 0);
    const byCash     = todayPayments.filter(p => p.method === "cash").reduce((s, p) => s + p.amount, 0);
    const byMobile   = todayPayments.filter(p => p.method === "mobile_money").reduce((s, p) => s + p.amount, 0);
    const byTransfer = todayPayments.filter(p => ["bank_transfer","check"].includes(p.method ?? "")).reduce((s, p) => s + p.amount, 0);

    // ── Groupement par classe → par élève (trié chronologiquement à l'intérieur)
    const LEVEL_ORDER = ["Maternelle", "Primaire", "Collège", "Lycée"];
    type StuEntry = {
      studentId:    string;
      studentName:  string;
      matricule:    string;
      payments:     Payment[];
      studentTotal: number;
    };
    type ClsEntry = {
      classId:    string;
      className:  string;
      level:      string;
      students:   StuEntry[];
      classTotal: number;
    };
    const classMap = new Map<string, ClsEntry>();

    // Trier par heure croissante pour que le rapport reflète l'ordre de passage
    const sorted = [...todayPayments].sort((a, b) => {
      const ta = new Date(a.paidDate || a.createdAt || 0).getTime();
      const tb = new Date(b.paidDate || b.createdAt || 0).getTime();
      return ta - tb;
    });

    for (const p of sorted) {
      const stu = students.find(s => s.id === p.studentId);
      const cls = classes.find(c => c.id === (stu?.classId ?? ""));
      const classId   = stu?.classId ?? "__unknown__";
      const className = cls?.displayName ?? stu?.class?.name ?? "Classe inconnue";
      const level     = cls?.virtualLevel ?? "";

      if (!classMap.has(classId)) classMap.set(classId, { classId, className, level, students: [], classTotal: 0 });
      const ce = classMap.get(classId)!;
      ce.classTotal += p.amount;

      let se = ce.students.find(s => s.studentId === p.studentId);
      if (!se) {
        se = {
          studentId:   p.studentId,
          studentName: stu ? `${stu.firstName} ${stu.lastName}` : (p.studentName ?? "Élève"),
          matricule:   stu?.matricule ?? "",
          payments:    [],
          studentTotal: 0,
        };
        ce.students.push(se);
      }
      se.payments.push(p);
      se.studentTotal += p.amount;
    }

    const byClass = Array.from(classMap.values()).sort((a, b) => {
      const la = LEVEL_ORDER.indexOf(a.level);
      const lb = LEVEL_ORDER.indexOf(b.level);
      if (la !== lb) return (la < 0 ? 99 : la) - (lb < 0 ? 99 : lb);
      return a.className.localeCompare(b.className, "fr");
    });

    const uniqueStudents = new Set(todayPayments.map(p => p.studentId)).size;

    return { payments: todayPayments, total, byCash, byMobile, byTransfer, count: todayPayments.length, uniqueStudents, byClass };
  }, [payments, students, classes]);

  const unsyncedCount = payments.filter((p) => p.needsSync).length;

  // ── Groupes par virtualLevel pour la config frais ────────────────────────

  const virtualLevelGroups = useMemo(() => {
    const order = ["Maternelle", "Primaire", "Collège", "Lycée"];
    const map: Record<string, ClassInfo[]> = {};
    classes.forEach((c) => {
      if (!map[c.virtualLevel]) map[c.virtualLevel] = [];
      map[c.virtualLevel].push(c);
    });
    return order
      .filter((vl) => map[vl]?.length > 0)
      .map((vl) => ({ virtualLevel: vl, classes: map[vl] }));
  }, [classes]);

  /** Ensemble de tous les mois déjà payés pour l'élève sélectionné dans l'année en cours */
  const paidMonthsForStudent = useMemo(() => {
    if (!selectedStudentForPayment) return new Set<string>();
    const paidMonths = new Set<string>();
    payments.forEach((p) => {
      if (p.studentId !== selectedStudentForPayment.id) return;
      if (p.academicYear && p.academicYear !== paymentForm.academicYear) return;
      if (p.status !== "paid") return; // partial = incomplet, reste sélectionnable
      if (!p.term) return;
      if (p.term.includes(",")) {
        p.term.split(",").map((s) => s.trim()).forEach((m) => paidMonths.add(m));
      } else if (p.term.startsWith("Trimestre")) {
        getMonthsWithYearForTrimestre(p.term, paymentForm.academicYear, schoolCalendar).forEach((m) => paidMonths.add(m));
      } else if (p.term.startsWith("Annuel")) {
        getSchoolMonthsWithYear(paymentForm.academicYear, schoolCalendar).forEach((m) => paidMonths.add(m));
      } else {
        paidMonths.add(p.term!);
        // Normaliser les anciens termes sans année ("Mars" → "Mars 2026")
        const allSchool = getSchoolMonthsWithYear(paymentForm.academicYear, schoolCalendar);
        const yearQualified = allSchool.find(m => m.split(" ")[0] === p.term!.trim());
        if (yearQualified) paidMonths.add(yearQualified);
      }
    });
    return paidMonths;
  }, [selectedStudentForPayment, payments, paymentForm.academicYear, schoolCalendar]);

  /** Mois avec un paiement PARTIEL pour l'élève en cours (affichage amber dans la grille) */
  const partialMonthsForStudent = useMemo(() => {
    if (!selectedStudentForPayment) return new Set<string>();
    const partialMonths = new Set<string>();
    payments.forEach((p) => {
      if (p.studentId !== selectedStudentForPayment.id) return;
      if (p.academicYear && p.academicYear !== paymentForm.academicYear) return;
      if (p.status !== "partial") return;
      if (!p.term) return;
      if (p.term.includes(",")) {
        p.term.split(",").map((s) => s.trim()).forEach((m) => partialMonths.add(m));
      } else if (p.term.startsWith("Trimestre")) {
        getMonthsWithYearForTrimestre(p.term, paymentForm.academicYear, schoolCalendar).forEach((m) => partialMonths.add(m));
      } else {
        partialMonths.add(p.term!);
        const allSchool = getSchoolMonthsWithYear(paymentForm.academicYear, schoolCalendar);
        const yearQualified = allSchool.find(m => m.split(" ")[0] === p.term!.trim());
        if (yearQualified) partialMonths.add(yearQualified);
      }
    });
    return partialMonths;
  }, [selectedStudentForPayment, payments, paymentForm.academicYear, schoolCalendar]);

  // ── Validation séquentielle ───────────────────────────────────────────────

  /**
   * Mois scolaires ordonnés (avec année) pour l'année du dialog en cours.
   * Ex : ["Septembre 2025", "Octobre 2025", ..., "Mai 2026"]
   */
  const dialogSchoolMonths = useMemo<string[]>(() => {
    if (!isDialogOpen) return [];
    return getSchoolMonthsWithYear(paymentForm.academicYear, schoolCalendar);
  }, [isDialogOpen, paymentForm.academicYear, schoolCalendar]);

  /**
   * Index du premier mois non-payé dans le calendrier scolaire.
   * Tous les mois avant cet index sont déjà payés.
   * Vaut dialogSchoolMonths.length si l'année est entièrement payée.
   */
  const firstUnpaidIdx = useMemo<number>(() => {
    for (let i = 0; i < dialogSchoolMonths.length; i++) {
      if (!paidMonthsForStudent.has(dialogSchoolMonths[i])) return i;
    }
    return dialogSchoolMonths.length;
  }, [dialogSchoolMonths, paidMonthsForStudent]);

  /**
   * Handler de sélection séquentielle pour les boutons de mois dans le dialog.
   *
   * Règles :
   * - Un mois déjà payé est intouchable.
   * - La sélection est toujours un bloc CONTINU démarrant au premier mois impayé.
   * - Cliquer sur un mois NON sélectionné → sélectionne automatiquement tous les
   *   mois depuis firstUnpaid jusqu'à ce mois (pas de trou possible).
   * - Cliquer sur un mois DÉJÀ sélectionné → désélectionne ce mois ET tous ceux
   *   qui le suivent dans l'ordre scolaire (maintient la contiguïté).
   */
  const handleMonthToggle = useCallback((month: string) => {
    const monthIdx = dialogSchoolMonths.indexOf(month);
    // Mois hors calendrier (HC) : toggle libre sans contrainte séquentielle
    if (monthIdx === -1) {
      setDialogTrimestreMonths((prev) => {
        const next = new Set(prev);
        next.has(month) ? next.delete(month) : next.add(month);
        return next;
      });
      return;
    }
    // Mois scolaire payé : intouchable
    if (paidMonthsForStudent.has(month)) return;
    // Ne devrait jamais arriver avec l'UI correcte, mais défense en profondeur
    if (monthIdx < firstUnpaidIdx) return;

    setDialogTrimestreMonths((prev) => {
      const next = new Set(prev);
      if (next.has(month)) {
        // Désélectionner ce mois ET tous les suivants (ordre scolaire)
        for (let i = monthIdx; i < dialogSchoolMonths.length; i++) {
          next.delete(dialogSchoolMonths[i]);
        }
      } else {
        // Sélectionner depuis firstUnpaid jusqu'à ce mois (bloc continu)
        for (let i = firstUnpaidIdx; i <= monthIdx; i++) {
          const m = dialogSchoolMonths[i];
          if (!paidMonthsForStudent.has(m)) next.add(m);
        }
      }
      return next;
    });
  }, [dialogSchoolMonths, firstUnpaidIdx, paidMonthsForStudent]);

  /** Terme calculé depuis les mois sélectionnés dans le dialog */
  const computedDialogTerm = useMemo(() => {
    if (dialogTrimestreMonths.size === 0) return "";
    const allSchoolMonths = getSchoolMonthsWithYear(paymentForm.academicYear, schoolCalendar);
    // Si tous les mois scolaires sont sélectionnés → Annuel
    if (
      allSchoolMonths.length > 0 &&
      allSchoolMonths.length === dialogTrimestreMonths.size &&
      allSchoolMonths.every((m) => dialogTrimestreMonths.has(m))
    ) return `Annuel ${paymentForm.academicYear}`;
    // Si correspond exactement à T1, T2 ou T3 → retourner le nom du trimestre
    const groups = getCalendarTrimestreGroups(paymentForm.academicYear, schoolCalendar);
    for (const g of groups) {
      if (
        g.monthsWithYear.length === dialogTrimestreMonths.size &&
        g.monthsWithYear.every((m) => dialogTrimestreMonths.has(m))
      ) return g.trimestre;
    }
    // CSV de tous les mois sélectionnés (ordre calendrier scolaire, puis HC)
    const allMonths = getMonthsWithYear(paymentForm.academicYear, schoolCalendar);
    return allMonths.filter((m) => dialogTrimestreMonths.has(m)).join(", ");
  }, [paymentForm.academicYear, dialogTrimestreMonths, schoolCalendar]);

  /** Vrai si l'élève a déjà un paiement annuel pour cette année scolaire */
  const annualAlreadyPaid = useMemo(() => {
    if (!selectedStudentForPayment) return false;
    return payments.some(
      (p) =>
        p.studentId === selectedStudentForPayment.id &&
        p.term?.startsWith("Annuel") &&
        (p.academicYear === paymentForm.academicYear || !p.academicYear) &&
        (p.status === "paid" || p.status === "partial"),
    );
  }, [selectedStudentForPayment, payments, paymentForm.academicYear]);

  /** Vérifie si la période sélectionnée contient un doublon ou un saut séquentiel */
  const isDuplicateForDialog = useMemo(() => {
    if (!selectedStudentForPayment) return false;
    // Si l'année complète est déjà payée → tout nouveau paiement est un doublon
    if (annualAlreadyPaid) return true;
    const selectedList = Array.from(dialogTrimestreMonths);
    if (selectedList.length === 0) return false;
    // Bloquer si AU MOINS UN mois sélectionné est déjà payé (strict — plus de `every`)
    if (selectedList.some((m) => paidMonthsForStudent.has(m))) return true;
    // Vérifier l'absence de saut : le premier mois sélectionné doit être firstUnpaidIdx
    const selectedSchoolMonths = selectedList.filter((m) => dialogSchoolMonths.includes(m));
    if (selectedSchoolMonths.length > 0) {
      const firstSelIdx = dialogSchoolMonths.indexOf(selectedSchoolMonths[0]);
      if (firstSelIdx !== firstUnpaidIdx) return true;
    }
    return false;
  }, [selectedStudentForPayment, annualAlreadyPaid, paidMonthsForStudent, dialogTrimestreMonths, dialogSchoolMonths, firstUnpaidIdx]);

  /** Montant calculé automatiquement selon les mois sélectionnés */
  const computedDialogAmount = useMemo(() => {
    if (!selectedStudentForPayment) return 0;
    const cls = classes.find((c) => c.id === selectedStudentForPayment.classId);
    const virtualLevel = cls?.virtualLevel ?? cls?.level ?? "";
    const monthlyFee = getStudentFee(selectedStudentForPayment.classId, virtualLevel, feeConfig);
    if (dialogTrimestreMonths.size === 0) return 0;
    // En mode complétion (1 mois partiel), le montant attendu est le restant à payer
    if (completionAlreadyPaid > 0 && dialogTrimestreMonths.size === 1) {
      return Math.max(0, monthlyFee - completionAlreadyPaid);
    }
    return monthlyFee * dialogTrimestreMonths.size;
  }, [selectedStudentForPayment, dialogTrimestreMonths, classes, feeConfig, completionAlreadyPaid]);

  /** Montant effectivement envoyé : personnalisé si saisi, sinon calculé automatiquement */
  const effectiveAmount = useMemo(() => {
    if (customAmountStr) {
      const parsed = Number(customAmountStr.replace(/\s/g, "").replace(/,/g, "."));
      return isNaN(parsed) || parsed <= 0 ? 0 : parsed;
    }
    return computedDialogAmount;
  }, [customAmountStr, computedDialogAmount]);

  // Synchronise le montant calculé vers paymentForm (pour l'envoi backend)
  useEffect(() => {
    if (isDialogOpen) {
      setPaymentForm((prev) => ({ ...prev, amount: String(computedDialogAmount) }));
    }
  }, [computedDialogAmount, isDialogOpen]);

  /** Frais mensuel de l'élève en cours dans le dialog (pour l'aperçu distribution) */
  const dialogMonthlyFee = useMemo(() => {
    if (!selectedStudentForPayment) return 0;
    const cls = classes.find((c) => c.id === selectedStudentForPayment.classId);
    const vLevel = cls?.virtualLevel ?? cls?.level ?? "";
    return getStudentFee(selectedStudentForPayment.classId, vLevel, feeConfig);
  }, [selectedStudentForPayment, classes, feeConfig]);

  /** Distribution par mois (paiement mixte : certains complets, dernier partiel) */
  const dialogMonthDistribution = useMemo(() => {
    if (!effectiveAmount || dialogMonthlyFee <= 0 || dialogTrimestreMonths.size === 0) return [];
    const selectedMonths = dialogSchoolMonths.filter((m) => dialogTrimestreMonths.has(m));
    const dist: { month: string; amount: number; isPartial: boolean }[] = [];
    let remaining = effectiveAmount;
    for (let i = 0; i < selectedMonths.length; i++) {
      const month = selectedMonths[i];
      // En mode complétion, le premier mois a un seuil réduit (montant déjà versé déduit)
      const effectiveFee = (i === 0 && completionAlreadyPaid > 0)
        ? Math.max(0, dialogMonthlyFee - completionAlreadyPaid)
        : dialogMonthlyFee;
      if (remaining >= effectiveFee) {
        dist.push({ month, amount: effectiveFee, isPartial: false });
        remaining -= effectiveFee;
      } else if (remaining > 0) {
        dist.push({ month, amount: remaining, isPartial: true });
        remaining = 0;
      }
    }
    return dist;
  }, [effectiveAmount, dialogMonthlyFee, dialogTrimestreMonths, dialogSchoolMonths, completionAlreadyPaid]);

  const dialogHasMixedPayment = useMemo(
    () => dialogMonthDistribution.some((d) => d.isPartial) && dialogMonthDistribution.some((d) => !d.isPartial),
    [dialogMonthDistribution]
  );

  // ── Actions ───────────────────────────────────────────────────────────────

  const openFeeDialog = () => {
    setDraftFeeConfig(JSON.parse(JSON.stringify(feeConfig)));
    setIsFeeDialogOpen(true);
  };

  const saveFeeConfig = async () => {
    // Arrondir toutes les valeurs au millier le plus proche
    const rounded: FeeConfig = {
      mode: "by-class",
      globalFee: roundFee(draftFeeConfig.globalFee),
      byLevel: Object.fromEntries(
        Object.entries(draftFeeConfig.byLevel).map(([k, v]) => [k, roundFee(v)])
      ),
      byClass: Object.fromEntries(
        Object.entries(draftFeeConfig.byClass).map(([k, v]) => [k, roundFee(v)])
      ),
      inscriptionFee:   draftFeeConfig.inscriptionFee   ? roundFee(draftFeeConfig.inscriptionFee)   : undefined,
      reinscriptionFee: draftFeeConfig.reinscriptionFee ? roundFee(draftFeeConfig.reinscriptionFee) : undefined,
    };
    const hasLevelFee = Object.values(rounded.byLevel).some((v) => v > 0);
    const hasClassFee = Object.values(rounded.byClass).some((v) => v > 0);
    if (rounded.globalFee <= 0 && !hasLevelFee && !hasClassFee) {
      toast.error("Veuillez configurer au moins un frais");
      return;
    }

    // Sauvegarder en BDD (source de vérité partagée entre tous les utilisateurs)
    const token = storage.getAuthItem("structura_token");
    if (token && isOnline) {
      try {
        await updateFeesConfig(token, {
          feeConfig:        rounded,
          paymentFrequency: paymentFrequency,
        });
      } catch (err) {
        toast.error("Erreur lors de la sauvegarde", {
          description: err instanceof Error ? err.message : "Impossible d'enregistrer les frais.",
        });
        return;
      }
    }

    // Mettre à jour l'état local + cache offline
    setFeeConfig(rounded);
    localStorage.setItem(CLASS_FEES_KEY, JSON.stringify(rounded));
    setIsFeeDialogOpen(false);
    toast.success("Frais mis à jour !");
  };

  /** Marque un reçu comme imprimé (localStorage) */
  const markReceiptDone = (key: string) => {
    setGeneratedReceipts((prev) => {
      const next = new Set(prev);
      next.add(key);
      localStorage.setItem(RECEIPTS_DONE_KEY, JSON.stringify(Array.from(next)));
      return next;
    });
  };

  const openStudentDrawer = (summary: StudentSummary) => {
    setDrawerStudent(summary);
  };

  const openPaymentDialog = (student: BackendStudent, preselect?: { month: string; remaining: number; alreadyPaid?: number }) => {
    // Bloquer si les frais ne sont pas configurés
    const cls = classes.find((c) => c.id === student.classId);
    const vLevel = cls?.virtualLevel ?? cls?.level ?? "";
    const fee = getStudentFee(student.classId, vLevel, feeConfig);
    if (fee <= 0) {
      toast.error("Frais de scolarité non configurés", {
        description: "Le directeur doit configurer les frais avant d'enregistrer un paiement.",
      });
      return;
    }

    setSelectedStudentForPayment(student);

    const academicYr = selectedYear;

    // Calculer les mois déjà payés pour cet élève (inline, avant le setState)
    // allMonths défini AVANT la boucle pour permettre la normalisation des anciens termes
    const allMonths = getSchoolMonthsWithYear(academicYr, schoolCalendar);
    const alreadyPaid = new Set<string>();
    payments.forEach((p) => {
      if (p.studentId !== student.id) return;
      if (p.academicYear && p.academicYear !== academicYr) return;
      if (p.status !== "paid") return; // partial = pas complet, reste sélectionnable dans le dialog
      if (!p.term) return;
      if (p.term.includes(",")) {
        p.term.split(",").map((s) => s.trim()).forEach((mo) => alreadyPaid.add(mo));
      } else if (p.term.startsWith("Trimestre")) {
        getMonthsWithYearForTrimestre(p.term, academicYr, schoolCalendar).forEach((mo) => alreadyPaid.add(mo));
      } else if (p.term.startsWith("Annuel")) {
        getSchoolMonthsWithYear(academicYr, schoolCalendar).forEach((mo) => alreadyPaid.add(mo));
      } else {
        alreadyPaid.add(p.term!);
        // Normaliser les anciens termes sans année ("Mars" → "Mars 2026")
        const yearQualified = allMonths.find(m => m.split(" ")[0] === p.term!.trim());
        if (yearQualified) alreadyPaid.add(yearQualified);
      }
    });

    // Toujours pré-sélectionner le premier mois impayé (contrainte séquentielle)
    // Jamais sauter des mois même si le mois courant est plus loin dans le calendrier
    const initMonth = allMonths.find((mo) => !alreadyPaid.has(mo)) ?? null;

    if (preselect) {
      // Mode "Compléter un partiel" : forcer le mois + montant restant
      setDialogTrimestreMonths(new Set([preselect.month]));
      setCustomAmountStr(String(preselect.remaining));
      setCompletionAlreadyPaid(preselect.alreadyPaid ?? 0);
    } else {
      setDialogTrimestreMonths(initMonth ? new Set([initMonth]) : new Set());
      setCustomAmountStr("");
      setCompletionAlreadyPaid(0);
    }

    setPaymentForm({
      amount: "", method: "CASH",
      description: preselect ? `Complément ${preselect.month}` : "Frais de scolarité",
      term: selectedTerm, academicYear: academicYr,
    });
    setIsDialogOpen(true);
  };

  const openInscriptionDialog = (student: BackendStudent) => {
    setInscriptionStudent(student);
    // Détection automatique non modifiable :
    // - Élève avec AU MOINS UN paiement enregistré → élève de l'école → réinscription
    // - Aucun paiement → nouvel élève → inscription
    const hasAnyPayment = payments.some(
      (p) => p.studentId === student.id && p.status === "paid"
    );
    setInscriptionType(hasAnyPayment ? "reinscription" : "inscription");
    setInscriptionMethod("CASH");
    setInscriptionDialogOpen(true);
  };

  const confirmInscriptionPayment = async () => {
    if (!inscriptionStudent) return;
    const fee = inscriptionType === "inscription"
      ? (feeConfig.inscriptionFee || 0)
      : (feeConfig.reinscriptionFee || 0);
    if (fee <= 0) {
      toast.error("Frais non configurés", {
        description: "Le directeur doit configurer les frais d'inscription dans la configuration.",
      });
      return;
    }
    // Vérifier doublon
    const term = `${inscriptionType === "inscription" ? "Inscription" : "Réinscription"} ${selectedYear}`;
    const alreadyExists = payments.some(
      (p) => p.studentId === inscriptionStudent.id && p.term === term && p.status === "paid"
    );
    if (alreadyExists) {
      toast.error(`${inscriptionType === "inscription" ? "L'inscription" : "La réinscription"} a déjà été enregistrée pour ${selectedYear}.`);
      return;
    }
    const token = storage.getAuthItem("structura_token");
    if (!token) { toast.error("Session expirée."); return; }
    setInscriptionSaving(true);
    // Optimiste
    const tempId = `temp-${crypto.randomUUID()}`;
    const tempPayment: Payment = {
      id: tempId, studentId: inscriptionStudent.id,
      studentName: `${inscriptionStudent.firstName} ${inscriptionStudent.lastName}`,
      amount: fee, currency: getActiveCurrency(),
      method: inscriptionMethod.toLowerCase() as Payment["method"],
      status: "paid", paidDate: new Date().toISOString(),
      description: inscriptionType === "inscription" ? "Frais d'inscription" : "Frais de réinscription",
      academicYear: selectedYear, term,
      createdAt: new Date().toISOString(),
    };
    queryClient.setQueryData<Payment[]>(PAYMENTS_QUERY_KEY(user?.tenantId), (prev = []) => [tempPayment, ...prev]);
    setInscriptionDialogOpen(false);
    setInscriptionSaving(false);
    toast.success(`${inscriptionType === "inscription" ? "Inscription" : "Réinscription"} enregistrée — ${formatCurrency(fee)}`);
    try {
      const created = await createPayment(token, {
        studentId: inscriptionStudent.id, amount: fee,
        method: inscriptionMethod, currency: getActiveCurrency(), status: "paid",
        description: tempPayment.description, academicYear: selectedYear, term,
        paidDate: new Date().toISOString(),
      });
      const realPayment = mapBackendPayment(created);
      queryClient.setQueryData<Payment[]>(PAYMENTS_QUERY_KEY(user?.tenantId), (prev = []) =>
        prev.map((p) => (p.id === tempId ? realPayment : p))
      );
      offlineDB.add(STORES.PAYMENTS, realPayment).catch(() => {});
    } catch (err: any) {
      queryClient.setQueryData<Payment[]>(PAYMENTS_QUERY_KEY(user?.tenantId), (prev = []) =>
        prev.filter((p) => p.id !== tempId)
      );
      toast.error("Erreur lors de l'enregistrement", { description: err.message });
    }
  };

  const confirmPayment = async () => {
    if (!selectedStudentForPayment || effectiveAmount <= 0) return;

    // Garde niveau 2 : doublons / sauts (normalement déjà bloqués par l'UI)
    if (isDuplicateForDialog) {
      toast.error("Paiement invalide", {
        description: annualAlreadyPaid
          ? `La scolarité ${paymentForm.academicYear} est entièrement réglée.`
          : `Certains mois sélectionnés sont déjà payés ou la séquence est incorrecte.`,
      });
      return;
    }

    if (!computedDialogTerm) {
      toast.error("Veuillez sélectionner une période.");
      return;
    }

    // Garde niveau 2 : vérifier la continuité de la sélection (défense en profondeur)
    const selectedInOrder = dialogSchoolMonths.filter((m) => dialogTrimestreMonths.has(m));
    if (selectedInOrder.length > 0) {
      for (let i = 1; i < selectedInOrder.length; i++) {
        const prevIdx = dialogSchoolMonths.indexOf(selectedInOrder[i - 1]);
        const currIdx = dialogSchoolMonths.indexOf(selectedInOrder[i]);
        if (currIdx !== prevIdx + 1) {
          toast.error("Sélection non continue", {
            description: "Impossible de payer des mois non consécutifs.",
          });
          return;
        }
      }
    }

    setIsSubmitting(true);
    const token  = storage.getAuthItem("structura_token");
    const amount = effectiveAmount;

    // Calculer les totaux pour le reçu (avant la mise à jour de l'état)
    const receiptCls = classes.find((c) => c.id === selectedStudentForPayment.classId);
    const receiptVirtualLevel = receiptCls?.virtualLevel ?? receiptCls?.level ?? "";
    const receiptMonthlyFee   = getStudentFee(selectedStudentForPayment.classId, receiptVirtualLevel, feeConfig);
    const receiptFullYearFee  = receiptMonthlyFee * schoolCalendar.durationMonths;
    const prevYearPaid = payments
      .filter((p) => p.studentId === selectedStudentForPayment.id &&
                     p.academicYear === paymentForm.academicYear &&
                     p.status === "paid")
      .reduce((s, p) => s + p.amount, 0);
    const receiptTotalPaid = prevYearPaid + amount;
    const receiptRemaining = Math.max(0, receiptFullYearFee - receiptTotalPaid);

    // Mois sélectionnés dans l'ordre du calendrier scolaire
    const receiptMonths = getMonthsWithYear(paymentForm.academicYear, schoolCalendar)
      .filter((m) => dialogTrimestreMonths.has(m));

    // ── Distribution par mois (paiement mixte : certains complets, dernier partiel) ──
    // Ex : 2 mois à 120k, parent donne 180k → Oct=120k(complet) + Nov=60k(partiel)
    const monthDistribution: { month: string; amount: number; isPartial: boolean }[] = [];
    if (receiptMonths.length > 0 && receiptMonthlyFee > 0) {
      let remaining = amount;
      for (let mi = 0; mi < receiptMonths.length; mi++) {
        const month = receiptMonths[mi];
        // En mode complétion, le premier mois a un seuil réduit
        const effectiveFee = (mi === 0 && completionAlreadyPaid > 0)
          ? Math.max(0, receiptMonthlyFee - completionAlreadyPaid)
          : receiptMonthlyFee;
        if (remaining >= effectiveFee) {
          monthDistribution.push({ month, amount: effectiveFee, isPartial: false });
          remaining -= effectiveFee;
        } else if (remaining > 0) {
          monthDistribution.push({ month, amount: remaining, isPartial: true });
          remaining = 0;
        }
      }
    }
    const hasMixedPayment = monthDistribution.some((d) => d.isPartial) && monthDistribution.some((d) => !d.isPartial);
    // Cas : seulement des mois partiels (ex : 1 mois sélectionné, montant < frais mensuels)
    const allPartial = monthDistribution.length > 0 && monthDistribution.every((d) => d.isPartial);
    // Dictionnaire { "Octobre 2026": 120000, "Novembre 2026": 60000 } — lookup robuste par nom
    const receiptMonthAmounts: Record<string, number> | undefined = monthDistribution.length > 0
      ? Object.fromEntries(monthDistribution.map((d) => [d.month, d.amount]))
      : undefined;

    // ── Construit les données du reçu sans déclencher le PDF ────────────────
    const buildReceiptData = (newPayment: Payment): PaymentReceiptData => ({
      receiptNumber:      newPayment.receiptNumber || `REC-${Date.now()}`,
      studentName:        newPayment.studentName || `${selectedStudentForPayment?.firstName ?? ""} ${selectedStudentForPayment?.lastName ?? ""}`.trim() || "Élève",
      studentMatricule:   selectedStudentForPayment?.matricule || "",
      className:          receiptCls?.displayName ?? receiptCls?.name ?? "",
      amount,
      totalPaid:          receiptTotalPaid,
      expectedFee:        receiptFullYearFee,
      remaining:          receiptRemaining,
      date:               newPayment.paidDate || new Date().toISOString(),
      paymentMethod:      formatMethod(paymentForm.method),
      description:        paymentForm.description,
      academicYear:       paymentForm.academicYear,
      term:               computedDialogTerm,
      schoolName:         user?.schoolName || "Structura",
      schoolLogo:         user?.schoolLogo ?? undefined,
      schoolPhone:        "",
      schoolAddress:      "",
      months:             receiptMonths,
      monthlyFee:         receiptMonthlyFee,
      monthAmounts:       receiptMonthAmounts,
      currency:           getActiveCurrency(),
      trimestreBreakdown: buildTrimestreBreakdown(
        dialogTrimestreMonths,
        paymentForm.academicYear,
        schoolCalendar,
      ),
    });

    // ── Calcul des termes pour paiement mixte (complets + partiel) ──────────
    const now = new Date().toISOString();
    const fullMonths = monthDistribution.filter((d) => !d.isPartial).map((d) => d.month);
    const partialEntry = monthDistribution.find((d) => d.isPartial) ?? null;

    // Terme principal : mois complets seulement (si mixte), sinon tous les mois
    // Si les mois complets forment exactement un trimestre → utiliser son nom
    const mainTerm = (() => {
      if (!hasMixedPayment) return computedDialogTerm;
      if (fullMonths.length === 0) return computedDialogTerm;
      const groups = getCalendarTrimestreGroups(paymentForm.academicYear, schoolCalendar);
      for (const g of groups) {
        if (
          g.monthsWithYear.length === fullMonths.length &&
          g.monthsWithYear.every((m) => fullMonths.includes(m))
        ) return g.trimestre;
      }
      // Si tous les mois scolaires sont complets → Annuel
      const allSch = getSchoolMonthsWithYear(paymentForm.academicYear, schoolCalendar);
      if (allSch.length === fullMonths.length && allSch.every((m) => fullMonths.includes(m))) {
        return `Annuel ${paymentForm.academicYear}`;
      }
      return fullMonths.join(", ");
    })();
    const mainAmount = hasMixedPayment
      ? fullMonths.length * receiptMonthlyFee
      : amount;

    // ── UI optimiste : paiement(s) temporaire(s) visible(s) immédiatement ────
    const tempId = `temp-${crypto.randomUUID()}`;
    const tempPayment: Payment = {
      id: tempId, studentId: selectedStudentForPayment.id,
      studentName: `${selectedStudentForPayment.firstName} ${selectedStudentForPayment.lastName}`,
      amount: mainAmount, currency: getActiveCurrency(),
      method: paymentForm.method.toLowerCase() as Payment["method"],
      status: allPartial ? "partial" : "paid", paidDate: now,
      description:  paymentForm.description,
      academicYear: paymentForm.academicYear, term: mainTerm,
      createdAt: now,
    };

    // Paiement partiel du mois suivant (si paiement mixte)
    const tempPartialId = hasMixedPayment && partialEntry ? `temp-${crypto.randomUUID()}` : null;
    const tempPartialPayment: Payment | null = (tempPartialId && partialEntry) ? {
      id: tempPartialId, studentId: selectedStudentForPayment.id,
      studentName: `${selectedStudentForPayment.firstName} ${selectedStudentForPayment.lastName}`,
      amount: partialEntry.amount, currency: getActiveCurrency(),
      method: paymentForm.method.toLowerCase() as Payment["method"],
      status: "partial", paidDate: now,
      description:  paymentForm.description,
      academicYear: paymentForm.academicYear, term: partialEntry.month,
      createdAt: now,
    } : null;

    const allTempPayments = [tempPayment, tempPartialPayment].filter(Boolean) as Payment[];
    queryClient.setQueryData<Payment[]>(PAYMENTS_QUERY_KEY(user?.tenantId), (prev = []) =>
      [...allTempPayments, ...prev]
    );
    setPendingReceiptData(buildReceiptData(tempPayment));
    setDialogMode("success");
    setIsSubmitting(false);

    // ── Persistance en arrière-plan ───────────────────────────────────────────
    if (!isOnline || !token) {
      // Mode hors ligne : sauvegarder localement
      const offlinePayment = { ...tempPayment, needsSync: true };
      offlineDB.add(STORES.PAYMENTS, offlinePayment).catch(() => {});
      syncQueue.add({ type: "payment", action: "create", data: { _tempId: tempId, ...offlinePayment } }).catch(() => {});
      queryClient.setQueryData<Payment[]>(PAYMENTS_QUERY_KEY(user?.tenantId), (prev = []) =>
        prev.map((p) => (p.id === tempId ? { ...offlinePayment } : p))
      );
      toast.info("Paiement enregistré — il sera envoyé au serveur dès la reconnexion.");
      return;
    }

    try {
      // Paiement principal (mois complets, ou tout si pas de mixte)
      const created = await createPayment(token, {
        studentId:    selectedStudentForPayment.id,
        amount:       mainAmount,
        method:       paymentForm.method,
        currency:     getActiveCurrency(),
        status:       allPartial ? "partial" : "paid",
        description:  paymentForm.description,
        academicYear: paymentForm.academicYear,
        term:         mainTerm,
        paidDate:     now,
      });
      const realPayment = mapBackendPayment(created);
      queryClient.setQueryData<Payment[]>(PAYMENTS_QUERY_KEY(user?.tenantId), (prev = []) =>
        prev.map((p) => (p.id === tempId ? realPayment : p))
      );
      offlineDB.add(STORES.PAYMENTS, realPayment).catch(() => {});
      markReceiptDone(realPayment.receiptNumber || realPayment.id);
      setPendingReceiptData(buildReceiptData(realPayment));

      // Paiement partiel du mois suivant (si paiement mixte) — fire-and-forget
      if (tempPartialPayment && tempPartialId && partialEntry) {
        createPayment(token, {
          studentId:    selectedStudentForPayment.id,
          amount:       partialEntry.amount,
          method:       paymentForm.method,
          currency:     getActiveCurrency(),
          status:       "partial",
          description:  paymentForm.description,
          academicYear: paymentForm.academicYear,
          term:         partialEntry.month,
          paidDate:     now,
        }).then((createdPartial) => {
          const realPartial = mapBackendPayment(createdPartial);
          queryClient.setQueryData<Payment[]>(PAYMENTS_QUERY_KEY(user?.tenantId), (prev = []) =>
            prev.map((p) => (p.id === tempPartialId ? realPartial : p))
          );
          offlineDB.add(STORES.PAYMENTS, realPartial).catch(() => {});
        }).catch(() => {
          queryClient.setQueryData<Payment[]>(PAYMENTS_QUERY_KEY(user?.tenantId), (prev = []) =>
            prev.filter((p) => p.id !== tempPartialId)
          );
        });
      }

    } catch (error: any) {
      const isNetworkFailure = !navigator.onLine || error.message === "Failed to fetch";
      const allTempIds = [tempId, tempPartialId].filter(Boolean);
      if (isNetworkFailure) {
        // Connexion coupée → garder tous les paiements en offline
        allTempPayments.forEach((tp) => {
          const op = { ...tp, needsSync: true };
          offlineDB.add(STORES.PAYMENTS, op).catch(() => {});
          syncQueue.add({ type: "payment", action: "create", data: { _tempId: tp.id, ...op } }).catch(() => {});
        });
        toast.info("Paiements enregistrés — ils seront envoyés au serveur dès la reconnexion.");
      } else {
        // Erreur serveur → rollback complet
        queryClient.setQueryData<Payment[]>(PAYMENTS_QUERY_KEY(user?.tenantId), (prev = []) =>
          prev.filter((p) => !allTempIds.includes(p.id))
        );
        setDialogMode("form");
        setIsSubmitting(false);
        toast.error("Erreur lors de l'enregistrement", { description: error.message });
      }
    }
  };

  const handleGenerateReceipt = async (summary: StudentSummary, specificPayment?: Payment, mode: ReceiptOutputMode = "download") => {
    const payment = specificPayment || [...summary.payments]
      .filter((p) => p.status === "paid")
      .sort((a, b) =>
        new Date(b.paidDate || b.createdAt || 0).getTime() -
        new Date(a.paidDate || a.createdAt || 0).getTime()
      )[0];
    if (!payment) return;

    const trackingKey = payment.receiptNumber || payment.id;

    // Avertissement réimpression (sans blocage — le personnel peut toujours réimprimer)
    if (generatedReceipts.has(trackingKey)) {
      toast.info("Copie du reçu générée", {
        description: `Reçu N° ${payment.receiptNumber || "—"} — déjà imprimé une fois sur cet appareil.`,
      });
    }

    // Dériver la liste de mois depuis le term du paiement archivé
    const payAcadYear = payment.academicYear || selectedYear;
    const payTerm     = payment.term || selectedTerm;

    // Détecter inscription / réinscription
    const isInscPayment   = payTerm.startsWith("Inscription");
    const isReinscPayment = payTerm.startsWith("Réinscription");
    const isInscOrReinsc  = isInscPayment || isReinscPayment;

    // ── Chercher un paiement partiel lié (paiement mixte complet+partiel) ──────
    // Critères : même élève, même année scolaire, statut "partial",
    // paidDate dans une fenêtre de ±2 minutes (robuste si le serveur génère son propre timestamp)
    const linkedPartial = !isInscOrReinsc ? (() => {
      if (!payment.paidDate) return null;
      const refTime = new Date(payment.paidDate).getTime();
      if (isNaN(refTime)) return null;
      return payments.find((p) => {
        if (p.id === payment.id) return false;
        if (p.studentId !== payment.studentId) return false;
        if (p.status !== "partial") return false;
        if (p.academicYear !== payAcadYear) return false;
        if (!p.paidDate) return false;
        const diff = Math.abs(new Date(p.paidDate).getTime() - refTime);
        return diff <= 2 * 60 * 1000; // ±2 minutes
      }) ?? null;
    })() : null;

    // Mois du paiement principal
    const mainMonths: string[] = (() => {
      if (isInscOrReinsc) return [];
      if (!payTerm) return [];
      if (payTerm.startsWith("Annuel")) return getSchoolMonthsWithYear(payAcadYear, schoolCalendar);
      if (payTerm.startsWith("Trimestre")) {
        const grps = getCalendarTrimestreGroups(payAcadYear, schoolCalendar);
        return grps.find((g) => g.trimestre === payTerm)?.monthsWithYear ?? [];
      }
      if (payTerm.includes(",")) return payTerm.split(",").map((s) => s.trim());
      return [payTerm];
    })();

    // Fusionner avec le mois partiel lié si présent
    const regenMonths = linkedPartial?.term
      ? [...mainMonths, linkedPartial.term]
      : mainMonths;

    // Montants par mois (pour affichage correct sur le reçu)
    const regenMonthlyFee = isInscOrReinsc ? undefined :
      summary.yearExpectedFee && schoolCalendar.durationMonths > 0
        ? Math.round(summary.yearExpectedFee / schoolCalendar.durationMonths)
        : undefined;

    // Dictionnaire montant par mois pour réimpression (lookup robuste par nom)
    const regenMonthAmounts: Record<string, number> | undefined = (linkedPartial && regenMonthlyFee)
      ? Object.fromEntries([
          ...mainMonths.map((m) => [m, regenMonthlyFee] as [string, number]),
          [linkedPartial.term, linkedPartial.amount] as [string, number],
        ])
      : undefined;

    // Montant total : principal + partiel lié
    const regenTotalAmount = payment.amount + (linkedPartial?.amount ?? 0);

    await generatePaymentReceipt({
      receiptNumber:      payment.receiptNumber || `REC-${Date.now()}`,
      studentName:        `${summary.student.firstName} ${summary.student.lastName}`,
      studentMatricule:   summary.student.matricule,
      className:          summary.className,
      amount:             regenTotalAmount,
      // Pour inscription/réinscription : pas de récap scolarité annuelle
      totalPaid:          isInscOrReinsc ? undefined : summary.yearTotalPaid,
      expectedFee:        isInscOrReinsc ? undefined : summary.yearExpectedFee,
      remaining:          isInscOrReinsc ? undefined : summary.yearRemaining,
      date:               payment.paidDate || new Date().toISOString(),
      paymentMethod:      formatMethod(payment.method),
      description:        payment.description || (isInscOrReinsc ? payTerm : "Frais de scolarité"),
      academicYear:       payAcadYear,
      term:               regenMonths.length > 1 ? regenMonths.join(", ") : (payTerm || regenMonths[0] || ""),
      schoolName:         user?.schoolName || "Structura",
      schoolLogo:         user?.schoolLogo ?? undefined,
      schoolPhone:        "",
      schoolAddress:      "",
      months:             regenMonths,
      monthlyFee:         regenMonthlyFee,
      monthAmounts:       regenMonthAmounts,
      currency:           getActiveCurrency(),
      paymentCategory:    isInscPayment ? "inscription" : isReinscPayment ? "reinscription" : "scolarite",
      // Recalcule la décomposition depuis les mois fusionnés (avec partiel inclus)
      trimestreBreakdown: isInscOrReinsc ? undefined : buildTrimestreBreakdown(
        new Set(regenMonths),
        payAcadYear,
        schoolCalendar,
      ),
      outputMode: mode,
    });

    markReceiptDone(trackingKey);
    const modeLabel = mode === "preview" ? "Aperçu ouvert" : mode === "print" ? "Impression lancée" : "Reçu téléchargé";
    toast.success(modeLabel);
  };

  // ── Helpers UI ────────────────────────────────────────────────────────────

  const StatusBadge = ({ status }: { status: PaymentStatus }) => {
    if (status === "paid")
      return <Badge className="bg-emerald-500/10 text-emerald-700 border-emerald-200 border"><CheckCircle2 className="h-3 w-3 mr-1" /> Payé</Badge>;
    if (status === "partial")
      return <Badge className="bg-amber-500/10 text-amber-700 border-amber-200 border"><Clock className="h-3 w-3 mr-1" /> Partiel</Badge>;
    return <Badge className="bg-red-500/10 text-red-700 border-red-200 border"><AlertCircle className="h-3 w-3 mr-1" /> Non payé</Badge>;
  };

  const periods       = getPeriodsForFrequency(paymentFrequency, schoolCalendar);
  const currentFeeLabel = (() => {
    const hasLevelFee = Object.values(feeConfig.byLevel).some((v) => v > 0);
    const hasClassFee = Object.values(feeConfig.byClass).some((v) => v > 0);
    if (hasClassFee || hasLevelFee) return "Par niveau/classe";
    return formatCurrency(feeConfig.globalFee);
  })();

  // ── Handler ajout poste de frais (école publique) ────────────────────────

  const handleAddFeeItem = async () => {
    if (!feeItemForm.name.trim() || !feeItemForm.amount) return;
    const token = storage.getAuthItem("structura_token");
    if (!token) return;
    setFeeItemSaving(true);
    try {
      let updated: import("@/lib/api/fees.service").FeeItem[];
      if (editingFeeItem) {
        // Mode édition : remplacer l'existant
        updated = feeItems.map((fi) =>
          fi.id === editingFeeItem.id
            ? { ...fi, name: feeItemForm.name.trim(), amount: Number(feeItemForm.amount), classIds: feeItemForm.allClasses ? [] : feeItemForm.classIds, academicYear: feeItemForm.academicYear }
            : fi
        );
      } else {
        // Mode ajout
        const newItem: import("@/lib/api/fees.service").FeeItem = {
          id: crypto.randomUUID(),
          name: feeItemForm.name.trim(),
          amount: Number(feeItemForm.amount),
          classIds: feeItemForm.allClasses ? [] : feeItemForm.classIds,
          academicYear: feeItemForm.academicYear,
          createdAt: new Date().toISOString(),
        };
        updated = [...feeItems, newItem];
      }
      await updateFeesConfig(token, { feeItems: updated });
      setFeeItems(updated);
      setIsFeeItemDialogOpen(false);
      setEditingFeeItem(null);
      setFeeItemForm({
        name: "",
        amount: "",
        academicYear: feeItemForm.academicYear,
        classIds: [],
        allClasses: true,
      });
      toast.success(editingFeeItem ? "Poste de frais modifié" : "Poste de frais ajouté");
    } catch {
      toast.error("Impossible d'enregistrer le poste de frais");
    } finally {
      setFeeItemSaving(false);
    }
  };

  // ── Handlers vue publique ─────────────────────────────────────────────────

  const openEditFeeItem = (item: import("@/lib/api/fees.service").FeeItem) => {
    setEditingFeeItem(item);
    setFeeItemForm({
      name: item.name,
      amount: String(item.amount),
      academicYear: item.academicYear,
      classIds: item.classIds,
      allClasses: item.classIds.length === 0,
    });
    setIsFeeItemDialogOpen(true);
  };

  const openAddFeeItem = () => {
    setEditingFeeItem(null);
    setFeeItemForm({
      name: "",
      amount: "",
      academicYear: selectedYear,
      classIds: [],
      allClasses: false, // classes visibles dès l'ouverture
    });
    setIsFeeItemDialogOpen(true);
  };

  const handleDeleteFeeItem = async (itemId: string) => {
    const token = storage.getAuthItem("structura_token");
    if (!token) return;
    setDeletingFeeItemId(itemId);
    try {
      const newItems = feeItems.filter((fi) => fi.id !== itemId);
      await updateFeesConfig(token, { feeItems: newItems });
      setFeeItems(newItems);
      toast.success("Poste de frais supprimé");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Impossible de supprimer");
    } finally {
      setDeletingFeeItemId(null);
    }
  };

  const handleMarkPaidConfirm = async () => {
    if (!markPaidDialog) return;
    const { student, item } = markPaidDialog;
    const token = storage.getAuthItem("structura_token");
    if (!token) return;
    setMarkPaidSaving(true);
    try {
      const result = await createPayment(token, {
        studentId: student.id,
        amount: item.amount,
        method: markPaidMethod,
        currency: getActiveCurrency(),
        status: "paid",
        description: markPaidNote.trim() || item.name,
        term: item.id,
        academicYear: item.academicYear,
        paidDate: new Date().toISOString(),
      });
      const cls = classes.find((c) => c.id === student.classId);
      setMarkPaidDialog(null);
      setMarkPaidNote("");
      toast.success(`Paiement enregistré — ${student.firstName} ${student.lastName}`, {
        action: result?.receiptNumber ? {
          label: "Imprimer reçu",
          onClick: () => generatePaymentReceipt({
            studentName: `${student.firstName} ${student.lastName}`,
            studentMatricule: student.matricule,
            className: cls?.displayName ?? "",
            amount: item.amount,
            totalPaid: item.amount,
            expectedFee: item.amount,
            remaining: 0,
            paymentMethod: markPaidMethod,
            description: markPaidNote.trim() || item.name,
            date: new Date().toISOString(),
            receiptNumber: result.receiptNumber ?? `REC-${Date.now()}`,
            academicYear: item.academicYear,
            term: item.name,
            schoolName: user?.schoolName ?? "",
            schoolAddress: "",
            schoolPhone: "",
            isContribution: true,
          }).catch(() => {}),
        } : undefined,
      });
      queryClient.invalidateQueries({ queryKey: PAYMENTS_QUERY_KEY(user?.tenantId) });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Impossible d'enregistrer le paiement");
    } finally {
      setMarkPaidSaving(false);
    }
  };

  const handleCancelPublicPayment = async (paymentId: string, studentName: string) => {
    const token = storage.getAuthItem("structura_token");
    if (!token) return;
    try {
      await deletePayment(token, paymentId);
      toast.success(`Paiement annulé — ${studentName}`);
      queryClient.invalidateQueries({ queryKey: PAYMENTS_QUERY_KEY(user?.tenantId) });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Impossible d'annuler le paiement");
    }
  };

  const handleBulkMarkPaid = async (item: import("@/lib/api/fees.service").FeeItem, unpaidStudents: BackendStudent[]) => {
    const token = storage.getAuthItem("structura_token");
    if (!token || unpaidStudents.length === 0) return;
    setBulkMarkingItemId(item.id);
    // Parallélisation : tous les paiements s'envoient simultanément
    const results = await Promise.allSettled(unpaidStudents.map((student) =>
      createPayment(token, {
        studentId: student.id,
        amount: item.amount,
        method: "CASH",
        currency: getActiveCurrency(),
        status: "paid",
        description: item.name,
        term: item.id,
        academicYear: item.academicYear,
        paidDate: new Date().toISOString(),
      })
    ));
    const done = results.filter((r) => r.status === "fulfilled").length;
    setBulkMarkingItemId(null);
    toast.success(`${done}/${unpaidStudents.length} paiements enregistrés`);
    queryClient.invalidateQueries({ queryKey: PAYMENTS_QUERY_KEY(user?.tenantId) });
  };

  // ─── Rendu ──────────────────────────────────────────────────────────────

  // ── Vue école publique ────────────────────────────────────────────────────
  if (schoolType === "public") {
    // ── Stats globales ──
    const allConcernedStudents = new Set(
      feeItems.flatMap((item) =>
        item.classIds.length === 0
          ? students.map((s) => s.id)
          : students.filter((s) => item.classIds.includes(s.classId)).map((s) => s.id)
      )
    );
    // Dédupliqué par élève et par poste (comme le calcul par-poste) pour éviter le double-comptage
    const totalCollectedAll = feeItems.reduce((total, item) => {
      const itemPaidMap = new Map(
        payments
          .filter((p) => p.term === item.id && p.status === "paid")
          .map((p) => [p.studentId, p])
      );
      return total + [...itemPaidMap.values()].reduce((sum, p) => sum + p.amount, 0);
    }, 0);
    const totalExpectedAll = feeItems.reduce((sum, item) => {
      const count = item.classIds.length === 0
        ? students.length
        : students.filter((s) => item.classIds.includes(s.classId)).length;
      return sum + item.amount * count;
    }, 0);
    const globalRate = totalExpectedAll > 0 ? Math.round((totalCollectedAll / totalExpectedAll) * 100) : 0;

    // ── Filtres ──
    const searchLower = publicSearchQuery.toLowerCase();
    const filterStudents = (list: BackendStudent[]) =>
      list.filter((s) => {
        const matchClass = publicClassFilter === "all" || s.classId === publicClassFilter;
        const matchSearch = !searchLower || `${s.firstName} ${s.lastName}`.toLowerCase().includes(searchLower) || (s.matricule ?? "").toLowerCase().includes(searchLower);
        return matchClass && matchSearch;
      });

    return (
      <div className="space-y-5">
        {/* En-tête */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Frais &amp; Paiements</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Frais ponctuels — école publique
              {user?.schoolName && <span className="font-medium text-foreground"> · {user.schoolName}</span>}
            </p>
          </div>
          {canConfigureFees && (
            <Button onClick={openAddFeeItem} className="gap-2 self-start">
              <Plus className="h-4 w-4" />
              Ajouter un poste
            </Button>
          )}
        </div>

        {/* Cards stats */}
        {feeItems.length > 0 && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Card className="p-4">
              <p className="text-xs text-muted-foreground mb-1">Postes actifs</p>
              <p className="text-2xl font-bold">{feeItems.length}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-muted-foreground mb-1">Élèves concernés</p>
              <p className="text-2xl font-bold">{allConcernedStudents.size}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-muted-foreground mb-1">Collecté</p>
              <p className="text-2xl font-bold text-green-600">{formatCurrency(totalCollectedAll)}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-muted-foreground mb-1">Taux global</p>
              <div className="flex items-end gap-2">
                <p className="text-2xl font-bold">{globalRate}%</p>
              </div>
              <div className="w-full bg-muted rounded-full h-1.5 mt-2">
                <div className="bg-green-500 h-1.5 rounded-full transition-all" style={{ width: `${globalRate}%` }} />
              </div>
            </Card>
          </div>
        )}

        {/* Barre recherche + filtre classe */}
        {feeItems.length > 0 && (
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher un élève…"
                value={publicSearchQuery}
                onChange={(e) => setPublicSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={publicClassFilter} onValueChange={setPublicClassFilter}>
              <SelectTrigger className="sm:w-48">
                <SelectValue placeholder="Toutes les classes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les classes</SelectItem>
                {classes.map((cls) => (
                  <SelectItem key={cls.id} value={cls.id}>{cls.displayName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* État vide */}
        {!feesLoading && feeItems.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <DollarSign className="h-12 w-12 text-muted-foreground/40 mb-4" />
              <h3 className="font-semibold text-lg mb-1">Aucun frais configuré</h3>
              <p className="text-muted-foreground text-sm max-w-sm">
                Ajoutez des postes de frais ponctuels (uniforme, examens, sorties…) selon les besoins.
              </p>
              {canConfigureFees && (
                <Button onClick={openAddFeeItem} className="mt-4 gap-2">
                  <Plus className="h-4 w-4" />
                  Ajouter un poste
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {/* Liste des postes de frais */}
        {feeItems.map((item) => {
          const baseConcerned = item.classIds.length === 0
            ? students
            : students.filter((s) => item.classIds.includes(s.classId));
          const concernedStudents = filterStudents(baseConcerned);

          const paidMap = new Map(
            payments
              .filter((p) => p.term === item.id && p.status === "paid")
              .map((p) => [p.studentId, p])
          );

          const paidCount    = baseConcerned.filter((s) => paidMap.has(s.id)).length;
          const totalCount   = baseConcerned.length;
          const totalCollected = [...paidMap.values()].reduce((sum, p) => sum + p.amount, 0);
          const progressPct  = totalCount > 0 ? Math.round((paidCount / totalCount) * 100) : 0;
          const unpaidFiltered = concernedStudents.filter((s) => !paidMap.has(s.id));
          const isDeleting   = deletingFeeItemId === item.id;
          const isBulking    = bulkMarkingItemId === item.id;

          return (
            <Card key={item.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  {/* Titre + badges */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <CardTitle className="text-base">{item.name}</CardTitle>
                    <Badge variant="secondary" className="font-mono">{formatCurrency(item.amount)}</Badge>
                    <Badge variant="outline" className="text-xs">{item.academicYear}</Badge>
                    {item.classIds.length > 0 && (
                      <Badge variant="outline" className="text-xs text-blue-600 border-blue-200 bg-blue-50">
                        {item.classIds.length} classe{item.classIds.length > 1 ? "s" : ""}
                      </Badge>
                    )}
                  </div>
                  {/* Actions */}
                  <div className="flex items-center gap-1.5">
                    {canCreatePayment && unpaidFiltered.length > 0 && (
                      <Button
                        size="sm" variant="outline"
                        className="h-7 text-xs gap-1"
                        disabled={isBulking}
                        onClick={() => handleBulkMarkPaid(item, baseConcerned.filter((s) => !paidMap.has(s.id)))}
                      >
                        {isBulking ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                        Tout marquer payé
                      </Button>
                    )}
                    {canConfigureFees && (
                      <>
                        <Button
                          size="sm" variant="ghost"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                          onClick={() => openEditFeeItem(item)}
                        >
                          <Settings2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm" variant="ghost"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-red-600"
                          disabled={isDeleting}
                          onClick={() => handleDeleteFeeItem(item.id)}
                        >
                          {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                {/* Barre de progression */}
                <div className="mt-3 space-y-1">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{paidCount}/{totalCount} élèves payés</span>
                    <span className="font-medium text-foreground">{formatCurrency(totalCollected)} collectés · {progressPct}%</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2">
                    <div
                      className={cn("h-2 rounded-full transition-all", progressPct === 100 ? "bg-green-500" : "bg-blue-500")}
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                </div>
              </CardHeader>

              <CardContent className="pt-0">
                {concernedStudents.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-6 text-center">
                    {publicSearchQuery || publicClassFilter !== "all" ? "Aucun élève correspond aux filtres." : "Aucun élève concerné par ce poste."}
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Élève</TableHead>
                        <TableHead>Classe</TableHead>
                        <TableHead>Statut</TableHead>
                        <TableHead>Montant</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Méthode</TableHead>
                        <TableHead className="w-[130px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {concernedStudents.map((student) => {
                        const paymentRecord = paidMap.get(student.id);
                        const paid = !!paymentRecord;
                        const cls = classes.find((c) => c.id === student.classId);
                        const methodLabel: Record<string, string> = {
                          cash: "Espèces", mobile_money: "Mobile Money",
                          bank_transfer: "Virement", check: "Chèque",
                          CASH: "Espèces", MOBILE_MONEY: "Mobile Money",
                          BANK_TRANSFER: "Virement", CHECK: "Chèque",
                        };
                        return (
                          <TableRow key={student.id} className={paid ? "" : "bg-amber-50/30"}>
                            <TableCell className="font-medium">
                              {student.firstName} {student.lastName}
                              {student.matricule && (
                                <span className="block text-xs text-muted-foreground font-normal">{student.matricule}</span>
                              )}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {cls?.displayName ?? "—"}
                            </TableCell>
                            <TableCell>
                              {paid ? (
                                <Badge className="bg-green-100 text-green-800 border-green-200 gap-1">
                                  <CheckCircle2 className="h-3 w-3" />
                                  Payé
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-amber-700 border-amber-300 bg-amber-50 gap-1">
                                  <Clock className="h-3 w-3" />
                                  En attente
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="font-mono text-sm">
                              {paid ? formatCurrency(paymentRecord.amount) : "—"}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {paymentRecord?.paidDate
                                ? new Date(paymentRecord.paidDate).toLocaleDateString("fr-FR")
                                : "—"}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {paid ? (methodLabel[paymentRecord.method] ?? paymentRecord.method) : "—"}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                {!paid && canCreatePayment && (
                                  <Button
                                    size="sm" variant="default"
                                    className="h-7 text-xs gap-1"
                                    onClick={() => {
                                      setMarkPaidMethod("CASH");
                                      setMarkPaidNote("");
                                      setMarkPaidDialog({ student, item });
                                    }}
                                  >
                                    <Check className="h-3 w-3" />
                                    Marquer payé
                                  </Button>
                                )}
                                {paid && canCreatePayment && paymentRecord.id && (
                                  <Button
                                    size="sm" variant="ghost"
                                    className="h-7 text-xs gap-1 text-red-600 hover:text-red-700 hover:bg-red-50"
                                    onClick={() => handleCancelPublicPayment(paymentRecord.id, `${student.firstName} ${student.lastName}`)}
                                  >
                                    <X className="h-3 w-3" />
                                    Annuler
                                  </Button>
                                )}
                                {paid && paymentRecord.id && (
                                  <Button
                                    size="sm" variant="ghost"
                                    className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                                    title="Imprimer reçu"
                                    onClick={() => generatePaymentReceipt({
                                      studentName: `${student.firstName} ${student.lastName}`,
                                      studentMatricule: student.matricule,
                                      className: cls?.displayName ?? "",
                                      amount: paymentRecord.amount,
                                      totalPaid: paymentRecord.amount,
                                      expectedFee: item.amount,
                                      remaining: 0,
                                      paymentMethod: paymentRecord.method,
                                      description: item.name,
                                      date: paymentRecord.paidDate ?? new Date().toISOString(),
                                      receiptNumber: paymentRecord.receiptNumber ?? `REC-${paymentRecord.id.slice(0, 8)}`,
                                      academicYear: item.academicYear,
                                      term: item.name,
                                      schoolName: user?.schoolName ?? "",
                                      schoolAddress: "",
                                      schoolPhone: "",
                                      isContribution: true,
                                    }).catch(() => {})}
                                  >
                                    <Printer className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          );
        })}

        {/* Dialog "Marquer payé" avec méthode */}
        <Dialog open={!!markPaidDialog} onOpenChange={(o) => { if (!o) setMarkPaidDialog(null); }}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Enregistrer le paiement</DialogTitle>
              <DialogDescription>
                {markPaidDialog && (
                  <span>
                    <strong>{markPaidDialog.student.firstName} {markPaidDialog.student.lastName}</strong>
                    {" — "}{markPaidDialog.item.name}{" — "}<span className="font-mono">{formatCurrency(markPaidDialog.item.amount)}</span>
                  </span>
                )}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label>Méthode de paiement</Label>
                <Select value={markPaidMethod} onValueChange={(v) => setMarkPaidMethod(v as typeof markPaidMethod)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CASH">Espèces</SelectItem>
                    <SelectItem value="MOBILE_MONEY">Mobile Money</SelectItem>
                    <SelectItem value="BANK_TRANSFER">Virement bancaire</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mp-note">Note (optionnel)</Label>
                <Input
                  id="mp-note"
                  placeholder="ex: Reçu n°…, remarque…"
                  value={markPaidNote}
                  onChange={(e) => setMarkPaidNote(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setMarkPaidDialog(null)}>Annuler</Button>
              <Button onClick={handleMarkPaidConfirm} disabled={markPaidSaving} className="gap-2">
                {markPaidSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Confirmer
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Dialog ajout / édition poste de frais */}
        <Dialog open={isFeeItemDialogOpen} onOpenChange={(o) => { if (!o) { setIsFeeItemDialogOpen(false); setEditingFeeItem(null); } }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{editingFeeItem ? "Modifier le poste de frais" : "Ajouter un poste de frais"}</DialogTitle>
              <DialogDescription>
                Ce poste sera appliqué aux élèves des classes sélectionnées.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="fi-name">Nom du poste</Label>
                <Input
                  id="fi-name"
                  placeholder="ex: Uniforme scolaire, Frais d'examen…"
                  value={feeItemForm.name}
                  onChange={(e) => setFeeItemForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fi-amount">Montant ({getActiveCurrency()})</Label>
                <Input
                  id="fi-amount"
                  type="number"
                  min={0}
                  placeholder="ex: 50000"
                  value={feeItemForm.amount}
                  onChange={(e) => setFeeItemForm((f) => ({ ...f, amount: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fi-year">Année scolaire</Label>
                <Input
                  id="fi-year"
                  placeholder="ex: 2025-2026"
                  value={feeItemForm.academicYear}
                  onChange={(e) => setFeeItemForm((f) => ({ ...f, academicYear: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Classes concernées</Label>
                {/* Toggle "Toutes les classes" */}
                <Button
                  type="button"
                  variant={feeItemForm.allClasses ? "default" : "outline"}
                  size="sm"
                  className="text-xs h-7 gap-1.5"
                  onClick={() => setFeeItemForm((f) => ({ ...f, allClasses: !f.allClasses, classIds: [] }))}
                >
                  {feeItemForm.allClasses ? <CheckCircle2 className="h-3 w-3" /> : <Users className="h-3 w-3" />}
                  {feeItemForm.allClasses ? "Toutes les classes (cliquer pour choisir)" : "Choisir les classes"}
                </Button>
                {/* Chips de sélection — visibles quand allClasses = false */}
                {!feeItemForm.allClasses && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {classes.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">Chargement des classes…</p>
                    ) : (
                      classes.map((cls) => {
                        const selected = feeItemForm.classIds.includes(cls.id);
                        return (
                          <button
                            key={cls.id}
                            type="button"
                            onClick={() =>
                              setFeeItemForm((f) => ({
                                ...f,
                                classIds: selected
                                  ? f.classIds.filter((id) => id !== cls.id)
                                  : [...f.classIds, cls.id],
                              }))
                            }
                            className={`px-3 py-1.5 rounded-full text-xs font-medium border-2 transition-all ${
                              selected
                                ? "bg-primary text-primary-foreground border-primary shadow-sm"
                                : "bg-background text-muted-foreground border-muted-foreground/30 hover:border-primary hover:text-primary"
                            }`}
                          >
                            {selected && "✓ "}{cls.displayName}
                          </button>
                        );
                      })
                    )}
                  </div>
                )}
                {!feeItemForm.allClasses && feeItemForm.classIds.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {feeItemForm.classIds.length} classe{feeItemForm.classIds.length > 1 ? "s" : ""} sélectionnée{feeItemForm.classIds.length > 1 ? "s" : ""}
                  </p>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setIsFeeItemDialogOpen(false); setEditingFeeItem(null); }}>
                Annuler
              </Button>
              <Button
                onClick={handleAddFeeItem}
                disabled={feeItemSaving || !feeItemForm.name.trim() || !feeItemForm.amount}
              >
                {feeItemSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                {editingFeeItem ? "Enregistrer les modifications" : "Ajouter le poste"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="space-y-5">

      {/* ── En-tête ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Gestion des Paiements</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Suivi des frais de scolarité
            {user?.schoolName && <span className="font-medium text-foreground"> · {user.schoolName}</span>}
          </p>
          {!isOnline && (
            <Badge variant="outline" className="mt-2 bg-amber-50 text-amber-700 border-amber-200">
              <WifiOff className="h-3 w-3 mr-1" />
              Mode hors ligne {unsyncedCount > 0 && `• ${unsyncedCount} en attente de sync`}
            </Badge>
          )}
        </div>
        <div className="flex gap-2 self-start">
          <Button variant="outline" size="sm" onClick={handleExportPayments} disabled={filteredSummaries.length === 0} className="gap-2">
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Exporter</span>
          </Button>
          <Button variant="outline" size="sm" onClick={() => { refetchStudents(); refetchPayments(); refetchClasses(); }} disabled={isLoading} className="gap-2">
            <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
            <span className="hidden sm:inline">Actualiser</span>
          </Button>
        </div>
      </div>

      {/* ── Alerte fin de mois ── */}
      {endOfMonthInfo.show && totalUnpaidCount > 0 && (
        <div className="flex items-start gap-3 p-4 bg-orange-50 border border-orange-200 rounded-lg">
          <Bell className="h-5 w-5 text-orange-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-orange-800">
              Fin du mois dans {endOfMonthInfo.daysLeft === 0 ? "aujourd'hui" : `${endOfMonthInfo.daysLeft} jour${endOfMonthInfo.daysLeft > 1 ? "s" : ""}`}
            </p>
            <p className="text-sm text-orange-700 mt-0.5">
              <strong>{totalUnpaidCount} élève{totalUnpaidCount > 1 ? "s" : ""}</strong> n'ont pas encore réglé les frais de <strong>{selectedTerm}</strong>.
              Pensez à les contacter avant la clôture du mois.
            </p>
          </div>
        </div>
      )}

      {/* ── Barre de configuration ── */}
      <div className="flex flex-wrap gap-3 items-center p-3 bg-muted/40 rounded-lg border">
        {/* Fréquence */}
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">Mode :</span>
          <Select value={paymentFrequency} onValueChange={(v) => handleFrequencyChange(v as PaymentFrequency)}>
            <SelectTrigger className="h-8 w-36 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="monthly">Mensuel</SelectItem>
              <SelectItem value="quarterly">Trimestriel</SelectItem>
              <SelectItem value="annual">Annuel</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="h-5 w-px bg-border hidden sm:block" />

        {/* Frais */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">Frais :</span>
          {(() => {
            const isConfigured = feeConfig.globalFee > 0
              || Object.values(feeConfig.byLevel).some((v) => v > 0)
              || Object.values(feeConfig.byClass).some((v) => v > 0);
            return isConfigured ? (
              <span className="flex items-center gap-1 text-sm font-semibold text-emerald-700">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {currentFeeLabel}
              </span>
            ) : (
              <span className="flex items-center gap-1 text-sm font-semibold text-red-600">
                <AlertCircle className="h-3.5 w-3.5" />
                Non configurés
              </span>
            );
          })()}
          {canConfigureFees && (
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={openFeeDialog}>
              <Settings2 className="h-3.5 w-3.5" />
              Configurer
            </Button>
          )}
        </div>

        {/* Période + Année */}
        <div className="flex items-center gap-2 ml-auto flex-wrap">
          <Select value={selectedTerm} onValueChange={setSelectedTerm}>
            <SelectTrigger className="h-8 w-40 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {periods.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input
            className="h-8 w-28 text-sm" placeholder="2025-2026"
            value={selectedYear} onChange={(e) => setSelectedYear(e.target.value)}
          />
        </div>
      </div>

      {/* ── Rapport du jour ── */}
      {todayReport.count > 0 && canViewAmounts && (
        <>
          {/* ── Bannière déclencheur ── */}
          <button
            type="button"
            className="w-full rounded-xl border bg-emerald-50/60 border-emerald-200 flex items-center justify-between px-4 py-3 text-left hover:bg-emerald-50 transition-colors"
            onClick={() => setTodayReportOpen(true)}
          >
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                <TrendingUp className="h-4 w-4 text-emerald-700" />
              </div>
              <div>
                <p className="text-sm font-semibold text-emerald-900">
                  Aujourd&apos;hui — {todayReport.count} paiement{todayReport.count > 1 ? "s" : ""}
                </p>
                <p className="text-xs text-emerald-700">
                  {todayReport.uniqueStudents} élève{todayReport.uniqueStudents > 1 ? "s" : ""} · {todayReport.byClass.length} classe{todayReport.byClass.length > 1 ? "s" : ""} · {formatCurrency(todayReport.total)} encaissés
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-emerald-700">{formatCurrency(todayReport.total)}</span>
              <span className="text-[10px] text-emerald-600 border border-emerald-300 rounded px-1.5 py-0.5 bg-white">Voir →</span>
            </div>
          </button>

          {/* ── Dialog bilan structuré ── */}
          <Dialog open={todayReportOpen} onOpenChange={setTodayReportOpen}>
            <DialogContent className="sm:max-w-[620px] p-0 gap-0 flex flex-col max-h-[88vh]">

              {/* En-tête */}
              <DialogHeader className="px-6 pt-5 pb-4 border-b shrink-0 bg-emerald-50/40">
                <DialogTitle className="flex items-center gap-2 text-base">
                  <TrendingUp className="h-4 w-4 text-emerald-600" />
                  Caisse du jour — {new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })}
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  {todayReport.count} paiement{todayReport.count > 1 ? "s" : ""} · {todayReport.uniqueStudents} élève{todayReport.uniqueStudents > 1 ? "s" : ""} · {todayReport.byClass.length} classe{todayReport.byClass.length > 1 ? "s" : ""}
                </DialogDescription>
              </DialogHeader>

              {/* Récap méthodes */}
              <div className="px-6 py-3 border-b bg-white shrink-0">
                <div className="grid grid-cols-4 gap-2">
                  <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-2.5 text-center">
                    <div className="text-[10px] text-emerald-600 font-semibold uppercase mb-1">Total</div>
                    <div className="text-sm font-bold text-emerald-700 tabular-nums">{formatCurrency(todayReport.total)}</div>
                  </div>
                  {todayReport.byCash > 0 && (
                    <div className="rounded-xl bg-slate-50 border p-2.5 text-center">
                      <div className="text-[10px] text-slate-500 font-semibold uppercase mb-1">Espèces</div>
                      <div className="text-sm font-bold tabular-nums">{formatCurrency(todayReport.byCash)}</div>
                    </div>
                  )}
                  {todayReport.byMobile > 0 && (
                    <div className="rounded-xl bg-blue-50 border border-blue-100 p-2.5 text-center">
                      <div className="text-[10px] text-blue-600 font-semibold uppercase mb-1">Mobile</div>
                      <div className="text-sm font-bold text-blue-700 tabular-nums">{formatCurrency(todayReport.byMobile)}</div>
                    </div>
                  )}
                  {todayReport.byTransfer > 0 && (
                    <div className="rounded-xl bg-violet-50 border border-violet-100 p-2.5 text-center">
                      <div className="text-[10px] text-violet-600 font-semibold uppercase mb-1">Virement</div>
                      <div className="text-sm font-bold text-violet-700 tabular-nums">{formatCurrency(todayReport.byTransfer)}</div>
                    </div>
                  )}
                </div>
              </div>

              {/* Liste groupée par classe */}
              <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                {todayReport.byClass.map((cls) => (
                  <div key={cls.classId} className="rounded-xl border overflow-hidden">

                    {/* En-tête classe */}
                    <div className="flex items-center justify-between px-4 py-2.5 bg-muted/30 border-b">
                      <div className="flex items-center gap-2">
                        <GraduationCap className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="font-semibold text-sm">{cls.className}</span>
                        {cls.level && (
                          <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
                            {cls.level}
                          </span>
                        )}
                      </div>
                      <span className="text-sm font-bold text-emerald-700 tabular-nums">{formatCurrency(cls.classTotal)}</span>
                    </div>

                    {/* Élèves de la classe */}
                    <div className="divide-y">
                      {cls.students.map((stu) => (
                        <div key={stu.studentId} className="px-4 py-2.5">

                          {/* Nom + total élève — toujours affiché */}
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="font-semibold text-sm truncate">{stu.studentName}</span>
                              {stu.matricule && (
                                <span className="text-[10px] text-muted-foreground font-mono shrink-0">{stu.matricule}</span>
                              )}
                            </div>
                            <span className="text-sm font-bold text-emerald-700 tabular-nums shrink-0">
                              {formatCurrency(stu.studentTotal)}
                            </span>
                          </div>

                          {/* Détail des paiements de l'élève */}
                          <div className="space-y-1">
                            {stu.payments.map((p) => {
                              const isInsc    = p.term?.startsWith("Inscription") || p.term?.startsWith("Réinscription");
                              const isPartial = p.status === "partial";

                              // Formatage du terme : lisible et conserve l'info d'année
                              const termLabel = (() => {
                                if (!p.term) return p.description ?? "Paiement";
                                if (p.term.includes(",")) {
                                  // "Septembre 2026, Octobre 2026, Novembre 2026, Décembre 2026"
                                  // → "Sep–Déc 2026" si même année, sinon "Sep 2026 · Jan 2027 · …"
                                  const parts = p.term.split(",").map(m => m.trim());
                                  const years  = [...new Set(parts.map(m => m.split(" ")[1]))];
                                  if (years.length === 1) {
                                    // Plage compact : "Sep – Déc 2026"
                                    const first = MONTH_SHORT[parts[0].split(" ")[0]] ?? parts[0].split(" ")[0];
                                    const last  = MONTH_SHORT[parts[parts.length - 1].split(" ")[0]] ?? parts[parts.length - 1].split(" ")[0];
                                    return first === last ? `${first} ${years[0]}` : `${first} – ${last} ${years[0]}`;
                                  }
                                  // Années différentes : liste courte
                                  return parts.map(m => {
                                    const [mn, yr] = m.split(" ");
                                    return `${MONTH_SHORT[mn] ?? mn} ${yr}`;
                                  }).join(" · ");
                                }
                                return p.term;
                              })();

                              // Heure du paiement
                              const timeStr = (() => {
                                const raw = p.paidDate || p.createdAt;
                                if (!raw) return null;
                                return new Date(raw).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
                              })();

                              return (
                                <div key={p.id} className={cn(
                                  "flex items-center justify-between gap-2 text-xs rounded-md px-2 py-1",
                                  isPartial && "bg-amber-50/60"
                                )}>
                                  <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                                    {/* Badge catégorie */}
                                    <span className={cn(
                                      "text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0",
                                      isPartial  ? "bg-amber-100 text-amber-700"  :
                                      isInsc     ? "bg-violet-100 text-violet-700" :
                                                   "bg-blue-100 text-blue-700"
                                    )}>
                                      {isPartial  ? "PARTIEL" :
                                       isInsc     ? (p.term?.startsWith("Inscription") ? "INSC" : "RÉINSC") :
                                                    "SCOL"}
                                    </span>
                                    {/* Terme */}
                                    <span className="text-foreground/80 truncate font-medium">{termLabel}</span>
                                    <span className="text-muted-foreground/30 shrink-0">·</span>
                                    {/* Méthode */}
                                    <span className="text-muted-foreground shrink-0">{formatMethod(p.method)}</span>
                                    {/* Heure */}
                                    {timeStr && (
                                      <>
                                        <span className="text-muted-foreground/30 shrink-0">·</span>
                                        <span className="text-muted-foreground/60 shrink-0 tabular-nums">{timeStr}</span>
                                      </>
                                    )}
                                  </div>
                                  {/* Montant */}
                                  <span className={cn(
                                    "font-bold tabular-nums shrink-0",
                                    isPartial  ? "text-amber-700"  :
                                    isInsc     ? "text-violet-700"  :
                                                 "text-emerald-700"
                                  )}>
                                    {formatCurrency(p.amount)}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </DialogContent>
          </Dialog>
        </>
      )}

      {/* ── Bilan Annuel Global (jamais filtré par période) ── */}
      {canViewAmounts && studentSummaries.length > 0 && (
        <Card className="border border-border/60 bg-gradient-to-r from-background to-muted/20">
          <CardContent className="px-4 py-3">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              {/* Titre + progression */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                    <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
                    Bilan Annuel — {selectedYear}
                  </span>
                  <span className="text-xs font-bold text-foreground tabular-nums">
                    {annualStats.progressPct}%
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${annualStats.progressPct}%`,
                      background:
                        annualStats.progressPct >= 80
                          ? "linear-gradient(90deg,#10b981,#34d399)"
                          : annualStats.progressPct >= 50
                          ? "linear-gradient(90deg,#f59e0b,#fbbf24)"
                          : "linear-gradient(90deg,#ef4444,#f87171)",
                    }}
                  />
                </div>
              </div>
              {/* 3 stat pills */}
              <div className="flex gap-3 shrink-0 text-xs">
                <div className="flex flex-col items-center px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                  <span className="font-bold text-emerald-600 tabular-nums">{formatCurrency(annualStats.collected)}</span>
                  <span className="text-muted-foreground mt-0.5">Encaissé</span>
                </div>
                <div className="flex flex-col items-center px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20">
                  <span className="font-bold text-red-600 tabular-nums">{formatCurrency(annualStats.remaining)}</span>
                  <span className="text-muted-foreground mt-0.5">Restant</span>
                </div>
                <div className="flex flex-col items-center px-3 py-1.5 rounded-lg bg-muted/60 border border-border/60">
                  <span className="font-bold text-foreground tabular-nums">{formatCurrency(annualStats.expected)}</span>
                  <span className="text-muted-foreground mt-0.5">Attendu</span>
                </div>
              </div>
            </div>
            {/* Compteurs élèves */}
            <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
                {annualStats.fullyPaid} élève{annualStats.fullyPaid > 1 ? "s" : ""} à jour
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-2 h-2 rounded-full bg-red-500" />
                {annualStats.withDebt} avec solde dû
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-2 h-2 rounded-full bg-muted-foreground/40" />
                {annualStats.total} total
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Widget Solde Net (recettes scolarité − dépenses) ── */}
      {canViewAmounts && expensesTotal !== null && annualStats.collected > 0 && (
        <Card className="border border-border/60">
          <CardContent className="px-4 py-3">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <DollarSign className="h-3.5 w-3.5 text-primary" />
                Solde Net — {selectedYear}
              </span>
              <div className="flex items-center gap-4 text-xs">
                <span className="flex flex-col items-end">
                  <span className="text-emerald-600 font-bold tabular-nums">{formatCurrency(annualStats.collected)}</span>
                  <span className="text-muted-foreground">Recettes</span>
                </span>
                <span className="text-muted-foreground font-bold text-base">−</span>
                <span className="flex flex-col items-end">
                  <span className="text-red-600 font-bold tabular-nums">{formatCurrency(expensesTotal)}</span>
                  <span className="text-muted-foreground">Dépenses</span>
                </span>
                <span className="text-muted-foreground font-bold text-base">=</span>
                <span className="flex flex-col items-end">
                  <span className={`font-bold tabular-nums text-base ${annualStats.collected - expensesTotal >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                    {formatCurrency(annualStats.collected - expensesTotal)}
                  </span>
                  <span className="text-muted-foreground">Solde</span>
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Statistiques ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Total encaissé — directeur et comptable uniquement */}
        <Card className="border-l-4 border-l-emerald-500">
          <CardHeader className="pb-1 pt-3 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <TrendingUp className="h-3.5 w-3.5" /> Total Encaissé
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            {canViewAmounts ? (
              <>
                <div className="text-xl font-bold text-emerald-600">{formatCurrency(stats.totalCollected)}</div>
                <p className="text-xs text-muted-foreground mt-0.5">Taux de recouvrement : {stats.recoveryRate}%</p>
              </>
            ) : (
              <div className="flex items-center gap-1.5 text-muted-foreground py-1">
                <Lock className="h-4 w-4 shrink-0" />
                <span className="text-xs italic">Accès restreint</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Restant à percevoir — directeur et comptable uniquement */}
        <Card className="border-l-4 border-l-red-500">
          <CardHeader className="pb-1 pt-3 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5" /> Restant à Percevoir
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            {canViewAmounts ? (
              <>
                <div className="text-xl font-bold text-red-600">{formatCurrency(stats.totalRemaining)}</div>
                <p className="text-xs text-muted-foreground mt-0.5">{stats.unpaid + stats.partial} élève(s) en attente</p>
              </>
            ) : (
              <div className="flex items-center gap-1.5 text-muted-foreground py-1">
                <Lock className="h-4 w-4 shrink-0" />
                <span className="text-xs italic">Accès restreint</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Élèves à jour — visible par tous (pas de montant) */}
        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="pb-1 pt-3 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <Users className="h-3.5 w-3.5" /> Élèves à Jour
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="text-xl font-bold text-blue-600">{stats.paid}</div>
            <p className="text-xs text-muted-foreground mt-0.5">sur {stats.total} élèves</p>
          </CardContent>
        </Card>

        {/* Paiements partiels — visible par tous (pas de montant) */}
        <Card className="border-l-4 border-l-amber-500">
          <CardHeader className="pb-1 pt-3 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" /> Paiements Partiels
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="text-xl font-bold text-amber-600">{stats.partial}</div>
            <p className="text-xs text-muted-foreground mt-0.5">{stats.unpaid} non payé(s)</p>
          </CardContent>
        </Card>
      </div>

      {/* ── Recouvrement par classe ── */}
      {canViewAmounts && classes.length > 0 && activeClass === "all" && !isLoading && (
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <GraduationCap className="h-4 w-4 text-primary" />
              Recouvrement par classe
              <span className="text-xs font-normal text-muted-foreground">— {selectedTerm} {selectedYear}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-0 pb-3">
            {/* En-tête colonnes */}
            <div className="grid grid-cols-[1fr_80px_100px_56px] gap-2 px-4 pb-1.5 border-b text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
              <span>Classe</span>
              <span className="text-center">Élèves</span>
              <span className="text-right">Encaissé</span>
              <span className="text-right">Taux</span>
            </div>
            <div className="divide-y">
              {classes
                .map((cls) => {
                  const scope   = studentSummaries.filter((s) => s.student.classId === cls.id);
                  if (scope.length === 0) return null;
                  const paid    = scope.filter((s) => s.status === "paid").length;
                  const partial = scope.filter((s) => s.status === "partial").length;
                  const pending = scope.length - paid - partial;
                  const rate    = Math.round(((paid + partial * 0.5) / scope.length) * 100);
                  const collected = scope.reduce((sum, s) => sum + s.totalPaid, 0);
                  return { cls, scope, paid, partial, pending, rate, collected };
                })
                .filter(Boolean)
                .sort((a, b) => b!.rate - a!.rate)
                .map((item) => {
                  const { cls, scope, paid, partial, pending, rate, collected } = item!;
                  const barClass   = rate >= 80 ? "bg-emerald-500" : rate >= 50 ? "bg-amber-500" : "bg-red-500";
                  const rateClass  = rate >= 80 ? "text-emerald-600" : rate >= 50 ? "text-amber-600" : "text-red-600";
                  return (
                    <div key={cls.id} className="grid grid-cols-[1fr_80px_100px_56px] gap-2 items-center px-4 py-2.5 hover:bg-muted/40 transition-colors">

                      {/* Col 1 : nom + barre */}
                      <div className="min-w-0">
                        <button
                          onClick={() => setActiveClass(cls.id)}
                          className="text-xs font-medium hover:text-primary transition-colors text-left truncate w-full block"
                          title={cls.displayName}
                        >
                          {cls.displayName}
                        </button>
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden mt-1">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${barClass}`}
                            style={{ width: `${rate}%` }}
                          />
                        </div>
                      </div>

                      {/* Col 2 : compteurs élèves */}
                      <div className="text-center text-[11px] leading-tight">
                        {paid > 0 && <span className="text-emerald-600 font-semibold">{paid}✓</span>}
                        {partial > 0 && <span className="text-amber-600 font-semibold ml-1">{partial}~</span>}
                        {pending > 0 && <span className="text-muted-foreground ml-1">{pending}✗</span>}
                        <span className="block text-[10px] text-muted-foreground">{scope.length} élèves</span>
                      </div>

                      {/* Col 3 : montant */}
                      <div className="text-right text-xs font-semibold tabular-nums text-emerald-600">
                        {formatCurrency(collected)}
                      </div>

                      {/* Col 4 : taux */}
                      <div className={`text-right text-xs font-bold tabular-nums ${rateClass}`}>
                        {rate}%
                      </div>
                    </div>
                  );
                })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Saisie paiements en masse ── */}
      {canCreatePayment && (
        <Card className="border-dashed">
          <CardHeader
            className="py-3 px-4 cursor-pointer select-none"
            onClick={() => setBulkOpen((v) => !v)}
          >
            <CardTitle className="text-sm font-semibold flex items-center justify-between">
              <span className="flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-primary" />
                Saisie paiements en masse
                <span className="text-xs font-normal text-muted-foreground">(enregistrer plusieurs élèves d'un coup)</span>
              </span>
              <span className="text-muted-foreground text-xs">{bulkOpen ? "▲ Réduire" : "▼ Ouvrir"}</span>
            </CardTitle>
          </CardHeader>

          {bulkOpen && (
            <CardContent className="px-4 pb-4 space-y-3">
              {/* Sélecteurs classe + type + période */}
              <div className="flex flex-wrap gap-3 items-end">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-muted-foreground">Classe</label>
                  <Select value={bulkClassId} onValueChange={handleBulkClassChange}>
                    <SelectTrigger className="h-9 w-52 text-sm">
                      <SelectValue placeholder="Choisir une classe…" />
                    </SelectTrigger>
                    <SelectContent>
                      {classes.map((cls) => (
                        <SelectItem key={cls.id} value={cls.id}>{cls.displayName}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-muted-foreground">Type de paiement</label>
                  <Select value={bulkFrequency} onValueChange={(v) => handleBulkFrequencyChange(v as PaymentFrequency)}>
                    <SelectTrigger className="h-9 w-36 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">Mensuel</SelectItem>
                      <SelectItem value="quarterly">Trimestriel</SelectItem>
                      <SelectItem value="annual">Annuel</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-muted-foreground">Période</label>
                  <Select value={bulkTerm || getPeriodsForFrequency(bulkFrequency, schoolCalendar)[0]} onValueChange={handleBulkTermChange}>
                    <SelectTrigger className="h-9 w-44 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {getPeriodsForFrequency(bulkFrequency, schoolCalendar).map((p) => (
                        <SelectItem key={p} value={p}>{p}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {bulkClassId && bulkRows.length > 0 && (
                  <Button size="sm" variant="outline" className="h-9 text-xs gap-1.5" onClick={fillAllAmounts}>
                    <Check className="h-3.5 w-3.5" />
                    Pré-remplir les montants
                  </Button>
                )}
              </div>

              {/* Grille élèves */}
              {bulkClassId && bulkRows.length > 0 && (
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40">
                        <TableHead className="text-xs py-2 pl-3 w-8">#</TableHead>
                        <TableHead className="text-xs py-2">Élève</TableHead>
                        <TableHead className="text-xs py-2 w-36">Montant (GNF)</TableHead>
                        <TableHead className="text-xs py-2 w-40">Méthode</TableHead>
                        <TableHead className="text-xs py-2 w-24 text-center">Statut</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {bulkRows.map((row, idx) => (
                        <TableRow
                          key={row.id}
                          className={cn(row.skip ? "opacity-50 bg-muted/20" : "")}
                        >
                          <TableCell className="py-1.5 pl-3 text-xs text-muted-foreground">{idx + 1}</TableCell>
                          <TableCell className="py-1.5">
                            <span className="text-sm font-medium">{row.lastName} {row.firstName}</span>
                          </TableCell>
                          <TableCell className="py-1.5">
                            {row.skip ? (
                              <span className="text-xs text-emerald-600 font-medium flex items-center gap-1">
                                <CheckCircle2 className="h-3.5 w-3.5" /> Déjà payé
                              </span>
                            ) : (
                              <Input
                                type="number"
                                min="0"
                                value={row.amount}
                                onChange={(e) => updateBulkRow(row.id, "amount", e.target.value)}
                                className="h-8 text-sm w-32"
                                placeholder="0"
                              />
                            )}
                          </TableCell>
                          <TableCell className="py-1.5">
                            {!row.skip && (
                              <Select
                                value={row.method}
                                onValueChange={(v) => updateBulkRow(row.id, "method", v)}
                              >
                                <SelectTrigger className="h-8 text-xs w-36"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="CASH">Espèces</SelectItem>
                                  <SelectItem value="MOBILE_MONEY">Mobile Money</SelectItem>
                                  <SelectItem value="BANK_TRANSFER">Virement</SelectItem>
                                  <SelectItem value="CHECK">Chèque</SelectItem>
                                </SelectContent>
                              </Select>
                            )}
                          </TableCell>
                          <TableCell className="py-1.5 text-center">
                            {row.skip ? (
                              <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">Payé</Badge>
                            ) : row.amount && Number(row.amount) > 0 ? (
                              <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200">À enregistrer</Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] text-muted-foreground">—</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {bulkClassId && bulkRows.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">Aucun élève dans cette classe.</p>
              )}

              {!bulkClassId && (
                <p className="text-sm text-muted-foreground text-center py-4">Sélectionnez une classe pour afficher les élèves.</p>
              )}

              {/* Bouton enregistrer */}
              {bulkClassId && bulkRows.some((r) => !r.skip && r.amount && Number(r.amount) > 0) && (
                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs text-muted-foreground">
                    {bulkRows.filter((r) => !r.skip && r.amount && Number(r.amount) > 0).length} paiement(s) à enregistrer
                  </span>
                  <Button
                    onClick={handleBulkSave}
                    disabled={bulkSaving}
                    className="gap-2"
                  >
                    {bulkSaving ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {bulkProgress ? `${bulkProgress.done} / ${bulkProgress.total}…` : "Enregistrement…"}
                      </>
                    ) : (
                      <>
                        <Check className="h-4 w-4" />
                        Enregistrer tout
                      </>
                    )}
                  </Button>
                </div>
              )}
            </CardContent>
          )}
        </Card>
      )}

      {/* ── Filtres (recherche + classe + statut) ── */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        {/* Recherche */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher par nom ou matricule..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        {/* Filtre classe */}
        <Select value={activeClass} onValueChange={setActiveClass}>
          <SelectTrigger className="w-full sm:w-[200px]">
            <GraduationCap className="h-4 w-4 mr-2 shrink-0 text-muted-foreground" />
            <SelectValue placeholder="Toutes les classes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">
              Toutes les classes ({students.length})
            </SelectItem>
            {classes.map((cls) => {
              const total   = students.filter((s) => s.classId === cls.id).length;
              const paid    = studentSummaries.filter((s) => s.student.classId === cls.id && s.status === "paid").length;
              return (
                <SelectItem key={cls.id} value={cls.id}>
                  {cls.displayName} — {paid}/{total} payés
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
        {/* Filtre statut */}
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-[170px]">
            <Filter className="h-4 w-4 mr-2 shrink-0 text-muted-foreground" />
            <SelectValue placeholder="Statut" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les statuts</SelectItem>
            <SelectItem value="unpaid">Non payés</SelectItem>
            <SelectItem value="partial">Partiels</SelectItem>
            <SelectItem value="paid">Payés</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* ── Contexte de la vue courante ── */}
      {!isLoading && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-muted/30 rounded-lg border text-xs text-muted-foreground">
          <div className="flex items-center gap-3">
            <span>
              <span className="font-semibold text-foreground">{selectedTerm}</span>
              <span className="mx-1">·</span>
              <span className="font-semibold text-foreground">{selectedYear}</span>
            </span>
            {filteredSummaries.length > 0 && (
              <>
                <span className="text-border">|</span>
                <span>
                  <span className="font-semibold text-emerald-600">{filteredSummaries.filter(s => s.status === "paid").length} payés</span>
                  {filteredSummaries.filter(s => s.status === "partial").length > 0 && (
                    <span className="ml-2 font-semibold text-amber-600">{filteredSummaries.filter(s => s.status === "partial").length} partiels</span>
                  )}
                  <span className="ml-2 font-semibold text-red-600">{filteredSummaries.filter(s => s.status === "unpaid").length} non payés</span>
                  <span className="text-muted-foreground ml-2">/ {filteredSummaries.length} élèves</span>
                </span>
              </>
            )}
          </div>
          <span className="text-[10px]">Triés : non payés en premier</span>
        </div>
      )}

      {/* ── Tableau ── */}
      {isLoading ? (
        <div className="py-16 text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground mt-2">Chargement...</p>
        </div>
      ) : filteredSummaries.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground border rounded-lg">
          <DollarSign className="h-12 w-12 mx-auto mb-3 opacity-20" />
          <p className="font-medium">Aucun élève trouvé</p>
          <p className="text-sm mt-1">
            {students.length === 0 ? "Aucun élève enregistré." : "Aucun résultat pour ces filtres."}
          </p>
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="pl-4 py-3">Élève</TableHead>
                <TableHead className="hidden sm:table-cell py-3">Classe</TableHead>
                <TableHead className="py-3">
                  <div className="leading-tight">
                    <div>Frais scolaires</div>
                    <div className="text-[10px] font-normal text-muted-foreground normal-case tracking-normal">
                      {selectedTerm} · {selectedYear}
                    </div>
                  </div>
                </TableHead>
                <TableHead className="py-3">Statut</TableHead>
                <TableHead className="py-3 text-right pr-4">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredSummaries.map((summary) => (
                <TableRow
                  key={summary.student.id}
                  className="cursor-pointer hover:bg-muted/30 transition-colors group"
                  onClick={() => openStudentDrawer(summary)}
                >
                  {/* Élève */}
                  <TableCell className="pl-4 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-9 w-9 shrink-0">
                        <AvatarFallback className={cn(
                          "text-xs font-bold",
                          summary.status === "paid"    ? "bg-emerald-100 text-emerald-700" :
                          summary.status === "partial" ? "bg-amber-100 text-amber-700"    :
                                                         "bg-red-100 text-red-700"
                        )}>
                          {getInitials(summary.student.firstName, summary.student.lastName)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="font-semibold text-sm truncate">
                          {summary.student.firstName} {summary.student.lastName}
                        </div>
                        <div className="text-xs text-muted-foreground">{summary.student.matricule}</div>
                      </div>
                    </div>
                  </TableCell>

                  {/* Classe */}
                  <TableCell className="hidden sm:table-cell py-3">
                    <Badge variant="outline" className="text-xs font-normal whitespace-nowrap">
                      {summary.className}
                    </Badge>
                  </TableCell>

                  {/* Montants — visibles uniquement par directeur et comptable */}
                  <TableCell className="py-3">
                    {!canViewAmounts ? (
                      /* Rôle non autorisé : montants masqués */
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Lock className="h-3.5 w-3.5 shrink-0" />
                        <span className="text-xs italic">Accès restreint</span>
                      </div>
                    ) : summary.status === "paid" ? (
                      /* Payé → montant réglé en vert */
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-emerald-100 shrink-0">
                          <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                        </span>
                        <div>
                          <div className="text-sm font-bold text-emerald-600">
                            {formatCurrency(summary.expectedFee)}
                          </div>
                          <div className="text-[11px] text-emerald-600/70 font-medium">Réglé · {selectedTerm}</div>
                        </div>
                      </div>
                    ) : summary.status === "partial" ? (
                      /* Partiel → versé + reste */
                      <div>
                        <div className="text-sm font-bold text-amber-600">
                          {formatCurrency(summary.totalPaid)}
                          <span className="text-xs font-normal text-muted-foreground ml-1">
                            sur {formatCurrency(summary.expectedFee)}
                          </span>
                        </div>
                        <div className="text-[11px] text-red-600 font-semibold mt-0.5">
                          Reste {formatCurrency(summary.remaining)}
                        </div>
                      </div>
                    ) : (
                      /* Non payé → montant attendu en rouge */
                      <div>
                        <div className="text-sm font-bold text-foreground">
                          {formatCurrency(summary.expectedFee)}
                        </div>
                        <div className="text-[11px] text-red-500 font-semibold mt-0.5">
                          Non réglé · {selectedTerm}
                        </div>
                      </div>
                    )}
                  </TableCell>

                  {/* Statut */}
                  <TableCell className="py-3">
                    <StatusBadge status={summary.status} />
                    {/* Progression annuelle : visible si pas en mode annuel */}
                    {paymentFrequency !== "annual" && schoolCalendar.durationMonths > 0 && (
                      <div className={cn(
                        "text-[10px] mt-1 font-medium",
                        summary.yearPaidMonthsCount >= schoolCalendar.durationMonths
                          ? "text-emerald-600"
                          : summary.yearPaidMonthsCount > 0
                          ? "text-amber-600"
                          : "text-muted-foreground"
                      )}>
                        {summary.yearPaidMonthsCount}/{schoolCalendar.durationMonths} mois cette année
                      </div>
                    )}
                  </TableCell>

                  {/* Action principale */}
                  <TableCell className="py-3 pr-4 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1 flex-wrap">
                      {(feeConfig.inscriptionFee || feeConfig.reinscriptionFee) && (() => {
                        const insc = inscriptionStatusMap[summary.student.id];
                        if (insc?.paid) {
                          // Déjà payé : badge vert non-cliquable
                          return (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-50 border border-emerald-200 text-[10px] font-semibold text-emerald-700">
                              <CheckCircle2 className="h-3 w-3" />
                              {insc.type === "inscription" ? "Inscrit" : "Réinscrit"}
                            </span>
                          );
                        }
                        // Pas encore payé : bouton cliquable
                        return canCreatePayment ? (
                          <Button
                            size="sm" variant="ghost"
                            className="h-7 px-2 text-xs gap-1 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                            onClick={() => openInscriptionDialog(summary.student)}
                            title="Enregistrer inscription / réinscription"
                          >
                            <GraduationCap className="h-3.5 w-3.5" />
                            Inscrire
                          </Button>
                        ) : null;
                      })()}
                      {canCreatePayment && (
                        <Button
                          size="sm"
                          className={cn(
                            "h-8 text-xs font-semibold gap-1.5 shadow-sm",
                            summary.status === "paid"
                              ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                              : summary.status === "partial"
                              ? "bg-amber-500 hover:bg-amber-600 text-white"
                              : "bg-primary hover:bg-primary/90 text-primary-foreground"
                          )}
                          onClick={() => openPaymentDialog(summary.student)}
                          title="Enregistrer un paiement pour cet élève"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          {summary.status === "paid" ? "Ajouter" : "Paiement"}
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* ── Drawer détail élève (historique + reçus) ── */}
      {(() => {
        // On récupère le summary le plus frais depuis studentSummaries (après un paiement ajouté)
        const s = drawerStudent
          ? studentSummaries.find((x) => x.student.id === drawerStudent.student.id) ?? drawerStudent
          : null;
        const allYearPayments = s
          ? payments
              .filter((p) => p.studentId === s.student.id && (!selectedYear || p.academicYear === selectedYear))
              .sort((a, b) =>
                new Date(b.paidDate || b.createdAt || 0).getTime() -
                new Date(a.paidDate || a.createdAt || 0).getTime()
              )
          : [];

        const monthlyFeeForDrawer = s ? getStudentFee(s.student.classId, s.level ?? "", feeConfig) : 0;
        const fullYearFee         = monthlyFeeForDrawer * schoolCalendar.durationMonths;

        // Séparation inscription / scolarité
        const isInscOrReinscTerm = (term?: string | null) =>
          !!(term?.startsWith("Inscription") || term?.startsWith("Réinscription"));
        const inscPayments      = allYearPayments.filter((p) => isInscOrReinscTerm(p.term));
        const scolaritePayments = allYearPayments.filter((p) => !isInscOrReinscTerm(p.term));

        // Bilan annuel scolarité (paid + partial)
        const yearScolaritePaid = scolaritePayments.reduce((acc, p) => acc + p.amount, 0);
        const yearRemaining     = Math.max(0, fullYearFee - yearScolaritePaid);
        const progressPct       = fullYearFee > 0
          ? Math.min(100, Math.round((yearScolaritePaid / fullYearFee) * 100))
          : 0;

        // Calendrier par mois (statut réel)
        const drawerSchoolMonths = getSchoolMonthsWithYear(selectedYear, schoolCalendar);
        const drawerMonthMap: Record<string, { status: "paid" | "partial" | "unpaid"; paidAmount: number }> = {};
        for (const m of drawerSchoolMonths) {
          drawerMonthMap[m] = { status: "unpaid", paidAmount: 0 };
        }

        /**
         * Normalise les termes sans année ("Février" → "Février 2027") pour
         * qu'ils correspondent aux clés de drawerMonthMap.
         * Gère aussi les cas où expandTermToMonths retourne des mois déjà qualifiés.
         */
        const normalizeCovered = (raw: string[]): string[] =>
          raw.map((m) => {
            if (drawerMonthMap[m] !== undefined) return m; // déjà qualifié et présent
            // Tenter la correspondance par nom de mois sans année
            const match = drawerSchoolMonths.find((sm) => sm.split(" ")[0] === m.trim());
            return match ?? m;
          });

        for (const p of scolaritePayments) {
          if (!p.term) continue;
          const rawCovered = expandTermToMonths(p.term, selectedYear, schoolCalendar);
          const covered    = normalizeCovered(rawCovered);
          // Montant réel par mois (pour les paiements multi-mois : diviser)
          const perMonthAmount = covered.length > 1
            ? Math.round(p.amount / covered.length)
            : p.amount;
          if (p.status === "paid") {
            for (const m of covered) {
              if (drawerMonthMap[m]) drawerMonthMap[m] = { status: "paid", paidAmount: perMonthAmount };
            }
          } else if (p.status === "partial") {
            for (const m of covered) {
              if (drawerMonthMap[m] && drawerMonthMap[m].status !== "paid") {
                drawerMonthMap[m] = { status: "partial", paidAmount: p.amount };
              }
            }
          }
        }

        // Mois à régulariser (partiels + non payés)
        const toRegularize = drawerSchoolMonths
          .map((m) => ({ month: m, ...drawerMonthMap[m] }))
          .filter((m) => m.status !== "paid");

        // Chips mois couverts par un paiement (pour l'historique)
        const getPaymentMonthChips = (p: Payment): string[] => {
          if (!p.term) return [];
          if (p.term.startsWith("Annuel")) return ["Année complète"];
          return expandTermToMonths(p.term, selectedYear, schoolCalendar);
        };

        // Formater une date de paiement
        const formatPaymentDate = (p: Payment): string => {
          const raw = p.paidDate || p.createdAt;
          if (!raw) return "—";
          return new Date(raw).toLocaleString("fr-FR", {
            day: "2-digit", month: "short", year: "numeric",
            hour: "2-digit", minute: "2-digit",
          });
        };

        return (
          <Sheet open={!!drawerStudent} onOpenChange={(open) => { if (!open) setDrawerStudent(null); }}>
            <SheetContent className="w-full sm:max-w-[480px] p-0 flex flex-col bg-white border-l border-gray-200 shadow-2xl">

              {/* En-tête drawer */}
              <SheetHeader className="px-6 pt-5 pb-4 border-b bg-gray-50 shrink-0">
                <SheetTitle className="flex items-center gap-3">
                  {s && (
                    <Avatar className="h-10 w-10 shrink-0">
                      <AvatarFallback className={cn(
                        "text-sm font-bold",
                        s.status === "paid"    ? "bg-emerald-100 text-emerald-700" :
                        s.status === "partial" ? "bg-amber-100 text-amber-700"    :
                                                 "bg-red-100 text-red-700"
                      )}>
                        {s && getInitials(s.student.firstName, s.student.lastName)}
                      </AvatarFallback>
                    </Avatar>
                  )}
                  <div className="min-w-0">
                    <div className="font-bold text-base truncate">
                      {s?.student.firstName} {s?.student.lastName}
                    </div>
                    <div className="text-xs text-muted-foreground font-normal">
                      {s?.student.matricule} · {s?.className}
                    </div>
                  </div>
                </SheetTitle>
                <SheetDescription className="sr-only">Détail des paiements</SheetDescription>
              </SheetHeader>

              {/* Corps scrollable */}
              <div className="flex-1 overflow-y-auto">
                {s ? (
                  <>
                    {/* ─── 1. Bilan annuel scolarité ─── */}
                    <div className="px-6 py-5 border-b space-y-4">
                      <div className="flex items-center justify-between">
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
                          Bilan scolarité {selectedYear}
                        </p>
                        {progressPct >= 100 && (
                          <Badge className="bg-emerald-500/10 text-emerald-700 border border-emerald-200 text-[10px] py-0 px-2">
                            Scolarité complète ✓
                          </Badge>
                        )}
                      </div>

                      {/* Barre de progression */}
                      {fullYearFee > 0 && (
                        <div className="space-y-1.5">
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>{formatCurrency(yearScolaritePaid)} versés</span>
                            <span className="font-semibold">{progressPct}%</span>
                          </div>
                          <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className={cn(
                                "h-full rounded-full transition-all duration-500",
                                progressPct >= 100 ? "bg-emerald-500" :
                                progressPct >= 60  ? "bg-blue-500"    :
                                progressPct >= 30  ? "bg-amber-500"   : "bg-red-400"
                              )}
                              style={{ width: `${Math.max(progressPct, 2)}%` }}
                            />
                          </div>
                        </div>
                      )}

                      {/* 3 stats */}
                      <div className="grid grid-cols-3 gap-2">
                        <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-3 text-center">
                          <div className="text-[10px] text-emerald-600 font-semibold uppercase mb-1">Versé</div>
                          <div className="text-sm font-bold text-emerald-700 tabular-nums">{formatCurrency(yearScolaritePaid)}</div>
                        </div>
                        <div className="rounded-xl bg-slate-50 border p-3 text-center">
                          <div className="text-[10px] text-slate-500 font-semibold uppercase mb-1">Attendu</div>
                          <div className="text-sm font-bold text-slate-700 tabular-nums">{formatCurrency(fullYearFee)}</div>
                        </div>
                        <div className={cn(
                          "rounded-xl border p-3 text-center",
                          yearRemaining > 0 ? "bg-red-50 border-red-100" : "bg-emerald-50 border-emerald-100"
                        )}>
                          <div className={cn("text-[10px] font-semibold uppercase mb-1",
                            yearRemaining > 0 ? "text-red-500" : "text-emerald-600")}>Reste</div>
                          <div className={cn("text-sm font-bold tabular-nums",
                            yearRemaining > 0 ? "text-red-600" : "text-emerald-700")}>
                            {formatCurrency(yearRemaining)}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* ─── 2. Calendrier scolaire mensuel ─── */}
                    {drawerSchoolMonths.length > 0 && (
                      <div className="px-6 py-4 border-b">
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-3">
                          Calendrier scolaire {selectedYear}
                        </p>
                        <div className="grid grid-cols-3 gap-2">
                          {drawerSchoolMonths.map((m) => {
                            const info  = drawerMonthMap[m];
                            const short = MONTH_SHORT[m.split(" ")[0]] ?? m.split(" ")[0].slice(0, 3);
                            return (
                              <div
                                key={m}
                                title={m}
                                className={cn(
                                  "flex flex-col items-center gap-1.5 rounded-xl px-2 py-2.5 border text-center",
                                  info.status === "paid"    ? "bg-emerald-50 border-emerald-200" :
                                  info.status === "partial" ? "bg-amber-50 border-amber-200"     :
                                                              "bg-muted/20 border-dashed border-muted-foreground/20"
                                )}
                              >
                                <span className={cn("text-[11px] font-bold",
                                  info.status === "paid"    ? "text-emerald-700" :
                                  info.status === "partial" ? "text-amber-700"   :
                                                              "text-muted-foreground/40"
                                )}>
                                  {short}
                                </span>
                                <span className={cn("text-[10px] font-medium leading-tight tabular-nums",
                                  info.status === "paid"    ? "text-emerald-600" :
                                  info.status === "partial" ? "text-amber-600"   :
                                                              "text-muted-foreground/30"
                                )}>
                                  {info.status === "paid"    ? formatCurrency(info.paidAmount) :
                                   info.status === "partial" ? formatCurrency(info.paidAmount) :
                                   "—"}
                                </span>
                                {info.status === "paid" ? (
                                  <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                                ) : info.status === "partial" ? (
                                  <AlertTriangle className="h-3 w-3 text-amber-500" />
                                ) : (
                                  <div className="h-3 w-3 rounded-full border-2 border-dashed border-muted-foreground/20" />
                                )}
                              </div>
                            );
                          })}
                        </div>
                        <div className="flex gap-4 mt-3 text-[10px] text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <CheckCircle2 className="h-2.5 w-2.5 text-emerald-500" /> Payé
                          </span>
                          <span className="flex items-center gap-1">
                            <AlertTriangle className="h-2.5 w-2.5 text-amber-500" /> Partiel
                          </span>
                          <span className="flex items-center gap-1">
                            <div className="h-2.5 w-2.5 rounded-full border border-dashed border-muted-foreground/30" /> Non payé
                          </span>
                        </div>
                      </div>
                    )}

                    {/* ─── 3. À régulariser ─── */}
                    {toRegularize.length > 0 && (
                      <div className="px-6 py-4 border-b">
                        <div className="flex items-center gap-2 mb-3">
                          <AlertCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                          <p className="text-[10px] font-semibold text-red-600 uppercase tracking-widest">
                            À régulariser — {formatCurrency(yearRemaining)}
                          </p>
                        </div>
                        <div className="space-y-1.5">
                          {toRegularize.map(({ month, status, paidAmount }) => {
                            const missing = monthlyFeeForDrawer > 0
                              ? (status === "partial" ? monthlyFeeForDrawer - paidAmount : monthlyFeeForDrawer)
                              : 0;
                            return (
                              <div key={month} className={cn(
                                "flex items-start justify-between rounded-lg px-3 py-2 border",
                                status === "partial"
                                  ? "bg-amber-50/60 border-amber-100"
                                  : "bg-red-50/40 border-red-100"
                              )}>
                                <div className="space-y-0.5">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-medium text-sm">{month}</span>
                                    {status === "partial" && (
                                      <span className="text-[9px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">
                                        PARTIEL
                                      </span>
                                    )}
                                  </div>
                                  {status === "partial" && monthlyFeeForDrawer > 0 && (
                                    <div className="text-[11px] text-muted-foreground">
                                      {formatCurrency(paidAmount)} versé / {formatCurrency(monthlyFeeForDrawer)} attendu
                                    </div>
                                  )}
                                </div>
                                <div className="flex flex-col items-end gap-1 shrink-0">
                                  {missing > 0 && (
                                    <span className={cn("font-bold text-sm tabular-nums",
                                      status === "partial" ? "text-amber-600" : "text-red-600")}>
                                      {formatCurrency(missing)}
                                    </span>
                                  )}
                                  {status === "partial" && missing > 0 && s && (
                                    <button
                                      onClick={() => {
                                        setDrawerStudent(null);
                                        openPaymentDialog(s.student, { month, remaining: missing, alreadyPaid: paidAmount });
                                      }}
                                      className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-2 py-0.5 rounded-full transition-colors"
                                    >
                                      Compléter →
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* ─── 4. Inscription / Réinscription ─── */}
                    {inscPayments.length > 0 && (
                      <div className="px-6 py-4 border-b">
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-3">
                          Frais d'inscription
                        </p>
                        <div className="space-y-2">
                          {inscPayments.map((p) => {
                            const isInsc  = p.term?.startsWith("Inscription");
                            const tKey    = p.receiptNumber || p.id;
                            const printed = generatedReceipts.has(tKey);
                            return (
                              <div key={p.id} className="rounded-xl border border-violet-100 bg-violet-50/30 p-3">
                                <div className="flex items-center gap-2 mb-2">
                                  <span className={cn(
                                    "text-[10px] font-bold px-2 py-0.5 rounded-full",
                                    isInsc
                                      ? "bg-blue-100 text-blue-700"
                                      : "bg-violet-100 text-violet-700"
                                  )}>
                                    {isInsc ? "INSCRIPTION" : "RÉINSCRIPTION"}
                                  </span>
                                  <span className="font-bold text-sm ml-auto">{formatCurrency(p.amount)}</span>
                                  <span className="text-xs text-muted-foreground">{formatMethod(p.method)}</span>
                                </div>
                                <div className="text-[11px] text-muted-foreground">
                                  {formatPaymentDate(p)}
                                  {p.receiptNumber && (
                                    <span className="ml-2 font-mono opacity-60">{p.receiptNumber}</span>
                                  )}
                                </div>
                                <div className="flex gap-1.5 mt-2.5 pt-2 border-t border-violet-100">
                                  <Button size="sm" variant="outline"
                                    className="flex-1 h-7 text-[11px] gap-1 border-violet-200 text-violet-700 hover:bg-violet-100"
                                    onClick={() => handleGenerateReceipt(s, p, "preview")}
                                  >
                                    <Eye className="h-3 w-3" /> Aperçu
                                  </Button>
                                  <Button size="sm" variant="outline"
                                    className="flex-1 h-7 text-[11px] gap-1 border-violet-200 text-violet-700 hover:bg-violet-100"
                                    onClick={() => handleGenerateReceipt(s, p, "print")}
                                  >
                                    <Printer className="h-3 w-3" /> Imprimer
                                  </Button>
                                  <Button size="sm" variant="outline"
                                    className={cn("flex-1 h-7 text-[11px] gap-1",
                                      printed
                                        ? "border-amber-200 text-amber-700 hover:bg-amber-50"
                                        : "border-violet-200 text-violet-700 hover:bg-violet-100"
                                    )}
                                    onClick={() => handleGenerateReceipt(s, p, "download")}
                                  >
                                    <Download className="h-3 w-3" />
                                    {printed ? "Re-dl" : "PDF"}
                                  </Button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* ─── 5. Historique scolarité ─── */}
                    <div className="px-6 py-4 pb-6">
                      <div className="flex items-center gap-2 mb-3">
                        <History className="h-3.5 w-3.5 text-muted-foreground" />
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
                          Historique scolarité
                        </p>
                        <span className="ml-auto text-[10px] text-muted-foreground">
                          {scolaritePayments.length} transaction{scolaritePayments.length !== 1 ? "s" : ""}
                        </span>
                      </div>

                      {scolaritePayments.length === 0 ? (
                        <div className="py-10 text-center text-muted-foreground border rounded-xl border-dashed">
                          <FileText className="h-8 w-8 mx-auto mb-2 opacity-25" />
                          <p className="text-sm">Aucun paiement de scolarité pour {selectedYear}</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {(() => {
                            // ── Fusionner partial + complément pour le même terme ──
                            type MergedP = Payment & { _completed?: boolean; _totalAmount?: number };
                            const byTerm: Record<string, { partial: Payment | null; paid: Payment[] }> = {};
                            for (const p of scolaritePayments) {
                              const key = p.term ?? p.id;
                              if (!byTerm[key]) byTerm[key] = { partial: null, paid: [] };
                              if (p.status === "partial") byTerm[key].partial = p;
                              else byTerm[key].paid.push(p);
                            }
                            const merged: MergedP[] = [];
                            for (const { partial, paid } of Object.values(byTerm)) {
                              if (partial && paid.length > 0) {
                                // Complété → afficher comme une seule ligne avec le total
                                const total = partial.amount + paid.reduce((s, x) => s + x.amount, 0);
                                merged.push({ ...paid[0], _completed: true, _totalAmount: total });
                              } else if (partial) {
                                merged.push(partial);
                              } else {
                                merged.push(...paid);
                              }
                            }
                            merged.sort((a, b) =>
                              new Date(b.paidDate || b.createdAt || 0).getTime() -
                              new Date(a.paidDate || a.createdAt || 0).getTime()
                            );
                            return merged;
                          })().map((p) => {
                            const tKey      = p.receiptNumber || p.id;
                            const printed   = generatedReceipts.has(tKey);
                            const isCompleted = (p as any)._completed === true;
                            const displayAmount = (p as any)._totalAmount ?? p.amount;
                            const isPaid    = p.status === "paid" || isCompleted;
                            const chips     = getPaymentMonthChips(p);
                            return (
                              <div
                                key={p.id}
                                className={cn(
                                  "rounded-xl border p-3",
                                  isPaid ? "bg-card border-border" : "bg-amber-50/40 border-amber-200"
                                )}
                              >
                                {/* Ligne 1 : badge + montant */}
                                <div className="flex items-center gap-2">
                                  <span className={cn(
                                    "text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0",
                                    isCompleted ? "bg-emerald-100 text-emerald-700" :
                                    isPaid      ? "bg-blue-100 text-blue-700"       :
                                                  "bg-amber-100 text-amber-700"
                                  )}>
                                    {isCompleted ? "COMPLÉTÉ" : isPaid ? "SCOLARITÉ" : "PARTIEL"}
                                  </span>
                                  <span className={cn(
                                    "font-bold text-sm ml-auto tabular-nums shrink-0",
                                    isCompleted ? "text-emerald-700" :
                                    isPaid      ? "text-emerald-600" :
                                                  "text-amber-600"
                                  )}>
                                    {formatCurrency(displayAmount)}
                                  </span>
                                </div>

                                {/* Chips mois couverts */}
                                {chips.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-2">
                                    {chips.slice(0, 9).map((chip) => (
                                      <span key={chip} className={cn(
                                        "text-[10px] px-1.5 py-0.5 rounded-md font-medium",
                                        isPaid ? "bg-blue-50 text-blue-600" : "bg-amber-50 text-amber-700"
                                      )}>
                                        {/* "Septembre 2026" → "Septembre", "Année complète" → tel quel */}
                                        {chip.includes(" ") && !chip.startsWith("Année")
                                          ? chip.split(" ")[0]
                                          : chip}
                                      </span>
                                    ))}
                                    {chips.length > 9 && (
                                      <span className="text-[10px] text-muted-foreground self-center">+{chips.length - 9}</span>
                                    )}
                                  </div>
                                )}

                                {/* Méta : méthode · date · n° reçu */}
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-2 text-[11px] text-muted-foreground">
                                  <span className="font-medium">{formatMethod(p.method)}</span>
                                  <span className="opacity-30">·</span>
                                  <span>{formatPaymentDate(p)}</span>
                                  {p.receiptNumber && (
                                    <>
                                      <span className="opacity-30">·</span>
                                      <span className="font-mono">{p.receiptNumber}</span>
                                    </>
                                  )}
                                  {p.needsSync && (
                                    <Badge variant="outline" className="text-[9px] py-0 px-1 text-amber-600 border-amber-300 ml-auto">
                                      hors ligne
                                    </Badge>
                                  )}
                                </div>

                                {/* Infos partiel */}
                                {!isPaid && monthlyFeeForDrawer > 0 && (
                                  <div className="mt-2 text-[11px] text-amber-700 bg-amber-50 rounded-lg px-2.5 py-1.5 border border-amber-100">
                                    {formatCurrency(p.amount)} versé · Reste {formatCurrency(Math.max(0, monthlyFeeForDrawer - p.amount))}
                                  </div>
                                )}

                                {/* Actions reçu */}
                                {isPaid && (
                                  <div className="flex gap-1.5 mt-2.5 pt-2 border-t border-border/50">
                                    <Button size="sm" variant="outline"
                                      className="flex-1 h-7 text-[11px] gap-1"
                                      onClick={() => handleGenerateReceipt(s, p, "preview")}
                                    >
                                      <Eye className="h-3 w-3" /> Aperçu
                                    </Button>
                                    <Button size="sm" variant="outline"
                                      className="flex-1 h-7 text-[11px] gap-1"
                                      onClick={() => handleGenerateReceipt(s, p, "print")}
                                    >
                                      <Printer className="h-3 w-3" /> Imprimer
                                    </Button>
                                    <Button size="sm" variant="outline"
                                      className={cn("flex-1 h-7 text-[11px] gap-1",
                                        printed && "border-amber-200 text-amber-600 hover:bg-amber-50"
                                      )}
                                      onClick={() => handleGenerateReceipt(s, p, "download")}
                                    >
                                      <Download className="h-3 w-3" />
                                      {printed ? "Re-dl" : "PDF"}
                                    </Button>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-muted-foreground py-20">
                    Chargement…

                  </div>
                )}
              </div>

              {/* ── Footer fixe : bouton toujours visible ── */}
              {canCreatePayment && (
                <div className="shrink-0 px-6 py-3 border-t bg-white">
                  <Button
                    className="w-full gap-2"
                    onClick={() => { setDrawerStudent(null); if (s) openPaymentDialog(s.student); }}
                  >
                    <CreditCard className="h-4 w-4" />
                    Enregistrer un paiement
                  </Button>
                </div>
              )}
            </SheetContent>
          </Sheet>
        );
      })()}

      {/* ── Dialog enregistrement paiement ── */}
      <Dialog open={isDialogOpen} onOpenChange={(open) => {
        setIsDialogOpen(open);
        if (!open) { setDialogMode("form"); setPendingReceiptData(null); }
      }}>
        <DialogContent className="sm:max-w-[520px] p-0 gap-0 flex flex-col max-h-[92vh]">

          {/* En-tête fixe */}
          <DialogHeader className="px-6 pt-5 pb-4 border-b shrink-0">
            <DialogTitle className="text-base">
              {dialogMode === "success" ? "Paiement confirmé" : "Enregistrer un Paiement"}
            </DialogTitle>
            {dialogMode === "success" ? (
              <DialogDescription className="sr-only">Paiement enregistré avec succès</DialogDescription>
            ) : selectedStudentForPayment && (() => {
              const cls           = classes.find((c) => c.id === selectedStudentForPayment.classId);
              const virtualLevel  = cls?.virtualLevel ?? cls?.level ?? "";
              const monthlyFee    = getStudentFee(selectedStudentForPayment.classId, virtualLevel, feeConfig);
              const fullYearFee   = monthlyFee * schoolCalendar.durationMonths;
              // Totaux pour toute l'année (indépendant du filtre selectedTerm)
              const yearTotalPaid = payments
                .filter((p) => p.studentId === selectedStudentForPayment.id &&
                               p.academicYear === paymentForm.academicYear &&
                               p.status === "paid")
                .reduce((s, p) => s + p.amount, 0);
              const yearRemaining   = Math.max(0, fullYearFee - yearTotalPaid);
              const isFullYearPaid  = fullYearFee > 0 && yearTotalPaid >= fullYearFee;
              const freqLabel = paymentFrequency === "monthly" ? "mensuel"
                : paymentFrequency === "quarterly" ? "trimestriel" : "annuel";
              return (
                <>
                  {/* DialogDescription : texte court pour les lecteurs d'écran uniquement */}
                  <DialogDescription className="sr-only">
                    Enregistrer un paiement pour {selectedStudentForPayment.firstName} {selectedStudentForPayment.lastName}
                  </DialogDescription>
                  {/* Contenu visuel — doit être en dehors de DialogDescription pour éviter <p><div> (HTML invalide → removeChild) */}
                  <div className="mt-1 space-y-1.5">
                    {/* Identité élève */}
                    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm">
                      <span className="font-semibold text-foreground">
                        {selectedStudentForPayment.firstName} {selectedStudentForPayment.lastName}
                      </span>
                      <span className="text-muted-foreground text-xs">· {selectedStudentForPayment.matricule}</span>
                      {cls && <span className="text-xs text-muted-foreground">· {cls.displayName}</span>}
                    </div>
                    {/* Statut paiement de l'année */}
                    {isFullYearPaid ? (
                      <div className="flex items-center gap-1.5 px-2 py-1.5 bg-emerald-50 border border-emerald-200 rounded-md text-xs text-emerald-800 font-semibold">
                        <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0" />
                        Scolarité complète réglée — {paymentForm.academicYear}
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 p-2 bg-muted/40 rounded-md text-xs">
                        <span className="text-muted-foreground">Frais {freqLabel} :</span>
                        <span className="font-semibold text-foreground">{formatCurrency(monthlyFee)}</span>
                        {yearTotalPaid > 0 && (
                          <span className="font-semibold text-emerald-700">· Versé {formatCurrency(yearTotalPaid)}</span>
                        )}
                        {yearRemaining > 0 && (
                          <span className="font-semibold text-red-600">· Reste {formatCurrency(yearRemaining)}</span>
                        )}
                      </div>
                    )}
                  </div>
                </>
              );
            })()}
          </DialogHeader>

          {/* ── Vue succès post-paiement ── */}
          {dialogMode === "success" && pendingReceiptData && (
            <>
              <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
                {/* Icône + titre */}
                <div className="flex flex-col items-center text-center gap-2">
                  <div className="h-16 w-16 rounded-full bg-emerald-100 flex items-center justify-center">
                    <CheckCircle2 className="h-9 w-9 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-lg font-bold text-emerald-700">Paiement enregistré !</p>
                    <p className="text-xs text-muted-foreground font-mono mt-0.5">
                      Reçu N° {pendingReceiptData.receiptNumber}
                    </p>
                  </div>
                </div>
                {/* Récap */}
                <div className="rounded-lg border bg-muted/30 px-4 py-3 space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Élève</span>
                    <span className="font-semibold">{pendingReceiptData.studentName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Montant</span>
                    <span className="font-bold text-emerald-700">{formatCurrency(pendingReceiptData.amount)}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground shrink-0">Période</span>
                    <span className="font-semibold text-right truncate">{pendingReceiptData.term}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Méthode</span>
                    <span>{pendingReceiptData.paymentMethod}</span>
                  </div>
                  {(pendingReceiptData.remaining ?? 0) > 0 && (
                    <div className="flex justify-between border-t pt-1.5">
                      <span className="text-muted-foreground">Reste à payer</span>
                      <span className="font-semibold text-red-600">{formatCurrency(pendingReceiptData.remaining!)}</span>
                    </div>
                  )}
                </div>
                {/* Actions reçu — PRO requis */}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground text-center mb-2">Générer le reçu</p>
                  {hasBulletins ? (
                    <div className="grid grid-cols-3 gap-2">
                      <Button
                        variant="outline"
                        className="flex flex-col h-auto py-3 gap-1.5 text-xs"
                        onClick={async () => { try { await generatePaymentReceipt({ ...pendingReceiptData, outputMode: "preview" }); } catch {} }}
                      >
                        <Eye className="h-5 w-5" />
                        Aperçu
                      </Button>
                      <Button
                        variant="outline"
                        className="flex flex-col h-auto py-3 gap-1.5 text-xs"
                        onClick={async () => { try { await generatePaymentReceipt({ ...pendingReceiptData, outputMode: "print" }); } catch {} }}
                      >
                        <Printer className="h-5 w-5" />
                        Imprimer
                      </Button>
                      <Button
                        className="flex flex-col h-auto py-3 gap-1.5 text-xs"
                        onClick={async () => { try { await generatePaymentReceipt({ ...pendingReceiptData, outputMode: "download" }); } catch {} }}
                      >
                        <Download className="h-5 w-5" />
                        Télécharger
                      </Button>
                    </div>
                  ) : (
                    <UpgradeBadge
                      variant="block"
                      requiredPlan="Pro"
                      message="Générez des reçus PDF professionnels avec le logo de votre école, le récapitulatif et le numéro de reçu. Le suivi des paiements reste gratuit."
                    />
                  )}
                </div>
              </div>
              <DialogFooter className="px-6 py-4 border-t shrink-0 flex-col gap-1">
                <Button
                  variant="ghost"
                  className="text-muted-foreground text-sm w-full"
                  onClick={() => { setIsDialogOpen(false); setDialogMode("form"); setPendingReceiptData(null); }}
                >
                  Fermer sans reçu
                </Button>
              </DialogFooter>
            </>
          )}
          {/* Corps scrollable - visible uniquement en mode formulaire */}
          {dialogMode === "form" && (<>
          <div className="overflow-y-auto overscroll-contain flex-1 px-6 py-4 space-y-4">

            {/* ── Raccourcis ── */}
            <div className="space-y-2">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Raccourcis</p>
              <div className="flex flex-wrap gap-1.5">
                {/* Mois courant — sélectionne depuis le premier impayé jusqu'au mois actuel */}
                {(() => {
                  const cur = getCurrentMonthWithYear();
                  const curIdx = dialogSchoolMonths.indexOf(cur);
                  const isCurPaid = paidMonthsForStudent.has(cur);
                  const isCurInCalendar = curIdx !== -1;
                  const isDisabled = isCurPaid || !isCurInCalendar || curIdx < firstUnpaidIdx;
                  return (
                    <button
                      type="button"
                      disabled={isDisabled}
                      onClick={() => {
                        if (isDisabled) return;
                        const newSel = new Set<string>();
                        for (let i = firstUnpaidIdx; i <= curIdx; i++) {
                          const m = dialogSchoolMonths[i];
                          if (!paidMonthsForStudent.has(m)) newSel.add(m);
                        }
                        setDialogTrimestreMonths(newSel);
                      }}
                      className={cn(
                        "px-3 py-1.5 rounded-md border text-xs font-medium transition-colors",
                        isDisabled
                          ? "opacity-40 cursor-not-allowed bg-muted border-border text-muted-foreground"
                          : "bg-background hover:bg-muted active:bg-primary/15 active:border-primary/40 active:text-primary"
                      )}
                    >
                      Mois en cours
                    </button>
                  );
                })()}
                {/* T1 / T2 / T3 — dynamiques + désactivation séquentielle */}
                {(() => {
                  const groups = getCalendarTrimestreGroups(paymentForm.academicYear, schoolCalendar);
                  return groups.map((g, groupIdx) => {
                    // Ce trimestre est-il entièrement payé ?
                    const isFullyPaid = g.monthsWithYear.every((m) => paidMonthsForStudent.has(m));
                    // Les trimestres précédents sont-ils tous entièrement payés ?
                    const prevGroupsAllPaid = groups
                      .slice(0, groupIdx)
                      .every((pg) => pg.monthsWithYear.every((m) => paidMonthsForStudent.has(m)));
                    // Bloqué si c'est T2/T3 et que le(s) trimestre(s) précédent(s) ont des impayés
                    const isBlocked = groupIdx > 0 && !prevGroupsAllPaid;
                    const isDisabled = isFullyPaid || isBlocked;
                    // Mois sélectionnables de ce trimestre (impayés uniquement)
                    const unpaidMonths = g.monthsWithYear.filter((m) => !paidMonthsForStudent.has(m));
                    const isActive = !isDisabled && unpaidMonths.length > 0 && unpaidMonths.every((m) => dialogTrimestreMonths.has(m));
                    const shortNames = unpaidMonths.map((m) => MONTH_SHORT[m.split(" ")[0]] ?? m.split(" ")[0].slice(0, 3));
                    const prevLabel = groups[groupIdx - 1]?.label ?? "le trimestre précédent";
                    return (
                      <button
                        key={g.trimestre}
                        type="button"
                        disabled={isDisabled}
                        title={
                          isFullyPaid ? `${g.label} — entièrement réglé` :
                          isBlocked   ? `Réglez d'abord ${prevLabel}` :
                          undefined
                        }
                        onClick={() => {
                          if (isDisabled) return;
                          setDialogTrimestreMonths(new Set(unpaidMonths));
                        }}
                        className={cn(
                          "relative flex flex-col items-start gap-0.5 px-3 py-2 rounded-md border text-xs font-semibold transition-all",
                          isDisabled
                            ? "opacity-40 cursor-not-allowed bg-muted border-border text-muted-foreground"
                            : isActive
                            ? "bg-primary text-primary-foreground border-primary shadow-sm ring-2 ring-primary/30 active:bg-primary/80"
                            : "bg-background border-border hover:bg-muted active:bg-primary/15 active:border-primary/40 active:text-primary"
                        )}
                      >
                        <div className="flex items-center gap-1.5">
                          <span>{g.label}</span>
                          {isFullyPaid && <CheckCircle2 className="h-3 w-3 text-emerald-500" />}
                          {isBlocked    && <Lock className="h-3 w-3" />}
                          {isActive     && <Check className="h-3 w-3" />}
                        </div>
                        <span className={cn(
                          "text-[9px] font-normal",
                          isDisabled  ? "text-muted-foreground/60" :
                          isActive    ? "text-primary-foreground/70" : "text-muted-foreground"
                        )}>
                          {isFullyPaid ? "Payé" : shortNames.join(" · ")}
                        </span>
                      </button>
                    );
                  });
                })()}
                {/* Reste de l'année — sélectionne tous les mois scolaires impayés */}
                {(() => {
                  const allSchool   = getSchoolMonthsWithYear(paymentForm.academicYear, schoolCalendar);
                  const unpaidSchool = allSchool.filter((m) => !paidMonthsForStudent.has(m));
                  const isAllYearPaid = unpaidSchool.length === 0;
                  const isActive = !isAllYearPaid && unpaidSchool.length > 0 &&
                    unpaidSchool.every((m) => dialogTrimestreMonths.has(m)) &&
                    dialogTrimestreMonths.size === unpaidSchool.length;
                  return (
                    <button
                      type="button"
                      disabled={isAllYearPaid}
                      onClick={() => {
                        if (isAllYearPaid) return;
                        setDialogTrimestreMonths(new Set(unpaidSchool));
                      }}
                      className={cn(
                        "px-3 py-1.5 rounded-md border text-xs font-medium transition-colors",
                        isAllYearPaid
                          ? "opacity-40 cursor-not-allowed bg-muted border-border text-muted-foreground"
                          : isActive
                          ? "bg-primary text-primary-foreground border-primary active:bg-primary/80"
                          : "bg-background border-border hover:bg-muted active:bg-primary/15 active:border-primary/40 active:text-primary"
                      )}
                    >
                      {isAllYearPaid
                        ? "Année entièrement payée"
                        : unpaidSchool.length === allSchool.length
                        ? `Toute l'année (${schoolCalendar.durationMonths} mois)`
                        : `Reste de l'année (${unpaidSchool.length} mois)`}
                    </button>
                  );
                })()}
                {/* Effacer */}
                <button
                  type="button"
                  onClick={() => setDialogTrimestreMonths(new Set())}
                  className="px-3 py-1.5 rounded-md border text-xs font-medium bg-background hover:bg-red-50 hover:text-red-600 hover:border-red-200 active:bg-red-100 active:text-red-700 transition-colors"
                >
                  Effacer
                </button>
              </div>
            </div>

            {/* ── Mois groupés par trimestre ── */}
            <div className="space-y-2">
              {/* Note séquentielle : affiché uniquement si des mois restent à payer */}
              {firstUnpaidIdx < dialogSchoolMonths.length && (
                <div className="flex items-start gap-1.5 text-[10px] text-muted-foreground bg-amber-50 border border-amber-100 rounded-md px-2.5 py-1.5">
                  <AlertCircle className="h-3 w-3 text-amber-500 shrink-0 mt-0.5" />
                  <span>
                    Les mois doivent être réglés dans l&apos;ordre.
                    {dialogSchoolMonths[firstUnpaidIdx] && (
                      <> Prochain mois à régler : <strong>{dialogSchoolMonths[firstUnpaidIdx]}</strong>.</>
                    )}
                    {" "}Cliquer sur un mois éloigné inclut automatiquement les mois intermédiaires.
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Période</p>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <span className="inline-block w-2.5 h-2.5 rounded-sm bg-emerald-100 border border-emerald-300" /> Payé
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="inline-block w-2.5 h-2.5 rounded-sm bg-primary" /> Sélectionné
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <Label className="text-[10px] text-muted-foreground whitespace-nowrap">Année :</Label>
                  <Input
                    className="h-6 w-24 text-xs"
                    value={paymentForm.academicYear}
                    onChange={(e) => setPaymentForm({ ...paymentForm, academicYear: e.target.value })}
                  />
                </div>
              </div>

              {/* Lignes par trimestre — T1, T2, T3 (dynamiques) + HC (hors calendrier scolaire) */}
              <div className="space-y-1">
                {(() => {
                  const calGroups       = getCalendarTrimestreGroups(paymentForm.academicYear, schoolCalendar);
                  const startYear       = parseInt(paymentForm.academicYear.split("-")[0] ?? String(new Date().getFullYear()), 10);
                  const startGIdx       = ALL_MONTHS_GRE.indexOf(schoolCalendar.startMonth);
                  const nonSchoolWithYear = Array.from({ length: 12 }, (_, i) => ({
                    month:    ALL_MONTHS_GRE[(startGIdx + i) % 12],
                    year:     startYear + Math.floor((startGIdx + i) / 12),
                    isSchool: i < schoolCalendar.durationMonths,
                  }))
                    .filter((x) => !x.isSchool)
                    .map((x) => `${x.month} ${x.year}`);
                  const rows: { label: string; trimestre: string | null; monthsWithYear: string[]; isHC?: boolean }[] = [
                    ...calGroups.map((g) => ({ label: g.label, trimestre: g.trimestre, monthsWithYear: g.monthsWithYear })),
                    ...(nonSchoolWithYear.length > 0
                      ? [{ label: "HC", trimestre: null, monthsWithYear: nonSchoolWithYear, isHC: true }]
                      : []),
                  ];
                  return rows.map(({ label, trimestre, monthsWithYear, isHC }) => {
                    const allSel  = !isHC && monthsWithYear.length > 0 && monthsWithYear.every((m) => dialogTrimestreMonths.has(m));
                    const someSel = !allSel && monthsWithYear.some((m) => dialogTrimestreMonths.has(m));
                    return (
                      <div
                        key={label}
                        className={cn(
                          "flex items-center gap-2 rounded-lg px-2 py-1.5 transition-all",
                          isHC    ? "opacity-55 border border-transparent"
                                  : allSel  ? "bg-primary/8 border border-primary/25 shadow-sm"
                                  : someSel ? "bg-primary/4 border border-primary/10"
                                  : "border border-transparent"
                        )}
                      >
                        {/* Label T1 / T2 / T3 / HC */}
                        <span className={cn(
                          "text-[10px] font-bold w-5 text-center shrink-0 transition-colors",
                          isHC    ? "text-muted-foreground/30"
                                  : allSel ? "text-primary" : someSel ? "text-primary/60" : "text-muted-foreground/40"
                        )}>
                          {label}
                        </span>
                        {/* Séparateur vertical */}
                        <div className={cn("w-px h-6 shrink-0 transition-colors", allSel ? "bg-primary/40" : "bg-border/60")} />
                        {/* Boutons mois */}
                        <div className="flex gap-1 flex-wrap flex-1">
                          {monthsWithYear.map((month) => {
                            const isPaid      = paidMonthsForStudent.has(month);
                            const isPartial   = !isPaid && partialMonthsForStudent.has(month);
                            const isSel       = dialogTrimestreMonths.has(month);
                            const shortName   = MONTH_SHORT[month.split(" ")[0]] ?? month.split(" ")[0].slice(0, 3);
                            const monthSchoolIdx = dialogSchoolMonths.indexOf(month);
                            const isAwaitingPrev = !isHC && !isPaid && !isPartial && !isSel &&
                              monthSchoolIdx > firstUnpaidIdx &&
                              dialogSchoolMonths.slice(firstUnpaidIdx, monthSchoolIdx).some((m) => !dialogTrimestreMonths.has(m) && !paidMonthsForStudent.has(m));
                            return (
                              <button
                                key={month}
                                type="button"
                                disabled={isPaid}
                                title={
                                  isPaid      ? `${month} — déjà payé` :
                                  isPartial   ? `${month} — paiement partiel, cliquer pour compléter` :
                                  isAwaitingPrev ? `Cliquer inclura automatiquement les mois précédents non réglés` :
                                  undefined
                                }
                                onClick={() => {
                                  if (isPaid) return;
                                  handleMonthToggle(month);
                                }}
                                className={cn(
                                  "flex flex-col items-center justify-center gap-0.5 w-11 py-1.5 rounded-md border text-[11px] font-semibold transition-colors",
                                  isPaid
                                    ? "bg-emerald-50 border-emerald-200 text-emerald-700 cursor-not-allowed"
                                    : isSel
                                    ? "bg-primary border-primary text-primary-foreground shadow-sm active:bg-primary/80"
                                    : isPartial
                                    ? "bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100 active:bg-amber-100"
                                    : isAwaitingPrev
                                    ? "bg-amber-50/60 border-amber-200/60 text-amber-700 hover:bg-amber-50 active:bg-amber-100"
                                    : isHC
                                    ? "bg-muted/40 border-border/40 text-muted-foreground hover:bg-muted active:bg-muted"
                                    : "bg-background border-border text-foreground hover:bg-muted active:bg-primary/15 active:border-primary/40"
                                )}
                              >
                                {shortName}
                                {isPaid
                                  ? <CheckCircle2 className="h-2 w-2" />
                                  : isSel
                                  ? <Check className="h-2 w-2" />
                                  : isPartial
                                  ? <span className="text-[9px] font-bold leading-none">½</span>
                                  : isAwaitingPrev
                                  ? <Lock className="h-2 w-2 opacity-50" />
                                  : <span className="h-2" />}
                              </button>
                            );
                          })}
                        </div>
                        {/* Badge "Sélectionné" quand tout le trimestre est coché */}
                        {allSel && trimestre && (
                          <span className="text-[10px] font-semibold text-primary flex items-center gap-0.5 shrink-0 ml-auto">
                            <CheckCircle2 className="h-3 w-3" /> Sélectionné
                          </span>
                        )}
                        {/* Indicateur hors calendrier */}
                        {isHC && monthsWithYear.length > 0 && (
                          <span className="text-[9px] text-muted-foreground/50 shrink-0 ml-auto italic">hors calendrier</span>
                        )}
                      </div>
                    );
                  });
                })()}
              </div>
            </div>

            {/* ── Récap live ── */}
            {isDuplicateForDialog ? (
              <div className="flex items-start gap-2.5 p-3 rounded-lg bg-red-50 border border-red-200">
                <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-red-700">
                    {annualAlreadyPaid ? "Année scolaire entièrement payée" : "Paiement invalide"}
                  </p>
                  <p className="text-xs text-red-600 mt-0.5">
                    {annualAlreadyPaid
                      ? `Cet élève a déjà réglé l'intégralité de l'année ${paymentForm.academicYear}. Aucun nouveau paiement possible.`
                      : (() => {
                          const overlapMonths = Array.from(dialogTrimestreMonths).filter((m) => paidMonthsForStudent.has(m));
                          if (overlapMonths.length > 0) {
                            return <>Les mois <strong>{overlapMonths.map(m => MONTH_SHORT[m.split(" ")[0]] ?? m).join(", ")}</strong> sont déjà réglés.</>;
                          }
                          return <>La sélection contient un saut : réglez d&apos;abord <strong>{dialogSchoolMonths[firstUnpaidIdx]}</strong>.</>;
                        })()
                    }
                  </p>
                </div>
              </div>
            ) : dialogTrimestreMonths.size === 0 ? (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/60 border border-dashed text-sm text-muted-foreground">
                <AlertCircle className="h-4 w-4 shrink-0" />
                Sélectionnez un ou plusieurs mois pour continuer
              </div>
            ) : (
              <div className="rounded-lg bg-primary/5 border border-primary/20 px-4 py-3 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] text-muted-foreground mb-0.5">Frais attendu</p>
                    <p className="text-lg font-bold text-foreground">{formatCurrency(computedDialogAmount)}</p>
                  </div>
                  <div className="text-right text-xs text-muted-foreground space-y-0.5">
                    <p className="font-semibold text-foreground">{computedDialogTerm}</p>
                    <p>{dialogTrimestreMonths.size} mois</p>
                  </div>
                </div>
                {/* Champ montant personnalisé */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-foreground">
                    Montant reçu du parent
                    {effectiveAmount < computedDialogAmount && effectiveAmount > 0 && !dialogHasMixedPayment && (
                      <span className="ml-2 text-amber-600 font-normal">
                        · Partiel — reste {formatCurrency(computedDialogAmount - effectiveAmount)}
                      </span>
                    )}
                  </Label>
                  <div className="relative">
                    <Input
                      type="number"
                      placeholder={String(computedDialogAmount)}
                      value={customAmountStr}
                      onChange={(e) => setCustomAmountStr(e.target.value)}
                      className="h-9 pr-12"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
                      {getActiveCurrency()}
                    </span>
                  </div>
                  {effectiveAmount > computedDialogAmount && (
                    <p className="text-xs text-amber-600">⚠ Le montant dépasse le frais attendu pour la période.</p>
                  )}
                  {customAmountStr === "" ? (
                    <p className="text-[10px] text-muted-foreground">
                      Entrez le montant exact remis par le parent.
                      {dialogTrimestreMonths.size > 1 && ` Si inférieur à ${formatCurrency(computedDialogAmount)}, la répartition par mois se fait automatiquement.`}
                    </p>
                  ) : (
                    effectiveAmount > 0 && effectiveAmount < computedDialogAmount && !dialogHasMixedPayment && (
                      <p className="text-[10px] text-muted-foreground">
                        Le reste ({formatCurrency(computedDialogAmount - effectiveAmount)}) sera à payer lors du prochain passage.
                      </p>
                    )
                  )}
                </div>
              </div>
            )}

            {/* ── Méthode de paiement ── */}
            {effectiveAmount > 0 && !isDuplicateForDialog && (
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Méthode de paiement</Label>
                <Select
                  value={paymentForm.method}
                  onValueChange={(v) => setPaymentForm({ ...paymentForm, method: v as typeof paymentForm.method })}
                >
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CASH">Espèces</SelectItem>
                    <SelectItem value="MOBILE_MONEY">Mobile Money</SelectItem>
                    <SelectItem value="BANK_TRANSFER">Virement bancaire</SelectItem>
                    <SelectItem value="CHECK">Chèque</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* ── Aperçu distribution par mois (toujours visible quand ≥ 2 mois ou partiel) ── */}
            {effectiveAmount > 0 && !isDuplicateForDialog && dialogMonthDistribution.length > 0 && (
              dialogMonthDistribution.some((d) => d.isPartial) || dialogMonthDistribution.length > 1
            ) && (
              <div className={cn(
                "rounded-lg border p-3 space-y-2",
                dialogHasMixedPayment
                  ? "border-amber-200 bg-amber-50"
                  : dialogMonthDistribution.some((d) => d.isPartial)
                    ? "border-amber-200 bg-amber-50"
                    : "border-emerald-200 bg-emerald-50"
              )}>
                <div className="flex items-center justify-between">
                  <p className={cn(
                    "text-[10px] font-semibold uppercase tracking-wide",
                    dialogMonthDistribution.some((d) => d.isPartial) ? "text-amber-800" : "text-emerald-800"
                  )}>
                    {dialogHasMixedPayment
                      ? "Répartition — mois complets + dernier partiel"
                      : dialogMonthDistribution.some((d) => d.isPartial)
                        ? "Paiement partiel"
                        : `${dialogMonthDistribution.length} mois — tout complet`}
                  </p>
                  <span className="text-[10px] text-muted-foreground">
                    {dialogMonthDistribution.filter((d) => !d.isPartial).length} complet
                    {dialogMonthDistribution.some((d) => d.isPartial) && " + 1 partiel"}
                  </span>
                </div>
                <div className="space-y-1">
                  {dialogMonthDistribution.map((d) => (
                    <div key={d.month} className="flex items-center justify-between py-0.5">
                      <span className="text-xs text-foreground">{d.month}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold">{formatCurrency(d.amount)}</span>
                        {d.isPartial ? (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-200 text-amber-800">
                            Partiel · reste {formatCurrency(dialogMonthlyFee - d.amount)}
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">
                            Complet
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                {dialogMonthDistribution.some((d) => d.isPartial) && (
                  <p className="text-[10px] text-amber-700 pt-1 border-t border-amber-200">
                    Le mois partiel sera disponible pour un prochain paiement.
                  </p>
                )}
              </div>
            )}


          </div>

          {/* Footer fixe */}
          <DialogFooter className="px-6 py-4 border-t shrink-0">
            <Button variant="outline" onClick={() => setIsDialogOpen(false)} disabled={isSubmitting}>
              Annuler
            </Button>
            <Button
              onClick={confirmPayment}
              disabled={
                isSubmitting ||
                effectiveAmount <= 0 ||
                isDuplicateForDialog ||
                dialogTrimestreMonths.size === 0
              }
              className="gap-2"
            >
              {isSubmitting
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Enregistrement...</>
                : <>
                    <DollarSign className="h-4 w-4" />
                    {effectiveAmount > 0
                      ? `Confirmer · ${formatCurrency(effectiveAmount)}`
                      : "Confirmer le paiement"}
                  </>}
            </Button>
          </DialogFooter>
          </>)}
        </DialogContent>
      </Dialog>

      {/* ── Dialog Inscription / Réinscription ── */}
      <Dialog open={inscriptionDialogOpen} onOpenChange={setInscriptionDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{inscriptionType === "inscription" ? "Frais d'inscription" : "Frais de réinscription"}</DialogTitle>
            <DialogDescription className="sr-only">
              {inscriptionStudent && `${inscriptionStudent.firstName} ${inscriptionStudent.lastName} · ${selectedYear}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Identité + détection auto */}
            {inscriptionStudent && (
              <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                <div>
                  <p className="text-sm font-semibold">{inscriptionStudent.firstName} {inscriptionStudent.lastName}</p>
                  <p className="text-xs text-muted-foreground">{selectedYear}</p>
                </div>
                <span className={cn(
                  "text-[10px] font-semibold px-2 py-0.5 rounded-full border",
                  inscriptionType === "inscription"
                    ? "bg-blue-50 text-blue-700 border-blue-200"
                    : "bg-violet-50 text-violet-700 border-violet-200"
                )}>
                  {inscriptionType === "inscription" ? "Nouvel élève" : "Élève existant"}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between p-3 bg-muted/40 rounded-lg">
              <span className="text-sm text-muted-foreground">Montant</span>
              <span className="font-bold text-lg">
                {formatCurrency(
                  inscriptionType === "inscription"
                    ? (feeConfig.inscriptionFee || 0)
                    : (feeConfig.reinscriptionFee || 0)
                )}
              </span>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
              <div className="flex-1">
                <p className="text-xs font-medium text-muted-foreground">Type détecté automatiquement</p>
                <p className="text-sm font-semibold mt-0.5">
                  {inscriptionType === "inscription" ? "Inscription" : "Réinscription"}
                </p>
              </div>
              <span className={cn(
                "text-[10px] font-semibold px-2.5 py-1 rounded-full border",
                inscriptionType === "inscription"
                  ? "bg-blue-50 text-blue-700 border-blue-200"
                  : "bg-violet-50 text-violet-700 border-violet-200"
              )}>
                {inscriptionType === "inscription" ? "Nouvel élève" : "Élève de l'école"}
              </span>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Méthode de paiement</Label>
              <Select value={inscriptionMethod} onValueChange={(v) => setInscriptionMethod(v as typeof inscriptionMethod)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CASH">Espèces</SelectItem>
                  <SelectItem value="MOBILE_MONEY">Mobile Money</SelectItem>
                  <SelectItem value="BANK_TRANSFER">Virement bancaire</SelectItem>
                  <SelectItem value="CHECK">Chèque</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInscriptionDialogOpen(false)}>Annuler</Button>
            <Button onClick={confirmInscriptionPayment} disabled={inscriptionSaving} className="gap-2">
              {inscriptionSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Confirmer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog configuration des frais ── */}
      <Dialog open={isFeeDialogOpen} onOpenChange={setIsFeeDialogOpen}>
        <DialogContent className="sm:max-w-[620px] p-0 gap-0 flex flex-col max-h-[90vh]">
          <DialogHeader className="px-6 pt-5 pb-4 border-b shrink-0">
            <DialogTitle>Configurer les Frais de Scolarité</DialogTitle>
            <DialogDescription>
              Définissez les frais mensuels par niveau. Le système calcule automatiquement les montants trimestriels et annuels.
            </DialogDescription>
          </DialogHeader>

          <div className="overflow-y-auto overscroll-contain flex-1 px-6 py-4 space-y-5">

          {/* Guide rapide */}
          <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-3">
            <p className="text-xs font-semibold text-blue-800 mb-1.5">Comment configurer :</p>
            <ol className="list-decimal list-inside space-y-1 text-xs text-blue-700">
              <li>Saisissez le <strong>frais mensuel</strong> de chaque niveau scolaire (ex : Primaire → 150 000 {getActiveCurrency()})</li>
              <li>Ce montant s&apos;applique automatiquement à <strong>toutes les classes</strong> de ce niveau</li>
              <li>Personnalisez une classe précise si besoin (ex : classe d&apos;examen avec supplément)</li>
            </ol>
          </div>

          <div className="space-y-6">
            {classes.length === 0 ? (
              <p className="text-sm text-muted-foreground italic text-center py-4">
                Aucune classe chargée. Veuillez d'abord créer des classes.
              </p>
            ) : (
              <>
                {virtualLevelGroups.map(({ virtualLevel: vl, classes: levelClasses }) => {
                  const levelFee = draftFeeConfig.byLevel[vl] || 0;
                  const examLabels: Record<string, string> = {
                    Primaire: "CEPD", Collège: "BEPC", Lycée: "BAC",
                  };
                  return (
                    <div key={vl} className="space-y-3">

                      {/* ── Frais du niveau ── */}
                      <div className="rounded-lg border bg-muted/30 px-4 py-3 space-y-2">
                        <div className="flex items-center gap-3">
                          <div className="flex-1">
                            <p className="text-sm font-semibold">
                              Frais mensuel — <span className="text-primary">{vl}</span>
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              S&apos;applique à toutes les classes {vl} (sauf personnalisation ci-dessous)
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Input
                              type="number" min={0} step={1000}
                              className="h-9 w-32 text-sm font-semibold text-center"
                              value={draftFeeConfig.byLevel[vl] || ""}
                              onChange={(e) => setDraftFeeConfig({
                                ...draftFeeConfig,
                                byLevel: { ...draftFeeConfig.byLevel, [vl]: Number(e.target.value) },
                              })}
                              onBlur={(e) => {
                                const rounded = roundFee(Number(e.target.value));
                                setDraftFeeConfig((prev) => ({
                                  ...prev,
                                  byLevel: { ...prev.byLevel, [vl]: rounded },
                                }));
                              }}
                              placeholder="0"
                            />
                            <span className="text-sm font-medium text-muted-foreground">{getActiveCurrency()}/mois</span>
                          </div>
                        </div>
                        {/* Calculs automatiques affichés seulement si frais saisi */}
                        {levelFee > 0 && (
                          <div className="flex gap-5 text-xs pt-1 border-t border-border/50">
                            <span className="text-muted-foreground">
                              Trimestre (3 mois) ={" "}
                              <span className="font-semibold text-foreground">{formatCurrency(levelFee * 3)}</span>
                            </span>
                            <span className="text-muted-foreground">
                              Annuel ({schoolCalendar.durationMonths} mois) ={" "}
                              <span className="font-semibold text-foreground">{formatCurrency(levelFee * schoolCalendar.durationMonths)}</span>
                            </span>
                          </div>
                        )}
                      </div>

                      {/* ── Classes du niveau ── */}
                      <div className="pl-2 space-y-1.5">
                        <p className="text-xs font-medium text-muted-foreground">
                          Personnaliser une classe (optionnel) :
                        </p>
                        {levelClasses.map((cls) => {
                          const override    = draftFeeConfig.byClass[cls.id];
                          const hasOverride = (override ?? 0) > 0;
                          const effectiveFee = hasOverride ? override! : levelFee;
                          return (
                            <div
                              key={cls.id}
                              className={cn(
                                "flex items-center gap-2.5 rounded-md border px-3 py-2 transition-colors",
                                hasOverride ? "bg-amber-50 border-amber-200" : "bg-background"
                              )}
                            >
                              {/* Nom + badge examen */}
                              <div className="flex-1 min-w-0 flex items-center gap-1.5 flex-wrap">
                                <span className="text-sm font-medium truncate">{cls.displayName}</span>
                                {cls.isExamClass && examLabels[vl] && (
                                  <Badge variant="outline" className="text-[10px] py-0 h-4 text-amber-700 border-amber-300 bg-amber-50 shrink-0">
                                    ⭐ {examLabels[vl]}
                                  </Badge>
                                )}
                              </div>

                              {/* Saisie override */}
                              <div className="flex items-center gap-1.5 shrink-0">
                                <Input
                                  type="number" min={0} step={1000}
                                  className={cn(
                                    "h-7 w-28 text-sm text-center",
                                    hasOverride && "border-amber-400 bg-white font-semibold"
                                  )}
                                  value={override || ""}
                                  onChange={(e) => {
                                    setDraftFeeConfig({
                                      ...draftFeeConfig,
                                      byClass: { ...draftFeeConfig.byClass, [cls.id]: Number(e.target.value) },
                                    });
                                  }}
                                  onBlur={(e) => {
                                    const rounded = roundFee(Number(e.target.value));
                                    setDraftFeeConfig((prev) => ({
                                      ...prev,
                                      byClass: { ...prev.byClass, [cls.id]: rounded },
                                    }));
                                  }}
                                  placeholder={levelFee > 0 ? String(levelFee) : "—"}
                                />
                                <span className="text-xs text-muted-foreground">{getActiveCurrency()}</span>
                                {hasOverride && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const next = { ...draftFeeConfig.byClass };
                                      delete next[cls.id];
                                      setDraftFeeConfig({ ...draftFeeConfig, byClass: next });
                                    }}
                                    className="h-7 w-7 rounded border flex items-center justify-center text-muted-foreground hover:text-destructive hover:border-destructive transition-colors shrink-0"
                                    title="Revenir au tarif du niveau"
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </div>

                              {/* Montant effectif — mis à jour en temps réel */}
                              <div className="shrink-0 min-w-[130px] text-right">
                                {hasOverride ? (
                                  <span className="text-xs font-semibold text-amber-700">
                                    = {formatCurrency(effectiveFee)}{" "}
                                    <span className="font-normal opacity-75">personnalisé</span>
                                  </span>
                                ) : levelFee > 0 ? (
                                  <span className="text-xs text-muted-foreground">
                                    = {formatCurrency(levelFee)}{" "}
                                    <span className="opacity-70">tarif {vl}</span>
                                  </span>
                                ) : (
                                  <span className="text-xs text-muted-foreground italic">— non configuré</span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </>
            )}

            {/* ── Tarif par défaut (fallback global) ── */}
            {classes.length > 0 && (
              <div className="pt-2 border-t space-y-1.5">
                <div className="flex items-center gap-3 rounded-lg bg-muted/30 border px-4 py-3">
                  <div className="flex-1">
                    <p className="text-sm font-medium">Tarif par défaut</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Appliqué aux niveaux sans frais configuré
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Input
                      type="number" min={0} step={1000}
                      className="h-9 w-32 text-sm text-center"
                      value={draftFeeConfig.globalFee || ""}
                      onChange={(e) => setDraftFeeConfig({ ...draftFeeConfig, globalFee: Number(e.target.value) })}
                      onBlur={(e) => setDraftFeeConfig((prev) => ({ ...prev, globalFee: roundFee(Number(e.target.value)) }))}
                      placeholder="0"
                    />
                    <span className="text-sm font-medium text-muted-foreground">{getActiveCurrency()}/mois</span>
                  </div>
                </div>
              </div>
            )}

            {/* ── Frais fixes (inscription / réinscription) ── */}
            {classes.length > 0 && (
              <div className="pt-2 border-t space-y-3">
                <p className="text-sm font-semibold">Frais fixes (par élève, par an)</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Frais d&apos;inscription</Label>
                    <Input
                      type="number"
                      placeholder="0"
                      value={draftFeeConfig.inscriptionFee || ""}
                      onChange={(e) => setDraftFeeConfig(prev => ({ ...prev, inscriptionFee: Number(e.target.value) }))}
                    />
                    <p className="text-[10px] text-muted-foreground">Nouveaux élèves</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Frais de réinscription</Label>
                    <Input
                      type="number"
                      placeholder="0"
                      value={draftFeeConfig.reinscriptionFee || ""}
                      onChange={(e) => setDraftFeeConfig(prev => ({ ...prev, reinscriptionFee: Number(e.target.value) }))}
                    />
                    <p className="text-[10px] text-muted-foreground">Élèves existants</p>
                  </div>
                </div>
              </div>
            )}

          </div>{/* fin space-y-6 */}

          </div>{/* fin scrollable */}

          <DialogFooter className="px-6 py-4 border-t shrink-0">
            <Button variant="outline" onClick={() => setIsFeeDialogOpen(false)}>Annuler</Button>
            <Button onClick={saveFeeConfig} className="gap-2">
              <Check className="h-4 w-4" /> Enregistrer les frais
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
