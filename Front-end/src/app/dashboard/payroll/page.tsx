"use client";

import { useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Download,
  Trash2,
  Settings2,
  Banknote,
  Users,
  TrendingUp,
  Receipt,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import * as storage from "@/lib/storage";
import {
  getPayrollSummary,
  getPayrollHistory,
  paySalary,
  updateSalaryConfig,
  deletePayrollPayment,
  PayrollStaffMember,
  SalaryPayment,
} from "@/lib/api/payroll.service";
import { generateSalaryReceipt } from "@/lib/pdf-generator";
import { ROLE_LABELS, RoleType } from "@/types/permissions";

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatAmount(n: number) {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " GNF";
}

function fmtDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("fr-FR");
}

const METHOD_LABELS: Record<string, string> = {
  CASH: "Espèces",
  MOBILE_MONEY: "Mobile Money",
  BANK_TRANSFER: "Virement",
  CHECK: "Chèque",
};

const ROLE_COLORS: Record<string, string> = {
  teacher:    "bg-blue-100 text-blue-700",
  accountant: "bg-emerald-100 text-emerald-700",
  supervisor: "bg-orange-100 text-orange-700",
  secretary:  "bg-pink-100 text-pink-700",
};

// ── Query keys ─────────────────────────────────────────────────────────────────

const PAYROLL_KEY = (tenantId?: string, month?: string) =>
  ["payroll", tenantId, month] as const;

const HISTORY_KEY = (tenantId?: string) =>
  ["payroll-history", tenantId] as const;

// ── Page principale ────────────────────────────────────────────────────────────

