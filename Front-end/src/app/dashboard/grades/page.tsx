"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Save, Loader2, WifiOff, RefreshCw, BookOpen, TrendingUp,
  Users, Plus, X, ChevronDown, ChevronUp, Award, CheckCircle, XCircle, Pencil, FileText,
  Lock, Unlock, ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useOnline } from "@/hooks/use-online";
import { useSubscription } from "@/hooks/use-subscription";
import { UpgradeBadge } from "@/components/shared/UpgradeBadge";
import * as storage from "@/lib/storage";
import { syncQueue } from "@/lib/sync-queue";
import { getClasses, getClassSubjects, saveClassSubjects } from "@/lib/api/classes.service";
import { getStudents } from "@/lib/api/students.service";
import {
  getGrades, bulkCreateGrades, updateGrade,
  checkTrimesterLock, lockTrimester, unlockTrimester,
  type BackendGrade, type TrimesterLock,
} from "@/lib/api/grades.service";
import {
  getSubjectsForLevel, TRIMESTERS, getMaxScoreForLevel,
} from "@/lib/subjects-config";
import { formatClassName } from "@/lib/class-helpers";
import Link from "next/link";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ClassOption {
  id: string;
  name: string;
  section?: string | null;
  level: string;
}

interface StudentInfo {
  id: string;
  name: string;
  matricule: string;
  gender?: string; // "M" | "F"
}

/** Une matière telle que configurée par l'utilisateur */
interface SubjectRow {
  name: string;
  coefficient: number;
  /** true = cochée / incluse dans la grille */
  selected: boolean;
  /** false = matière ajoutée manuellement (peut être supprimée) */
  isDefault: boolean;
}

