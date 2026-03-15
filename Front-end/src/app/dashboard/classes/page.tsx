"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Plus,
  Search,
  MoreVertical,
  Edit2,
  Trash2,
  Users,
  WifiOff,
  Loader2,
  Save,
  X,
  CheckCircle2,
  Eye,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import Link from "next/link";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useOnline } from "@/hooks/use-online";
import * as storage from "@/lib/storage";
import { useAuth } from "@/contexts/AuthContext";
import { getClasses, createClass, updateClass, deleteClass, transferStudents } from "@/lib/api/classes.service";
import { offlineDB, STORES } from "@/lib/offline-db";
import { syncQueue } from "@/lib/sync-queue";
import {
  CLASS_LEVELS,
  CLASS_CATALOG,
  SECTIONS,
  LYCEE_SERIES,
  getSelectLabel,
  getDisplayName,
  suggestClassName,
  validateClassLevel,
  type ClassDefinition,
  type Section,
} from "@/lib/class-config";
import { getCurrentAcademicYear } from "@/lib/api/academic-years.service";
import { CreateDefaultClassesDialog } from "@/components/classes/CreateDefaultClassesDialog";
import { EditClassDialog } from "@/components/classes/EditClassDialog";
import { formatClassName } from "@/lib/class-helpers";

interface Class {
  id: string;
  name: string;
  level: string;
  section?: string | null;
  capacity: number;
  studentCount?: number;
  maleCount?: number;
  femaleCount?: number;
  teacherName?: string;
}

