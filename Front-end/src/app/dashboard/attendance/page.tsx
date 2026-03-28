"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CLASSES_QUERY_KEY } from "@/hooks/queries/use-classes-query";
import { useRefreshOnFocus } from "@/hooks/use-refresh-on-focus";
import {
  Calendar, Check, X, Save, Loader2, WifiOff, Clock, ShieldCheck,
  Users, RotateCcw, FileCheck, GraduationCap, MessageSquare, Timer,
  Phone, BarChart3, AlertCircle, Eye, ChevronDown, ChevronUp, History, Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectGroup, SelectItem,
  SelectLabel, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import * as storage from "@/lib/storage";
import { offlineDB, STORES } from "@/lib/offline-db";
import { syncQueue } from "@/lib/sync-queue";
import { useOnline } from "@/hooks/use-online";
import { getClasses, type BackendClass } from "@/lib/api/classes.service";
import { getStudents } from "@/lib/api/students.service";
import { formatClassName } from "@/lib/class-helpers";
import {
  getAttendances,
  getAttendanceByDate,
  bulkCreateAttendance,
  updateAttendance,
  type BackendAttendance,
} from "@/lib/api/attendance.service";
import { getFeesConfig, type SchoolDays, migrateSchoolDays, DEFAULT_SCHOOL_DAYS } from "@/lib/api/fees.service";
import type { BackendStudent } from "@/types";

// ─── Types ─────────────────────────────────────────────────────────────────────

type AttendanceStatus = "PRESENT" | "ABSENT" | "LATE" | "EXCUSED";
type ActiveTab = "overview" | "marking";

interface StudentRow {
  studentId: string;
  firstName: string;
  lastName: string;
  matricule: string;
  status: AttendanceStatus | null;
  notes: string;
  existingId?: string;
  originalStatus?: AttendanceStatus;
  originalNotes?: string;
  notesOpen: boolean;
}

interface AbsenceAlert {
  studentId: string;
  studentName: string;
  matricule: string;
  className: string;
  status: "ABSENT" | "LATE";
  notes?: string;
  parentName?: string;
  parentPhone?: string;
}

/** Élève avec absences répétées (sur 30 jours glissants) */
interface ChronicAbsence {
  studentId: string;
  studentName: string;
  matricule: string;
  className: string;
  absenceCount: number;   // Total absences
  lateCount: number;      // Total retards
  riskLevel: "warning" | "danger"; // ≥3 : warning, ≥5 : danger
  parentPhone?: string;
  parentName?: string;
}

// ─── Constantes ────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  AttendanceStatus,
  { label: string; icon: React.ReactNode; activeClass: string; rowClass: string; badgeClass: string; dot: string }
> = {
  PRESENT: {
    label: "Présent",
    icon: <Check className="h-4 w-4" />,
    activeClass: "bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600",
    rowClass: "border-l-emerald-400 bg-emerald-50/40",
    badgeClass: "bg-emerald-100 text-emerald-700 border-emerald-200",
    dot: "bg-emerald-500",
  },
  ABSENT: {
    label: "Absent",
    icon: <X className="h-4 w-4" />,
    activeClass: "bg-red-600 hover:bg-red-700 text-white border-red-600",
    rowClass: "border-l-red-400 bg-red-50/40",
    badgeClass: "bg-red-100 text-red-700 border-red-200",
    dot: "bg-red-500",
  },
  LATE: {
    label: "Retard",
    icon: <Clock className="h-4 w-4" />,
    activeClass: "bg-orange-500 hover:bg-orange-600 text-white border-orange-500",
    rowClass: "border-l-orange-400 bg-orange-50/40",
    badgeClass: "bg-orange-100 text-orange-700 border-orange-200",
    dot: "bg-orange-400",
  },
  EXCUSED: {
    label: "Excusé",
    icon: <ShieldCheck className="h-4 w-4" />,
    activeClass: "bg-blue-500 hover:bg-blue-600 text-white border-blue-500",
    rowClass: "border-l-blue-400 bg-blue-50/40",
    badgeClass: "bg-blue-100 text-blue-700 border-blue-200",
    dot: "bg-blue-400",
  },
};

/** Motifs rapides optionnels par statut */
const MOTIFS: Record<"ABSENT" | "LATE" | "EXCUSED", string[]> = {
  ABSENT: ["Non justifié", "Maladie", "Raison familiale", "Transport", "Autre"],
  LATE:   ["Transport", "Réveil tardif", "Raison familiale", "Autre"],
  EXCUSED: ["Certificat médical", "Convocation officielle", "Raison familiale", "Autre"],
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

function getToday(): string {
  return new Date().toISOString().split("T")[0];
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("fr-FR", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

function getInitials(firstName: string, lastName: string): string {
  return `${firstName?.charAt(0) ?? ""}${lastName?.charAt(0) ?? ""}`.toUpperCase();
}

/** Vrai nombre d'élèves (Prisma _count.students > studentCount stocké) */
function getStudentCount(cls: BackendClass): number {
  const computed = (cls as any)._count?.students;
  if (typeof computed === "number") return computed;
  return cls.studentCount ?? 0;
}

function groupClassesByLevel(classes: BackendClass[]): Record<string, BackendClass[]> {
  const groups: Record<string, BackendClass[]> = {};
  for (const cls of classes) {
    const level = cls.level?.trim() || "Autre";
    if (!groups[level]) groups[level] = [];
    groups[level].push(cls);
  }
  for (const level in groups) {
    groups[level].sort((a, b) => a.name.localeCompare(b.name, "fr"));
  }
  return groups;
}

function sortLevels(levels: string[]): string[] {
  const ORDER = [
    "maternelle", "petite section", "moyenne section", "grande section",
    "cp", "cp1", "cp2", "ce1", "ce2", "cm1", "cm2",
    "6ème", "5ème", "4ème", "3ème", "seconde", "première", "terminale",
  ];
  return levels.sort((a, b) => {
    const ia = ORDER.findIndex((o) => a.toLowerCase().includes(o));
    const ib = ORDER.findIndex((o) => b.toLowerCase().includes(o));
    if (ia === -1 && ib === -1) return a.localeCompare(b, "fr");
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

// ─── Helpers jours de cours ────────────────────────────────────────────────────

function isSchoolDay(date: Date, schoolDays: SchoolDays): boolean {
  const day = date.getDay(); // 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
  if (day === 0) return false; // Dimanche toujours congé
  if (day === 1) return schoolDays.monday;
  if (day === 2) return schoolDays.tuesday;
  if (day === 3) return schoolDays.wednesday;
  if (day === 4) return schoolDays.thursday;
  if (day === 5) return schoolDays.friday;
  if (day === 6) return schoolDays.saturday;
  return true;
}

// ─── Composant principal ───────────────────────────────────────────────────────

export default function AttendancePage() {
  const { user, refreshUserProfile, hasPermission } = useAuth();
  const isOnline = useOnline();
  const queryClient = useQueryClient();

  const role = (user?.role ?? "").toLowerCase();
  const canSeeOverview   = ["director", "admin", "supervisor"].includes(role);
  const canSaveAttendance = hasPermission("attendance", "create") || hasPermission("attendance", "edit");

  // Rafraîchit classAssignments depuis le serveur au montage de la page.
  // Garantit que si le directeur a modifié les classes du prof,
  // celui-ci voit immédiatement les changements sans se reconnecter.
  useEffect(() => {
    refreshUserProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Onglet actif — par défaut "marking", basculé vers "overview" après chargement user
  const [activeTab, setActiveTab] = useState<ActiveTab>("marking");
  const tabInitialized = useRef(false);

  useEffect(() => {
    if (user && !tabInitialized.current) {
      tabInitialized.current = true;
      const r = (user.role ?? "").toLowerCase();
      if (["director", "admin", "supervisor"].includes(r)) {
        setActiveTab("overview");
      }
    }
  }, [user]);

  // ── Jours de cours ───────────────────────────────────────────────────────────

  const [schoolDays, setSchoolDays] = useState<SchoolDays>({ ...DEFAULT_SCHOOL_DAYS });

  // ── État partagé ─────────────────────────────────────────────────────────────

  const [selectedDate, setSelectedDate] = useState<string>(getToday());
  const [selectedTime, setSelectedTime] = useState<string>(
    () => new Date().toTimeString().slice(0, 5)
  );
  const [selectedClassId, setSelectedClassId] = useState<string>("");

  const [rows, setRows] = useState<StudentRow[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [alreadySaved, setAlreadySaved] = useState(false);
  const [expandedClassId, setExpandedClassId] = useState<string | null>(null);

  // ── Classes : useQuery + filtre prof + offline ───────────────────────────────

  const CLASSES_LS_KEY = `structura_classes_cache:${user?.tenantId}`;
  const { data: allClassesData, isLoading: isLoadingClasses, refetch: refetchClasses, error: classesError } = useQuery({
    queryKey: CLASSES_QUERY_KEY(user?.tenantId),
    queryFn: async (): Promise<BackendClass[]> => {
      const token = storage.getAuthItem("structura_token");
      if (!token) throw new Error("Session expirée");
      const data = await getClasses(token);
      for (const cls of data) await offlineDB.update(STORES.CLASSES, cls).catch(() => {});
      // Sauvegarder dans localStorage pour affichage instantané au prochain chargement
      try { localStorage.setItem(CLASSES_LS_KEY, JSON.stringify(data)); } catch { /* quota */ }
      return data;
    },
    enabled: !!user,
    staleTime: 60_000,
    // Afficher le cache localStorage immédiatement pendant le fetch (connexion lente)
    placeholderData: () => {
      try {
        const cached = localStorage.getItem(CLASSES_LS_KEY);
        return cached ? (JSON.parse(cached) as BackendClass[]) : undefined;
      } catch { return undefined; }
    },
  });

  const [offlineClasses, setOfflineClasses] = useState<BackendClass[]>([]);
  // Charger au montage (pas seulement quand offline) : garantit que les données
  // IndexedDB sont disponibles même si l'app démarre directement hors ligne
  // (isOnline ne change jamais → l'effet conditionnel ne se déclencherait pas).
  useEffect(() => {
    offlineDB.getAll<BackendClass>(STORES.CLASSES).then(setOfflineClasses).catch(() => {});
  }, []);
  useEffect(() => {
    if (!classesError) return;
    offlineDB.getAll<BackendClass>(STORES.CLASSES).then(setOfflineClasses).catch(() => {});
  }, [classesError]);

  const classes = useMemo<BackendClass[]>(() => {
    const assignedClassIds = (user?.classAssignments ?? []).map((a: { classId: string }) => a.classId);
    const isTeacher = role === "teacher";
    let data = allClassesData ?? offlineClasses;
    if (isTeacher && assignedClassIds.length > 0) {
      data = data.filter((c) => assignedClassIds.includes(c.id));
    } else if (isTeacher) {
      data = [];
    }
    return [...data].sort((a, b) => {
      const lvl = (a.level || "").localeCompare(b.level || "", "fr");
      return lvl !== 0 ? lvl : a.name.localeCompare(b.name, "fr");
    });
  }, [allClassesData, offlineClasses, user?.classAssignments, role]);

  const selectedClass = classes.find((c) => c.id === selectedClassId);

  // ── Vue d'ensemble : toutes les présences d'une date ────────────────────────

  const { data: overviewAttendances = [], isLoading: isLoadingOverview } = useQuery({
    queryKey: ["attendance-overview", user?.tenantId, selectedDate],
    queryFn: async (): Promise<BackendAttendance[]> => {
      const token = storage.getAuthItem("structura_token");
      if (!token) throw new Error("Session expirée");
      return getAttendanceByDate(token, selectedDate);
    },
    enabled: isOnline && !!user && activeTab === "overview",
    staleTime: 30_000,
  });

  // ── Absences répétées : 30 jours glissants ──────────────────────────────────

  const { data: chronicAbsences = [], isLoading: isLoadingChronic } = useQuery({
    queryKey: ["attendance-chronic", user?.tenantId],
    queryFn: async (): Promise<ChronicAbsence[]> => {
      const token = storage.getAuthItem("structura_token");
      if (!token) return [];
      const endDate   = new Date();
      const startDate = new Date();
      startDate.setDate(endDate.getDate() - 30);
      const fmt = (d: Date) => d.toISOString().split("T")[0];
      const records = await getAttendances(token, { startDate: fmt(startDate), endDate: fmt(endDate) });
      const cachedClasses = queryClient.getQueryData<BackendClass[]>(CLASSES_QUERY_KEY(user?.tenantId)) ?? [];

      const byStudent = new Map<string, {
        studentId: string; studentName: string; matricule: string;
        className: string; absenceCount: number; lateCount: number;
        parentPhone?: string; parentName?: string;
      }>();
      for (const r of records) {
        if (r.status !== "ABSENT" && r.status !== "LATE") continue;
        if (!byStudent.has(r.studentId)) {
          const fallbackCls = cachedClasses.find((c) => c.id === r.classId);
          byStudent.set(r.studentId, {
            studentId:   r.studentId,
            studentName: r.student
              ? `${r.student.lastName?.toUpperCase()} ${r.student.firstName}`.trim()
              : r.studentId,
            matricule:   r.student?.matricule ?? "",
            className:   r.class
              ? formatClassName(r.class.name, r.class.section)
              : fallbackCls ? formatClassName(fallbackCls.name, fallbackCls.section) : "",
            absenceCount: 0, lateCount: 0,
            parentPhone: r.student?.parentPhone,
            parentName:  r.student?.parentName,
          });
        }
        const entry = byStudent.get(r.studentId)!;
        if (r.status === "ABSENT") entry.absenceCount++;
        if (r.status === "LATE")   entry.lateCount++;
      }
      const alerts: ChronicAbsence[] = [];
      for (const entry of byStudent.values()) {
        if (entry.absenceCount >= 3) {
          alerts.push({ ...entry, riskLevel: entry.absenceCount >= 5 ? "danger" : "warning" });
        }
      }
      return alerts.sort((a, b) => b.absenceCount - a.absenceCount);
    },
    enabled: isOnline && !!user && activeTab === "overview",
    staleTime: 5 * 60_000,
  });

  // ── Marquage : élèves + présences existantes d'une classe ───────────────────

  const { data: markingData, isLoading: isLoadingStudents, refetch: refetchMarking } = useQuery({
    queryKey: ["attendance-marking", user?.tenantId, selectedClassId, selectedDate],
    queryFn: async (): Promise<{ students: BackendStudent[]; existingAttendances: BackendAttendance[] }> => {
      const token = storage.getAuthItem("structura_token");
      if (!token) throw new Error("Session expirée");
      const [students, existingAttendances] = await Promise.all([
        getStudents(token, { classId: selectedClassId }),
        getAttendanceByDate(token, selectedDate, selectedClassId),
      ]);
      for (const s of students) await offlineDB.update(STORES.STUDENTS, s).catch(() => {});
      return { students, existingAttendances };
    },
    enabled: isOnline && !!user && !!selectedClassId && activeTab === "marking",
    staleTime: 30_000,
  });

  // Offline fallback pour le marquage
  const [offlineMarkingData, setOfflineMarkingData] = useState<{ students: BackendStudent[]; existingAttendances: BackendAttendance[] } | null>(null);
  useEffect(() => {
    if (isOnline || !selectedClassId) { setOfflineMarkingData(null); return; }
    const load = async () => {
      const allStudents = await offlineDB.getAll<BackendStudent>(STORES.STUDENTS);
      const students = allStudents.filter((s) => s.classId === selectedClassId);
      const allAtt = await offlineDB.getAll<BackendAttendance>(STORES.ATTENDANCE);
      const existingAttendances = allAtt.filter(
        (a) => a.classId === selectedClassId && a.date?.startsWith(selectedDate)
      );
      setOfflineMarkingData({ students, existingAttendances });
    };
    load().catch(() => {});
  }, [isOnline, selectedClassId, selectedDate]);

  // Sync rows depuis les données (online ou offline)
  useEffect(() => {
    const source = markingData ?? offlineMarkingData;
    if (!source) { setRows([]); setAlreadySaved(false); return; }
    const { students, existingAttendances } = source;
    const attMap = new Map<string, BackendAttendance>();
    for (const att of existingAttendances) attMap.set(att.studentId, att);
    setAlreadySaved(existingAttendances.length > 0);
    const studentRows: StudentRow[] = students
      .map((s) => {
        const existing = attMap.get(s.id);
        const status = (existing?.status as AttendanceStatus) ?? null;
        const notes  = existing?.notes ?? "";
        return {
          studentId: s.id, firstName: s.firstName, lastName: s.lastName,
          matricule: s.matricule, status, notes,
          existingId: existing?.id, originalStatus: status ?? undefined,
          originalNotes: notes, notesOpen: false,
        };
      })
      .sort((a, b) => {
        const last = a.lastName.localeCompare(b.lastName, "fr");
        return last !== 0 ? last : a.firstName.localeCompare(b.firstName, "fr");
      });
    setRows(studentRows);
  }, [markingData, offlineMarkingData]);

  // Rafraîchir les classes quand l'utilisateur revient sur l'onglet
  useRefreshOnFocus(refetchClasses);

  // ── Effects ──────────────────────────────────────────────────────────────────

  // Charger la config jours de cours au montage
  useEffect(() => {
    const token = storage.getAuthItem("structura_token");
    if (token) {
      getFeesConfig(token)
        .then((cfg) => { if (cfg.schoolDays) setSchoolDays(migrateSchoolDays(cfg.schoolDays)); })
        .catch(() => { /* silencieux — valeurs par défaut utilisées */ });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Actions sur les lignes ───────────────────────────────────────────────────

  const setStatus = useCallback((studentId: string, status: AttendanceStatus) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.studentId !== studentId) return r;
        const newStatus = r.status === status ? null : status;
        return {
          ...r,
          status: newStatus,
          // Ouvrir la zone motif automatiquement pour absence/retard/excusé
          notesOpen: (newStatus === "ABSENT" || newStatus === "LATE" || newStatus === "EXCUSED")
            ? true
            : r.notesOpen,
        };
      })
    );
  }, []);

  const setNotes = useCallback((studentId: string, notes: string) => {
    setRows((prev) => prev.map((r) => r.studentId === studentId ? { ...r, notes } : r));
  }, []);

  const toggleNotes = useCallback((studentId: string) => {
    setRows((prev) =>
      prev.map((r) => r.studentId === studentId ? { ...r, notesOpen: !r.notesOpen } : r)
    );
  }, []);

  /** Chip motif : toggle — si déjà sélectionné, efface ; sinon, applique */
  const applyMotif = useCallback((studentId: string, motif: string) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.studentId !== studentId) return r;
        return { ...r, notes: r.notes === motif ? "" : motif };
      })
    );
  }, []);

  const markAllPresent = () => {
    setRows((prev) =>
      prev.map((r) => ({ ...r, status: "PRESENT" as AttendanceStatus, notesOpen: false, notes: "" }))
    );
    toast.success(`${rows.length} élèves marqués présents`);
  };

  const resetAll = () => {
    setRows((prev) =>
      prev.map((r) => ({
        ...r,
        status:    r.originalStatus ?? null,
        notes:     r.originalNotes ?? "",
        notesOpen: false,
      }))
    );
  };

  // ── Enregistrement (online / offline) ────────────────────────────────────────

  const handleSave = async () => {
    const unmarked = rows.filter((r) => r.status === null);
    if (unmarked.length > 0) {
      toast.error(`${unmarked.length} élève(s) sans statut — marquez-les tous avant d'enregistrer`);
      return;
    }

    const token    = storage.getAuthItem("structura_token");
    const markedBy = user ? `${user.firstName} ${user.lastName}`.trim() : "Inconnu";
    const dateTime = `${selectedDate}T${selectedTime}:00`;

    if (isOnline && token) {
      // ── UI optimiste : feedback immédiat ──────────────────────────────────
      const previousRows = [...rows];
      setRows((prev) =>
        prev.map((r) => ({ ...r, originalStatus: r.status ?? undefined, originalNotes: r.notes }))
      );
      setAlreadySaved(true);
      const pCount = rows.filter((r) => r.status === "PRESENT").length;
      const aCount = rows.filter((r) => r.status === "ABSENT").length;
      const lCount = rows.filter((r) => r.status === "LATE").length;
      const eCount = rows.filter((r) => r.status === "EXCUSED").length;
      toast.success(
        `Présences enregistrées — ${pCount} présents · ${aCount} absents · ${lCount} retards · ${eCount} excusés`
      );

      // ── API en arrière-plan ────────────────────────────────────────────────
      setIsSaving(true);
      try {
        const newRows     = previousRows.filter((r) => !r.existingId);
        const changedRows = previousRows.filter(
          (r) => r.existingId && (r.status !== r.originalStatus || r.notes !== r.originalNotes)
        );
        const promises: Promise<any>[] = [];

        if (newRows.length > 0) {
          promises.push(
            bulkCreateAttendance(token, {
              date:        dateTime,
              classId:     selectedClassId,
              markedBy,
              attendances: newRows.map((r) => ({
                studentId: r.studentId,
                status:    r.status!,
                notes:     r.notes || undefined,
              })),
            })
          );
        }
        for (const r of changedRows) {
          promises.push(
            updateAttendance(token, r.existingId!, {
              status: r.status!,
              notes:  r.notes || undefined,
            })
          );
        }

        await Promise.all(promises);
        if (newRows.length > 0) await refetchMarking();
      } catch (err: any) {
        // Rollback : restaurer l'état précédent
        setRows(previousRows);
        setAlreadySaved(false);
        toast.error(err?.message || "Erreur lors de l'enregistrement — veuillez réessayer");
      } finally {
        setIsSaving(false);
      }
      return;
    }

    // ── Mode hors ligne ────────────────────────────────────────────────────────
    setIsSaving(true);
    try {
      for (const r of rows) {
        const localId = r.existingId || `att-${r.studentId}-${selectedDate}`;
        const record = {
          id: localId, studentId: r.studentId, classId: selectedClassId,
          date: dateTime, status: r.status!, notes: r.notes, markedBy,
        };
        try {
          const ex = await offlineDB.getById(STORES.ATTENDANCE, localId);
          if (ex) await offlineDB.update(STORES.ATTENDANCE, record);
          else     await offlineDB.add(STORES.ATTENDANCE, record);
        } catch {
          await offlineDB.add(STORES.ATTENDANCE, record);
        }
      }
      for (const r of rows) {
        await syncQueue.add({
          type: "attendance", action: "create",
          data: {
            studentId: r.studentId, classId: selectedClassId,
            date: dateTime, status: r.status!, notes: r.notes || undefined, markedBy,
          },
        });
      }
      setAlreadySaved(true);
      const pCount = rows.filter((r) => r.status === "PRESENT").length;
      toast.info(
        `Présences enregistrées (${pCount}/${rows.length} présents) — envoi automatique dès la reconnexion.`,
        { duration: 5000 }
      );
    } catch (err: any) {
      toast.error(err?.message || "Erreur lors de l'enregistrement");
    } finally {
      setIsSaving(false);
    }
  };

  // ── Stats marquage ───────────────────────────────────────────────────────────

  const total        = rows.length;
  const presentCount = rows.filter((r) => r.status === "PRESENT").length;
  const absentCount  = rows.filter((r) => r.status === "ABSENT").length;
  const lateCount    = rows.filter((r) => r.status === "LATE").length;
  const excusedCount = rows.filter((r) => r.status === "EXCUSED").length;
  const unmarkedCount = rows.filter((r) => r.status === null).length;
  const markedCount  = total - unmarkedCount;
  const progress     = total > 0 ? Math.round((markedCount / total) * 100) : 0;
  const attendanceRate = total > 0 ? Math.round(((presentCount + lateCount) / total) * 100) : 0;
  const hasChanges   = rows.some((r) => r.status !== r.originalStatus || r.notes !== r.originalNotes);
  const nonSchoolDay = !isSchoolDay(new Date(selectedDate + "T00:00:00"), schoolDays);
  // Verrou temporel : jour passé → plus modifiable ; aujourd'hui ≥ 18h → clôture de saisie
  const isAttendanceLocked = selectedDate < getToday() || (selectedDate === getToday() && new Date().getHours() >= 18);
  const saveDisabled = isSaving || unmarkedCount > 0 || (!hasChanges && alreadySaved) || nonSchoolDay || isAttendanceLocked;

  // ── Données vue d'ensemble ───────────────────────────────────────────────────

  const attByClass = new Map<string, BackendAttendance[]>();
  for (const att of overviewAttendances) {
    if (!att.classId) continue;
    if (!attByClass.has(att.classId)) attByClass.set(att.classId, []);
    attByClass.get(att.classId)!.push(att);
  }

  const totalClasses   = classes.length;
  const markedClasses  = classes.filter((c) => (attByClass.get(c.id)?.length ?? 0) > 0).length;
  const unmarkedClasses = totalClasses - markedClasses;
  const allPresent  = overviewAttendances.filter((a) => a.status === "PRESENT").length;
  const allAbsent   = overviewAttendances.filter((a) => a.status === "ABSENT").length;
  const allLate     = overviewAttendances.filter((a) => a.status === "LATE").length;
  const allTotal    = overviewAttendances.length;
  const globalRate  = allTotal > 0 ? Math.round(((allPresent + allLate) / allTotal) * 100) : 0;

  const absenceAlerts: AbsenceAlert[] = overviewAttendances
    .filter((a) => a.status === "ABSENT" || a.status === "LATE")
    .map((a) => {
      const fallbackCls = classes.find((c) => c.id === a.classId);
      return {
        studentId:   a.studentId,
        studentName: a.student
          ? `${a.student.lastName?.toUpperCase()} ${a.student.firstName}`.trim()
          : a.studentId,
        matricule:  a.student?.matricule ?? "",
        className:  a.class
          ? formatClassName(a.class.name, a.class.section)
          : fallbackCls
            ? formatClassName(fallbackCls.name, fallbackCls.section)
            : a.classId ?? "",
        status:      a.status as "ABSENT" | "LATE",
        notes:       a.notes,
        parentName:  a.student?.parentName,
        parentPhone: a.student?.parentPhone,
      };
    })
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === "ABSENT" ? -1 : 1;
      return a.studentName.localeCompare(b.studentName, "fr");
    });

  // ── Select classes groupées ──────────────────────────────────────────────────

  const classesByLevel = groupClassesByLevel(classes);
  const sortedLevels   = sortLevels(Object.keys(classesByLevel));

  // ─── Rendu ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5 max-w-5xl">

      {/* ── En-tête ── */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Présences</h1>
          <p className="text-muted-foreground mt-1 capitalize">{formatDate(selectedDate)}</p>
        </div>
        <div className="flex items-center gap-2">
          {alreadySaved && activeTab === "marking" && (
            <Badge className="bg-emerald-100 text-emerald-700 border border-emerald-200">
              <FileCheck className="h-3 w-3 mr-1" />
              Déjà enregistrée
            </Badge>
          )}
          {!isOnline && (
            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
              <WifiOff className="h-3 w-3 mr-1" />
              Hors ligne
            </Badge>
          )}
        </div>
      </div>

      {/* ── Onglets + sélecteur date dans une barre unifiée ── */}
      <div className={`rounded-xl border bg-card shadow-sm ${canSeeOverview ? "" : ""}`}>
        {/* Onglets */}
        {canSeeOverview && (
          <div className="flex border-b">
            <button
              onClick={() => setActiveTab("overview")}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-all -mb-px ${
                activeTab === "overview"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
              }`}
            >
              <BarChart3 className="h-4 w-4" />
              Vue d'ensemble
              {unmarkedClasses > 0 && (
                <span className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-amber-500 text-white text-[10px] font-bold">
                  {unmarkedClasses}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab("marking")}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-all -mb-px ${
                activeTab === "marking"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
              }`}
            >
              <Check className="h-4 w-4" />
              Marquer les présences
            </button>
          </div>
        )}

        {/* Sélecteur date + heure */}
        <div className="px-5 py-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex-1 min-w-[160px] space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                Date
              </label>
              <input
                type="date"
                value={selectedDate}
                max={getToday()}
                onChange={(e) => { setSelectedDate(e.target.value); setExpandedClassId(null); }}
                className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
              />
            </div>
            {activeTab === "marking" && (
              <div className="flex-1 min-w-[130px] space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                  <Timer className="h-3.5 w-3.5" />
                  Heure de séance
                </label>
                <input
                  type="time"
                  value={selectedTime}
                  onChange={(e) => setSelectedTime(e.target.value)}
                  className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
                />
              </div>
            )}
            <div className="pb-0.5 text-sm text-muted-foreground capitalize font-medium hidden sm:block">
              {formatDate(selectedDate)}
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* TAB : VUE D'ENSEMBLE                                                  */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === "overview" && (
        <div className="space-y-5">
          {isLoadingOverview ? (
            <Card className="shadow-sm">
              <CardContent className="py-20 text-center">
                <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
                <p className="text-sm text-muted-foreground mt-3">Chargement des présences…</p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* ── 4 cartes stats globales ── */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Card className="shadow-sm">
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <Eye className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <div className="text-2xl font-bold">
                          {markedClasses}
                          <span className="text-sm font-normal text-muted-foreground">/{totalClasses}</span>
                        </div>
                        <div className="text-xs text-muted-foreground">Classes marquées</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="shadow-sm">
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                        <Check className="h-4 w-4 text-emerald-600" />
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-emerald-700">{globalRate}%</div>
                        <div className="text-xs text-muted-foreground">Taux de présence</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="shadow-sm">
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                        <X className="h-4 w-4 text-red-600" />
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-red-700">{allAbsent + allLate}</div>
                        <div className="text-xs text-muted-foreground">Absences signalées</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className={`shadow-sm ${unmarkedClasses > 0 ? "border-amber-300" : ""}`}>
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-center gap-3">
                      <div className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 ${
                        unmarkedClasses > 0 ? "bg-amber-100" : "bg-emerald-100"
                      }`}>
                        <AlertCircle className={`h-4 w-4 ${
                          unmarkedClasses > 0 ? "text-amber-600" : "text-emerald-600"
                        }`} />
                      </div>
                      <div>
                        <div className={`text-2xl font-bold ${
                          unmarkedClasses > 0 ? "text-amber-600" : "text-emerald-600"
                        }`}>
                          {unmarkedClasses}
                        </div>
                        <div className="text-xs text-muted-foreground">Classes non marquées</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* ── Liste par classe ── */}
              <Card className="shadow-sm">
                <CardHeader className="pb-2 pt-5 px-5">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                      <History className="h-4 w-4 text-muted-foreground" />
                      État par classe
                    </CardTitle>
                    <span className="text-xs text-muted-foreground">
                      {markedClasses}/{totalClasses} marquées
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="px-0 pb-0">
                  {classes.length === 0 ? (
                    <p className="text-sm text-muted-foreground px-5 pb-4">Aucune classe configurée.</p>
                  ) : (
                    <div className="divide-y">
                      {classes.map((cls) => {
                        const records = attByClass.get(cls.id) ?? [];
                        const clsTotal = getStudentCount(cls);
                        const p = records.filter((r) => r.status === "PRESENT").length;
                        const a = records.filter((r) => r.status === "ABSENT").length;
                        const l = records.filter((r) => r.status === "LATE").length;
                        const e = records.filter((r) => r.status === "EXCUSED").length;
                        const rate = records.length > 0
                          ? Math.round(((p + l) / records.length) * 100)
                          : 0;
                        const isMarked = records.length > 0;
                        const isExpanded = expandedClassId === cls.id;

                        // Élèves triés : absents+retards en premier
                        const sortedRecords = [...records].sort((x, y) => {
                          const order: Record<string, number> = { ABSENT: 0, LATE: 1, EXCUSED: 2, PRESENT: 3 };
                          return (order[x.status] ?? 9) - (order[y.status] ?? 9);
                        });

                        return (
                          <div key={cls.id}>
                            {/* Ligne principale */}
                            <div className={`px-5 py-3.5 ${isMarked ? "" : "bg-amber-50/40"}`}>
                              <div className="flex items-center gap-3">
                                {/* Indicateur statut */}
                                <div className={`h-2 w-2 rounded-full shrink-0 ${
                                  isMarked
                                    ? rate >= 80 ? "bg-emerald-500" : rate >= 60 ? "bg-orange-400" : "bg-red-500"
                                    : "bg-amber-400"
                                }`} />

                                {/* Nom classe */}
                                <div className="flex-1 min-w-0">
                                  <div className="font-semibold text-sm truncate">
                                    {formatClassName(cls.name, cls.section)}
                                  </div>
                                  <div className="text-xs text-muted-foreground mt-0.5">
                                    {clsTotal} élève{clsTotal !== 1 ? "s" : ""}
                                    {cls.level && <> · <span>{cls.level}</span></>}
                                  </div>
                                </div>

                                {/* Badge + stats condensées */}
                                {isMarked ? (
                                  <div className="flex items-center gap-3 shrink-0">
                                    <div className="hidden sm:flex items-center gap-2 text-xs">
                                      <span className="text-emerald-600 font-semibold">{p}P</span>
                                      {a > 0 && <span className="text-red-600 font-semibold">{a}A</span>}
                                      {l > 0 && <span className="text-orange-500 font-semibold">{l}R</span>}
                                      {e > 0 && <span className="text-blue-500 font-semibold">{e}E</span>}
                                      <span className={`font-bold ${
                                        rate >= 80 ? "text-emerald-600" : rate >= 60 ? "text-orange-500" : "text-red-600"
                                      }`}>{rate}%</span>
                                    </div>
                                    <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[10px] px-1.5 py-0">
                                      <Check className="h-2.5 w-2.5 mr-0.5" />Marquée
                                    </Badge>
                                    <button
                                      onClick={() => setExpandedClassId(isExpanded ? null : cls.id)}
                                      className="flex items-center gap-0.5 text-xs text-primary font-medium hover:underline shrink-0"
                                    >
                                      {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                                      <span className="hidden sm:inline">{isExpanded ? "Masquer" : "Détail"}</span>
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-2 shrink-0">
                                    <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-[10px] px-1.5 py-0 whitespace-nowrap">
                                      En attente
                                    </Badge>
                                    <button
                                      onClick={() => { setSelectedClassId(cls.id); setActiveTab("marking"); }}
                                      className="text-xs text-primary font-medium hover:underline shrink-0"
                                    >
                                      Marquer →
                                    </button>
                                  </div>
                                )}
                              </div>

                              {/* Barre de progression — visible sur mobile sous le nom */}
                              {isMarked && (
                                <div className="mt-2 sm:hidden">
                                  <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                                    <span className="flex gap-2">
                                      <span className="text-emerald-600 font-medium">{p}P</span>
                                      {a > 0 && <span className="text-red-600 font-medium">{a}A</span>}
                                      {l > 0 && <span className="text-orange-500 font-medium">{l}R</span>}
                                    </span>
                                    <span className={`font-bold ${rate >= 80 ? "text-emerald-600" : rate >= 60 ? "text-orange-500" : "text-red-600"}`}>{rate}%</span>
                                  </div>
                                  <div className="w-full bg-muted rounded-full h-1">
                                    <div
                                      className={`h-1 rounded-full ${rate >= 80 ? "bg-emerald-500" : rate >= 60 ? "bg-orange-400" : "bg-red-500"}`}
                                      style={{ width: `${rate}%` }}
                                    />
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Détail dépliable : liste des élèves */}
                            {isExpanded && isMarked && (
                              <div className="bg-muted/30 border-t px-5 py-3 space-y-1.5">
                                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                                  Détail · {formatDate(selectedDate)}
                                </div>
                                {sortedRecords.length === 0 ? (
                                  <p className="text-xs text-muted-foreground">Aucun enregistrement.</p>
                                ) : (
                                  sortedRecords.map((r) => {
                                    const sStatus = r.status as AttendanceStatus;
                                    const cfg = STATUS_CONFIG[sStatus];
                                    const name = r.student
                                      ? `${r.student.lastName?.toUpperCase() ?? ""} ${r.student.firstName ?? ""}`.trim()
                                      : r.studentId;
                                    return (
                                      <div key={r.id} className="flex items-center justify-between gap-2 py-1 border-b border-border/40 last:border-0">
                                        <div className="flex items-center gap-2 min-w-0">
                                          <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${cfg.dot}`} />
                                          <span className="text-sm font-medium truncate">{name}</span>
                                          {r.student?.matricule && (
                                            <span className="text-[10px] text-muted-foreground hidden sm:inline">{r.student.matricule}</span>
                                          )}
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                          {r.notes && (
                                            <span className="text-[10px] text-muted-foreground italic hidden sm:inline max-w-[120px] truncate">"{r.notes}"</span>
                                          )}
                                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${cfg.badgeClass}`}>
                                            {cfg.label}
                                          </span>
                                          {r.student?.parentPhone && sStatus !== "PRESENT" && (
                                            <a
                                              href={`tel:${r.student.parentPhone}`}
                                              className="text-primary"
                                              title={`Appeler ${r.student.parentName || "le parent"}`}
                                            >
                                              <Phone className="h-3 w-3" />
                                            </a>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* ── Liste absences & retards avec téléphone parent ── */}
              {absenceAlerts.length > 0 && (
                <Card className="shadow-sm">
                  <CardHeader className="pb-3 pt-5 px-5">
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 text-red-500" />
                      Absences &amp; Retards du jour
                      <Badge className="bg-red-100 text-red-700 border-red-200 ml-auto">
                        {absenceAlerts.length}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-0 pb-0">
                    <div className="divide-y">
                      {absenceAlerts.map((alert, idx) => (
                        <div
                          key={`${alert.studentId}-${idx}`}
                          className="flex items-center gap-3 px-5 py-3 hover:bg-muted/30 transition-colors"
                        >
                          <Avatar className="h-9 w-9 shrink-0">
                            <AvatarFallback
                              className={`text-xs font-bold ${
                                alert.status === "ABSENT"
                                  ? "bg-red-100 text-red-700"
                                  : "bg-orange-100 text-orange-700"
                              }`}
                            >
                              {alert.studentName.split(" ").slice(0, 2).map((n) => n[0]).join("")}
                            </AvatarFallback>
                          </Avatar>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-sm">{alert.studentName}</span>
                              <Badge
                                className={`text-[10px] py-0 px-1.5 ${
                                  alert.status === "ABSENT"
                                    ? "bg-red-100 text-red-700 border-red-200"
                                    : "bg-orange-100 text-orange-700 border-orange-200"
                                }`}
                              >
                                {alert.status === "ABSENT" ? "Absent" : "Retard"}
                              </Badge>
                            </div>
                            <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                              <span>{alert.className}</span>
                              {alert.matricule && (
                                <><span className="opacity-40">·</span><span>{alert.matricule}</span></>
                              )}
                              {alert.notes && (
                                <><span className="opacity-40">·</span><span className="italic">"{alert.notes}"</span></>
                              )}
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            {alert.parentPhone ? (
                              <a
                                href={`tel:${alert.parentPhone}`}
                                className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                                title={`Appeler ${alert.parentName || "le parent"}`}
                              >
                                <Phone className="h-3.5 w-3.5" />
                                {alert.parentPhone}
                              </a>
                            ) : (
                              <span className="text-xs text-muted-foreground italic">Pas de tél.</span>
                            )}
                            {alert.parentName && (
                              <div className="text-xs text-muted-foreground mt-0.5">{alert.parentName}</div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* ── Tout bon — aucune absence ── */}
              {absenceAlerts.length === 0 && overviewAttendances.length > 0 && (
                <Card className="shadow-sm border-emerald-200">
                  <CardContent className="py-10 text-center">
                    <div className="h-12 w-12 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-3">
                      <Check className="h-6 w-6 text-emerald-600" />
                    </div>
                    <p className="font-semibold text-emerald-700">Aucune absence ni retard aujourd'hui !</p>
                    <p className="text-sm text-muted-foreground mt-1">Excellent taux de présence.</p>
                  </CardContent>
                </Card>
              )}

              {/* ── Élèves à risque : absences répétées (30j) ── */}
              {(chronicAbsences.length > 0 || isLoadingChronic) && (
                <Card className="shadow-sm border-orange-200">
                  <CardHeader className="pb-3 pt-5 px-5">
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 text-orange-500" />
                      Élèves à risque — Absences répétées
                      <span className="text-xs font-normal text-muted-foreground">(30 derniers jours)</span>
                      {!isLoadingChronic && (
                        <Badge className="bg-orange-100 text-orange-700 border-orange-200 ml-auto">
                          {chronicAbsences.length}
                        </Badge>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-0 pb-0">
                    {isLoadingChronic ? (
                      <div className="px-5 pb-4 flex items-center gap-2 text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span className="text-sm">Analyse des 30 derniers jours…</span>
                      </div>
                    ) : (
                      <div className="divide-y">
                        {chronicAbsences.map((ca, idx) => (
                          <div
                            key={`${ca.studentId}-${idx}`}
                            className="flex items-center gap-3 px-5 py-3 hover:bg-muted/30 transition-colors"
                          >
                            <Avatar className="h-9 w-9 shrink-0">
                              <AvatarFallback
                                className={`text-xs font-bold ${
                                  ca.riskLevel === "danger"
                                    ? "bg-red-100 text-red-700"
                                    : "bg-orange-100 text-orange-700"
                                }`}
                              >
                                {ca.studentName.split(" ").slice(0, 2).map((n) => n[0]).join("")}
                              </AvatarFallback>
                            </Avatar>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-semibold text-sm">{ca.studentName}</span>
                                <Badge
                                  className={`text-[10px] py-0 px-1.5 ${
                                    ca.riskLevel === "danger"
                                      ? "bg-red-100 text-red-700 border-red-200"
                                      : "bg-orange-100 text-orange-700 border-orange-200"
                                  }`}
                                >
                                  {ca.riskLevel === "danger" ? "⚠ Critique" : "Attention"}
                                </Badge>
                              </div>
                              <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                                <span>{ca.className}</span>
                                {ca.matricule && (
                                  <><span className="opacity-40">·</span><span>{ca.matricule}</span></>
                                )}
                                <span className="opacity-40">·</span>
                                <span className="text-red-600 font-medium">
                                  {ca.absenceCount} absence{ca.absenceCount > 1 ? "s" : ""}
                                </span>
                                {ca.lateCount > 0 && (
                                  <span className="text-orange-500 font-medium">
                                    · {ca.lateCount} retard{ca.lateCount > 1 ? "s" : ""}
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="text-right shrink-0">
                              {ca.parentPhone ? (
                                <a
                                  href={`tel:${ca.parentPhone}`}
                                  className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                                  title={`Appeler ${ca.parentName || "le parent"}`}
                                >
                                  <Phone className="h-3.5 w-3.5" />
                                  {ca.parentPhone}
                                </a>
                              ) : (
                                <span className="text-xs text-muted-foreground italic">Pas de tél.</span>
                              )}
                              {ca.parentName && (
                                <div className="text-xs text-muted-foreground mt-0.5">{ca.parentName}</div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* ── Aucune présence pour cette date ── */}
              {overviewAttendances.length === 0 && !isLoadingOverview && (
                <Card className="shadow-sm">
                  <CardContent className="py-16 text-center text-muted-foreground">
                    <BarChart3 className="h-10 w-10 mx-auto mb-3 opacity-20" />
                    <p className="font-medium text-sm">Aucune présence enregistrée pour cette date</p>
                    <p className="text-xs mt-1">
                      Utilisez l'onglet "Marquer les présences" pour commencer
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-4"
                      onClick={() => setActiveTab("marking")}
                    >
                      Marquer les présences
                    </Button>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* TAB : MARQUER LES PRÉSENCES                                           */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === "marking" && (
        <div className="space-y-5">

          {/* ── Sélecteur de classe ── */}
          <Card className="shadow-sm">
            <CardContent className="pt-5 pb-5">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                  <GraduationCap className="h-4 w-4 text-primary" />
                  Classe
                </label>
                <Select
                  value={selectedClassId}
                  onValueChange={setSelectedClassId}
                  disabled={isLoadingClasses}
                >
                  <SelectTrigger className="h-10">
                    <SelectValue
                      placeholder={isLoadingClasses ? "Chargement…" : "Choisir une classe…"}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {classes.length === 0 ? (
                      <SelectItem value="__empty__" disabled>Aucune classe disponible</SelectItem>
                    ) : sortedLevels.length === 1 ? (
                      classesByLevel[sortedLevels[0]].map((cls) => {
                        const count = getStudentCount(cls);
                        return (
                          <SelectItem key={cls.id} value={cls.id}>
                            {formatClassName(cls.name, cls.section)}
                            <span className="text-muted-foreground ml-1 text-xs">
                              · {count} élève{count !== 1 ? "s" : ""}
                            </span>
                          </SelectItem>
                        );
                      })
                    ) : (
                      sortedLevels.map((level) => (
                        <SelectGroup key={level}>
                          <SelectLabel className="text-xs uppercase tracking-wide text-muted-foreground">
                            {level}
                          </SelectLabel>
                          {classesByLevel[level].map((cls) => {
                            const count = getStudentCount(cls);
                            return (
                              <SelectItem key={cls.id} value={cls.id}>
                                {formatClassName(cls.name, cls.section)}
                                <span className="text-muted-foreground ml-1 text-xs">
                                  · {count} élève{count !== 1 ? "s" : ""}
                                </span>
                              </SelectItem>
                            );
                          })}
                        </SelectGroup>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* ── Bannière classe sélectionnée ── */}
          {selectedClass && (
            <div className="flex items-center gap-4 px-5 py-3 rounded-xl border bg-card shadow-sm">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <GraduationCap className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-base truncate">
                  {formatClassName(selectedClass.name, selectedClass.section)}
                </div>
                <div className="text-sm text-muted-foreground">
                  {selectedClass.level}
                  {(() => {
                    const count = getStudentCount(selectedClass);
                    return <> · <span className="font-medium text-foreground">{count} élève{count !== 1 ? "s" : ""}</span></>;
                  })()}
                  {selectedClass.teacherName && (
                    <> · Prof : <span className="font-medium text-foreground">{selectedClass.teacherName}</span></>
                  )}
                </div>
              </div>
              <div className="text-right shrink-0 hidden sm:block">
                <div className="text-xs text-muted-foreground flex items-center justify-end gap-1">
                  <Timer className="h-3 w-3" /> {selectedTime}
                </div>
                <div className="text-sm font-semibold capitalize">
                  {new Date(selectedDate + "T00:00:00").toLocaleDateString("fr-FR", {
                    weekday: "short", day: "numeric", month: "short",
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ── Statistiques + barre de progression ── */}
          {selectedClassId && rows.length > 0 && (
            <Card className="shadow-sm">
              <CardContent className="pt-4 pb-4">
                <div className="mb-4 space-y-1.5">
                  <div className="flex justify-between items-center text-sm">
                    <span className="font-medium">
                      {markedCount === total ? (
                        <span className="text-emerald-600">✓ Tous les élèves ont été marqués</span>
                      ) : (
                        <span className="text-muted-foreground">{markedCount} / {total} élèves marqués</span>
                      )}
                    </span>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground">
                        Taux : <span className="font-semibold text-foreground">{attendanceRate}%</span>
                      </span>
                      <span className="font-semibold text-primary">{progress}%</span>
                    </div>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all duration-300 ${
                        progress === 100 ? "bg-emerald-500" : "bg-primary"
                      }`}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { count: presentCount, label: "Présents",  icon: <Check className="h-4 w-4 text-emerald-600" />, bg: "bg-emerald-50 border-emerald-100", num: "text-emerald-700" },
                    { count: absentCount,  label: "Absents",   icon: <X className="h-4 w-4 text-red-600" />,       bg: "bg-red-50 border-red-100",         num: "text-red-700" },
                    { count: lateCount,    label: "Retards",   icon: <Clock className="h-4 w-4 text-orange-500" />, bg: "bg-orange-50 border-orange-100",   num: "text-orange-600" },
                    { count: excusedCount, label: "Excusés",   icon: <ShieldCheck className="h-4 w-4 text-blue-500" />, bg: "bg-blue-50 border-blue-100",  num: "text-blue-600" },
                  ].map(({ count, label, icon, bg, num }) => (
                    <div key={label} className={`flex items-center gap-3 p-3 rounded-lg border ${bg}`}>
                      <div className="h-8 w-8 rounded-full bg-white/80 border flex items-center justify-center shrink-0">
                        {icon}
                      </div>
                      <div>
                        <div className={`text-2xl font-bold ${num}`}>{count}</div>
                        <div className="text-xs text-muted-foreground">{label}</div>
                      </div>
                    </div>
                  ))}
                </div>

                {unmarkedCount > 0 && (
                  <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-md bg-amber-50 border border-amber-200">
                    <div className="h-2 w-2 rounded-full bg-amber-400 shrink-0" />
                    <p className="text-sm text-amber-700 font-medium">
                      {unmarkedCount} élève{unmarkedCount > 1 ? "s" : ""} sans statut
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* ── Liste des élèves ── */}
          {selectedClassId && (
            <Card className="shadow-sm">
              <CardHeader className="pb-0 pt-5 px-5">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <CardTitle className="text-base font-semibold">
                    Liste des élèves
                    {rows.length > 0 && (
                      <span className="ml-2 text-sm font-normal text-muted-foreground">
                        ({rows.length} élève{rows.length > 1 ? "s" : ""}, ordre alphabétique)
                      </span>
                    )}
                  </CardTitle>
                  {rows.length > 0 && (
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={resetAll} disabled={isSaving || isAttendanceLocked} className="h-8 text-xs">
                        <RotateCcw className="h-3.5 w-3.5 mr-1" /> Réinitialiser
                      </Button>
                      <Button
                        variant="outline" size="sm" onClick={markAllPresent} disabled={isSaving || isAttendanceLocked}
                        className="h-8 text-xs text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                      >
                        <Check className="h-3.5 w-3.5 mr-1" /> Tous présents
                      </Button>
                    </div>
                  )}
                </div>

                {rows.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3 pb-4 border-b">
                    {(["PRESENT", "ABSENT", "LATE", "EXCUSED"] as AttendanceStatus[]).map((s) => (
                      <span
                        key={s}
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border ${STATUS_CONFIG[s].badgeClass}`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${STATUS_CONFIG[s].dot}`} />
                        {STATUS_CONFIG[s].label}
                      </span>
                    ))}
                  </div>
                )}
              </CardHeader>

              <CardContent className="pt-3 px-3">
                {isLoadingStudents ? (
                  <div className="py-20 text-center">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
                    <p className="text-sm text-muted-foreground mt-3">
                      Chargement de <span className="font-medium">{selectedClass?.name}</span>…
                    </p>
                  </div>
                ) : rows.length === 0 ? (
                  <div className="py-20 text-center text-muted-foreground">
                    <Users className="h-12 w-12 mx-auto mb-3 opacity-25" />
                    <p className="font-medium text-sm">Aucun élève dans cette classe</p>
                    <p className="text-xs mt-1 text-muted-foreground/70">
                      Ajoutez des élèves via la section Élèves
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="space-y-1.5">
                      {rows.map((row, idx) => {
                        const motifs = (row.status && row.status !== "PRESENT")
                          ? MOTIFS[row.status]
                          : [];

                        return (
                          <div
                            key={row.studentId}
                            className={`rounded-lg border-l-4 border transition-colors ${
                              row.status
                                ? STATUS_CONFIG[row.status].rowClass
                                : "border-l-slate-200 border-slate-100"
                            }`}
                          >
                            {/* Ligne principale */}
                            <div className="flex items-center gap-3 px-3 py-2.5">
                              <span className="text-xs text-muted-foreground w-6 text-right shrink-0 tabular-nums">
                                {idx + 1}
                              </span>
                              <Avatar className="h-8 w-8 shrink-0">
                                <AvatarFallback
                                  className={`text-xs font-bold ${
                                    row.status
                                      ? STATUS_CONFIG[row.status].badgeClass
                                      : "bg-muted text-muted-foreground"
                                  }`}
                                >
                                  {getInitials(row.firstName, row.lastName)}
                                </AvatarFallback>
                              </Avatar>
                              <div className="flex-1 min-w-0">
                                <div className="font-semibold text-sm truncate">
                                  {row.lastName.toUpperCase()} {row.firstName}
                                </div>
                                <div className="text-xs text-muted-foreground">{row.matricule}</div>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                {(["PRESENT", "ABSENT", "LATE", "EXCUSED"] as AttendanceStatus[]).map((s) => (
                                  <button
                                    key={s}
                                    onClick={() => { if (!isAttendanceLocked) setStatus(row.studentId, s); }}
                                    title={isAttendanceLocked ? "Saisie clôturée" : STATUS_CONFIG[s].label}
                                    disabled={isAttendanceLocked}
                                    className={`
                                      inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium
                                      border transition-all duration-100
                                      ${isAttendanceLocked
                                        ? "cursor-not-allowed opacity-50 border-slate-200 text-slate-400"
                                        : "cursor-pointer " + (row.status === s
                                          ? STATUS_CONFIG[s].activeClass
                                          : "border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50"
                                        )
                                      }
                                    `}
                                  >
                                    {STATUS_CONFIG[s].icon}
                                    <span className="hidden md:inline">{STATUS_CONFIG[s].label}</span>
                                  </button>
                                ))}
                                {row.status && row.status !== "PRESENT" && (
                                  <button
                                    onClick={() => { if (!isAttendanceLocked) toggleNotes(row.studentId); }}
                                    title={row.notesOpen ? "Masquer" : "Motif / note"}
                                    disabled={isAttendanceLocked}
                                    className={`
                                      inline-flex items-center justify-center w-8 h-8 rounded-md border text-xs
                                      transition-colors
                                      ${isAttendanceLocked
                                        ? "cursor-not-allowed opacity-50 border-slate-200 text-slate-400"
                                        : "cursor-pointer " + (row.notesOpen || row.notes
                                          ? "border-slate-400 bg-slate-100 text-slate-700"
                                          : "border-slate-200 text-slate-400 hover:bg-slate-50"
                                        )
                                      }
                                    `}
                                  >
                                    <MessageSquare className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Zone motif + note libre (dépliable) */}
                            {row.notesOpen && row.status && row.status !== "PRESENT" && (
                              <div className="px-4 pb-3 pt-0 space-y-2">
                                {/* Chips motifs rapides (optionnels) */}
                                {motifs.length > 0 && (
                                  <div className="flex flex-wrap gap-1.5">
                                    {motifs.map((motif) => (
                                      <button
                                        key={motif}
                                        onClick={() => { if (!isAttendanceLocked) applyMotif(row.studentId, motif); }}
                                        disabled={isAttendanceLocked}
                                        className={`
                                          px-2.5 py-1 rounded-full text-xs font-medium border
                                          transition-all
                                          ${isAttendanceLocked
                                            ? "cursor-not-allowed opacity-50 border-slate-200 text-slate-400"
                                            : "cursor-pointer " + (row.notes === motif
                                              ? STATUS_CONFIG[row.status!].activeClass
                                              : "border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                                            )
                                          }
                                        `}
                                      >
                                        {motif}
                                      </button>
                                    ))}
                                  </div>
                                )}
                                {/* Note libre */}
                                <textarea
                                  placeholder="Précision libre (optionnel)…"
                                  value={row.notes}
                                  onChange={(e) => { if (!isAttendanceLocked) setNotes(row.studentId, e.target.value); }}
                                  readOnly={isAttendanceLocked}
                                  rows={2}
                                  className={`w-full px-3 py-2 text-xs rounded-md border border-input bg-background resize-none focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/60 ${isAttendanceLocked ? "opacity-50 cursor-not-allowed" : ""}`}
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* ── Avertissement jour non scolaire ── */}
                    {nonSchoolDay && (
                      <div className="mt-4 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                        <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                        <p className="text-sm text-amber-800">
                          Ce jour n&apos;est pas un jour de cours (dimanche / congé). Aucune présence à saisir.
                        </p>
                      </div>
                    )}

                    {/* ── Saisie clôturée (18h ou jour passé) ── */}
                    {isAttendanceLocked && (
                      <div className="mt-4 flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                        <Lock className="h-4 w-4 text-slate-500 shrink-0 mt-0.5" />
                        <p className="text-sm text-slate-700">
                          {selectedDate < getToday()
                            ? "La saisie des présences pour les jours passés est verrouillée."
                            : "La saisie des présences est clôturée à partir de 18h00."}
                        </p>
                      </div>
                    )}

                    {/* ── Bouton Enregistrer ── */}
                    <div className="mt-5 flex items-center justify-between gap-3 pt-4 border-t">
                      <div className="text-sm text-muted-foreground">
                        {alreadySaved && !hasChanges && (
                          <span className="text-emerald-600 font-medium flex items-center gap-1.5">
                            <FileCheck className="h-4 w-4" /> Présences enregistrées
                          </span>
                        )}
                        {hasChanges && (
                          <span className="text-amber-600 font-medium">Modifications en attente…</span>
                        )}
                      </div>
                      {canSaveAttendance && (
                        <Button
                          onClick={handleSave}
                          disabled={saveDisabled}
                          size="lg"
                          className="gap-2 min-w-44"
                        >
                          {isSaving ? (
                            <><Loader2 className="h-4 w-4 animate-spin" /> Enregistrement…</>
                          ) : (
                            <>
                              <Save className="h-4 w-4" />
                              {alreadySaved && hasChanges
                                ? "Mettre à jour"
                                : alreadySaved
                                ? "À jour ✓"
                                : "Enregistrer les présences"}
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {/* ── État vide (aucune classe sélectionnée) ── */}
          {!selectedClassId && (
            <Card className="shadow-sm">
              <CardContent className="py-20 text-center text-muted-foreground">
                <div className="h-16 w-16 rounded-full bg-primary/5 flex items-center justify-center mx-auto mb-4">
                  <Calendar className="h-8 w-8 text-primary/40" />
                </div>
                <p className="font-semibold text-foreground/70">Aucune classe sélectionnée</p>
                <p className="text-sm mt-1">Choisissez une classe ci-dessus pour prendre les présences</p>
              </CardContent>
            </Card>
          )}

        </div>
      )}

    </div>
  );
}
