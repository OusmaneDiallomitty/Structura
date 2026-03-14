"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
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
import { useSubscription } from "@/hooks/use-subscription";
import { UpgradeBadge } from "@/components/shared/UpgradeBadge";
import * as storage from "@/lib/storage";
import { getPayments, createPayment } from "@/lib/api/payments.service";
import { getStudents } from "@/lib/api/students.service";
import { getClasses } from "@/lib/api/classes.service";
import { getCurrentAcademicYear } from "@/lib/api/academic-years.service";
import { getFeesConfig, updateFeesConfig } from "@/lib/api/fees.service";
import type { Payment, BackendStudent } from "@/types";
import { useAuth, usePermission } from "@/contexts/AuthContext";
import { formatClassName } from "@/lib/class-helpers";
import { cn } from "@/lib/utils";

// ─── Constantes ──────────────────────────────────────────────────────────────

const PAYMENT_FREQ_KEY    = "structura_payment_frequency";
const CLASS_FEES_KEY      = "structura_class_fees_v2";
const SCHOOL_CALENDAR_KEY = "structura_school_calendar_v1";

type PaymentFrequency = "monthly" | "quarterly" | "annual";
type FeeMode = "global" | "by-level" | "by-class";

interface FeeConfig {
  mode: FeeMode;
  globalFee: number;
  byLevel: Record<string, number>;   // { "Primaire": 150000 }
  byClass: Record<string, number>;   // { "classId": 150000 }
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

/** Vérifie si un paiement couvre la période sélectionnée en vue (mensuel/trimestriel/annuel) */
function paymentCoversViewTerm(
  paymentTerm: string | undefined,
  selectedTerm: string,
  academicYear: string,
  calendar: SchoolCalendar,
): boolean {
  if (!paymentTerm || !selectedTerm) return false;
  if (paymentTerm === selectedTerm) return true;
  // Compatibilité sans année : "Octobre" matche "Octobre 2026"
  if (paymentTerm === selectedTerm.split(" ")[0]) return true;
  // "Octobre 2026" matche filtre vue "Octobre" (SCHOOL_MONTHS sans année)
  if (paymentTerm.split(" ")[0] === selectedTerm.split(" ")[0]) return true;
  // Annuel couvre tout
  if (paymentTerm.startsWith("Annuel")) return true;
  // Trimestre couvre un mois spécifique affiché en vue mensuelle
  if (paymentTerm.startsWith("Trimestre")) {
    const months = getMonthsWithYearForTrimestre(paymentTerm, academicYear, calendar);
    if (months.includes(selectedTerm)) return true;
    return months.some((m) => m.split(" ")[0] === selectedTerm.split(" ")[0]);
  }
  // Paiement partiel CSV : "Octobre 2026, Novembre 2026"
  if (paymentTerm.includes(",")) {
    const parts = paymentTerm.split(",").map((s) => s.trim());
    return parts.some(
      (p) => p === selectedTerm || p.split(" ")[0] === selectedTerm.split(" ")[0]
    );
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

function getPeriodsForFrequency(freq: PaymentFrequency): string[] {
  if (freq === "monthly")   return SCHOOL_MONTHS;
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
  const canConfigureFees = usePermission("payments", "configure");

  // Confidentialité financière : montants visibles uniquement par directeur et comptable
  const canViewAmounts = user?.role === "director" || user?.role === "accountant";
  const { hasFeature } = useSubscription();
  const hasBulletins = hasFeature('bulletins');

  const [students, setStudents] = useState<BackendStudent[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [classes,  setClasses]  = useState<ClassInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filtres
  const [activeClass,   setActiveClass]   = useState("all");
  const [searchQuery,   setSearchQuery]   = useState("");
  const [statusFilter,  setStatusFilter]  = useState("all");
  const [selectedYear,  setSelectedYear]  = useState(
    `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`
  );

  // Fréquence et période
  const [paymentFrequency, setPaymentFrequency] = useState<PaymentFrequency>("monthly");
  const [selectedTerm,     setSelectedTerm]     = useState<string>(() => getCurrentPeriod("monthly"));

  // Frais
  const [feeConfig, setFeeConfig] = useState<FeeConfig>(DEFAULT_FEE_CONFIG);

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

  // Calendrier scolaire
  const [schoolCalendar,      setSchoolCalendar]      = useState<SchoolCalendar>(DEFAULT_SCHOOL_CALENDAR);
  const [draftSchoolCalendar, setDraftSchoolCalendar] = useState<SchoolCalendar>(DEFAULT_SCHOOL_CALENDAR);

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
    ) => {
      if (fee?.mode && typeof fee.globalFee === "number") setFeeConfig(fee);
      if (cal?.startMonth && typeof cal.durationMonths === "number") setSchoolCalendar(cal);
      const f = (freq as PaymentFrequency) || "monthly";
      setPaymentFrequency(f);
      setSelectedTerm(getCurrentPeriod(f));
    };

    if (token && isOnline) {
      getFeesConfig(token)
        .then((config) => {
          // ── Migration one-shot ──────────────────────────────────────────────
          // Si la BDD ne contient pas encore de frais configurés (premier accès après
          // la migration vers l'API) mais que le localStorage du directeur en contient,
          // on les migre automatiquement en BDD pour tout le tenant.
          const localFees = localStorage.getItem(CLASS_FEES_KEY);
          const localCal  = localStorage.getItem(SCHOOL_CALENDAR_KEY);
          const localFreq = localStorage.getItem(PAYMENT_FREQ_KEY);
          if (!config.feeConfig && localFees) {
            try {
              const parsedFees = JSON.parse(localFees) as FeeConfig;
              const parsedCal  = localCal ? JSON.parse(localCal) as SchoolCalendar : undefined;
              updateFeesConfig(token, {
                feeConfig:        parsedFees,
                paymentFrequency: (localFreq as PaymentFrequency) || "monthly",
                schoolCalendar:   parsedCal,
              }).catch(console.error);
              // Utiliser les données locales immédiatement en attendant la réponse API
              applyConfig(parsedFees, localFreq || "monthly", parsedCal ?? null);
              return;
            } catch { /* si JSON invalide, continuer normalement */ }
          }
          // ─────────────────────────────────────────────────────────────────
          applyConfig(
            config.feeConfig as FeeConfig | null,
            config.paymentFrequency,
            config.schoolCalendar as SchoolCalendar | null,
          );
          // Mettre en cache pour le mode hors ligne
          if (config.feeConfig)      localStorage.setItem(CLASS_FEES_KEY,      JSON.stringify(config.feeConfig));
          if (config.schoolCalendar) localStorage.setItem(SCHOOL_CALENDAR_KEY, JSON.stringify(config.schoolCalendar));
          localStorage.setItem(PAYMENT_FREQ_KEY, config.paymentFrequency || "monthly");
        })
        .catch(() => {
          // Réseau indisponible malgré isOnline — utiliser le cache local
          const savedFees = localStorage.getItem(CLASS_FEES_KEY);
          const savedCal  = localStorage.getItem(SCHOOL_CALENDAR_KEY);
          const savedFreq = localStorage.getItem(PAYMENT_FREQ_KEY) || "monthly";
          applyConfig(
            savedFees  ? JSON.parse(savedFees)  as FeeConfig      : null,
            savedFreq,
            savedCal   ? JSON.parse(savedCal)   as SchoolCalendar : null,
          );
        });
    } else {
      // Mode hors ligne : utiliser le cache local
      const savedFees = localStorage.getItem(CLASS_FEES_KEY);
      const savedCal  = localStorage.getItem(SCHOOL_CALENDAR_KEY);
      const savedFreq = localStorage.getItem(PAYMENT_FREQ_KEY) || "monthly";
      applyConfig(
        savedFees ? JSON.parse(savedFees)  as FeeConfig      : null,
        savedFreq,
        savedCal  ? JSON.parse(savedCal)   as SchoolCalendar : null,
      );
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline]);

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

  // ── Chargement ────────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    setIsLoading(true);
    const token = storage.getAuthItem("structura_token");

    if (!isOnline || !token) {
      try {
        const [cachedStudents, cachedPayments, cachedClasses] = await Promise.all([
          offlineDB.getAll<any>(STORES.STUDENTS),
          offlineDB.getAll<Payment>(STORES.PAYMENTS),
          offlineDB.getAll<any>(STORES.CLASSES).catch(() => []),
        ]);
        setStudents(cachedStudents);
        setPayments(cachedPayments);
        if (cachedClasses.length > 0) {
          setClasses(
            cachedClasses.map((c: any): ClassInfo => {
              const vl = c.virtualLevel || getVirtualLevel(c.name, c.level || "");
              return {
                id: c.id, name: c.name, section: c.section, level: c.level || "",
                virtualLevel: vl,
                isExamClass: c.isExamClass ?? detectExamClass(c.name, vl),
                displayName: formatClassName(c.name, c.section),
              };
            })
          );
        }
      } catch { toast.error("Impossible de charger les données hors ligne"); }
      finally { setIsLoading(false); }
      return;
    }

    try {
      const [backendStudents, backendPayments, backendClasses, currentAcademicYear] = await Promise.all([
        getStudents(token),
        getPayments(token),
        getClasses(token),
        getCurrentAcademicYear(token).catch(() => null),
      ]);

      // Synchroniser l'année scolaire courante
      if (currentAcademicYear) {
        setSelectedYear(currentAcademicYear.name);
        // Le calendrier scolaire (startMonth/durationMonths) est géré exclusivement
        // par tenant.schoolCalendar (config frais) — chargé dans le useEffect dédié.
        // academicYear.startMonth est utilisé uniquement dans le wizard NewYearWizard.
      }

      setStudents(backendStudents);

      // Utiliser exactement les mêmes noms que la page Classes
      const classesList: ClassInfo[] = backendClasses.map((c) => {
        const vl = getVirtualLevel(c.name, c.level || "");
        return {
          id: c.id,
          name: c.name,
          section: c.section,
          level: c.level || "",
          virtualLevel: vl,
          isExamClass: detectExamClass(c.name, vl),
          displayName: formatClassName(c.name, c.section),
        };
      });
      setClasses(classesList);

      const mappedPayments = backendPayments.map(mapBackendPayment);
      setPayments(mappedPayments);

      try {
        await offlineDB.clear(STORES.PAYMENTS);
        await offlineDB.bulkAdd(STORES.PAYMENTS, mappedPayments);
      } catch {}
    } catch (error: any) {
      try {
        const cached = await offlineDB.getAll<Payment>(STORES.PAYMENTS);
        if (cached.length > 0) { setPayments(cached); toast.warning("Données chargées depuis le cache"); }
        else toast.error(error.message || "Impossible de charger les paiements");
      } catch { toast.error("Impossible de charger les paiements"); }
    } finally { setIsLoading(false); }
  }, [isOnline]);

