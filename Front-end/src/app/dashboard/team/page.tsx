"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Plus,
  Search,
  MoreVertical,
  Edit2,
  Trash2,
  Shield,
  Mail,
  Phone,
  CheckCircle2,
  XCircle,
  Loader2,
  UserX,
  UserCheck,
  BookOpen,
  Clock,
  ChevronDown,
  Users,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  RoleType,
  ROLE_LABELS,
  ROLE_COLORS,
  ROLE_DESCRIPTIONS,
  DEFAULT_PERMISSIONS,
  UserPermissions,
} from "@/types/permissions";
import { PermissionsEditor } from "@/components/team/PermissionsEditor";
import { useAuth } from "@/contexts/AuthContext";
import * as storage from "@/lib/storage";
import { toast } from "sonner";
import {
  BackendTeamMember,
  AssignedClass,
  ClassSubjectAssignment,
  getTeamMembers,
  createTeamMember,
  updateTeamMember,
  deleteTeamMember,
  updateMemberPermissions,
  assignTeacherClasses,
  resendMemberInvite,
} from "@/lib/api/users.service";
import { getClasses, getClassSubjects } from "@/lib/api/classes.service";
import { formatClassName } from "@/lib/class-helpers";

// ── Type local (vue) ──────────────────────────────────────────────────────────

interface MemberView {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  role: RoleType;
  permissions: UserPermissions | null;
  assignedClasses: AssignedClass[];
  /** Détail des matières par classe (professeurs uniquement) */
  classAssignments: ClassSubjectAssignment[];
  isActive: boolean;
  emailVerified: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
}

interface ClassOption {
  id: string;
  name: string;
  level: string;
  section?: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toFrontendRole(backendRole: string): RoleType {
  return backendRole.toLowerCase() as RoleType;
}

function mapMember(m: BackendTeamMember): MemberView {
  return {
    id: m.id,
    firstName: m.firstName,
    lastName: m.lastName,
    email: m.email,
    phone: m.phone ?? "",
    role: toFrontendRole(m.role),
    permissions: m.permissions,
    assignedClasses: m.taughtClasses ?? [],
    classAssignments: (m.classAssignments as ClassSubjectAssignment[]) ?? [],
    isActive: m.isActive,
    emailVerified: m.emailVerified,
    lastLoginAt: m.lastLoginAt ? new Date(m.lastLoginAt) : null,
    createdAt: new Date(m.createdAt),
  };
}

function classDisplayName(cls: ClassOption): string {
  return formatClassName(cls.name, cls.section);
}

// ── Constantes de groupage ─────────────────────────────────────────────────────

const ROLE_ORDER: RoleType[] = ["director", "teacher", "accountant", "supervisor", "secretary"];

const ROLE_GROUP_LABELS: Record<RoleType, string> = {
  director:   "Direction",
  teacher:    "Professeurs",
  accountant: "Comptabilité",
  supervisor: "Surveillance",
  secretary:  "Secrétariat",
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TeamPage() {
  const { user } = useAuth();
  const isDirector = user?.role === "director";

  // État principal
  const [members, setMembers] = useState<MemberView[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  // Classes disponibles (pour assignation aux professeurs)
  const [availableClasses, setAvailableClasses] = useState<ClassOption[]>([]);
  // Matières configurées en DB par classe : classId → string[]
  // Source de vérité unique partagée avec la page Notes
  const [classSubjectsMap, setClassSubjectsMap] = useState<Record<string, string[]>>({});

  // Filtres
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");

  // Dialogs
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isPermissionsDialogOpen, setIsPermissionsDialogOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<MemberView | null>(null);

  // State édition des permissions
  const [editedPermissions, setEditedPermissions] = useState<UserPermissions | null>(null);

  // Formulaires
  const [addForm, setAddForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    role: "" as RoleType | "",
    selectedClassIds: [] as string[],
    classAssignments: [] as ClassSubjectAssignment[],
  });
  const [editForm, setEditForm] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    role: "" as RoleType | "",
    isActive: true,
    selectedClassIds: [] as string[],
    classAssignments: [] as ClassSubjectAssignment[],
  });

  // ── Chargement ──────────────────────────────────────────────────────────────

