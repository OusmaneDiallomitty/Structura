"use client";

import { useState, useEffect, useCallback, useRef, useMemo, Suspense } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CLASSES_QUERY_KEY } from "@/hooks/queries/use-classes-query";
import { useOnline } from "@/hooks/use-online";
import { useRefreshOnFocus } from "@/hooks/use-refresh-on-focus";
import { useSearchParams } from "next/navigation";
import {
  BookOpen, Save, Loader2, RefreshCw, Lock, Unlock,
  Users, GraduationCap, ChevronRight, AlertTriangle,
  CheckCircle, BarChart3, FileText, X, Settings2, Plus, Trash2,
  Download, Printer, Archive,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import * as storage from "@/lib/storage";
import { getClasses, getClassSubjects, saveClassSubjects } from "@/lib/api/classes.service";
import { getStudents } from "@/lib/api/students.service";
import { offlineDB, STORES } from "@/lib/offline-db";
import { getTeamMembers } from "@/lib/api/users.service";
import { getCurrentAcademicYear } from "@/lib/api/academic-years.service";
import { useCurrentAcademicYear } from "@/hooks/queries/use-academic-year-query";
import { YearSelector } from "@/components/shared/YearSelector";
import type { AcademicYear } from "@/lib/api/academic-years.service";
import { getFeesConfig } from "@/lib/api/fees.service";
import {
  getEvaluations, bulkSaveEvaluations,
  getCompositions, bulkSaveCompositions,
  getClassReport, getTrimesterLock, lockTrimester, unlockTrimester,
  getStudentReport, getAnnualReport,
  type ClassReport, type TrimesterLock, type AnnualReport,
  type Evaluation, type Composition,
} from "@/lib/api/grades.service";
import { syncQueue } from "@/lib/sync-queue";
import { getSubjectsForLevel } from "@/lib/subjects-config";
import { formatClassName } from "@/lib/class-helpers";
import { generateBulletinPDF, printBulletinPDF, generateAllBulletinsPDF, printAllBulletinsPDF, type BulletinData } from "@/lib/bulletin-pdf";
import type { BackendClass } from "@/lib/api/classes.service";
import type { BackendStudent } from "@/types";

// ─── Constants ───────────────────────────────────────────────────────────────

const MONTHS = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

const TERMS = ["Trimestre 1", "Trimestre 2", "Trimestre 3"] as const;
type Term = typeof TERMS[number];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getTermMonths(
  startMonth: string,
  durationMonths: number,
  term: Term,
): string[] {
  const startIdx = MONTHS.indexOf(startMonth);
  if (startIdx === -1) return [];
  const months: string[] = [];
  for (let i = 0; i < Math.min(durationMonths, 12); i++) {
    months.push(MONTHS[(startIdx + i) % 12]);
  }
  const t1End = Math.ceil(months.length / 3);
  const t2End = t1End + Math.ceil((months.length - t1End) / 2);
  if (term === "Trimestre 1") return months.slice(0, t1End);
  if (term === "Trimestre 2") return months.slice(t1End, t2End);
  return months.slice(t2End);
}

type MentionKey = "TB" | "Bien" | "AB" | "Passable" | "Insuf" | "none";

/** Normalise un score vers /20 pour les mentions/couleurs (primaire /10 → x2) */
function toScore20(score: number | null, scoreMax: number): number | null {
  if (score === null) return null;
  return scoreMax === 10 ? score * 2 : score;
}

function getMention(score: number | null, scoreMax = 20): { label: string; key: MentionKey } {
  const s = toScore20(score, scoreMax);
  if (s === null) return { label: "—", key: "none" };
  if (s >= 16) return { label: "Très Bien", key: "TB" };
  if (s >= 14) return { label: "Bien", key: "Bien" };
  if (s >= 12) return { label: "Assez Bien", key: "AB" };
  if (s >= 10) return { label: "Passable", key: "Passable" };
  return { label: "Insuffisant", key: "Insuf" };
}

const MENTION_STYLES: Record<MentionKey, string> = {
  TB: "bg-indigo-100 text-indigo-700 border-indigo-200",
  Bien: "bg-blue-100 text-blue-700 border-blue-200",
  AB: "bg-green-100 text-green-700 border-green-200",
  Passable: "bg-yellow-100 text-yellow-700 border-yellow-200",
  Insuf: "bg-red-100 text-red-700 border-red-200",
  none: "bg-gray-100 text-gray-500 border-gray-200",
};

function avgColor(avg: number | null, scoreMax = 20): string {
  const s = toScore20(avg, scoreMax);
  if (s === null) return "text-gray-400";
  if (s >= 12) return "text-emerald-600 font-semibold";
  if (s >= 10) return "text-amber-600 font-semibold";
  return "text-red-600 font-semibold";
}

function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return n.toFixed(2);
}