  useEffect(() => { loadData(); }, [loadData]);

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
      .sort((a, b) => {
        // Non payé → Partiel → Payé, puis alphabétique
        const diff = (STATUS_ORDER[a.status] ?? 0) - (STATUS_ORDER[b.status] ?? 0);
        if (diff !== 0) return diff;
        return `${a.student.lastName} ${a.student.firstName}`
          .localeCompare(`${b.student.lastName} ${b.student.firstName}`);
      });
  }, [studentSummaries, activeClass, searchQuery, statusFilter]);

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
      if (p.status !== "paid" && p.status !== "partial") return;
      if (!p.term) return;
      if (p.term.includes(",")) {
        p.term.split(",").map((s) => s.trim()).forEach((m) => paidMonths.add(m));
      } else if (p.term.startsWith("Trimestre")) {
        getMonthsWithYearForTrimestre(p.term, paymentForm.academicYear, schoolCalendar).forEach((m) => paidMonths.add(m));
      } else if (p.term.startsWith("Annuel")) {
        getSchoolMonthsWithYear(paymentForm.academicYear, schoolCalendar).forEach((m) => paidMonths.add(m));
      } else {
        paidMonths.add(p.term);
      }
    });
    return paidMonths;
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
    return monthlyFee * dialogTrimestreMonths.size;
  }, [selectedStudentForPayment, dialogTrimestreMonths, classes, feeConfig]);

  // Synchronise le montant calculé vers paymentForm (pour l'envoi backend)
  useEffect(() => {
    if (isDialogOpen) {
      setPaymentForm((prev) => ({ ...prev, amount: String(computedDialogAmount) }));
    }
  }, [computedDialogAmount, isDialogOpen]);

  // ── Actions ───────────────────────────────────────────────────────────────

  const openFeeDialog = () => {
    setDraftFeeConfig(JSON.parse(JSON.stringify(feeConfig)));
    setDraftSchoolCalendar({ ...schoolCalendar });
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
          schoolCalendar:   draftSchoolCalendar,
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
    localStorage.setItem(CLASS_FEES_KEY,      JSON.stringify(rounded));
    setSchoolCalendar(draftSchoolCalendar);
    localStorage.setItem(SCHOOL_CALENDAR_KEY, JSON.stringify(draftSchoolCalendar));
    setIsFeeDialogOpen(false);
    toast.success("Frais et calendrier mis à jour !");
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

  const openPaymentDialog = (student: BackendStudent) => {
    setSelectedStudentForPayment(student);

    const academicYr = selectedYear;

    // Calculer les mois déjà payés pour cet élève (inline, avant le setState)
    const alreadyPaid = new Set<string>();
    payments.forEach((p) => {
      if (p.studentId !== student.id) return;
      if (p.academicYear && p.academicYear !== academicYr) return;
      if (p.status !== "paid" && p.status !== "partial") return;
      if (!p.term) return;
      if (p.term.includes(",")) {
        p.term.split(",").map((s) => s.trim()).forEach((mo) => alreadyPaid.add(mo));
      } else if (p.term.startsWith("Trimestre")) {
        getMonthsWithYearForTrimestre(p.term, academicYr, schoolCalendar).forEach((mo) => alreadyPaid.add(mo));
      } else if (p.term.startsWith("Annuel")) {
        getSchoolMonthsWithYear(academicYr, schoolCalendar).forEach((mo) => alreadyPaid.add(mo));
      } else {
        alreadyPaid.add(p.term);
      }
    });

    // Pré-sélectionner le mois courant s'il n'est pas payé, sinon le premier mois impayé
    const curMonth  = getCurrentMonthWithYear();
    const allMonths = getSchoolMonthsWithYear(academicYr, schoolCalendar);
    const initMonth =
      allMonths.includes(curMonth) && !alreadyPaid.has(curMonth)
        ? curMonth
        : allMonths.find((mo) => !alreadyPaid.has(mo)) ?? null;
    setDialogTrimestreMonths(initMonth ? new Set([initMonth]) : new Set());

    setPaymentForm({
      amount: "", method: "CASH", description: "Frais de scolarité",
      term: selectedTerm, academicYear: academicYr,
    });
    setIsDialogOpen(true);
  };

  const confirmPayment = async () => {
    if (!selectedStudentForPayment || computedDialogAmount <= 0) return;

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
    const amount = computedDialogAmount;

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

    // ── Construit les données du reçu sans déclencher le PDF ────────────────
    const buildReceiptData = (newPayment: Payment): PaymentReceiptData => ({
      receiptNumber:      newPayment.receiptNumber || `REC-${Date.now()}`,
      studentName:        `${selectedStudentForPayment!.firstName} ${selectedStudentForPayment!.lastName}`,
      studentMatricule:   selectedStudentForPayment!.matricule,
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
      schoolPhone:        "",
      schoolAddress:      "",
      months:             receiptMonths,
      monthlyFee:         receiptMonthlyFee,
      currency:           getActiveCurrency(),
      trimestreBreakdown: buildTrimestreBreakdown(
        dialogTrimestreMonths,
        paymentForm.academicYear,
        schoolCalendar,
      ),
    });

    try {
      if (isOnline && token) {
        const created = await createPayment(token, {
          studentId:    selectedStudentForPayment.id,
          amount, method: paymentForm.method, currency: getActiveCurrency(), status: "paid",
          description:  paymentForm.description,
          academicYear: paymentForm.academicYear, term: computedDialogTerm,
          paidDate: new Date().toISOString(),
        });
        const newPayment = mapBackendPayment(created);
        setPayments((prev) => [newPayment, ...prev]);
        try { await offlineDB.add(STORES.PAYMENTS, newPayment); } catch {}
        markReceiptDone(newPayment.receiptNumber || newPayment.id);
        setPendingReceiptData(buildReceiptData(newPayment));
        setDialogMode("success");
      } else {
        const tempId     = `offline-payment-${crypto.randomUUID()}`;
        const newPayment: Payment = {
          id: tempId, studentId: selectedStudentForPayment.id,
          studentName: `${selectedStudentForPayment.firstName} ${selectedStudentForPayment.lastName}`,
          amount, currency: getActiveCurrency(),
          method: paymentForm.method.toLowerCase() as Payment["method"],
          status: "paid", paidDate: new Date().toISOString(),
          description:  paymentForm.description,
          academicYear: paymentForm.academicYear, term: computedDialogTerm,
          needsSync: true, createdAt: new Date().toISOString(),
        };
        await offlineDB.add(STORES.PAYMENTS, newPayment);
        await syncQueue.add({ type: "payment", action: "create", data: { _tempId: tempId, ...newPayment } });
        setPayments((prev) => [newPayment, ...prev]);
        setPendingReceiptData(buildReceiptData(newPayment));
        setDialogMode("success");
      }
      // Ne pas fermer : on reste sur la vue succès pour choisir le reçu
    } catch (error: any) {
      toast.error("Erreur lors de l'enregistrement", { description: error.message });
    } finally { setIsSubmitting(false); }
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
    const regenMonths: string[] = (() => {
      if (!payTerm) return [];
      if (payTerm.startsWith("Annuel")) return getSchoolMonthsWithYear(payAcadYear, schoolCalendar);
      if (payTerm.startsWith("Trimestre")) {
        const grps = getCalendarTrimestreGroups(payAcadYear, schoolCalendar);
        return grps.find((g) => g.trimestre === payTerm)?.monthsWithYear ?? [];
      }
      if (payTerm.includes(",")) return payTerm.split(",").map((s) => s.trim());
      return [payTerm];
    })();
    // Utiliser les totaux annuels (pas les totaux de la période filtrée)
    // → évite le faux "Scolarité intégralement réglée" quand seulement T1 est payé
    const regenMonthlyFee =
      summary.yearExpectedFee && schoolCalendar.durationMonths > 0
        ? Math.round(summary.yearExpectedFee / schoolCalendar.durationMonths)
        : undefined;

    await generatePaymentReceipt({
      receiptNumber:      payment.receiptNumber || `REC-${Date.now()}`,
      studentName:        `${summary.student.firstName} ${summary.student.lastName}`,
      studentMatricule:   summary.student.matricule,
      className:          summary.className,
      amount:             payment.amount,
      totalPaid:          summary.yearTotalPaid,
      expectedFee:        summary.yearExpectedFee,
      remaining:          summary.yearRemaining,
      date:               payment.paidDate || new Date().toISOString(),
      paymentMethod:      formatMethod(payment.method),
      description:        payment.description || "Frais de scolarité",
      academicYear:       payAcadYear,
      term:               payTerm,
      schoolName:         user?.schoolName || "Structura",
      schoolLogo:         user?.schoolLogo ?? undefined,
      schoolPhone:        "",
      schoolAddress:      "",
      months:             regenMonths,
      monthlyFee:         regenMonthlyFee,
      currency:           getActiveCurrency(),
      // Recalcule la décomposition depuis le terme sauvegardé (réimpression)
      trimestreBreakdown: buildTrimestreBreakdown(
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

  const periods       = getPeriodsForFrequency(paymentFrequency);
  const currentFeeLabel = (() => {
    const hasLevelFee = Object.values(feeConfig.byLevel).some((v) => v > 0);
    const hasClassFee = Object.values(feeConfig.byClass).some((v) => v > 0);
    if (hasClassFee || hasLevelFee) return "Par niveau/classe";
    return formatCurrency(feeConfig.globalFee);
  })();

  // ─── Rendu ──────────────────────────────────────────────────────────────

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
        <Button variant="outline" size="sm" onClick={loadData} disabled={isLoading} className="gap-2 self-start">
          <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
          Actualiser
        </Button>
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
          <span className="text-sm font-semibold">{currentFeeLabel}</span>
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
        <div className="rounded-lg border overflow-hidden">
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
        const yearTotalPaid = allYearPayments.filter(p => p.status === "paid").reduce((acc, p) => acc + p.amount, 0);
        const monthlyFeeForDrawer = s ? getStudentFee(s.student.classId, s.level ?? "", feeConfig) : 0;
        const fullYearFee = monthlyFeeForDrawer * schoolCalendar.durationMonths;

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

                {/* Résumé pour la période filtrée */}
                {s && (
                  <div className="px-6 py-4 border-b space-y-3">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                      Vue : {selectedTerm} · {selectedYear}
                    </p>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2 text-center">
                        <div className="text-xs text-emerald-700 font-medium mb-0.5">Versé</div>
                        <div className="text-sm font-bold text-emerald-700">{formatCurrency(s.totalPaid)}</div>
                      </div>
                      <div className="rounded-lg bg-muted/40 border px-3 py-2 text-center">
                        <div className="text-xs text-muted-foreground font-medium mb-0.5">Attendu</div>
                        <div className="text-sm font-bold">{formatCurrency(s.expectedFee)}</div>
                      </div>
                      <div className={cn(
                        "rounded-lg border px-3 py-2 text-center",
                        s.remaining > 0 ? "bg-red-50 border-red-100" : "bg-emerald-50 border-emerald-100"
                      )}>
                        <div className="text-xs font-medium mb-0.5 text-muted-foreground">Reste</div>
                        <div className={cn("text-sm font-bold", s.remaining > 0 ? "text-red-600" : "text-emerald-600")}>
                          {formatCurrency(s.remaining)}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <StatusBadge status={s.status} />
                      <span className="text-xs text-muted-foreground">
                        {s.status === "paid"
                          ? "Intégralement réglé"
                          : s.status === "partial"
                          ? `${formatCurrency(s.totalPaid)} versé`
                          : "Aucun versement enregistré"}
                      </span>
                    </div>
                    {/* Récap annuel si différent de la vue filtrée */}
                    {fullYearFee > 0 && (
                      <div className="text-xs text-muted-foreground border-t pt-2">
                        Année complète {selectedYear} :&nbsp;
                        <span className="font-semibold text-foreground">{formatCurrency(yearTotalPaid)}</span>
                        &nbsp;/&nbsp;{formatCurrency(fullYearFee)}
                        {yearTotalPaid >= fullYearFee && (
                          <Badge className="ml-2 bg-emerald-500/10 text-emerald-700 border-emerald-200 border text-[10px] py-0">
                            Scolarité complète
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* ── Mini-timeline des mois scolaires ── */}
                {s && schoolCalendar.durationMonths > 0 && (() => {
                  const tlMonths = getSchoolMonthsWithYear(selectedYear, schoolCalendar);
                  const tlPaid = new Set(
                    allYearPayments
                      .filter((p) => p.status === "paid")
                      .flatMap((p) => {
                        if (!p.term) return [];
                        if (p.term.startsWith("Annuel")) return tlMonths;
                        if (p.term.startsWith("Trimestre"))
                          return getMonthsWithYearForTrimestre(p.term, selectedYear, schoolCalendar);
                        if (p.term.includes(",")) return p.term.split(",").map((x) => x.trim());
                        return [p.term];
                      })
                  );
                  return (
                    <div className="px-6 py-3 border-b">
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-2">
                        Calendrier {selectedYear}
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {tlMonths.map((m) => {
                          const short = MONTH_SHORT[m.split(" ")[0]] ?? m.split(" ")[0].slice(0, 3);
                          const paid  = tlPaid.has(m);
                          return (
                            <div
                              key={m}
                              title={m}
                              className={cn(
                                "flex flex-col items-center gap-0.5 px-1.5 py-1.5 rounded-md text-[9px] font-bold border min-w-[30px]",
                                paid
                                  ? "bg-emerald-50 border-emerald-300 text-emerald-700"
                                  : "bg-muted/30 border-dashed border-muted-foreground/25 text-muted-foreground/60"
                              )}
                            >
                              {short}
                              {paid
                                ? <CheckCircle2 className="h-2.5 w-2.5 text-emerald-500" />
                                : <div className="h-2.5 w-2.5 rounded-full border border-dashed border-muted-foreground/25" />}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                {/* Historique complet de l'année */}
                <div className="px-6 py-4 space-y-2">
                  <div className="flex items-center gap-2 mb-3">
                    <History className="h-4 w-4 text-muted-foreground" />
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                      Historique {selectedYear}
                    </p>
                    <span className="text-xs text-muted-foreground ml-auto">
                      {allYearPayments.length} paiement{allYearPayments.length > 1 ? "s" : ""}
                    </span>
                  </div>

                  {allYearPayments.length === 0 ? (
                    <div className="py-8 text-center text-muted-foreground border rounded-lg border-dashed">
                      <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">Aucun paiement enregistré pour {selectedYear}</p>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {allYearPayments.map((p) => {
                        const tKey = p.receiptNumber || p.id;
                        const printed = generatedReceipts.has(tKey);
                        const dateStr = (() => {
                          const raw = p.paidDate || p.createdAt;
                          if (!raw) return "—";
                          return new Date(raw).toLocaleString("fr-FR", {
                            day: "2-digit", month: "short", year: "numeric",
                            hour: "2-digit", minute: "2-digit",
                          });
                        })();
                        const isPaid = p.status === "paid";
                        return (
                          <div
                            key={p.id}
                            className={cn(
                              "rounded-lg border px-3 py-2.5 transition-colors",
                              isPaid ? "bg-card hover:bg-muted/30" : "bg-amber-50/40 border-amber-100"
                            )}
                          >
                            {/* Ligne 1 : indicateur + terme + montant + boutons */}
                            <div className="flex items-center gap-2">
                              {/* Dot statut */}
                              <div className={cn(
                                "w-2 h-2 rounded-full shrink-0",
                                isPaid ? "bg-emerald-500" : "bg-amber-400"
                              )} />
                              {/* Terme + date */}
                              <div className="min-w-0 flex-1">
                                <span className="font-semibold text-sm truncate block">
                                  {p.term || p.description || "Frais de scolarité"}
                                </span>
                              </div>
                              {/* Montant */}
                              <span className={cn(
                                "font-bold text-sm shrink-0",
                                isPaid ? "text-emerald-600" : "text-amber-600"
                              )}>
                                {formatCurrency(p.amount)}
                              </span>
                              {/* Actions reçu */}
                              {isPaid && s && (
                                <div className="flex items-center gap-0 shrink-0">
                                  <Button size="sm" variant="ghost"
                                    className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                                    title="Aperçu du reçu"
                                    onClick={() => handleGenerateReceipt(s, p, "preview")}
                                  >
                                    <Eye className="h-3 w-3" />
                                  </Button>
                                  <Button size="sm" variant="ghost"
                                    className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                                    title="Imprimer"
                                    onClick={() => handleGenerateReceipt(s, p, "print")}
                                  >
                                    <Printer className="h-3 w-3" />
                                  </Button>
                                  <Button size="sm" variant="ghost"
                                    className={cn("h-6 w-6 p-0",
                                      printed ? "text-amber-500 hover:text-amber-600" : "text-muted-foreground hover:text-foreground"
                                    )}
                                    title={printed ? "Re-télécharger" : "Télécharger PDF"}
                                    onClick={() => handleGenerateReceipt(s, p, "download")}
                                  >
                                    <Download className="h-3 w-3" />
                                  </Button>
                                </div>
                              )}
                            </div>
                            {/* Ligne 2 : méta-données compactes */}
                            <div className="flex items-center gap-2 mt-1 ml-4 text-[11px] text-muted-foreground">
                              <span>{formatMethod(p.method)}</span>
                              <span className="text-muted-foreground/40">·</span>
                              <span>{dateStr}</span>
                              {p.receiptNumber && (
                                <>
                                  <span className="text-muted-foreground/40">·</span>
                                  <span className="font-mono">{p.receiptNumber}</span>
                                </>
                              )}
                              {p.needsSync && (
                                <Badge variant="outline" className="text-[9px] py-0 px-1 text-amber-600 border-amber-300 ml-auto">
                                  hors ligne
                                </Badge>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* ── Footer fixe : bouton toujours visible ── */}
              <div className="shrink-0 px-6 py-3 border-t bg-white">
                <Button
                  className="w-full gap-2"
                  onClick={() => { setDrawerStudent(null); if (s) openPaymentDialog(s.student); }}
                >
                  <CreditCard className="h-4 w-4" />
                  Enregistrer un paiement
                </Button>
              </div>
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
                            const isPaid    = paidMonthsForStudent.has(month);
                            const isSel     = dialogTrimestreMonths.has(month);
                            const shortName = MONTH_SHORT[month.split(" ")[0]] ?? month.split(" ")[0].slice(0, 3);
                            // Un mois scolaire est "en attente" si des mois antérieurs ne sont pas encore payés
                            // → l'utilisateur PEUT quand même cliquer dessus (auto-fill), mais on l'indique visuellement
                            const monthSchoolIdx = dialogSchoolMonths.indexOf(month);
                            const isAwaitingPrev = !isHC && !isPaid && !isSel &&
                              monthSchoolIdx > firstUnpaidIdx &&
                              dialogSchoolMonths.slice(firstUnpaidIdx, monthSchoolIdx).some((m) => !dialogTrimestreMonths.has(m) && !paidMonthsForStudent.has(m));
                            return (
                              <button
                                key={month}
                                type="button"
                                disabled={isPaid}
                                title={
                                  isPaid ? `${month} — déjà payé` :
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
                          <span className="text-[9px] text-muted-foreground/50 shrink-0 ml-auto italic">hors cours</span>
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
              <div className="rounded-lg bg-primary/5 border border-primary/20 px-4 py-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] text-muted-foreground mb-0.5">Montant à encaisser</p>
                    <p className="text-2xl font-bold text-primary">{formatCurrency(computedDialogAmount)}</p>
                  </div>
                  <div className="text-right text-xs text-muted-foreground space-y-0.5">
                    <p className="font-semibold text-foreground">{computedDialogTerm}</p>
                    <p>{dialogTrimestreMonths.size} mois sélectionné{dialogTrimestreMonths.size > 1 ? "s" : ""}</p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground border-t border-primary/10 pt-1.5">
                  {getMonthsWithYear(paymentForm.academicYear, schoolCalendar)
                    .filter((m) => dialogTrimestreMonths.has(m))
                    .map((m) => MONTH_SHORT[m.split(" ")[0]] ?? m.split(" ")[0].slice(0, 3))
                    .join(" · ")}
                </p>
                <div className="flex items-center gap-1.5 text-xs text-emerald-600">
                  <Check className="h-3 w-3" />
                  Calculé automatiquement · montant non modifiable
                </div>
              </div>
            )}

            {/* ── Méthode de paiement ── */}
            {computedDialogAmount > 0 && !isDuplicateForDialog && (
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
                computedDialogAmount <= 0 ||
                isDuplicateForDialog ||
                dialogTrimestreMonths.size === 0
              }
              className="gap-2"
            >
              {isSubmitting
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Enregistrement...</>
                : <>
                    <DollarSign className="h-4 w-4" />
                    {computedDialogAmount > 0
                      ? `Confirmer · ${formatCurrency(computedDialogAmount)}`
                      : "Confirmer le paiement"}
                  </>}
            </Button>
          </DialogFooter>
          </>)}
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
                              Annuel (10 mois) ={" "}
                              <span className="font-semibold text-foreground">{formatCurrency(levelFee * 10)}</span>
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
            {/* ── Calendrier scolaire ── */}
            <div className="pt-2 border-t space-y-3">
              <div>
                <p className="text-sm font-semibold">Calendrier scolaire</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Définit les mois de cours et la répartition automatique T1 / T2 / T3
                </p>
              </div>
              <div className="rounded-lg border bg-muted/30 px-4 py-3 space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2 flex-1 min-w-[180px]">
                    <Label className="text-xs whitespace-nowrap shrink-0">Mois de rentrée :</Label>
                    <Select
                      value={draftSchoolCalendar.startMonth}
                      onValueChange={(v) => setDraftSchoolCalendar((prev) => ({ ...prev, startMonth: v }))}
                    >
                      <SelectTrigger className="h-8 flex-1 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ALL_MONTHS_GRE.map((m) => (
                          <SelectItem key={m} value={m}>{m}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="text-xs whitespace-nowrap shrink-0">Durée :</Label>
                    <Input
                      type="number" min={1} max={12} step={1}
                      className="h-8 w-16 text-sm text-center"
                      value={draftSchoolCalendar.durationMonths}
                      onChange={(e) =>
                        setDraftSchoolCalendar((prev) => ({
                          ...prev,
                          durationMonths: Math.min(12, Math.max(1, Number(e.target.value) || 1)),
                        }))
                      }
                    />
                    <span className="text-xs text-muted-foreground">mois</span>
                  </div>
                </div>
                {/* Aperçu T1/T2/T3 calculé en temps réel */}
                {(() => {
                  const groups = getCalendarTrimestreGroups(selectedYear, draftSchoolCalendar);
                  const nonSchool = SCHOOL_MONTHS.filter(
                    (m) => !getSchoolMonthNames(draftSchoolCalendar).includes(m)
                  );
                  return (
                    <div className="pt-2 border-t border-border/50 space-y-1.5">
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                        Aperçu — {selectedYear}
                      </p>
                      <div className="flex flex-wrap gap-x-4 gap-y-1">
                        {groups.map((g) => (
                          <div key={g.trimestre} className="text-xs">
                            <span className="font-semibold text-foreground">{g.label} :</span>{" "}
                            <span className="text-muted-foreground">
                              {g.monthsWithYear.map((m) => MONTH_SHORT[m.split(" ")[0]] ?? m.split(" ")[0].slice(0, 3)).join(" · ")}
                            </span>
                            <span className="text-muted-foreground/60 ml-1">({g.monthsWithYear.length} mois)</span>
                          </div>
                        ))}
                      </div>
                      {nonSchool.length > 0 && (
                        <p className="text-[10px] text-muted-foreground/60 italic">
                          Hors cours : {nonSchool.map((m) => MONTH_SHORT[m] ?? m).join(", ")}
                        </p>
                      )}
                      <p className="text-[10px] text-muted-foreground">
                        Annuel = <span className="font-semibold">{draftSchoolCalendar.durationMonths} mois</span> · Trimestre = montant mensuel × mois du trimestre
                      </p>
                    </div>
                  );
                })()}
              </div>
            </div>

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