export default function ClassesPage() {
  const isOnline = useOnline();
  const { user } = useAuth();
  const isDirector = user?.role === 'director';
  const isTeacher = user?.role === 'teacher';
  const [classes, setClasses] = useState<Class[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [levelFilter, setLevelFilter] = useState<string>("all");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedClass, setSelectedClass] = useState<Class | null>(null);
  const [transferTargetClassId, setTransferTargetClassId] = useState<string>("");
  const [deleteAction, setDeleteAction] = useState<"transfer" | "delete-all" | "">("");  // Action choisie par l'utilisateur
  const [academicYearId, setAcademicYearId] = useState<string | null>(null); // ID de l'année académique courante
  const [formData, setFormData] = useState({
    name: "",
    level: "",
    selectedClassId: "", // ID de la classe sélectionnée (ex: "prim-1")
    selectedSection: "", // Section si nécessaire (ex: "A")
    capacity: 30,
    teacherName: "",
  });
  const [classNeedsSection, setClassNeedsSection] = useState(false);
  const [availableSections, setAvailableSections] = useState<string[]>([]);
  const [isLyceeSelection, setIsLyceeSelection] = useState(false);

  // États pour la proposition de suppression de section unique
  const [showRemoveSectionDialog, setShowRemoveSectionDialog] = useState(false);
  const [singleClassToUpdate, setSingleClassToUpdate] = useState<{
    id: string;
    name: string;
    section: string;
    studentCount: number;
  } | null>(null);

  // Charger les classes et l'année académique au montage
  useEffect(() => {
    loadClasses();
    loadCurrentAcademicYear();
  }, []);

  async function loadCurrentAcademicYear() {
    const token = storage.getAuthItem('structura_token');
    if (!token) return;

    try {
      const year = await getCurrentAcademicYear(token);
      setAcademicYearId(year?.id || null);
    } catch {
      // Aucune année académique courante — non bloquant
    }
  }

  async function loadClasses(): Promise<Class[]> {
    setIsLoading(true);
    const token = storage.getAuthItem('structura_token');

    const mapClass = (c: any): Class => ({
      id: c.id,
      name: c.name,
      section: c.section,
      level: c.level || '',
      capacity: c.capacity || 30,
      studentCount: c.studentCount || c._count?.students || 0,
      maleCount: c.maleCount || 0,
      femaleCount: c.femaleCount || 0,
      teacherName: c.teacherName || '',
    });

    // Mode hors ligne → lire uniquement depuis IndexedDB
    if (!isOnline) {
      try {
        const cached = await offlineDB.getAll<Class>(STORES.CLASSES);
        setClasses(cached);
        if (cached.length === 0) {
          toast.info('Hors ligne — aucune classe en cache');
        }
        return cached;
      } catch {
        setClasses([]);
        return [];
      } finally {
        setIsLoading(false);
      }
    }

    try {
      if (!token) {
        toast.error('Session expirée');
        return [];
      }

      const response = await getClasses(token);
      const classesData = Array.isArray(response) ? response : [];
      const mappedClasses: Class[] = classesData.map(mapClass);

      // Afficher les données immédiatement (indépendant du cache)
      setClasses(mappedClasses);

      if (mappedClasses.length === 0) {
        toast.info('Aucune classe trouvée. Créez votre première classe !', {
          description: 'Ou utilisez le modal d\'onboarding pour créer des classes automatiquement.',
        });
      }

      // Mettre à jour le cache IndexedDB (silencieux — n'affecte pas l'affichage)
      try {
        await offlineDB.clear(STORES.CLASSES);
        await offlineDB.bulkAdd(STORES.CLASSES, mappedClasses);
      } catch {
        // Échec du cache : pas grave, les données sont déjà affichées
      }

      return mappedClasses;
    } catch (error: any) {
      // Fallback : essayer le cache IndexedDB
      try {
        const cached = await offlineDB.getAll<Class>(STORES.CLASSES);
        if (cached.length > 0) {
          setClasses(cached);
          toast.warning('Données chargées depuis le cache (erreur réseau)');
          return cached;
        }
      } catch { /* ignore */ }

      const isNetworkError = error.message === 'Failed to fetch' || error.message?.includes('network');
      toast.error(
        isNetworkError
          ? 'Impossible de joindre le serveur — aucune donnée en cache'
          : (error.message || 'Impossible de charger les classes'),
        { description: isNetworkError ? 'Chargez la page une fois en ligne pour activer le mode hors ligne.' : undefined }
      );
      setClasses([]);
      return [];
    } finally {
      setIsLoading(false);
    }
  }

  function openAddDialog() {
    setFormData({
      name: "",
      level: "",
      selectedClassId: "",
      selectedSection: "",
      capacity: 30,
      teacherName: "",
    });
    setClassNeedsSection(false);
    setAvailableSections([]);
    setIsAddDialogOpen(true);
  }

  // Quand le niveau change, réinitialiser la sélection
  function handleLevelChange(level: string) {
    setFormData({
      ...formData,
      level,
      selectedClassId: "",
      selectedSection: "",
      name: "",
    });
    setClassNeedsSection(false);
    setAvailableSections([]);
    setIsLyceeSelection(false);
  }

  // Quand une classe est sélectionnée
  function handleClassSelection(classId: string) {
    const classDef = CLASS_CATALOG[formData.level as keyof typeof CLASS_CATALOG]?.find(
      (c) => c.id === classId
    );

    if (!classDef) return;

    const baseName = classDef.displayName;
    const isLycee = !!classDef.isLycee;

    // Vérifier quelles sections / séries existent déjà pour cette classe
    const existingClassesWithSameBase = classes.filter((c) => c.name === baseName);

    if (isLycee) {
      // Lycée : séries Sciences Sociales / Mathématiques / Expérimental
      const existingSeries = existingClassesWithSameBase
        .map((c) => c.section)
        .filter(Boolean) as string[];
      const availableSeries = LYCEE_SERIES.filter((s) => !existingSeries.includes(s));
      const firstSerie = availableSeries[0] || "";
      const displayName = firstSerie ? `${baseName} ${firstSerie}` : baseName;

      setFormData({ ...formData, selectedClassId: classId, selectedSection: firstSerie, name: displayName });
      setClassNeedsSection(true);
      setAvailableSections([...availableSeries]);
      setIsLyceeSelection(true);
    } else {
      // Collège / autres : sections A, B, C…
      const existingSections = existingClassesWithSameBase
        .map((c) => {
          const match = c.name.match(/ ([A-F])$/);
          return match ? match[1] : null;
        })
        .filter(Boolean);
      const availableSecs = SECTIONS.filter((s) => !existingSections.includes(s));
      const firstAvailableSection = availableSecs[0] || "";
      const displayName = firstAvailableSection ? `${baseName} ${firstAvailableSection}` : baseName;

      setFormData({ ...formData, selectedClassId: classId, selectedSection: firstAvailableSection, name: displayName });
      setClassNeedsSection(true);
      setAvailableSections([...availableSecs]);
      setIsLyceeSelection(false);
    }
  }

  // Quand la section change
  function handleSectionChange(section: string) {
    const classDef = CLASS_CATALOG[formData.level as keyof typeof CLASS_CATALOG]?.find(
      (c) => c.id === formData.selectedClassId
    );

    if (!classDef) return;

    const baseName = classDef.displayName;
    const newName = section ? `${baseName} ${section}` : baseName;

    setFormData({
      ...formData,
      selectedSection: section,
      name: newName,
    });
  }

  function openEditDialog(classItem: Class) {
    setSelectedClass(classItem);
    setFormData({
      name: classItem.name,
      level: classItem.level,
      selectedClassId: "",
      selectedSection: "",
      capacity: classItem.capacity,
      teacherName: classItem.teacherName || "",
    });
    setIsEditDialogOpen(true);
  }

  function openDeleteDialog(classItem: Class) {
    setSelectedClass(classItem);
    setTransferTargetClassId(""); // Reset la sélection
    setDeleteAction(""); // Reset l'action
    setIsDeleteDialogOpen(true);
  }

  async function handleAdd() {
    // Validation stricte
    if (!formData.level) {
      toast.error('Veuillez sélectionner un niveau');
      return;
    }

    if (!formData.selectedClassId) {
      toast.error('Veuillez sélectionner une classe');
      return;
    }

    if (!formData.selectedSection && availableSections.length > 0) {
      toast.error('Veuillez sélectionner une section');
      return;
    }

    if (!formData.name) {
      toast.error('Le nom de la classe est invalide');
      return;
    }

    // Validation de cohérence : le nom doit correspondre au niveau
    if (!validateClassLevel(formData.name, formData.level as any)) {
      toast.error('Incohérence détectée : le nom de la classe ne correspond pas au niveau sélectionné');
      return;
    }

    setIsSaving(true);
    const token = storage.getAuthItem('structura_token');

    // Extraire le nom de base et la section
    const classDef = CLASS_CATALOG[formData.level as keyof typeof CLASS_CATALOG]?.find(
      (c) => c.id === formData.selectedClassId
    );
    const baseName = classDef?.displayName || formData.name;

    const classDto = {
      name: baseName,
      level: formData.level,
      section: formData.selectedSection || undefined,
      capacity: formData.capacity,
      teacherName: formData.teacherName || undefined,
      // Primaire/Maternel → PRIMARY, Secondaire/Lycée → SECONDARY
      gradeMode: ['Primaire', 'Maternel'].includes(formData.level) ? 'PRIMARY' : 'SECONDARY',
    };

    try {
      if (!isOnline) {
        // Mode hors ligne : sauvegarder localement
        const tempId = `offline-class-${crypto.randomUUID()}`;
        const localClass: Class = {
          id: tempId,
          name: baseName,
          level: formData.level,
          section: formData.selectedSection || null,
          capacity: formData.capacity,
          teacherName: formData.teacherName || '',
          studentCount: 0,
          maleCount: 0,
          femaleCount: 0,
        };

        await offlineDB.add(STORES.CLASSES, { ...localClass, _tempId: tempId, needsSync: true });
        await syncQueue.add({ type: "class", action: "create", data: { _tempId: tempId, ...classDto } });

        setClasses((prev) => [...prev, localClass]);
        toast.info(`Classe "${formData.name}" sauvegardée hors ligne`, {
          description: "Synchronisation automatique dès la reconnexion.",
        });
        setIsAddDialogOpen(false);
        return;
      }

      if (!token) {
        toast.error('Session expirée');
        return;
      }

      await createClass(token, classDto);

      toast.success(`Classe "${formData.name}" créée avec succès !`);
      setIsAddDialogOpen(false);
      loadClasses();
    } catch (error: any) {
      toast.error(error.message || 'Erreur lors de la création');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleEdit() {
    if (!selectedClass || !formData.name || !formData.level) {
      toast.error('Veuillez remplir tous les champs obligatoires');
      return;
    }

    setIsSaving(true);
    const token = storage.getAuthItem('structura_token');

    const updateDto = {
      name: formData.name,
      level: formData.level,
      capacity: formData.capacity,
      teacherName: formData.teacherName || undefined,
    };

    try {
      if (!isOnline) {
        // Mode hors ligne : mettre à jour le cache IndexedDB
        const updatedClass: Class = {
          ...selectedClass,
          ...updateDto,
        };
        await offlineDB.update(STORES.CLASSES, { ...updatedClass, needsSync: true });
        await syncQueue.add({
          type: "class",
          action: "update",
          data: { id: selectedClass.id, ...updateDto },
        });

        setClasses((prev) =>
          prev.map((c) => (c.id === selectedClass.id ? updatedClass : c))
        );
        toast.info('Classe modifiée hors ligne', {
          description: "Synchronisation automatique dès la reconnexion.",
        });
        setIsEditDialogOpen(false);
        return;
      }

      if (!token) {
        toast.error('Session expirée');
        return;
      }

      await updateClass(token, selectedClass.id, updateDto);

      toast.success('Classe modifiée avec succès !');
      setIsEditDialogOpen(false);
      loadClasses();
    } catch (error: any) {
      toast.error(error.message || 'Erreur lors de la modification');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    if (!selectedClass) return;

    // Refuser la suppression hors ligne (trop dangereuse sans connaître l'état des élèves)
    if (!isOnline) {
      toast.error(
        "Suppression impossible hors ligne",
        {
          description: "Risque d'incohérence avec les élèves associés. Reconnectez-vous pour supprimer une classe.",
          duration: 6000,
        }
      );
      return;
    }

    const hasStudents = selectedClass.studentCount && selectedClass.studentCount > 0;

    // Validation selon l'action choisie
    if (hasStudents) {
      if (!deleteAction) {
        toast.error('Veuillez choisir une action : transférer ou supprimer tout');
        return;
      }

      if (deleteAction === 'transfer' && !transferTargetClassId) {
        toast.error('Veuillez sélectionner une classe de destination');
        return;
      }

      if (deleteAction === 'transfer' && transferTargetClassId === selectedClass.id) {
        toast.error('Vous ne pouvez pas transférer vers la même classe');
        return;
      }
    }

    setIsSaving(true);
    const token = storage.getAuthItem('structura_token');

    try {
      if (!token) {
        toast.error('Session expirée');
        return;
      }

      // Action : Transférer puis supprimer
      if (hasStudents && deleteAction === 'transfer' && transferTargetClassId) {
        const targetClass = classes.find(c => c.id === transferTargetClassId);
        toast.loading(`Transfert de ${selectedClass.studentCount} élève(s) vers ${targetClass?.name}...`, {
          id: 'delete-progress',
        });

        await transferStudents(token, selectedClass.id, transferTargetClassId);

        toast.success(`${selectedClass.studentCount} élève(s) transféré(s) vers ${targetClass?.name}`, {
          id: 'delete-progress',
        });
      }

      // Action : Supprimer tout (classe + élèves)
      if (hasStudents && deleteAction === 'delete-all') {
        toast.loading(`Suppression de la classe et de ses ${selectedClass.studentCount} élève(s)...`, {
          id: 'delete-progress',
        });
      }

      // Supprimer la classe via API
      await deleteClass(token, selectedClass.id);

      toast.success(`Classe "${selectedClass.name}" supprimée avec succès !`, {
        id: 'delete-progress',
      });
      setIsDeleteDialogOpen(false);
      setTransferTargetClassId("");
      setDeleteAction("");

      // Recharger les classes
      const updatedClasses = await loadClasses();

      // Vérifier si une classe est maintenant seule avec une section
      checkForSingleClassWithSection(selectedClass.name, updatedClasses);
    } catch (error: any) {
      toast.error(error.message || 'Erreur lors de la suppression', { id: 'delete-progress' });
    } finally {
      setIsSaving(false);
    }
  }

  /**
   * Vérifier si une classe est maintenant seule avec une section
   * et proposer de l'enlever (UX production-ready)
   */
  function checkForSingleClassWithSection(deletedClassName: string, updatedClasses: Class[]) {
    // Extraire le nom de base (sans section) de la classe supprimée
    const baseNameMatch = deletedClassName.match(/^(.+?)(?:\s+[A-F])?$/);
    const baseName = baseNameMatch ? baseNameMatch[1].trim() : deletedClassName;

    // Trouver toutes les classes avec ce même nom de base dans la liste mise à jour
    const classesWithSameName = updatedClasses.filter(c => c.name === baseName);

    // Si exactement 1 classe reste ET elle a une section
    if (classesWithSameName.length === 1 && classesWithSameName[0].section) {
      const singleClass = classesWithSameName[0];

      setSingleClassToUpdate({
        id: singleClass.id,
        name: singleClass.name,
        section: singleClass.section!, // Non-null assertion car vérifié dans le if
        studentCount: singleClass.studentCount || 0,
      });

      setShowRemoveSectionDialog(true);
    }
  }

  /**
   * Enlever la section d'une classe unique
   */
  async function handleRemoveSection() {
    if (!singleClassToUpdate) return;

    setIsSaving(true);
    const token = storage.getAuthItem('structura_token');

    try {
      if (!token) {
        toast.error('Session expirée');
        return;
      }

      // Mettre à jour la classe pour enlever la section
      await updateClass(token, singleClassToUpdate.id, {
        section: null, // Enlever la section
      });

      toast.success(
        `Section "${singleClassToUpdate.section}" enlevée avec succès !\n` +
        `"${singleClassToUpdate.name} ${singleClassToUpdate.section}" → "${singleClassToUpdate.name}"`
      );

      setShowRemoveSectionDialog(false);
      setSingleClassToUpdate(null);
      loadClasses();
    } catch (error: any) {
      toast.error(error.message || 'Erreur lors de la modification');
    } finally {
      setIsSaving(false);
    }
  }

  // Filtrage
  const filteredClasses = classes.filter((classItem) => {
    const matchesSearch = classItem.name.toLowerCase().includes(searchQuery.toLowerCase());

    // Logique spéciale : "Secondaire" = Collège + Lycée
    let matchesLevel = false;
    if (levelFilter === "all") {
      matchesLevel = true;
    } else if (levelFilter === "Secondaire") {
      // Secondaire inclut Collège ET Lycée
      matchesLevel =
        classItem.level === "Collège" ||
        classItem.level === "Lycée" ||
        classItem.level === "Secondaire";
    } else {
      matchesLevel = classItem.level?.toLowerCase() === levelFilter.toLowerCase();
    }

    return matchesSearch && matchesLevel;
  });

  // Stats
  const totalClasses = classes.length;
  const totalStudents = classes.reduce((sum, c) => sum + (c.studentCount || 0), 0);
  const totalMale = classes.reduce((sum, c) => sum + (c.maleCount || 0), 0);
  const totalFemale = classes.reduce((sum, c) => sum + (c.femaleCount || 0), 0);
  const averageCapacity = classes.length > 0
    ? Math.round(classes.reduce((sum, c) => sum + c.capacity, 0) / classes.length)
    : 0;

  return (
    <div className="space-y-6">
      {/* Bandeau info prof : classes vides */}
      {isTeacher && classes.length === 0 && !isLoading && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
          <span className="text-amber-500 text-lg mt-0.5">ℹ️</span>
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-800">
              Aucune classe assignée à votre compte
            </p>
            <p className="text-xs text-amber-700 mt-1">
              Le directeur doit vous assigner vos classes depuis la page <strong>Équipe</strong>.
              Une fois assigné, cliquez sur <strong>Rafraîchir</strong> pour afficher vos classes.
            </p>
          </div>
          <button
            onClick={() => loadClasses()}
            className="flex-shrink-0 flex items-center gap-1.5 text-xs font-medium text-amber-800 hover:text-amber-900 border border-amber-300 hover:border-amber-400 bg-white hover:bg-amber-50 rounded-md px-2.5 py-1.5 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Rafraîchir
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            {isTeacher ? 'Mes Classes' : 'Gestion des Classes'}
          </h1>
          <p className="text-muted-foreground mt-1">
            {isTeacher ? 'Classes qui vous sont assignées' : 'Gérez les classes de votre école'}
          </p>
          {!isOnline && (
            <Badge variant="outline" className="mt-2 bg-amber-50 text-amber-700 border-amber-200">
              <WifiOff className="h-3 w-3 mr-1" />
              Mode hors ligne
            </Badge>
          )}
        </div>
        {isDirector && (
          <CreateDefaultClassesDialog
            academicYearId={academicYearId}
            onSuccess={loadClasses}
          />
        )}
      </div>

      {/* Stats */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Classes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalClasses}</div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-emerald-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Élèves
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalStudents}</div>
            <div className="flex items-center gap-3 mt-2">
              <div className="flex items-center gap-1 text-sm">
                <Badge
                  variant="outline"
                  className="bg-blue-50 text-blue-700 border-blue-200"
                >
                  ♂ {totalMale}
                </Badge>
              </div>
              <div className="flex items-center gap-1 text-sm">
                <Badge
                  variant="outline"
                  className="bg-pink-50 text-pink-700 border-pink-200"
                >
                  ♀ {totalFemale}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-blue-400">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <span>♂</span> Garçons
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-700">{totalMale}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {totalStudents > 0
                ? `${Math.round((totalMale / totalStudents) * 100)}% du total`
                : "-"}
            </p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-pink-400">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <span>♀</span> Filles
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-pink-700">{totalFemale}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {totalStudents > 0
                ? `${Math.round((totalFemale / totalStudents) * 100)}% du total`
                : "-"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle>Liste des Classes</CardTitle>
          <CardDescription>
            {filteredClasses.length} classe{filteredClasses.length > 1 ? "s" : ""} trouvée{filteredClasses.length > 1 ? "s" : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-6 space-y-4">
            {/* Filtres */}
            <div className="flex flex-col sm:flex-row gap-4">
              {/* Filtre par niveau */}
              <div className="flex-1">
                <Label htmlFor="level-filter" className="text-sm font-medium mb-2 block">
                  Filtrer par niveau
                </Label>
                <Select value={levelFilter} onValueChange={setLevelFilter}>
                  <SelectTrigger id="level-filter">
                    <SelectValue placeholder="Tous les niveaux" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      <div className="flex items-center gap-2">
                        <span>Tous les niveaux</span>
                      </div>
                    </SelectItem>
                    <SelectItem value={CLASS_LEVELS.MATERNEL}>
                      <div className="flex items-center gap-2">
                        <span className="text-lg">🎨</span>
                        <span>Maternelle</span>
                      </div>
                    </SelectItem>
                    <SelectItem value={CLASS_LEVELS.PRIMAIRE}>
                      <div className="flex items-center gap-2">
                        <span className="text-lg">📚</span>
                        <span>Primaire</span>
                      </div>
                    </SelectItem>
                    <SelectItem value={CLASS_LEVELS.SECONDAIRE}>
                      <div className="flex items-center gap-2">
                        <span className="text-lg">🎓</span>
                        <span>Secondaire</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Barre de recherche */}
              <div className="flex-1">
                <Label htmlFor="search-classes" className="text-sm font-medium mb-2 block">
                  Rechercher
                </Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="search-classes"
                    placeholder="Rechercher une classe..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
            </div>
          </div>

          {isLoading ? (
            <div className="py-12 text-center">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
              <p className="text-sm text-muted-foreground mt-2">
                Chargement des classes...
              </p>
            </div>
          ) : (
            <>
              {/* Vue Desktop - Tableau */}
              <div className="hidden md:block rounded-lg border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nom</TableHead>
                    <TableHead>Niveau</TableHead>
                    <TableHead className="min-w-[160px]">Occupation</TableHead>
                    <TableHead>Répartition</TableHead>
                    <TableHead>Enseignant</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredClasses.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        Aucune classe trouvée
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredClasses.map((classItem) => (
                      <TableRow key={classItem.id} className="group hover:bg-muted/50">
                        <TableCell className="font-medium">
                          {formatClassName(classItem.name, classItem.section)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">
                            {classItem.level}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {(() => {
                            const count = classItem.studentCount || 0;
                            const cap = classItem.capacity || 1;
                            const pct = Math.min(Math.round((count / cap) * 100), 100);
                            const isAlmost = pct >= 90;
                            const isFull = count >= cap;
                            return (
                              <div className="space-y-1 min-w-[140px]">
                                <div className="flex items-center justify-between text-xs">
                                  <span className="flex items-center gap-1 text-muted-foreground">
                                    <Users className="h-3 w-3" />
                                    <span className={`font-semibold ${isFull ? "text-red-600" : isAlmost ? "text-orange-600" : "text-foreground"}`}>
                                      {count}
                                    </span>
                                    <span>/ {cap}</span>
                                  </span>
                                  <span className={`font-medium ${isFull ? "text-red-600" : isAlmost ? "text-orange-600" : "text-emerald-600"}`}>
                                    {pct}%
                                  </span>
                                </div>
                                <Progress
                                  value={pct}
                                  className={`h-1.5 ${isFull ? "[&>div]:bg-red-500" : isAlmost ? "[&>div]:bg-orange-400" : "[&>div]:bg-emerald-500"}`}
                                />
                                {isFull && (
                                  <p className="text-xs text-red-600 font-medium">Classe pleine</p>
                                )}
                              </div>
                            );
                          })()}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {/* Badge Garçons (Bleu) */}
                            {classItem.maleCount !== undefined && classItem.maleCount > 0 && (
                              <Badge
                                variant="outline"
                                className="bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100"
                              >
                                <span className="mr-1">♂</span>
                                {classItem.maleCount}
                              </Badge>
                            )}
                            {/* Badge Filles (Rose/Violet) */}
                            {classItem.femaleCount !== undefined && classItem.femaleCount > 0 && (
                              <Badge
                                variant="outline"
                                className="bg-pink-50 text-pink-700 border-pink-200 hover:bg-pink-100"
                              >
                                <span className="mr-1">♀</span>
                                {classItem.femaleCount}
                              </Badge>
                            )}
                            {/* Si aucun élève */}
                            {(!classItem.maleCount || classItem.maleCount === 0) &&
                             (!classItem.femaleCount || classItem.femaleCount === 0) && (
                              <span className="text-sm text-muted-foreground">-</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{classItem.teacherName || "-"}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="opacity-0 group-hover:opacity-100 transition-all duration-200 hover:bg-muted"
                              asChild
                            >
                              <Link href={`/dashboard/classes/${classItem.id}`}>
                                <Eye className="h-4 w-4" />
                              </Link>
                            </Button>
                            {isDirector && (
                              <EditClassDialog
                                classItem={classItem}
                                onSuccess={loadClasses}
                              />
                            )}
                            {isDirector && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="opacity-0 group-hover:opacity-100 transition-all duration-200 hover:bg-muted"
                                  >
                                    <MoreVertical className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-48">
                                  <DropdownMenuItem
                                    onClick={() => openDeleteDialog(classItem)}
                                    className="text-destructive focus:text-destructive focus:bg-destructive/10 cursor-pointer"
                                  >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    <span className="font-medium">Supprimer</span>
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

              {/* Vue Mobile - Cartes */}
              <div className="md:hidden space-y-4">
                {filteredClasses.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    Aucune classe trouvée
                  </div>
                ) : (
                  filteredClasses.map((classItem) => (
                    <Card key={classItem.id} className="overflow-hidden">
                      <CardContent className="p-4">
                        <div className="space-y-3">
                          {/* En-tête */}
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <h3 className="font-semibold text-base truncate">
                                {formatClassName(classItem.name, classItem.section)}
                              </h3>
                              <Badge variant="outline" className="capitalize mt-1">
                                {classItem.level}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-1">
                              <Button variant="ghost" size="icon" className="h-9 w-9" asChild>
                                <Link href={`/dashboard/classes/${classItem.id}`}>
                                  <Eye className="h-4 w-4" />
                                </Link>
                              </Button>
                              {isDirector && (
                                <EditClassDialog
                                  classItem={classItem}
                                  onSuccess={loadClasses}
                                />
                              )}
                              {isDirector && (
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-9 w-9 border"
                                    >
                                      <MoreVertical className="h-5 w-5" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="w-48">
                                    <DropdownMenuItem
                                      onClick={() => openDeleteDialog(classItem)}
                                      className="text-destructive focus:text-destructive focus:bg-destructive/10 cursor-pointer"
                                    >
                                      <Trash2 className="h-4 w-4 mr-2" />
                                      <span className="font-medium">Supprimer</span>
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              )}
                            </div>
                          </div>

                          {/* Informations */}
                          <div className="grid grid-cols-2 gap-3 text-sm">
                            <div className="col-span-2">
                              {(() => {
                                const count = classItem.studentCount || 0;
                                const cap = classItem.capacity || 1;
                                const pct = Math.min(Math.round((count / cap) * 100), 100);
                                const isAlmost = pct >= 90;
                                const isFull = count >= cap;
                                return (
                                  <div className="space-y-1">
                                    <p className="text-muted-foreground text-xs">Occupation</p>
                                    <div className="flex items-center justify-between text-xs mb-1">
                                      <span className="flex items-center gap-1">
                                        <Users className="h-3 w-3 text-muted-foreground" />
                                        <span className={`font-semibold ${isFull ? "text-red-600" : isAlmost ? "text-orange-600" : "text-foreground"}`}>
                                          {count}
                                        </span>
                                        <span className="text-muted-foreground">/ {cap}</span>
                                      </span>
                                      <span className={`font-medium ${isFull ? "text-red-600" : isAlmost ? "text-orange-600" : "text-emerald-600"}`}>
                                        {pct}%{isFull ? " · Pleine" : ""}
                                      </span>
                                    </div>
                                    <Progress
                                      value={pct}
                                      className={`h-2 ${isFull ? "[&>div]:bg-red-500" : isAlmost ? "[&>div]:bg-orange-400" : "[&>div]:bg-emerald-500"}`}
                                    />
                                  </div>
                                );
                              })()}
                            </div>
                            <div className="col-span-2">
                              <p className="text-muted-foreground text-xs mb-1">Répartition</p>
                              <div className="flex items-center gap-2 flex-wrap">
                                {classItem.maleCount !== undefined && classItem.maleCount > 0 && (
                                  <Badge
                                    variant="outline"
                                    className="bg-blue-50 text-blue-700 border-blue-200"
                                  >
                                    <span className="mr-1">♂</span>
                                    {classItem.maleCount}
                                  </Badge>
                                )}
                                {classItem.femaleCount !== undefined && classItem.femaleCount > 0 && (
                                  <Badge
                                    variant="outline"
                                    className="bg-pink-50 text-pink-700 border-pink-200"
                                  >
                                    <span className="mr-1">♀</span>
                                    {classItem.femaleCount}
                                  </Badge>
                                )}
                                {(!classItem.maleCount || classItem.maleCount === 0) &&
                                 (!classItem.femaleCount || classItem.femaleCount === 0) && (
                                  <span className="text-sm text-muted-foreground">-</span>
                                )}
                              </div>
                            </div>
                            {classItem.teacherName && (
                              <div className="col-span-2">
                                <p className="text-muted-foreground text-xs">Enseignant</p>
                                <p className="font-medium">{classItem.teacherName}</p>
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
        </CardContent>
      </Card>

      {/* Dialog Ajouter */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Ajouter une classe</DialogTitle>
            <DialogDescription>
              Créez une nouvelle classe dans votre école
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6">
            {/* Étape 1: Niveau */}
            <div className="space-y-2">
              <Label htmlFor="add-level" className="text-base font-semibold">
                1. Sélectionnez le niveau *
              </Label>
              <Select value={formData.level} onValueChange={handleLevelChange}>
                <SelectTrigger id="add-level" className="h-11">
                  <SelectValue placeholder="Choisir un niveau..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={CLASS_LEVELS.MATERNEL}>
                    <div className="flex items-center gap-2">
                      <span className="text-lg">🎨</span>
                      <span className="font-medium">Maternelle</span>
                    </div>
                  </SelectItem>
                  <SelectItem value={CLASS_LEVELS.PRIMAIRE}>
                    <div className="flex items-center gap-2">
                      <span className="text-lg">📚</span>
                      <span className="font-medium">Primaire</span>
                    </div>
                  </SelectItem>
                  <SelectItem value={CLASS_LEVELS.SECONDAIRE}>
                    <div className="flex items-center gap-2">
                      <span className="text-lg">🎓</span>
                      <span className="font-medium">Secondaire</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Étape 2: Classe (apparaît seulement si niveau sélectionné) */}
            {formData.level && (
              <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
                <Label htmlFor="add-class" className="text-base font-semibold">
                  2. Sélectionnez la classe *
                </Label>
                <p className="text-sm text-muted-foreground mb-2">
                  Les équivalences sont indiquées entre parenthèses
                </p>
                <Select value={formData.selectedClassId} onValueChange={handleClassSelection}>
                  <SelectTrigger id="add-class" className="h-11">
                    <SelectValue placeholder="Choisir une classe..." />
                  </SelectTrigger>
                  <SelectContent>
                    {CLASS_CATALOG[formData.level as keyof typeof CLASS_CATALOG]?.map((classDef) => (
                      <SelectItem key={classDef.id} value={classDef.id}>
                        {getSelectLabel(classDef)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Étape 3: Section / Série */}
            {formData.selectedClassId && availableSections.length > 0 && (
              <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
                <Label htmlFor="add-section" className="text-base font-semibold">
                  3. Choisissez une {isLyceeSelection ? "série" : "section"} *
                </Label>
                <p className="text-sm text-muted-foreground">
                  {isLyceeSelection
                    ? "La série définit la filière (Sciences Sociales, Mathématiques, Expérimental)"
                    : "Les sections permettent d'avoir plusieurs classes du même niveau"}
                </p>
                <Select value={formData.selectedSection} onValueChange={handleSectionChange}>
                  <SelectTrigger id="add-section" className="h-11">
                    <SelectValue placeholder={isLyceeSelection ? "Choisir une série..." : "Choisir une section..."} />
                  </SelectTrigger>
                  <SelectContent>
                    {availableSections.map((section) => (
                      <SelectItem key={section} value={section}>
                        {isLyceeSelection ? section : `Section ${section}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Prévisualisation du nom final */}
            {formData.name && (
              <div className="rounded-lg border-2 border-blue-200 bg-blue-50 p-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-blue-600 font-medium mb-1">✓ Nom de la classe</p>
                    <p className="text-lg font-bold text-blue-700">{formData.name}</p>
                  </div>
                  <Badge variant="outline" className="text-blue-700 border-blue-300">
                    {formData.level}
                  </Badge>
                </div>
              </div>
            )}

            {/* Séparateur */}
            {formData.selectedClassId && (
              <div className="border-t pt-4">
                <h3 className="text-sm font-semibold text-muted-foreground mb-4">
                  Informations complémentaires
                </h3>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="add-capacity">Capacité maximale</Label>
              <Input
                id="add-capacity"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={formData.capacity === 0 ? "" : formData.capacity}
                onChange={(e) => {
                  const raw = e.target.value.replace(/\D/g, "");
                  setFormData({ ...formData, capacity: raw === "" ? 0 : parseInt(raw) });
                }}
                onBlur={() => {
                  if (!formData.capacity || formData.capacity < 1) {
                    setFormData({ ...formData, capacity: 30 });
                  }
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="add-teacher">Nom de l'enseignant</Label>
              <Input
                id="add-teacher"
                placeholder="Ex: M. Camara"
                value={formData.teacherName}
                onChange={(e) => setFormData({ ...formData, teacherName: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddDialogOpen(false)} disabled={isSaving}>
              Annuler
            </Button>
            <Button onClick={handleAdd} disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Création...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Créer
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Modifier */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Modifier la classe</DialogTitle>
            <DialogDescription>
              Modifiez les informations de la classe
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Infos en lecture seule */}
            <div className="rounded-lg border bg-muted/50 p-3 space-y-1">
              <p className="text-xs text-muted-foreground font-medium">Classe (non modifiable)</p>
              <p className="text-lg font-bold">{selectedClass?.name}</p>
              <p className="text-sm text-muted-foreground">{selectedClass?.level}</p>
            </div>

            {/* Capacité */}
            <div className="space-y-2">
              <Label htmlFor="edit-capacity">Capacité maximale</Label>
              <Input
                id="edit-capacity"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={formData.capacity === 0 ? "" : formData.capacity}
                onChange={(e) => {
                  const raw = e.target.value.replace(/\D/g, "");
                  setFormData({ ...formData, capacity: raw === "" ? 0 : parseInt(raw) });
                }}
                onBlur={() => {
                  if (!formData.capacity || formData.capacity < 1) {
                    setFormData({ ...formData, capacity: 30 });
                  }
                }}
              />
            </div>

            {/* Enseignant */}
            <div className="space-y-2">
              <Label htmlFor="edit-teacher">Nom de l'enseignant</Label>
              <Input
                id="edit-teacher"
                placeholder="Ex: M. Diallo"
                value={formData.teacherName}
                onChange={(e) => setFormData({ ...formData, teacherName: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)} disabled={isSaving}>
              Annuler
            </Button>
            <Button onClick={handleEdit} disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Enregistrement...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Enregistrer
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Supprimer */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Supprimer la classe</DialogTitle>
            <DialogDescription>
              {selectedClass?.name}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Info sur le nombre d'élèves */}
            {selectedClass && selectedClass.studentCount && selectedClass.studentCount > 0 ? (
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
                <p className="text-sm text-amber-800">
                  ⚠️ Cette classe contient <span className="font-semibold">{selectedClass.studentCount} élève{selectedClass.studentCount > 1 ? 's' : ''}</span>
                </p>
              </div>
            ) : (
              <div className="rounded-lg bg-green-50 border border-green-200 p-3">
                <p className="text-sm text-green-800">
                  ✓ Classe vide, peut être supprimée directement
                </p>
              </div>
            )}

            {/* Sélection de l'action */}
            {selectedClass && selectedClass.studentCount && selectedClass.studentCount > 0 && (
              <div className="space-y-3">
                <Label htmlFor="delete-action">Que faire des élèves ?</Label>
                <Select value={deleteAction} onValueChange={(value) => setDeleteAction(value as "transfer" | "delete-all" | "")}>
                  <SelectTrigger id="delete-action">
                    <SelectValue placeholder="Choisir une action..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="transfer">
                      <div className="flex items-center gap-2">
                        <span>🔄</span>
                        <span>Transférer vers une autre classe</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="delete-all">
                      <div className="flex items-center gap-2">
                        <span>🗑️</span>
                        <span>Supprimer la classe ET les élèves</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>

                {/* Classe de destination si transfert */}
                {deleteAction === 'transfer' && (
                  <div className="space-y-2 pt-2">
                    <Label htmlFor="target-class">Classe de destination</Label>
                    <Select value={transferTargetClassId} onValueChange={setTransferTargetClassId}>
                      <SelectTrigger id="target-class">
                        <SelectValue placeholder="Sélectionner..." />
                      </SelectTrigger>
                      <SelectContent>
                        {classes
                          .filter(c => c.id !== selectedClass.id)
                          .map((classItem) => {
                            const availableSpace = classItem.capacity - (classItem.studentCount || 0);
                            const canAccommodate = availableSpace >= (selectedClass.studentCount || 0);

                            return (
                              <SelectItem
                                key={classItem.id}
                                value={classItem.id}
                                disabled={!canAccommodate}
                              >
                                {formatClassName(classItem.name, classItem.section)} {!canAccommodate ? '(capacité insuffisante)' : `(${availableSpace} places)`}
                              </SelectItem>
                            );
                          })}
                        {classes.filter(c => c.id !== selectedClass.id).length === 0 && (
                          <div className="p-4 text-center text-sm text-muted-foreground">
                            Aucune autre classe disponible
                          </div>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Avertissement suppression totale */}
                {deleteAction === 'delete-all' && (
                  <div className="rounded-lg bg-red-50 border border-red-200 p-3">
                    <p className="text-sm text-red-800 font-medium">
                      ⚠️ Action irréversible : La classe et ses {selectedClass.studentCount} élève{selectedClass.studentCount > 1 ? 's' : ''} seront supprimé{selectedClass.studentCount > 1 ? 's' : ''} définitivement
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 justify-end pt-4 border-t mt-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsDeleteDialogOpen(false);
                setDeleteAction('');
                setTransferTargetClassId('');
              }}
              disabled={isSaving}
            >
              Annuler
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
              disabled={
                isSaving ||
                (!!selectedClass?.studentCount &&
                  selectedClass.studentCount > 0 &&
                  (!deleteAction || (deleteAction === 'transfer' && !transferTargetClassId)))
              }
              className="bg-red-600 text-white hover:bg-red-700 disabled:bg-gray-300 disabled:text-gray-600 border-2 border-red-600 disabled:border-gray-400 shadow-sm disabled:opacity-100"
            >
              {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {isSaving
                ? 'En cours...'
                : deleteAction === 'transfer'
                ? 'Transférer et supprimer'
                : deleteAction === 'delete-all'
                ? 'Supprimer tout'
                : 'Supprimer'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog Proposition Suppression Section */}
      <AlertDialog open={showRemoveSectionDialog} onOpenChange={setShowRemoveSectionDialog}>
        <AlertDialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-blue-600" />
              Suggestion de simplification
            </AlertDialogTitle>
          </AlertDialogHeader>

          <div className="space-y-4">
            {singleClassToUpdate && (
              <>
                <AlertDialogDescription className="text-base">
                  Il ne reste maintenant qu'une seule classe <span className="font-semibold">{singleClassToUpdate.name}</span>.
                  Voulez-vous enlever la section pour simplifier le nom ?
                </AlertDialogDescription>

                {/* Changement proposé */}
                <div className="rounded-lg bg-linear-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 p-4">
                  <p className="text-xs font-medium text-blue-600 mb-2">Changement proposé :</p>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 text-center">
                      <p className="text-sm text-muted-foreground mb-1">Actuellement</p>
                      <p className="text-lg font-bold text-gray-700">
                        {formatClassName(singleClassToUpdate.name, singleClassToUpdate.section)}
                      </p>
                    </div>
                    <div className="text-2xl text-blue-600">→</div>
                    <div className="flex-1 text-center">
                      <p className="text-sm text-muted-foreground mb-1">Après modification</p>
                      <p className="text-lg font-bold text-blue-600">
                        {formatClassName(singleClassToUpdate.name, null)}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Message rassurant */}
                <div className="rounded-lg bg-green-50 border border-green-200 p-3">
                  <p className="text-sm text-green-800">
                    ✓ Les <span className="font-semibold">{singleClassToUpdate.studentCount} élève{singleClassToUpdate.studentCount > 1 ? 's' : ''}</span> de cette classe ne seront pas affecté{singleClassToUpdate.studentCount > 1 ? 's' : ''}.
                    Seul le nom de la classe sera modifié.
                  </p>
                </div>
              </>
            )}
          </div>

          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel
              onClick={() => {
                setShowRemoveSectionDialog(false);
                setSingleClassToUpdate(null);
              }}
              disabled={isSaving}
              className="sm:flex-1"
            >
              Non, garder {singleClassToUpdate?.section}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemoveSection}
              disabled={isSaving}
              className="sm:flex-1 bg-blue-600 hover:bg-blue-700"
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Modification...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Oui, enlever
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
