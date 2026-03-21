"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Plus,
  Search,
  MoreVertical,
  Edit2,
  Trash2,
  Eye,
  Filter,
  Download,
  Upload,
  Phone,
  FileText,
  WifiOff,
  Loader2,
  ChevronUp,
  ChevronDown,
  ChevronsLeft,
  ChevronLeft,
  ChevronRight,
  ChevronsRight,
  Archive,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { generateSchoolCertificate } from "@/lib/pdf-generator";
import { toast } from "sonner";
import { ImportExportDialog } from "@/components/shared/ImportExportDialog";
import { exportToCSV, downloadTemplate, validateStudentRow } from "@/lib/csv-handler";
import { offlineDB, STORES } from "@/lib/offline-db";
import { syncQueue } from "@/lib/sync-queue";
import { useOnline } from "@/hooks/use-online";
import { useAuth } from "@/contexts/AuthContext";
import * as storage from "@/lib/storage";
import { getStudentsPaginated, getStudentsStats, deleteStudent, createStudent } from "@/lib/api/students.service";
import { getClasses } from "@/lib/api/classes.service";
import { YearSelector } from "@/components/shared/YearSelector";
import type { AcademicYear } from "@/lib/api/academic-years.service";
import { formatClassName } from "@/lib/class-helpers";
import type { Student } from "@/types";

