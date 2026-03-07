"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Edit2,
  Phone,
  Calendar,
  User,
  GraduationCap,
  CreditCard,
  FileText,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertCircle,
  FileDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import * as storage from "@/lib/storage";
import { getStudentById } from "@/lib/api/students.service";
import { formatClassName } from "@/lib/class-helpers";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/hooks/use-subscription";
import { generatePaymentReceipt } from "@/lib/pdf-generator";
import { UpgradeBadge } from "@/components/shared/UpgradeBadge";

// ─── Helpers ────────────────────────────────────────────────────────────────

function methodLabel(method: string): string {
  const map: Record<string, string> = {
    CASH: "Espèces", cash: "Espèces",
    MOBILE_MONEY: "Mobile Money", mobile_money: "Mobile Money",
    BANK_TRANSFER: "Virement", bank_transfer: "Virement",
    CHECK: "Chèque", check: "Chèque",
  };
  return map[method] || method;
}

/** Détecte le type de paiement depuis le champ term */
function detectPaymentType(term?: string): "mensuel" | "trimestriel" | "annuel" {
  if (!term) return "mensuel";
  const t = term.toLowerCase();
  if (t.includes("trimestre") || t.includes("t1") || t.includes("t2") || t.includes("t3")) return "trimestriel";
  if (t.includes("annuel") || t.includes("année") || t.includes("annual")) return "annuel";
  return "mensuel";
}

/** Retourne un label lisible pour le type de paiement */
function paymentTypeLabel(type: "mensuel" | "trimestriel" | "annuel"): string {
  return { mensuel: "Mensuel", trimestriel: "Trimestriel", annuel: "Annuel" }[type];
}

/** Badge coloré selon le type */
function PaymentTypeBadge({ term }: { term?: string }) {
  const type = detectPaymentType(term);
  const styles = {
    mensuel: "bg-blue-500/10 text-blue-700",
    trimestriel: "bg-violet-500/10 text-violet-700",
    annuel: "bg-emerald-500/10 text-emerald-700",
  };
  return (
    <Badge className={`${styles[type]} border-0 text-xs`}>
      {paymentTypeLabel(type)}
    </Badge>
  );
}

/** Vérifie si un paiement est considéré "payé" */
function isPaid(status: string): boolean {
  return ["paid", "PAID", "partial", "PARTIAL"].includes(status);
}