export default function PayrollPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // ── Mois courant ─────────────────────────────────────────────────────────────
  const [currentMonth, setCurrentMonth] = useState(() =>
    new Date().toISOString().slice(0, 7)
  );

  const monthLabel = new Intl.DateTimeFormat("fr-FR", {
    month: "long",
    year: "numeric",
  }).format(new Date(currentMonth + "-01"));

  const prevMonth = () => {
    const [y, m] = currentMonth.split("-").map(Number);
    const d = new Date(y, m - 2, 1);
    setCurrentMonth(d.toISOString().slice(0, 7));
  };

  const nextMonth = () => {
    const [y, m] = currentMonth.split("-").map(Number);
    const d = new Date(y, m, 1);
    setCurrentMonth(d.toISOString().slice(0, 7));
  };

  // ── Recherche ─────────────────────────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [historyStaffFilter, setHistoryStaffFilter] = useState("all");

  // ── Dialogs ───────────────────────────────────────────────────────────────────
  const [payDialog, setPayDialog] = useState<PayrollStaffMember | null>(null);
  const [configDialog, setConfigDialog] = useState<PayrollStaffMember | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SalaryPayment | null>(null);

  // ── Form state ────────────────────────────────────────────────────────────────
  const [payForm, setPayForm] = useState({ method: "CASH", note: "" });
  const [configAmount, setConfigAmount] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ── Queries ───────────────────────────────────────────────────────────────────
  const {
    data: summary,
    isLoading: isLoadingSummary,
  } = useQuery({
    queryKey: PAYROLL_KEY(user?.tenantId, currentMonth),
    queryFn: async () => {
      const token = storage.getAuthItem("structura_token");
      if (!token) throw new Error("Session expirée");
      return getPayrollSummary(token, currentMonth);
    },
    enabled: !!user,
    staleTime: 2 * 60_000,
  });

  const {
    data: historyData,
    isLoading: isLoadingHistory,
  } = useQuery({
    queryKey: HISTORY_KEY(user?.tenantId),
    queryFn: async () => {
      const token = storage.getAuthItem("structura_token");
      if (!token) throw new Error("Session expirée");
      return getPayrollHistory(token, { limit: 100 });
    },
    enabled: !!user,
    staleTime: 2 * 60_000,
  });

  // ── Staff filtré ──────────────────────────────────────────────────────────────
  const filteredStaff = (summary?.staff ?? []).filter((s) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      s.firstName.toLowerCase().includes(q) ||
      s.lastName.toLowerCase().includes(q) ||
      s.role.toLowerCase().includes(q)
    );
  });

  // ── Historique filtré ─────────────────────────────────────────────────────────
  const filteredHistory = (historyData?.data ?? []).filter((p) => {
    if (historyStaffFilter === "all") return true;
    return p.staffId === historyStaffFilter;
  });

  // ── Actions ───────────────────────────────────────────────────────────────────

  const handlePay = async () => {
    if (!payDialog) return;
    const token = storage.getAuthItem("structura_token");
    if (!token) return;

    const amount = payDialog.salaryConfig?.amount;
    if (!amount) {
      toast.error("Aucun salaire configuré pour ce membre");
      return;
    }

    setIsSubmitting(true);
    try {
      const payment = await paySalary(token, {
        staffId: payDialog.id,
        month: currentMonth,
        amount,
        method: payForm.method,
        note: payForm.note || undefined,
      });

      // Optimistic update
      queryClient.setQueryData(
        PAYROLL_KEY(user?.tenantId, currentMonth),
        (old: typeof summary) => {
          if (!old) return old;
          return {
            ...old,
            staff: old.staff.map((s) =>
              s.id === payDialog.id ? { ...s, isPaid: true, payment } : s
            ),
            stats: {
              ...old.stats,
              paidCount: old.stats.paidCount + 1,
              unpaidCount: old.stats.unpaidCount - 1,
              totalPaid: old.stats.totalPaid + amount,
            },
          };
        }
      );
      queryClient.invalidateQueries({ queryKey: HISTORY_KEY(user?.tenantId) });

      toast.success(`Salaire de ${payDialog.firstName} ${payDialog.lastName} enregistré`);
      setPayDialog(null);
      setPayForm({ method: "CASH", note: "" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur lors du paiement");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfigSave = async () => {
    if (!configDialog) return;
    const token = storage.getAuthItem("structura_token");
    if (!token) return;

    const amount = parseFloat(configAmount.replace(/\s/g, ""));
    if (isNaN(amount) || amount <= 0) {
      toast.error("Montant invalide");
      return;
    }

    setIsSubmitting(true);
    try {
      await updateSalaryConfig(token, configDialog.id, amount);

      queryClient.setQueryData(
        PAYROLL_KEY(user?.tenantId, currentMonth),
        (old: typeof summary) => {
          if (!old) return old;
          const wasUnconfigured = !configDialog.salaryConfig?.amount;
          return {
            ...old,
            staff: old.staff.map((s) =>
              s.id === configDialog.id
                ? { ...s, salaryConfig: { amount, currency: "GNF" } }
                : s
            ),
            stats: {
              ...old.stats,
              unconfiguredCount: wasUnconfigured
                ? old.stats.unconfiguredCount - 1
                : old.stats.unconfiguredCount,
              totalConfigured: old.stats.totalConfigured - (configDialog.salaryConfig?.amount ?? 0) + amount,
            },
          };
        }
      );

      toast.success("Salaire configuré avec succès");
      setConfigDialog(null);
      setConfigAmount("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur de configuration");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const token = storage.getAuthItem("structura_token");
    if (!token) return;

    try {
      await deletePayrollPayment(token, deleteTarget.id);
      queryClient.invalidateQueries({ queryKey: PAYROLL_KEY(user?.tenantId, currentMonth) });
      queryClient.invalidateQueries({ queryKey: HISTORY_KEY(user?.tenantId) });
      toast.success("Paiement annulé");
      setDeleteTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur lors de l'annulation");
    }
  };

  const handleReceipt = (member: PayrollStaffMember) => {
    if (!member.payment) return;
    generateSalaryReceipt({
      schoolName: user?.schoolName ?? "École",
      staffName: `${member.firstName} ${member.lastName}`,
      staffRole: ROLE_LABELS[member.role as RoleType] ?? member.role,
      month: new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" })
        .format(new Date(currentMonth + "-01"))
        .replace(/^\w/, (c) => c.toUpperCase()),
      amount: member.payment.amount,
      currency: member.salaryConfig?.currency ?? "GNF",
      method: member.payment.method,
      paidDate: fmtDate(member.payment.date),
      note: member.payment.note ?? undefined,
      mode: "download",
    });
  };

  const handleHistoryReceipt = (p: SalaryPayment) => {
    generateSalaryReceipt({
      schoolName: user?.schoolName ?? "École",
      staffName: p.staffName ?? "Membre",
      staffRole: "",
      month: new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" })
        .format(new Date(p.date))
        .replace(/^\w/, (c) => c.toUpperCase()),
      amount: p.amount,
      currency: "GNF",
      method: p.method,
      paidDate: fmtDate(p.date),
      note: p.note ?? undefined,
      mode: "download",
    });
  };

  // ── Stats ─────────────────────────────────────────────────────────────────────
  const stats = summary?.stats;
  const hasUnpaid = (stats?.unpaidCount ?? 0) > 0;

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 p-4 sm:p-6">

      {/* ── Titre + navigation mois ──────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Paie du Personnel</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Gérez et suivez les salaires de votre équipe
          </p>
        </div>
        <div className="flex items-center gap-2 bg-white border-2 border-gray-200 rounded-lg px-3 py-2 w-fit">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={prevMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="font-semibold text-sm capitalize min-w-[130px] text-center">
            {monthLabel}
          </span>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={nextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* ── Alerte salaires en attente ───────────────────────────────────────── */}
      {!isLoadingSummary && hasUnpaid && (
        <div className="flex items-center gap-3 bg-amber-50 border-2 border-amber-300 rounded-lg px-4 py-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
          <p className="text-sm text-amber-800">
            <strong>{stats!.unpaidCount} salaire{stats!.unpaidCount > 1 ? "s" : ""}</strong> non payé{stats!.unpaidCount > 1 ? "s" : ""} ce mois-ci
            {stats!.totalConfigured > 0 && ` — Total restant : ${formatAmount(stats!.totalConfigured - stats!.totalPaid)}`}
          </p>
        </div>
      )}

      {/* ── Cartes statistiques ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {isLoadingSummary ? (
          Array(4).fill(0).map((_, i) => (
            <Card key={i}><CardContent className="pt-6"><Skeleton className="h-16 w-full" /></CardContent></Card>
          ))
        ) : (
          <>
            <Card className="border-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-2">
                  <Users className="h-3.5 w-3.5" /> Personnel
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{stats?.totalStaff ?? 0}</p>
                <p className="text-xs text-muted-foreground mt-0.5">membres actifs</p>
              </CardContent>
            </Card>

            <Card className="border-2 border-emerald-200 bg-emerald-50">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-emerald-700 flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Payés
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-emerald-700">
                  {stats?.paidCount ?? 0}
                  <span className="text-sm font-normal text-emerald-600 ml-1">/ {stats?.totalStaff ?? 0}</span>
                </p>
                <p className="text-xs text-emerald-600 mt-0.5">{formatAmount(stats?.totalPaid ?? 0)}</p>
              </CardContent>
            </Card>

            <Card className={`border-2 ${hasUnpaid ? "border-amber-300 bg-amber-50" : "border-gray-200"}`}>
              <CardHeader className="pb-2">
                <CardTitle className={`text-xs font-medium flex items-center gap-2 ${hasUnpaid ? "text-amber-700" : "text-muted-foreground"}`}>
                  <Clock className="h-3.5 w-3.5" /> En attente
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className={`text-2xl font-bold ${hasUnpaid ? "text-amber-700" : ""}`}>
                  {stats?.unpaidCount ?? 0}
                </p>
                {stats?.unconfiguredCount ? (
                  <p className="text-xs text-orange-600 mt-0.5">{stats.unconfiguredCount} sans config</p>
                ) : (
                  <p className="text-xs text-muted-foreground mt-0.5">salaires</p>
                )}
              </CardContent>
            </Card>

            <Card className="border-2 border-blue-200 bg-blue-50">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-blue-700 flex items-center gap-2">
                  <TrendingUp className="h-3.5 w-3.5" /> Masse salariale
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-lg font-bold text-blue-700 leading-tight">
                  {formatAmount(stats?.totalConfigured ?? 0)}
                </p>
                <p className="text-xs text-blue-600 mt-0.5">total configuré</p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* ── Tabs ─────────────────────────────────────────────────────────────── */}
      <Tabs defaultValue="current">
        <TabsList className="border-2">
          <TabsTrigger value="current">Ce mois-ci</TabsTrigger>
          <TabsTrigger value="history">Historique</TabsTrigger>
        </TabsList>

        {/* ── Tab : Ce mois-ci ─────────────────────────────────────────────── */}
        <TabsContent value="current" className="mt-4 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher un membre..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 border-2"
            />
          </div>

          {isLoadingSummary ? (
            <div className="space-y-3">
              {Array(5).fill(0).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
            </div>
          ) : filteredStaff.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p>Aucun membre trouvé</p>
            </div>
          ) : (
            <div className="rounded-xl border-2 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50">
                    <TableHead className="font-semibold">Membre</TableHead>
                    <TableHead className="font-semibold hidden sm:table-cell">Rôle</TableHead>
                    <TableHead className="font-semibold">Salaire</TableHead>
                    <TableHead className="font-semibold">Statut</TableHead>
                    <TableHead className="font-semibold text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredStaff.map((member) => (
                    <TableRow key={member.id} className="hover:bg-gray-50">
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center shrink-0">
                            <span className="text-white text-xs font-bold">
                              {member.firstName[0]}{member.lastName[0]}
                            </span>
                          </div>
                          <div>
                            <p className="font-medium text-sm">{member.firstName} {member.lastName}</p>
                            <p className="text-xs text-muted-foreground sm:hidden">
                              {ROLE_LABELS[member.role as RoleType] ?? member.role}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <Badge variant="outline" className={`text-xs ${ROLE_COLORS[member.role] ?? "bg-gray-100 text-gray-600"}`}>
                          {ROLE_LABELS[member.role as RoleType] ?? member.role}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {member.salaryConfig?.amount ? (
                          <span className="font-semibold text-sm">{formatAmount(member.salaryConfig.amount)}</span>
                        ) : (
                          <span className="text-xs text-orange-600 font-medium flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" /> Non configuré
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {member.isPaid ? (
                          <div className="flex items-center gap-1.5">
                            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                            <span className="text-xs text-emerald-700 font-medium">
                              Payé le {fmtDate(member.payment!.date)}
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <Clock className="h-4 w-4 text-amber-500 shrink-0" />
                            <span className="text-xs text-amber-700 font-medium">En attente</span>
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          {!member.isPaid && (
                            <>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2 text-xs text-gray-500 hover:text-gray-700"
                                onClick={() => {
                                  setConfigDialog(member);
                                  setConfigAmount(member.salaryConfig?.amount?.toString() ?? "");
                                }}
                              >
                                <Settings2 className="h-3.5 w-3.5 mr-1" />
                                <span className="hidden sm:inline">Config</span>
                              </Button>
                              <Button
                                size="sm"
                                disabled={!member.salaryConfig?.amount}
                                onClick={() => {
                                  setPayDialog(member);
                                  setPayForm({ method: "CASH", note: "" });
                                }}
                                className="h-7 px-3 text-xs bg-blue-600 hover:bg-blue-700"
                              >
                                <Banknote className="h-3.5 w-3.5 mr-1" />
                                Payer
                              </Button>
                            </>
                          )}
                          {member.isPaid && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 text-xs"
                                onClick={() => handleReceipt(member)}
                              >
                                <Download className="h-3.5 w-3.5 mr-1" />
                                Reçu
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                                onClick={() => setDeleteTarget(member.payment!)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* ── Tab : Historique ──────────────────────────────────────────────── */}
        <TabsContent value="history" className="mt-4 space-y-4">
          <div className="flex gap-3">
            <Select value={historyStaffFilter} onValueChange={setHistoryStaffFilter}>
              <SelectTrigger className="border-2 w-56">
                <SelectValue placeholder="Tous les membres" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les membres</SelectItem>
                {(summary?.staff ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.firstName} {s.lastName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isLoadingHistory ? (
            <div className="space-y-3">
              {Array(5).fill(0).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
            </div>
          ) : filteredHistory.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Receipt className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p>Aucun paiement enregistré</p>
            </div>
          ) : (
            <div className="rounded-xl border-2 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50">
                    <TableHead className="font-semibold">Membre</TableHead>
                    <TableHead className="font-semibold">Période</TableHead>
                    <TableHead className="font-semibold">Montant</TableHead>
                    <TableHead className="font-semibold hidden sm:table-cell">Méthode</TableHead>
                    <TableHead className="font-semibold text-right">Reçu</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredHistory.map((p) => (
                    <TableRow key={p.id} className="hover:bg-gray-50">
                      <TableCell>
                        <p className="font-medium text-sm">{p.staffName ?? "—"}</p>
                        <p className="text-xs text-muted-foreground">{fmtDate(p.date)}</p>
                      </TableCell>
                      <TableCell className="text-sm capitalize">
                        {new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" })
                          .format(new Date(p.date))}
                      </TableCell>
                      <TableCell className="font-semibold text-sm">{formatAmount(p.amount)}</TableCell>
                      <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                        {METHOD_LABELS[p.method] ?? p.method}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs"
                          onClick={() => handleHistoryReceipt(p)}
                        >
                          <Download className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ── Dialog : Payer ───────────────────────────────────────────────────── */}
      <Dialog open={!!payDialog} onOpenChange={(o) => !o && setPayDialog(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Enregistrer le paiement</DialogTitle>
            <DialogDescription>
              {payDialog && (
                <>
                  Salaire de <strong>{payDialog.firstName} {payDialog.lastName}</strong>{" "}
                  pour <span className="capitalize">{monthLabel}</span>
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          {payDialog && (
            <div className="space-y-4 py-2">
              <div className="rounded-lg bg-blue-50 border-2 border-blue-200 px-4 py-3 flex justify-between items-center">
                <span className="text-sm text-blue-700 font-medium">Montant</span>
                <span className="text-lg font-bold text-blue-900">
                  {formatAmount(payDialog.salaryConfig?.amount ?? 0)}
                </span>
              </div>

              <div className="space-y-2">
                <Label>Méthode de paiement</Label>
                <Select
                  value={payForm.method}
                  onValueChange={(v) => setPayForm((f) => ({ ...f, method: v }))}
                >
                  <SelectTrigger className="border-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CASH">Espèces</SelectItem>
                    <SelectItem value="MOBILE_MONEY">Mobile Money</SelectItem>
                    <SelectItem value="BANK_TRANSFER">Virement bancaire</SelectItem>
                    <SelectItem value="CHECK">Chèque</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Note (optionnel)</Label>
                <Input
                  placeholder="Ex: Mois de mars 2026"
                  value={payForm.note}
                  onChange={(e) => setPayForm((f) => ({ ...f, note: e.target.value }))}
                  className="border-2"
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setPayDialog(null)}>Annuler</Button>
            <Button onClick={handlePay} disabled={isSubmitting} className="gap-2">
              {isSubmitting ? "Enregistrement..." : (
                <><Banknote className="h-4 w-4" /> Confirmer le paiement</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog : Configurer le salaire ───────────────────────────────────── */}
      <Dialog open={!!configDialog} onOpenChange={(o) => !o && setConfigDialog(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Configurer le salaire</DialogTitle>
            <DialogDescription>
              {configDialog && (
                <>Salaire mensuel de <strong>{configDialog.firstName} {configDialog.lastName}</strong></>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Salaire mensuel (GNF)</Label>
              <Input
                type="number"
                placeholder="Ex: 500000"
                value={configAmount}
                onChange={(e) => setConfigAmount(e.target.value)}
                className="border-2 text-lg font-semibold"
                min={0}
              />
              {configAmount && !isNaN(parseFloat(configAmount)) && (
                <p className="text-sm text-muted-foreground">
                  = {formatAmount(parseFloat(configAmount))}
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setConfigDialog(null)}>Annuler</Button>
            <Button onClick={handleConfigSave} disabled={isSubmitting}>
              {isSubmitting ? "Sauvegarde..." : "Enregistrer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog : Annuler un paiement ─────────────────────────────────────── */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Annuler le paiement</DialogTitle>
            <DialogDescription>
              Cette action supprime le paiement de{" "}
              <strong>{deleteTarget && formatAmount(deleteTarget.amount)}</strong>.
              Le membre repassera en statut &quot;En attente&quot;.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Conserver</Button>
            <Button variant="destructive" onClick={handleDelete}>
              Annuler le paiement
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