export default function StudentsPage() {
  const isOnline = useOnline();
  const { user, refreshUserProfile, hasPermission } = useAuth();
  const canCreate = hasPermission("students", "create");
  const canEdit   = hasPermission("students", "edit");
  const canDelete = hasPermission("students", "delete");
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [classFilter, setClassFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [isTemplateDialogOpen, setIsTemplateDialogOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [templateClassId, setTemplateClassId] = useState<string>("all");

  // Sélecteur d'année archivée
  const [selectedAcademicYear, setSelectedAcademicYear] = useState<string>("");
  const [selectedAcademicYearObj, setSelectedAcademicYearObj] = useState<AcademicYear | null>(null);

  // Pagination server-side
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [serverTotal, setServerTotal] = useState(0);

  // Tri (client-side sur la page courante)
  const [sortField, setSortField] = useState<"name" | "matricule" | "class" | "paymentStatus">("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  // Stats globales (depuis l'endpoint /students/stats)
  const [stats, setStats] = useState({ total: 0, paid: 0, pending: 0, late: 0 });

  // Sélection multiple
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);

  // ── Saisie rapide (grille multi-élèves) ────────────────────────────────────
  type QuickRow = { id: string; firstName: string; lastName: string; classId: string; parentName: string; parentPhone: string; };
  const newEmptyRow = (): QuickRow => ({ id: crypto.randomUUID(), firstName: '', lastName: '', classId: '', parentName: '', parentPhone: '' });
  const [quickOpen, setQuickOpen]   = useState(false);
  const [quickRows, setQuickRows]   = useState<QuickRow[]>(() => Array(5).fill(null).map(newEmptyRow));
  const [quickSaving, setQuickSaving] = useState(false);
  const [quickProgress, setQuickProgress] = useState<{done: number; total: number} | null>(null);

  const updateQuickRow = (id: string, field: keyof QuickRow, value: string) =>
    setQuickRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));

  const handleQuickSave = async () => {
    const token = storage.getAuthItem('structura_token');
    if (!token) return;
    // Valides = prénom + nom remplis
    const filled = quickRows.filter(r => r.firstName.trim() && r.lastName.trim());
    if (filled.length === 0) { toast.error('Saisissez au moins un prénom et un nom'); return; }
    // Lignes sans classe sélectionnée
    const missingClass = filled.filter(r => !r.classId);
    if (missingClass.length > 0) {
      toast.error(
        `${missingClass.length} élève(s) sans classe`,
        { description: `Veuillez sélectionner une classe pour : ${missingClass.map(r => `${r.firstName} ${r.lastName}`).join(', ')}` }
      );
      return;
    }
    const valid = filled;
    setQuickSaving(true);
    setQuickProgress({ done: 0, total: valid.length });
    let success = 0, errors = 0;
    for (const row of valid) {
      try {
        await createStudent(token, {
          firstName:   row.firstName.trim(),
          lastName:    row.lastName.trim(),
          classId:     row.classId,
          parentName:  row.parentName.trim()  || undefined,
          parentPhone: row.parentPhone.trim() || undefined,
        });
        success++;
      } catch { errors++; }
      setQuickProgress(p => p ? { ...p, done: p.done + 1 } : null);
    }
    setQuickSaving(false);
    setQuickProgress(null);
    if (success > 0) {
      toast.success(`${success} élève(s) enregistré(s) avec succès`);
      setQuickRows(Array(5).fill(null).map(newEmptyRow));
      loadStudents();
    }
    if (errors > 0) toast.error(`${errors} élève(s) n'ont pas pu être enregistré(s)`);
  };

  /** Transforme un élève backend → format frontend */
  const mapStudent = (s: any): Student => ({
    id: s.id,
    name: `${s.firstName || ''} ${s.lastName || ''}`.trim(),
    matricule: s.matricule,
    class: s.class ? formatClassName(s.class.name, s.class.section) : (s.classId || ''),
    classId: s.classId || s.class?.id || '',
    status: s.status?.toLowerCase() || 'active',
    parentName: s.parentName || '',
    parentPhone: s.parentPhone || '',
    paymentStatus: s.paymentStatus?.toLowerCase() || 'pending',
    needsSync: false,
  });

  /**
   * Charger les classes depuis l'API backend.
   * Pour les profs : filtrer aux seules classes assignées via classAssignments.
   */
  const loadClasses = useCallback(async () => {
    try {
      const token = storage.getAuthItem('structura_token');
      if (!token) return;

      const classesData = await getClasses(token);

      // Restriction TEACHER : n'afficher que les classes assignées dans le dropdown
      if (user?.role === 'teacher') {
        const assignments = user.classAssignments ?? [];
        const assignedIds = new Set(assignments.map((a: any) => a.classId));
        setClasses(classesData.filter((c: any) => assignedIds.has(c.id)));
      } else {
        setClasses(classesData);
      }
    } catch (error) {
      console.error('Erreur chargement classes:', error);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.role, JSON.stringify(user?.classAssignments)]);

  /**
   * Charger une page d'élèves depuis le backend (pagination server-side).
   * search + classId filtrés côté serveur — paymentFilter filtré côté client sur la page.
   */
  const loadStudents = useCallback(async () => {
    setIsLoading(true);
    const token = storage.getAuthItem('structura_token');

    try {
      if (isOnline && token) {
        const result = await getStudentsPaginated(token, {
          search:       debouncedSearch || undefined,
          classId:      classFilter !== 'all' ? classFilter : undefined,
          academicYear: selectedAcademicYear || undefined,
          limit:        itemsPerPage,
          skip:         (currentPage - 1) * itemsPerPage,
        });

        const mapped = result.data.map(mapStudent);
        setStudents(mapped);
        setServerTotal(result.total);

        // Alimenter le cache offline en arrière-plan (non bloquant)
        offlineDB.bulkAdd(STORES.STUDENTS, mapped).catch(() => {});
      } else {
        // Mode offline : paginer le cache local côté client
        const raw = await offlineDB.getAll<any>(STORES.STUDENTS);
        // Normaliser : le préchargeur stocke du brut (firstName/lastName), la page attend Student (name)
        const cached = raw.map((s) => s.name !== undefined ? s as Student : mapStudent(s));
        const start = (currentPage - 1) * itemsPerPage;
        setStudents(cached.slice(start, start + itemsPerPage));
        setServerTotal(cached.length);
        if (cached.length > 0) toast.info('Vous êtes hors ligne — affichage des dernières données');
        else toast.info('Aucune donnée disponible. Reconnectez-vous pour charger les élèves.');
      }
    } catch (error: any) {
      const raw = await offlineDB.getAll<any>(STORES.STUDENTS).catch(() => []);
      const cached = raw.map((s: any) => s.name !== undefined ? s as Student : mapStudent(s));
      if (cached.length > 0) {
        const start = (currentPage - 1) * itemsPerPage;
        setStudents(cached.slice(start, start + itemsPerPage));
        setServerTotal(cached.length);
        if (!navigator.onLine) toast.info('Vous êtes hors ligne — affichage des dernières données');
        else toast.warning('Connexion indisponible — affichage des dernières données');
      } else {
        setStudents([]);
        toast.error('Impossible de charger les élèves. Vérifiez votre connexion.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [isOnline, debouncedSearch, classFilter, selectedAcademicYear, currentPage, itemsPerPage]);

  /** Charger les statistiques globales (cartes du haut) */
  const loadStats = useCallback(async () => {
    const token = storage.getAuthItem('structura_token');
    if (!isOnline || !token) return;
    try {
      const data = await getStudentsStats(token);
      setStats({
        total:   (data as any).total   ?? 0,
        paid:    (data as any).paid    ?? 0,
        pending: (data as any).pending ?? 0,
        late:    (data as any).late    ?? 0,
      });
    } catch { /* silencieux */ }
  }, [isOnline]);

  // Refresh du profil au montage
  useEffect(() => {
    refreshUserProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounce search : 400ms après la dernière frappe
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery), 400);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // Reset page 1 quand la recherche, le filtre classe ou l'année changent
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, classFilter, selectedAcademicYear]);

  // Charger élèves à chaque changement de page ou de filtres
  useEffect(() => {
    loadStudents();
  }, [loadStudents]);

  // Charger classes + stats une fois au montage (et si réseau revient)
  useEffect(() => {
    loadClasses();
    loadStats();
  }, [loadClasses, loadStats]);

  // Filtrage paymentStatus côté client (sur la page courante uniquement)
  const filteredStudents = students.filter((student) =>
    paymentFilter === "all" || student.paymentStatus === paymentFilter,
  );

  // Tri client-side sur la page courante
  const sortedStudents = [...filteredStudents].sort((a, b) => {
    let aValue: string = "";
    let bValue: string = "";

    switch (sortField) {
      case "name":
        aValue = (a.name || '').toLowerCase();
        bValue = (b.name || '').toLowerCase();
        break;
      case "matricule":
        aValue = (a.matricule || '').toLowerCase();
        bValue = (b.matricule || '').toLowerCase();
        break;
      case "class":
        aValue = (a.class || "").toLowerCase();
        bValue = (b.class || "").toLowerCase();
        break;
      case "paymentStatus":
        aValue = a.paymentStatus || "";
        bValue = b.paymentStatus || "";
        break;
    }

    if (sortOrder === "asc") {
      return aValue.localeCompare(bValue);
    } else {
      return bValue.localeCompare(aValue);
    }
  });

  // Pagination : total vient du serveur, tri/paymentFilter appliqués sur la page courante
  const totalPages = Math.ceil(serverTotal / itemsPerPage);
  const paginatedStudents = sortedStudents;

  // Droits paiement : directeur, comptable, secrétaire uniquement
  const canViewPayments = user?.role === 'director' || user?.role === 'accountant' || user?.role === 'secretary';

  // Stats globales depuis le serveur (toute l'école, pas juste la page)
  const totalStudents  = stats.total;
  const paidStudents   = stats.paid;
  const pendingStudents = stats.pending;
  const lateStudents   = stats.late;

  // Fonction de tri
  const handleSort = (field: "name" | "matricule" | "class" | "paymentStatus") => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  };

  // Sélection multiple
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedStudents(paginatedStudents.map(s => s.id));
    } else {
      setSelectedStudents([]);
    }
  };

  const handleSelectStudent = (studentId: string, checked: boolean) => {
    if (checked) {
      setSelectedStudents([...selectedStudents, studentId]);
    } else {
      setSelectedStudents(selectedStudents.filter(id => id !== studentId));
    }
  };

  const handleDeleteSelected = async () => {
    const token = storage.getAuthItem('structura_token');

    try {
      let successCount = 0;
      let errorCount = 0;

      for (const studentId of selectedStudents) {
        try {
          if (isOnline && token) {
            await deleteStudent(token, studentId);
            await offlineDB.delete(STORES.STUDENTS, studentId);
          } else {
            await offlineDB.delete(STORES.STUDENTS, studentId);
            await syncQueue.add({
              type: "student",
              action: "delete",
              data: { id: studentId },
            });
          }
          successCount++;
        } catch (error) {
          console.error(`Erreur suppression ${studentId}:`, error);
          errorCount++;
        }
      }

      setSelectedStudents([]);
      if (errorCount === 0) {
        toast.success(`${successCount} élève(s) supprimé(s) avec succès`);
      } else {
        toast.warning(`${successCount} supprimé(s), ${errorCount} erreur(s)`);
      }
      // Recharger la page courante + stats
      await Promise.all([loadStudents(), loadStats()]);
    } catch (error: any) {
      toast.error(`Erreur lors de la suppression: ${error.message}`);
    }
  };

  // Handlers
  const handleDelete = (student: Student) => {
    setSelectedStudent(student);
    setIsDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!selectedStudent) return;

    const token = storage.getAuthItem('structura_token');

    try {
      if (isOnline && token) {
        await deleteStudent(token, selectedStudent.id);

        try {
          await offlineDB.delete(STORES.STUDENTS, selectedStudent.id);
        } catch {
          // Erreur cache non bloquante
        }

        setIsDeleteDialogOpen(false);
        toast.success("Élève supprimé avec succès");
        await Promise.all([loadStudents(), loadStats()]);
      } else {
        await offlineDB.delete(STORES.STUDENTS, selectedStudent.id);
        setStudents(students.filter((s) => s.id !== selectedStudent.id));

        // Ajouter à la queue de synchronisation
        await syncQueue.add({
          type: "student",
          action: "delete",
          data: { id: selectedStudent.id },
        });

        setIsDeleteDialogOpen(false);
        toast.info("Élève supprimé — sera envoyé au serveur dès la reconnexion.");
      }
    } catch (error: any) {
      toast.error(error.message || 'Erreur lors de la suppression');
    }
  };

  const handleGenerateCertificate = async (student: Student) => {
    try {
      // Charger les données complètes de l'élève pour avoir la date de naissance
      const token = storage.getAuthItem('structura_token');
      if (!token) {
        toast.error('Votre session a expiré — veuillez vous reconnecter.');
        return;
      }

      // Import du service pour récupérer les détails
      const { getStudentById } = await import('@/lib/api/students.service');
      const studentData = await getStudentById(token, student.id);

      const certificateNumber = `CERT-${new Date().getFullYear()}-${String(
        Math.floor(Math.random() * 10000)
      ).padStart(4, "0")}`;

      // Utiliser les vraies données de l'utilisateur et de l'école
      generateSchoolCertificate({
        studentName: student.name,
        dateOfBirth: studentData.dateOfBirth
          ? new Date(studentData.dateOfBirth).toLocaleDateString('fr-FR')
          : "Non renseignée",
        className: student.class,
        schoolName: user?.tenantId || "École", // Nom de l'école depuis le tenant
        schoolAddress: studentData.address || "Adresse non renseignée",
        directorName: user ? `${user.firstName} ${user.lastName}` : "Le Directeur",
        certificateNumber,
      });

      toast.success("Certificat généré et téléchargé!");
    } catch {
      toast.error('Erreur lors de la génération du certificat');
    }
  };

  const handleExport = async () => {
    const token = storage.getAuthItem('structura_token');
    let exportStudents = sortedStudents;

    // Si connecté, charger tous les élèves filtrés (pas juste la page courante)
    if (isOnline && token) {
      try {
        const result = await getStudentsPaginated(token, {
          search:  debouncedSearch || undefined,
          classId: classFilter !== 'all' ? classFilter : undefined,
          limit:   5000,
          skip:    0,
        });
        exportStudents = result.data.map(mapStudent);
      } catch {
        // fallback sur la page courante
      }
    }

    if (exportStudents.length === 0) {
      toast.error("Aucun élève à exporter. Ajustez vos filtres.");
      return;
    }

    const exportData = exportStudents.map((student) => {
      // Séparer prénom et nom correctement (le nom est le dernier mot, prénom le reste)
      const nameParts = student.name.trim().split(" ");
      const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : nameParts[0];
      const firstName = nameParts.length > 1 ? nameParts.slice(0, -1).join(" ") : "";
      return {
        Matricule: student.matricule,
        Prénom: firstName,
        Nom: lastName,
        Classe: student.class,
        "Nom du parent": student.parentName || "",
        "Téléphone parent": student.parentPhone || "",
        "Profession parent": (student as any).parentProfession || "",
      };
    });

    // Ajouter le filtre de classe dans le nom du fichier si actif
    const activeClass = classFilter !== "all" ? classes.find(c => c.id === classFilter) : null;
    const classeSuffix = activeClass
      ? `_${(activeClass.section ? `${activeClass.name}_${activeClass.section}` : activeClass.name).replace(/\s+/g, '_')}`
      : "";

    exportToCSV({
      filename: `eleves${classeSuffix}_${new Date().toISOString().split("T")[0]}`,
      headers: ["Matricule", "Prénom", "Nom", "Classe", "Nom du parent", "Téléphone parent", "Profession parent"],
      data: exportData,
    });

    const classeInfo = activeClass
      ? ` de la classe ${formatClassName(activeClass.name, activeClass.section)}`
      : "";

    toast.success(`${exportStudents.length} élève(s)${classeInfo} exporté(s) avec succès!`);
  };

  const handleDownloadEmptyTemplate = () => {
    // Ouvrir le dialog pour choisir la classe
    setTemplateClassId(classFilter !== "all" ? classFilter : "all");
    setIsTemplateDialogOpen(true);
  };

  const confirmDownloadTemplate = async () => {
    const HEADERS = ["prenom", "nom", "classe", "dateNaissance", "genre", "nomParent", "telephoneParent", "email", "professionParent"];

    // Nom affiché d'une classe — identique à la page classes et au fichier exporté
    const getClassDisplayName = (c: any): string =>
      formatClassName(c.name, c.section);

    if (templateClassId !== "all") {
      // --- Template pour UNE classe spécifique ---
      const selectedClass = classes.find(c => c.id === templateClassId);
      if (!selectedClass) return;

      const classeValue = getClassDisplayName(selectedClass);

      // 1 ligne exemple pré-remplie + lignes vides pour saisie
      const templateRows = [
        {
          prenom: "Exemple-Prénom",
          nom: "Exemple-Nom",
          classe: classeValue,
          dateNaissance: "2010-05-15",
          genre: "M",
          nomParent: "Exemple-Parent",
          telephoneParent: "+224 620 000 000",
          email: "",
          professionParent: "",
        },
        ...Array(9).fill({ prenom: "", nom: "", classe: classeValue, dateNaissance: "", genre: "", nomParent: "", telephoneParent: "", email: "", professionParent: "" }),
      ];

      await downloadTemplate(
        `import_${classeValue.replace(/\s+/g, '_')}`,
        HEADERS,
        templateRows,
      );
    } else {
      // --- Template toutes classes : une ligne exemple par classe ---
      if (classes.length === 0) {
        toast.error("Aucune classe disponible", { description: "Créez d'abord des classes avant de télécharger un template." });
        return;
      }

      const templateRows = classes.map((c: any) => ({
        prenom: "",
        nom: "",
        classe: getClassDisplayName(c),
        dateNaissance: "",
        genre: "",
        nomParent: "",
        telephoneParent: "",
        email: "",
        professionParent: "",
      }));

      await downloadTemplate(
        "import_toutes_classes",
        HEADERS,
        templateRows,
      );
    }

    setIsTemplateDialogOpen(false);
  };

  const handleImport = async (data: any[]) => {
    const token = storage.getAuthItem('structura_token');

    try {
      if (isOnline && token) {

        // Normalisation robuste : supprime accents, espaces non-standard, met en minuscule
        const norm = (s: string) =>
          s.normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/\u00A0/g, " ")
            .replace(/\s+/g, " ")
            .toLowerCase()
            .trim();

        // Phase 1 : résoudre les classIds localement (rapide, pas d'API)
        type ResolvedRow = { row: any; classId: string } | { error: string };
        const resolved: ResolvedRow[] = data.map((row) => {
          let classId = '';
          if (row.classe) {
            const classeRaw   = norm(row.classe);
            const classeShort = classeRaw.replace(/\s*\(.*\)\s*$/, "").trim();
            const foundClass = classes.find((c: any) => {
              const keyShort        = norm(c.section ? `${c.name} ${c.section}` : c.name);
              const keyDisplay      = norm(formatClassName(c.name, c.section));
              const keyShortDisplay = keyDisplay.replace(/\s*\(.*\)\s*$/, "").trim();
              return (
                keyShort        === classeShort   ||
                keyShort        === classeRaw     ||
                keyDisplay      === classeRaw     ||
                keyDisplay      === classeShort   ||
                keyShortDisplay === classeShort   ||
                keyShortDisplay === classeRaw
              );
            });
            if (!foundClass) {
              const validNames = classes.map((c) => formatClassName(c.name, c.section)).join(' | ');
              toast.warning(`Classe introuvable : "${row.classe}"`, { description: `Noms valides → ${validNames}` });
              return { error: `Classe introuvable: ${row.classe}` };
            }
            classId = foundClass.id;
          }
          return { row, classId };
        });

        const validRows = resolved.filter((r): r is { row: any; classId: string } => !('error' in r));
        const resolveErrors = resolved.length - validRows.length;

        // Phase 2 : créer tous les élèves en parallèle (bien plus rapide qu'une boucle séquentielle)
        const results = await Promise.allSettled(
          validRows.map(({ row, classId }) =>
            createStudent(token, {
              firstName: row.prenom || '',
              lastName: row.nom || '',
              classId,
              dateOfBirth: row.dateNaissance,
              gender: row.genre,
              parentName: row.nomParent || '',
              parentPhone: row.telephoneParent || '',
              parentEmail: row.email || '',
              parentProfession: row.professionParent || '',
            })
          )
        );

        const successCount = results.filter((r) => r.status === 'fulfilled').length;
        const errorCount   = results.filter((r) => r.status === 'rejected').length + resolveErrors;

        if (successCount > 0) {
          setClassFilter("all");
          setPaymentFilter("all");
          setSearchQuery("");
          await loadStudents();
        }

        if (errorCount === 0) {
          toast.success(`${successCount} élève(s) importé(s) avec succès`);
        } else {
          toast.warning(`${successCount} importé(s), ${errorCount} erreur(s)`);
        }

      } else {

        const newStudents: Student[] = data.map((row, index) => {
          // Trouver le classId à partir du nom de classe (même logique que mode online)
          const classeValue = (row.classe || '').trim().toLowerCase();
          const foundClass = classes.find(c => {
            if (c.name.toLowerCase() === classeValue) return true;
            if (c.section && `${c.name} ${c.section}`.toLowerCase() === classeValue) return true;
            return false;
          });

          return {
            id: `imported-${Date.now()}-${index}`,
            name: `${row.prenom} ${row.nom}`,
            matricule: row.matricule || `STR${new Date().getFullYear()}${String(students.length + index + 1).padStart(3, "0")}`,
            class: row.classe,
            classId: foundClass?.id || '', // 🔧 AJOUT classId pour le filtre
            status: "active" as const,
            parentName: row.nomParent || "",
            parentPhone: row.telephoneParent || "",
            paymentStatus: "pending" as const,
            needsSync: true, // Marquer pour synchronisation
          };
        });

        // Sauvegarder localement
        await offlineDB.bulkAdd(STORES.STUDENTS, newStudents);
        setStudents([...students, ...newStudents]);

        // Ajouter à la queue de synchronisation
        for (const student of newStudents) {
          await syncQueue.add({
            type: "student",
            action: "create",
            data: student,
          });
        }

        toast.info(`${newStudents.length} élève(s) importé(s) localement. Seront synchronisés lors de la prochaine connexion.`);
      }
    } catch (error: any) {
      toast.error(error.message || "Erreur lors de l'import");
    }
  };

  const getPaymentBadge = (status: string) => {
    switch (status) {
      case "paid":
        return (
          <Badge className="bg-emerald-500/10 text-emerald-700 border-0">
            À jour
          </Badge>
        );
      case "pending":
        return (
          <Badge className="bg-amber-500/10 text-amber-700 border-0">
            En attente
          </Badge>
        );
      case "late":
        return (
          <Badge className="bg-red-500/10 text-red-700 border-0">
            En retard
          </Badge>
        );
      default:
        return null;
    }
  };

  const getInitials = (name: string) => {
    const parts = name.split(" ");
    return `${parts[0]?.charAt(0)}${parts[1]?.charAt(0)}`.toUpperCase();
  };

  // Compter les élèves non synchronisés
  const unsyncedCount = students.filter(s => s.needsSync).length;

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:gap-4 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight truncate">Gestion des Élèves</h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">
            Gérez les élèves de votre école
          </p>
          {!isOnline && (
            <Badge variant="outline" className="mt-2 bg-amber-50 text-amber-700 border-amber-200 text-xs">
              <WifiOff className="h-3 w-3 mr-1" />
              Mode hors ligne
              {unsyncedCount > 0 && ` • ${unsyncedCount} non sync`}
            </Badge>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" className="gap-2 flex-1 sm:flex-none" onClick={handleDownloadEmptyTemplate}>
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">Template</span>
          </Button>
          <Button variant="outline" size="sm" className="gap-2 flex-1 sm:flex-none" onClick={() => setIsImportDialogOpen(true)}>
            <Upload className="h-4 w-4" />
            <span className="hidden sm:inline">Import</span>
          </Button>
          <Button variant="outline" size="sm" className="gap-2 flex-1 sm:flex-none" onClick={handleExport} disabled={sortedStudents.length === 0}>
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Export</span>
          </Button>
          {canCreate && (
            <Button asChild size="sm" className="gap-2 w-full sm:w-auto">
              <Link href="/dashboard/students/add">
                <Plus className="h-4 w-4" />
                Ajouter
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* ── Saisie rapide ─────────────────────────────────────────────────── */}
      {canCreate && (
        <Card className="border-indigo-200">
          <CardHeader className="pb-3 cursor-pointer select-none" onClick={() => setQuickOpen(o => !o)}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-lg bg-indigo-100 flex items-center justify-center">
                  <Plus className="h-4 w-4 text-indigo-600" />
                </div>
                <div>
                  <CardTitle className="text-sm font-semibold text-indigo-700">Saisie rapide — plusieurs élèves à la fois</CardTitle>
                  <CardDescription className="text-xs mt-0.5">Remplissez le tableau ligne par ligne puis enregistrez tout d'un coup</CardDescription>
                </div>
              </div>
              <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${quickOpen ? 'rotate-180' : ''}`} />
            </div>
          </CardHeader>

          {quickOpen && (
            <CardContent className="pt-0 space-y-3">
              {/* Grille */}
              <div className="rounded-lg border overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="text-center px-2 py-2 font-medium text-gray-500 w-8">#</th>
                        <th className="text-left px-3 py-2 font-medium text-gray-700 min-w-[130px]">Prénom <span className="text-red-400">*</span></th>
                        <th className="text-left px-3 py-2 font-medium text-gray-700 min-w-[130px]">Nom <span className="text-red-400">*</span></th>
                        <th className="text-left px-3 py-2 font-medium text-gray-700 min-w-[150px]">Classe</th>
                        <th className="text-left px-3 py-2 font-medium text-gray-700 min-w-[130px]">Nom parent</th>
                        <th className="text-left px-3 py-2 font-medium text-gray-700 min-w-[130px]">Tél. parent</th>
                        <th className="w-8"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {quickRows.map((row, idx) => (
                        <tr key={row.id} className={`border-b last:border-0 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                          <td className="text-center px-2 py-1.5 text-gray-400 text-xs">{idx + 1}</td>
                          <td className="px-1.5 py-1.5">
                            <Input value={row.firstName} onChange={e => updateQuickRow(row.id, 'firstName', e.target.value)}
                              placeholder="Prénom" className="h-8 text-sm border-0 bg-transparent focus:bg-white focus:border focus:border-indigo-300 px-2" />
                          </td>
                          <td className="px-1.5 py-1.5">
                            <Input value={row.lastName} onChange={e => updateQuickRow(row.id, 'lastName', e.target.value)}
                              placeholder="Nom" className="h-8 text-sm border-0 bg-transparent focus:bg-white focus:border focus:border-indigo-300 px-2" />
                          </td>
                          <td className="px-1.5 py-1.5">
                            <select value={row.classId} onChange={e => updateQuickRow(row.id, 'classId', e.target.value)}
                              className="w-full h-8 text-sm rounded-md border-0 bg-transparent focus:bg-white focus:border focus:border-indigo-300 px-2 outline-none">
                              <option value="">— aucune —</option>
                              {classes.map(c => (
                                <option key={c.id} value={c.id}>{formatClassName(c.name, c.section)}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-1.5 py-1.5">
                            <Input value={row.parentName} onChange={e => updateQuickRow(row.id, 'parentName', e.target.value)}
                              placeholder="Nom parent" className="h-8 text-sm border-0 bg-transparent focus:bg-white focus:border focus:border-indigo-300 px-2" />
                          </td>
                          <td className="px-1.5 py-1.5">
                            <Input value={row.parentPhone} onChange={e => updateQuickRow(row.id, 'parentPhone', e.target.value)}
                              placeholder="Téléphone" className="h-8 text-sm border-0 bg-transparent focus:bg-white focus:border focus:border-indigo-300 px-2" />
                          </td>
                          <td className="px-1 py-1.5 text-center">
                            <button onClick={() => setQuickRows(prev => prev.filter(r => r.id !== row.id))}
                              className="text-gray-300 hover:text-red-400 transition-colors p-1 rounded">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between flex-wrap gap-2">
                <button onClick={() => setQuickRows(prev => [...prev, newEmptyRow()])}
                  className="flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-700 font-medium">
                  <Plus className="h-4 w-4" /> Ajouter une ligne
                </button>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">
                    {quickRows.filter(r => r.firstName.trim() && r.lastName.trim()).length} élève(s) prêt(s) à enregistrer
                  </span>
                  <Button onClick={handleQuickSave} disabled={quickSaving || quickRows.filter(r => r.firstName.trim() && r.lastName.trim()).length === 0}
                    size="sm" className="bg-indigo-600 hover:bg-indigo-700">
                    {quickSaving
                      ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />{quickProgress ? `${quickProgress.done}/${quickProgress.total}…` : 'Enregistrement…'}</>
                      : <><Plus className="h-4 w-4 mr-1.5" />Enregistrer tout</>}
                  </Button>
                </div>
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {/* Stats */}
      <div className={`grid gap-4 ${canViewPayments ? 'md:grid-cols-4' : 'md:grid-cols-1 max-w-xs'}`}>
        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Élèves
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalStudents}</div>
          </CardContent>
        </Card>
        {canViewPayments && (
          <>
            <Card className="border-l-4 border-l-emerald-500">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Paiements à Jour
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{paidStudents}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {totalStudents > 0 ? ((paidStudents / totalStudents) * 100).toFixed(0) : 0}% du total
                </p>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-amber-500">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  En Attente
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{pendingStudents}</div>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-red-500">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  En Retard
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{lateStudents}</div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Filters & Table */}
      <Card>
        <CardHeader>
          <CardTitle>Liste des Élèves</CardTitle>
          <CardDescription>
            {sortedStudents.length} élève{sortedStudents.length > 1 ? "s" : ""}{" "}
            {classFilter !== "all" && (
              <span className="font-medium text-primary">
                • Classe: {classes.find(c => c.id === classFilter)?.name || classFilter}
              </span>
            )}
            {paymentFilter !== "all" && (
              <span className="font-medium text-primary">
                {" "}• Paiement: {paymentFilter === "paid" ? "À jour" : paymentFilter === "pending" ? "En attente" : "En retard"}
              </span>
            )}
            {searchQuery && (
              <span className="font-medium text-primary">
                {" "}• Recherche: "{searchQuery}"
              </span>
            )}
          </CardDescription>
          {selectedAcademicYearObj?.isArchived && (
            <div className="mt-2">
              <Badge variant="outline" className="bg-gray-50 text-gray-500 border-gray-300 text-xs gap-1">
                <Archive className="h-3 w-3" />
                Consultation archive — {selectedAcademicYear}
              </Badge>
            </div>
          )}
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4 mb-6">
            {/* Barre d'actions pour sélection multiple */}
            {selectedStudents.length > 0 && (
              <div className="flex items-center justify-between p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm font-medium text-blue-900">
                  {selectedStudents.length} élève(s) sélectionné(s)
                </p>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleDeleteSelected}
                  disabled={isLoading}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Supprimer la sélection
                </Button>
              </div>
            )}

            {/* Filtres */}
            <div className="flex flex-col gap-4 md:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Rechercher par nom ou matricule..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={classFilter} onValueChange={setClassFilter}>
                <SelectTrigger className="w-full md:w-52">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Classe" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes les classes</SelectItem>
                  {classes.map((cls) => (
                    <SelectItem key={cls.id} value={cls.id}>
                      {formatClassName(cls.name, cls.section)}
                    </SelectItem>
                  ))}
                  {classes.length === 0 && (
                    <div className="p-4 text-center text-sm text-muted-foreground">
                      Aucune classe disponible
                    </div>
                  )}
                </SelectContent>
              </Select>
              {canViewPayments && (
                <Select value={paymentFilter} onValueChange={setPaymentFilter}>
                  <SelectTrigger className="w-full md:w-52">
                    <SelectValue placeholder="Statut paiement" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous les statuts</SelectItem>
                    <SelectItem value="paid">À jour</SelectItem>
                    <SelectItem value="pending">En attente</SelectItem>
                    <SelectItem value="late">En retard</SelectItem>
                  </SelectContent>
                </Select>
              )}
              <YearSelector
                value={selectedAcademicYear}
                onChange={(yr, yearObj) => {
                  setSelectedAcademicYear(yr);
                  setSelectedAcademicYearObj(yearObj);
                }}
                className="w-36"
              />
            </div>
          </div>

          {/* Table */}
          {isLoading ? (
            <div className="py-12 text-center">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
              <p className="text-sm text-muted-foreground mt-2">
                Chargement des élèves...
              </p>
            </div>
          ) : (
            <>
              {/* Vue Desktop - Tableau */}
              <div className="hidden lg:block rounded-lg border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={paginatedStudents.length > 0 && selectedStudents.length === paginatedStudents.length}
                        onCheckedChange={handleSelectAll}
                      />
                    </TableHead>
                    <TableHead
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => handleSort("name")}
                    >
                      <div className="flex items-center gap-2">
                        Élève
                        {sortField === "name" && (
                          sortOrder === "asc" ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
                        )}
                      </div>
                    </TableHead>
                    <TableHead
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => handleSort("matricule")}
                    >
                      <div className="flex items-center gap-2">
                        Matricule
                        {sortField === "matricule" && (
                          sortOrder === "asc" ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
                        )}
                      </div>
                    </TableHead>
                    <TableHead
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => handleSort("class")}
                    >
                      <div className="flex items-center gap-2">
                        Classe
                        {sortField === "class" && (
                          sortOrder === "asc" ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
                        )}
                      </div>
                    </TableHead>
                    <TableHead>Parent</TableHead>
                    <TableHead>Contact</TableHead>
                    {canViewPayments && (
                      <TableHead
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => handleSort("paymentStatus")}
                      >
                        <div className="flex items-center gap-2">
                          Paiement
                          {sortField === "paymentStatus" && (
                            sortOrder === "asc" ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
                          )}
                        </div>
                      </TableHead>
                    )}
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedStudents.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={canViewPayments ? 8 : 7}
                        className="text-center py-8 text-muted-foreground"
                      >
                        Aucun élève trouvé
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedStudents.map((student) => (
                      <TableRow key={student.id} className="group hover:bg-muted/50">
                        <TableCell>
                          <Checkbox
                            checked={selectedStudents.includes(student.id)}
                            onCheckedChange={(checked) => handleSelectStudent(student.id, checked as boolean)}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar className="h-10 w-10">
                              <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                                {getInitials(student.name)}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <div className="font-medium flex items-center gap-2">
                                {student.name}
                                {student.needsSync && (
                                  <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
                                    Non sync
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {student.matricule}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{student.class}</Badge>
                        </TableCell>
                        <TableCell>{student.parentName || "-"}</TableCell>
                        <TableCell>
                          {student.parentPhone ? (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Phone className="h-3 w-3" />
                              {student.parentPhone}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        {canViewPayments && (
                          <TableCell>{getPaymentBadge(student.paymentStatus || "pending")}</TableCell>
                        )}
                        <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <Link
                                href={`/dashboard/students/${student.id}`}
                                className="flex items-center cursor-pointer"
                              >
                                <Eye className="h-4 w-4 mr-2" />
                                Voir le profil
                              </Link>
                            </DropdownMenuItem>
                            {canEdit && (
                              <DropdownMenuItem asChild>
                                <Link
                                  href={`/dashboard/students/${student.id}/edit`}
                                  className="flex items-center cursor-pointer"
                                >
                                  <Edit2 className="h-4 w-4 mr-2" />
                                  Modifier
                                </Link>
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={() => handleGenerateCertificate(student)}>
                              <FileText className="h-4 w-4 mr-2" />
                              Certificat de scolarité
                            </DropdownMenuItem>
                            {canDelete && (
                              <DropdownMenuItem
                                onClick={() => handleDelete(student)}
                                className="text-destructive cursor-pointer"
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Supprimer
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

              {/* Vue Mobile - Cartes */}
              <div className="lg:hidden space-y-4">
                {paginatedStudents.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    Aucun élève trouvé
                  </div>
                ) : (
                  paginatedStudents.map((student) => (
                    <Card key={student.id} className="overflow-hidden">
                      <CardContent className="p-4">
                        <div className="space-y-3">
                          {/* En-tête avec checkbox et avatar */}
                          <div className="flex items-start gap-3">
                            <Checkbox
                              checked={selectedStudents.includes(student.id)}
                              onCheckedChange={(checked) => handleSelectStudent(student.id, checked as boolean)}
                              className="mt-1"
                            />
                            <Avatar className="h-12 w-12 shrink-0">
                              <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                                {getInitials(student.name)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <h3 className="font-semibold text-base truncate">{student.name}</h3>
                              <p className="text-sm text-muted-foreground font-mono">{student.matricule}</p>
                              <div className="flex items-center gap-2 mt-1 flex-wrap">
                                <Badge variant="outline" className="text-xs">{student.class}</Badge>
                                {student.needsSync && (
                                  <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
                                    Non sync
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="shrink-0">
                                  <MoreVertical className="h-5 w-5" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-48">
                                <DropdownMenuItem asChild>
                                  <Link
                                    href={`/dashboard/students/${student.id}`}
                                    className="flex items-center cursor-pointer"
                                  >
                                    <Eye className="h-4 w-4 mr-2" />
                                    Voir le profil
                                  </Link>
                                </DropdownMenuItem>
                                {canEdit && (
                                  <DropdownMenuItem asChild>
                                    <Link
                                      href={`/dashboard/students/${student.id}/edit`}
                                      className="flex items-center cursor-pointer"
                                    >
                                      <Edit2 className="h-4 w-4 mr-2" />
                                      Modifier
                                    </Link>
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem onClick={() => handleGenerateCertificate(student)}>
                                  <FileText className="h-4 w-4 mr-2" />
                                  Certificat
                                </DropdownMenuItem>
                                {canDelete && (
                                  <DropdownMenuItem
                                    onClick={() => handleDelete(student)}
                                    className="text-destructive cursor-pointer"
                                  >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Supprimer
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>

                          {/* Informations */}
                          <div className="grid grid-cols-2 gap-3 text-sm border-t pt-3">
                            <div>
                              <p className="text-muted-foreground text-xs">Parent</p>
                              <p className="font-medium truncate">{student.parentName || "-"}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground text-xs">Contact</p>
                              {student.parentPhone ? (
                                <div className="flex items-center gap-1 text-sm">
                                  <Phone className="h-3 w-3 shrink-0" />
                                  <span className="truncate">{student.parentPhone}</span>
                                </div>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </div>
                            {canViewPayments && (
                              <div className="col-span-2">
                                <p className="text-muted-foreground text-xs mb-1">Paiement</p>
                                {getPaymentBadge(student.paymentStatus || "pending")}
                              </div>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </>
          )}

          {/* Pagination */}
          {sortedStudents.length > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-2 py-4 border-t">
              {/* Items per page - Desktop */}
              <div className="hidden sm:flex items-center gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <span>Afficher</span>
                  <Select
                    value={itemsPerPage.toString()}
                    onValueChange={(value) => {
                      setItemsPerPage(Number(value));
                      setCurrentPage(1);
                    }}
                  >
                    <SelectTrigger className="h-8 w-16">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">10</SelectItem>
                      <SelectItem value="20">20</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                      <SelectItem value="100">100</SelectItem>
                    </SelectContent>
                  </Select>
                  <span>par page</span>
                </div>
                <div>
                  {(currentPage - 1) * itemsPerPage + 1}-{Math.min(currentPage * itemsPerPage, serverTotal)} sur {serverTotal}
                </div>
              </div>

              {/* Info - Mobile only */}
              <div className="sm:hidden text-sm text-muted-foreground">
                {(currentPage - 1) * itemsPerPage + 1}-{Math.min(currentPage * itemsPerPage, serverTotal)} / {serverTotal}
              </div>

              {/* Navigation */}
              <div className="flex items-center gap-1 sm:gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                  className="h-8 w-8 hidden sm:inline-flex"
                >
                  <ChevronsLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setCurrentPage(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="h-8 w-8"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className="flex items-center gap-2 px-2 sm:px-3 text-xs sm:text-sm">
                  <span className="hidden sm:inline">Page</span>
                  {currentPage}/{totalPages}
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setCurrentPage(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="h-8 w-8"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage === totalPages}
                  className="h-8 w-8 hidden sm:inline-flex"
                >
                  <ChevronsRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supprimer l'élève</DialogTitle>
            <DialogDescription>
              Êtes-vous sûr de vouloir supprimer{" "}
              <span className="font-semibold">
                {selectedStudent?.name}
              </span>{" "}
              ? Cette action est irréversible.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 justify-end pt-4 border-t mt-6">
            <Button
              variant="outline"
              onClick={() => setIsDeleteDialogOpen(false)}
            >
              Annuler
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              className="bg-red-600 text-white hover:bg-red-700 border-2 border-red-600 shadow-sm"
            >
              Supprimer
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Template Dialog */}
      <Dialog open={isTemplateDialogOpen} onOpenChange={setIsTemplateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Télécharger template d'import</DialogTitle>
            <DialogDescription>
              Choisissez une classe pour pré-remplir le template, ou laissez vide pour toutes les classes
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="template-class">Classe (optionnel)</Label>
              <Select value={templateClassId} onValueChange={setTemplateClassId}>
                <SelectTrigger id="template-class">
                  <SelectValue placeholder="Sélectionnez une classe" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    <div className="flex items-center gap-2">
                      <span>📚</span>
                      <span>Template vide (sans classe pré-remplie)</span>
                    </div>
                  </SelectItem>
                  {classes.map((cls) => (
                    <SelectItem key={cls.id} value={cls.id}>
                      <div className="flex items-center gap-2">
                        <span>📖</span>
                        <span>{formatClassName(cls.name, cls.section)}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Si vous choisissez une classe, la colonne "classe" sera pré-remplie dans le template
              </p>
            </div>

            {templateClassId !== "all" && (() => {
              const selectedCls = classes.find(c => c.id === templateClassId);
              const classeValue = selectedCls
                ? (selectedCls.section ? `${selectedCls.name} ${selectedCls.section}` : selectedCls.name)
                : "";
              return (
                <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 space-y-1">
                  <p className="text-sm text-blue-800">
                    ✅ La colonne <span className="font-semibold">"classe"</span> sera pré-remplie avec :
                    <span className="font-semibold"> {classeValue}</span>
                  </p>
                  <p className="text-xs text-blue-600">
                    Ce nom exact sera utilisé pour retrouver la classe lors de l'import.
                  </p>
                </div>
              );
            })()}
          </div>
          <div className="flex gap-3 justify-end pt-4 border-t">
            <Button
              variant="outline"
              onClick={() => setIsTemplateDialogOpen(false)}
            >
              Annuler
            </Button>
            <Button
              onClick={confirmDownloadTemplate}
              className="gap-2"
            >
              <Download className="h-4 w-4" />
              Télécharger
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Import Dialog */}
      <ImportExportDialog
        open={isImportDialogOpen}
        onOpenChange={setIsImportDialogOpen}
        title="Importer des élèves"
        description="Importez plusieurs élèves à la fois depuis un fichier CSV"
        templateName="eleves"
        templateHeaders={["prenom", "nom", "classe", "dateNaissance", "genre", "nomParent", "telephoneParent", "email", "professionParent"]}
        sampleData={[
          {
            prenom: "Fatou",
            nom: "Camara",
            classe: classes.length > 0
              ? formatClassName(classes[0].name, classes[0].section)
              : "CP1 A (1ère année A)",
            dateNaissance: "2010-05-15",
            genre: "F",
            nomParent: "Mme Aissatou Camara",
            telephoneParent: "+224 621 234 567",
            email: "fatou.camara@example.com",
            professionParent: "Enseignante",
          },
          {
            prenom: "Mamadou",
            nom: "Diallo",
            classe: classes.length > 1
              ? formatClassName(classes[1].name, classes[1].section)
              : "CP2 (2ème année)",
            dateNaissance: "2011-03-20",
            genre: "M",
            nomParent: "M. Ibrahim Diallo",
            telephoneParent: "+224 622 345 678",
            email: "ibrahim.diallo@example.com",
            professionParent: "Commerçant",
          },
        ]}
        onImport={handleImport}
        validator={validateStudentRow}
      />
    </div>
  );
}
