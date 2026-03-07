"use client";

import { useState, useEffect, useCallback, useMemo, Suspense, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Printer, Download, Loader2, Users, BookOpen,
  RefreshCw, FileText, School, WifiOff, AlertTriangle, CheckCircle2, Pencil,
  Lock, ShieldCheck, Search, Eye, ChevronLeft, ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card, CardContent, CardHeader, CardTitle,
} from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useOnline } from "@/hooks/use-online";
import { useAuth } from "@/contexts/AuthContext";
import * as storage from "@/lib/storage";
import { getClasses, getClassSubjects } from "@/lib/api/classes.service";
import { getStudents } from "@/lib/api/students.service";
import {
  getGrades, checkTrimesterLock,
  type BackendGrade, type TrimesterLock,
} from "@/lib/api/grades.service";
import { TRIMESTERS, getMaxScoreForLevel, getSubjectsForLevel } from "@/lib/subjects-config";
import { formatClassName } from "@/lib/class-helpers";
import {
  generateBulletinPDF,
  generateAllBulletinsPDF,
  type BulletinData,
} from "@/lib/bulletin-pdf";

// ─── Types locaux ─────────────────────────────────────────────────────────────

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
  gender?: string;
}

interface ValidationWarning {
  studentName: string;
  missingSubjects: string[];
}

interface PendingData {
  students: StudentInfo[];
  allGrades: BackendGrade[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function currentAcademicYear(): string {
  const y = new Date().getFullYear();
  return `${y}-${y + 1}`;
}

/** Retourne les 2 années passées, l'année courante et la suivante */
function getAcademicYears(): string[] {
  const y = new Date().getFullYear();
  return [
    `${y - 2}-${y - 1}`,
    `${y - 1}-${y}`,
    `${y}-${y + 1}`,
    `${y + 1}-${y + 2}`,
  ];
}

function appreciation(score: number, maxScore: number): string {
  const p = score / maxScore;
  if (p >= 0.9) return "Excellent";
  if (p >= 0.8) return "Très bien";
  if (p >= 0.7) return "Bien";
  if (p >= 0.6) return "Assez bien";
  if (p >= 0.5) return "Passable";
  return "Insuffisant";
}

function scoreColor(score: number | null, maxScore: number): string {
  if (score === null) return "text-muted-foreground";
  const p = score / maxScore;
  if (p >= 0.8) return "text-emerald-700 font-bold";
  if (p >= 0.5) return "text-blue-700 font-semibold";
  return "text-red-700 font-semibold";
}

/** Calcule la moyenne pondérée à partir des notes d'un élève */
function computeAvg(grades: BackendGrade[]): number | null {
  if (grades.length === 0) return null;
  let pts = 0, coefs = 0;
  for (const g of grades) {
    pts   += g.score * g.coefficient;
    coefs += g.coefficient;
  }
  return coefs === 0 ? null : pts / coefs;
}

/** Assigne les rangs (ex æquo inclus) depuis un tableau trié décroissant */
function assignRanks(avgs: (number | null)[]): (number | null)[] {
  const sorted = [...avgs]
    .map((v, i) => ({ v, i }))
    .filter((x) => x.v !== null)
    .sort((a, b) => (b.v as number) - (a.v as number));

  const rankMap = new Map<number, number>();
  let rank = 1;
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i].v !== sorted[i - 1].v) rank = i + 1;
    rankMap.set(sorted[i].i, rank);
  }
  return avgs.map((_, i) => rankMap.get(i) ?? null);
}

/** Impression individuelle dans une nouvelle fenêtre */
function printBulletin(html: string) {
  const win = window.open("", "_blank", "width=900,height=700");
  if (!win) { toast.error("Autoriser les pop-ups pour imprimer"); return; }
  win.document.write(`
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="UTF-8" />
      <title>Bulletin scolaire</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: Arial, sans-serif; font-size: 12px; color: #1e1e1e; background: #fff; padding: 20px; }
        .header { background: #2563eb; color: #fff; text-align: center; padding: 14px 10px 12px; border-radius: 4px 4px 0 0; }
        .header h1 { font-size: 18px; font-weight: bold; margin-bottom: 4px; }
        .header .sub { font-size: 11px; }
        .info-box { background: #f3f4f6; padding: 10px 12px; border: 1px solid #d1d5db; display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin-top: 4px; }
        .info-box strong { display: inline; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        thead tr { background: #2563eb; color: #fff; }
        th, td { padding: 5px 8px; text-align: left; border: 1px solid #e5e7eb; font-size: 11px; }
        tbody tr:nth-child(even) { background: #f9fafb; }
        .score-green { color: #059669; font-weight: 600; }
        .score-blue  { color: #2563eb; font-weight: 600; }
        .score-red   { color: #dc2626; font-weight: 600; }
        .avg-bar { padding: 8px 12px; color: #fff; font-weight: bold; font-size: 13px; display: flex; justify-content: space-between; margin-top: 8px; border-radius: 4px; }
        .avg-green { background: #059669; }
        .avg-blue  { background: #2563eb; }
        .avg-red   { background: #dc2626; }
        .stats { background: #f9fafb; border: 1px solid #d1d5db; padding: 8px 12px; margin-top: 6px; font-size: 10px; color: #6b7280; }
        .signature { margin-top: 20px; display: flex; justify-content: flex-end; }
        .sig-line { text-align: center; }
        .sig-line span { display: block; font-size: 11px; margin-bottom: 30px; }
        .sig-line hr { border: none; border-top: 1px solid #555; width: 140px; }
        @media print { body { padding: 0; } }
      </style>
    </head>
    <body>${html}</body>
    </html>
  `);
  win.document.close();
  setTimeout(() => { win.print(); win.close(); }, 400);
}

// ─── Composant BulletinCard ───────────────────────────────────────────────────

interface BulletinCardProps {
  data: BulletinData;
  rank: number | null;
  classAvg: number | null;
  studentsWithScores: number;
}

