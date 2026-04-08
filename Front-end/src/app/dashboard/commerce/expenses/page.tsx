"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import * as storage from "@/lib/storage";
import {
  getExpenses, createExpense, deleteExpense, CommerceExpense,
} from "@/lib/api/commerce.service";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Trash2, TrendingDown, Calendar, Filter } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

const CATEGORIES = [
  { value: "loyer",        label: "Loyer",          color: "bg-red-100 text-red-700" },
  { value: "salaire",      label: "Salaire",         color: "bg-purple-100 text-purple-700" },
  { value: "transport",    label: "Transport",       color: "bg-blue-100 text-blue-700" },
  { value: "achat_divers", label: "Achat divers",    color: "bg-orange-100 text-orange-700" },
  { value: "electricite",  label: "Électricité",     color: "bg-yellow-100 text-yellow-700" },
  { value: "eau",          label: "Eau",             color: "bg-cyan-100 text-cyan-700" },
  { value: "telephone",    label: "Téléphone/Internet", color: "bg-indigo-100 text-indigo-700" },
  { value: "autre",        label: "Autre",           color: "bg-gray-100 text-gray-700" },
];

const _gnf = new Intl.NumberFormat("fr-GN");
const fmt = (n: number) => _gnf.format(Math.round(n)) + " GNF";
const token = () => storage.getAuthItem("structura_token") ?? "";
const currentMonth = () => new Date().toISOString().slice(0, 7);

const CACHE_KEY = (tid: string, month: string) => `structura_commerce_expenses_${tid}_${month}`;
function readCache(tid: string, month: string): CommerceExpense[] | undefined {
  try { const r = localStorage.getItem(CACHE_KEY(tid, month)); return r ? JSON.parse(r) : undefined; } catch { return undefined; }
}
function writeCache(tid: string, month: string, data: CommerceExpense[]) {
  try { localStorage.setItem(CACHE_KEY(tid, month), JSON.stringify(data)); } catch { /* quota */ }
}