  const loadTeam = useCallback(async () => {
    const token = storage.getAuthItem("structura_token");
    if (!token) { setIsLoading(false); return; }
    try {
      const data = await getTeamMembers(token);
      setMembers(data.map(mapMember));
    } catch (err) {
      toast.error("Erreur de chargement", {
        description:
          err instanceof Error ? err.message : "Impossible de charger l'équipe",
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadClasses = useCallback(async () => {
    const token = storage.getAuthItem("structura_token");
    if (!token) return;
    try {
      const data = await getClasses(token);
      setAvailableClasses(data.map((c: any) => ({
        id: c.id,
        name: c.name,
        level: c.level,
        section: c.section,
      })));

      // Charger les matières configurées en DB pour chaque classe en parallèle.
      // Seules ces matières peuvent être assignées à un professeur — même source
      // de vérité que la page Notes (ClassSubject en BDD).
      const entries = await Promise.all(
        data.map(async (c: any) => {
          try {
            const subjects = await getClassSubjects(token, c.id);
            return [c.id, subjects.map((s: any) => s.name)] as [string, string[]];
          } catch {
            return [c.id, []] as [string, string[]];
          }
        })
      );
      setClassSubjectsMap(Object.fromEntries(entries));
    } catch {
      // Classes non critiques pour cette page
    }
  }, []);

  useEffect(() => {
    loadTeam();
    if (isDirector) {
      loadClasses();
    }
  }, [loadTeam, loadClasses, isDirector]);

  // ── Filtrage ────────────────────────────────────────────────────────────────

  const filteredMembers = members.filter((m) => {
    const matchesSearch =
      `${m.firstName} ${m.lastName}`
        .toLowerCase()
        .includes(searchQuery.toLowerCase()) ||
      m.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = roleFilter === "all" || m.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  // ── Stats ───────────────────────────────────────────────────────────────────

  const activeCount  = members.filter((m) => m.isActive).length;
  const teacherCount = members.filter((m) => m.role === "teacher").length;

  // Membres filtrés groupés par rôle (ordre fixe)
  const groupedMembers = ROLE_ORDER.reduce<Record<string, MemberView[]>>((acc, r) => {
    const group = filteredMembers.filter((m) => m.role === r);
    if (group.length > 0) acc[r] = group;
    return acc;
  }, {});

  const getInitials = (f: string, l: string) =>
    `${f.charAt(0)}${l.charAt(0)}`.toUpperCase();

  const toggleGroup = (role: string) =>
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(role)) next.delete(role); else next.add(role);
      return next;
    });

  const allExpanded = collapsedGroups.size === 0;
  const toggleAll = () =>
    setCollapsedGroups(allExpanded
      ? new Set(ROLE_ORDER.filter((r) => !!groupedMembers[r]))
      : new Set()
    );

  // ── Handlers UI ─────────────────────────────────────────────────────────────

  const handleAdd = () => {
    setAddForm({ firstName: "", lastName: "", email: "", phone: "", role: "", selectedClassIds: [], classAssignments: [] });
    setIsAddDialogOpen(true);
  };

  const handleEdit = (member: MemberView) => {
    setSelectedMember(member);
    setEditForm({
      firstName: member.firstName,
      lastName: member.lastName,
      phone: member.phone,
      role: member.role,
      isActive: member.isActive,
      selectedClassIds: member.assignedClasses.map((c) => c.id),
      classAssignments: member.classAssignments ?? [],
    });
    setIsEditDialogOpen(true);
  };

  const handleDelete = (member: MemberView) => {
    setSelectedMember(member);
    setIsDeleteDialogOpen(true);
  };

  const handleViewPermissions = (member: MemberView) => {
    setSelectedMember(member);
    // Initialiser les permissions éditées : custom en BDD ou défauts du rôle
    setEditedPermissions(
      member.permissions ?? DEFAULT_PERMISSIONS[member.role]
    );
    setIsPermissionsDialogOpen(true);
  };

  /** Coche/décoche une classe dans le formulaire Ajouter.
   *  Quand on coche → toutes les matières du niveau sont sélectionnées par défaut.
   *  Quand on décoche → l'entrée classAssignments correspondante est supprimée. */
  const toggleAddClass = (cls: ClassOption) => {
    setAddForm((prev) => {
      const checked = prev.selectedClassIds.includes(cls.id);
      if (checked) {
        // Décocher : retirer de selectedClassIds ET de classAssignments
        return {
          ...prev,
          selectedClassIds: prev.selectedClassIds.filter((id) => id !== cls.id),
          classAssignments: prev.classAssignments.filter((a) => a.classId !== cls.id),
        };
      } else {
        // Cocher : ajouter avec toutes les matières configurées en DB sélectionnées par défaut
        const allSubjects = classSubjectsMap[cls.id] ?? [];
        return {
          ...prev,
          selectedClassIds: [...prev.selectedClassIds, cls.id],
          classAssignments: [...prev.classAssignments, { classId: cls.id, subjects: allSubjects }],
        };
      }
    });
  };

  /** Coche/décoche une matière dans le formulaire Ajouter pour une classe donnée */
  const toggleAddSubject = (classId: string, subject: string) => {
    setAddForm((prev) => ({
      ...prev,
      classAssignments: prev.classAssignments.map((a) =>
        a.classId !== classId ? a :
          a.subjects.includes(subject)
            ? { ...a, subjects: a.subjects.filter((s) => s !== subject) }
            : { ...a, subjects: [...a.subjects, subject] }
      ),
    }));
  };

  /** Coche/décoche une classe dans le formulaire Modifier */
  const toggleEditClass = (cls: ClassOption) => {
    setEditForm((prev) => {
      const checked = prev.selectedClassIds.includes(cls.id);
      if (checked) {
        return {
          ...prev,
          selectedClassIds: prev.selectedClassIds.filter((id) => id !== cls.id),
          classAssignments: prev.classAssignments.filter((a) => a.classId !== cls.id),
        };
      } else {
        // Cocher : matières configurées en DB (source de vérité = page Notes)
        const allSubjects = classSubjectsMap[cls.id] ?? [];
        // Si une affectation existait déjà pour cette classe, la conserver
        const existing = prev.classAssignments.find((a) => a.classId === cls.id);
        return {
          ...prev,
          selectedClassIds: [...prev.selectedClassIds, cls.id],
          classAssignments: existing
            ? prev.classAssignments  // garder l'existant
            : [...prev.classAssignments, { classId: cls.id, subjects: allSubjects }],
        };
      }
    });
  };

  /** Coche/décoche une matière dans le formulaire Modifier pour une classe donnée */
  const toggleEditSubject = (classId: string, subject: string) => {
    setEditForm((prev) => ({
      ...prev,
      classAssignments: prev.classAssignments.map((a) =>
        a.classId !== classId ? a :
          a.subjects.includes(subject)
            ? { ...a, subjects: a.subjects.filter((s) => s !== subject) }
            : { ...a, subjects: [...a.subjects, subject] }
      ),
    }));
  };

  // ── Actions API ─────────────────────────────────────────────────────────────

  const confirmAdd = async () => {
    if (!addForm.role || !addForm.firstName || !addForm.lastName || !addForm.email) return;
    const token = storage.getAuthItem("structura_token");
    if (!token) return;

    setIsSubmitting(true);
    try {
      const created = await createTeamMember(token, {
        firstName: addForm.firstName,
        lastName: addForm.lastName,
        email: addForm.email,
        role: addForm.role.toUpperCase(),
        phone: addForm.phone || undefined,
      });

      // Assigner les classes si c'est un professeur et qu'il y en a de sélectionnées
      if (addForm.role === "teacher" && addForm.selectedClassIds.length > 0) {
        const updated = await assignTeacherClasses(
          token,
          created.id,
          addForm.selectedClassIds,
          addForm.classAssignments,
        );
        setMembers((prev) => [...prev, mapMember(updated)]);
      } else {
        setMembers((prev) => [...prev, mapMember(created)]);
      }

      setIsAddDialogOpen(false);
      if (created.emailSent === false) {
        toast.warning("Membre ajouté — email non envoyé", {
          description: `${created.firstName} ${created.lastName} a été créé, mais l'email d'invitation n'a pas pu être envoyé. Vérifiez la configuration email et renvoyez l'invitation.`,
          duration: 8000,
        });
      } else {
        toast.success("Membre ajouté", {
          description: `${created.firstName} ${created.lastName} a rejoint l'équipe. Un email d'invitation lui a été envoyé.`,
        });
      }
    } catch (err) {
      toast.error("Erreur", {
        description:
          err instanceof Error ? err.message : "Impossible d'ajouter le membre",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmEdit = async () => {
    if (!selectedMember) return;
    const token = storage.getAuthItem("structura_token");
    if (!token) return;

    const isSelf = selectedMember.id === user?.id;
    const previousRole = selectedMember.role;
    const newRole = (editForm.role || previousRole) as RoleType;

    setIsSubmitting(true);
    try {
      const updated = await updateTeamMember(token, selectedMember.id, {
        firstName: editForm.firstName,
        lastName: editForm.lastName,
        phone: editForm.phone || undefined,
        // Ne pas envoyer role/isActive si on s'édite soi-même (backend le rejette)
        ...(!isSelf && { role: newRole.toUpperCase() }),
        ...(!isSelf && { isActive: editForm.isActive }),
      });
      // Note : le backend déassigne automatiquement les classes si le rôle change de TEACHER → autre.

      // Si le membre est (ou reste) un professeur, synchroniser ses classes.
      if (!isSelf && newRole === "teacher") {
        const withClasses = await assignTeacherClasses(
          token,
          selectedMember.id,
          editForm.selectedClassIds,
          editForm.classAssignments,
        );
        setMembers((prev) =>
          prev.map((m) => (m.id === selectedMember.id ? mapMember(withClasses) : m))
        );
      } else {
        setMembers((prev) =>
          prev.map((m) => (m.id === selectedMember.id ? mapMember(updated) : m))
        );
      }

      setIsEditDialogOpen(false);

      // Message contextuel si le rôle a changé et a provoqué une déassignation
      if (!isSelf && previousRole === "teacher" && newRole !== "teacher" && selectedMember.assignedClasses.length > 0) {
        toast.success("Membre modifié", {
          description: `${updated.firstName} ${updated.lastName} a été mis à jour. Ses classes ont été désassignées.`,
        });
      } else {
        toast.success("Membre modifié", {
          description: `${updated.firstName} ${updated.lastName} a été mis à jour.`,
        });
      }
    } catch (err) {
      toast.error("Erreur", {
        description:
          err instanceof Error ? err.message : "Impossible de modifier le membre",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmPermissions = async () => {
    if (!selectedMember || !editedPermissions) return;
    const token = storage.getAuthItem("structura_token");
    if (!token) return;

    setIsSubmitting(true);
    try {
      const updated = await updateMemberPermissions(token, selectedMember.id, editedPermissions);
      setMembers((prev) =>
        prev.map((m) => (m.id === selectedMember.id ? mapMember(updated) : m))
      );
      setIsPermissionsDialogOpen(false);
      toast.success("Permissions enregistrées", {
        description: `Les permissions de ${selectedMember.firstName} ${selectedMember.lastName} ont été mises à jour.`,
      });
    } catch (err) {
      toast.error("Erreur", {
        description:
          err instanceof Error ? err.message : "Impossible de sauvegarder les permissions",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!selectedMember) return;
    const token = storage.getAuthItem("structura_token");
    if (!token) return;

    setIsSubmitting(true);
    try {
      await deleteTeamMember(token, selectedMember.id);
      setMembers((prev) => prev.filter((m) => m.id !== selectedMember.id));
      setIsDeleteDialogOpen(false);
      toast.success("Membre supprimé", {
        description: `${selectedMember.firstName} ${selectedMember.lastName} a été retiré de l'équipe.`,
      });
    } catch (err) {
      toast.error("Erreur", {
        description:
          err instanceof Error
            ? err.message
            : "Impossible de supprimer le membre",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Rendu ────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Gestion de l&apos;Équipe</h1>
          <p className="text-muted-foreground mt-1">
            Gérez les membres de votre équipe et leurs permissions
          </p>
        </div>
        {isDirector && (
          <Button onClick={handleAdd} className="gap-2 shadow-md" size="lg">
            <Plus className="h-4 w-4" />
            Ajouter un membre
          </Button>
        )}
      </div>

      {/* Info Card */}
      <Card className="border-2 shadow-md bg-gradient-to-r from-blue-50 to-indigo-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Système de Permissions
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p><strong>Directeur :</strong> Accès complet à toutes les fonctionnalités</p>
          <p><strong>Comptable :</strong> Gère les paiements et rapports financiers</p>
          <p><strong>Professeur :</strong> Gère les présences et notes de ses classes assignées</p>
          <p><strong>Surveillant :</strong> Gère les présences et surveille les élèves</p>
          <p><strong>Secrétaire :</strong> Gère les élèves et enregistre les paiements</p>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-l-4 border-l-violet-500 shadow-md">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Membres
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{members.length}</div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-blue-500 shadow-md">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Professeurs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{teacherCount}</div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-emerald-500 shadow-md">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Actifs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeCount}</div>
          </CardContent>
        </Card>
      </div>

      {/* Liste */}
      <Card className="border-2 shadow-md">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-muted-foreground" />
                Liste des Membres
              </CardTitle>
              <CardDescription className="mt-1">
                {isLoading
                  ? "Chargement…"
                  : `${filteredMembers.length} membre${filteredMembers.length > 1 ? "s" : ""} trouvé${filteredMembers.length > 1 ? "s" : ""}`}
              </CardDescription>
            </div>
            {!isLoading && filteredMembers.length > 0 && (
              <button
                type="button"
                onClick={toggleAll}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
              >
                {allExpanded ? "Tout réduire" : "Tout développer"}
              </button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {/* Filtres */}
          <div className="flex flex-col gap-4 md:flex-row md:items-center mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher un membre…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 border-2"
              />
            </div>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-full md:w-[200px] border-2">
                <SelectValue placeholder="Filtrer par rôle" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les rôles</SelectItem>
                <SelectItem value="director">Directeur</SelectItem>
                <SelectItem value="accountant">Comptable</SelectItem>
                <SelectItem value="teacher">Professeur</SelectItem>
                <SelectItem value="supervisor">Surveillant</SelectItem>
                <SelectItem value="secretary">Secrétaire</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* État de chargement */}
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              Chargement de l&apos;équipe…
            </div>
          ) : filteredMembers.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              Aucun membre trouvé
            </div>
          ) : (
            <div className="space-y-2">
              {ROLE_ORDER
                .filter((r) => !!groupedMembers[r])
                .map((roleKey) => {
                  const isCollapsed = collapsedGroups.has(roleKey);
                  return (
                  <div key={roleKey} className="rounded-lg border overflow-hidden">
                    {/* ── En-tête de groupe cliquable ── */}
                    <button
                      type="button"
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 bg-muted/40 hover:bg-muted/70 transition-colors"
                      onClick={() => toggleGroup(roleKey)}
                    >
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex-1 text-left">
                        {ROLE_GROUP_LABELS[roleKey]}
                      </span>
                      <Badge variant="outline" className="text-xs h-5 px-1.5 rounded-full">
                        {groupedMembers[roleKey].length}
                      </Badge>
                      <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 ${isCollapsed ? "" : "rotate-180"}`} />
                    </button>

                    {/* ── Membres du groupe ── */}
                    {!isCollapsed && (
                    <div className="divide-y">
                      {groupedMembers[roleKey].map((member) => {
                        const isSelf = member.id === user?.id;
                        const hasCustomPermissions = member.permissions !== null;
                        return (
                          <div
                            key={member.id}
                            className="flex items-start gap-3 px-4 py-3 hover:bg-muted/20 transition-colors"
                          >
                            {/* Avatar */}
                            <Avatar className="h-9 w-9 shrink-0 mt-0.5">
                              <AvatarFallback className="text-sm font-semibold bg-primary/10 text-primary">
                                {getInitials(member.firstName, member.lastName)}
                              </AvatarFallback>
                            </Avatar>

                            {/* Contenu */}
                            <div className="flex-1 min-w-0 space-y-1">
                              {/* Ligne 1 : Nom + badges statut */}
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-semibold text-sm leading-tight">
                                  {member.firstName} {member.lastName}
                                  {isSelf && (
                                    <span className="text-muted-foreground font-normal ml-1 text-xs">(Vous)</span>
                                  )}
                                </span>
                                <Badge className={`${ROLE_COLORS[member.role]} text-xs py-0 h-5`}>
                                  {ROLE_LABELS[member.role]}
                                </Badge>
                                {member.isActive ? (
                                  <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs py-0 h-5">
                                    <CheckCircle2 className="h-2.5 w-2.5 mr-1" />Actif
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="text-muted-foreground text-xs py-0 h-5">
                                    <XCircle className="h-2.5 w-2.5 mr-1" />Inactif
                                  </Badge>
                                )}
                                {member.lastLoginAt === null && (
                                  <Badge variant="outline" className="text-orange-600 border-orange-300 bg-orange-50 text-xs py-0 h-5">
                                    <Clock className="h-2.5 w-2.5 mr-1" />En attente
                                  </Badge>
                                )}
                                {hasCustomPermissions && (
                                  <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50 text-xs py-0 h-5">
                                    <Shield className="h-2.5 w-2.5 mr-1" />Custom
                                  </Badge>
                                )}
                              </div>

                              {/* Ligne 2 : Email + téléphone */}
                              <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                                <span className="flex items-center gap-1">
                                  <Mail className="h-3 w-3 shrink-0" />
                                  {member.email}
                                </span>
                                {member.phone && (
                                  <span className="flex items-center gap-1">
                                    <Phone className="h-3 w-3 shrink-0" />
                                    {member.phone}
                                  </span>
                                )}
                              </div>

                              {/* Ligne 3 : Classes + matières (professeurs) */}
                              {member.role === "teacher" && member.assignedClasses.length > 0 && (
                                <div className="flex items-start gap-x-3 gap-y-1 flex-wrap mt-0.5">
                                  {member.assignedClasses.map((cls) => {
                                    const assignment = member.classAssignments.find((a) => a.classId === cls.id);
                                    return (
                                      <span key={cls.id} className="flex items-center gap-1 min-w-0">
                                        <Badge variant="outline" className="text-blue-700 border-blue-200 bg-blue-50 text-xs py-0 h-5 shrink-0">
                                          <BookOpen className="h-2.5 w-2.5 mr-1" />
                                          {classDisplayName(cls)}
                                        </Badge>
                                        {assignment && assignment.subjects.length > 0 && (
                                          <span className="text-xs text-muted-foreground truncate">
                                            {assignment.subjects.join(", ")}
                                          </span>
                                        )}
                                      </span>
                                    );
                                  })}
                                </div>
                              )}
                              {member.role === "teacher" && member.assignedClasses.length === 0 && (
                                <p className="text-xs text-amber-600">Aucune classe assignée</p>
                              )}

                              {/* Lien permissions */}
                              <Button
                                variant="link"
                                size="sm"
                                className="p-0 h-auto text-xs text-muted-foreground hover:text-primary"
                                onClick={() => handleViewPermissions(member)}
                              >
                                {isDirector && member.id !== user?.id
                                  ? "Modifier les permissions →"
                                  : "Voir les permissions →"}
                              </Button>
                            </div>

                            {/* Actions dropdown */}
                            {isDirector && !isSelf && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                                    <MoreVertical className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => handleEdit(member)}>
                                    <Edit2 className="h-4 w-4 mr-2" />
                                    Modifier
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => {
                                      const token = storage.getAuthItem("structura_token");
                                      if (!token) return;
                                      setIsSubmitting(true);
                                      updateTeamMember(token, member.id, {
                                        isActive: !member.isActive,
                                      })
                                        .then((updated) => {
                                          setMembers((prev) =>
                                            prev.map((m) =>
                                              m.id === member.id ? mapMember(updated) : m
                                            )
                                          );
                                          toast.success(
                                            member.isActive ? "Compte désactivé" : "Compte activé",
                                            {
                                              description: `${member.firstName} ${member.lastName} ${member.isActive ? "a été désactivé" : "a été réactivé"}.`,
                                            }
                                          );
                                        })
                                        .catch((err) =>
                                          toast.error("Erreur", {
                                            description:
                                              err instanceof Error ? err.message : "Action impossible",
                                          })
                                        )
                                        .finally(() => setIsSubmitting(false));
                                    }}
                                  >
                                    {member.isActive ? (
                                      <><UserX className="h-4 w-4 mr-2" />Désactiver</>
                                    ) : (
                                      <><UserCheck className="h-4 w-4 mr-2" />Activer</>
                                    )}
                                  </DropdownMenuItem>
                                  {member.lastLoginAt === null && (
                                    <DropdownMenuItem
                                      onClick={() => {
                                        const token = storage.getAuthItem("structura_token");
                                        if (!token) return;
                                        setIsSubmitting(true);
                                        resendMemberInvite(token, member.id)
                                          .then((res) => toast.success(res.message))
                                          .catch((err) => toast.error("Erreur", {
                                            description: err instanceof Error ? err.message : "Impossible de renvoyer l'invitation",
                                          }))
                                          .finally(() => setIsSubmitting(false));
                                      }}
                                    >
                                      <RefreshCw className="h-4 w-4 mr-2" />
                                      Renvoyer l&apos;invitation
                                    </DropdownMenuItem>
                                  )}
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onClick={() => handleDelete(member)}
                                    className="text-destructive"
                                  >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Supprimer
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    )}
                  </div>
                  );
                })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Dialog : Ajouter ─────────────────────────────────────────────────── */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Ajouter un Membre</DialogTitle>
            <DialogDescription>
              Un email avec ses identifiants temporaires lui sera envoyé automatiquement.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="add-firstName">Prénom *</Label>
                <Input
                  id="add-firstName"
                  value={addForm.firstName}
                  onChange={(e) => setAddForm({ ...addForm, firstName: e.target.value })}
                  placeholder="Ex: Aissatou"
                  className="border-2"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="add-lastName">Nom *</Label>
                <Input
                  id="add-lastName"
                  value={addForm.lastName}
                  onChange={(e) => setAddForm({ ...addForm, lastName: e.target.value })}
                  placeholder="Ex: Diallo"
                  className="border-2"
                />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="add-email">Email *</Label>
                <Input
                  id="add-email"
                  type="email"
                  value={addForm.email}
                  onChange={(e) => setAddForm({ ...addForm, email: e.target.value })}
                  placeholder="aissatou@ecole.gn"
                  className="border-2"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="add-phone">Téléphone</Label>
                <Input
                  id="add-phone"
                  type="tel"
                  value={addForm.phone}
                  onChange={(e) => setAddForm({ ...addForm, phone: e.target.value })}
                  placeholder="+224 621 234 567"
                  className="border-2"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="add-role">Rôle *</Label>
              <Select
                value={addForm.role}
                onValueChange={(v) => setAddForm({ ...addForm, role: v as RoleType, selectedClassIds: [], classAssignments: [] })}
              >
                <SelectTrigger className="border-2">
                  <SelectValue placeholder="Sélectionnez un rôle" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="teacher">Professeur</SelectItem>
                  <SelectItem value="accountant">Comptable</SelectItem>
                  <SelectItem value="supervisor">Surveillant</SelectItem>
                  <SelectItem value="secretary">Secrétaire</SelectItem>
                </SelectContent>
              </Select>
              {addForm.role && (
                <p className="text-sm text-muted-foreground">
                  {ROLE_DESCRIPTIONS[addForm.role as RoleType]}
                </p>
              )}
            </div>

            {/* Assignation classes + matières — visible si role = teacher */}
            {addForm.role === "teacher" && (
              <div className="space-y-3">
                <Label className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-blue-500" />
                  Classes et matières enseignées
                  <span className="text-xs text-muted-foreground font-normal">(optionnel)</span>
                </Label>
                {availableClasses.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Aucune classe disponible</p>
                ) : (
                  <div className="border-2 rounded-md divide-y max-h-64 overflow-y-auto">
                    {availableClasses.map((cls) => {
                      const isChecked = addForm.selectedClassIds.includes(cls.id);
                      const assignment = addForm.classAssignments.find((a) => a.classId === cls.id);
                      const dbSubjects = classSubjectsMap[cls.id] ?? [];
                      return (
                        <div key={cls.id} className="p-3 space-y-2">
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id={`add-class-${cls.id}`}
                              checked={isChecked}
                              onCheckedChange={() => toggleAddClass(cls)}
                            />
                            <Label htmlFor={`add-class-${cls.id}`} className="cursor-pointer font-medium">
                              {classDisplayName(cls)}
                              <span className="ml-2 text-xs text-muted-foreground font-normal">{cls.level}</span>
                            </Label>
                            {dbSubjects.length === 0 && (
                              <span className="text-xs text-amber-600 flex items-center gap-1 ml-1">
                                <AlertCircle className="h-3 w-3 shrink-0" />
                                Matières non configurées
                              </span>
                            )}
                          </div>
                          {isChecked && dbSubjects.length === 0 && (
                            <p className="ml-6 text-xs text-amber-600">
                              Configurez d&apos;abord les matières dans la page <strong>Notes</strong> pour pouvoir affiner l&apos;accès.
                            </p>
                          )}
                          {isChecked && assignment && dbSubjects.length > 0 && (
                            <div className="ml-6 flex flex-wrap gap-1.5">
                              {dbSubjects.map((subject) => {
                                const selected = assignment.subjects.includes(subject);
                                return (
                                  <button
                                    key={subject}
                                    type="button"
                                    onClick={() => toggleAddSubject(cls.id, subject)}
                                    className={`px-2 py-0.5 rounded-full text-xs border transition-colors ${
                                      selected
                                        ? "bg-blue-100 border-blue-400 text-blue-700 font-medium"
                                        : "bg-muted border-border text-muted-foreground hover:bg-blue-50"
                                    }`}
                                  >
                                    {subject}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                {addForm.selectedClassIds.length > 0 && addForm.selectedClassIds.some((id) => (classSubjectsMap[id] ?? []).length > 0) && (
                  <p className="text-xs text-blue-600">
                    {addForm.selectedClassIds.length} classe{addForm.selectedClassIds.length > 1 ? "s" : ""} — cliquez sur les matières pour affiner l&apos;accès
                  </p>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsAddDialogOpen(false)}
              disabled={isSubmitting}
              className="border-2"
            >
              Annuler
            </Button>
            <Button
              onClick={confirmAdd}
              disabled={
                isSubmitting ||
                !addForm.firstName ||
                !addForm.lastName ||
                !addForm.email ||
                !addForm.role
              }
              className="shadow-md"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Ajout…
                </>
              ) : (
                "Ajouter le membre"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog : Modifier ────────────────────────────────────────────────── */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Modifier le Membre</DialogTitle>
            <DialogDescription>
              {selectedMember?.email}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="edit-firstName">Prénom</Label>
                <Input
                  id="edit-firstName"
                  value={editForm.firstName}
                  onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })}
                  className="border-2"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-lastName">Nom</Label>
                <Input
                  id="edit-lastName"
                  value={editForm.lastName}
                  onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })}
                  className="border-2"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-phone">Téléphone</Label>
              <Input
                id="edit-phone"
                type="tel"
                value={editForm.phone}
                onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                placeholder="+224 621 234 567"
                className="border-2"
              />
            </div>
            {/* Rôle — pas modifiable sur soi-même */}
            {selectedMember?.id !== user?.id && (
              <div className="space-y-2">
                <Label htmlFor="edit-role">Rôle</Label>
                <Select
                  value={editForm.role}
                  onValueChange={(v) => setEditForm({ ...editForm, role: v as RoleType, selectedClassIds: [], classAssignments: [] })}
                >
                  <SelectTrigger className="border-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="teacher">Professeur</SelectItem>
                    <SelectItem value="accountant">Comptable</SelectItem>
                    <SelectItem value="supervisor">Surveillant</SelectItem>
                    <SelectItem value="secretary">Secrétaire</SelectItem>
                  </SelectContent>
                </Select>
                {/* Avertissement si le rôle change depuis teacher et que des classes sont assignées */}
                {selectedMember?.role === "teacher" &&
                  editForm.role !== "teacher" &&
                  (selectedMember?.assignedClasses?.length ?? 0) > 0 && (
                  <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
                    <span className="mt-0.5 text-amber-600 text-xs">⚠</span>
                    <p className="text-xs text-amber-700">
                      <strong>Attention :</strong> les{" "}
                      {selectedMember.assignedClasses.length} classe
                      {selectedMember.assignedClasses.length > 1 ? "s" : ""} actuellement assignée
                      {selectedMember.assignedClasses.length > 1 ? "s" : ""} seront automatiquement désassignées lors de la sauvegarde.
                    </p>
                  </div>
                )}
              </div>
            )}
            {/* Statut actif — pas modifiable sur soi-même */}
            {selectedMember?.id !== user?.id && (
              <div className="flex items-center justify-between rounded-lg border-2 p-4">
                <div>
                  <p className="font-medium text-sm">Compte actif</p>
                  <p className="text-xs text-muted-foreground">
                    Un compte inactif ne peut plus se connecter
                  </p>
                </div>
                <Switch
                  checked={editForm.isActive}
                  onCheckedChange={(v) => setEditForm({ ...editForm, isActive: v })}
                />
              </div>
            )}

            {/* Assignation classes + matières — visible si role = teacher et pas soi-même */}
            {selectedMember?.id !== user?.id && editForm.role === "teacher" && (
              <div className="space-y-3">
                <Label className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-blue-500" />
                  Classes et matières enseignées
                </Label>
                {availableClasses.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Aucune classe disponible</p>
                ) : (
                  <div className="border-2 rounded-md divide-y max-h-64 overflow-y-auto">
                    {availableClasses.map((cls) => {
                      const isChecked = editForm.selectedClassIds.includes(cls.id);
                      const assignment = editForm.classAssignments.find((a) => a.classId === cls.id);
                      const dbSubjects = classSubjectsMap[cls.id] ?? [];
                      return (
                        <div key={cls.id} className="p-3 space-y-2">
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id={`edit-class-${cls.id}`}
                              checked={isChecked}
                              onCheckedChange={() => toggleEditClass(cls)}
                            />
                            <Label htmlFor={`edit-class-${cls.id}`} className="cursor-pointer font-medium">
                              {classDisplayName(cls)}
                              <span className="ml-2 text-xs text-muted-foreground font-normal">{cls.level}</span>
                            </Label>
                            {dbSubjects.length === 0 && (
                              <span className="text-xs text-amber-600 flex items-center gap-1 ml-1">
                                <AlertCircle className="h-3 w-3 shrink-0" />
                                Matières non configurées
                              </span>
                            )}
                          </div>
                          {isChecked && dbSubjects.length === 0 && (
                            <p className="ml-6 text-xs text-amber-600">
                              Configurez d&apos;abord les matières dans la page <strong>Notes</strong> pour pouvoir affiner l&apos;accès.
                            </p>
                          )}
                          {isChecked && assignment && dbSubjects.length > 0 && (
                            <div className="ml-6 flex flex-wrap gap-1.5">
                              {dbSubjects.map((subject) => {
                                const selected = assignment.subjects.includes(subject);
                                return (
                                  <button
                                    key={subject}
                                    type="button"
                                    onClick={() => toggleEditSubject(cls.id, subject)}
                                    className={`px-2 py-0.5 rounded-full text-xs border transition-colors ${
                                      selected
                                        ? "bg-blue-100 border-blue-400 text-blue-700 font-medium"
                                        : "bg-muted border-border text-muted-foreground hover:bg-blue-50"
                                    }`}
                                  >
                                    {subject}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                {editForm.selectedClassIds.length > 0 && editForm.selectedClassIds.some((id) => (classSubjectsMap[id] ?? []).length > 0) && (
                  <p className="text-xs text-blue-600">
                    {editForm.selectedClassIds.length} classe{editForm.selectedClassIds.length > 1 ? "s" : ""} — cliquez sur les matières pour affiner l&apos;accès
                  </p>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsEditDialogOpen(false)}
              disabled={isSubmitting}
              className="border-2"
            >
              Annuler
            </Button>
            <Button
              onClick={confirmEdit}
              disabled={isSubmitting}
              className="shadow-md"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Enregistrement…
                </>
              ) : (
                "Enregistrer"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog : Supprimer ───────────────────────────────────────────────── */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supprimer le Membre</DialogTitle>
            <DialogDescription>
              Êtes-vous sûr de vouloir supprimer{" "}
              <span className="font-semibold">
                {selectedMember?.firstName} {selectedMember?.lastName}
              </span>{" "}
              de l&apos;équipe ? Cette action est irréversible.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDeleteDialogOpen(false)}
              disabled={isSubmitting}
              className="border-2"
            >
              Annuler
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Suppression…
                </>
              ) : (
                "Supprimer"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog : Permissions (éditable pour le directeur) ───────────────── */}
      <Dialog
        open={isPermissionsDialogOpen}
        onOpenChange={setIsPermissionsDialogOpen}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Permissions de {selectedMember?.firstName} {selectedMember?.lastName}
            </DialogTitle>
            <DialogDescription>
              {selectedMember && ROLE_DESCRIPTIONS[selectedMember.role]}
              {selectedMember?.permissions && (
                <span className="ml-2 text-amber-600 font-medium">• Permissions personnalisées actives</span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {selectedMember && editedPermissions && (
              <PermissionsEditor
                permissions={editedPermissions}
                onChange={setEditedPermissions}
                readOnly={!isDirector || selectedMember.id === user?.id}
              />
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsPermissionsDialogOpen(false)}
              disabled={isSubmitting}
              className="border-2"
            >
              {isDirector && selectedMember?.id !== user?.id ? "Annuler" : "Fermer"}
            </Button>
            {isDirector && selectedMember?.id !== user?.id && (
              <Button
                onClick={confirmPermissions}
                disabled={isSubmitting}
                className="shadow-md"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Enregistrement…
                  </>
                ) : (
                  "Enregistrer les permissions"
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
