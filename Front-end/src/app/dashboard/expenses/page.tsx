"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import * as storage from "@/lib/storage";
import { useOnline } from "@/hooks/use-online";
import { toast } from "sonner";
import {
  getExpenses,
  getExpenseStats,
  createExpense,
  updateExpense,
  deleteExpense,
  EXPENSE_CATEGORIES,
  CATEGORY_LABELS,
  CATEGORY_COLORS,
  CATEGORY_ICONS,
  type Expense,
  type CreateExpenseDto,
  type ExpenseStats,
  type ExpenseCategory,
} from "@/lib/api/expenses.service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Wallet,
  Plus,
  Search,
  Filter,
  Pencil,
  Trash2,
  TrendingDown,
  TrendingUp,
  BarChart3,
  Lock,
  RefreshCw,
  Calendar,
  FileText,
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("fr-GN", {
    style: "currency",
    currency: "GNF",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

const METHOD_LABELS: Record<string, string> = {
  CASH:          "Espèces",
  MOBILE_MONEY:  "Mobile Money",
  BANK_TRANSFER: "Virement",
  CHECK:         "Chèque",
};

// ─── Types formulaire ─────────────────────────────────────────────────────────

interface ExpenseForm {
  amount:      string;
  category:    ExpenseCategory;
  description: string;
  method:      string;
  date:        string;
  academicYear: string;
  reference:   string;
  note:        string;
}

const EMPTY_FORM: ExpenseForm = {
  amount:      "",
  category:    "GENERAL",
  description: "",
  method:      "CASH",
  date:        new Date().toISOString().split("T")[0],
  academicYear: "",
  reference:   "",
  note:        "",
};

// ─── Composant principal ──────────────────────────────────────────────────────

export default function ExpensesPage() {
  const { user } = useAuth();
  const isOnline = useOnline();

  // ── State ──
  const [expenses, setExpenses]         = useState<Expense[]>([]);
  const [stats, setStats]               = useState<ExpenseStats | null>(null);
  const [loading, setLoading]           = useState(true);
  const [submitting, setSubmitting]     = useState(false);

  // Filtres
  const [searchQuery, setSearchQuery]   = useState("");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [selectedYear, setSelectedYear] = useState<string>("");

  // Dialog
  const [dialogOpen, setDialogOpen]     = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [form, setForm]                 = useState<ExpenseForm>(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState<Expense | null>(null);

  // Permissions
  const canCreate = user?.role === "director" || user?.role === "accountant";
  const canEdit   = user?.role === "director" || user?.role === "accountant";
  const canDelete = user?.role === "director";
  const canView   = user?.role === "director" || user?.role === "accountant" || user?.role === "secretary";

  // ── Chargement ──
  const loadExpenses = useCallback(async () => {
    if (!isOnline) return;
    const token = storage.getAuthItem("structura_token");
    if (!token) return;
    try {
      const [data, statsData] = await Promise.all([
        getExpenses(token, { academicYear: selectedYear || undefined }),
        getExpenseStats(token, selectedYear || undefined),
      ]);
      setExpenses(data);
      setStats(statsData);
    } catch {
      toast.error("Impossible de charger les dépenses");
    } finally {
      setLoading(false);
    }
  }, [isOnline, selectedYear]);

  useEffect(() => {
    setLoading(true);
    loadExpenses();
  }, [loadExpenses]);

  // ── Récupérer l'année scolaire courante depuis user/storage ──
  useEffect(() => {
    const stored = storage.getAuthItem("structura_current_year");
    if (stored) setSelectedYear(stored);
  }, []);

  // ── Filtrage local ──
  const filteredExpenses = useMemo(() => {
    return expenses.filter((e) => {
      if (filterCategory !== "all" && e.category !== filterCategory) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (
          !e.description.toLowerCase().includes(q) &&
          !(e.reference ?? "").toLowerCase().includes(q) &&
          !(e.note ?? "").toLowerCase().includes(q)
        ) return false;
      }
      return true;
    });
  }, [expenses, filterCategory, searchQuery]);

  // ── Répartition par catégorie (pour le tableau de bord) ──
  const categoryBreakdown = useMemo(() => {
    const total = expenses.reduce((s, e) => s + e.amount, 0);
    return EXPENSE_CATEGORIES.map((cat) => {
      const amount = expenses
        .filter((e) => e.category === cat)
        .reduce((s, e) => s + e.amount, 0);
      return { cat, amount, pct: total > 0 ? Math.round((amount / total) * 100) : 0 };
    }).filter((r) => r.amount > 0)
      .sort((a, b) => b.amount - a.amount);
  }, [expenses]);

  // ── Formulaire helpers ──
  const openCreate = () => {
    setEditingExpense(null);
    setForm({ ...EMPTY_FORM, date: new Date().toISOString().split("T")[0], academicYear: selectedYear });
    setDialogOpen(true);
  };

  const openEdit = (expense: Expense) => {
    setEditingExpense(expense);
    setForm({
      amount:      String(expense.amount),
      category:    expense.category,
      description: expense.description,
      method:      expense.method,
      date:        expense.date.split("T")[0],
      academicYear: expense.academicYear ?? "",
      reference:   expense.reference   ?? "",
      note:        expense.note        ?? "",
    });
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    const amount = parseFloat(form.amount);
    if (!form.amount || isNaN(amount) || amount <= 0) {
      toast.error("Montant invalide");
      return;
    }
    if (!form.description.trim()) {
      toast.error("Description requise");
      return;
    }
    if (!form.date) {
      toast.error("Date requise");
      return;
    }

    const token = storage.getAuthItem("structura_token");
    if (!token) { toast.error("Non authentifié"); return; }

    setSubmitting(true);
    try {
      const dto: CreateExpenseDto = {
        amount,
        category:    form.category,
        description: form.description.trim(),
        method:      form.method,
        date:        form.date,
        academicYear: form.academicYear || undefined,
        reference:   form.reference.trim() || undefined,
        note:        form.note.trim()      || undefined,
      };

      if (editingExpense) {
        await updateExpense(token, editingExpense.id, dto);
        toast.success("Dépense modifiée");
      } else {
        await createExpense(token, dto);
        toast.success("Dépense enregistrée");
      }

      setDialogOpen(false);
      loadExpenses();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erreur lors de l'enregistrement");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const token = storage.getAuthItem("structura_token");
    if (!token) return;
    try {
      await deleteExpense(token, deleteTarget.id);
      toast.success("Dépense supprimée");
      setDeleteTarget(null);
      loadExpenses();
    } catch {
      toast.error("Erreur lors de la suppression");
    }
  };

  // ── Accès restreint ──
  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-3 text-muted-foreground">
        <Lock className="h-10 w-10" />
        <p className="text-sm">Vous n'avez pas accès à cette section.</p>
      </div>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Wallet className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl font-bold">Dépenses</h1>
            <p className="text-xs text-muted-foreground">Gestion des charges de l'école</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => { setLoading(true); loadExpenses(); }}
            disabled={loading}
            title="Actualiser"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          {canCreate && (
            <Button onClick={openCreate} size="sm" className="gap-1.5">
              <Plus className="h-4 w-4" />
              Nouvelle dépense
            </Button>
          )}
        </div>
      </div>

      {/* ── Cartes stats ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="border-l-4 border-l-red-500">
          <CardContent className="px-4 py-3">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <TrendingDown className="h-3.5 w-3.5" /> Total dépensé
            </p>
            <p className="text-xl font-bold text-red-600 mt-1">
              {stats ? formatCurrency(stats.totalAmount) : "—"}
            </p>
            <p className="text-xs text-muted-foreground">{stats?.count ?? 0} opération(s)</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-emerald-500">
          <CardContent className="px-4 py-3">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <TrendingUp className="h-3.5 w-3.5" /> Ce mois
            </p>
            {(() => {
              const thisMonth = new Date().toISOString().slice(0, 7);
              const monthTotal = stats?.byMonth?.[thisMonth] ?? 0;
              return (
                <>
                  <p className="text-xl font-bold text-emerald-600 mt-1">{formatCurrency(monthTotal)}</p>
                  <p className="text-xs text-muted-foreground">
                    {expenses.filter((e) => e.date.startsWith(thisMonth)).length} dépense(s)
                  </p>
                </>
              );
            })()}
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="px-4 py-3">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <BarChart3 className="h-3.5 w-3.5" /> Catégorie principale
            </p>
            {categoryBreakdown[0] ? (
              <>
                <p className="text-sm font-bold text-blue-600 mt-1">
                  {CATEGORY_LABELS[categoryBreakdown[0].cat]}
                </p>
                <p className="text-xs text-muted-foreground">{categoryBreakdown[0].pct}% du total</p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground mt-1">—</p>
            )}
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="px-4 py-3">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" /> Catégories actives
            </p>
            <p className="text-xl font-bold text-amber-600 mt-1">{categoryBreakdown.length}</p>
            <p className="text-xs text-muted-foreground">sur {EXPENSE_CATEGORIES.length} catégories</p>
          </CardContent>
        </Card>
      </div>

      {/* ── Répartition par catégorie ── */}
      {categoryBreakdown.length > 0 && (
        <Card>
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <BarChart3 className="h-4 w-4" /> Répartition par catégorie
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="space-y-2">
              {categoryBreakdown.map(({ cat, amount, pct }) => (
                <div key={cat} className="flex items-center gap-3">
                  <span className="text-base w-6 text-center">{CATEGORY_ICONS[cat]}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-center mb-0.5">
                      <span className="text-xs font-medium truncate">{CATEGORY_LABELS[cat]}</span>
                      <span className="text-xs text-muted-foreground tabular-nums ml-2 shrink-0">
                        {formatCurrency(amount)} ({pct}%)
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary/70 transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Filtres ── */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher une dépense..."
            className="pl-9 h-9 text-sm"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-full sm:w-52 h-9 text-sm">
            <Filter className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
            <SelectValue placeholder="Catégorie" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes les catégories</SelectItem>
            {EXPENSE_CATEGORIES.map((cat) => (
              <SelectItem key={cat} value={cat}>
                {CATEGORY_ICONS[cat]} {CATEGORY_LABELS[cat]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* ── Liste des dépenses ── */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
              Chargement...
            </div>
          ) : filteredExpenses.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-2 text-muted-foreground">
              <FileText className="h-8 w-8 opacity-40" />
              <p className="text-sm">Aucune dépense enregistrée</p>
              {canCreate && (
                <Button variant="outline" size="sm" onClick={openCreate} className="mt-1">
                  <Plus className="h-3.5 w-3.5 mr-1" /> Enregistrer la première dépense
                </Button>
              )}
            </div>
          ) : (
            <div className="divide-y">
              {filteredExpenses.map((expense) => (
                <div
                  key={expense.id}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors"
                >
                  {/* Icône catégorie */}
                  <span className="text-xl w-8 text-center shrink-0">
                    {CATEGORY_ICONS[expense.category]}
                  </span>

                  {/* Infos */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium truncate">{expense.description}</span>
                      <Badge
                        variant="outline"
                        className={`text-[10px] px-1.5 py-0 shrink-0 ${CATEGORY_COLORS[expense.category]}`}
                      >
                        {CATEGORY_LABELS[expense.category]}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                      <span>{formatDate(expense.date)}</span>
                      <span>{METHOD_LABELS[expense.method] ?? expense.method}</span>
                      {expense.reference && <span>Réf: {expense.reference}</span>}
                      {expense.recordedBy && <span>par {expense.recordedBy}</span>}
                    </div>
                    {expense.note && (
                      <p className="text-xs text-muted-foreground/70 mt-0.5 italic truncate">
                        {expense.note}
                      </p>
                    )}
                  </div>

                  {/* Montant */}
                  <div className="text-right shrink-0">
                    <span className="text-sm font-bold text-red-600 tabular-nums">
                      -{formatCurrency(expense.amount)}
                    </span>
                  </div>

                  {/* Actions */}
                  {(canEdit || canDelete) && (
                    <div className="flex items-center gap-1 shrink-0">
                      {canEdit && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => openEdit(expense)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {canDelete && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => setDeleteTarget(expense)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Dialog créer / modifier ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingExpense ? "Modifier la dépense" : "Nouvelle dépense"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Montant + Catégorie */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="amount">Montant (GNF) *</Label>
                <Input
                  id="amount"
                  type="number"
                  min={1}
                  placeholder="Ex: 150000"
                  value={form.amount}
                  onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="category">Catégorie *</Label>
                <Select
                  value={form.category}
                  onValueChange={(v) => setForm((f) => ({ ...f, category: v as ExpenseCategory }))}
                >
                  <SelectTrigger id="category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EXPENSE_CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {CATEGORY_ICONS[cat]} {CATEGORY_LABELS[cat]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label htmlFor="description">Description *</Label>
              <Input
                id="description"
                placeholder="Ex: Achat de craies et cahiers pour CP1"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>

            {/* Date + Méthode */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="date">Date *</Label>
                <Input
                  id="date"
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="method">Méthode de paiement</Label>
                <Select
                  value={form.method}
                  onValueChange={(v) => setForm((f) => ({ ...f, method: v }))}
                >
                  <SelectTrigger id="method">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CASH">Espèces</SelectItem>
                    <SelectItem value="MOBILE_MONEY">Mobile Money</SelectItem>
                    <SelectItem value="BANK_TRANSFER">Virement</SelectItem>
                    <SelectItem value="CHECK">Chèque</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Référence + Année scolaire */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="reference">N° Référence / Reçu</Label>
                <Input
                  id="reference"
                  placeholder="Ex: BON-2026-001"
                  value={form.reference}
                  onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="academicYear">Année scolaire</Label>
                <Input
                  id="academicYear"
                  placeholder="Ex: 2025-2026"
                  value={form.academicYear}
                  onChange={(e) => setForm((f) => ({ ...f, academicYear: e.target.value }))}
                />
              </div>
            </div>

            {/* Note */}
            <div className="space-y-1.5">
              <Label htmlFor="note">Note (optionnel)</Label>
              <Input
                id="note"
                placeholder="Commentaire libre..."
                value={form.note}
                onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
              />
            </div>
          </div>

          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Annuler
            </Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? "Enregistrement..." : editingExpense ? "Modifier" : "Enregistrer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog confirmation suppression ── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette dépense ?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{deleteTarget?.description}</strong> —{" "}
              {deleteTarget ? formatCurrency(deleteTarget.amount) : ""}
              <br />
              Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive hover:bg-destructive/90"
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