export default function ExpensesPage() {
  const { user } = useAuth();
  const tid = user?.tenantId;
  const queryClient = useQueryClient();

  const [month, setMonth] = useState(currentMonth());
  const [showDialog, setShowDialog] = useState(false);
  const [form, setForm] = useState({ amount: "", category: "", description: "", date: new Date().toISOString().slice(0, 10) });

  const { data: expenses = [], isLoading } = useQuery({
    queryKey: ["commerce-expenses", tid, month],
    queryFn: async () => {
      const result = await getExpenses(token(), { month });
      if (tid) writeCache(tid as string, month, result);
      return result;
    },
    enabled: !!user,
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    placeholderData: () => (tid ? readCache(tid as string, month) ?? [] : []),
  });

  const createMutation = useMutation({
    mutationFn: () => createExpense(token(), {
      amount: parseFloat(form.amount),
      category: form.category,
      description: form.description || undefined,
      date: form.date,
    }),
    onSuccess: (created) => {
      const updated = queryClient.setQueryData<CommerceExpense[]>(["commerce-expenses", tid, month], (old = []) =>
        [created, ...old].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      );
      if (tid && updated) writeCache(tid as string, month, updated);
      queryClient.invalidateQueries({ queryKey: ["commerce-dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["commerce-daily"] });
      toast.success("Dépense enregistrée");
      setShowDialog(false);
      setForm({ amount: "", category: "", description: "", date: new Date().toISOString().slice(0, 10) });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteExpense(token(), id),
    onMutate: async (id) => {
      const prev = queryClient.getQueryData<CommerceExpense[]>(["commerce-expenses", tid, month]);
      const updated = queryClient.setQueryData<CommerceExpense[]>(["commerce-expenses", tid, month], (old = []) =>
        old.filter((e) => e.id !== id)
      );
      if (tid && updated) writeCache(tid as string, month, updated);
      return { prev };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["commerce-dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["commerce-daily"] });
      toast.success("Dépense supprimée");
    },
    onError: (_e, _id, ctx: any) => {
      if (ctx?.prev) queryClient.setQueryData(["commerce-expenses", tid, month], ctx.prev);
      toast.error("Erreur lors de la suppression");
    },
  });

  const total = expenses.reduce((s, e) => s + e.amount, 0);

  const byCategory = expenses.reduce<Record<string, number>>((acc, e) => {
    acc[e.category] = (acc[e.category] ?? 0) + e.amount;
    return acc;
  }, {});

  const getCatInfo = (value: string) =>
    CATEGORIES.find((c) => c.value === value) ?? { label: value, color: "bg-gray-100 text-gray-700" };

  const canSave = form.amount && parseFloat(form.amount) > 0 && form.category && form.date;

  return (
    <ProtectedRoute>
      <div className="space-y-6 p-4 md:p-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Dépenses</h1>
            <p className="text-sm text-muted-foreground">Loyer, salaires, transport, achats divers…</p>
          </div>
          <Button onClick={() => setShowDialog(true)} className="bg-orange-600 hover:bg-orange-700 text-white gap-2">
            <Plus className="h-4 w-4" /> Ajouter
          </Button>
        </div>

        {/* Filtre mois */}
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-44 h-9" />
        </div>

        {/* Total + répartition */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-l-4 border-l-red-500 col-span-1 sm:col-span-2 lg:col-span-1">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-red-500" /> Total ce mois
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-red-600">{fmt(total)}</p>
              <p className="text-xs text-muted-foreground mt-1">{expenses.length} dépense{expenses.length > 1 ? "s" : ""}</p>
            </CardContent>
          </Card>

          {Object.entries(byCategory)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([cat, amt]) => {
              const info = getCatInfo(cat);
              return (
                <Card key={cat}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">{info.label}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xl font-bold">{fmt(amt)}</p>
                    <p className="text-xs text-muted-foreground mt-1">{Math.round((amt / total) * 100)}% du total</p>
                  </CardContent>
                </Card>
              );
            })}
        </div>

        {/* Liste */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="divide-y">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-4 px-4 py-3">
                    <Skeleton className="h-8 w-20 rounded-full" />
                    <div className="flex-1 space-y-1">
                      <Skeleton className="h-4 w-40" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                    <Skeleton className="h-5 w-24" />
                  </div>
                ))}
              </div>
            ) : expenses.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">Aucune dépense ce mois</div>
            ) : (
              <div className="divide-y">
                {expenses.map((exp) => {
                  const info = getCatInfo(exp.category);
                  return (
                    <div key={exp.id} className="flex items-center gap-4 px-4 py-3 hover:bg-muted/30 transition-colors">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge className={`text-xs ${info.color} border-0`}>{info.label}</Badge>
                          {exp.description && (
                            <span className="text-sm text-muted-foreground truncate">{exp.description}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          {format(new Date(exp.date), "d MMMM yyyy", { locale: fr })}
                        </div>
                      </div>
                      <p className="font-bold text-red-600 shrink-0">{fmt(exp.amount)}</p>
                      <Button
                        variant="ghost" size="icon"
                        className="shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() => deleteMutation.mutate(exp.id)}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Dialog ajout */}
        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Nouvelle dépense</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1">
                <Label>Montant (GNF)</Label>
                <NumberInput
                  placeholder="Ex: 500 000"
                  value={form.amount ? parseFloat(form.amount) : null}
                  onChange={(v) => setForm((f) => ({ ...f, amount: v != null ? String(v) : "" }))}
                  autoFocus
                />
              </div>
              <div className="space-y-1">
                <Label>Catégorie</Label>
                <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
                  <SelectTrigger><SelectValue placeholder="Choisir…" /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Description <span className="text-muted-foreground text-xs">(optionnel)</span></Label>
                <Input
                  placeholder="Ex: Loyer boutique janvier…"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Date</Label>
                <Input
                  type="date" value={form.date}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                />
              </div>
              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1" onClick={() => setShowDialog(false)}>Annuler</Button>
                <Button
                  className="flex-1 bg-orange-600 hover:bg-orange-700 text-white"
                  onClick={() => createMutation.mutate()}
                  disabled={!canSave || createMutation.isPending}
                >
                  {createMutation.isPending ? "Enregistrement…" : "Enregistrer"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </ProtectedRoute>
  );
}