export default function StudentProfilePage() {
  const params = useParams();
  const router = useRouter();
  const studentId = params.id as string;
  const { user } = useAuth();
  const { hasFeature } = useSubscription();
  const hasBulletins = hasFeature('bulletins');

  const [student, setStudent] = useState<any>(null);
  const [payments, setPayments] = useState<any[]>([]);
  const [attendances, setAttendances] = useState<any[]>([]);
  const [grades, setGrades] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => { loadStudent(); }, [studentId]);

  async function loadStudent() {
    setIsLoading(true);
    const token = storage.getAuthItem("structura_token");
    try {
      if (!token) { toast.error("Session expirée"); router.push("/login"); return; }

      const data: any = await getStudentById(token, studentId);
      if (!data) { toast.error("Élève non trouvé"); router.push("/dashboard/students"); return; }

      setStudent({
        id: data.id,
        name: `${data.firstName || ""} ${data.lastName || ""}`.trim(),
        firstName: data.firstName || "",
        lastName: data.lastName || "",
        matricule: data.matricule,
        class: data.class ? formatClassName(data.class.name, data.class.section) : data.classId || "",
        status: data.status?.toLowerCase() || "active",
        dateOfBirth: data.dateOfBirth || null,
        gender: data.gender || null,
        address: data.address || null,
        parentName: data.parentName || "",
        parentPhone: data.parentPhone || "",
        parentEmail: data.parentEmail || null,
        parentProfession: data.parentProfession || null,
        // Utilise le paymentStatus recalculé depuis le backend (qui inclut les vrais paiements)
        paymentStatus: data.paymentStatus?.toLowerCase() || "pending",
        lastPaidTerm: data.lastPaidTerm || null,
      });

      setPayments(data.payments || []);
      // Normaliser les statuts en minuscules (le backend stocke PRESENT/ABSENT/LATE/EXCUSED)
      setAttendances(
        (data.attendances || []).map((a: any) => ({
          ...a,
          status: typeof a.status === "string" ? a.status.toLowerCase() : a.status,
        }))
      );
      setGrades(data.grades || []);
    } catch (error: any) {
      console.error("Erreur chargement élève:", error);
      toast.error("Impossible de charger les informations");
      router.push("/dashboard/students");
    } finally {
      setIsLoading(false);
    }
  }

  const getInitials = (name: string) => {
    const parts = name.split(" ");
    return `${parts[0]?.charAt(0)}${parts[1]?.charAt(0) || ""}`.toUpperCase();
  };

  // ─── Calculs depuis les vrais paiements ─────────────────────────────────────

  // Statut effectif calculé depuis les paiements réels (priorité sur le champ DB)
  const paidPayments = payments.filter((p) => isPaid(p.status));
  const effectivePaymentStatus = paidPayments.length > 0 ? "paid" : (student?.paymentStatus || "pending");

  // Dernier paiement réussi
  const lastPaidPayment = paidPayments[0] || null;

  // Total encaissé
  const totalPaid = paidPayments.reduce((sum, p) => sum + (p.amount || 0), 0);

  // Vérifier si le mois en cours est couvert
  const now = new Date();
  const hasCurrentMonthPayment = payments.some((p) => {
    const d = p.paidDate ? new Date(p.paidDate) : new Date(p.createdAt);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });

  // Mois en cours en français
  const currentMonthLabel = now.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });

  // ─── Présences ─────────────────────────────────────────────────────────────

  const totalAttendances = attendances.length;
  const presentCount = attendances.filter((a) => a.status === "present").length;
  const absentCount = attendances.filter((a) => a.status === "absent").length;
  const lateCount = attendances.filter((a) => a.status === "late").length;
  const attendanceRate = totalAttendances > 0
    ? ((presentCount / totalAttendances) * 100).toFixed(0)
    : "0";

  // ─── Notes ─────────────────────────────────────────────────────────────────

  const gradesByTerm = grades.reduce((acc: Record<string, any[]>, g) => {
    const key = g.term || "Non défini";
    if (!acc[key]) acc[key] = [];
    acc[key].push(g);
    return acc;
  }, {});

  const latestTerm = Object.keys(gradesByTerm)[0];
  const latestGrades = latestTerm ? gradesByTerm[latestTerm] : [];
  const generalAverage = latestGrades.length > 0
    ? (latestGrades.reduce((sum, g) => sum + (g.score / (g.maxScore || 20)) * 20, 0) / latestGrades.length).toFixed(1)
    : null;

  // ─── Badge paiement ─────────────────────────────────────────────────────────

  const getPaymentBadge = (status: string) => {
    const s = status?.toLowerCase();
    if (s === "paid") return <Badge className="bg-emerald-500/10 text-emerald-700 border-0">À jour</Badge>;
    if (s === "partial") return <Badge className="bg-blue-500/10 text-blue-700 border-0">Partiel</Badge>;
    if (s === "late" || s === "overdue") return <Badge className="bg-red-500/10 text-red-700 border-0">En retard</Badge>;
    return <Badge className="bg-amber-500/10 text-amber-700 border-0">En attente</Badge>;
  };

  // ─── Loading / Guard ────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary mb-4" />
          <p className="text-muted-foreground">Chargement du profil...</p>
        </div>
      </div>
    );
  }

  if (!student) return null;

  return (
    <div className="space-y-6">
      {/* ─── Header ─── */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push("/dashboard/students")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-3xl font-bold tracking-tight">Profil de l'élève</h1>
          <p className="text-muted-foreground mt-1">Informations détaillées et historique</p>
        </div>
        <Button asChild>
          <Link href={`/dashboard/students/${studentId}/edit`}>
            <Edit2 className="h-4 w-4 mr-2" />
            Modifier
          </Link>
        </Button>
      </div>

      {/* ─── Carte de profil ─── */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-6">
            <div className="shrink-0">
              <Avatar className="h-32 w-32">
                <AvatarFallback className="bg-primary/10 text-primary text-3xl font-bold">
                  {getInitials(student.name)}
                </AvatarFallback>
              </Avatar>
            </div>

            <div className="flex-1 space-y-4">
              <div>
                <h2 className="text-2xl font-bold">{student.name}</h2>
                <p className="text-muted-foreground">Matricule : {student.matricule}</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-center gap-2 text-sm">
                  <GraduationCap className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-muted-foreground">Classe :</span>
                  <Badge variant="outline">{student.class}</Badge>
                </div>

                {/* Statut paiement enrichi */}
                <div className="flex items-start gap-2 text-sm">
                  <CreditCard className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-muted-foreground">Paiement :</span>
                      {getPaymentBadge(effectivePaymentStatus)}
                      {lastPaidPayment?.term && (
                        <PaymentTypeBadge term={lastPaidPayment.term} />
                      )}
                    </div>
                    {lastPaidPayment?.term && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Dernière période : <span className="font-medium text-foreground">{lastPaidPayment.term}</span>
                      </p>
                    )}
                    {!lastPaidPayment && (
                      <p className="text-xs text-amber-600 mt-0.5">Aucun paiement enregistré</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 text-sm">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Parent :</span>
                  <span>{student.parentName || "-"}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Téléphone :</span>
                  <span>{student.parentPhone || "-"}</span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ─── Onglets ─── */}
      <Tabs defaultValue="info" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="info">Informations</TabsTrigger>
          <TabsTrigger value="grades">
            Notes {grades.length > 0 && `(${grades.length})`}
          </TabsTrigger>
          <TabsTrigger value="attendance">
            Présences {attendances.length > 0 && `(${attendances.length})`}
          </TabsTrigger>
          <TabsTrigger value="payments">
            Paiements {payments.length > 0 && `(${payments.length})`}
          </TabsTrigger>
        </TabsList>

        {/* ═══ Onglet Informations ═══ */}
        <TabsContent value="info" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Informations personnelles</CardTitle>
              <CardDescription>Détails de l'élève</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-muted-foreground">Nom complet</label>
                <p className="font-medium">{student.name}</p>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Matricule</label>
                <p className="font-medium">{student.matricule}</p>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Classe</label>
                <p className="font-medium">{student.class}</p>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Statut</label>
                <p className="font-medium capitalize">{student.status}</p>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Date de naissance</label>
                <p className="font-medium">
                  {student.dateOfBirth
                    ? new Date(student.dateOfBirth).toLocaleDateString("fr-FR")
                    : <span className="text-muted-foreground">Non renseignée</span>}
                </p>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Genre</label>
                <p className="font-medium">
                  {student.gender === "M" ? "Masculin" : student.gender === "F" ? "Féminin" : <span className="text-muted-foreground">Non renseigné</span>}
                </p>
              </div>
              <div className="md:col-span-2">
                <label className="text-sm text-muted-foreground">Adresse</label>
                <p className="font-medium">
                  {student.address || <span className="text-muted-foreground">Non renseignée</span>}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Informations du parent/tuteur</CardTitle>
              <CardDescription>Contact d'urgence</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-muted-foreground">Nom du parent</label>
                <p className="font-medium">{student.parentName || "-"}</p>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Téléphone</label>
                <p className="font-medium">{student.parentPhone || "-"}</p>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Email</label>
                <p className="font-medium">{student.parentEmail || <span className="text-muted-foreground">Non renseigné</span>}</p>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Profession</label>
                <p className="font-medium">{student.parentProfession || <span className="text-muted-foreground">Non renseignée</span>}</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══ Onglet Notes ═══ */}
        <TabsContent value="grades" className="space-y-4">
          {grades.length === 0 ? (
            <Card>
              <CardContent className="py-16 text-center text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-4 opacity-40" />
                <p className="font-medium">Aucune note enregistrée</p>
                <p className="text-sm mt-1">Les notes seront visibles ici après saisie</p>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-3">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Moyenne générale</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold">{generalAverage !== null ? `${generalAverage}/20` : "-"}</div>
                    <p className="text-xs text-muted-foreground mt-1">{latestTerm || "Dernier trimestre"}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Matières évaluées</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold">{grades.length}</div>
                    <p className="text-xs text-muted-foreground mt-1">Au total</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Résultat global</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-2">
                      {generalAverage !== null && parseFloat(generalAverage) >= 10 ? (
                        <><TrendingUp className="h-6 w-6 text-emerald-600" /><span className="text-2xl font-bold text-emerald-600">Admis</span></>
                      ) : (
                        <><TrendingDown className="h-6 w-6 text-red-600" /><span className="text-2xl font-bold text-red-600">Insuffisant</span></>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {Object.entries(gradesByTerm).map(([term, termGrades]) => (
                <Card key={term}>
                  <CardHeader>
                    <CardTitle>Notes — {term}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Matière</TableHead>
                          <TableHead>Note</TableHead>
                          <TableHead>Coefficient</TableHead>
                          <TableHead>Statut</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(termGrades as any[]).map((grade: any) => {
                          const pct = grade.maxScore > 0 ? (grade.score / grade.maxScore) * 100 : 0;
                          return (
                            <TableRow key={grade.id}>
                              <TableCell className="font-medium">{grade.subject || "Matière inconnue"}</TableCell>
                              <TableCell>
                                <span className={`font-bold ${pct >= 75 ? "text-emerald-600" : pct >= 50 ? "text-amber-600" : "text-red-600"}`}>
                                  {grade.score}/{grade.maxScore || 20}
                                </span>
                              </TableCell>
                              <TableCell className="text-muted-foreground">{grade.coefficient ?? 1}</TableCell>
                              <TableCell>
                                {pct >= 50
                                  ? <Badge className="bg-emerald-500/10 text-emerald-700 border-0"><CheckCircle2 className="h-3 w-3 mr-1" />Admis</Badge>
                                  : <Badge className="bg-red-500/10 text-red-700 border-0"><XCircle className="h-3 w-3 mr-1" />Insuffisant</Badge>}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              ))}
            </>
          )}
        </TabsContent>

        {/* ═══ Onglet Présences ═══ */}
        <TabsContent value="attendance" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            {[
              { label: "Taux de présence", value: `${attendanceRate}%`, sub: parseInt(attendanceRate) >= 90 ? "Excellent" : parseInt(attendanceRate) >= 75 ? "Bien" : "À améliorer", color: parseInt(attendanceRate) >= 90 ? "text-emerald-600" : parseInt(attendanceRate) >= 75 ? "text-amber-600" : "text-red-600" },
              { label: "Présences", value: String(presentCount), sub: "Jours présent", color: "text-emerald-600" },
              { label: "Absences", value: String(absentCount), sub: "Jours absent", color: "text-red-600" },
              { label: "Retards", value: String(lateCount), sub: "Jours en retard", color: "text-amber-600" },
            ].map((s) => (
              <Card key={s.label}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">{s.label}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className={`text-3xl font-bold ${s.color}`}>{s.value}</div>
                  <p className="text-xs text-muted-foreground mt-1">{s.sub}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Historique des présences</CardTitle>
              <CardDescription>
                {totalAttendances === 0 ? "Aucun enregistrement" : `${totalAttendances} enregistrement${totalAttendances > 1 ? "s" : ""}`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {attendances.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  <Calendar className="h-10 w-10 mx-auto mb-3 opacity-40" />
                  <p>Aucune présence enregistrée</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead>Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {attendances.map((record: any) => (
                      <TableRow key={record.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            {new Date(record.date).toLocaleDateString("fr-FR")}
                          </div>
                        </TableCell>
                        <TableCell>
                          {record.status === "present" && <Badge className="bg-emerald-500/10 text-emerald-700 border-0"><CheckCircle2 className="h-3 w-3 mr-1" />Présent</Badge>}
                          {record.status === "absent" && <Badge className="bg-red-500/10 text-red-700 border-0"><XCircle className="h-3 w-3 mr-1" />Absent</Badge>}
                          {record.status === "late" && <Badge className="bg-amber-500/10 text-amber-700 border-0"><Clock className="h-3 w-3 mr-1" />Retard</Badge>}
                          {record.status === "excused" && <Badge className="bg-blue-500/10 text-blue-700 border-0"><Minus className="h-3 w-3 mr-1" />Justifié</Badge>}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">{record.notes || "-"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══ Onglet Paiements ═══ */}
        <TabsContent value="payments" className="space-y-4">

          {/* Bannière fonctionnalité reçu — FREE */}
          {!hasBulletins && (
            <UpgradeBadge
              variant="block"
              requiredPlan="Pro"
              message="Générez et téléchargez des reçus PDF professionnels pour chaque paiement. Disponible à partir du plan Pro."
            />
          )}

          {/* Situation du mois en cours */}
          <Card className={hasCurrentMonthPayment
            ? "border-l-4 border-l-emerald-500 bg-emerald-50/40"
            : "border-l-4 border-l-amber-400 bg-amber-50/40"}>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                {hasCurrentMonthPayment ? (
                  <CheckCircle2 className="h-8 w-8 text-emerald-600 shrink-0" />
                ) : (
                  <AlertCircle className="h-8 w-8 text-amber-500 shrink-0" />
                )}
                <div>
                  <p className="font-semibold text-base">
                    {hasCurrentMonthPayment
                      ? `✓ Payé pour ${currentMonthLabel}`
                      : `⚠ Pas encore payé pour ${currentMonthLabel}`}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {hasCurrentMonthPayment
                      ? `Paiement reçu ce mois-ci — Total collecté : ${totalPaid.toLocaleString("fr-FR")} GNF`
                      : `Aucun paiement enregistré ce mois`}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Stats paiements */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total encaissé</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalPaid.toLocaleString("fr-FR")} GNF</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {paidPayments.length} versement{paidPayments.length > 1 ? "s" : ""} confirmé{paidPayments.length > 1 ? "s" : ""}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Statut actuel</CardTitle>
              </CardHeader>
              <CardContent>
                {getPaymentBadge(effectivePaymentStatus)}
                {lastPaidPayment && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Dernière période :{" "}
                    <span className="font-medium text-foreground">
                      {lastPaidPayment.term || "Non spécifié"}
                    </span>
                  </p>
                )}
                {!lastPaidPayment && (
                  <p className="text-xs text-muted-foreground mt-2">Aucun paiement enregistré</p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Nombre de paiements</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{payments.length}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {paidPayments.length} payé{paidPayments.length > 1 ? "s" : ""}, {payments.length - paidPayments.length} en attente
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Historique des paiements */}
          <Card>
            <CardHeader>
              <CardTitle>Historique des paiements</CardTitle>
              <CardDescription>Toutes les transactions enregistrées pour cet élève</CardDescription>
            </CardHeader>
            <CardContent>
              {payments.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  <CreditCard className="h-10 w-10 mx-auto mb-3 opacity-40" />
                  <p>Aucun paiement enregistré</p>
                  <p className="text-sm mt-1">Enregistrez des paiements depuis la page Paiements</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Période couverte</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Montant</TableHead>
                      <TableHead>Méthode</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead>Reçu</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payments.map((payment: any) => {
                      const payDate = payment.paidDate
                        ? new Date(payment.paidDate)
                        : new Date(payment.createdAt);
                      return (
                        <TableRow key={payment.id}>
                          <TableCell className="whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <Calendar className="h-4 w-4 text-muted-foreground" />
                              {payDate.toLocaleDateString("fr-FR")}
                            </div>
                          </TableCell>
                          <TableCell>
                            <p className="font-medium">
                              {payment.term || payment.description || "Frais de scolarité"}
                            </p>
                            {payment.academicYear && (
                              <p className="text-xs text-muted-foreground">Année {payment.academicYear}</p>
                            )}
                            {payment.receiptNumber && (
                              <p className="text-xs text-muted-foreground">Reçu {payment.receiptNumber}</p>
                            )}
                          </TableCell>
                          <TableCell>
                            <PaymentTypeBadge term={payment.term} />
                          </TableCell>
                          <TableCell className="font-bold whitespace-nowrap">
                            {(payment.amount || 0).toLocaleString("fr-FR")} GNF
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{methodLabel(payment.method)}</Badge>
                          </TableCell>
                          <TableCell>
                            {getPaymentBadge(payment.status)}
                          </TableCell>
                          <TableCell>
                            {isPaid(payment.status) ? (
                              hasBulletins ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="gap-1.5 text-xs h-8"
                                  onClick={async () => {
                                    try {
                                      await generatePaymentReceipt({
                                        studentName: student.name,
                                        studentMatricule: student.matricule,
                                        className: student.class || "",
                                        amount: payment.amount || 0,
                                        date: payment.paidDate || payment.createdAt,
                                        paymentMethod: payment.method || "",
                                        description: payment.term || payment.description || "Frais de scolarité",
                                        academicYear: payment.academicYear,
                                        term: payment.term,
                                        receiptNumber: payment.receiptNumber,
                                        schoolName: user?.schoolName ?? "",
                                        schoolAddress: "",
                                        schoolPhone: "",
                                        schoolLogo: user?.schoolLogo ?? undefined,
                                        outputMode: "download",
                                      });
                                    } catch {}
                                  }}
                                >
                                  <FileDown className="h-3.5 w-3.5" />
                                  PDF
                                </Button>
                              ) : (
                                <UpgradeBadge variant="inline" requiredPlan="Pro" message="Pro" />
                              )
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