function rankMedal(rank: number): string {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return `${rank}`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function MentionBadge({ score, scoreMax = 20 }: { score: number | null; scoreMax?: number }) {
  const m = getMention(score, scoreMax);
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${MENTION_STYLES[m.key]}`}
    >
      {m.label}
    </span>
  );
}

function SkeletonTable({ rows = 5, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-2 mt-4">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-3">
          {Array.from({ length: cols }).map((_, j) => (
            <Skeleton key={j} className="h-9 flex-1 rounded" />
          ))}
        </div>
      ))}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-3">
      <GraduationCap className="w-12 h-12 opacity-30" />
      <p className="text-sm">{message}</p>
    </div>
  );
}

/** Construit la map scores [studentId][subject] pour un mois donné depuis le cache */
function buildEvalGridScores(
  month: string,
  allEvals: Evaluation[],
  students: BackendStudent[],
  subjects: string[],
): Record<string, Record<string, string>> {
  const scores: Record<string, Record<string, string>> = {};
  for (const s of students) scores[s.id] = {};
  for (const ev of allEvals) {
    if (ev.month === month && scores[ev.studentId] && subjects.includes(ev.subject)) {
      scores[ev.studentId][ev.subject] = String(ev.score);
    }
  }
  return scores;
}

/** Retourne le nombre d'évals saisies pour un mois parmi students × subjects */
function getMonthCompletion(
  month: string,
  allEvals: Evaluation[],
  studentIds: Set<string>,
  subjects: string[],
): { filled: number; total: number } {
  const total = studentIds.size * subjects.length;
  if (total === 0) return { filled: 0, total: 0 };
  const filled = allEvals.filter(
    (ev) => ev.month === month && studentIds.has(ev.studentId) && subjects.includes(ev.subject),
  ).length;
  return { filled, total };
}

// ─── Main page ────────────────────────────────────────────────────────────────

function GradesPageInner() {
  useSearchParams(); // required for Suspense boundary

  const { user, refreshUserProfile, hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const isOnline = useOnline();
  const isDirector    = user?.role === "director";
  const isTeacher     = user?.role === "teacher";
  const teacherAssignments = user?.classAssignments ?? [];
  const canSaveGrades = hasPermission("grades", "create") || hasPermission("grades", "edit");

  // Cache 24h partagé entre toutes les pages — 0 requête supplémentaire si déjà chargé
  const { data: sharedAcademicYear } = useCurrentAcademicYear();

  // Rafraîchir le profil au montage pour que classAssignments soit à jour
  // sans que le prof ait besoin de se reconnecter après une assignation par le directeur.
  useEffect(() => {
    refreshUserProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Academic year (courante, chargée depuis le backend)
  const [academicYear, setAcademicYear] = useState<string>("");
  // Calendrier scolaire — initialisé depuis le cache localStorage (même clé que payments/settings)
  // pour que le prof voie immédiatement les bons mois par trimestre, sans attendre l'API.
  const [startMonth, setStartMonth] = useState<string>(() => {
    if (typeof window === "undefined") return "Septembre";
    try {
      const s = localStorage.getItem("structura_school_calendar_v1");
      return s ? (JSON.parse(s).startMonth || "Septembre") : "Septembre";
    } catch { return "Septembre"; }
  });
  const [durationMonths, setDurationMonths] = useState<number>(() => {
    if (typeof window === "undefined") return 9;
    try {
      const s = localStorage.getItem("structura_school_calendar_v1");
      return s ? (JSON.parse(s).durationMonths || 9) : 9;
    } catch { return 9; }
  });
  // Année sélectionnée via le sélecteur archive (vide = année courante)
  const [selectedYear, setSelectedYear] = useState<string>("");
  const [selectedYearObj, setSelectedYearObj] = useState<AcademicYear | null>(null);
  // Année effective pour les appels API
  const effectiveYear = selectedYear || academicYear;

  // ── Classes via useQuery ──────────────────────────────────────────────────
  const { data: allClassesData, isLoading: classesLoading, refetch: refetchClasses } = useQuery({
    queryKey: CLASSES_QUERY_KEY(user?.tenantId),
    queryFn: async (): Promise<BackendClass[]> => {
      const token = storage.getAuthItem("structura_token");
      if (!token) throw new Error("Session expirée");
      const data = await getClasses(token);
      for (const cls of data) await offlineDB.update(STORES.CLASSES, cls).catch(() => {});
      return data;
    },
    enabled: isOnline && !!user,
    staleTime: 60_000,
  });

  const [offlineClasses, setOfflineClasses] = useState<BackendClass[]>([]);
  useEffect(() => {
    offlineDB.getAll<BackendClass>(STORES.CLASSES).then(setOfflineClasses).catch(() => {});
  }, []);

  const classes = useMemo<BackendClass[]>(() => {
    const raw = allClassesData ?? offlineClasses;
    if (isTeacher && teacherAssignments.length > 0) {
      const assignedIds = new Set(teacherAssignments.map((a) => a.classId));
      return raw.filter((c) => assignedIds.has(c.id));
    }
    return raw;
  }, [allClassesData, offlineClasses, isTeacher, teacherAssignments]);

  // Shared filters
  const [selectedClassId, setSelectedClassId] = useState<string>("");
  const [selectedTerm, setSelectedTerm] = useState<Term>("Trimestre 1");

  // Evaluations tab
  // evalSubject / evalMonth : utilisés pour le reset lors du changement de classe/trimestre
  const [evalSubject, setEvalSubject] = useState<string>("");
  const [evalMonth, setEvalMonth] = useState<string>("");
  const [evalScores, setEvalScores] = useState<Record<string, string>>({});

  // Compositions tab
  const [compSubject, setCompSubject] = useState<string>("");

  // Bulletin tab — le chargement est via useQuery (voir plus bas), lock reste en state
  const [bulletinReport, setBulletinReport] = useState<ClassReport | null>(null);
  const [trimesterLock, setTrimesterLock] = useState<TrimesterLock | null>(null);
  const [lockLoading, setLockLoading] = useState(false);
  // Trimestre verrouillé → profs bloqués. Le directeur garde l'accès.
  const isLocked = !!trimesterLock && !isDirector;

  // Subject detail sheet
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetSubject, setSheetSubject] = useState<string>("");

  // Active tab — prof: évaluations/compositions | directeur: bulletin/configuration
  const [activeTab, setActiveTab] = useState<"evaluations" | "compositions" | "bulletin" | "configuration">("evaluations");

  // Rediriger vers le bon tab dès que le rôle est connu
  useEffect(() => {
    if (user?.role === "director") setActiveTab("bulletin");
    else if (user?.role) setActiveTab("evaluations");
  }, [user?.role]);

  // Configuration tab
  const [configClassId, setConfigClassId] = useState("");
  const [configSubjects, setConfigSubjects] = useState<Array<{name: string; coefficient: number; enabled: boolean}>>([]);
  const [configSaving, setConfigSaving] = useState(false);
  const [newSubjectName, setNewSubjectName] = useState("");
  const [newSubjectCoeff, setNewSubjectCoeff] = useState(1);

  // subjectTeacherMap and subjectCoeffMap are derived via useMemo from useQuery data (see below)

  // PDF generation
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

  // Dialog confirmation verrou
  const [lockConfirmOpen, setLockConfirmOpen] = useState(false);

  // Rapport annuel (primaire)
  const [annualReport, setAnnualReport] = useState<AnnualReport | null>(null);
  const [annualLoading, setAnnualLoading] = useState(false);

  // Grille unifiée primaire — scores (saisie utilisateur) ; chargement via useQuery (voir plus bas)
  const [gridStudents, setGridStudents] = useState<BackendStudent[]>([]);
  const [gridScores, setGridScores] = useState<Record<string, Record<string, string>>>({});
  const [gridSaving, setGridSaving] = useState(false);
  const [gridSavedSubjects, setGridSavedSubjects] = useState<Set<string>>(new Set());
  const [gridAutoSavingSubjects, setGridAutoSavingSubjects] = useState<Set<string>>(new Set());
  // Timers debounce par matière — clé = nom matière, valeur = timeout id
  const autoSaveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const gridScoresRef = useRef<Record<string, Record<string, string>>>({});

  // ── Grille évaluations secondaire ────────────────────────────────────────
  // Un seul chargement pour tout le trimestre — switching mois = instantané
  const [evalGridStudents, setEvalGridStudents] = useState<BackendStudent[]>([]);
  // Vue mobile : matière active (une matière à la fois)
  const [mobileActiveSub, setMobileActiveSub] = useState<string>("");
  const [mobileActiveSubComp, setMobileActiveSubComp] = useState<string>("");
  const [evalGridAllEvals, setEvalGridAllEvals] = useState<Evaluation[]>([]);
  const [evalGridScores, setEvalGridScores] = useState<Record<string, Record<string, string>>>({});
  const [evalGridSavedSubjects, setEvalGridSavedSubjects] = useState<Set<string>>(new Set());
  const [evalGridAutoSavingSubjects, setEvalGridAutoSavingSubjects] = useState<Set<string>>(new Set());
  const evalGridAutoSaveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  // Ref toujours à jour avec les derniers scores — évite le stale closure lors du debounce
  const evalGridScoresRef = useRef<Record<string, Record<string, string>>>({});

  // ── Grille compositions secondaire ───────────────────────────────────────
  const [compGridStudents, setCompGridStudents] = useState<BackendStudent[]>([]);
  const [compGridScores, setCompGridScores] = useState<Record<string, Record<string, string>>>({});
  const [compGridCourseAvgs, setCompGridCourseAvgs] = useState<Record<string, Record<string, number | null>>>({});
  const [compGridSavedSubjects, setCompGridSavedSubjects] = useState<Set<string>>(new Set());
  const [compGridAutoSavingSubjects, setCompGridAutoSavingSubjects] = useState<Set<string>>(new Set());
  const compGridAutoSaveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const compGridScoresRef = useRef<Record<string, Record<string, string>>>({});

  // ── Dérivés classe sélectionnée — déclarés tôt pour être accessibles dans les callbacks ──
  // PRIMARY si gradeMode explicite OU si le niveau est Primaire/Maternelle (rétrocompat)
  const selectedClass   = classes.find((c) => c.id === selectedClassId);
  const isPrimaryClass  =
    selectedClass?.gradeMode === 'PRIMARY' ||
    ['Primaire', 'Maternelle'].includes(selectedClass?.level ?? '') ||
    /^(CP|CE|CM)\d/i.test(selectedClass?.name ?? '') ||
    /^(Petite|Moyenne|Grande)\s+Section$/i.test(selectedClass?.name ?? '');
  const scoreMax = isPrimaryClass ? 10 : 20;

  // ── Init: academic year + classes ─────────────────────────────────────────

  useEffect(() => {
    async function init() {
      const token = storage.getAuthItem("structura_token");
      if (!token) return;

      try {
        // Utiliser le cache React Query partagé (24h) au lieu d'un appel API direct
        const [yr, feesConfig] = await Promise.all([
          sharedAcademicYear !== undefined ? Promise.resolve(sharedAcademicYear) : getCurrentAcademicYear(token),
          getFeesConfig(token).catch(() => null),
        ]);

        if (yr) {
          setAcademicYear(yr.name);
          // Priorité : AcademicYear → Tenant.schoolCalendar → défaut
          const calStart = yr.startMonth || feesConfig?.schoolCalendar?.startMonth;
          const calDuration = yr.durationMonths || feesConfig?.schoolCalendar?.durationMonths;
          if (calStart) setStartMonth(calStart);
          if (calDuration) setDurationMonths(calDuration);
          // Mettre en cache pour tous les utilisateurs (prof inclus) — même clé que payments/settings
          if (calStart || calDuration) {
            try {
              const existing = localStorage.getItem("structura_school_calendar_v1");
              const base = existing ? JSON.parse(existing) : {};
              localStorage.setItem("structura_school_calendar_v1", JSON.stringify({
                ...base,
                ...(calStart    && { startMonth: calStart }),
                ...(calDuration && { durationMonths: calDuration }),
              }));
            } catch { /* quota */ }
          }
        } else {
          const now = new Date();
          const y = now.getFullYear();
          setAcademicYear(`${y}-${y + 1}`);
          // Fallback depuis tenant si pas d'année courante
          const calStart = feesConfig?.schoolCalendar?.startMonth;
          const calDuration = feesConfig?.schoolCalendar?.durationMonths;
          if (calStart) setStartMonth(calStart);
          if (calDuration) setDurationMonths(calDuration);
          if (calStart || calDuration) {
            try {
              const existing = localStorage.getItem("structura_school_calendar_v1");
              const base = existing ? JSON.parse(existing) : {};
              localStorage.setItem("structura_school_calendar_v1", JSON.stringify({
                ...base,
                ...(calStart    && { startMonth: calStart }),
                ...(calDuration && { durationMonths: calDuration }),
              }));
            } catch { /* quota */ }
          }
        }
      } catch (e) {
        if (!navigator.onLine || (e as any)?.message === 'Failed to fetch') {
          // Année scolaire depuis le cache localStorage (peuplé par CurrentYearBadge)
          try {
            const token2 = storage.getAuthItem("structura_token");
            const tenantId = token2 ? JSON.parse(atob(token2.split('.')[1])).tenantId : null;
            const yearCacheKey = tenantId ? `structura_year_cache:${tenantId}` : null;
            if (yearCacheKey) {
              const cached = localStorage.getItem(yearCacheKey);
              if (cached) {
                const yr = JSON.parse(cached);
                if (yr.name) setAcademicYear(yr.name);
                if (yr.startMonth) setStartMonth(yr.startMonth);
                if (yr.durationMonths) setDurationMonths(yr.durationMonths);
              }
            }
          } catch { /* ignore */ }
          toast.info("Vous êtes hors ligne — affichage des données locales.");
        } else {
          toast.error("Impossible de charger les données initiales");
        }
        console.error(e);
      }
    }
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Rafraîchir les classes quand la fenêtre reprend le focus
  useRefreshOnFocus(refetchClasses);

  // ── Subjects available for selected class ─────────────────────────────────

  const availableSubjects = useCallback((): string[] => {
    if (!selectedClassId) return [];
    // Professeur : matières issues de ses affectations
    if (isTeacher) {
      const assignment = teacherAssignments.find((a) => a.classId === selectedClassId);
      return assignment?.subjects ?? [];
    }
    // Directeur et autres rôles (secrétaire, surveillant…) : matières chargées depuis l'API
    return [];
  }, [selectedClassId, isTeacher, teacherAssignments]);

  // ── useQuery: sujets + coefficients de la classe sélectionnée ───────────────
  const { data: classSubjectsData } = useQuery({
    queryKey: ["class-subjects", user?.tenantId, selectedClassId],
    queryFn: async () => {
      const token = storage.getAuthItem("structura_token");
      if (!token) throw new Error("Session expirée");
      return getClassSubjects(token, selectedClassId);
    },
    enabled: !!selectedClassId && isOnline && !!user,
    staleTime: 60_000,
  });

  // ── useQuery: map prof→matière pour la classe sélectionnée (directeur) ───────
  const { data: teamMembersData } = useQuery({
    queryKey: ["teacher-map", user?.tenantId, selectedClassId],
    queryFn: async () => {
      const token = storage.getAuthItem("structura_token");
      if (!token) throw new Error("Session expirée");
      return getTeamMembers(token);
    },
    enabled: isDirector && !!selectedClassId && isOnline && !!user,
    staleTime: 60_000,
  });

  // Dériver directorSubjects + subjectCoeffMap depuis les données de la query
  const directorSubjects = useMemo<string[]>(() => {
    if (isTeacher || !classSubjectsData) return [];
    return classSubjectsData.map((s) => s.name);
  }, [classSubjectsData, isTeacher]);

  // Professeur : matières issues de ses affectations de classe
  // Directeur + tous autres rôles (secrétaire, surveillant…) : matières chargées depuis l'API
  const subjectOptions: string[] = isTeacher
    ? availableSubjects()
    : directorSubjects;

  // Coefficients dérivés de la query (directeur ET professeur)
  const subjectCoeffMap = useMemo<Record<string, number>>(() => {
    if (!classSubjectsData) return {};
    const map: Record<string, number> = {};
    for (const item of classSubjectsData) {
      if (item.coefficient != null) map[item.name] = item.coefficient;
    }
    return map;
  }, [classSubjectsData]);

  // subjectTeacherMap dérivé de la query membres (directeur)
  const subjectTeacherMap = useMemo<Record<string, string>>(() => {
    if (!isDirector || !teamMembersData || !selectedClassId) return {};
    const map: Record<string, string> = {};
    for (const m of teamMembersData) {
      if (m.role === "TEACHER" && m.classAssignments) {
        const assignment = m.classAssignments.find((a) => a.classId === selectedClassId);
        if (assignment) {
          const name = `${m.firstName} ${m.lastName}`;
          for (const subj of assignment.subjects) {
            map[subj] = name;
          }
        }
      }
    }
    return map;
  }, [teamMembersData, isDirector, selectedClassId]);

  // ── useQuery: grille évaluations secondaire ────────────────────────────────
  const {
    data: evalGridData,
    isLoading: evalGridLoading,
    refetch: refetchEvalGrid,
  } = useQuery({
    queryKey: ["eval-grid", user?.tenantId, selectedClassId, selectedTerm, effectiveYear],
    queryFn: async () => {
      const token = storage.getAuthItem("structura_token");
      if (!token) throw new Error("Session expirée");
      const [students, allEvals] = await Promise.all([
        getStudents(token, { classId: selectedClassId }),
        getEvaluations(token, { classId: selectedClassId, term: selectedTerm, academicYear: effectiveYear || undefined }),
      ]);
      return { students, allEvals };
    },
    enabled: isOnline && !!user && !!selectedClassId && !isPrimaryClass && activeTab === "evaluations",
    staleTime: 30_000,
  });

  // Sync evalGrid state depuis query data
  useEffect(() => {
    if (!evalGridData) return;
    setEvalGridStudents(evalGridData.students);
    setEvalGridAllEvals(evalGridData.allEvals);
  }, [evalGridData]);

  // ── useQuery: grille compositions secondaire ───────────────────────────────
  const subjectOptionsKey = subjectOptions.join(",");
  const {
    data: compGridData,
    isLoading: compGridLoading,
    refetch: refetchCompGrid,
  } = useQuery({
    queryKey: ["comp-grid", user?.tenantId, selectedClassId, selectedTerm, effectiveYear, subjectOptionsKey],
    queryFn: async () => {
      const token = storage.getAuthItem("structura_token");
      if (!token) throw new Error("Session expirée");
      const subjects = subjectOptions;
      const [students, allEvals, ...compsPerSubject] = await Promise.all([
        getStudents(token, { classId: selectedClassId }),
        getEvaluations(token, { classId: selectedClassId, term: selectedTerm, academicYear: effectiveYear || undefined }),
        ...subjects.map((sub) =>
          getCompositions(token, { classId: selectedClassId, subject: sub, term: selectedTerm, academicYear: effectiveYear || undefined }),
        ),
      ]);

      const evalsByStudentSubject: Record<string, Record<string, number[]>> = {};
      for (const ev of allEvals) {
        if (!evalsByStudentSubject[ev.studentId]) evalsByStudentSubject[ev.studentId] = {};
        if (!evalsByStudentSubject[ev.studentId][ev.subject]) evalsByStudentSubject[ev.studentId][ev.subject] = [];
        evalsByStudentSubject[ev.studentId][ev.subject].push(ev.score);
      }
      const courseAvgs: Record<string, Record<string, number | null>> = {};
      for (const s of students) {
        courseAvgs[s.id] = {};
        for (const sub of subjects) {
          const sc = evalsByStudentSubject[s.id]?.[sub];
          courseAvgs[s.id][sub] = sc && sc.length > 0 ? sc.reduce((a, b) => a + b, 0) / sc.length : null;
        }
      }

      const scores: Record<string, Record<string, string>> = {};
      for (const s of students) scores[s.id] = {};
      for (let i = 0; i < subjects.length; i++) {
        for (const c of (compsPerSubject[i] as Composition[])) {
          if (scores[c.studentId]) scores[c.studentId][subjects[i]] = String(c.compositionScore);
        }
      }

      const sortedStudents = [...students].sort((a, b) =>
        `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`)
      );
      return { students: sortedStudents, courseAvgs, scores };
    },
    enabled: isOnline && !!user && !!selectedClassId && !isPrimaryClass && activeTab === "compositions",
    staleTime: 30_000,
  });

  // Sync compGrid state depuis query data
  useEffect(() => {
    if (!compGridData) return;
    setCompGridStudents(compGridData.students);
    setCompGridCourseAvgs(compGridData.courseAvgs);
    setCompGridScores(compGridData.scores);
    compGridScoresRef.current = compGridData.scores;
    setCompGridSavedSubjects(new Set());
  }, [compGridData]);

  // ── useQuery: grille primaire ──────────────────────────────────────────────
  const {
    data: primaryGridData,
    isLoading: gridLoading,
    refetch: refetchPrimaryGrid,
  } = useQuery({
    queryKey: ["primary-grid", user?.tenantId, selectedClassId, selectedTerm, effectiveYear, subjectOptionsKey],
    queryFn: async () => {
      const token = storage.getAuthItem("structura_token");
      if (!token) throw new Error("Session expirée");
      const subjects = subjectOptions;
      const [students, ...compsPerSubject] = await Promise.all([
        getStudents(token, { classId: selectedClassId }),
        ...subjects.map((sub) =>
          getCompositions(token, {
            classId: selectedClassId,
            subject: sub,
            term: selectedTerm,
            academicYear: effectiveYear || undefined,
          }),
        ),
      ]);

      const scores: Record<string, Record<string, string>> = {};
      for (const s of students) scores[s.id] = {};
      for (let i = 0; i < subjects.length; i++) {
        for (const c of compsPerSubject[i] as Composition[]) {
          if (scores[c.studentId]) scores[c.studentId][subjects[i]] = String(c.compositionScore);
        }
      }

      const sortedStudents = [...students].sort((a, b) =>
        `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`)
      );
      return { students: sortedStudents, scores };
    },
    enabled: isOnline && !!user && !!selectedClassId && isPrimaryClass && activeTab === "compositions",
    staleTime: 30_000,
  });

  // Sync primaryGrid state depuis query data
  useEffect(() => {
    if (!primaryGridData) return;
    setGridStudents(primaryGridData.students);
    setGridScores(primaryGridData.scores);
    gridScoresRef.current = primaryGridData.scores;
    setGridSavedSubjects(new Set());
  }, [primaryGridData]);

  // ── Offline : charger les élèves depuis IndexedDB quand hors ligne ───────────
  // Les queries evalGrid / compGrid / primaryGrid sont disabled offline.
  // Sans cet effet, les grilles restent vides → le prof ne peut rien saisir.
  // On charge les élèves de la classe depuis IndexedDB pour afficher les lignes.
  // Les notes elles-mêmes ne sont pas en cache — le prof peut en saisir de nouvelles
  // (elles iront en syncQueue) mais ne verra pas celles déjà enregistrées.
  useEffect(() => {
    if (isOnline || !selectedClassId) return;
    offlineDB.getAll<BackendStudent>(STORES.STUDENTS)
      .then((all) => {
        const classStudents = all
          .filter((s) => (s as any).classId === selectedClassId)
          .sort((a, b) =>
            `${(a as any).lastName} ${(a as any).firstName}`
              .localeCompare(`${(b as any).lastName} ${(b as any).firstName}`, 'fr')
          );
        if (classStudents.length === 0) return;
        // Alimenter les trois états selon le type de classe
        if (isPrimaryClass) {
          setGridStudents((prev) => prev.length === 0 ? classStudents as any : prev);
        } else {
          setEvalGridStudents((prev) => prev.length === 0 ? classStudents as any : prev);
          setCompGridStudents((prev) => prev.length === 0 ? classStudents as any : prev);
        }
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline, selectedClassId, isPrimaryClass]);

  // ── useQuery: bulletin + verrou trimestre ─────────────────────────────────
  const {
    data: bulletinData,
    isLoading: bulletinLoading,
    refetch: refetchBulletin,
  } = useQuery({
    queryKey: ["bulletin", user?.tenantId, selectedClassId, selectedTerm, effectiveYear],
    queryFn: async () => {
      const token = storage.getAuthItem("structura_token");
      if (!token) throw new Error("Session expirée");
      const [report, lock] = await Promise.all([
        getClassReport(token, selectedClassId, selectedTerm, effectiveYear || undefined),
        getTrimesterLock(token, selectedClassId, selectedTerm, effectiveYear),
      ]);
      return { report, lock };
    },
    enabled: isOnline && !!user && !!selectedClassId && !!effectiveYear && activeTab === "bulletin",
    staleTime: 60_000,
  });

  // Sync bulletin + lock state depuis query data
  useEffect(() => {
    if (!bulletinData) return;
    setBulletinReport(bulletinData.report);
    setTrimesterLock(bulletinData.lock);
  }, [bulletinData]);

  // ── useQuery: config sujets (onglet configuration) ────────────────────────
  const {
    data: configSubjectsData,
    isLoading: configLoading,
    refetch: refetchConfigSubjects,
  } = useQuery({
    queryKey: ["config-subjects", user?.tenantId, configClassId],
    queryFn: async () => {
      const token = storage.getAuthItem("structura_token");
      if (!token) throw new Error("Session expirée");
      return getClassSubjects(token, configClassId);
    },
    enabled: !!configClassId && isOnline && !!user && activeTab === "configuration",
    staleTime: 60_000,
  });

  // Sync configSubjects depuis query data (puis éditable localement)
  useEffect(() => {
    if (!configSubjectsData) return;
    setConfigSubjects(configSubjectsData.map((s) => ({
      name: s.name,
      coefficient: s.coefficient != null ? s.coefficient : 1,
      enabled: true,
    })));
  }, [configSubjectsData]);

  const termMonths = getTermMonths(startMonth, durationMonths, selectedTerm);

  // Reset subject / month when class or term changes
  useEffect(() => {
    // Annuler TOUS les timers d'auto-save en attente pour éviter les sauvegardes fantômes
    Object.values(evalGridAutoSaveTimers.current).forEach(clearTimeout);
    evalGridAutoSaveTimers.current = {};
    Object.values(autoSaveTimers.current).forEach(clearTimeout);
    autoSaveTimers.current = {};
    Object.values(compGridAutoSaveTimers.current).forEach(clearTimeout);
    compGridAutoSaveTimers.current = {};
    setEvalSubject("");
    setCompSubject("");
    setEvalMonth("");
    setEvalScores({});
    setGridStudents([]);
    setGridScores({});
    gridScoresRef.current = {};
    setGridSavedSubjects(new Set());
    // Reset grilles secondaire
    setEvalGridStudents([]);
    setEvalGridAllEvals([]);
    setEvalGridScores({});
    evalGridScoresRef.current = {};
    setEvalGridSavedSubjects(new Set());
    setCompGridStudents([]);
    setCompGridScores({});
    compGridScoresRef.current = {};
    setCompGridCourseAvgs({});
    setCompGridSavedSubjects(new Set());
    // Vider le cache des grilles pour forcer un vrai refetch quand on revient sur la même classe
    queryClient.removeQueries({ queryKey: ["comp-grid", user?.tenantId] });
    queryClient.removeQueries({ queryKey: ["primary-grid", user?.tenantId] });
    queryClient.removeQueries({ queryKey: ["eval-grid", user?.tenantId] });
  }, [selectedClassId, selectedTerm]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Evaluations / Compositions (mode ligne) — remplacés par les grilles ────
  // Ces fonctions étaient utilisées en mode ligne (un élève, une matière, un mois à la fois).
  // Elles sont maintenant remplacées par les grilles React Query ci-dessus.

  // ── Grille unifiée PRIMAIRE — rechargement via React Query ───────────────
  // loadPrimaryGrid est remplacé par refetchPrimaryGrid (useQuery ci-dessus)

  const savePrimaryGrid = useCallback(async (subjects: string[]) => {
    if (!selectedClassId || subjects.length === 0 || gridStudents.length === 0) return;
    const token = storage.getAuthItem("structura_token");
    if (!token) return;

    setGridSaving(true);
    try {
      const teacherName = user ? `${user.firstName} ${user.lastName}` : undefined;
      let totalSaved = 0;

      await Promise.all(
        subjects.map(async (sub) => {
          const compositions = gridStudents
            .map((s) => {
              const raw = gridScores[s.id]?.[sub];
              if (raw === undefined || raw === "") return null;
              const score = parseFloat(raw);
              if (isNaN(score) || score < 0 || score > 10) return null;
              return { studentId: s.id, compositionScore: score };
            })
            .filter((x): x is { studentId: string; compositionScore: number } => x !== null);

          if (compositions.length === 0) return;
          totalSaved += compositions.length;
          await bulkSaveCompositions(token, {
            classId: selectedClassId,
            subject: sub,
            term: selectedTerm,
            academicYear: academicYear || undefined,
            teacherName,
            compositions,
          });
          setGridSavedSubjects((prev) => new Set([...prev, sub]));
        }),
      );

      if (totalSaved > 0) {
        toast.success(`${totalSaved} note(s) enregistrée(s)`);
      } else {
        toast.warning("Aucune note valide à enregistrer");
      }
    } catch (e) {
      toast.error("Erreur lors de l'enregistrement");
      console.error(e);
    } finally {
      setGridSaving(false);
    }
  }, [selectedClassId, selectedTerm, academicYear, gridStudents, gridScores, user]);

  // ── Grille évaluations secondaire — rechargement via React Query ─────────
  // loadSecondaryEvalGrid est remplacé par refetchEvalGrid (useQuery ci-dessus)

  const saveEvalGrid = useCallback(async (subjects: string[], month: string, scores: Record<string, Record<string, string>>) => {
    if (!selectedClassId || !month || subjects.length === 0 || evalGridStudents.length === 0) return;
    const token = storage.getAuthItem('structura_token');
    if (!token) return;
    setEvalGridSavedSubjects(new Set());
    let totalSaved = 0;
    await Promise.all(
      subjects.map(async (sub) => {
        const evaluations = evalGridStudents
          .map((s) => {
            const raw = scores[s.id]?.[sub];
            if (raw === undefined || raw === '') return null;
            const score = parseFloat(raw);
            if (isNaN(score) || score < 0 || score > 20) return null;
            return { studentId: s.id, score };
          })
          .filter((x): x is { studentId: string; score: number } => x !== null);
        if (evaluations.length === 0) return;
        totalSaved += evaluations.length;
        await bulkSaveEvaluations(token, {
          classId: selectedClassId,
          subject: sub,
          term: selectedTerm,
          month,
          academicYear: academicYear || undefined,
          teacherName: user ? `${user.firstName} ${user.lastName}` : undefined,
          evaluations,
        });
        setEvalGridSavedSubjects((prev) => new Set([...prev, sub]));
        // Mettre à jour le cache local
        setEvalGridAllEvals((prev) => {
          const filtered = prev.filter((ev) => !(ev.month === month && ev.subject === sub));
          const newEvals = evaluations.map((ev) => ({
            id: `${sub}-${ev.studentId}-${month}`,
            studentId: ev.studentId,
            classId: selectedClassId,
            subject: sub,
            term: selectedTerm,
            month,
            score: ev.score,
            academicYear: academicYear || '',
          } as Evaluation));
          return [...filtered, ...newEvals];
        });
      }),
    );
    if (totalSaved > 0) toast.success(`${totalSaved} note(s) enregistrée(s)`);
    else toast.warning('Aucune note valide à enregistrer');
  }, [selectedClassId, selectedTerm, academicYear, evalGridStudents, user]);

  const autoSaveEvalSubject = useCallback(async (subject: string, month: string, students: BackendStudent[], scores: Record<string, Record<string, string>>) => {
    if (!selectedClassId || !month) return;
    const token = storage.getAuthItem('structura_token');
    if (!token) return;
    const evaluations = students
      .map((s) => {
        const raw = scores[s.id]?.[subject];
        if (raw === undefined || raw === '') return null;
        const score = parseFloat(raw);
        if (isNaN(score) || score < 0 || score > 20) return null;
        return { studentId: s.id, score };
      })
      .filter((x): x is { studentId: string; score: number } => x !== null);
    if (evaluations.length === 0) return;
    setEvalGridAutoSavingSubjects((prev) => new Set([...prev, subject]));
    try {
      await bulkSaveEvaluations(token, {
        classId: selectedClassId,
        subject,
        term: selectedTerm,
        month,
        academicYear: academicYear || undefined,
        teacherName: user ? `${user.firstName} ${user.lastName}` : undefined,
        evaluations,
      });
      setEvalGridSavedSubjects((prev) => new Set([...prev, subject]));
      setEvalGridAllEvals((prev) => {
        const filtered = prev.filter((ev) => !(ev.month === month && ev.subject === subject));
        const newEvals = evaluations.map((ev) => ({
          id: `${subject}-${ev.studentId}-${month}`,
          studentId: ev.studentId,
          classId: selectedClassId,
          subject,
          term: selectedTerm,
          month,
          score: ev.score,
          academicYear: academicYear || '',
        } as Evaluation));
        return [...filtered, ...newEvals];
      });
    } catch (err: any) {
      if (!navigator.onLine || err?.message === 'Failed to fetch') {
        await syncQueue.add({ type: "evaluation", action: "create", data: {
          classId: selectedClassId, subject, term: selectedTerm, month,
          academicYear: academicYear || undefined,
          teacherName: user ? `${user.firstName} ${user.lastName}` : undefined,
          evaluations: students.map((s) => {
            const raw = scores[s.id]?.[subject];
            const score = parseFloat(raw ?? '');
            return !isNaN(score) && score >= 0 && score <= 20 ? { studentId: s.id, score } : null;
          }).filter(Boolean),
        }});
      } else {
        toast.error(err?.message || 'Erreur lors de la sauvegarde des notes');
      }
    } finally {
      setEvalGridAutoSavingSubjects((prev) => { const n = new Set(prev); n.delete(subject); return n; });
    }
  }, [selectedClassId, selectedTerm, academicYear, user]);

  const triggerEvalAutoSave = useCallback((subject: string, month: string) => {
    if (evalGridAutoSaveTimers.current[subject]) clearTimeout(evalGridAutoSaveTimers.current[subject]);
    setEvalGridSavedSubjects((prev) => { const n = new Set(prev); n.delete(subject); return n; });
    evalGridAutoSaveTimers.current[subject] = setTimeout(() => {
      // Lit le ref pour avoir les scores les plus récents (pas la closure périmée)
      autoSaveEvalSubject(subject, month, evalGridStudents, evalGridScoresRef.current);
    }, 1000);
  }, [autoSaveEvalSubject, evalGridStudents]);

  // ── Grille compositions secondaire — rechargement via React Query ────────
  // loadSecondaryCompGrid est remplacé par refetchCompGrid (useQuery ci-dessus)

  const saveCompGrid = useCallback(async (subjects: string[]) => {
    if (!selectedClassId || subjects.length === 0 || compGridStudents.length === 0) return;
    const token = storage.getAuthItem('structura_token');
    if (!token) return;
    let totalSaved = 0;
    await Promise.all(
      subjects.map(async (sub) => {
        const compositions = compGridStudents
          .map((s) => {
            const raw = compGridScores[s.id]?.[sub];
            if (raw === undefined || raw === '') return null;
            const score = parseFloat(raw);
            if (isNaN(score) || score < 0 || score > 20) return null;
            return { studentId: s.id, compositionScore: score };
          })
          .filter((x): x is { studentId: string; compositionScore: number } => x !== null);
        if (compositions.length === 0) return;
        totalSaved += compositions.length;
        await bulkSaveCompositions(token, {
          classId: selectedClassId,
          subject: sub,
          term: selectedTerm,
          academicYear: academicYear || undefined,
          teacherName: user ? `${user.firstName} ${user.lastName}` : undefined,
          compositions,
        });
        setCompGridSavedSubjects((prev) => new Set([...prev, sub]));
      }),
    );
    if (totalSaved > 0) toast.success(`${totalSaved} composition(s) enregistrée(s)`);
    else toast.warning('Aucune note valide à enregistrer');
  }, [selectedClassId, selectedTerm, academicYear, compGridStudents, compGridScores, user]);

  const autoSaveCompSubject = useCallback(async (subject: string, students: BackendStudent[], scores: Record<string, Record<string, string>>) => {
    if (!selectedClassId) return;
    const token = storage.getAuthItem('structura_token');
    if (!token) return;
    const compositions = students
      .map((s) => {
        const raw = scores[s.id]?.[subject];
        if (raw === undefined || raw === '') return null;
        const score = parseFloat(raw);
        if (isNaN(score) || score < 0 || score > 20) return null;
        return { studentId: s.id, compositionScore: score };
      })
      .filter((x): x is { studentId: string; compositionScore: number } => x !== null);
    if (compositions.length === 0) return;
    setCompGridAutoSavingSubjects((prev) => new Set([...prev, subject]));
    try {
      await bulkSaveCompositions(token, {
        classId: selectedClassId,
        subject,
        term: selectedTerm,
        academicYear: academicYear || undefined,
        teacherName: user ? `${user.firstName} ${user.lastName}` : undefined,
        compositions,
      });
      setCompGridSavedSubjects((prev) => new Set([...prev, subject]));
    } catch (err: any) {
      if (!navigator.onLine || err?.message === 'Failed to fetch') {
        await syncQueue.add({ type: "composition", action: "create", data: {
          classId: selectedClassId, subject, term: selectedTerm,
          academicYear: academicYear || undefined,
          teacherName: user ? `${user.firstName} ${user.lastName}` : undefined,
          compositions: students.map((s) => {
            const raw = scores[s.id]?.[subject];
            const score = parseFloat(raw ?? '');
            return !isNaN(score) && score >= 0 && score <= 20 ? { studentId: s.id, compositionScore: score } : null;
          }).filter(Boolean),
        }});
      } else {
        toast.error(err?.message || 'Erreur lors de la sauvegarde des notes');
      }
    } finally {
      setCompGridAutoSavingSubjects((prev) => { const n = new Set(prev); n.delete(subject); return n; });
    }
  }, [selectedClassId, selectedTerm, academicYear, user]);

  const triggerCompAutoSave = useCallback((subject: string) => {
    if (compGridAutoSaveTimers.current[subject]) clearTimeout(compGridAutoSaveTimers.current[subject]);
    setCompGridSavedSubjects((prev) => { const n = new Set(prev); n.delete(subject); return n; });
    compGridAutoSaveTimers.current[subject] = setTimeout(() => {
      autoSaveCompSubject(subject, compGridStudents, compGridScoresRef.current);
    }, 1000);
  }, [autoSaveCompSubject, compGridStudents]);

  // Auto-save silencieux par matière — appelé après 1s d'inactivité sur une colonne
  const autoSaveSubject = useCallback(async (subject: string, students: BackendStudent[], scores: Record<string, Record<string, string>>) => {
    if (!selectedClassId) return;
    const token = storage.getAuthItem("structura_token");
    if (!token) return;

    const compositions = students
      .map((s) => {
        const raw = scores[s.id]?.[subject];
        if (raw === undefined || raw === "") return null;
        const score = parseFloat(raw);
        if (isNaN(score) || score < 0 || score > 10) return null;
        return { studentId: s.id, compositionScore: score };
      })
      .filter((x): x is { studentId: string; compositionScore: number } => x !== null);

    if (compositions.length === 0) return;

    setGridAutoSavingSubjects((prev) => new Set([...prev, subject]));
    try {
      await bulkSaveCompositions(token, {
        classId: selectedClassId,
        subject,
        term: selectedTerm,
        academicYear: academicYear || undefined,
        teacherName: user ? `${user.firstName} ${user.lastName}` : undefined,
        compositions,
      });
      setGridSavedSubjects((prev) => new Set([...prev, subject]));
    } catch (err: any) {
      if (!navigator.onLine || err?.message === 'Failed to fetch') {
        await syncQueue.add({ type: "composition", action: "create", data: {
          classId: selectedClassId, subject, term: selectedTerm,
          academicYear: academicYear || undefined,
          teacherName: user ? `${user.firstName} ${user.lastName}` : undefined,
          compositions: students.map((s) => {
            const raw = scores[s.id]?.[subject];
            const score = parseFloat(raw ?? '');
            return !isNaN(score) && score >= 0 && score <= 10 ? { studentId: s.id, compositionScore: score } : null;
          }).filter(Boolean),
        }});
      } else {
        toast.error(err?.message || 'Erreur lors de la sauvegarde des notes');
      }
    } finally {
      setGridAutoSavingSubjects((prev) => {
        const next = new Set(prev);
        next.delete(subject);
        return next;
      });
    }
  }, [selectedClassId, selectedTerm, academicYear, user]);

  // Déclenche le debounce auto-save quand un score de la grille change
  const triggerAutoSave = useCallback((subject: string) => {
    if (autoSaveTimers.current[subject]) clearTimeout(autoSaveTimers.current[subject]);
    setGridSavedSubjects((prev) => { const next = new Set(prev); next.delete(subject); return next; });
    autoSaveTimers.current[subject] = setTimeout(() => {
      autoSaveSubject(subject, gridStudents, gridScoresRef.current);
    }, 1000);
  }, [autoSaveSubject, gridStudents]);

  // Comp stats (mode ligne legacy — conservées pour compatibilité si réactivées)

  // ── Bulletin — rechargement via React Query ───────────────────────────────
  // loadBulletin est remplacé par refetchBulletin (useQuery ci-dessus)

  const handleToggleLock = useCallback(async () => {
    if (!selectedClassId || !academicYear) return;
    if (trimesterLock) {
      // Déverrouiller directement (pas besoin de confirmation)
      const token = storage.getAuthItem("structura_token");
      if (!token) return;
      setLockLoading(true);
      try {
        await unlockTrimester(token, selectedClassId, selectedTerm, academicYear);
        setTrimesterLock(null);
        queryClient.invalidateQueries({ queryKey: ["bulletin", user?.tenantId, selectedClassId, selectedTerm, effectiveYear] });
        toast.success("Trimestre déverrouillé — les notes peuvent à nouveau être modifiées.");
      } catch (e) {
        toast.error("Erreur lors du déverrouillage");
        console.error(e);
      } finally {
        setLockLoading(false);
      }
    } else {
      // Verrouiller → ouvrir le dialog de confirmation avec les stats
      setLockConfirmOpen(true);
    }
  }, [selectedClassId, selectedTerm, academicYear, trimesterLock, queryClient, user?.tenantId, effectiveYear]);

  const handleConfirmLock = useCallback(async () => {
    if (!selectedClassId || !academicYear) return;
    const token = storage.getAuthItem("structura_token");
    if (!token) return;
    setLockLoading(true);
    try {
      const lock = await lockTrimester(token, selectedClassId, selectedTerm, academicYear);
      setTrimesterLock(lock);
      queryClient.invalidateQueries({ queryKey: ["bulletin", user?.tenantId, selectedClassId, selectedTerm, effectiveYear] });
      toast.success("Trimestre verrouillé — vous pouvez maintenant générer les bulletins.");
    } catch (e) {
      toast.error("Erreur lors du verrouillage");
      console.error(e);
    } finally {
      setLockLoading(false);
    }
  }, [selectedClassId, selectedTerm, academicYear, queryClient, user?.tenantId, effectiveYear]);

  // ── Configuration tab ─────────────────────────────────────────────────────
  // loadConfigSubjects est remplacé par refetchConfigSubjects (useQuery ci-dessus)
  // configSubjects est initialisé via le useEffect de sync sur configSubjectsData

  const saveConfig = useCallback(async () => {
    if (!configClassId) return;
    const token = storage.getAuthItem("structura_token");
    if (!token) return;
    setConfigSaving(true);
    try {
      const activeSubjects = configSubjects
        .filter((s) => s.enabled)
        .map((s, i) => ({ name: s.name, coefficient: s.coefficient, order: i }));
      await saveClassSubjects(token, configClassId, activeSubjects);
      const cls = classes.find((c) => c.id === configClassId);
      toast.success(`Matières de ${cls?.name ?? "la classe"} enregistrées`);
      queryClient.invalidateQueries({ queryKey: ["config-subjects", user?.tenantId, configClassId] });
      queryClient.invalidateQueries({ queryKey: ["class-subjects", user?.tenantId, configClassId] });
      // Fermer le panel après enregistrement
      setConfigClassId("");
      setConfigSubjects([]);
      setNewSubjectName("");
      setNewSubjectCoeff(1);
    } catch (e: unknown) {
      toast.error("Erreur lors de l'enregistrement: " + (e instanceof Error ? e.message : "Erreur inconnue"));
    } finally {
      setConfigSaving(false);
    }
  }, [configClassId, configSubjects, classes]);

  // Auto-chargement bulletin : géré par le `enabled` de useQuery (activeTab === "bulletin")

  // ── PDF generation ────────────────────────────────────────────────────────

  const generateStudentBulletin = useCallback(async (
    studentRow: ClassReport["students"][number],
    mode: "download" | "print" = "download",
  ) => {
    const token = storage.getAuthItem("structura_token");
    if (!token) return;
    try {
      const report = await getStudentReport(token, studentRow.student.id, selectedTerm, academicYear);
      const reportScoreMax = report.scoreMax ?? (isPrimaryClass ? 10 : 20);
      const bulletinData: BulletinData = {
        studentName: `${studentRow.student.firstName} ${studentRow.student.lastName}`,
        matricule: studentRow.student.matricule,
        className: bulletinReport?.class?.name
          ? formatClassName(bulletinReport.class.name, bulletinReport.class.section)
          : "",
        trimester: selectedTerm,
        academicYear: academicYear,
        schoolName: user?.schoolName || undefined,
        schoolLogo: user?.schoolLogo ?? undefined,
        grades: report.subjects.map((s) => ({
          subject: s.subject,
          score: s.averageSubject,
          maxScore: reportScoreMax,
          coefficient: s.coefficient,
          teacherName: s.teacherName,
        })),
        weightedAvg: report.generalAverage,
        maxScore: reportScoreMax,
        classAvg: bulletinReport?.classAverage,
        classRank: studentRow.rank,
        totalStudents: bulletinReport?.totalStudents,
        gender: studentRow.student.gender,
      };
      if (mode === "print") printBulletinPDF(bulletinData);
      else generateBulletinPDF(bulletinData);
    } catch (err: unknown) {
      toast.error("Erreur génération bulletin: " + (err instanceof Error ? err.message : "Erreur inconnue"));
    }
  }, [selectedTerm, academicYear, bulletinReport, user]);

  const generateAllBulletins = useCallback(async (mode: "download" | "print" = "download") => {
    if (!bulletinReport) return;
    setIsGeneratingPDF(true);
    const token = storage.getAuthItem("structura_token");
    if (!token) return;
    try {
      const allData: BulletinData[] = [];
      for (const studentRow of bulletinReport.students) {
        try {
          const report = await getStudentReport(token, studentRow.student.id, selectedTerm, academicYear);
          const rScoreMax = report.scoreMax ?? (isPrimaryClass ? 10 : 20);
          allData.push({
            studentName: `${studentRow.student.firstName} ${studentRow.student.lastName}`,
            matricule: studentRow.student.matricule,
            className: bulletinReport.class?.name
              ? formatClassName(bulletinReport.class.name, bulletinReport.class.section)
              : "",
            trimester: selectedTerm,
            academicYear,
            schoolName: user?.schoolName || undefined,
            schoolLogo: user?.schoolLogo ?? undefined,
            grades: report.subjects.map((s) => ({
              subject: s.subject,
              score: s.averageSubject,
              maxScore: rScoreMax,
              coefficient: s.coefficient,
              teacherName: s.teacherName,
            })),
            weightedAvg: report.generalAverage,
            maxScore: rScoreMax,
            classAvg: bulletinReport.classAverage,
            classRank: studentRow.rank,
            totalStudents: bulletinReport.totalStudents,
            gender: studentRow.student.gender,
          });
        } catch { /* élève sans notes, skip */ }
      }
      const className = bulletinReport.class?.name
        ? formatClassName(bulletinReport.class.name, bulletinReport.class.section)
        : "";
      if (allData.length === 0) {
        toast.warning("Aucun élève n'a encore de notes pour ce trimestre. Impossible de générer les bulletins.");
        return;
      }
      if (mode === "print") printAllBulletinsPDF(allData, className);
      else generateAllBulletinsPDF(allData, className, selectedTerm);
      toast.success(`${allData.length} bulletin(s) ${mode === "print" ? "envoyés à l'impression" : "téléchargés"}`);
    } catch (err: unknown) {
      toast.error("Erreur: " + (err instanceof Error ? err.message : "Erreur inconnue"));
    } finally {
      setIsGeneratingPDF(false);
    }
  }, [bulletinReport, selectedTerm, academicYear, user]);

  // Collect all subjects from bulletin
  const bulletinSubjects = bulletinReport
    ? Array.from(
        new Set(
          bulletinReport.students.flatMap((s) => {
            // subjects come from StudentReport.subjects — but ClassReport.students only has student+avg+rank
            // We need subjects from getClassReport — check the type
            return [];
          })
        )
      )
    : [];
  // Actually ClassReport doesn't embed per-subject data in students array — it only has generalAverage
  // We collect subjects from the sheetSubject opening
  void bulletinSubjects;

  // ── Sheet: subject detail ─────────────────────────────────────────────────

  const [sheetData, setSheetData] = useState<Array<{
    student: { id: string; firstName: string; lastName: string; matricule: string };
    averageCourse: number | null;
    compositionScore: number | null;
    averageSubject: number | null;
  }>>([]);
  const [sheetLoading, setSheetLoading] = useState(false);

  const openSubjectSheet = useCallback(async (subject: string) => {
    if (!selectedClassId || !academicYear) return;
    const token = storage.getAuthItem("structura_token");
    if (!token) return;

    setSheetSubject(subject);
    setSheetOpen(true);
    setSheetLoading(true);
    try {
      const [evals, comps, students] = await Promise.all([
        getEvaluations(token, { classId: selectedClassId, subject, term: selectedTerm, academicYear: effectiveYear }),
        getCompositions(token, { classId: selectedClassId, subject, term: selectedTerm, academicYear: effectiveYear }),
        getStudents(token, { classId: selectedClassId }),
      ]);

      // Build per-student data
      const evalsByStudent: Record<string, number[]> = {};
      for (const ev of evals) {
        if (!evalsByStudent[ev.studentId]) evalsByStudent[ev.studentId] = [];
        evalsByStudent[ev.studentId].push(ev.score);
      }
      const compByStudent: Record<string, number> = {};
      for (const c of comps) {
        compByStudent[c.studentId] = c.compositionScore;
      }

      const rows = students.map((s) => {
        const scores = evalsByStudent[s.id];
        const avgCourse =
          scores && scores.length > 0
            ? scores.reduce((a, b) => a + b, 0) / scores.length
            : null;
        const compScore = compByStudent[s.id] ?? null;
        // Primaire : pas d'évaluations mensuelles → la note de composition est la moyenne de matière
        // Secondaire : (cours + composition) / 2
        const avgSubject = isPrimaryClass
          ? compScore
          : avgCourse !== null && compScore !== null
            ? (avgCourse + compScore) / 2
            : null;
        return {
          student: {
            id: s.id,
            firstName: s.firstName,
            lastName: s.lastName,
            matricule: s.matricule,
          },
          averageCourse: avgCourse,
          compositionScore: compScore,
          averageSubject: avgSubject,
        };
      });

      setSheetData(rows);
    } catch (e) {
      toast.error("Erreur lors du chargement du détail matière");
      console.error(e);
    } finally {
      setSheetLoading(false);
    }
  }, [selectedClassId, selectedTerm, academicYear]);

  // ── Shared filter bar ─────────────────────────────────────────────────────

  // Pour le primaire : pas d'évaluations, rediriger vers compositions
  useEffect(() => {
    if (isPrimaryClass && activeTab === "evaluations") {
      setActiveTab("compositions");
    }
  }, [isPrimaryClass, activeTab]);

  // Rebuild evalGridScores uniquement quand le MOIS change (switching onglet mois = instantané)
  // evalGridAllEvals intentionnellement absent des deps : les mises à jour du cache
  // lors des auto-saves ne doivent PAS écraser les saisies en cours de l'utilisateur.
  useEffect(() => {
    if (isPrimaryClass || evalGridStudents.length === 0 || !evalMonth || subjectOptions.length === 0) return;
    // Annuler les timers de l'ANCIEN mois avant de changer — évite la corruption :
    // un timer du mois précédent lirait evalGridScoresRef.current (nouveau mois) et
    // sauvegarderait les mauvaises notes sous l'ancien mois.
    Object.values(evalGridAutoSaveTimers.current).forEach(clearTimeout);
    evalGridAutoSaveTimers.current = {};
    const scores = buildEvalGridScores(evalMonth, evalGridAllEvals, evalGridStudents, subjectOptions);
    setEvalGridScores(scores);
    evalGridScoresRef.current = scores;
    setEvalGridSavedSubjects(new Set());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evalMonth, evalGridStudents.length, subjectOptions.join(','), isPrimaryClass]);

  // Auto-présélectionner le mois actuel quand la grille eval est chargée
  useEffect(() => {
    if (isPrimaryClass || !selectedClassId || subjectOptions.length === 0) return;
    if (!evalMonth && termMonths.length > 0) {
      const currentMonthName = MONTHS[new Date().getMonth()];
      const autoMonth = termMonths.includes(currentMonthName) ? currentMonthName : termMonths[0];
      setEvalMonth(autoMonth);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPrimaryClass, selectedClassId, selectedTerm, subjectOptions.join(',')]);

  // ── Polling toutes les 60s — synchronisation en temps réel directeur ↔ prof ──
  // React Query gère le refetch via `enabled`, on utilise refetch pour forcer le rechargement périodique.
  useEffect(() => {
    if (!selectedClassId || subjectOptions.length === 0) return;
    const interval = setInterval(() => {
      const hasPendingTimers =
        Object.keys(evalGridAutoSaveTimers.current).length > 0 ||
        Object.keys(autoSaveTimers.current).length > 0 ||
        Object.keys(compGridAutoSaveTimers.current).length > 0;
      if (hasPendingTimers) return;
      if (!isPrimaryClass && evalGridStudents.length > 0) {
        refetchEvalGrid();
      } else if (!isPrimaryClass && compGridStudents.length > 0) {
        refetchCompGrid();
      } else if (isPrimaryClass && gridStudents.length > 0) {
        refetchPrimaryGrid();
      }
    }, 60_000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClassId, selectedTerm, subjectOptions.join(','), isPrimaryClass]);

  // Synchroniser la matière active mobile quand les matières changent
  useEffect(() => {
    if (subjectOptions.length > 0 && !subjectOptions.includes(mobileActiveSub)) {
      setMobileActiveSub(subjectOptions[0]);
    }
    if (subjectOptions.length > 0 && !subjectOptions.includes(mobileActiveSubComp)) {
      setMobileActiveSubComp(subjectOptions[0]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectOptions.join(',')]);

  // Reset rapport annuel quand la classe change
  useEffect(() => { setAnnualReport(null); }, [selectedClassId, academicYear]);

  const loadAnnualReport = useCallback(async (studentId: string) => {
    const token = storage.getAuthItem("structura_token");
    if (!token) return;
    setAnnualLoading(true);
    try {
      const report = await getAnnualReport(token, studentId, academicYear || undefined);
      setAnnualReport(report);
    } catch {
      toast.error("Rapport annuel non disponible (tous les trimestres doivent avoir des notes)");
    } finally {
      setAnnualLoading(false);
    }
  }, [academicYear]);

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50/50">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="bg-white border-b px-6 py-5 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-100 rounded-lg">
            <BookOpen className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Notes &amp; Évaluations</h1>
            <p className="text-sm text-gray-500">
              Gestion des notes mensuelles, compositions et bulletins
            </p>
          </div>
        </div>
        {academicYear && (
          <Badge variant="outline" className="self-start sm:self-auto text-indigo-600 border-indigo-200 bg-indigo-50">
            <GraduationCap className="w-3.5 h-3.5 mr-1.5" />
            {academicYear}
          </Badge>
        )}
      </div>

      <div className="px-4 sm:px-6 py-6 max-w-screen-xl mx-auto space-y-6">
        {/* ── Shared filters ──────────────────────────────────────────────── */}
        <Card>
          <CardContent className="pt-4 pb-4">
            {/* Sélecteur d'année archivée */}
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Filtres</span>
              <div className="flex items-center gap-2">
                {selectedYearObj?.isArchived && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-500 border border-gray-200">
                    <Archive className="h-3 w-3" />
                    Archive — {selectedYear}
                  </span>
                )}
                <YearSelector
                  value={selectedYear || academicYear}
                  onChange={(yr, yearObj) => {
                    setSelectedYear(yr === academicYear ? "" : yr);
                    setSelectedYearObj(yr === academicYear ? null : yearObj);
                  }}
                  className="w-36"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {/* Classe */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">
                  Classe
                </label>
                {classesLoading && classes.length === 0 ? (
                  <Skeleton className="h-10 w-full rounded-md" />
                ) : (
                  <Select
                    value={selectedClassId}
                    onValueChange={(v) => {
                      setSelectedClassId(v);
                      setBulletinReport(null);
                      setTrimesterLock(null);
                    }}
                  >
                    <SelectTrigger className="bg-white">
                      <SelectValue placeholder="Sélectionner une classe" />
                    </SelectTrigger>
                    <SelectContent>
                      {classes.length === 0 && (
                        <SelectItem value="__none" disabled>
                          Aucune classe disponible
                        </SelectItem>
                      )}
                      {classes.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {formatClassName(c.name, c.section)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {/* Trimestre */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">
                  Trimestre
                </label>
                <Select
                  value={selectedTerm}
                  onValueChange={(v) => {
                    setSelectedTerm(v as Term);
                    setBulletinReport(null);
                    setTrimesterLock(null);
                  }}
                >
                  <SelectTrigger className="bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TERMS.map((t) => (
                      <SelectItem key={t} value={t}>
                        <span className="flex items-center gap-2 flex-wrap">
                          {t}
                          {getTermMonths(startMonth, durationMonths, t).length > 0 && (
                            <span className="hidden sm:inline text-gray-400 text-xs">
                              ({getTermMonths(startMonth, durationMonths, t).join(", ")})
                            </span>
                          )}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Info classe */}
              {selectedClass && (
                <div className="flex items-end">
                  <div className="px-3 py-2 bg-indigo-50 rounded-md text-sm text-indigo-700 flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    <span className="font-medium">{formatClassName(selectedClass.name, selectedClass.section)}</span>
                    {isPrimaryClass && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">Primaire /10</span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Affichage des professeurs par matière (directeur uniquement) */}
            {isDirector && selectedClassId && Object.keys(subjectTeacherMap).length > 0 && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                  Professeurs affectés
                </p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(subjectTeacherMap).map(([subj, teacher]) => (
                    <span
                      key={subj}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs bg-white border border-indigo-100 rounded-full text-gray-700"
                    >
                      <span className="font-medium text-indigo-700">{subj}</span>
                      <span className="text-gray-400">·</span>
                      <span>{teacher}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Tabs ────────────────────────────────────────────────────────── */}
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as typeof activeTab)}
        >
          <div className="overflow-x-auto pb-0.5">
          <TabsList className="bg-gray-100 border border-gray-200 shadow-sm p-1 gap-0.5 w-max min-w-full">
            {/* Évaluations : cachées pour le primaire (pas de notes mensuelles) */}
            {!isPrimaryClass && (
              <TabsTrigger value="evaluations" className="flex items-center gap-1.5">
                <BarChart3 className="w-4 h-4" />
                <span className="hidden sm:inline">Évaluations</span>
              </TabsTrigger>
            )}
            <TabsTrigger value="compositions" className="flex items-center gap-1.5">
              <FileText className="w-4 h-4" />
              <span className="hidden sm:inline">Compositions</span>
            </TabsTrigger>
            {/* Bulletin et Configuration : directeur uniquement */}
            {isDirector && (
              <>
                <TabsTrigger value="bulletin" className="flex items-center gap-1.5">
                  <BookOpen className="w-4 h-4" />
                  <span className="hidden sm:inline">Bulletin</span>
                </TabsTrigger>
                <TabsTrigger value="configuration" className="flex items-center gap-1.5">
                  <Settings2 className="w-4 h-4" />
                  <span className="hidden sm:inline">Configuration</span>
                </TabsTrigger>
              </>
            )}
          </TabsList>
          </div>

          {/* ══════════════════════════════════════════════════════════════ */}
          {/* TAB 1 — EVALUATIONS (professeur uniquement)                   */}
          {/* ══════════════════════════════════════════════════════════════ */}
          <TabsContent value="evaluations" className="mt-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-indigo-500" />
                    Notes mensuelles
                    <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-medium">/20</span>
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        // Annuler les timers avant rechargement
                        Object.values(evalGridAutoSaveTimers.current).forEach(clearTimeout);
                        evalGridAutoSaveTimers.current = {};
                        refetchEvalGrid();
                      }}
                      disabled={evalGridLoading || !selectedClassId}
                    >
                      {evalGridLoading ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1.5" />}
                      Recharger
                    </Button>
                    {canSaveGrades && (
                      <Button
                        size="sm"
                        onClick={() => saveEvalGrid(subjectOptions, evalMonth, evalGridScores)}
                        disabled={!evalMonth || evalGridStudents.length === 0}
                        className="bg-indigo-600 hover:bg-indigo-700"
                      >
                        <Save className="w-4 h-4 mr-1.5" />
                        Enregistrer tout
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {!selectedClassId ? (
                  <EmptyState message="Sélectionnez une classe pour commencer" />
                ) : subjectOptions.length === 0 ? (
                  <EmptyState message="Aucune matière configurée pour cette classe" />
                ) : (
                  <>
                    {/* Onglets mois avec complétion + synthèse */}
                    <div className="flex flex-wrap gap-1.5">
                      {termMonths.map((month) => {
                        const studentIds = new Set(evalGridStudents.map((s) => s.id));
                        const { filled, total } = getMonthCompletion(month, evalGridAllEvals, studentIds, subjectOptions);
                        const isComplete = total > 0 && filled === total;
                        const isActive = evalMonth === month;
                        return (
                          <button
                            key={month}
                            onClick={() => setEvalMonth(month)}
                            className={`flex items-center gap-1 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg border text-xs sm:text-sm font-medium transition-all ${
                              isActive
                                ? 'bg-indigo-600 text-white border-indigo-600 shadow-md'
                                : isComplete
                                ? 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100'
                                : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                            }`}
                          >
                            {isComplete && !isActive && <CheckCircle className="w-3.5 h-3.5" />}
                            {month}
                            {total > 0 && (
                              <span className={`text-xs ${isActive ? 'text-indigo-200' : isComplete ? 'text-green-500' : 'text-gray-400'}`}>
                                {filled === total ? '✓' : `${filled} / ${total} él.`}
                              </span>
                            )}
                          </button>
                        );
                      })}
                      {/* Bouton synthèse cours */}
                      {evalGridStudents.length > 0 && evalGridAllEvals.length > 0 && (
                        <button
                          onClick={() => setEvalMonth('__synthese__')}
                          className={`flex items-center gap-1 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg border text-xs sm:text-sm font-medium transition-all ${
                            evalMonth === '__synthese__'
                              ? 'bg-amber-500 text-white border-amber-500 shadow-md'
                              : 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100'
                          }`}
                        >
                          <BarChart3 className="w-3.5 h-3.5" />
                          Moy. cours
                        </button>
                      )}
                    </div>

                    {/* Indicateurs par matière */}
                    {evalMonth && evalGridStudents.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {subjectOptions.map((sub) => {
                          const filled = evalGridStudents.filter((s) => {
                            const raw = evalGridScores[s.id]?.[sub];
                            return raw !== undefined && raw !== '' && !isNaN(parseFloat(raw));
                          }).length;
                          const total = evalGridStudents.length;
                          const isSaved = evalGridSavedSubjects.has(sub);
                          const isAutoSaving = evalGridAutoSavingSubjects.has(sub);
                          return (
                            <div
                              key={sub}
                              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium ${
                                isSaved ? 'bg-green-50 border-green-200 text-green-700'
                                : isAutoSaving ? 'bg-blue-50 border-blue-200 text-blue-600'
                                : filled === total ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                                : 'bg-gray-50 border-gray-200 text-gray-600'
                              }`}
                            >
                              {isAutoSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                : isSaved ? <CheckCircle className="w-3.5 h-3.5" /> : null}
                              <span>{sub}</span>
                              <span className="text-gray-400">·</span>
                              <span>{filled === total && total > 0 ? '✓' : `${filled} / ${total} él.`}</span>
                              {filled > 0 && (
                                <div className="w-12 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full transition-all ${filled === total ? 'bg-indigo-500' : 'bg-amber-400'}`}
                                    style={{ width: `${Math.round((filled / total) * 100)}%` }}
                                  />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Grille */}
                    {evalGridLoading ? (
                      <SkeletonTable rows={8} cols={Math.min(subjectOptions.length + 2, 7)} />
                    ) : !evalMonth ? (
                      <EmptyState message="Sélectionnez un mois ci-dessus" />
                    ) : evalGridStudents.length === 0 ? (
                      <EmptyState message="Aucun élève dans cette classe" />
                    ) : evalMonth === '__synthese__' ? (
                      /* ── Vue synthèse : moyenne cours par élève × matière ── */
                      <div className="rounded-lg border overflow-hidden">
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead className="bg-amber-50 border-b">
                              <tr>
                                <th className="text-left px-3 py-3 font-medium text-gray-600 w-8 sticky left-0 bg-amber-50 z-10">#</th>
                                <th className="text-left px-3 py-3 font-medium text-gray-600 min-w-[120px] sm:min-w-[160px] sticky left-8 bg-amber-50 z-10">Élève</th>
                                {subjectOptions.map((sub) => {
                                  const coeff = subjectCoeffMap[sub];
                                  return (
                                    <th key={sub} className="text-center px-2 py-3 font-medium text-gray-600 min-w-[80px] sm:min-w-[90px]">
                                      <div className="flex flex-col items-center gap-0.5">
                                        <span className="truncate max-w-[80px]" title={sub}>{sub}</span>
                                        <span className="text-[10px] text-gray-400 font-normal">moy. /20</span>
                                        {coeff !== undefined && (
                                          <span className={`text-[10px] font-semibold px-1 rounded ${coeff === 0 ? 'text-gray-400' : 'text-indigo-600'}`}>×{coeff}</span>
                                        )}
                                      </div>
                                    </th>
                                  );
                                })}
                                <th className="text-center px-3 py-3 font-medium text-gray-600 min-w-[70px] sticky right-0 bg-amber-50 z-10 shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.06)]">Moy. cours</th>
                              </tr>
                            </thead>
                            <tbody>
                              {evalGridStudents.map((student, idx) => {
                                // Moyennes par matière pour cet élève (tous mois du trimestre)
                                const subAvgs: Record<string, number | null> = {};
                                for (const sub of subjectOptions) {
                                  const scores = evalGridAllEvals
                                    .filter((e) => e.studentId === student.id && e.subject === sub)
                                    .map((e) => e.score);
                                  subAvgs[sub] = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
                                }
                                // Moyenne cours pondérée (fallback simple si tous coeffs = 0)
                                const hasCoeffs = subjectOptions.some((s) => subjectCoeffMap[s] !== undefined);
                                let tp = 0, tc = 0;
                                for (const sub of subjectOptions) {
                                  const coeff = hasCoeffs ? (subjectCoeffMap[sub] ?? 1) : 1;
                                  if (coeff === 0) continue;
                                  const avg = subAvgs[sub];
                                  if (avg === null) continue;
                                  tp += avg * coeff; tc += coeff;
                                }
                                // Fallback : moyenne simple si aucun coeff valide
                                if (tc === 0) {
                                  const validAvgs = subjectOptions.map((s) => subAvgs[s]).filter((v): v is number => v !== null);
                                  if (validAvgs.length > 0) { tp = validAvgs.reduce((a, b) => a + b, 0); tc = validAvgs.length; }
                                }
                                const globalAvg = tc > 0 ? tp / tc : null;
                                return (
                                  <tr key={student.id} className={`border-b last:border-0 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                                    <td className={`px-3 py-2 text-gray-400 text-xs sticky left-0 z-10 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>{idx + 1}</td>
                                    <td className={`px-3 py-2 font-medium text-gray-800 sticky left-8 z-10 max-w-[120px] sm:max-w-none truncate ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                                      {student.firstName} {student.lastName}
                                    </td>
                                    {subjectOptions.map((sub) => {
                                      const avg = subAvgs[sub];
                                      const monthScores = evalGridAllEvals
                                        .filter((e) => e.studentId === student.id && e.subject === sub);
                                      return (
                                        <td key={sub} className="px-2 py-2 text-center">
                                          {avg !== null ? (
                                            <div className="flex flex-col items-center gap-0.5">
                                              <span className={`font-semibold text-sm ${avgColor(avg, 20)}`}>{avg.toFixed(2)}</span>
                                              <span className="text-[10px] text-gray-400">{monthScores.length} mois</span>
                                            </div>
                                          ) : (
                                            <span className="text-gray-300">—</span>
                                          )}
                                        </td>
                                      );
                                    })}
                                    <td className={`px-3 py-2 text-center sticky right-0 z-10 shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.06)] ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                                      <span className={`font-bold text-sm ${avgColor(globalAvg, 20)}`}>
                                        {globalAvg !== null ? globalAvg.toFixed(2) : '—'}
                                      </span>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                        <div className="bg-amber-50 border-t px-4 py-3 flex flex-wrap gap-4 text-sm">
                          <div className="flex items-center gap-2">
                            <span className="text-gray-500">Trimestre :</span>
                            <span className="font-semibold text-amber-700">{selectedTerm}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-gray-500">Mois saisis :</span>
                            <span className="font-semibold text-amber-700">{termMonths.filter((m) => {
                              const studentIds = new Set(evalGridStudents.map((s) => s.id));
                              const { filled } = getMonthCompletion(m, evalGridAllEvals, studentIds, subjectOptions);
                              return filled > 0;
                            }).length} / {termMonths.length}</span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-lg border overflow-hidden">

                        {/* ── VUE MOBILE : une matière à la fois ── */}
                        <div className="block sm:hidden">
                          {/* Sélecteur de matière */}
                          <div className="flex overflow-x-auto gap-2 p-3 border-b bg-gray-50 scrollbar-none">
                            {subjectOptions.map((sub) => {
                              const filledCount = evalGridStudents.filter((s) => {
                                const raw = evalGridScores[s.id]?.[sub];
                                return raw !== undefined && raw !== '' && !isNaN(parseFloat(raw));
                              }).length;
                              const isActive = mobileActiveSub === sub;
                              const isSaved = evalGridSavedSubjects.has(sub);
                              return (
                                <button
                                  key={sub}
                                  onClick={() => setMobileActiveSub(sub)}
                                  className={`shrink-0 flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                                    isActive
                                      ? 'bg-indigo-600 text-white border-indigo-600 shadow'
                                      : isSaved
                                      ? 'bg-green-50 border-green-200 text-green-700'
                                      : 'bg-white border-gray-200 text-gray-600'
                                  }`}
                                >
                                  <span className="max-w-[70px] truncate">{sub}</span>
                                  <span className={`text-[10px] ${isActive ? 'text-indigo-200' : 'text-gray-400'}`}>
                                    {filledCount}/{evalGridStudents.length}
                                  </span>
                                </button>
                              );
                            })}
                          </div>

                          {/* Matière active + coeff */}
                          {mobileActiveSub && (
                            <div className="px-3 py-2 bg-indigo-50 border-b flex items-center justify-between">
                              <span className="font-semibold text-indigo-700 text-sm">{mobileActiveSub}</span>
                              <span className="text-xs text-gray-500">
                                {subjectCoeffMap[mobileActiveSub] !== undefined
                                  ? `Coeff ×${subjectCoeffMap[mobileActiveSub]}`
                                  : ''} · /20
                              </span>
                            </div>
                          )}

                          {/* Liste élèves */}
                          <div className="divide-y">
                            {evalGridStudents.map((student, idx) => {
                              const raw = evalGridScores[student.id]?.[mobileActiveSub] ?? '';
                              const val = raw !== '' ? parseFloat(raw) : null;
                              const isInvalid = val !== null && (isNaN(val) || val < 0 || val > 20);
                              return (
                                <div
                                  key={student.id}
                                  className={`flex items-center justify-between px-3 py-3 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}
                                >
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className="text-xs text-gray-400 w-5 shrink-0">{idx + 1}</span>
                                    <span className="font-medium text-gray-800 text-sm truncate">
                                      {student.firstName} {student.lastName}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                                    {canSaveGrades ? (
                                      <Input
                                        type="number"
                                        inputMode="decimal"
                                        min={0}
                                        max={20}
                                        step={0.25}
                                        value={raw}
                                        disabled={isLocked}
                                        onChange={(e) => {
                                          const value = e.target.value;
                                          const sid = student.id;
                                          setEvalGridScores((prev) => {
                                            const updated = { ...prev, [sid]: { ...prev[sid], [mobileActiveSub]: value } };
                                            evalGridScoresRef.current = updated;
                                            return updated;
                                          });
                                          triggerEvalAutoSave(mobileActiveSub, evalMonth);
                                        }}
                                        placeholder="—"
                                        className={`w-20 h-12 text-center text-lg font-semibold ${isInvalid ? 'border-red-400 focus:ring-red-400' : ''}`}
                                      />
                                    ) : (
                                      <span className={`text-lg font-semibold w-20 text-center ${val !== null ? avgColor(val, 20) : 'text-gray-300'}`}>
                                        {val !== null ? val : '—'}
                                      </span>
                                    )}
                                    <span className="text-xs text-gray-400">/20</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* ── VUE DESKTOP : grille complète ── */}
                        <div className="hidden sm:block overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead className="bg-gray-50 border-b">
                              <tr>
                                <th className="text-left px-3 py-3 font-medium text-gray-600 w-8 sticky left-0 bg-gray-50 z-10">#</th>
                                <th className="text-left px-3 py-3 font-medium text-gray-600 min-w-[120px] sm:min-w-[160px] sticky left-8 bg-gray-50 z-10">Élève</th>
                                {subjectOptions.map((sub) => {
                                  const coeff = subjectCoeffMap[sub];
                                  return (
                                    <th key={sub} className="text-center px-2 py-3 font-medium text-gray-600 min-w-[80px] sm:min-w-[90px]">
                                      <div className="flex flex-col items-center gap-0.5">
                                        <span className="truncate max-w-[80px]" title={sub}>{sub}</span>
                                        <span className="text-[10px] text-gray-400 font-normal">/20</span>
                                        {coeff !== undefined && (
                                          <span className={`text-[10px] font-semibold px-1 rounded ${coeff === 0 ? 'text-gray-400' : 'text-indigo-600'}`}>
                                            ×{coeff}
                                          </span>
                                        )}
                                      </div>
                                    </th>
                                  );
                                })}
                                <th className="text-center px-3 py-3 font-medium text-gray-600 min-w-[70px] sticky right-0 bg-gray-50 z-10 shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.06)]">Moy.</th>
                              </tr>
                            </thead>
                            <tbody>
                              {evalGridStudents.map((student, idx) => {
                                let rowAvg: number | null = null;
                                const hasCoeffsE = subjectOptions.some((s) => subjectCoeffMap[s] !== undefined);
                                const simpleAvgE = () => { const ss = subjectOptions.map((sub) => { const raw = evalGridScores[student.id]?.[sub]; if (!raw || raw === '') return null; const v = parseFloat(raw); return !isNaN(v) && v >= 0 && v <= 20 ? v : null; }).filter((n): n is number => n !== null); return ss.length > 0 ? ss.reduce((a, b) => a + b, 0) / ss.length : null; };
                                if (hasCoeffsE) {
                                  let tp = 0, tc = 0;
                                  for (const sub of subjectOptions) {
                                    const coeff = subjectCoeffMap[sub] ?? 1;
                                    if (coeff === 0) continue;
                                    const raw = evalGridScores[student.id]?.[sub];
                                    if (!raw || raw === '') continue;
                                    const v = parseFloat(raw);
                                    if (isNaN(v) || v < 0 || v > 20) continue;
                                    tp += v * coeff; tc += coeff;
                                  }
                                  rowAvg = tc > 0 ? tp / tc : simpleAvgE();
                                } else {
                                  rowAvg = simpleAvgE();
                                }
                                return (
                                  <tr
                                    key={student.id}
                                    className={`border-b last:border-0 hover:bg-indigo-50/30 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}
                                  >
                                    <td className={`px-3 py-2 text-gray-400 text-xs sticky left-0 z-10 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>{idx + 1}</td>
                                    <td className={`px-3 py-2 font-medium text-gray-800 sticky left-8 z-10 max-w-[120px] sm:max-w-none truncate ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                                      {student.firstName} {student.lastName}
                                    </td>
                                    {subjectOptions.map((sub) => {
                                      const raw = evalGridScores[student.id]?.[sub] ?? '';
                                      const val = raw !== '' ? parseFloat(raw) : null;
                                      const isInvalid = val !== null && (isNaN(val) || val < 0 || val > 20);
                                      return (
                                        <td key={sub} className="px-1 py-2 text-center">
                                          <Input
                                            type="number"
                                            inputMode="decimal"
                                            min={0}
                                            max={20}
                                            step={0.25}
                                            value={raw}
                                            disabled={isLocked}
                                            onChange={(e) => {
                                              const value = e.target.value;
                                              const sid = student.id;
                                              setEvalGridScores((prev) => {
                                                const updated = { ...prev, [sid]: { ...prev[sid], [sub]: value } };
                                                evalGridScoresRef.current = updated;
                                                return updated;
                                              });
                                              triggerEvalAutoSave(sub, evalMonth);
                                            }}
                                            placeholder="—"
                                            className={`w-20 h-9 text-center font-medium mx-auto text-sm ${isInvalid ? 'border-red-400 focus:ring-red-400' : ''}`}
                                          />
                                        </td>
                                      );
                                    })}
                                    <td className={`px-3 py-2 text-center sticky right-0 z-10 shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.06)] ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                                      <span className={`font-semibold text-sm ${avgColor(rowAvg, 20)}`}>
                                        {rowAvg !== null ? rowAvg.toFixed(2) : '—'}
                                      </span>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>

                        <div className="bg-indigo-50 border-t px-4 py-3 flex flex-wrap gap-4 text-sm">
                          <div className="flex items-center gap-2">
                            <span className="text-gray-500">Mois :</span>
                            <span className="font-semibold text-indigo-700">{evalMonth}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-gray-500">Élèves :</span>
                            <span className="font-semibold text-indigo-700">{evalGridStudents.length}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-gray-500">Matières :</span>
                            <span className="font-semibold text-indigo-700">{subjectOptions.length}</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ══════════════════════════════════════════════════════════════ */}
          {/* TAB 2 — COMPOSITIONS                                          */}
          {/* ══════════════════════════════════════════════════════════════ */}
          <TabsContent value="compositions" className="mt-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <FileText className="w-4 h-4 text-indigo-500" />
                    Compositions de fin de trimestre
                    {isPrimaryClass && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">/10</span>
                    )}
                  </CardTitle>
                  {isPrimaryClass && (
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          Object.values(autoSaveTimers.current).forEach(clearTimeout);
                          autoSaveTimers.current = {};
                          queryClient.removeQueries({ queryKey: ["primary-grid", user?.tenantId] });
                          refetchPrimaryGrid().then((result) => {
                            if (result.data) {
                              setGridStudents(result.data.students);
                              setGridScores(result.data.scores);
                              gridScoresRef.current = result.data.scores;
                              setGridSavedSubjects(new Set());
                            }
                          });
                        }}
                        disabled={gridLoading || !selectedClassId}
                      >
                        {gridLoading ? (
                          <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                        ) : (
                          <RefreshCw className="w-4 h-4 mr-1.5" />
                        )}
                        Recharger
                      </Button>
                      {canSaveGrades && (
                        <Button
                          size="sm"
                          onClick={() => savePrimaryGrid(subjectOptions)}
                          disabled={gridSaving || gridStudents.length === 0}
                          className="bg-indigo-600 hover:bg-indigo-700"
                        >
                          {gridSaving ? (
                            <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                          ) : (
                            <Save className="w-4 h-4 mr-1.5" />
                          )}
                          Enregistrer tout
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">

                {/* ── GRILLE UNIFIÉE PRIMAIRE ─────────────────────────────── */}
                {isPrimaryClass ? (
                  <>
                    {!selectedClassId ? (
                      <EmptyState message="Sélectionnez une classe pour commencer" />
                    ) : subjectOptions.length === 0 ? (
                      <EmptyState message="Aucune matière configurée pour cette classe" />
                    ) : gridLoading ? (
                      <SkeletonTable rows={8} cols={Math.min(subjectOptions.length + 2, 7)} />
                    ) : gridStudents.length === 0 ? (
                      <EmptyState message="Chargement de la grille…" />
                    ) : (
                      <>
                        {/* Indicateurs de progression par matière */}
                        <div className="flex flex-wrap gap-2">
                          {subjectOptions.map((sub) => {
                            const filled = gridStudents.filter((s) => {
                              const raw = gridScores[s.id]?.[sub];
                              return raw !== undefined && raw !== "" && !isNaN(parseFloat(raw));
                            }).length;
                            const total = gridStudents.length;
                            const pct = Math.round((filled / total) * 100);
                            const isSaved = gridSavedSubjects.has(sub);
                            const isAutoSaving = gridAutoSavingSubjects.has(sub);
                            return (
                              <div
                                key={sub}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium ${
                                  isSaved
                                    ? "bg-green-50 border-green-200 text-green-700"
                                    : isAutoSaving
                                    ? "bg-blue-50 border-blue-200 text-blue-600"
                                    : filled === total
                                    ? "bg-indigo-50 border-indigo-200 text-indigo-700"
                                    : "bg-gray-50 border-gray-200 text-gray-600"
                                }`}
                              >
                                {isAutoSaving ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : isSaved ? (
                                  <CheckCircle className="w-3.5 h-3.5" />
                                ) : null}
                                <span>{sub}</span>
                                <span className="text-gray-400">·</span>
                                <span>{filled === total && total > 0 ? '✓' : `${filled} / ${total} él.`}</span>
                                {filled > 0 && (
                                  <div className="w-12 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                    <div
                                      className={`h-full rounded-full transition-all ${
                                        pct === 100 ? "bg-indigo-500" : "bg-amber-400"
                                      }`}
                                      style={{ width: `${pct}%` }}
                                    />
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {/* Grille élèves × matières */}
                        <div className="rounded-lg border overflow-hidden">

                          {/* ── VUE MOBILE : une matière à la fois ── */}
                          <div className="block sm:hidden">
                            <div className="flex overflow-x-auto gap-2 p-3 border-b bg-gray-50 scrollbar-none">
                              {subjectOptions.map((sub) => {
                                const filledCount = gridStudents.filter((s) => {
                                  const raw = gridScores[s.id]?.[sub];
                                  return raw !== undefined && raw !== '' && !isNaN(parseFloat(raw));
                                }).length;
                                const total = gridStudents.length;
                                const isActive = mobileActiveSubComp === sub;
                                const isSaved = gridSavedSubjects.has(sub);
                                const isComplete = filledCount === total && total > 0;
                                return (
                                  <button key={sub} onClick={() => setMobileActiveSubComp(sub)}
                                    className={`shrink-0 flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                                      isActive ? 'bg-indigo-600 text-white border-indigo-600 shadow'
                                      : isSaved || isComplete ? 'bg-green-50 border-green-200 text-green-700'
                                      : 'bg-white border-gray-200 text-gray-600'}`}>
                                    <span className="max-w-[70px] truncate">{sub}</span>
                                    <span className={`text-[10px] ${isActive ? 'text-indigo-200' : isComplete ? 'text-green-500' : 'text-gray-400'}`}>
                                      {filledCount === total ? '✓ complet' : `${filledCount} / ${total} él.`}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                            {mobileActiveSubComp && (
                              <div className="px-3 py-2 bg-amber-50 border-b flex items-center justify-between">
                                <span className="font-semibold text-amber-700 text-sm">{mobileActiveSubComp}</span>
                                <span className="text-xs text-gray-500">
                                  {subjectCoeffMap[mobileActiveSubComp] !== undefined ? `Coeff ×${subjectCoeffMap[mobileActiveSubComp]} · ` : ''}/10
                                </span>
                              </div>
                            )}
                            <div className="divide-y">
                              {gridStudents.map((student, idx) => {
                                const raw = gridScores[student.id]?.[mobileActiveSubComp] ?? '';
                                const val = raw !== '' ? parseFloat(raw) : null;
                                const isInvalid = val !== null && (isNaN(val) || val < 0 || val > 10);
                                return (
                                  <div key={student.id} className={`flex items-center justify-between px-3 py-3 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                                    <div className="flex items-center gap-2 min-w-0">
                                      <span className="text-xs text-gray-400 w-5 shrink-0">{idx + 1}</span>
                                      <span className="font-medium text-gray-800 text-sm truncate">{student.firstName} {student.lastName}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                                      {canSaveGrades ? (
                                        <Input type="number" inputMode="decimal" min={0} max={10} step={0.25} value={raw}
                                          disabled={isLocked}
                                          onChange={(e) => {
                                            const value = e.target.value;
                                            const sid = student.id;
                                            setGridScores((prev) => {
                                              const updated = { ...prev, [sid]: { ...prev[sid], [mobileActiveSubComp]: value } };
                                              gridScoresRef.current = updated;
                                              return updated;
                                            });
                                            triggerAutoSave(mobileActiveSubComp);
                                          }}
                                          placeholder="—"
                                          className={`w-20 h-12 text-center text-lg font-semibold ${isInvalid ? 'border-red-400' : ''}`}
                                        />
                                      ) : (
                                        <span className={`text-lg font-semibold w-20 text-center ${val !== null ? avgColor(val, 10) : 'text-gray-300'}`}>
                                          {val !== null ? val : '—'}
                                        </span>
                                      )}
                                      <span className="text-xs text-gray-400">/10</span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          {/* ── VUE DESKTOP ── */}
                          <div className="hidden sm:block overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead className="bg-gray-50 border-b">
                                <tr>
                                  <th className="text-left px-3 py-3 font-medium text-gray-600 w-8 sticky left-0 bg-gray-50 z-10">#</th>
                                  <th className="text-left px-3 py-3 font-medium text-gray-600 min-w-[160px] sticky left-8 bg-gray-50 z-10">Élève</th>
                                  {subjectOptions.map((sub) => {
                                    const coeff = subjectCoeffMap[sub];
                                    return (
                                      <th key={sub} className="text-center px-2 py-3 font-medium text-gray-600 min-w-[90px]">
                                        <div className="flex flex-col items-center gap-0.5">
                                          <span className="truncate max-w-[80px]" title={sub}>{sub}</span>
                                          <span className="text-[10px] text-gray-400 font-normal">/10</span>
                                          {coeff !== undefined && (
                                            <span className={`text-[10px] font-semibold px-1 rounded ${coeff === 0 ? 'text-gray-400' : 'text-indigo-600'}`}>×{coeff}</span>
                                          )}
                                        </div>
                                      </th>
                                    );
                                  })}
                                  <th className="text-center px-3 py-3 font-medium text-gray-600 min-w-[80px] sticky right-0 bg-gray-50 z-10 shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.06)]">Moy.</th>
                                </tr>
                              </thead>
                              <tbody>
                                {gridStudents.map((student, idx) => {
                                  let rowAvg: number | null = null;
                                  const hasCoeffs = subjectOptions.some((s) => subjectCoeffMap[s] !== undefined);
                                  const simpleAvgP = () => { const ss = subjectOptions.map((sub) => { const raw = gridScores[student.id]?.[sub]; if (!raw || raw === '') return null; const v = parseFloat(raw); return !isNaN(v) && v >= 0 && v <= 10 ? v : null; }).filter((n): n is number => n !== null); return ss.length > 0 ? ss.reduce((a, b) => a + b, 0) / ss.length : null; };
                                  if (hasCoeffs) {
                                    let totalPoints = 0, totalCoeffs = 0;
                                    for (const sub of subjectOptions) {
                                      const coeff = subjectCoeffMap[sub] ?? 1;
                                      if (coeff === 0) continue;
                                      const raw = gridScores[student.id]?.[sub];
                                      if (!raw || raw === '') continue;
                                      const v = parseFloat(raw);
                                      if (isNaN(v) || v < 0 || v > 10) continue;
                                      totalPoints += v * coeff;
                                      totalCoeffs += coeff;
                                    }
                                    rowAvg = totalCoeffs > 0 ? totalPoints / totalCoeffs : simpleAvgP();
                                  } else {
                                    rowAvg = simpleAvgP();
                                  }
                                  return (
                                    <tr key={student.id} className={`border-b last:border-0 hover:bg-indigo-50/30 transition-colors ${idx % 2 === 0 ? "bg-white" : "bg-gray-50"}`}>
                                      <td className={`px-3 py-2 text-gray-400 text-xs sticky left-0 z-10 ${idx % 2 === 0 ? "bg-white" : "bg-gray-50"}`}>{idx + 1}</td>
                                      <td className={`px-3 py-2 font-medium text-gray-800 sticky left-8 z-10 truncate ${idx % 2 === 0 ? "bg-white" : "bg-gray-50"}`}>{student.firstName} {student.lastName}</td>
                                      {subjectOptions.map((sub) => {
                                        const raw = gridScores[student.id]?.[sub] ?? "";
                                        const val = raw !== "" ? parseFloat(raw) : null;
                                        const isInvalid = val !== null && (isNaN(val) || val < 0 || val > 10);
                                        return (
                                          <td key={sub} className="px-1 py-2 text-center">
                                            <Input type="number" inputMode="decimal" min={0} max={10} step={0.25} value={raw}
                                              disabled={isLocked}
                                              onChange={(e) => {
                                                const value = e.target.value;
                                                const sid = student.id;
                                                setGridScores((prev) => {
                                                  const updated = { ...prev, [sid]: { ...prev[sid], [sub]: value } };
                                                  gridScoresRef.current = updated;
                                                  return updated;
                                                });
                                                triggerAutoSave(sub);
                                              }}
                                              placeholder="—"
                                              className={`w-20 h-9 text-center font-medium mx-auto text-sm ${isInvalid ? "border-red-400 focus:ring-red-400" : ""}`}
                                            />
                                          </td>
                                        );
                                      })}
                                      <td className={`px-3 py-2 text-center sticky right-0 z-10 shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.06)] ${idx % 2 === 0 ? "bg-white" : "bg-gray-50"}`}>
                                        <span className={`font-semibold text-sm ${avgColor(rowAvg, 10)}`}>{rowAvg !== null ? rowAvg.toFixed(2) : "—"}</span>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>

                          {/* Footer stats */}
                          <div className="bg-indigo-50 border-t px-4 py-3 flex flex-wrap gap-4 text-sm">
                            <div className="flex items-center gap-2">
                              <span className="text-gray-500">Élèves :</span>
                              <span className="font-semibold text-indigo-700">{gridStudents.length}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-gray-500">Matières :</span>
                              <span className="font-semibold text-indigo-700">{subjectOptions.length}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-gray-500">Matières complètes :</span>
                              <span className="font-semibold text-indigo-700">
                                {subjectOptions.filter((sub) =>
                                  gridStudents.every((s) => {
                                    const raw = gridScores[s.id]?.[sub];
                                    return raw !== undefined && raw !== "" && !isNaN(parseFloat(raw));
                                  })
                                ).length} / {subjectOptions.length}
                              </span>
                            </div>
                            <span className="text-xs text-gray-400 italic self-center">
                              La moyenne générale est visible dans l&apos;onglet Bulletin
                            </span>
                          </div>
                        </div>
                      </>
                    )}
                  </>
                ) : (
                  /* ── VUE SECONDAIRE : grille unifiée compositions ─── */
                  <>
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex flex-wrap gap-2">
                        {subjectOptions.map((sub) => {
                          const filled = compGridStudents.filter((s) => {
                            const raw = compGridScores[s.id]?.[sub];
                            return raw !== undefined && raw !== '' && !isNaN(parseFloat(raw));
                          }).length;
                          const total = compGridStudents.length;
                          const isSaved = compGridSavedSubjects.has(sub);
                          const isAutoSaving = compGridAutoSavingSubjects.has(sub);
                          return (
                            <div
                              key={sub}
                              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium ${
                                isSaved ? 'bg-green-50 border-green-200 text-green-700'
                                : isAutoSaving ? 'bg-blue-50 border-blue-200 text-blue-600'
                                : filled === total && total > 0 ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                                : 'bg-gray-50 border-gray-200 text-gray-600'
                              }`}
                            >
                              {isAutoSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                : isSaved ? <CheckCircle className="w-3.5 h-3.5" /> : null}
                              <span>{sub}</span>
                              {total > 0 && <><span className="text-gray-400">·</span><span>{filled === total ? '✓' : `${filled} / ${total} él.`}</span></>}
                            </div>
                          );
                        })}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => {
                          Object.values(compGridAutoSaveTimers.current).forEach(clearTimeout);
                          compGridAutoSaveTimers.current = {};
                          queryClient.removeQueries({ queryKey: ["comp-grid", user?.tenantId] });
                          refetchCompGrid().then((result) => {
                            if (result.data) {
                              setCompGridStudents(result.data.students);
                              setCompGridCourseAvgs(result.data.courseAvgs);
                              setCompGridScores(result.data.scores);
                              compGridScoresRef.current = result.data.scores;
                              setCompGridSavedSubjects(new Set());
                            }
                          });
                        }} disabled={compGridLoading || !selectedClassId}>
                          {compGridLoading ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1.5" />}
                          Recharger
                        </Button>
                        {canSaveGrades && (
                          <Button size="sm" onClick={() => saveCompGrid(subjectOptions)} disabled={compGridStudents.length === 0} className="bg-indigo-600 hover:bg-indigo-700">
                            <Save className="w-4 h-4 mr-1.5" />
                            Enregistrer tout
                          </Button>
                        )}
                      </div>
                    </div>

                    {compGridLoading ? (
                      <SkeletonTable rows={8} cols={Math.min(subjectOptions.length + 2, 6)} />
                    ) : !selectedClassId ? (
                      <EmptyState message="Sélectionnez une classe pour commencer" />
                    ) : compGridStudents.length === 0 ? (
                      <EmptyState message="Chargement de la grille…" />
                    ) : (
                      <div className="rounded-lg border overflow-hidden">

                        {/* ── VUE MOBILE (compositions secondaire) ── */}
                        <div className="block sm:hidden">
                          {/* Sélecteur de matière */}
                          <div className="p-3 border-b bg-gray-50">
                            <p className="text-xs text-gray-500 mb-2 font-medium">Choisir une matière :</p>
                            <div className="flex flex-wrap gap-2">
                              {subjectOptions.map((sub) => {
                                const filled = compGridStudents.filter((s) => {
                                  const raw = compGridScores[s.id]?.[sub];
                                  return raw !== undefined && raw !== '' && !isNaN(parseFloat(raw));
                                }).length;
                                const total = compGridStudents.length;
                                const isActive = mobileActiveSubComp === sub;
                                return (
                                  <button
                                    key={sub}
                                    onClick={() => setMobileActiveSubComp(sub)}
                                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                                      isActive
                                        ? 'bg-indigo-600 border-indigo-600 text-white'
                                        : filled === total && total > 0
                                        ? 'bg-green-50 border-green-300 text-green-700'
                                        : 'bg-white border-gray-300 text-gray-600'
                                    }`}
                                  >
                                    <span>{sub}</span>
                                    {total > 0 && (
                                      <span className={`text-[10px] ml-1 ${isActive ? 'text-indigo-200' : filled === total ? 'text-green-500' : 'text-gray-400'}`}>
                                        {filled === total ? '✓' : `${filled} / ${total} él.`}
                                      </span>
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          {/* Liste des élèves pour la matière sélectionnée */}
                          {mobileActiveSubComp ? (
                            <div>
                              <div className="px-3 py-2 bg-amber-50 border-b flex items-center gap-2">
                                <span className="font-semibold text-amber-700 text-sm">{mobileActiveSubComp}</span>
                                <span className="text-xs text-amber-600">
                                  {subjectCoeffMap[mobileActiveSubComp] !== undefined ? `Coeff ×${subjectCoeffMap[mobileActiveSubComp]} · ` : ''}compo /20
                                </span>
                              </div>
                              <div className="divide-y">
                                {compGridStudents.map((student, idx) => {
                                  const raw = compGridScores[student.id]?.[mobileActiveSubComp] ?? '';
                                  const comp = raw !== '' ? parseFloat(raw) : null;
                                  const isInvalid = comp !== null && (isNaN(comp) || comp < 0 || comp > 20);
                                  const course = compGridCourseAvgs[student.id]?.[mobileActiveSubComp] ?? null;
                                  const subjAvg = comp !== null && !isInvalid && course !== null
                                    ? (course + comp) / 2
                                    : comp !== null && !isInvalid ? comp : null;
                                  return (
                                    <div key={student.id} className={`flex items-center justify-between px-3 py-2.5 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                                      <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-gray-800 truncate">{idx + 1}. {student.firstName} {student.lastName}</p>
                                        {course !== null && <p className="text-xs text-gray-400">cours: {course.toFixed(1)}{subjAvg !== null ? ` · moy: ${subjAvg.toFixed(2)}` : ''}</p>}
                                      </div>
                                      <Input
                                        type="number"
                                        inputMode="decimal"
                                        min={0}
                                        max={20}
                                        step={0.25}
                                        value={raw}
                                        disabled={isLocked}
                                        onChange={(e) => {
                                          const value = e.target.value;
                                          const sid = student.id;
                                          setCompGridScores((prev) => {
                                            const updated = { ...prev, [sid]: { ...prev[sid], [mobileActiveSubComp]: value } };
                                            compGridScoresRef.current = updated;
                                            return updated;
                                          });
                                          triggerCompAutoSave(mobileActiveSubComp);
                                        }}
                                        placeholder="—"
                                        className={`w-20 h-12 text-center font-semibold text-base ml-3 shrink-0 ${isInvalid ? 'border-red-400' : ''}`}
                                      />
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ) : (
                            <div className="p-6 text-center text-sm text-gray-400">Sélectionnez une matière ci-dessus</div>
                          )}

                          {/* Footer mobile */}
                          <div className="bg-indigo-50 border-t px-3 py-2 flex flex-wrap gap-3 text-xs">
                            <span className="text-gray-500">Élèves : <strong className="text-indigo-700">{compGridStudents.length}</strong></span>
                            <span className="text-gray-500">Complètes : <strong className="text-indigo-700">
                              {subjectOptions.filter((sub) => compGridStudents.every((s) => { const raw = compGridScores[s.id]?.[sub]; return raw !== undefined && raw !== '' && !isNaN(parseFloat(raw)); })).length}/{subjectOptions.length}
                            </strong></span>
                          </div>
                        </div>

                        {/* ── VUE DESKTOP (compositions secondaire) ── */}
                        <div className="hidden sm:block">
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead className="bg-gray-50 border-b">
                                <tr>
                                  <th className="text-left px-3 py-3 font-medium text-gray-600 w-8 sticky left-0 bg-gray-50 z-10">#</th>
                                  <th className="text-left px-3 py-3 font-medium text-gray-600 min-w-[160px] sticky left-8 bg-gray-50 z-10">Élève</th>
                                  {subjectOptions.map((sub) => {
                                    const coeff = subjectCoeffMap[sub];
                                    return (
                                      <th key={sub} className="text-center px-2 py-3 font-medium text-gray-600 min-w-[110px]">
                                        <div className="flex flex-col items-center gap-0.5">
                                          <span className="truncate max-w-[100px]" title={sub}>{sub}</span>
                                          <span className="text-[10px] text-gray-400 font-normal">compo /20</span>
                                          {coeff !== undefined && (
                                            <span className={`text-[10px] font-semibold px-1 rounded ${coeff === 0 ? 'text-gray-400' : 'text-indigo-600'}`}>
                                              ×{coeff}
                                            </span>
                                          )}
                                        </div>
                                      </th>
                                    );
                                  })}
                                  <th className="text-center px-3 py-3 font-medium text-gray-600 min-w-[80px] sticky right-0 bg-gray-50 z-10 shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.06)]">Moy. gén.</th>
                                </tr>
                              </thead>
                              <tbody>
                                {compGridStudents.map((student, idx) => {
                                  let rowAvg: number | null = null;
                                  const hasCoeffsC = subjectOptions.some((s) => subjectCoeffMap[s] !== undefined);
                                  const simpleAvgC = () => { const ss = subjectOptions.map((sub) => { const raw = compGridScores[student.id]?.[sub]; if (!raw || raw === '') return null; const comp = parseFloat(raw); if (isNaN(comp) || comp < 0 || comp > 20) return null; const course = compGridCourseAvgs[student.id]?.[sub] ?? null; return course !== null ? (course + comp) / 2 : comp; }).filter((n): n is number => n !== null); return ss.length > 0 ? ss.reduce((a, b) => a + b, 0) / ss.length : null; };
                                  let tp = 0, tc = 0;
                                  for (const sub of subjectOptions) {
                                    const coeff = hasCoeffsC ? (subjectCoeffMap[sub] ?? 1) : 1;
                                    if (coeff === 0) continue;
                                    const raw = compGridScores[student.id]?.[sub];
                                    const comp = raw && raw !== '' ? parseFloat(raw) : null;
                                    if (comp === null || isNaN(comp) || comp < 0 || comp > 20) continue;
                                    const course = compGridCourseAvgs[student.id]?.[sub] ?? null;
                                    const subjAvg = course !== null ? (course + comp) / 2 : comp;
                                    tp += subjAvg * coeff; tc += coeff;
                                  }
                                  rowAvg = tc > 0 ? tp / tc : simpleAvgC();
                                  return (
                                    <tr key={student.id} className={`border-b last:border-0 hover:bg-indigo-50/30 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                                      <td className={`px-3 py-2 text-gray-400 text-xs sticky left-0 z-10 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>{idx + 1}</td>
                                      <td className={`px-3 py-2 font-medium text-gray-800 sticky left-8 z-10 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                                        {student.firstName} {student.lastName}
                                      </td>
                                      {subjectOptions.map((sub) => {
                                        const raw = compGridScores[student.id]?.[sub] ?? '';
                                        const comp = raw !== '' ? parseFloat(raw) : null;
                                        const isInvalid = comp !== null && (isNaN(comp) || comp < 0 || comp > 20);
                                        const course = compGridCourseAvgs[student.id]?.[sub] ?? null;
                                        const subjAvg = comp !== null && !isInvalid && course !== null
                                          ? (course + comp) / 2
                                          : comp !== null && !isInvalid ? comp : null;
                                        return (
                                          <td key={sub} className="px-1 py-1.5 text-center">
                                            <div className="flex flex-col items-center gap-0.5">
                                              <Input
                                                type="number"
                                                inputMode="decimal"
                                                min={0}
                                                max={20}
                                                step={0.25}
                                                value={raw}
                                                disabled={isLocked}
                                                onChange={(e) => {
                                                  const value = e.target.value;
                                                  const sid = student.id;
                                                  setCompGridScores((prev) => {
                                                    const updated = { ...prev, [sid]: { ...prev[sid], [sub]: value } };
                                                    compGridScoresRef.current = updated;
                                                    return updated;
                                                  });
                                                  triggerCompAutoSave(sub);
                                                }}
                                                placeholder="—"
                                                className={`w-20 h-9 text-center font-medium mx-auto text-sm ${isInvalid ? 'border-red-400' : ''}`}
                                              />
                                              {course !== null && (
                                                <span className="text-[10px] text-gray-400">cours: {course.toFixed(1)}</span>
                                              )}
                                              {subjAvg !== null && (
                                                <span className={`text-[10px] font-semibold ${avgColor(subjAvg, 20)}`}>
                                                  → {subjAvg.toFixed(2)}
                                                </span>
                                              )}
                                            </div>
                                          </td>
                                        );
                                      })}
                                      <td className={`px-3 py-2 text-center sticky right-0 z-10 shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.06)] ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                                        <span className={`font-semibold text-sm ${avgColor(rowAvg, 20)}`}>
                                          {rowAvg !== null ? rowAvg.toFixed(2) : '—'}
                                        </span>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                          <div className="bg-indigo-50 border-t px-4 py-3 flex flex-wrap gap-4 text-sm">
                            <div className="flex items-center gap-2">
                              <span className="text-gray-500">Élèves :</span>
                              <span className="font-semibold text-indigo-700">{compGridStudents.length}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-gray-500">Matières complètes :</span>
                              <span className="font-semibold text-indigo-700">
                                {subjectOptions.filter((sub) =>
                                  compGridStudents.every((s) => {
                                    const raw = compGridScores[s.id]?.[sub];
                                    return raw !== undefined && raw !== '' && !isNaN(parseFloat(raw));
                                  })
                                ).length} / {subjectOptions.length}
                              </span>
                            </div>
                            <span className="text-xs text-gray-400 italic self-center">
                              La moyenne générale officielle est calculée par le serveur (onglet Bulletin)
                            </span>
                          </div>
                        </div>

                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ══════════════════════════════════════════════════════════════ */}
          {/* TAB 3 — BULLETIN (directeur uniquement)                       */}
          {/* ══════════════════════════════════════════════════════════════ */}
          {isDirector && (
          <TabsContent value="bulletin" className="mt-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-indigo-500" />
                    Bulletin de classe
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      onClick={() => refetchBulletin()}
                      disabled={bulletinLoading || !selectedClassId}
                    >
                      {bulletinLoading ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <RefreshCw className="w-4 h-4 mr-2" />
                      )}
                      Charger
                    </Button>
                    {isDirector && bulletinReport && (
                      <Button
                        variant={trimesterLock ? "outline" : "outline"}
                        onClick={handleToggleLock}
                        disabled={lockLoading}
                        className={
                          trimesterLock
                            ? "border-green-400 text-green-700 hover:bg-green-50"
                            : "border-orange-400 text-orange-700 hover:bg-orange-50"
                        }
                      >
                        {lockLoading ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : trimesterLock ? (
                          <Unlock className="w-4 h-4 mr-2" />
                        ) : (
                          <Lock className="w-4 h-4 mr-2" />
                        )}
                        {trimesterLock ? "Déverrouiller" : "Verrouiller"}
                      </Button>
                    )}
                    {trimesterLock && bulletinReport && (
                      <>
                        <Button
                          variant="outline"
                          onClick={() => generateAllBulletins("download")}
                          disabled={isGeneratingPDF}
                          title="Télécharger tous les bulletins en PDF"
                        >
                          {isGeneratingPDF ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          ) : (
                            <Download className="w-4 h-4 mr-2" />
                          )}
                          Télécharger tout
                        </Button>
                        <Button
                          onClick={() => generateAllBulletins("print")}
                          disabled={isGeneratingPDF}
                          className="bg-indigo-600 hover:bg-indigo-700"
                          title="Imprimer tous les bulletins"
                        >
                          {isGeneratingPDF ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          ) : (
                            <Printer className="w-4 h-4 mr-2" />
                          )}
                          Imprimer tout
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Lock banner */}
                {trimesterLock && (
                  <div className="flex items-start gap-3 bg-orange-50 border border-orange-200 rounded-lg px-4 py-3">
                    <CheckCircle className="w-5 h-5 text-orange-600 mt-0.5 flex-shrink-0" />
                    <div className="text-sm">
                      <p className="font-semibold text-orange-800">
                        Trimestre verrouillé — validé le{" "}
                        {new Date(trimesterLock.lockedAt).toLocaleDateString("fr-FR", {
                          day: "2-digit",
                          month: "long",
                          year: "numeric",
                        })}
                      </p>
                      {trimesterLock.lockedByName && (
                        <p className="text-orange-700 mt-0.5">
                          Par : {trimesterLock.lockedByName}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Bannière : trimestre non verrouillé */}
                {bulletinReport && !trimesterLock && (
                  <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
                    <Lock className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                    <div className="text-sm">
                      <p className="font-semibold text-blue-800">Trimestre non verrouillé</p>
                      <p className="text-blue-700 mt-0.5">
                        Vérifiez que toutes les notes sont saisies, puis cliquez sur <strong>Verrouiller</strong> pour valider le trimestre et activer la génération des bulletins.
                      </p>
                    </div>
                  </div>
                )}

                {/* Table */}
                {bulletinLoading ? (
                  <SkeletonTable rows={8} cols={5} />
                ) : !bulletinReport ? (
                  <EmptyState message="Sélectionnez une classe pour afficher les résultats" />
                ) : bulletinReport.students.length === 0 ? (
                  <EmptyState message="Aucun élève trouvé pour cette classe" />
                ) : (
                  <>
                    {/* Summary stats */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <div className="bg-indigo-50 rounded-lg px-4 py-3">
                        <p className="text-xs text-indigo-500 font-medium uppercase tracking-wide">
                          Élèves
                        </p>
                        <p className="text-2xl font-bold text-indigo-700 mt-1">
                          {bulletinReport.totalStudents}
                        </p>
                      </div>
                      <div className="bg-emerald-50 rounded-lg px-4 py-3">
                        <p className="text-xs text-emerald-500 font-medium uppercase tracking-wide">
                          Moy. Classe
                        </p>
                        <p className={`text-2xl font-bold mt-1 ${avgColor(bulletinReport.classAverage, scoreMax)}`}>
                          {fmt(bulletinReport.classAverage)} <span className="text-sm font-normal text-emerald-400">/{scoreMax}</span>
                        </p>
                      </div>
                      <div className="bg-purple-50 rounded-lg px-4 py-3 col-span-2 sm:col-span-1">
                        <p className="text-xs text-purple-500 font-medium uppercase tracking-wide">
                          Trimestre
                        </p>
                        <p className="text-lg font-bold text-purple-700 mt-1">
                          {bulletinReport.term}
                        </p>
                      </div>
                    </div>

                    {/* Ranking table */}
                    <div className="rounded-lg border overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50 border-b sticky top-0">
                            <tr>
                              <th className="text-left px-4 py-3 font-medium text-gray-600 w-16">
                                Rang
                              </th>
                              <th className="text-left px-4 py-3 font-medium text-gray-600">
                                Élève
                              </th>
                              <th className="text-left px-4 py-3 font-medium text-gray-600 hidden sm:table-cell w-24">
                                Matières
                              </th>
                              <th className="text-left px-4 py-3 font-medium text-gray-600 w-32">
                                Moy. Générale
                              </th>
                              <th className="text-left px-4 py-3 font-medium text-gray-600 hidden md:table-cell">
                                Appréciation
                              </th>
                              <th className="text-left px-4 py-3 font-medium text-gray-600 w-16">
                                Détail
                              </th>
                              {trimesterLock && (
                                <th className="text-left px-4 py-3 font-medium text-gray-600 w-20">
                                  Bulletin
                                </th>
                              )}
                            </tr>
                          </thead>
                          <tbody>
                            {bulletinReport.students.map((row, idx) => {
                              const avg =
                                row.generalAverage > 0 ? row.generalAverage : null;
                              return (
                                <tr
                                  key={row.student.id}
                                  className={`border-b last:border-0 hover:bg-gray-50/70 transition-colors ${
                                    idx % 2 === 0 ? "bg-white" : "bg-gray-50/30"
                                  }`}
                                >
                                  <td className="px-4 py-3 text-lg font-bold">
                                    {rankMedal(row.rank)}
                                  </td>
                                  <td className="px-4 py-3 font-medium text-gray-800">
                                    {row.student.firstName} {row.student.lastName}
                                    <div className="text-xs text-gray-400 font-mono">
                                      {row.student.matricule}
                                    </div>
                                  </td>
                                  <td className="px-4 py-3 hidden sm:table-cell text-gray-500 text-center">
                                    {row.totalSubjects}
                                  </td>
                                  <td className="px-4 py-3">
                                    <span
                                      className={`text-lg font-bold ${avgColor(avg, scoreMax)}`}
                                    >
                                      {avg !== null ? `${avg.toFixed(2)} /${scoreMax}` : "—"}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3 hidden md:table-cell">
                                    <MentionBadge score={avg} scoreMax={scoreMax} />
                                  </td>
                                  <td className="px-4 py-3">
                                    <button
                                      onClick={() => {
                                        if (isPrimaryClass) {
                                          // Primaire : charger le rapport annuel
                                          loadAnnualReport(row.student.id);
                                        } else {
                                          setSheetSubject("__student__" + row.student.id);
                                          setSheetOpen(true);
                                        }
                                      }}
                                      className="text-indigo-500 hover:text-indigo-700 hover:underline text-xs"
                                      title={isPrimaryClass ? "Voir le rapport annuel" : "Voir le détail"}
                                    >
                                      <ChevronRight className="w-4 h-4" />
                                    </button>
                                  </td>
                                  {trimesterLock && (
                                    <td className="px-4 py-3">
                                      <div className="flex items-center gap-2">
                                        <button
                                          onClick={() => generateStudentBulletin(row, "download")}
                                          className="text-gray-500 hover:text-indigo-700"
                                          title="Télécharger le bulletin PDF"
                                        >
                                          <Download className="w-4 h-4" />
                                        </button>
                                        <button
                                          onClick={() => generateStudentBulletin(row, "print")}
                                          className="text-gray-500 hover:text-indigo-700"
                                          title="Imprimer le bulletin"
                                        >
                                          <Printer className="w-4 h-4" />
                                        </button>
                                      </div>
                                    </td>
                                  )}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Subject columns hint */}
                    {subjectOptions.length > 0 && (
                      <div className="pt-2">
                        <p className="text-xs text-gray-500 mb-2 font-medium">
                          Voir le détail par matière :
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {subjectOptions.map((subject) => (
                            <button
                              key={subject}
                              onClick={() => openSubjectSheet(subject)}
                              className="px-3 py-1.5 text-xs bg-white border border-gray-200 rounded-full hover:border-indigo-400 hover:text-indigo-700 hover:bg-indigo-50 transition-colors font-medium"
                            >
                              {subject}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* ── Rapport annuel (primaire uniquement) ── */}
                    {isPrimaryClass && (
                      <div className="mt-4 border-t pt-4">
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                            <GraduationCap className="w-4 h-4 text-indigo-500" />
                            Rapport annuel — {academicYear}
                          </p>
                          <p className="text-xs text-gray-400">Cliquez sur un élève pour voir sa décision</p>
                        </div>
                        {annualLoading ? (
                          <Skeleton className="h-24 w-full rounded-lg" />
                        ) : annualReport ? (
                          <div className="rounded-lg border bg-white overflow-hidden">
                            <div className="px-4 py-3 bg-gray-50 border-b flex items-center justify-between">
                              <div>
                                <p className="font-semibold text-gray-800">
                                  {annualReport.student.firstName} {annualReport.student.lastName}
                                </p>
                                <p className="text-xs text-gray-400 font-mono mt-0.5">{annualReport.student.matricule}</p>
                              </div>
                              <button onClick={() => setAnnualReport(null)} className="text-gray-400 hover:text-gray-600">
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                            <div className="px-4 py-3 space-y-3">
                              <div className="flex flex-wrap gap-4 text-sm">
                                {annualReport.termAverages.map((t) => (
                                  <div key={t.term} className="flex items-center gap-1.5">
                                    <span className="text-gray-500 font-medium">{t.term} :</span>
                                    <span className={`font-bold ${avgColor(t.average, annualReport.scoreMax)}`}>
                                      {t.average.toFixed(2)} /{annualReport.scoreMax}
                                    </span>
                                  </div>
                                ))}
                              </div>
                              <div className="flex items-center gap-4 pt-2 border-t">
                                <div>
                                  <p className="text-xs text-gray-500">Moyenne annuelle</p>
                                  <p className={`text-2xl font-bold ${avgColor(annualReport.annualAverage, annualReport.scoreMax)}`}>
                                    {annualReport.annualAverage.toFixed(2)} <span className="text-sm font-normal">/{annualReport.scoreMax}</span>
                                  </p>
                                </div>
                                <div>
                                  <p className="text-xs text-gray-500">Décision</p>
                                  <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-bold mt-1 ${
                                    annualReport.decision === 'ADMIS'
                                      ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                                      : 'bg-red-100 text-red-700 border border-red-200'
                                  }`}>
                                    {annualReport.decision}
                                  </span>
                                </div>
                                <div className="text-xs text-gray-400">
                                  Seuil : {annualReport.passThreshold}/{annualReport.scoreMax}
                                  <br />
                                  ({annualReport.termsCount} trimestre{annualReport.termsCount > 1 ? 's' : ''})
                                </div>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <p className="text-xs text-gray-400 italic">
                            Cliquez sur l&apos;icône <ChevronRight className="w-3 h-3 inline" /> d&apos;un élève pour afficher son rapport annuel.
                          </p>
                        )}
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>)}

          {/* ══════════════════════════════════════════════════════════════ */}
          {/* TAB 4 — CONFIGURATION (director only)                         */}
          {/* ══════════════════════════════════════════════════════════════ */}
          {isDirector && (
            <TabsContent value="configuration" className="mt-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <Settings2 className="w-4 h-4 text-indigo-500" />
                    Configuration des matières
                  </CardTitle>
                  <p className="text-sm text-gray-500 mt-1">
                    Définissez les matières et coefficients pour chaque classe
                  </p>
                </CardHeader>
                <CardContent className="space-y-5">

                  {/* ── Vue liste des classes (quand aucune classe ouverte) ── */}
                  {!configClassId && (
                    <>
                      {classesLoading && classes.length === 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                          {[1,2,3].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}
                        </div>
                      ) : classes.length === 0 ? (
                        <EmptyState message="Aucune classe disponible" />
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                          {classes.map((c) => (
                            <button
                              key={c.id}
                              onClick={() => {
                                setConfigClassId(c.id);
                                setConfigSubjects([]);
                                // Le chargement est déclenché automatiquement par la query (enabled: !!configClassId)
                              }}
                              className="text-left p-4 rounded-xl border border-gray-200 bg-white hover:border-indigo-400 hover:shadow-sm transition-all group"
                            >
                              <div className="flex items-start justify-between">
                                <div>
                                  <p className="font-semibold text-gray-800 group-hover:text-indigo-700 transition-colors">
                                    {formatClassName(c.name, c.section)}
                                  </p>
                                  <div className="flex items-center gap-1.5 mt-0.5">
                                    <p className="text-xs text-gray-400">{c.level}</p>
                                    {(c.gradeMode === 'PRIMARY' || ['Primaire', 'Maternelle'].includes(c.level ?? '') || /^(CP|CE|CM)\d/i.test(c.name ?? '')) && (
                                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">
                                        /10
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-indigo-500 mt-0.5 transition-colors" />
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}

                  {/* ── Panel édition d'une classe ── */}
                  {configClassId && (
                    <>
                      {/* Header du panel avec bouton retour */}
                      <div className="flex items-center gap-3 pb-2 border-b">
                        <button
                          onClick={() => { setConfigClassId(""); setConfigSubjects([]); }}
                          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
                        >
                          <ChevronRight className="w-4 h-4 rotate-180" />
                          Toutes les classes
                        </button>
                        <span className="text-gray-300">/</span>
                        <span className="text-sm font-semibold text-gray-800">
                          {(() => {
                            const cls = classes.find((c) => c.id === configClassId);
                            return cls ? formatClassName(cls.name, cls.section) : "";
                          })()}
                        </span>
                      </div>

                      {/* Subjects table */}
                      {configLoading ? (
                        <SkeletonTable rows={4} cols={3} />
                      ) : (
                        <>
                          {configSubjects.length > 0 && (
                            <>
                            <div className="rounded-lg border overflow-hidden">
                              <table className="w-full text-sm">
                                <thead className="bg-gray-50 border-b">
                                  <tr>
                                    <th className="text-left px-4 py-3 font-medium text-gray-600 w-10">
                                      Actif
                                    </th>
                                    <th className="text-left px-4 py-3 font-medium text-gray-600">
                                      Matière
                                    </th>
                                    <th className="text-left px-4 py-3 font-medium text-gray-600 w-44">
                                      Coefficient
                                    </th>
                                    <th className="w-12 px-4 py-3"></th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {configSubjects.map((subject, idx) => (
                                    <tr
                                      key={idx}
                                      className={`border-b last:border-0 ${
                                        subject.enabled ? "bg-white" : "bg-gray-50 opacity-60"
                                      }`}
                                    >
                                      <td className="px-4 py-3">
                                        <input
                                          type="checkbox"
                                          checked={subject.enabled}
                                          onChange={(e) =>
                                            setConfigSubjects((prev) =>
                                              prev.map((s, i) =>
                                                i === idx ? { ...s, enabled: e.target.checked } : s
                                              )
                                            )
                                          }
                                          className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                        />
                                      </td>
                                      <td className="px-4 py-3 font-medium text-gray-800">
                                        {subject.name}
                                      </td>
                                      <td className="px-4 py-3">
                                        {subject.coefficient === 0 ? (
                                          <button
                                            onClick={() =>
                                              setConfigSubjects((prev) =>
                                                prev.map((s, i) => i === idx ? { ...s, coefficient: 1 } : s)
                                              )
                                            }
                                            className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-500 hover:bg-indigo-50 hover:text-indigo-600 transition-colors border border-dashed border-gray-300"
                                            title="Cliquer pour ajouter un coefficient"
                                          >
                                            Sans coeff
                                          </button>
                                        ) : (
                                          <div className="flex items-center gap-1">
                                            <Input
                                              type="number"
                                              min={1}
                                              max={10}
                                              step={0.5}
                                              value={subject.coefficient}
                                              onChange={(e) => {
                                                const val = e.target.value;
                                                const parsed = parseFloat(val);
                                                if (!isNaN(parsed) && parsed >= 1 && parsed <= 10) {
                                                  setConfigSubjects((prev) =>
                                                    prev.map((s, i) => i === idx ? { ...s, coefficient: parsed } : s)
                                                  );
                                                }
                                              }}
                                              className="w-16 h-8 text-center"
                                            />
                                            <button
                                              onClick={() =>
                                                setConfigSubjects((prev) =>
                                                  prev.map((s, i) => i === idx ? { ...s, coefficient: 0 } : s)
                                                )
                                              }
                                              className="text-gray-300 hover:text-gray-500 transition-colors"
                                              title="Supprimer le coefficient (matière sans coefficient)"
                                            >
                                              <X className="w-3 h-3" />
                                            </button>
                                          </div>
                                        )}
                                      </td>
                                      <td className="px-4 py-3">
                                        <button
                                          onClick={() =>
                                            setConfigSubjects((prev) => prev.filter((_, i) => i !== idx))
                                          }
                                          className="text-red-400 hover:text-red-600 transition-colors"
                                          title="Supprimer"
                                        >
                                          <Trash2 className="w-4 h-4" />
                                        </button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                            <p className="text-xs text-gray-400 flex items-center gap-1 mt-1">
                              <span className="inline-block w-3 h-3 rounded border border-dashed border-gray-300 bg-gray-100 text-center leading-none text-[9px]">0</span>
                              <strong>Sans coeff</strong> = la matière apparaît dans le bulletin mais ne compte pas dans la moyenne générale (ex : EPS, Dessin).
                            </p>
                            </>
                          )}

                          {/* Suggested subjects */}
                          {(() => {
                            const configClass = classes.find((c) => c.id === configClassId);
                            if (!configClass?.level) return null;
                            const suggested = getSubjectsForLevel(configClass.level);
                            const existingNames = new Set(configSubjects.map((s) => s.name.toLowerCase()));
                            const filtered = suggested.filter(
                              (s) => !existingNames.has(s.name.toLowerCase())
                            );
                            if (filtered.length === 0) return null;
                            return (
                              <div className="space-y-2">
                                <p className="text-xs font-medium text-gray-600 uppercase tracking-wide">
                                  Matières suggérées pour ce niveau
                                </p>
                                <div className="flex flex-wrap gap-2">
                                  {filtered.map((s) => (
                                    <button
                                      key={s.name}
                                      onClick={() =>
                                        setConfigSubjects((prev) => [
                                          ...prev,
                                          { name: s.name, coefficient: s.coefficient, enabled: true },
                                        ])
                                      }
                                      className="flex items-center gap-1 px-3 py-1.5 text-xs bg-white border border-gray-200 rounded-full hover:border-indigo-400 hover:text-indigo-700 hover:bg-indigo-50 transition-colors font-medium"
                                    >
                                      <Plus className="w-3 h-3" />
                                      {s.name}
                                      <span className="text-gray-400 ml-1">×{s.coefficient}</span>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            );
                          })()}

                          {/* Add custom subject */}
                          <div className="space-y-2">
                            <p className="text-xs font-medium text-gray-600 uppercase tracking-wide">
                              Ajouter une matière personnalisée
                            </p>
                            <div className="flex items-center gap-3 flex-wrap">
                              <Input
                                placeholder="Nom de la matière"
                                value={newSubjectName}
                                onChange={(e) => setNewSubjectName(e.target.value)}
                                className="bg-white max-w-xs"
                              />
                              {newSubjectCoeff === 0 ? (
                                <button
                                  onClick={() => setNewSubjectCoeff(1)}
                                  className="text-xs px-3 py-2 rounded bg-gray-100 text-gray-500 hover:bg-indigo-50 hover:text-indigo-600 transition-colors border border-dashed border-gray-300"
                                  title="Cliquer pour ajouter un coefficient"
                                >
                                  Sans coeff
                                </button>
                              ) : (
                                <div className="flex items-center gap-1">
                                  <Input
                                    type="number"
                                    min={1}
                                    max={10}
                                    step={0.5}
                                    value={newSubjectCoeff}
                                    onChange={(e) => {
                                      const parsed = parseFloat(e.target.value);
                                      if (!isNaN(parsed) && parsed >= 1 && parsed <= 10) setNewSubjectCoeff(parsed);
                                    }}
                                    className="bg-white w-16 text-center"
                                    placeholder="Coeff"
                                  />
                                  <button
                                    onClick={() => setNewSubjectCoeff(0)}
                                    className="text-gray-300 hover:text-gray-500 transition-colors"
                                    title="Sans coefficient"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              )}
                              <Button
                                variant="outline"
                                disabled={!newSubjectName.trim()}
                                onClick={() => {
                                  if (!newSubjectName.trim()) return;
                                  setConfigSubjects((prev) => [
                                    ...prev,
                                    { name: newSubjectName.trim(), coefficient: newSubjectCoeff, enabled: true },
                                  ]);
                                  setNewSubjectName("");
                                  setNewSubjectCoeff(1);
                                }}
                              >
                                <Plus className="w-4 h-4 mr-1" />
                                Ajouter
                              </Button>
                            </div>
                          </div>

                          {/* Save button */}
                          <div className="pt-2">
                            <Button
                              onClick={saveConfig}
                              disabled={configSaving}
                              className="bg-indigo-600 hover:bg-indigo-700"
                            >
                              {configSaving ? (
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              ) : (
                                <Save className="w-4 h-4 mr-2" />
                              )}
                              Enregistrer la configuration
                            </Button>
                          </div>
                        </>
                      )}
                    </>
                  )}

                </CardContent>
              </Card>
            </TabsContent>
          )}
        </Tabs>
      </div>

      {/* ── Dialog confirmation verrouillage trimestre ───────────────────────── */}
      <AlertDialog open={lockConfirmOpen} onOpenChange={setLockConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Lock className="w-5 h-5 text-orange-600" />
              Verrouiller le {selectedTerm} ?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                <p>
                  Une fois verrouillé, les professeurs <strong>ne pourront plus modifier</strong> les notes de ce trimestre.
                  Vous pourrez déverrouiller si nécessaire.
                </p>
                {bulletinReport && (() => {
                  const total = bulletinReport.students.length;
                  const withGrades = bulletinReport.students.filter((s) => s.totalSubjects > 0).length;
                  const without = total - withGrades;
                  return (
                    <div className="rounded-lg border bg-gray-50 p-3 space-y-1.5">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Total élèves</span>
                        <span className="font-semibold">{total}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-emerald-700">✓ Avec notes et compositions</span>
                        <span className="font-semibold text-emerald-700">{withGrades}</span>
                      </div>
                      {without > 0 && (
                        <div className="flex justify-between">
                          <span className="text-amber-700">⚠ Sans notes complètes</span>
                          <span className="font-semibold text-amber-700">{without}</span>
                        </div>
                      )}
                    </div>
                  );
                })()}
                {bulletinReport && bulletinReport.students.filter((s) => s.totalSubjects === 0).length > 0 && (
                  <p className="text-amber-700 font-medium">
                    Attention : {bulletinReport.students.filter((s) => s.totalSubjects === 0).length} élève(s) n&apos;ont pas encore toutes leurs notes. Leurs bulletins afficheront des moyennes incomplètes.
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmLock}
              className="bg-orange-600 hover:bg-orange-700"
            >
              <Lock className="w-4 h-4 mr-2" />
              Confirmer le verrouillage
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Subject Detail Sheet ─────────────────────────────────────────────── */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-indigo-500" />
              {sheetSubject.startsWith("__student__")
                ? "Détail élève"
                : `${sheetSubject} — ${selectedTerm}`}
            </SheetTitle>
          </SheetHeader>

          {sheetLoading ? (
            <SkeletonTable rows={6} cols={4} />
          ) : sheetSubject.startsWith("__student__") ? (
            // Student detail view — show all subjects from bulletin
            <div className="space-y-3">
              {bulletinReport ? (() => {
                const studentId = sheetSubject.replace("__student__", "");
                const studentRow = bulletinReport.students.find(
                  (s) => s.student.id === studentId
                );
                if (!studentRow) return <EmptyState message="Élève non trouvé" />;
                return (
                  <div className="space-y-3">
                    <div className="bg-indigo-50 rounded-lg px-4 py-3">
                      <p className="font-semibold text-indigo-800 text-lg">
                        {studentRow.student.firstName} {studentRow.student.lastName}
                      </p>
                      <p className="text-sm text-indigo-600 font-mono">
                        {studentRow.student.matricule}
                      </p>
                      <div className="mt-2 flex items-center gap-3">
                        <span className="text-sm text-indigo-700">Rang:</span>
                        <span className="text-xl">{rankMedal(studentRow.rank)}</span>
                        <span className="text-sm text-indigo-700 ml-4">Moy. générale:</span>
                        <span className={`font-bold text-lg ${avgColor(studentRow.generalAverage > 0 ? studentRow.generalAverage : null)}`}>
                          {studentRow.generalAverage > 0
                            ? studentRow.generalAverage.toFixed(2)
                            : "—"}
                        </span>
                      </div>
                    </div>
                    <div className="text-sm text-gray-500 p-4 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <AlertTriangle className="w-4 h-4 text-amber-500" />
                        <span>
                          Pour voir le détail par matière, cliquez sur les boutons matières
                          dans le bulletin.
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })() : <EmptyState message="Aucune donnée" />}
            </div>
          ) : sheetData.length === 0 ? (
            <EmptyState message="Aucune donnée disponible pour cette matière" />
          ) : (
            <div className="space-y-3">
              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="text-left px-3 py-3 font-medium text-gray-600">Élève</th>
                      <th className="text-left px-3 py-3 font-medium text-gray-600 w-24">
                        Moy. Cours
                      </th>
                      <th className="text-left px-3 py-3 font-medium text-gray-600 w-24">
                        Compo.
                      </th>
                      <th className="text-left px-3 py-3 font-medium text-gray-600 w-28">
                        Moy. Matière
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sheetData
                      .slice()
                      .sort(
                        (a, b) =>
                          (b.averageSubject ?? -1) - (a.averageSubject ?? -1)
                      )
                      .map((row, idx) => (
                        <tr
                          key={row.student.id}
                          className={`border-b last:border-0 hover:bg-gray-50/70 ${
                            idx % 2 === 0 ? "bg-white" : "bg-gray-50/30"
                          }`}
                        >
                          <td className="px-3 py-2.5 font-medium text-gray-800">
                            {row.student.firstName} {row.student.lastName}
                          </td>
                          <td className="px-3 py-2.5 text-gray-500 text-xs font-mono">
                            {fmt(row.averageCourse)}
                          </td>
                          <td className="px-3 py-2.5 text-gray-700 font-mono">
                            {fmt(row.compositionScore)}
                          </td>
                          <td className="px-3 py-2.5">
                            <span
                              className={`font-bold ${avgColor(row.averageSubject)}`}
                            >
                              {fmt(row.averageSubject)}
                            </span>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>

              {/* Sheet stats */}
              {(() => {
                const valids = sheetData
                  .map((r) => r.averageSubject)
                  .filter((n): n is number => n !== null);
                const mean =
                  valids.length > 0
                    ? valids.reduce((a, b) => a + b, 0) / valids.length
                    : null;
                return (
                  <div className="bg-indigo-50 rounded-lg px-4 py-3 flex gap-4 text-sm">
                    <div>
                      <span className="text-gray-500">Moy. de la matière: </span>
                      <span className={`font-bold ${avgColor(mean)}`}>
                        {mean !== null ? mean.toFixed(2) : "—"}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">Élèves: </span>
                      <span className="font-semibold text-indigo-700">
                        {valids.length} / {sheetData.length}
                      </span>
                    </div>
                  </div>
                );
              })()}

              <button
                onClick={() => setSheetOpen(false)}
                className="w-full mt-2 flex items-center justify-center gap-2 py-2 text-sm text-gray-500 hover:text-gray-700 border rounded-lg hover:border-gray-300 transition-colors"
              >
                <X className="w-4 h-4" />
                Fermer
              </button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ─── Export with Suspense ─────────────────────────────────────────────────────

export default function GradesPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50/50 flex items-center justify-center">
          <div className="flex items-center gap-3 text-gray-500">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Chargement des notes…</span>
          </div>
        </div>
      }
    >
      <GradesPageInner />
    </Suspense>
  );
}
