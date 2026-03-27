"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Users,
  GraduationCap,
  UserPlus,
  Search,
  Loader2,
  Download,
  MoreVertical,
  Eye,
  Edit2,
  Trash2,
  RefreshCw,
  WifiOff,
  Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
import { toast } from "sonner";
import { useOnline } from "@/hooks/use-online";
import { useAuth } from "@/contexts/AuthContext";
import * as storage from "@/lib/storage";
import { getClassById } from "@/lib/api/classes.service";
import { getStudents, deleteStudent } from "@/lib/api/students.service";
import { exportStudentsToXLSX } from "@/lib/csv-handler";
import { formatClassName } from "@/lib/class-helpers";
import { isDirectorLevel } from "@/lib/is-director";
import { EditClassDialog } from "@/components/classes/EditClassDialog";

interface Student {
  id: string;
  name: string;
  matricule: string;
  gender?: string;
  parentName?: string;
  parentPhone?: string;
  paymentStatus?: string;
  status?: string;
}

interface ClassDetail {
  id: string;
  name: string;
  section?: string | null;
  level: string;
  capacity: number;
  teacherName?: string;
  studentCount?: number;
}

const PAYMENT_CONFIG = {
  paid:    { label: "À jour",     className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  pending: { label: "En attente", className: "bg-amber-50 text-amber-700 border-amber-200" },
  late:    { label: "En retard",  className: "bg-red-50 text-red-700 border-red-200" },
} as const;

export default function ClassDetailPage() {
  const params = useParams();
  const router = useRouter();
  const isOnline = useOnline();
  const classId = params.id as string;

  const { user } = useAuth();
  const isDirector = isDirectorLevel(user);
  const canViewPayments = isDirectorLevel(user) || user?.role === 'accountant' || user?.role === 'secretary';

  const [classData, setClassData] = useState<ClassDetail | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [studentToDelete, setStudentToDelete] = useState<Student | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    const token = storage.getAuthItem("structura_token");
    if (!token) {
      toast.error("Session expirée");
      router.push("/login");
      return;
    }

    try {
      const [classResponse, studentsResponse] = await Promise.all([
        getClassById(token, classId),
        getStudents(token, { classId }),
      ]);

      setClassData({
        id: classResponse.id,
        name: classResponse.name,
        section: classResponse.section,
        level: classResponse.level,
        capacity: classResponse.capacity || 30,
        teacherName: classResponse.teacherName,
        studentCount: classResponse.studentCount,
      });

      const studentsData = Array.isArray(studentsResponse)
        ? studentsResponse
        : (studentsResponse as any).students || [];

      const mapped: Student[] = studentsData.map((s: any) => ({
        id: s.id,
        name: `${s.firstName || ""} ${s.lastName || ""}`.trim(),
        matricule: s.matricule || "",
        gender: s.gender || "",
        parentName: s.parentName || "",
        parentPhone: s.parentPhone || "",
        paymentStatus: s.paymentStatus?.toLowerCase() || "pending",
        status: s.status?.toLowerCase() || "active",
      }));

      setStudents(mapped);
    } catch (error: any) {
      toast.error(error.message || "Impossible de charger les données de la classe");
    } finally {
      setIsLoading(false);
    }
  }, [classId, router]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleDeleteStudent = async () => {
    if (!studentToDelete) return;
    setIsDeleting(true);
    const token = storage.getAuthItem("structura_token");

    try {
      if (!token) throw new Error("Session expirée");
      await deleteStudent(token, studentToDelete.id);
      toast.success(`${studentToDelete.name} supprimé(e) de la classe`);
      setStudentToDelete(null);
      await loadData();
    } catch (error: any) {
      toast.error(error.message || "Erreur lors de la suppression");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleExport = async () => {
    if (filteredStudents.length === 0) {
      toast.error("Aucun élève à exporter");
      return;
    }
    const cn = classData ? formatClassName(classData.name, classData.section) : "classe";
    const className = classData?.name ?? cn;
    // Reconstruire le format attendu par exportStudentsToXLSX
    const rawStudents = filteredStudents.map((s) => {
      const parts = s.name.trim().split(" ");
      const lastName  = parts.length > 1 ? parts[parts.length - 1] : parts[0];
      const firstName = parts.length > 1 ? parts.slice(0, -1).join(" ") : "";
      return {
        ...s,
        firstName,
        lastName,
        class: { name: className },
      };
    });
    await exportStudentsToXLSX(
      rawStudents,
      `eleves_${cn.replace(/[\s()]/g, "_")}_${new Date().toISOString().split("T")[0]}`,
    );
  };

  // Filtrage : recherche + statut paiement
  const filteredStudents = students.filter((s) => {
    const matchesSearch =
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.matricule.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesPayment = paymentFilter === "all" || s.paymentStatus === paymentFilter;
    return matchesSearch && matchesPayment;
  });

  // Stats
  const studentCount = students.length;
  const capacity = classData?.capacity || 1;
  const occupancyPct = Math.min(Math.round((studentCount / capacity) * 100), 100);
  const isFull = studentCount >= capacity;
  const isAlmost = occupancyPct >= 90;
  const maleCount = students.filter((s) => s.gender === "M").length;
  const femaleCount = students.filter((s) => s.gender === "F").length;
  const paidCount = students.filter((s) => s.paymentStatus === "paid").length;
  const pendingCount = students.filter((s) => s.paymentStatus === "pending").length;
  const lateCount = students.filter((s) => s.paymentStatus === "late").length;

  // ── Loading ──
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Chargement de la classe...</p>
        </div>
      </div>
    );
  }

  if (!classData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <p className="text-muted-foreground">Classe introuvable</p>
        <Button variant="outline" asChild>
          <Link href="/dashboard/classes">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Retour aux classes
          </Link>
        </Button>
      </div>
    );
  }

  const className = formatClassName(classData.name, classData.section);

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" asChild className="mt-0.5 flex-shrink-0">
            <Link href="/dashboard/classes">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{className}</h1>
              <Badge variant="outline" className="capitalize">{classData.level}</Badge>
            </div>
            <p className="text-muted-foreground text-sm mt-0.5">
              {classData.teacherName
                ? `Enseignant : ${classData.teacherName}`
                : "Aucun enseignant assigné"}
            </p>
            {!isOnline && (
              <Badge variant="outline" className="mt-2 bg-amber-50 text-amber-700 border-amber-200 text-xs">
                <WifiOff className="h-3 w-3 mr-1" />
                Mode hors ligne
              </Badge>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap pl-12 sm:pl-0">
          <Button variant="outline" size="sm" onClick={loadData} className="gap-1.5">
            <RefreshCw className="h-4 w-4" />
            <span className="hidden sm:inline">Actualiser</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={students.length === 0}
            className="gap-1.5"
          >
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Exporter</span>
          </Button>
          {isDirector && (
            <EditClassDialog
              classItem={{
                id: classData.id,
                name: classData.name,
                level: classData.level,
                section: classData.section,
                capacity: classData.capacity,
                studentCount: studentCount,
                teacherName: classData.teacherName,
              }}
              onSuccess={loadData}
            />
          )}
          <Button size="sm" asChild className="gap-1.5">
            <Link href={`/dashboard/students/add?classId=${classId}`}>
              <UserPlus className="h-4 w-4" />
              <span>Ajouter</span>
            </Link>
          </Button>
        </div>
      </div>

      {/* ── Stats occupation ── */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card className="col-span-2 border-l-4 border-l-blue-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Users className="h-4 w-4" />
              Occupation
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between mb-2">
              <span className={`text-2xl font-bold ${isFull ? "text-red-600" : isAlmost ? "text-orange-600" : ""}`}>
                {studentCount}
                <span className="text-base font-normal text-muted-foreground"> / {capacity}</span>
              </span>
              <span className={`text-sm font-semibold ${isFull ? "text-red-600" : isAlmost ? "text-orange-600" : "text-emerald-600"}`}>
                {occupancyPct}%
              </span>
            </div>
            <Progress
              value={occupancyPct}
              className={`h-2 ${isFull ? "[&>div]:bg-red-500" : isAlmost ? "[&>div]:bg-orange-400" : "[&>div]:bg-emerald-500"}`}
            />
            {isFull && (
              <p className="text-xs text-red-600 font-medium mt-1">Classe pleine — plus de places disponibles</p>
            )}
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-blue-400">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">♂ Garçons</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-700">{maleCount}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {studentCount > 0 ? `${Math.round((maleCount / studentCount) * 100)}%` : "—"}
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-pink-400">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">♀ Filles</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-pink-700">{femaleCount}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {studentCount > 0 ? `${Math.round((femaleCount / studentCount) * 100)}%` : "—"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ── Résumé paiements — directeur/comptable/secrétaire uniquement ── */}
      {canViewPayments && (
        <div className="grid grid-cols-3 gap-3">
          <div className="flex items-center gap-2.5 rounded-lg border px-4 py-3 bg-emerald-50/50">
            <div className="h-2.5 w-2.5 rounded-full bg-emerald-500 flex-shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">À jour</p>
              <p className="text-lg font-bold text-emerald-700">{paidCount}</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 rounded-lg border px-4 py-3 bg-amber-50/50">
            <div className="h-2.5 w-2.5 rounded-full bg-amber-500 flex-shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">En attente</p>
              <p className="text-lg font-bold text-amber-700">{pendingCount}</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 rounded-lg border px-4 py-3 bg-red-50/50">
            <div className="h-2.5 w-2.5 rounded-full bg-red-500 flex-shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">En retard</p>
              <p className="text-lg font-bold text-red-700">{lateCount}</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Liste élèves ── */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <GraduationCap className="h-5 w-5" />
                Élèves de la classe
              </CardTitle>
              <CardDescription className="mt-1">
                {filteredStudents.length} élève{filteredStudents.length !== 1 ? "s" : ""}
                {(searchQuery || paymentFilter !== "all") && " (filtrés)"}
              </CardDescription>
            </div>
          </div>

          {/* Filtres */}
          <div className="flex flex-col sm:flex-row gap-3 mt-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher par nom ou matricule..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            {canViewPayments && (
              <Select value={paymentFilter} onValueChange={setPaymentFilter}>
                <SelectTrigger className="w-full sm:w-52">
                  <Filter className="h-4 w-4 mr-2 text-muted-foreground" />
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
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {filteredStudents.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">
              {students.length === 0 ? (
                <div className="space-y-3">
                  <GraduationCap className="h-10 w-10 mx-auto opacity-30" />
                  <p className="text-sm">Aucun élève dans cette classe</p>
                  <Button size="sm" asChild className="gap-2">
                    <Link href={`/dashboard/students/add?classId=${classId}`}>
                      <UserPlus className="h-4 w-4" />
                      Ajouter le premier élève
                    </Link>
                  </Button>
                </div>
              ) : (
                <p className="text-sm">
                  Aucun résultat pour « {searchQuery || paymentFilter} »
                </p>
              )}
            </div>
          ) : (
            <>
              {/* ── Vue Desktop ── */}
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Élève</TableHead>
                      <TableHead>Matricule</TableHead>
                      <TableHead>Genre</TableHead>
                      <TableHead>Parent</TableHead>
                      {canViewPayments && <TableHead>Paiement</TableHead>}
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredStudents.map((student) => {
                      const initials = student.name
                        .split(" ")
                        .map((n) => n[0])
                        .join("")
                        .toUpperCase()
                        .slice(0, 2);
                      const payment =
                        PAYMENT_CONFIG[student.paymentStatus as keyof typeof PAYMENT_CONFIG] ??
                        PAYMENT_CONFIG.pending;

                      return (
                        <TableRow key={student.id} className="group hover:bg-muted/50">
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <Avatar className="h-8 w-8">
                                <AvatarFallback className="text-xs bg-primary/10 text-primary font-semibold">
                                  {initials}
                                </AvatarFallback>
                              </Avatar>
                              <span className="font-medium">{student.name}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground font-mono text-sm">
                            {student.matricule}
                          </TableCell>
                          <TableCell>
                            {student.gender === "M" ? (
                              <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-xs">
                                ♂ Garçon
                              </Badge>
                            ) : student.gender === "F" ? (
                              <Badge variant="outline" className="bg-pink-50 text-pink-700 border-pink-200 text-xs">
                                ♀ Fille
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">
                              <p className="font-medium">{student.parentName || "—"}</p>
                              {student.parentPhone && (
                                <p className="text-muted-foreground text-xs">{student.parentPhone}</p>
                              )}
                            </div>
                          </TableCell>
                          {canViewPayments && (
                            <TableCell>
                              <Badge variant="outline" className={`text-xs ${payment.className}`}>
                                {payment.label}
                              </Badge>
                            </TableCell>
                          )}
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                                <Link href={`/dashboard/students/${student.id}`}>
                                  <Eye className="h-4 w-4" />
                                </Link>
                              </Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                                <Link href={`/dashboard/students/${student.id}/edit`}>
                                  <Edit2 className="h-4 w-4" />
                                </Link>
                              </Button>
                              {isDirector && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                  onClick={() => setStudentToDelete(student)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* ── Vue Mobile ── */}
              <div className="md:hidden divide-y">
                {filteredStudents.map((student) => {
                  const initials = student.name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .toUpperCase()
                    .slice(0, 2);
                  const payment =
                    PAYMENT_CONFIG[student.paymentStatus as keyof typeof PAYMENT_CONFIG] ??
                    PAYMENT_CONFIG.pending;

                  return (
                    <div key={student.id} className="p-4 flex items-center gap-3">
                      <Avatar className="h-10 w-10 shrink-0">
                        <AvatarFallback className="text-sm bg-primary/10 text-primary font-semibold">
                          {initials}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{student.name}</p>
                        <p className="text-xs text-muted-foreground font-mono">{student.matricule}</p>
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          {canViewPayments && (
                            <Badge variant="outline" className={`text-xs ${payment.className}`}>
                              {payment.label}
                            </Badge>
                          )}
                          {student.gender && (
                            <span className="text-xs text-muted-foreground">
                              {student.gender === "M" ? "♂ Garçon" : "♀ Fille"}
                            </span>
                          )}
                        </div>
                        {student.parentName && (
                          <p className="text-xs text-muted-foreground mt-1 truncate">
                            Parent : {student.parentName}
                            {student.parentPhone && ` · ${student.parentPhone}`}
                          </p>
                        )}
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuItem asChild>
                            <Link href={`/dashboard/students/${student.id}`} className="flex items-center cursor-pointer">
                              <Eye className="h-4 w-4 mr-2" /> Voir le profil
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link href={`/dashboard/students/${student.id}/edit`} className="flex items-center cursor-pointer">
                              <Edit2 className="h-4 w-4 mr-2" /> Modifier
                            </Link>
                          </DropdownMenuItem>
                          {isDirector && (
                            <DropdownMenuItem
                              onClick={() => setStudentToDelete(student)}
                              className="text-destructive focus:text-destructive focus:bg-destructive/10 cursor-pointer"
                            >
                              <Trash2 className="h-4 w-4 mr-2" /> Supprimer
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Dialog suppression élève ── */}
      <AlertDialog
        open={!!studentToDelete}
        onOpenChange={(open) => !open && setStudentToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cet élève ?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-semibold">{studentToDelete?.name}</span> sera définitivement
              supprimé(e) de la classe <span className="font-semibold">{className}</span>.
              Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteStudent}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700 text-white border-2 border-red-600"
            >
              {isDeleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