function BulletinCard({ data, rank, classAvg, studentsWithScores }: BulletinCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);

  function handlePrint() {
    if (!cardRef.current) return;
    printBulletin(cardRef.current.innerHTML);
  }

  function handlePDF() {
    generateBulletinPDF({ ...data, classAvg, classRank: rank, totalStudents: studentsWithScores });
    toast.success(`PDF généré — ${data.studentName}`);
  }

  const avg = data.weightedAvg;
  const avgPct = avg !== null ? avg / data.maxScore : null;
  const avgBarClass =
    avgPct === null ? "bg-muted text-foreground" :
    avgPct >= 0.8  ? "bg-emerald-600 text-white"  :
    avgPct >= 0.5  ? "bg-blue-600 text-white"      :
                     "bg-red-600 text-white";

  return (
    <div className="bg-white border rounded-xl shadow-sm overflow-hidden print:shadow-none print:rounded-none">

      {/* Contenu HTML imprimable (masqué, copié dans la fenêtre d'impression) */}
      <div ref={cardRef} className="hidden">
        <div className="header" style={{ position: "relative" }}>
          {data.schoolLogo && (
            <img
              src={data.schoolLogo}
              alt="logo"
              style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", height: 36, width: 36, objectFit: "contain", borderRadius: 4 }}
            />
          )}
          <h1>{data.schoolName || "Mon École"}</h1>
          <p className="sub">BULLETIN DE NOTES — {data.academicYear} | {data.trimester}</p>
        </div>
        <div className="info-box">
          <div><strong>Nom et Prénom :</strong> {data.studentName}</div>
          <div><strong>Classe :</strong> {data.className}</div>
          <div><strong>Matricule :</strong> {data.matricule}</div>
          {data.level && <div><strong>Niveau :</strong> {data.level}</div>}
        </div>
        <table>
          <thead>
            <tr>
              <th>Matière</th>
              <th style={{ textAlign: "center" }}>Coef</th>
              <th style={{ textAlign: "center" }}>Note</th>
              <th style={{ textAlign: "center" }}>%</th>
              <th style={{ textAlign: "center" }}>Appréciation</th>
            </tr>
          </thead>
          <tbody>
            {data.grades.map((g) => {
              const pct = g.score / g.maxScore;
              const cls = pct >= 0.8 ? "score-green" : pct >= 0.5 ? "score-blue" : "score-red";
              return (
                <tr key={g.subject}>
                  <td>{g.subject}</td>
                  <td style={{ textAlign: "center" }}>{g.coefficient}</td>
                  <td className={cls} style={{ textAlign: "center" }}>{g.score.toFixed(1)}/{g.maxScore}</td>
                  <td className={cls} style={{ textAlign: "center" }}>{(pct * 100).toFixed(0)}%</td>
                  <td style={{ textAlign: "center" }}>{appreciation(g.score, g.maxScore)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {avg !== null && (
          <div className={`avg-bar ${avgPct !== null && avgPct >= 0.8 ? "avg-green" : avgPct !== null && avgPct >= 0.5 ? "avg-blue" : "avg-red"}`}>
            <span>MOYENNE GÉNÉRALE</span>
            <span>{avg.toFixed(2)}/{data.maxScore} — {appreciation(avg, data.maxScore)}</span>
          </div>
        )}
        <div className="stats">
          {classAvg !== null && classAvg !== undefined && (
            <span style={{ marginRight: 24 }}>Moyenne de la classe : {classAvg.toFixed(2)}/{data.maxScore}</span>
          )}
          {rank !== null && <span>Rang : {rank}/{studentsWithScores}</span>}
        </div>
        <div className="signature">
          <div className="sig-line">
            <span>Le Directeur</span>
            <hr />
          </div>
        </div>
      </div>

      {/* Aperçu visible dans la page ── */}

      {/* Header */}
      <div className="bg-blue-600 text-white px-4 py-3 text-center">
        <p className="font-bold text-sm">{data.schoolName || "Mon École"}</p>
        <p className="text-xs opacity-90">BULLETIN DE NOTES — {data.academicYear} | {data.trimester}</p>
      </div>

      {/* Infos élève */}
      <div className="bg-gray-50 px-4 py-2.5 border-b grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <div><span className="font-medium text-muted-foreground">Nom :</span> <span className="font-semibold">{data.studentName}</span></div>
        <div><span className="font-medium text-muted-foreground">Classe :</span> {data.className}</div>
        <div><span className="font-medium text-muted-foreground">Matricule :</span> {data.matricule}</div>
        <div>
          {rank !== null && (
            <span className="font-medium text-muted-foreground">
              Rang : <span className="text-foreground">{rank}/{studentsWithScores}</span>
            </span>
          )}
        </div>
      </div>

      {/* Tableau des notes */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-blue-600 text-white">
              <th className="px-3 py-2 text-left">Matière</th>
              <th className="px-2 py-2 text-center w-12">Coef</th>
              <th className="px-2 py-2 text-center w-20">Note</th>
              <th className="px-2 py-2 text-center w-16">%</th>
              <th className="px-3 py-2 text-center">Appréciation</th>
            </tr>
          </thead>
          <tbody>
            {data.grades.map((g, i) => {
              const pct = g.score / g.maxScore;
              return (
                <tr key={g.subject} className={`border-b ${i % 2 === 0 ? "bg-white" : "bg-gray-50"}`}>
                  <td className="px-3 py-1.5 font-medium">{g.subject}</td>
                  <td className="px-2 py-1.5 text-center text-muted-foreground">{g.coefficient}</td>
                  <td className={`px-2 py-1.5 text-center font-semibold ${scoreColor(g.score, g.maxScore)}`}>
                    {g.score.toFixed(1)}<span className="text-muted-foreground font-normal">/{g.maxScore}</span>
                  </td>
                  <td className={`px-2 py-1.5 text-center ${scoreColor(g.score, g.maxScore)}`}>
                    {(pct * 100).toFixed(0)}%
                  </td>
                  <td className="px-3 py-1.5 text-center text-muted-foreground">
                    {appreciation(g.score, g.maxScore)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Moyenne générale */}
      {avg !== null ? (
        <div className={`px-4 py-2.5 flex items-center justify-between text-sm font-bold ${avgBarClass}`}>
          <span>Moyenne générale</span>
          <span>
            {avg.toFixed(2)}/{data.maxScore}
            <span className="ml-2 font-normal text-xs opacity-90">— {appreciation(avg, data.maxScore)}</span>
          </span>
        </div>
      ) : (
        <div className="px-4 py-2.5 text-xs text-muted-foreground text-center">Aucune note saisie</div>
      )}

      {/* Statistiques de classe */}
      {(classAvg !== null && classAvg !== undefined) && (
        <div className="px-4 py-2 bg-muted/30 border-t text-xs text-muted-foreground flex gap-4">
          <span>Moy. classe : <strong>{classAvg.toFixed(2)}/{data.maxScore}</strong></span>
          {rank !== null && <span>Rang : <strong>{rank}/{studentsWithScores}</strong></span>}
        </div>
      )}

      {/* Actions */}
      <div className="px-4 py-3 border-t flex gap-2 bg-white">
        <Button size="sm" variant="outline" className="gap-1.5 flex-1" onClick={handlePrint}>
          <Printer className="h-3.5 w-3.5" /> Imprimer
        </Button>
        <Button size="sm" className="gap-1.5 flex-1" onClick={handlePDF}>
          <Download className="h-3.5 w-3.5" /> PDF
        </Button>
      </div>
    </div>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────

function BulletinsContent() {
  const isOnline = useOnline();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isLoading: authLoading } = useAuth();

  // ── Restriction : directeur uniquement ──────────────────────────────────────
  useEffect(() => {
    if (!authLoading && user && user.role !== "director") {
      toast.error("Accès réservé au directeur", {
        description: "Seul le directeur peut générer les bulletins.",
      });
      router.replace("/dashboard/grades");
    }
  }, [authLoading, user, router]);

  // ── Paramètres ──────────────────────────────────────────────────────────────
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [selectedClassId, setSelectedClassId]  = useState(() => searchParams.get("classId")   ?? "");
  const [selectedTrimester, setSelectedTrimester] = useState(() => searchParams.get("trimester") ?? "Trimestre 1");

  // Nom d'école : priorité localStorage (override manuel) > profil utilisateur
  const [schoolName, setSchoolName] = useState(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("structura_school_name") ?? "";
  });
  const [editingSchoolName, setEditingSchoolName] = useState(false);

  // Si aucune valeur locale, utiliser celle du profil
  useEffect(() => {
    if (!schoolName && user?.schoolName) {
      setSchoolName(user.schoolName);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.schoolName]);

  // ── Logo de l'école (base64 pour PDF + print) ────────────────────────────────
  const [logoBase64, setLogoBase64] = useState<string | null>(null);

  useEffect(() => {
    const logoUrl = user?.schoolLogo;
    if (!logoUrl) { setLogoBase64(null); return; }
    if (logoUrl.startsWith("data:")) { setLogoBase64(logoUrl); return; }

    let cancelled = false;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (cancelled) return;
      try {
        const canvas = document.createElement("canvas");
        canvas.width  = img.naturalWidth  || 300;
        canvas.height = img.naturalHeight || 300;
        const ctx = canvas.getContext("2d");
        if (!ctx) { setLogoBase64(null); return; }
        ctx.drawImage(img, 0, 0);
        setLogoBase64(canvas.toDataURL("image/png"));
      } catch { setLogoBase64(null); }
    };
    img.onerror = () => { if (!cancelled) setLogoBase64(null); };
    img.src = logoUrl.includes("?") ? logoUrl : `${logoUrl}?cb=${Date.now()}`;

    return () => { cancelled = true; };
  }, [user?.schoolLogo]);

  // ── Données générées ─────────────────────────────────────────────────────────
  const [bulletins, setBulletins] = useState<BulletinData[]>([]);
  const [ranks, setRanks] = useState<(number | null)[]>([]);
  const [classAvg, setClassAvg] = useState<number | null>(null);
  const [studentsWithScores, setStudentsWithScores] = useState(0);

  // ── Validation trimestre ──────────────────────────────────────────────────────
  const [showValidationDialog, setShowValidationDialog] = useState(false);
  const [validationWarnings, setValidationWarnings] = useState<ValidationWarning[]>([]);
  const [pendingData, setPendingData] = useState<PendingData | null>(null);

  // ── Verrou de trimestre ───────────────────────────────────────────────────────
  const [trimesterLock, setTrimesterLock] = useState<TrimesterLock | null>(null);
  const [isCheckingLock, setIsCheckingLock] = useState(false);

  // ── Classes validées (par trimestre) ─────────────────────────────────────────
  // { "Trimestre 1": ["classId1", "classId2"], ... }
  const [lockedByTrimester, setLockedByTrimester] = useState<Record<string, string[]>>({});
  const [isLoadingLocks, setIsLoadingLocks] = useState(false);

  // ── États UI ─────────────────────────────────────────────────────────────────
  const [isLoadingClasses, setIsLoadingClasses] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generated, setGenerated] = useState(false);

  // Recherche + modal bulletin individuel
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedBulletinIdx, setSelectedBulletinIdx] = useState<number | null>(null);

  const [academicYear, setAcademicYear] = useState(
    () => searchParams.get("academicYear") ?? currentAcademicYear()
  );
  const selectedClass = classes.find((c) => c.id === selectedClassId);
  const maxScore = getMaxScoreForLevel(selectedClass?.level ?? "Primaire");

  // ── Persister le nom de l'école ─────────────────────────────────────────────
  function handleSchoolNameChange(val: string) {
    setSchoolName(val);
    if (typeof window !== "undefined") {
      localStorage.setItem("structura_school_name", val);
    }
  }

  // Source du nom (pour l'affichage)
  const schoolNameSource = (() => {
    if (typeof window !== "undefined" && localStorage.getItem("structura_school_name")) {
      return "local";
    }
    if (user?.schoolName) return "profile";
    return "none";
  })();

  // ── 1. Charger les classes ──────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setIsLoadingClasses(true);
      const token = storage.getAuthItem("structura_token");
      if (!token) { setIsLoadingClasses(false); return; }
      try {
        const res = await getClasses(token);
        const data = Array.isArray(res) ? res : (res as any).classes ?? [];
        if (!cancelled) {
          setClasses(
            data.map((c: any) => ({
              id: c.id,
              name: c.name,
              section: c.section ?? null,
              level: c.level ?? "Primaire",
            }))
          );
        }
      } catch {
        toast.error("Impossible de charger les classes");
      } finally {
        if (!cancelled) setIsLoadingClasses(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  // ── 1b. Charger tous les verrous (toutes classes × tous trimestres) ───────────
  useEffect(() => {
    if (classes.length === 0) return;
    let cancelled = false;
    const token = storage.getAuthItem("structura_token");
    if (!token) return;

    setIsLoadingLocks(true);
    const trimesters = TRIMESTERS.map((t) => t.value);

    async function loadAllLocks() {
      const result: Record<string, string[]> = {};
      await Promise.all(
        trimesters.map(async (trimester) => {
          const locked: string[] = [];
          await Promise.all(
            classes.map(async (cls) => {
              try {
                const lock = await checkTrimesterLock(token!, cls.id, trimester, academicYear);
                if (lock?.isLocked) locked.push(cls.id);
              } catch { /* ignorer */ }
            })
          );
          if (!cancelled) result[trimester] = locked;
        })
      );
      if (!cancelled) {
        setLockedByTrimester(result);
        setIsLoadingLocks(false);
      }
    }

    loadAllLocks();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classes, academicYear]);

  // ── 2. Vérifier le verrou quand classe ou trimestre change ────────────────────
  useEffect(() => {
    if (!selectedClassId) { setTrimesterLock(null); return; }

    let cancelled = false;
    setIsCheckingLock(true);
    setGenerated(false);
    setBulletins([]);

    const token = storage.getAuthItem("structura_token");
    if (!token) { setIsCheckingLock(false); return; }

    // Cache localStorage (clé identique à celle de la page notes)
    const lockCacheKey = `structura_tlock_${selectedClassId}_${selectedTrimester.replace(/\s/g, "_")}_${academicYear}`;

    async function checkLock() {
      try {
        const lock = await checkTrimesterLock(token!, selectedClassId, selectedTrimester, academicYear);
        if (!cancelled) {
          setTrimesterLock(lock);
          if (lock) {
            try { localStorage.setItem(lockCacheKey, JSON.stringify(lock)); } catch { /* quota */ }
          } else {
            localStorage.removeItem(lockCacheKey);
          }
        }
      } catch {
        // Fallback localStorage
        if (!cancelled) {
          try {
            const raw = localStorage.getItem(lockCacheKey);
            setTrimesterLock(raw ? JSON.parse(raw) : null);
          } catch {
            setTrimesterLock(null);
          }
        }
      } finally {
        if (!cancelled) setIsCheckingLock(false);
      }
    }

    checkLock();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClassId, selectedTrimester, academicYear]);

  // ── 3. Construire les bulletins depuis des données déjà chargées ─────────────
  const buildBulletins = useCallback((students: StudentInfo[], allGrades: BackendGrade[], silent = false) => {
    if (!selectedClass) return;

    const gradesByStudent = new Map<string, BackendGrade[]>();
    for (const g of allGrades) {
      if (!gradesByStudent.has(g.studentId)) gradesByStudent.set(g.studentId, []);
      gradesByStudent.get(g.studentId)!.push(g);
    }

    const built: BulletinData[] = students.map((s) => {
      const sGrades = gradesByStudent.get(s.id) ?? [];
      const avg = computeAvg(sGrades);
      return {
        studentName:  s.name,
        matricule:    s.matricule,
        className:    formatClassName(selectedClass.name, selectedClass.section),
        level:        selectedClass.level,
        trimester:    selectedTrimester,
        academicYear,
        schoolName:   schoolName || undefined,
        schoolLogo:   logoBase64 ?? undefined,
        maxScore,
        weightedAvg:  avg,
        grades: sGrades.map((g) => ({
          subject:     g.subject,
          score:       g.score,
          maxScore:    g.maxScore,
          coefficient: g.coefficient,
          teacherName: g.teacherName,
        })),
      };
    });

    const avgs = built.map((b) => b.weightedAvg);
    const computedRanks = assignRanks(avgs);
    const withScores = avgs.filter((a) => a !== null).length;
    const validAvgs = avgs.filter((a): a is number => a !== null);
    const clsAvg = validAvgs.length > 0
      ? validAvgs.reduce((a, b) => a + b, 0) / validAvgs.length
      : null;

    // Trier par ordre de mérite — moyenne décroissante (nulls en dernier)
    const paired = built
      .map((b, i) => ({ b, rank: computedRanks[i] }))
      .sort((a, z) => {
        if (a.b.weightedAvg === null) return 1;
        if (z.b.weightedAvg === null) return -1;
        return z.b.weightedAvg - a.b.weightedAvg;
      });

    setBulletins(paired.map((x) => x.b));
    setRanks(paired.map((x) => x.rank));
    setClassAvg(clsAvg);
    setStudentsWithScores(withScores);
    setGenerated(true);

    if (!silent) {
      toast.success(
        `${built.length} bulletin${built.length > 1 ? "s" : ""} généré${built.length > 1 ? "s" : ""}`,
        { description: `${selectedTrimester} · ${academicYear}` }
      );
    }
  }, [selectedClass, selectedTrimester, academicYear, schoolName, logoBase64, maxScore]);

  // ── 3. Générer les bulletins (avec validation) ────────────────────────────────
  const generate = useCallback(async (force = false, silent = false) => {
    if (!selectedClassId || !selectedClass) {
      toast.error("Veuillez sélectionner une classe");
      return;
    }
    const token = storage.getAuthItem("structura_token");
    if (!token) { toast.error("Session expirée"); return; }

    setIsGenerating(true);
    setGenerated(false);
    setBulletins([]);
    setSearchQuery("");
    setSelectedBulletinIdx(null);

    try {
      // Charger élèves, notes et matières configurées en parallèle
      const [studentsRes, gradesRes, classSubjectsRes] = await Promise.all([
        getStudents(token, { classId: selectedClassId }),
        getGrades(token, { classId: selectedClassId, term: selectedTrimester, academicYear }),
        getClassSubjects(token, selectedClassId).catch(() => []),
      ]);

      const students: StudentInfo[] = (
        Array.isArray(studentsRes) ? studentsRes : (studentsRes as any).students ?? []
      ).map((s: any) => ({
        id: s.id,
        name: `${s.firstName ?? ""} ${s.lastName ?? ""}`.trim(),
        matricule: s.matricule ?? "",
        gender: s.gender ?? undefined,
      }));

      const allGrades = gradesRes as BackendGrade[];

      // ── Validation de l'intégrité des notes (sauf si forcé) ─────────────────
      if (!force) {
        // Matières attendues : configurées > par défaut du niveau
        const expectedSubjects: string[] = classSubjectsRes.length > 0
          ? classSubjectsRes.map((s: any) => s.name)
          : getSubjectsForLevel(selectedClass.level).map((s) => s.name);

        if (expectedSubjects.length > 0) {
          const gradesByStudent = new Map<string, BackendGrade[]>();
          for (const g of allGrades) {
            if (!gradesByStudent.has(g.studentId)) gradesByStudent.set(g.studentId, []);
            gradesByStudent.get(g.studentId)!.push(g);
          }

          const warnings: ValidationWarning[] = [];
          for (const student of students) {
            const sGrades = gradesByStudent.get(student.id) ?? [];
            const gradedSubjects = new Set(sGrades.map((g) => g.subject));
            const missing = expectedSubjects.filter((name) => !gradedSubjects.has(name));
            if (missing.length > 0) {
              warnings.push({ studentName: student.name, missingSubjects: missing });
            }
          }

          if (warnings.length > 0) {
            // Stocker les données et afficher le dialog de confirmation
            setPendingData({ students, allGrades });
            setValidationWarnings(warnings);
            setShowValidationDialog(true);
            setIsGenerating(false);
            return;
          }
        }
      }

      // Tout est complet (ou génération forcée) → construire les bulletins
      buildBulletins(students, allGrades, silent);

    } catch (err: any) {
      toast.error(err.message || "Erreur lors de la génération");
    } finally {
      setIsGenerating(false);
    }
  }, [selectedClassId, selectedClass, selectedTrimester, academicYear, buildBulletins]);

  // Confirmation "Générer quand même"
  function handleForceGenerate() {
    setShowValidationDialog(false);
    if (pendingData) {
      buildBulletins(pendingData.students, pendingData.allGrades);
    }
    setPendingData(null);
    setValidationWarnings([]);
  }

  function handleCancelGenerate() {
    setShowValidationDialog(false);
    setPendingData(null);
    setValidationWarnings([]);
  }

  // ── Auto-générer si params URL ET trimestre validé (silencieux — pas de toast) ─
  useEffect(() => {
    if (selectedClassId && classes.length > 0 && !generated && trimesterLock) {
      generate(false, true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classes, trimesterLock]);

  // ── Télécharger tous les bulletins en PDF ─────────────────────────────────────
  function handleDownloadAll() {
    const validBulletins = bulletins
      .map((b, i) => ({
        ...b,
        schoolName: schoolName || undefined,
        schoolLogo: logoBase64 ?? undefined,
        classAvg,
        classRank: ranks[i],
        totalStudents: studentsWithScores,
      }))
      .filter((b) => b.grades.length > 0);

    if (validBulletins.length === 0) {
      toast.info("Aucun élève avec des notes");
      return;
    }
    generateAllBulletinsPDF(
      validBulletins,
      formatClassName(selectedClass?.name ?? "", selectedClass?.section),
      selectedTrimester
    );
    toast.success(`PDF de ${validBulletins.length} bulletin${validBulletins.length > 1 ? "s" : ""} téléchargé`);
  }

  // ── Imprimer tous ─────────────────────────────────────────────────────────────
  function handlePrintAll() {
    if (bulletins.length === 0) return;

    const rows = bulletins.map((b, i) => {
      const avg = b.weightedAvg;
      const avgPct = avg !== null ? avg / b.maxScore : null;
      const avgBg = avgPct === null ? "#6b7280" : avgPct >= 0.8 ? "#059669" : avgPct >= 0.5 ? "#2563eb" : "#dc2626";
      const rank = ranks[i];

      const gradesHtml = b.grades.map((g, gi) => {
        const pct = g.score / g.maxScore;
        const col = pct >= 0.8 ? "#059669" : pct >= 0.5 ? "#2563eb" : "#dc2626";
        const bg  = gi % 2 === 0 ? "#f9fafb" : "#ffffff";
        const appreLabel = appreciation(g.score, g.maxScore);
        return `<tr style="background:${bg}">
          <td style="padding:5px 8px;border:1px solid #e5e7eb">${g.subject}</td>
          <td style="padding:5px 8px;border:1px solid #e5e7eb;text-align:center">${g.coefficient}</td>
          <td style="padding:5px 8px;border:1px solid #e5e7eb;text-align:center;color:${col};font-weight:600">${g.score.toFixed(1)}/${g.maxScore}</td>
          <td style="padding:5px 8px;border:1px solid #e5e7eb;text-align:center;color:${col}">${(pct*100).toFixed(0)}%</td>
          <td style="padding:5px 8px;border:1px solid #e5e7eb;text-align:center">${appreLabel}</td>
        </tr>`;
      }).join("");

      const avgLabel = avg !== null ? appreciation(avg, b.maxScore) : "";

      return `<div style="page-break-after:${i < bulletins.length - 1 ? "always" : "auto"};padding:20px;font-family:Arial,sans-serif;font-size:12px">
        <div style="background:#2563eb;color:#fff;text-align:center;padding:14px 10px;border-radius:4px 4px 0 0;position:relative">
          ${logoBase64 ? `<img src="${logoBase64}" alt="logo" style="position:absolute;left:12px;top:50%;transform:translateY(-50%);height:36px;width:36px;object-fit:contain;border-radius:4px" />` : ""}
          <h2 style="font-size:17px;margin:0 0 4px">${schoolName || "Mon École"}</h2>
          <p style="margin:0;font-size:11px">BULLETIN DE NOTES — ${b.academicYear} | ${b.trimester}</p>
        </div>
        <div style="background:#f3f4f6;padding:10px 12px;border:1px solid #d1d5db;display:grid;grid-template-columns:1fr 1fr;gap:4px;font-size:11px">
          <div><strong>Nom :</strong> ${b.studentName}</div>
          <div><strong>Classe :</strong> ${b.className}</div>
          <div><strong>Matricule :</strong> ${b.matricule}</div>
          ${rank !== null ? `<div><strong>Rang :</strong> ${rank}/${studentsWithScores}</div>` : "<div></div>"}
        </div>
        <table style="width:100%;border-collapse:collapse;margin-top:8px;font-size:11px">
          <thead>
            <tr style="background:#2563eb;color:#fff">
              <th style="padding:6px 8px;text-align:left">Matière</th>
              <th style="padding:6px 8px;text-align:center;width:40px">Coef</th>
              <th style="padding:6px 8px;text-align:center;width:70px">Note</th>
              <th style="padding:6px 8px;text-align:center;width:40px">%</th>
              <th style="padding:6px 8px;text-align:center">Appréciation</th>
            </tr>
          </thead>
          <tbody>${gradesHtml}</tbody>
        </table>
        ${avg !== null ? `<div style="background:${avgBg};color:#fff;padding:8px 12px;display:flex;justify-content:space-between;font-weight:bold;font-size:13px;margin-top:6px">
          <span>MOYENNE GÉNÉRALE</span><span>${avg.toFixed(2)}/${b.maxScore} — ${avgLabel}</span>
        </div>` : ""}
        ${classAvg !== null ? `<div style="background:#f9fafb;border:1px solid #d1d5db;padding:6px 12px;font-size:10px;color:#6b7280;margin-top:4px">
          Moy. classe : ${classAvg.toFixed(2)}/${b.maxScore}${rank !== null ? `   |   Rang : ${rank}/${studentsWithScores}` : ""}
        </div>` : ""}
        <div style="margin-top:20px;text-align:right"><span style="font-size:11px">Signature du Directeur :<br><br><hr style="width:140px;border:none;border-top:1px solid #555;margin-top:8px"></span></div>
        <p style="font-size:8px;color:#aaa;text-align:center;margin-top:10px">Généré le ${new Date().toLocaleDateString("fr-FR")} par Structura</p>
      </div>`;
    });

    printBulletin(rows.join(""));
  }

  // ── Bulletins filtrés (recherche nom / matricule) ────────────────────────────
  const filteredBulletins = useMemo(() => {
    const items = bulletins.map((b, idx) => ({ b, idx }));
    if (!searchQuery.trim()) return items;
    const q = searchQuery.toLowerCase().trim();
    return items.filter(({ b }) =>
      b.studentName.toLowerCase().includes(q) ||
      b.matricule.toLowerCase().includes(q)
    );
  }, [bulletins, searchQuery]);

  // ─── Garde : accès directeur uniquement ─────────────────────────────────────
  if (!authLoading && user && user.role !== "director") {
    return null; // Le useEffect redirige déjà
  }

  // ─── Rendu ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* ── Dialog de validation trimestre ── */}
      <Dialog open={showValidationDialog} onOpenChange={setShowValidationDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="h-5 w-5" />
              Notes incomplètes détectées
            </DialogTitle>
            <DialogDescription>
              {validationWarnings.length} élève{validationWarnings.length > 1 ? "s" : ""} n&apos;ont pas toutes leurs notes pour <strong>{selectedTrimester}</strong>.
              Le trimestre est peut-être encore en cours.
            </DialogDescription>
          </DialogHeader>

          {/* Liste des élèves concernés */}
          <div className="max-h-60 overflow-y-auto rounded-lg border bg-amber-50/50 divide-y">
            {validationWarnings.map((w, i) => (
              <div key={i} className="px-4 py-2.5 text-sm">
                <p className="font-medium text-foreground">{w.studentName}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {w.missingSubjects.length} matière{w.missingSubjects.length > 1 ? "s" : ""} manquante{w.missingSubjects.length > 1 ? "s" : ""} :&nbsp;
                  <span className="text-amber-700">{w.missingSubjects.slice(0, 4).join(", ")}{w.missingSubjects.length > 4 ? `…` : ""}</span>
                </p>
              </div>
            ))}
          </div>

          <div className="bg-blue-50 rounded-lg px-4 py-3 text-sm text-blue-800 flex gap-2">
            <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-blue-600" />
            <span>Vous pouvez retourner saisir les notes manquantes, ou générer quand même avec les notes disponibles.</span>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={handleCancelGenerate}>
              Retourner saisir les notes
            </Button>
            <Button
              variant="default"
              className="bg-amber-600 hover:bg-amber-700"
              onClick={handleForceGenerate}
            >
              Générer quand même
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Header ── */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <Link href={`/dashboard/grades${selectedClassId ? `?classId=${selectedClassId}&trimester=${selectedTrimester}` : ""}`}>
            <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
              <FileText className="h-6 w-6 text-blue-600" />
              Bulletins Scolaires
            </h1>
            <p className="text-muted-foreground mt-0.5 text-sm">
              Génération et impression des bulletins de notes par trimestre
            </p>
          </div>
        </div>

        {/* Badge de progression */}
        {generated && bulletins.length > 0 && (
          <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-700 border-emerald-200">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            {bulletins.length} bulletin{bulletins.length > 1 ? "s" : ""} générés
          </Badge>
        )}
      </div>

      {/* ── Classes validées ── */}
      {(isLoadingLocks || Object.values(lockedByTrimester).some((ids) => ids.length > 0)) && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Lock className="h-4 w-4 text-emerald-600" />
              Classes dont le trimestre est validé
              {isLoadingLocks && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground ml-1" />}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {TRIMESTERS.map((t) => {
              const ids = lockedByTrimester[t.value] ?? [];
              if (ids.length === 0) return null;
              return (
                <div key={t.value} className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t.label}</p>
                  <div className="flex flex-wrap gap-2">
                    {ids.map((id) => {
                      const cls = classes.find((c) => c.id === id);
                      if (!cls) return null;
                      const isActive = selectedClassId === id && selectedTrimester === t.value;
                      return (
                        <button
                          key={id}
                          onClick={() => {
                            setSelectedClassId(id);
                            setSelectedTrimester(t.value);
                            setGenerated(false);
                            setBulletins([]);
                            const params = new URLSearchParams(searchParams.toString());
                            params.set("classId", id);
                            params.set("trimester", t.value);
                            router.replace(`/dashboard/grades/bulletins?${params.toString()}`, { scroll: false });
                          }}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                            isActive
                              ? "bg-emerald-600 text-white border-emerald-600"
                              : "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                          }`}
                        >
                          <CheckCircle2 className="h-3 w-3" />
                          {formatClassName(cls.name, cls.section)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* ── Filtres ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">

          {/* ── Nom de l'école ── */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <School className="h-3.5 w-3.5 text-muted-foreground" />
              Nom de l&apos;établissement
            </Label>

            {editingSchoolName ? (
              <div className="flex items-center gap-2 max-w-md">
                <Input
                  autoFocus
                  placeholder="Ex : École Primaire Excellence, Lycée Mamou..."
                  value={schoolName}
                  onChange={(e) => handleSchoolNameChange(e.target.value)}
                  onBlur={() => setEditingSchoolName(false)}
                  onKeyDown={(e) => e.key === "Enter" && setEditingSchoolName(false)}
                />
              </div>
            ) : (
              <div className="flex items-center gap-2">
                {schoolName ? (
                  <>
                    <span className="text-sm font-medium">{schoolName}</span>
                    {schoolNameSource === "profile" && (
                      <Badge variant="outline" className="text-xs text-blue-600 border-blue-200 bg-blue-50">
                        <CheckCircle2 className="h-3 w-3 mr-1" /> Depuis votre profil
                      </Badge>
                    )}
                  </>
                ) : (
                  <span className="text-sm text-muted-foreground italic">Aucun nom défini</span>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 gap-1 text-xs text-muted-foreground"
                  onClick={() => setEditingSchoolName(true)}
                >
                  <Pencil className="h-3 w-3" /> Modifier
                </Button>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              {schoolNameSource === "profile"
                ? "Nom détecté depuis votre profil · modifiable pour cette session"
                : "Mémorisé automatiquement pour les prochaines fois"}
            </p>
          </div>

          <Separator />

          {/* Classe + Année + Trimestre + Générer */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
                    setGenerated(false);
                    setBulletins([]);
                    const params = new URLSearchParams(searchParams.toString());
                    if (v) params.set("classId", v); else params.delete("classId");
                    router.replace(`/dashboard/grades/bulletins?${params.toString()}`, { scroll: false });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choisir une classe" />
                  </SelectTrigger>
                  <SelectContent>
                    {classes.map((cls) => (
                      <SelectItem key={cls.id} value={cls.id}>
                        {formatClassName(cls.name, cls.section)}
                        <span className="ml-1 text-xs text-muted-foreground">({cls.level})</span>
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

            {/* Année scolaire */}
            <div className="space-y-2">
              <Label>Année scolaire *</Label>
              <Select
                value={academicYear}
                onValueChange={(v) => {
                  setAcademicYear(v);
                  setGenerated(false);
                  setBulletins([]);
                  const params = new URLSearchParams(searchParams.toString());
                  params.set("academicYear", v);
                  router.replace(`/dashboard/grades/bulletins?${params.toString()}`, { scroll: false });
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {getAcademicYears().map((y) => (
                    <SelectItem key={y} value={y}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Trimestre */}
            <div className="space-y-2">
              <Label>Trimestre *</Label>
              <Select
                value={selectedTrimester}
                onValueChange={(v) => {
                  setSelectedTrimester(v);
                  setGenerated(false);
                  setBulletins([]);
                  const params = new URLSearchParams(searchParams.toString());
                  params.set("trimester", v);
                  router.replace(`/dashboard/grades/bulletins?${params.toString()}`, { scroll: false });
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TRIMESTERS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Bouton générer / rafraîchir */}
            <div className="space-y-2">
              <Label>&nbsp;</Label>
              {generated ? (
                /* Bulletins déjà générés → bouton discret "Rafraîchir" */
                <Button
                  variant="outline"
                  className="w-full gap-2 text-muted-foreground"
                  onClick={() => generate()}
                  disabled={isGenerating || isCheckingLock}
                  title="Regénérer si les notes ont changé"
                >
                  {isGenerating
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <RefreshCw className="h-4 w-4" />
                  }
                  {isGenerating ? "Génération..." : "Rafraîchir"}
                </Button>
              ) : (
                /* Bulletins non encore générés → bouton principal */
                <Button
                  className="w-full gap-2"
                  onClick={() => generate()}
                  disabled={!selectedClassId || isGenerating || isCheckingLock || !trimesterLock}
                >
                  {isGenerating || isCheckingLock
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : trimesterLock
                    ? <FileText className="h-4 w-4" />
                    : <Lock className="h-4 w-4" />
                  }
                  {isGenerating ? "Génération..." : isCheckingLock ? "Vérification..." : "Générer les bulletins"}
                </Button>
              )}
            </div>
          </div>

          {/* Badges d'info */}
          {selectedClass && (
            <div className="flex items-center gap-2 flex-wrap mt-1">
              <Badge variant="outline" className="text-xs">
                {formatClassName(selectedClass.name, selectedClass.section)}
              </Badge>
              <Badge variant="outline" className="text-xs">{selectedTrimester}</Badge>
              <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                Notes sur {maxScore}
              </Badge>
              <Badge variant="outline" className="text-xs text-muted-foreground">{academicYear}</Badge>
              {!isOnline && (
                <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
                  <WifiOff className="h-3 w-3 mr-1" /> Mode hors ligne
                </Badge>
              )}
              {trimesterLock && (
                <Badge className="text-xs bg-emerald-100 text-emerald-700 border-emerald-200 gap-1">
                  <ShieldCheck className="h-3 w-3" /> Trimestre validé
                </Badge>
              )}
            </div>
          )}

          {/* ── Bandeau : trimestre non validé ── */}
          {selectedClassId && !isCheckingLock && !trimesterLock && (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-3">
              <Lock className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-amber-800">
                  Trimestre non validé — génération de bulletins bloquée
                </p>
                <p className="text-xs text-amber-700 mt-0.5">
                  Pour générer les bulletins, un enseignant doit d&apos;abord saisir toutes les notes
                  puis cliquer sur <strong>Valider le trimestre</strong> depuis la page Notes.
                </p>
                <Link
                  href={`/dashboard/grades${selectedClassId ? `?classId=${selectedClassId}&trimester=${selectedTrimester}` : ""}`}
                  className="inline-flex items-center gap-1.5 mt-2 text-xs font-medium text-amber-800 underline underline-offset-2 hover:text-amber-900"
                >
                  <ArrowLeft className="h-3 w-3" />
                  Aller saisir les notes
                </Link>
              </div>
            </div>
          )}

          {/* ── Bandeau : trimestre validé ── */}
          {selectedClassId && trimesterLock && (
            <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 flex items-center gap-3">
              <ShieldCheck className="h-5 w-5 text-emerald-600 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-emerald-800">Trimestre validé</p>
                <p className="text-xs text-emerald-700 mt-0.5">
                  Validé le {new Date(trimesterLock.lockedAt).toLocaleDateString("fr-FR")}
                  {trimesterLock.lockedByName ? ` par ${trimesterLock.lockedByName}` : ""}
                  {" "}· Vous pouvez générer les bulletins.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── État chargement ── */}
      {isGenerating && (
        <Card>
          <CardContent className="py-16 text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-blue-600 mb-3" />
            <p className="text-sm text-muted-foreground">Chargement des élèves et notes...</p>
          </CardContent>
        </Card>
      )}

      {/* ── État vide (aucune classe sélectionnée) ── */}
      {!selectedClassId && !isGenerating && (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <BookOpen className="h-12 w-12 mx-auto opacity-20 mb-3" />
            <p className="text-sm font-medium">Sélectionnez une classe</p>
            <p className="text-xs mt-1 opacity-70">Les bulletins s&apos;affichent automatiquement si le trimestre est validé</p>
          </CardContent>
        </Card>
      )}

      {/* ── Aucun élève ── */}
      {generated && bulletins.length === 0 && !isGenerating && (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <Users className="h-12 w-12 mx-auto opacity-20 mb-3" />
            <p className="text-sm">Aucun élève trouvé dans cette classe</p>
          </CardContent>
        </Card>
      )}

      {/* ── Modal : bulletin individuel ── */}
      <Dialog
        open={selectedBulletinIdx !== null}
        onOpenChange={(open) => !open && setSelectedBulletinIdx(null)}
      >
        <DialogContent className="max-w-2xl p-0 gap-0 overflow-hidden">
          {selectedBulletinIdx !== null && (() => {
            const b = bulletins[selectedBulletinIdx];
            const prevIdx = selectedBulletinIdx > 0 ? selectedBulletinIdx - 1 : null;
            const nextIdx = selectedBulletinIdx < bulletins.length - 1 ? selectedBulletinIdx + 1 : null;
            return (
              <>
                {/* Navigation */}
                <div className="flex items-center justify-between px-4 py-2.5 border-b bg-muted/30">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 text-xs"
                    disabled={prevIdx === null}
                    onClick={() => setSelectedBulletinIdx(prevIdx!)}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Précédent
                  </Button>
                  <p className="text-sm font-medium">
                    {b.studentName}
                    <span className="ml-2 text-xs text-muted-foreground">
                      {selectedBulletinIdx + 1} / {bulletins.length}
                    </span>
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 text-xs"
                    disabled={nextIdx === null}
                    onClick={() => setSelectedBulletinIdx(nextIdx!)}
                  >
                    Suivant
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
                {/* Contenu bulletin */}
                <div className="overflow-y-auto max-h-[80vh]">
                  <BulletinCard
                    data={{ ...b, schoolName: schoolName || undefined, schoolLogo: logoBase64 ?? undefined }}
                    rank={ranks[selectedBulletinIdx]}
                    classAvg={classAvg}
                    studentsWithScores={studentsWithScores}
                  />
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ── Résumé + recherche + table ── */}
      {generated && bulletins.length > 0 && (
        <div className="space-y-4">

          {/* Stats + actions globales */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-3 flex-wrap flex-1 text-sm text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <Users className="h-4 w-4" />
                <span><strong className="text-foreground">{bulletins.length}</strong> élève{bulletins.length > 1 ? "s" : ""}</span>
              </div>
              {classAvg !== null && (
                <div className="flex items-center gap-1.5">
                  <span>Moy. classe :</span>
                  <strong className={scoreColor(classAvg, maxScore)}>{classAvg.toFixed(2)}/{maxScore}</strong>
                </div>
              )}
              <div className="flex items-center gap-1.5">
                <span><strong className="text-foreground">{studentsWithScores}</strong> avec notes</span>
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button variant="outline" size="sm" className="gap-1.5" onClick={handlePrintAll}>
                <Printer className="h-3.5 w-3.5" /> Imprimer tous
              </Button>
              <Button size="sm" className="gap-1.5" onClick={handleDownloadAll}>
                <Download className="h-3.5 w-3.5" /> PDF complet
              </Button>
            </div>
          </div>

          {/* Barre de recherche */}
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              placeholder="Rechercher nom ou matricule…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs"
              >
                ✕
              </button>
            )}
          </div>

          {/* Table classement */}
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-blue-600 text-white text-xs">
                    <th className="px-3 py-3 text-center w-12">Rang</th>
                    <th className="px-4 py-3 text-left">Élève</th>
                    <th className="px-3 py-3 text-left">Matricule</th>
                    <th className="px-3 py-3 text-center">Moyenne</th>
                    <th className="px-3 py-3 text-center hidden sm:table-cell">Appréciation</th>
                    <th className="px-3 py-3 text-center hidden md:table-cell">Matières</th>
                    <th className="px-3 py-3 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBulletins.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground text-sm">
                        Aucun élève ne correspond à &laquo; {searchQuery} &raquo;
                      </td>
                    </tr>
                  ) : (
                    filteredBulletins.map(({ b, idx }, rowIdx) => {
                      const rank = ranks[idx];
                      const avg = b.weightedAvg;
                      const isEven = rowIdx % 2 === 0;
                      return (
                        <tr
                          key={idx}
                          className={`border-b transition-colors hover:bg-blue-50/40 cursor-pointer ${isEven ? "bg-white" : "bg-muted/20"}`}
                          onClick={() => setSelectedBulletinIdx(idx)}
                        >
                          {/* Rang */}
                          <td className="px-3 py-3 text-center">
                            {rank === null ? (
                              <span className="text-muted-foreground">—</span>
                            ) : rank <= 3 ? (
                              <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold border ${
                                rank === 1 ? "bg-yellow-50 text-yellow-700 border-yellow-300" :
                                rank === 2 ? "bg-slate-100 text-slate-600 border-slate-300" :
                                             "bg-orange-50 text-orange-600 border-orange-300"
                              }`}>{rank}</span>
                            ) : (
                              <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-muted/60 text-muted-foreground border text-xs font-medium">{rank}</span>
                            )}
                          </td>
                          {/* Nom */}
                          <td className="px-4 py-3 font-medium">{b.studentName}</td>
                          {/* Matricule */}
                          <td className="px-3 py-3 text-muted-foreground font-mono text-xs">{b.matricule}</td>
                          {/* Moyenne */}
                          <td className="px-3 py-3 text-center">
                            {avg !== null ? (
                              <span className={`font-semibold ${scoreColor(avg, b.maxScore)}`}>
                                {avg.toFixed(2)}<span className="text-muted-foreground font-normal text-xs">/{b.maxScore}</span>
                              </span>
                            ) : (
                              <span className="text-muted-foreground text-xs italic">—</span>
                            )}
                          </td>
                          {/* Appréciation */}
                          <td className="px-3 py-3 text-center text-muted-foreground hidden sm:table-cell text-xs">
                            {avg !== null ? appreciation(avg, b.maxScore) : "—"}
                          </td>
                          {/* Nb matières */}
                          <td className="px-3 py-3 text-center text-muted-foreground hidden md:table-cell text-xs">
                            {b.grades.length}
                          </td>
                          {/* Actions */}
                          <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-center gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0 text-blue-600 hover:bg-blue-50"
                                title="Aperçu bulletin"
                                onClick={() => setSelectedBulletinIdx(idx)}
                              >
                                <Eye className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0 text-muted-foreground hover:bg-muted"
                                title="Imprimer"
                                onClick={() => {
                                  // Ouvrir le modal et déclencher l'impression
                                  setSelectedBulletinIdx(idx);
                                }}
                              >
                                <Printer className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0 text-muted-foreground hover:bg-muted"
                                title="Télécharger PDF"
                                onClick={() => {
                                  generateBulletinPDF({
                                    ...b,
                                    schoolName: schoolName || undefined,
                                    schoolLogo: logoBase64 ?? undefined,
                                    classAvg,
                                    classRank: ranks[idx],
                                    totalStudents: studentsWithScores,
                                  });
                                  toast.success(`PDF — ${b.studentName}`);
                                }}
                              >
                                <Download className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            {/* Footer table */}
            {filteredBulletins.length > 0 && (
              <div className="px-4 py-2.5 border-t bg-muted/20 text-xs text-muted-foreground text-right">
                {searchQuery
                  ? `${filteredBulletins.length} élève${filteredBulletins.length > 1 ? "s" : ""} trouvé${filteredBulletins.length > 1 ? "s" : ""} sur ${bulletins.length}`
                  : `${bulletins.length} élève${bulletins.length > 1 ? "s" : ""} · Classés par ordre de mérite`
                }
              </div>
            )}
          </Card>
        </div>
      )}

    </div>
  );
}

// ─── Export ──────────────────────────────────────────────────────────────────

export default function BulletinsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <BulletinsContent />
    </Suspense>
  );
}