interface GradeCell {
  score: number | null;
  scoreInput: string;
  existingGradeId?: string;
  isDirty: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function currentAcademicYear(): string {
  const y = new Date().getFullYear();
  return `${y}-${y + 1}`;
}

function scoreColor(score: number | null, maxScore: number): string {
  if (score === null) return "text-muted-foreground";
  const pct = score / maxScore;
  if (pct >= 0.8) return "text-emerald-700 font-bold";
  if (pct >= 0.7) return "text-blue-700 font-semibold";
  if (pct >= 0.5) return "text-amber-700 font-semibold";
  return "text-red-700 font-semibold";
}

function appreciation(avg: number | null, maxScore: number): string {
  if (avg === null) return "—";
  const pct = avg / maxScore;
  if (pct >= 0.9) return "Excellent";
  if (pct >= 0.8) return "Très bien";
  if (pct >= 0.7) return "Bien";
  if (pct >= 0.6) return "Assez bien";
  if (pct >= 0.5) return "Passable";
  return "Insuffisant";
}

function initials(name: string): string {
  return name.trim().split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

const cellKey = (studentId: string, subjectName: string) =>
  `${studentId}__${subjectName}`;

/**
 * Cache localStorage des matières par classe (fallback offline).
 * Les matières sont par classe (pas par trimestre — même liste pour T1/T2/T3).
 */
function subjectsCacheKey(classId: string) {
  return `structura_subjects_${classId}`;
}

function cacheSubjects(classId: string, rows: SubjectRow[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(subjectsCacheKey(classId), JSON.stringify(rows));
  } catch { /* ignore quota errors */ }
}

function loadCachedSubjects(classId: string): SubjectRow[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(subjectsCacheKey(classId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// ─── Brouillon notes (auto-save) ──────────────────────────────────────────────

function draftKey(classId: string, trimester: string, year: string) {
  return `structura_draft_${classId}_${trimester.replace(/\s/g, "_")}_${year}`;
}

function saveDraft(
  classId: string,
  trimester: string,
  year: string,
  dirtyGrid: Record<string, GradeCell>
) {
  if (typeof window === "undefined") return;
  const entries = Object.entries(dirtyGrid).filter(
    ([, c]) => c.isDirty && c.score !== null
  );
  if (entries.length === 0) {
    localStorage.removeItem(draftKey(classId, trimester, year));
    return;
  }
  try {
    const payload = Object.fromEntries(
      entries.map(([k, c]) => [k, { score: c.score, scoreInput: c.scoreInput }])
    );
    localStorage.setItem(draftKey(classId, trimester, year), JSON.stringify(payload));
  } catch { /* quota */ }
}

function loadDraft(
  classId: string,
  trimester: string,
  year: string
): Record<string, { score: number; scoreInput: string }> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(draftKey(classId, trimester, year));
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function clearDraft(classId: string, trimester: string, year: string) {
  if (typeof window === "undefined") return;
  localStorage.removeItem(draftKey(classId, trimester, year));
}

// ─── Cache verrou trimestre (fallback offline) ─────────────────────────────

function lockCacheKey(classId: string, trimester: string, year: string) {
  return `structura_tlock_${classId}_${trimester.replace(/\s/g, "_")}_${year}`;
}

function saveLockCache(classId: string, trimester: string, year: string, lock: TrimesterLock) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(lockCacheKey(classId, trimester, year), JSON.stringify(lock)); } catch { /* quota */ }
}

function loadLockCache(classId: string, trimester: string, year: string): TrimesterLock | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(lockCacheKey(classId, trimester, year));
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function clearLockCache(classId: string, trimester: string, year: string) {
  if (typeof window === "undefined") return;
  localStorage.removeItem(lockCacheKey(classId, trimester, year));
}

// ─── Composant interne ────────────────────────────────────────────────────────

function GradesPageContent() {
  const { user, refreshUserProfile } = useAuth();
  const isOnline = useOnline();
  const { hasFeature } = useSubscription();
  const hasBulletins = hasFeature('bulletins');

  // Rafraîchit classAssignments depuis le serveur au montage de la page.
  // Garantit que si le directeur a modifié les classes/matières du prof,
  // celui-ci voit immédiatement les changements sans se reconnecter.
  useEffect(() => {
    refreshUserProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const router = useRouter();
  /** Le directeur consulte en lecture seule — seuls les profs saisissent les notes */
  const isDirector = user?.role === 'director';
  const searchParams = useSearchParams();

  // ── Sélections — initialisées depuis l'URL pour survivre au refresh
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [selectedClassId, setSelectedClassId] = useState(
    () => searchParams.get("classId") ?? ""
  );
  const [selectedTrimester, setSelectedTrimester] = useState(
    () => searchParams.get("trimester") ?? "Trimestre 1"
  );

  // ── Matières configurées par l'utilisateur
  const [subjectRows, setSubjectRows] = useState<SubjectRow[]>([]);
  const [subjectsOpen, setSubjectsOpen] = useState(true);
  /** true = le prof a cliqué "Confirmer" → le panneau se replie, la grille apparaît */
  const [subjectsConfirmed, setSubjectsConfirmed] = useState(false);
  // Ajout d'une matière personnalisée
  const [isAddingSubject, setIsAddingSubject] = useState(false);
  const [newSubjectName, setNewSubjectName] = useState("");
  const [newSubjectCoef, setNewSubjectCoef] = useState("1");

  // ── Élèves et grille de notes
  const [students, setStudents] = useState<StudentInfo[]>([]);
  const [grid, setGrid] = useState<Record<string, GradeCell>>({});
  /** Cellules en mode édition (notes déjà en BDD cliquées pour modification) */
  const [editingCells, setEditingCells] = useState<Set<string>>(new Set());

  // ── Verrou de trimestre
  const [trimesterLock, setTrimesterLock] = useState<TrimesterLock | null>(null);
  const [isLocking, setIsLocking] = useState(false);

  // ── États UI
  const [isLoadingClasses, setIsLoadingClasses] = useState(true);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const academicYear = currentAcademicYear();
  const selectedClass = classes.find((c) => c.id === selectedClassId);
  const maxScore = getMaxScoreForLevel(selectedClass?.level ?? "Primaire");

  // Clé stable pour détecter les vrais changements de classAssignments (évite les
  // re-fetch dus aux nouvelles références d'objet après refreshUserProfile).
  const assignmentsKey = JSON.stringify(user?.classAssignments ?? null);

  // ── 1. Charger les classes ────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function load(retries = 1) {
      setIsLoadingClasses(true);
      const token = storage.getAuthItem("structura_token");
      if (!token) { setIsLoadingClasses(false); return; }
      try {
        const res = await getClasses(token);
        const raw = Array.isArray(res) ? res : (res as any).classes ?? [];

        // IDs des classes assignées au prof (null = pas de restriction)
        const isTeacher = (user?.role ?? "").toLowerCase() === "teacher";
        const assignedClassIds = isTeacher
          ? (user?.classAssignments ?? []).map((a) => a.classId)
          : null;

        const filtered = assignedClassIds !== null
          ? raw.filter((c: any) => assignedClassIds.includes(c.id))
          : raw;

        if (!cancelled) {
          setClasses(
            filtered.map((c: any) => ({
              id: c.id,
              name: c.name,
              section: c.section ?? null,
              level: c.level ?? "Primaire",
            }))
          );
        }
      } catch {
        // Retry une fois après 1.5s (token en cours de refresh, réseau instable…)
        if (retries > 0 && !cancelled) {
          setTimeout(() => { if (!cancelled) load(retries - 1); }, 1500);
          return;
        }
        if (!cancelled) toast.error("Impossible de charger les classes");
      } finally {
        if (!cancelled) setIsLoadingClasses(false);
      }
    }
    load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignmentsKey]);

  // ── 2. Quand la classe change → charger les matières ──────────────────────
  //       Priorité : API (DB partagée) > cache localStorage > config par défaut
  useEffect(() => {
    // Aucune classe sélectionnée → réinitialiser tout
    if (!selectedClassId) {
      setSubjectRows([]);
      setStudents([]);
      setGrid({});
      setSubjectsConfirmed(false);
      return;
    }
    // Les classes sont encore en chargement → attendre sans rien effacer
    if (!selectedClass) return;

    let cancelled = false;

    async function loadSubjects() {
      const token = storage.getAuthItem("structura_token");

      // Matières autorisées pour ce prof dans cette classe (null = pas de restriction)
      const isTeacher = (user?.role ?? "").toLowerCase() === "teacher";
      const teacherSubjects: string[] | null = isTeacher
        ? (() => {
            const a = (user?.classAssignments ?? []).find((ca) => ca.classId === selectedClassId);
            return a && a.subjects.length > 0 ? a.subjects : null;
          })()
        : null;

      /** Filtre les rows selon les matières du prof (si applicable) */
      function applyTeacherFilter(rows: SubjectRow[]): SubjectRow[] {
        if (!teacherSubjects) return rows;
        return rows.filter((r) => teacherSubjects.includes(r.name));
      }

      // Priorité 1 : API — source de vérité partagée entre tous les utilisateurs
      if (token && isOnline) {
        try {
          const apiSubjects = await getClassSubjects(token, selectedClassId);
          if (cancelled) return;
          if (apiSubjects.length > 0) {
            const rows: SubjectRow[] = applyTeacherFilter(
              apiSubjects.map((s) => ({
                name: s.name,
                coefficient: s.coefficient,
                selected: true,
                isDefault: false,
              }))
            );
            setSubjectRows(rows);
            cacheSubjects(selectedClassId, rows);
            setSubjectsConfirmed(true);
            setSubjectsOpen(false);
            return;
          }
        } catch {
          // API indisponible → fallback
        }
      }

      if (cancelled) return;

      // Priorité 2 : cache localStorage (offline ou API vide)
      const cached = loadCachedSubjects(selectedClassId);
      if (cached && cached.length > 0) {
        setSubjectRows(applyTeacherFilter(cached));
        setSubjectsConfirmed(true);
        setSubjectsOpen(false);
        return;
      }

      // Priorité 3 : première fois → matières par défaut du niveau
      const defaults = getSubjectsForLevel(selectedClass!.level);
      setSubjectRows(
        applyTeacherFilter(
          defaults.map((s) => ({
            name: s.name,
            coefficient: s.coefficient,
            selected: true,
            isDefault: true,
          }))
        )
      );
      setSubjectsConfirmed(isTeacher && !!teacherSubjects);  // Auto-confirmer pour les profs avec matières assignées
      setSubjectsOpen(!isTeacher || !teacherSubjects);
    }

    setStudents([]);
    setGrid({});
    loadSubjects();
    return () => { cancelled = true; };
  // selectedClass?.level : quand les classes finissent de charger après un refresh avec classId dans l'URL
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClassId, isOnline, selectedClass?.level]);

  // ── 3. Charger élèves + notes → mettre à jour matières + grille ──────────
  useEffect(() => {
    if (!selectedClassId || !selectedClass) return;

    let cancelled = false;

    async function load() {
      setIsLoadingData(true);
      const token = storage.getAuthItem("structura_token");
      if (!token) { setIsLoadingData(false); return; }

      try {
        const [studentsRes, gradesRes] = await Promise.all([
          getStudents(token, { classId: selectedClassId }),
          getGrades(token, {
            classId: selectedClassId,
            term: selectedTrimester,
            academicYear,
          }),
        ]);
        if (cancelled) return;

        const studentsData: StudentInfo[] = (
          Array.isArray(studentsRes) ? studentsRes : (studentsRes as any).students ?? []
        ).map((s: any) => ({
          id: s.id,
          name: `${s.firstName ?? ""} ${s.lastName ?? ""}`.trim(),
          matricule: s.matricule ?? "",
          gender: s.gender ?? undefined,
        }));

        const gradesList = gradesRes as BackendGrade[];

        // Reconstruire les matières :
        // - On part des matières de la config (déjà dans subjectRows)
        // - On met à jour les coefficients depuis les notes existantes (priorité BDD)
        // - On ajoute les matières présentes en BDD mais pas dans la config
        setSubjectRows((prev) => {
          const prevNames = new Set(prev.map((r) => r.name.toLowerCase()));
          const updated = prev.map((row) => {
            const inDB = gradesList.find(
              (g) => g.subject.toLowerCase() === row.name.toLowerCase()
            );
            // Met à jour le coefficient depuis la BDD, conserve selected
            return inDB ? { ...row, coefficient: inDB.coefficient } : row;
          });
          // Ajouter les matières en BDD absentes de la config (auto-sélectionnées)
          for (const g of gradesList) {
            if (!prevNames.has(g.subject.toLowerCase())) {
              updated.push({
                name: g.subject,
                coefficient: g.coefficient,
                selected: true,
                isDefault: false,
              });
              prevNames.add(g.subject.toLowerCase());
            }
          }
          return updated;
        });

        // Construire la grille (toutes les matières disponibles dans subjectRows)
        const allSubjectNames = [
          ...new Set([
            ...getSubjectsForLevel(selectedClass?.level ?? "Primaire").map((s) => s.name),
            ...gradesList.map((g) => g.subject),
          ]),
        ];

        const newGrid: Record<string, GradeCell> = {};
        for (const student of studentsData) {
          for (const subjectName of allSubjectNames) {
            const key = cellKey(student.id, subjectName);
            const existing = gradesList.find(
              (g) => g.studentId === student.id && g.subject === subjectName
            );
            newGrid[key] = {
              score: existing ? existing.score : null,
              scoreInput: existing ? String(existing.score) : "",
              existingGradeId: existing?.id,
              isDirty: false,
            };
          }
        }

        // Restaurer le brouillon si disponible (crash / fermeture imprévue)
        const draft = loadDraft(selectedClassId, selectedTrimester, academicYear);
        if (draft) {
          let restoredCount = 0;
          for (const [key, { score, scoreInput }] of Object.entries(draft)) {
            if (newGrid[key] !== undefined) {
              newGrid[key] = { ...newGrid[key], score, scoreInput, isDirty: true };
              restoredCount++;
            }
          }
          if (restoredCount > 0) {
            toast.info(`${restoredCount} note${restoredCount > 1 ? "s" : ""} brouillon restaurée${restoredCount > 1 ? "s" : ""}`, {
              description: "Notes récupérées depuis la dernière session — pensez à enregistrer",
              duration: 6000,
            });
          }
        }

        setStudents(studentsData);
        setGrid(newGrid);
      } catch (err: any) {
        if (!cancelled) toast.error(err.message || "Impossible de charger les données");
      } finally {
        if (!cancelled) setIsLoadingData(false);
      }
    }

    load();
    return () => { cancelled = true; };
  // selectedClass?.id : même raison que l'effet 2 — relancer quand les classes chargent après un refresh
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClassId, selectedTrimester, refreshKey, selectedClass?.id]);

  // ── 4. Charger l'état du verrou quand classe/trimestre change ────────────
  useEffect(() => {
    if (!selectedClassId) { setTrimesterLock(null); return; }

    let cancelled = false;

    async function loadLock() {
      const token = storage.getAuthItem("structura_token");

      // Priorité 1 : API
      if (token && isOnline) {
        try {
          const lock = await checkTrimesterLock(token, selectedClassId, selectedTrimester, academicYear);
          if (!cancelled) {
            setTrimesterLock(lock);
            if (lock) saveLockCache(selectedClassId, selectedTrimester, academicYear, lock);
            else clearLockCache(selectedClassId, selectedTrimester, academicYear);
          }
          return;
        } catch { /* fallback cache */ }
      }

      // Priorité 2 : cache localStorage (offline)
      if (!cancelled) {
        const cached = loadLockCache(selectedClassId, selectedTrimester, academicYear);
        setTrimesterLock(cached);
      }
    }

    loadLock();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClassId, selectedTrimester, isOnline]);

  // ── 5. Auto-save brouillon → survit au crash / fermeture d'onglet ─────────
  useEffect(() => {
    if (!selectedClassId) return;
    const hasDirty = Object.values(grid).some((c) => c.isDirty && c.score !== null);
    if (hasDirty) {
      saveDraft(selectedClassId, selectedTrimester, academicYear, grid);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grid]);

  // ── Gestion des matières ──────────────────────────────────────────────────

  /** Cocher / décocher une matière */
  function toggleSubject(idx: number, checked: boolean) {
    setSubjectRows((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, selected: checked } : r))
    );
  }

  /** Modifier le coefficient */
  function updateSubjectCoef(idx: number, raw: string) {
    const val = parseInt(raw, 10);
    if (raw === "" || (val >= 1 && val <= 20)) {
      setSubjectRows((prev) =>
        prev.map((r, i) =>
          i === idx ? { ...r, coefficient: raw === "" ? 1 : val } : r
        )
      );
    }
  }

  /** Supprimer définitivement une matière personnalisée */
  function removeSubject(idx: number) {
    setSubjectRows((prev) => prev.filter((_, i) => i !== idx));
  }

  /** Ajouter une matière personnalisée */
  function handleAddSubject() {
    const name = newSubjectName.trim();
    const coef = parseInt(newSubjectCoef, 10) || 1;

    if (!name) { toast.error("Entrez le nom de la matière"); return; }
    if (coef < 1 || coef > 20) { toast.error("Le coefficient doit être entre 1 et 20"); return; }
    if (subjectRows.some((r) => r.name.toLowerCase() === name.toLowerCase())) {
      toast.error("Cette matière existe déjà dans la liste");
      return;
    }

    const newRow: SubjectRow = { name, coefficient: coef, selected: true, isDefault: false };
    setSubjectRows((prev) => [...prev, newRow]);

    // Créer des cellules vides dans la grille pour chaque élève
    if (students.length > 0) {
      setGrid((prev) => {
        const next = { ...prev };
        for (const student of students) {
          const key = cellKey(student.id, name);
          if (!next[key]) {
            next[key] = { score: null, scoreInput: "", isDirty: false };
          }
        }
        return next;
      });
    }

    toast.success(`Matière "${name}" ajoutée`);
    setNewSubjectName("");
    setNewSubjectCoef("1");
    setIsAddingSubject(false);
  }

  /**
   * Confirmer la sélection des matières :
   * - Sauvegarde en DB via API (partagé avec tous les utilisateurs)
   * - Cache en localStorage (fallback offline)
   * - Replie le panneau et affiche la grille
   */
  async function confirmSubjects() {
    if (activeSubjects.length === 0) {
      toast.error("Sélectionnez au moins une matière");
      return;
    }

    const token = storage.getAuthItem("structura_token");
    const subjectsToSave = activeSubjects.map((s, idx) => ({
      name: s.name,
      coefficient: s.coefficient,
      order: idx,
    }));

    // Sauvegarde API (online)
    if (token && isOnline) {
      try {
        await saveClassSubjects(token, selectedClassId, subjectsToSave);
      } catch {
        toast.warning("Sauvegardé localement — synchronisera dès la reconnexion");
      }
    }

    // Toujours mettre à jour le cache local
    cacheSubjects(selectedClassId, subjectRows);

    setSubjectsConfirmed(true);
    setSubjectsOpen(false);
    toast.success(
      `${activeSubjects.length} matière${activeSubjects.length > 1 ? "s" : ""} confirmée${activeSubjects.length > 1 ? "s" : ""}`,
      { description: "Configuration partagée avec tous les utilisateurs" }
    );
  }

  /**
   * Rouvrir le panneau matières pour modifier la configuration
   */
  function editSubjects() {
    setSubjectsConfirmed(false);
    setSubjectsOpen(true);
  }

  // ── Gestion des notes ─────────────────────────────────────────────────────

  /** Passer une cellule en mode édition (note existante cliquée) */
  function enterEditMode(key: string) {
    setEditingCells((prev) => new Set([...prev, key]));
  }

  /** Quitter le mode édition si la note n'a pas été modifiée (Blur ou Escape) */
  function exitEditMode(key: string) {
    setEditingCells((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }

  function handleCellChange(
    studentId: string,
    subjectName: string,
    value: string
  ) {
    if (value !== "" && !/^\d*[.,]?\d*$/.test(value)) return;
    const raw = value.replace(",", ".");
    const num = raw === "" ? null : parseFloat(raw);
    if (num !== null && (num < 0 || num > maxScore)) return;

    const key = cellKey(studentId, subjectName);
    setGrid((prev) => ({
      ...prev,
      [key]: { ...prev[key], scoreInput: value, score: num, isDirty: true },
    }));
  }

  function handleKeyDown(
    e: React.KeyboardEvent,
    studentIdx: number,
    subjectIdx: number
  ) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    let ns = studentIdx;
    let nsub = subjectIdx + 1;
    if (nsub >= activeSubjects.length) { nsub = 0; ns = studentIdx + 1; }
    if (ns >= students.length) return;

    const nextStudent = students[ns];
    const nextSubject = activeSubjects[nsub];
    const nextKey = cellKey(nextStudent.id, nextSubject.name);
    const nextCell = grid[nextKey];

    // Si la cellule cible a déjà une note en BDD → passer en mode édition puis focus
    if (nextCell?.existingGradeId && !nextCell.isDirty) {
      enterEditMode(nextKey);
      setTimeout(() => {
        document.getElementById(`cell-${nextStudent.id}-${nextSubject.name}`)?.focus();
      }, 0);
    } else {
      document.getElementById(`cell-${nextStudent.id}-${nextSubject.name}`)?.focus();
    }
  }

  // ── Valider / déverrouiller le trimestre ──────────────────────────────────

  async function handleLockTrimester() {
    const token = storage.getAuthItem("structura_token");
    if (!token) { toast.error("Session expirée"); return; }
    if (dirtyCount > 0) {
      toast.warning("Enregistrez d'abord les notes non sauvegardées");
      return;
    }
    setIsLocking(true);
    try {
      const lock = await lockTrimester(token, selectedClassId, selectedTrimester, academicYear);
      setTrimesterLock(lock);
      saveLockCache(selectedClassId, selectedTrimester, academicYear, lock);
      toast.success(`${selectedTrimester} validé`, {
        description: "Les bulletins peuvent maintenant être générés",
      });
    } catch (err: any) {
      toast.error(err.message || "Impossible de valider le trimestre");
    } finally {
      setIsLocking(false);
    }
  }

  async function handleUnlockTrimester() {
    const token = storage.getAuthItem("structura_token");
    if (!token) { toast.error("Session expirée"); return; }
    setIsLocking(true);
    try {
      await unlockTrimester(token, selectedClassId, selectedTrimester, academicYear);
      setTrimesterLock(null);
      clearLockCache(selectedClassId, selectedTrimester, academicYear);
      toast.info(`${selectedTrimester} déverrouillé`, {
        description: "Vous pouvez à nouveau modifier les notes",
      });
    } catch (err: any) {
      toast.error(err.message || "Impossible de déverrouiller");
    } finally {
      setIsLocking(false);
    }
  }

  // ── Enregistrer ───────────────────────────────────────────────────────────

  async function handleSave() {
    const token = storage.getAuthItem("structura_token");
    if (!token) { toast.error("Session expirée"); return; }

    const dirty = Object.entries(grid).filter(
      ([, c]) => c.isDirty && c.score !== null
    );
    if (dirty.length === 0) { toast.info("Aucune modification à enregistrer"); return; }

    // Mode hors ligne : mettre en queue pour sync automatique au retour online
    if (!isOnline) {
      setIsSaving(true);
      try {
        const toCreate = new Map<string, { studentId: string; score: number }[]>();
        const toUpdate: { gradeId: string; score: number }[] = [];

        for (const [key, cell] of dirty) {
          const sep = key.indexOf("__");
          const studentId = key.substring(0, sep);
          const subjectName = key.substring(sep + 2);
          if (cell.existingGradeId) {
            toUpdate.push({ gradeId: cell.existingGradeId, score: cell.score! });
          } else {
            if (!toCreate.has(subjectName)) toCreate.set(subjectName, []);
            toCreate.get(subjectName)!.push({ studentId, score: cell.score! });
          }
        }

        for (const [subjectName, rows] of toCreate.entries()) {
          const subRow = subjectRows.find((s) => s.name === subjectName);
          await syncQueue.add({
            type: "grade", action: "bulk_create",
            data: {
              subject: subjectName,
              maxScore,
              coefficient: subRow?.coefficient ?? 1,
              term: selectedTrimester,
              academicYear,
              classId: selectedClassId,
              grades: rows,
            },
          });
        }

        for (const { gradeId, score } of toUpdate) {
          await syncQueue.add({
            type: "grade", action: "update",
            data: { id: gradeId, score, maxScore },
          });
        }

        clearDraft(selectedClassId, selectedTrimester, academicYear);
        setEditingCells(new Set());
        toast.info(`${dirty.length} note(s) sauvegardées — synchronisation en attente`, {
          description: "Envoi automatique dès le retour de la connexion.",
          duration: 5000,
        });
      } catch (err: any) {
        toast.error(err.message || "Erreur lors de la sauvegarde offline");
      } finally {
        setIsSaving(false);
      }
      return;
    }

    setIsSaving(true);
    try {
      const toCreate = new Map<string, { studentId: string; score: number }[]>();
      const toUpdate: { gradeId: string; score: number }[] = [];

      for (const [key, cell] of dirty) {
        const sep = key.indexOf("__");
        const studentId = key.substring(0, sep);
        const subjectName = key.substring(sep + 2);

        if (cell.existingGradeId) {
          toUpdate.push({ gradeId: cell.existingGradeId, score: cell.score! });
        } else {
          if (!toCreate.has(subjectName)) toCreate.set(subjectName, []);
          toCreate.get(subjectName)!.push({ studentId, score: cell.score! });
        }
      }

      // POST /grades/bulk par matière
      for (const [subjectName, rows] of toCreate.entries()) {
        const subRow = subjectRows.find((s) => s.name === subjectName);
        await bulkCreateGrades(token, {
          subject: subjectName,
          maxScore,
          coefficient: subRow?.coefficient ?? 1,
          term: selectedTrimester,
          academicYear,
          classId: selectedClassId,
          grades: rows,
        });
      }

      // PATCH /grades/:id pour les modifications
      await Promise.all(
        toUpdate.map(({ gradeId, score }) =>
          updateGrade(token, gradeId, { score, maxScore })
        )
      );

      clearDraft(selectedClassId, selectedTrimester, academicYear);
      setEditingCells(new Set());
      toast.success(`${dirty.length} note(s) enregistrée(s)`, {
        description: `${selectedTrimester} — ${academicYear}`,
      });
      setRefreshKey((k) => k + 1);
    } catch (err: any) {
      toast.error(err.message || "Erreur lors de l'enregistrement");
    } finally {
      setIsSaving(false);
    }
  }

  // ── Calculs ───────────────────────────────────────────────────────────────

  /** Matières cochées = celles qui apparaissent dans la grille */
  const activeSubjects = subjectRows.filter((s) => s.selected);

  function studentAvg(studentId: string): number | null {
    let points = 0;
    let totalCoef = 0;
    for (const s of activeSubjects) {
      const cell = grid[cellKey(studentId, s.name)];
      if (cell?.score !== null && cell?.score !== undefined) {
        points += cell.score * s.coefficient;
        totalCoef += s.coefficient;
      }
    }
    return totalCoef === 0 ? null : points / totalCoef;
  }

  function subjectAvg(subjectName: string): number | null {
    const scores = students
      .map((s) => grid[cellKey(s.id, subjectName)]?.score)
      .filter((v): v is number => v !== null && v !== undefined);
    if (scores.length === 0) return null;
    return scores.reduce((a, b) => a + b, 0) / scores.length;
  }

  const classAvg: number | null = (() => {
    if (students.length === 0) return null;
    const avgs = students
      .map((s) => studentAvg(s.id))
      .filter((a): a is number => a !== null);
    if (avgs.length === 0) return null;
    return avgs.reduce((a, b) => a + b, 0) / avgs.length;
  })();

  // ── Stats réussite ────────────────────────────────────────────────────────

  /** Seuil de réussite : moitié du barème (5/10 ou 10/20) */
  const passThreshold = maxScore / 2;

  const studentResults = students.map((s) => ({
    id: s.id,
    gender: s.gender,
    avg: studentAvg(s.id),
  }));

  const studentsWithScores = studentResults.filter((r) => r.avg !== null).length;
  const passCount  = studentResults.filter((r) => r.avg !== null && r.avg >= passThreshold).length;
  const failCount  = studentResults.filter((r) => r.avg !== null && r.avg <  passThreshold).length;
  const successRate = studentsWithScores > 0 ? (passCount / studentsWithScores) * 100 : null;

  const boysCount  = students.filter((s) => s.gender === "M").length;
  const girlsCount = students.filter((s) => s.gender === "F").length;

  const passBoysCount  = studentResults.filter((r) => r.avg !== null && r.avg >= passThreshold && r.gender === "M").length;
  const passGirlsCount = studentResults.filter((r) => r.avg !== null && r.avg >= passThreshold && r.gender === "F").length;
  const failBoysCount  = studentResults.filter((r) => r.avg !== null && r.avg <  passThreshold && r.gender === "M").length;
  const failGirlsCount = studentResults.filter((r) => r.avg !== null && r.avg <  passThreshold && r.gender === "F").length;

  function getClassAvgMessage(avg: number | null): string {
    if (avg === null) return "";
    const pct = avg / maxScore;
    if (pct >= 0.9) return "Félicitations ! Votre classe est au top niveau.";
    if (pct >= 0.8) return "Très bonne performance ! Continuez sur cette lancée.";
    if (pct >= 0.7) return "La classe se porte bien. Quelques efforts supplémentaires suffiraient.";
    if (pct >= 0.6) return "Résultats corrects, mais la classe peut faire mieux.";
    if (pct >= 0.5) return "Résultats passables. La classe doit fournir plus d'efforts.";
    return "Résultats insuffisants. Un travail sérieux s'impose pour redresser la situation.";
  }

  function getSuccessRateMessage(rate: number | null): string {
    if (rate === null) return "";
    if (rate >= 90) return "Excellente réussite ! Presque tous les élèves sont au niveau.";
    if (rate >= 75) return "Très bonne réussite ! La majorité des élèves maîtrisent les cours.";
    if (rate >= 60) return "Bonne réussite globale. Des efforts restent à fournir pour les élèves en difficulté.";
    if (rate >= 50) return "Réussite acceptable. La moitié des élèves sont en difficulté.";
    if (rate >= 30) return "Trop d'élèves en difficulté. Des mesures de soutien sont nécessaires.";
    return "La grande majorité des élèves sont en difficulté. Un soutien urgent est nécessaire.";
  }

  function getSuccessRateColor(rate: number | null): string {
    if (rate === null) return "text-foreground";
    if (rate >= 75) return "text-emerald-700";
    if (rate >= 50) return "text-amber-700";
    return "text-red-700";
  }

  const classAvgMessage    = getClassAvgMessage(classAvg);
  const successRateMessage = getSuccessRateMessage(successRate);
  const successRateColor   = getSuccessRateColor(successRate);

  const dirtyCount = Object.values(grid).filter(
    (c) => c.isDirty && c.score !== null
  ).length;

  // Progression de la saisie
  const totalCells = students.length * activeSubjects.length;
  const filledCells = students.reduce(
    (acc, s) =>
      acc +
      activeSubjects.filter((sub) => {
        const cell = grid[cellKey(s.id, sub.name)];
        return cell?.score !== null && cell?.score !== undefined;
      }).length,
    0
  );
  const totalMissingForLock = totalCells - filledCells;

  /** Vrai quand tous les élèves ont une note pour toutes les matières actives */
  const allGradesComplete =
    students.length > 0 &&
    activeSubjects.length > 0 &&
    students.every((s) =>
      activeSubjects.every((sub) => {
        const cell = grid[cellKey(s.id, sub.name)];
        return cell?.score !== null && cell?.score !== undefined;
      })
    );

  // ─── Rendu ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            Gestion des Notes
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {isDirector
              ? "Consultation des notes · Lecture seule"
              : "Tableau complet · Calcul automatique des moyennes pondérées"}
          </p>
          {!isOnline && (
            <Badge
              variant="outline"
              className="mt-2 bg-amber-50 text-amber-700 border-amber-200 text-xs"
            >
              <WifiOff className="h-3 w-3 mr-1" /> Mode hors ligne
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap">

          {/* ── Bouton Valider / Déverrouiller le trimestre — PRO requis ── */}
          {!hasBulletins && selectedClassId && students.length > 0 && (
            <UpgradeBadge
              message="Valider trimestre — Plan Pro"
              requiredPlan="Pro"
              variant="button"
            />
          )}
          {hasBulletins && selectedClassId && students.length > 0 && (
            trimesterLock ? (
              <div className="flex items-center gap-2">
                <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 gap-1 px-2.5">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Trimestre validé
                </Badge>
                {/* Le directeur peut déverrouiller pour permettre au prof de corriger */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-muted-foreground hover:text-foreground h-8 text-xs"
                  onClick={handleUnlockTrimester}
                  disabled={isLocking}
                >
                  {isLocking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unlock className="h-3.5 w-3.5" />}
                  Déverrouiller
                </Button>
              </div>
            ) : !isDirector ? (
              /* Seul le prof peut valider un trimestre */
              <div className="flex flex-col items-end gap-0.5">
                <Button
                  variant="outline"
                  className="gap-2 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                  onClick={handleLockTrimester}
                  disabled={isLocking || !allGradesComplete || dirtyCount > 0}
                >
                  {isLocking ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Lock className="h-4 w-4" />
                  )}
                  Valider le trimestre
                </Button>
                {!allGradesComplete && totalMissingForLock > 0 && (
                  <span className="text-[10px] text-muted-foreground">
                    {totalMissingForLock} note{totalMissingForLock > 1 ? "s" : ""} manquante{totalMissingForLock > 1 ? "s" : ""}
                  </span>
                )}
                {dirtyCount > 0 && allGradesComplete && (
                  <span className="text-[10px] text-amber-600">Enregistrez d'abord</span>
                )}
              </div>
            ) : null
          )}

          {/* Bulletins : directeur + plan PRO requis */}
          {isDirector && (
            hasBulletins ? (
              <Link
                href={`/dashboard/grades/bulletins${selectedClassId ? `?classId=${selectedClassId}&trimester=${selectedTrimester}&academicYear=${academicYear}` : ""}`}
              >
                <Button variant="outline" className="gap-2">
                  <FileText className="h-4 w-4" />
                  Bulletins
                </Button>
              </Link>
            ) : (
              <UpgradeBadge
                message="Bulletins PDF — Plan Pro"
                requiredPlan="Pro"
                variant="button"
              />
            )
          )}

          {/* Enregistrer : prof uniquement */}
          {!isDirector && dirtyCount > 0 && (
            <Button
              onClick={handleSave}
              disabled={isSaving}
              className="gap-2"
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Enregistrer ({dirtyCount})
            </Button>
          )}
        </div>
      </div>

      {/* ── Filtres : Classe + Trimestre ── */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="grid gap-4 sm:grid-cols-3">
            {/* Classe */}
            <div className="space-y-2">
              <Label>Classe *</Label>
              {isLoadingClasses ? (
                <div className="h-10 flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Chargement...
                </div>
              ) : (
                <Select
                  value={selectedClassId}
                  onValueChange={(v) => {
                    setSelectedClassId(v);
                    setGrid({});
                    setStudents([]);
                    const params = new URLSearchParams(searchParams.toString());
                    if (v) params.set("classId", v); else params.delete("classId");
                    router.replace(`/dashboard/grades?${params.toString()}`, { scroll: false });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choisir une classe" />
                  </SelectTrigger>
                  <SelectContent>
                    {classes.map((cls) => (
                      <SelectItem key={cls.id} value={cls.id}>
                        {formatClassName(cls.name, cls.section)}
                        <span className="ml-1 text-xs text-muted-foreground">
                          ({cls.level})
                        </span>
                      </SelectItem>
                    ))}
                    {classes.length === 0 && (
                      <div className="p-3 text-sm text-muted-foreground text-center">
                        Aucune classe disponible
                      </div>
                    )}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Trimestre */}
            <div className="space-y-2">
              <Label>Trimestre *</Label>
              <Select
                value={selectedTrimester}
                onValueChange={(v) => {
                    setSelectedTrimester(v);
                    const params = new URLSearchParams(searchParams.toString());
                    params.set("trimester", v);
                    router.replace(`/dashboard/grades?${params.toString()}`, { scroll: false });
                  }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TRIMESTERS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Actualiser */}
            <div className="space-y-2">
              <Label>&nbsp;</Label>
              <Button
                variant="outline"
                className="w-full gap-2"
                onClick={() => setRefreshKey((k) => k + 1)}
                disabled={!selectedClassId || isLoadingData}
              >
                <RefreshCw
                  className={`h-4 w-4 ${isLoadingData ? "animate-spin" : ""}`}
                />
                Actualiser
              </Button>
            </div>
          </div>

          {selectedClass && (
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className="text-xs">
                {formatClassName(selectedClass.name, selectedClass.section)}
              </Badge>
              <Badge variant="outline" className="text-xs">
                {selectedTrimester}
              </Badge>
              <Badge
                variant="outline"
                className="text-xs bg-blue-50 text-blue-700 border-blue-200"
              >
                Notes sur {maxScore}
              </Badge>
              <Badge variant="outline" className="text-xs text-muted-foreground">
                {academicYear}
              </Badge>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Matières — visible dès qu'une classe est sélectionnée ── */}
      {selectedClassId && (
        <Card className={subjectsConfirmed ? "border-emerald-200 bg-emerald-50/30" : ""}>
          <CardHeader
            className="cursor-pointer select-none"
            onClick={() => setSubjectsOpen((o) => !o)}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <CardTitle className="text-base flex items-center gap-2">
                  <BookOpen className={`h-5 w-5 ${subjectsConfirmed ? "text-emerald-600" : ""}`} />
                  Matières
                  {subjectsConfirmed ? (
                    <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs font-normal">
                      ✓ {activeSubjects.length} confirmée{activeSubjects.length > 1 ? "s" : ""}
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-xs font-normal">
                      {activeSubjects.length}/{subjectRows.length} sélectionnée{activeSubjects.length > 1 ? "s" : ""}
                    </Badge>
                  )}
                </CardTitle>
                {subjectsConfirmed ? (
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    {activeSubjects.map((s) => s.name).join(" · ")}
                  </p>
                ) : (
                  <CardDescription className="mt-0.5">
                    Niveau <strong>{selectedClass?.level}</strong> — cochez les matières, modifiez les coefficients, puis confirmez
                  </CardDescription>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {subjectsConfirmed && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs h-8"
                    onClick={(e) => { e.stopPropagation(); editSubjects(); }}
                  >
                    Modifier
                  </Button>
                )}
                {subjectsOpen ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
            </div>
          </CardHeader>

          {subjectsOpen && (
            <CardContent className="pt-0">
              {subjectRows.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  Aucune matière — ajoutez-en ci-dessous
                </p>
              ) : (
                <div className="space-y-1">
                  {/* En-tête */}
                  <div className="grid grid-cols-[auto_1fr_auto_auto] gap-3 px-1 pb-1 mb-1 border-b">
                    <span className="w-5" />
                    <span className="text-xs font-medium text-muted-foreground">
                      Matière
                    </span>
                    <span className="text-xs font-medium text-muted-foreground text-center w-24">
                      Coefficient
                    </span>
                    <span className="w-8" />
                  </div>

                  {subjectRows.map((row, idx) => (
                    <div
                      key={`${row.name}-${idx}`}
                      className={`grid grid-cols-[auto_1fr_auto_auto] gap-3 items-center px-1 py-1.5 rounded-md transition-colors ${
                        row.selected ? "hover:bg-muted/40" : "opacity-50 hover:bg-muted/20"
                      }`}
                    >
                      {/* Checkbox sélection */}
                      <Checkbox
                        id={`subject-${idx}`}
                        checked={row.selected}
                        onCheckedChange={(checked) => toggleSubject(idx, !!checked)}
                      />

                      {/* Nom */}
                      <label
                        htmlFor={`subject-${idx}`}
                        className={`text-sm select-none cursor-pointer ${
                          !row.selected ? "line-through text-muted-foreground" : ""
                        }`}
                      >
                        {row.name}
                      </label>

                      {/* Coefficient — éditable */}
                      <div className="flex items-center gap-1.5 w-24">
                        <span className="text-xs text-muted-foreground shrink-0">
                          Coef.
                        </span>
                        <Input
                          type="number"
                          min={1}
                          max={20}
                          value={row.coefficient}
                          onChange={(e) => updateSubjectCoef(idx, e.target.value)}
                          disabled={!row.selected}
                          className="w-14 h-8 text-center text-sm"
                        />
                      </div>

                      {/* Supprimer — matières personnalisées seulement */}
                      {!row.isDefault ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-red-600 hover:bg-red-50"
                          onClick={() => removeSubject(idx)}
                          title="Supprimer cette matière"
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      ) : (
                        <span className="w-7" />
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* ── Ajouter une matière + Confirmer ── */}
              <Separator className="my-4" />

              {isAddingSubject ? (
                <div className="flex items-end gap-3 flex-wrap">
                  <div className="flex-1 min-w-[200px] space-y-1.5">
                    <Label className="text-xs">Nom de la matière</Label>
                    <Input
                      placeholder="Ex : Informatique, Arabe, EPS..."
                      value={newSubjectName}
                      onChange={(e) => setNewSubjectName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleAddSubject()}
                      className="h-9"
                      autoFocus
                    />
                  </div>
                  <div className="w-28 space-y-1.5">
                    <Label className="text-xs">Coefficient</Label>
                    <Input
                      type="number"
                      min={1}
                      max={20}
                      placeholder="1"
                      value={newSubjectCoef}
                      onChange={(e) => setNewSubjectCoef(e.target.value)}
                      className="h-9 text-center"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={handleAddSubject}
                      disabled={!newSubjectName.trim()}
                      className="h-9 gap-2"
                    >
                      <Plus className="h-4 w-4" />
                      Ajouter
                    </Button>
                    <Button
                      variant="outline"
                      className="h-9"
                      onClick={() => {
                        setIsAddingSubject(false);
                        setNewSubjectName("");
                        setNewSubjectCoef("1");
                      }}
                    >
                      Annuler
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => setIsAddingSubject(true)}
                >
                  <Plus className="h-4 w-4" />
                  Ajouter une matière
                </Button>
              )}

              {/* ── Bouton Confirmer ── */}
              <div className="mt-4 pt-4 border-t flex items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  {activeSubjects.length === 0
                    ? "Cochez au moins une matière"
                    : `${activeSubjects.length} matière${activeSubjects.length > 1 ? "s" : ""} sélectionnée${activeSubjects.length > 1 ? "s" : ""} · La configuration sera mémorisée pour cette classe`}
                </p>
                <Button
                  onClick={confirmSubjects}
                  disabled={activeSubjects.length === 0}
                  className="gap-2 shrink-0"
                >
                  <Save className="h-4 w-4" />
                  Confirmer la sélection
                </Button>
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {/* ── Stats ── */}
      {students.length > 0 && !isLoadingData && (
        <div className="space-y-3">

          {/* Ligne 1 : Moyenne générale + Taux de réussite */}
          <div className="grid gap-3 sm:grid-cols-2">

            {/* Moyenne générale */}
            <Card className="border-l-4 border-l-blue-500">
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-0.5">
                  <TrendingUp className="h-3 w-3" />
                  <span className="font-medium uppercase tracking-wide">Moyenne générale</span>
                </div>
                <p className="text-[11px] text-muted-foreground mb-2">
                  Note moyenne de toute la classe, pondérée par les coefficients. Donne le niveau global de la classe en un seul chiffre.
                </p>
                <p className={`text-2xl font-bold ${scoreColor(classAvg, maxScore)}`}>
                  {classAvg !== null ? classAvg.toFixed(2) : "—"}
                  <span className="text-sm font-normal text-muted-foreground">/{maxScore}</span>
                </p>
                {classAvg !== null && (
                  <>
                    <p className="text-xs font-semibold mt-0.5">{appreciation(classAvg, maxScore)}</p>
                    <p className="text-[11px] text-muted-foreground mt-1 italic">{classAvgMessage}</p>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Taux de réussite */}
            <Card className="border-l-4 border-l-emerald-500">
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-0.5">
                  <Award className="h-3 w-3" />
                  <span className="font-medium uppercase tracking-wide">Taux de réussite</span>
                </div>
                <p className="text-[11px] text-muted-foreground mb-2">
                  Pourcentage d'élèves ayant obtenu la moyenne ({passThreshold}/{maxScore} ou plus). Indique si la classe réussit globalement.
                </p>
                <p className={`text-2xl font-bold ${successRateColor}`}>
                  {successRate !== null ? `${successRate.toFixed(0)}%` : "—"}
                </p>
                {successRate !== null && (
                  <>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {passCount} élève{passCount > 1 ? "s" : ""} sur {studentsWithScores} noté{studentsWithScores > 1 ? "s" : ""}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-1 italic">{successRateMessage}</p>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Ligne 2 : Élèves total + Ont eu la moyenne + N'ont pas eu */}
          <div className="grid gap-3 sm:grid-cols-3">

            {/* Total élèves */}
            <Card className="border-l-4 border-l-primary">
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                  <Users className="h-3 w-3" />
                  <span className="font-medium">Total élèves</span>
                </div>
                <p className="text-2xl font-bold">{students.length}</p>
                <div className="flex gap-3 mt-1.5 text-xs text-muted-foreground">
                  <span>♂ {boysCount} garçon{boysCount > 1 ? "s" : ""}</span>
                  <span>♀ {girlsCount} fille{girlsCount > 1 ? "s" : ""}</span>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">{activeSubjects.length} matière{activeSubjects.length > 1 ? "s" : ""} actives</p>
              </CardContent>
            </Card>

            {/* Ont eu la moyenne */}
            <Card className="border-l-4 border-l-emerald-400">
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-1.5 text-xs text-emerald-700 mb-1">
                  <CheckCircle className="h-3 w-3" />
                  <span className="font-medium">Ont eu la moyenne</span>
                </div>
                <p className="text-2xl font-bold text-emerald-700">{passCount}</p>
                <div className="flex gap-3 mt-1.5 text-xs text-muted-foreground">
                  <span>♂ {passBoysCount} garçon{passBoysCount > 1 ? "s" : ""}</span>
                  <span>♀ {passGirlsCount} fille{passGirlsCount > 1 ? "s" : ""}</span>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">≥ {passThreshold}/{maxScore}</p>
              </CardContent>
            </Card>

            {/* N'ont pas eu la moyenne */}
            <Card className="border-l-4 border-l-red-400">
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-1.5 text-xs text-red-700 mb-1">
                  <XCircle className="h-3 w-3" />
                  <span className="font-medium">N'ont pas eu la moyenne</span>
                </div>
                <p className="text-2xl font-bold text-red-700">{failCount}</p>
                <div className="flex gap-3 mt-1.5 text-xs text-muted-foreground">
                  <span>♂ {failBoysCount} garçon{failBoysCount > 1 ? "s" : ""}</span>
                  <span>♀ {failGirlsCount} fille{failGirlsCount > 1 ? "s" : ""}</span>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">&lt; {passThreshold}/{maxScore}</p>
              </CardContent>
            </Card>

          </div>
        </div>
      )}

      {/* ── Tableau de saisie ── */}
      {!selectedClassId ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <BookOpen className="h-10 w-10 mx-auto opacity-30 mb-3" />
            <p className="text-sm">
              Sélectionnez une classe et un trimestre pour commencer
            </p>
          </CardContent>
        </Card>
      ) : isLoadingData ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
            <p className="text-sm text-muted-foreground mt-2">
              Chargement des élèves et notes...
            </p>
          </CardContent>
        </Card>
      ) : students.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <Users className="h-10 w-10 mx-auto opacity-30 mb-3" />
            <p className="text-sm">Aucun élève dans cette classe</p>
          </CardContent>
        </Card>
      ) : activeSubjects.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <BookOpen className="h-10 w-10 mx-auto opacity-30 mb-3" />
            <p className="text-sm">
              Cochez au moins une matière pour commencer la saisie
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-0">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                Saisie des notes — {selectedTrimester}
                {dirtyCount > 0 && (
                  <Badge className="bg-amber-100 text-amber-700 border-amber-200 font-normal text-xs">
                    {dirtyCount} non enregistré{dirtyCount > 1 ? "s" : ""}
                  </Badge>
                )}
                {totalCells > 0 && (
                  <Badge
                    variant="outline"
                    className={`text-xs font-normal ${
                      filledCells === totalCells
                        ? "text-emerald-700 border-emerald-200 bg-emerald-50"
                        : "text-muted-foreground"
                    }`}
                  >
                    {filledCells}/{totalCells} notes saisies
                  </Badge>
                )}
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                <kbd className="px-1 border rounded text-xs">Entrée</kbd> pour avancer
              </p>
              {!trimesterLock && !isDirector && (
                <Button
                  onClick={handleSave}
                  disabled={isSaving || dirtyCount === 0}
                  size="sm"
                  className="gap-2"
                >
                  {isSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Enregistrer {dirtyCount > 0 ? `(${dirtyCount})` : ""}
                </Button>
              )}
            </div>
          </CardHeader>

          <CardContent className="p-0 mt-4">
            {/* ── Bannière verrou trimestre ── */}
            {trimesterLock && (
              <div className="px-4 py-3 bg-emerald-50 border-b border-emerald-200 flex items-center gap-2 text-sm text-emerald-700">
                <ShieldCheck className="h-4 w-4 shrink-0" />
                <span>
                  Trimestre validé le{" "}
                  {new Date(trimesterLock.lockedAt).toLocaleDateString("fr-FR")}{" "}
                  {trimesterLock.lockedByName && `par ${trimesterLock.lockedByName}`}{" "}
                  — Les notes sont en lecture seule. Déverrouillez pour modifier.
                </span>
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-muted/60 border-b">
                    {/* Colonne nom — sticky */}
                    <th className="sticky left-0 z-20 bg-muted/60 px-4 py-3 text-left font-semibold min-w-[190px] border-r">
                      Élève
                    </th>
                    {activeSubjects.map((s) => {
                      const filledForSubject = students.filter((st) => {
                        const c = grid[cellKey(st.id, s.name)];
                        return c?.score !== null && c?.score !== undefined;
                      }).length;
                      return (
                        <th
                          key={s.name}
                          className="px-2 py-3 text-center font-semibold min-w-[80px] border-r last:border-r-0"
                        >
                          <div className="text-xs leading-tight" title={s.name}>{s.name}</div>
                          <div className="text-[10px] font-normal text-muted-foreground">
                            Coef.&nbsp;{s.coefficient}
                          </div>
                          {students.length > 0 && (
                            <div className={`text-[9px] mt-0.5 font-medium ${
                              filledForSubject === students.length
                                ? "text-emerald-600"
                                : filledForSubject === 0
                                ? "text-muted-foreground/50"
                                : "text-amber-600"
                            }`}>
                              {filledForSubject}/{students.length}
                            </div>
                          )}
                        </th>
                      );
                    })}
                    <th className="px-4 py-3 text-center font-semibold min-w-[110px] bg-blue-50 border-l">
                      Moyenne
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {students.map((student, sIdx) => {
                    const avg = studentAvg(student.id);
                    const rowDirty = activeSubjects.some(
                      (sub) => grid[cellKey(student.id, sub.name)]?.isDirty
                    );
                    const missingCount = activeSubjects.filter((sub) => {
                      const c = grid[cellKey(student.id, sub.name)];
                      return c?.score === null || c?.score === undefined;
                    }).length;

                    return (
                      <tr
                        key={student.id}
                        className={`border-b last:border-b-0 transition-colors ${
                          rowDirty ? "bg-amber-50/50" : "hover:bg-muted/20"
                        }`}
                      >
                        {/* Nom — sticky */}
                        <td
                          className={`sticky left-0 z-10 px-4 py-2 border-r ${
                            rowDirty ? "bg-amber-50" : "bg-white"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0">
                              {initials(student.name)}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">
                                {student.name}
                              </p>
                              <p className="text-[10px] font-mono text-muted-foreground">
                                {student.matricule}
                              </p>
                              {activeSubjects.length > 0 && (
                                missingCount > 0 ? (
                                  <p className="text-[9px] text-amber-600 font-medium leading-none mt-0.5">
                                    {missingCount} manquante{missingCount > 1 ? "s" : ""}
                                  </p>
                                ) : (
                                  <p className="text-[9px] text-emerald-600 font-medium leading-none mt-0.5">
                                    ✓ Complet
                                  </p>
                                )
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Cellules notes */}
                        {activeSubjects.map((subject, subIdx) => {
                          const key = cellKey(student.id, subject.name);
                          const cell = grid[key] ?? {
                            score: null,
                            scoreInput: "",
                            isDirty: false,
                          };

                          /**
                           * Mode lecture : note enregistrée en BDD, non modifiée, non en cours d'édition.
                           * Affiche le score en texte. Un clic ouvre le mode édition.
                           * Forcé si le trimestre est verrouillé OU si l'utilisateur est directeur.
                           */
                          const isLocked = !!trimesterLock || isDirector;
                          const isReadMode =
                            isLocked ||
                            (cell.score !== null &&
                              !!cell.existingGradeId &&
                              !cell.isDirty &&
                              !editingCells.has(key));

                          return (
                            <td
                              key={subject.name}
                              className={`px-1.5 py-1.5 text-center border-r last:border-r-0 ${
                                cell.score === null && !cell.isDirty && !editingCells.has(key)
                                  ? "bg-slate-50/70"
                                  : ""
                              }`}
                            >
                              {isReadMode ? (
                                /* ── Affichage lecture ── */
                                isLocked ? (
                                  /* Verrouillé : texte simple, non cliquable */
                                  <div
                                    className={`w-14 h-8 mx-auto flex items-center justify-center text-sm font-semibold ${
                                      cell.score !== null
                                        ? scoreColor(cell.score, maxScore)
                                        : "text-muted-foreground"
                                    }`}
                                  >
                                    {cell.score !== null ? cell.score.toFixed(1) : "—"}
                                  </div>
                                ) : (
                                  /* Non verrouillé : cliquable pour modifier */
                                  <button
                                    type="button"
                                    onClick={() => enterEditMode(key)}
                                    title="Cliquer pour modifier"
                                    className={`
                                      w-14 h-8 mx-auto flex items-center justify-center gap-0.5 rounded-md
                                      border border-transparent text-sm font-semibold
                                      hover:border-muted-foreground/30 hover:bg-muted/40
                                      transition-all cursor-pointer group
                                      ${scoreColor(cell.score, maxScore)}
                                    `}
                                  >
                                    {cell.score?.toFixed(1)}
                                    <Pencil className="h-2.5 w-2.5 opacity-0 group-hover:opacity-40 transition-opacity shrink-0" />
                                  </button>
                                )
                              ) : (
                                /* ── Mode saisie / édition ── */
                                <Input
                                  id={`cell-${student.id}-${subject.name}`}
                                  type="text"
                                  inputMode="decimal"
                                  autoFocus={editingCells.has(key)}
                                  value={cell.scoreInput}
                                  onChange={(e) =>
                                    handleCellChange(student.id, subject.name, e.target.value)
                                  }
                                  onKeyDown={(e) => {
                                    if (e.key === "Escape" && !cell.isDirty && cell.existingGradeId) {
                                      exitEditMode(key);
                                      return;
                                    }
                                    handleKeyDown(e, sIdx, subIdx);
                                  }}
                                  onBlur={() => {
                                    // Quitter le mode édition si rien n'a changé
                                    if (editingCells.has(key) && !cell.isDirty && cell.existingGradeId) {
                                      exitEditMode(key);
                                    }
                                  }}
                                  placeholder="—"
                                  className={`w-14 h-8 text-center px-1 text-xs mx-auto ${
                                    cell.isDirty
                                      ? "border-amber-400 bg-amber-50/80 ring-1 ring-amber-300"
                                      : editingCells.has(key)
                                      ? "border-primary ring-1 ring-primary/30"
                                      : cell.score === null
                                      ? "border-dashed border-muted-foreground/30 text-muted-foreground/60"
                                      : ""
                                  } ${cell.isDirty ? scoreColor(cell.score, maxScore) : ""}`}
                                />
                              )}
                            </td>
                          );
                        })}

                        {/* Moyenne élève — calculée en temps réel */}
                        <td className="px-4 py-2 text-center bg-blue-50/40 border-l">
                          {avg !== null ? (
                            <div>
                              <span
                                className={`font-bold text-sm ${scoreColor(avg, maxScore)}`}
                              >
                                {avg.toFixed(2)}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                /{maxScore}
                              </span>
                              <p className="text-[10px] text-muted-foreground mt-0.5">
                                {appreciation(avg, maxScore)}
                              </p>
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-sm">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}

                  {/* Ligne moyenne de classe par matière */}
                  <tr className="bg-muted/40 border-t-2 font-semibold">
                    <td className="sticky left-0 z-10 bg-muted/40 px-4 py-2.5 text-sm border-r">
                      Moy. classe
                    </td>
                    {activeSubjects.map((subject) => {
                      const avg = subjectAvg(subject.name);
                      return (
                        <td
                          key={subject.name}
                          className="px-2 py-2.5 text-center border-r last:border-r-0"
                        >
                          {avg !== null ? (
                            <span className={`text-sm ${scoreColor(avg, maxScore)}`}>
                              {avg.toFixed(1)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-sm">—</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-4 py-2.5 text-center bg-blue-100/60 border-l">
                      {classAvg !== null ? (
                        <span
                          className={`font-bold text-sm ${scoreColor(classAvg, maxScore)}`}
                        >
                          {classAvg.toFixed(2)}/{maxScore}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Footer save — masqué si trimestre verrouillé ou si directeur */}
            {dirtyCount > 0 && !trimesterLock && !isDirector && (
              <div className="p-4 border-t bg-amber-50/60 flex items-center justify-between gap-3">
                <p className="text-sm text-amber-700 font-medium">
                  {dirtyCount} note{dirtyCount > 1 ? "s" : ""} non
                  enregistrée{dirtyCount > 1 ? "s" : ""}
                </p>
                <Button onClick={handleSave} disabled={isSaving} className="gap-2">
                  {isSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Enregistrer tout
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Export : Suspense requis par useSearchParams (Next.js App Router) ─────────

export default function GradesPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <GradesPageContent />
    </Suspense>
  );
}
