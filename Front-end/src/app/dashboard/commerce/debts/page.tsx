"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import * as storage from "@/lib/storage";
import {
  getCustomers,
  payCustomerDebt,
  type CommerceCustomer,
} from "@/lib/api/commerce.service";
import { toast } from "sonner";
import {
  AlertTriangle,
  Search,
  Phone,
  Banknote,
  CheckCircle2,
  ChevronRight,
  X,
  TrendingDown,
  Clock,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatGNF(n: number) {
  return new Intl.NumberFormat("fr-GN").format(Math.round(n)) + " GNF";
}

function roundGNF(n: number) {
  return Math.round(n / 500) * 500;
}

function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Aujourd'hui";
  if (days === 1) return "Hier";
  if (days < 30) return `Il y a ${days}j`;
  const months = Math.floor(days / 30);
  return `Il y a ${months}m`;
}

// ─── Cache ────────────────────────────────────────────────────────────────────

const CACHE_KEY = (tid: string) => `structura_commerce_customers_${tid}`;

function readCache(tid: string): CommerceCustomer[] | undefined {
  try { const r = localStorage.getItem(CACHE_KEY(tid)); return r ? JSON.parse(r) : undefined; }
  catch { return undefined; }
}
function writeCache(tid: string, data: CommerceCustomer[]) {
  try { localStorage.setItem(CACHE_KEY(tid), JSON.stringify(data)); } catch { /* quota */ }
}

const SHORTCUTS = [5000, 10000, 20000, 50000, 100000];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DebtsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const tid = user?.tenantId ?? "";
  const token = () => storage.getAuthItem("structura_token") ?? "";

  const [search, setSearch] = useState("");
  const [payingCustomer, setPayingCustomer] = useState<CommerceCustomer | null>(null);
  const [payAmount, setPayAmount] = useState("");

  // ─── Données ────────────────────────────────────────────────────────────────

  const { data: allCustomers = [], isLoading } = useQuery<CommerceCustomer[]>({
    queryKey: ["commerce-customers", tid],
    queryFn: async () => {
      const result = await getCustomers(token());
      writeCache(tid, result);
      return result;
    },
    enabled: !!user,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    placeholderData: () => readCache(tid),
  });

  const debtors = allCustomers
    .filter((c) => c.totalDebt > 0)
    .sort((a, b) => b.totalDebt - a.totalDebt);

  const filtered = debtors.filter((c) => {
    const q = search.toLowerCase();
    return !q || c.name.toLowerCase().includes(q) || (c.phone ?? "").includes(q);
  });

  const totalDebt = debtors.reduce((s, c) => s + c.totalDebt, 0);

  // ─── Paiement ───────────────────────────────────────────────────────────────

  const payMutation = useMutation({
    mutationFn: ({ id, amount }: { id: string; amount: number }) =>
      payCustomerDebt(token(), id, amount),
    onMutate: async ({ id, amount }) => {
      await queryClient.cancelQueries({ queryKey: ["commerce-customers", tid] });
      const prev = queryClient.getQueryData<CommerceCustomer[]>(["commerce-customers", tid]);
      queryClient.setQueryData<CommerceCustomer[]>(["commerce-customers", tid], (old = []) =>
        old.map((c) =>
          c.id === id ? { ...c, totalDebt: Math.max(0, c.totalDebt - amount) } : c
        )
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["commerce-customers", tid], ctx.prev);
      toast.error("Erreur lors de l'enregistrement");
    },
    onSuccess: (res) => {
      toast.success(
        `Paiement de ${formatGNF(res.amountPaid)} enregistré` +
        (res.remainingDebt > 0 ? ` — Reste : ${formatGNF(res.remainingDebt)}` : " ✓")
      );
      const updated = queryClient.getQueryData<CommerceCustomer[]>(["commerce-customers", tid]);
      if (updated) writeCache(tid, updated);
      closePay();
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["commerce-customers", tid] });
      queryClient.invalidateQueries({ queryKey: ["commerce-dashboard"] });
    },
  });

  const openPay = (customer: CommerceCustomer) => {
    setPayingCustomer(customer);
    setPayAmount(String(roundGNF(customer.totalDebt)));
  };

  const closePay = () => {
    setPayingCustomer(null);
    setPayAmount("");
  };

  const handlePay = () => {
    if (!payingCustomer) return;
    const amount = parseFloat(payAmount);
    if (!amount || amount <= 0) { toast.error("Montant invalide"); return; }
    payMutation.mutate({ id: payingCustomer.id, amount });
  };

  // ─── Rendu ──────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">

      {/* En-tête */}
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <div className="h-10 w-10 rounded-xl bg-amber-100 flex items-center justify-center">
            <AlertTriangle className="h-6 w-6 text-amber-600" />
          </div>
          Dettes clients
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Suivi des dettes et remboursements</p>
      </div>

      {/* Cartes résumé */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl border bg-amber-50 border-amber-200 p-4">
          <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2">
            Total dû
          </p>
          <p className="text-3xl font-bold text-amber-700 tabular-nums">
            {isLoading ? "…" : formatGNF(totalDebt)}
          </p>
        </div>
        <div className="rounded-2xl border bg-card p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Clients endettés
          </p>
          <p className="text-3xl font-bold tabular-nums">
            {isLoading ? "…" : debtors.length}
          </p>
        </div>
        <div className="rounded-2xl border bg-card p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Moyenne par client
          </p>
          <p className="text-2xl font-bold tabular-nums">
            {isLoading || debtors.length === 0 ? "—" : formatGNF(totalDebt / debtors.length)}
          </p>
        </div>
      </div>

      {/* Recherche */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Rechercher par nom ou téléphone..."
          className="pl-9 h-10"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Liste */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-22 rounded-2xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
          {debtors.length === 0 ? (
            <>
              <div className="h-16 w-16 rounded-2xl bg-emerald-100 flex items-center justify-center">
                <CheckCircle2 className="h-8 w-8 text-emerald-600" />
              </div>
              <div className="text-center">
                <p className="font-semibold">Aucune dette en cours</p>
                <p className="text-xs mt-1 text-muted-foreground">Tous les clients sont à jour</p>
              </div>
            </>
          ) : (
            <>
              <AlertTriangle className="h-10 w-10 opacity-30" />
              <p className="text-sm">Aucun résultat pour &quot;{search}&quot;</p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((customer) => {
            const debtLevel =
              customer.totalDebt >= 500000 ? "high"
              : customer.totalDebt >= 100000 ? "medium"
              : "low";

            return (
              <div
                key={customer.id}
                className={cn(
                  "flex items-center gap-4 p-4 rounded-2xl border-2 bg-card transition-all hover:shadow-sm",
                  debtLevel === "high" ? "border-red-200"
                  : debtLevel === "medium" ? "border-amber-200"
                  : "border-border"
                )}
              >
                {/* Avatar */}
                <div className={cn(
                  "h-12 w-12 rounded-xl flex items-center justify-center shrink-0 font-bold text-lg",
                  debtLevel === "high" ? "bg-red-100 text-red-700"
                  : debtLevel === "medium" ? "bg-amber-100 text-amber-700"
                  : "bg-muted text-muted-foreground"
                )}>
                  {customer.name.charAt(0).toUpperCase()}
                </div>

                {/* Infos */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-sm">{customer.name}</p>
                    {debtLevel === "high" && (
                      <Zap className="h-3.5 w-3.5 text-red-600" />
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    {customer.phone && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        {customer.phone}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {timeAgo(customer.createdAt)}
                    </span>
                  </div>
                </div>

                {/* Montant */}
                <div className="text-right shrink-0">
                  <p className={cn(
                    "font-bold text-lg tabular-nums",
                    debtLevel === "high" ? "text-red-600"
                    : debtLevel === "medium" ? "text-amber-600"
                    : "text-foreground"
                  )}>
                    {formatGNF(customer.totalDebt)}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">doit encore</p>
                </div>

                {/* Bouton */}
                <Button
                  size="sm"
                  onClick={() => openPay(customer)}
                  className="shrink-0 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl gap-1.5 h-10 px-3"
                >
                  <Banknote className="h-4 w-4" />
                  Paiement
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Dialog paiement ────────────────────────────────────────────────── */}
      <Dialog open={!!payingCustomer} onOpenChange={(o) => !o && closePay()}>
        <DialogContent className="max-w-sm p-0 overflow-hidden gap-0">
          <DialogHeader className="px-5 pt-5 pb-4 border-b">
            <DialogTitle className="flex items-center gap-2 text-base">
              <Banknote className="h-4 w-4 text-emerald-600" />
              Enregistrer un paiement
            </DialogTitle>
          </DialogHeader>

          {payingCustomer && (
            <div className="px-5 py-4 space-y-5 overflow-y-auto max-h-[calc(100vh-200px)]">

              {/* Info client */}
              <div className="flex items-center gap-3 p-3 rounded-xl bg-amber-50 border border-amber-200">
                <div className="h-10 w-10 rounded-xl bg-amber-100 text-amber-700 font-bold text-base flex items-center justify-center shrink-0">
                  {payingCustomer.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">{payingCustomer.name}</p>
                  {payingCustomer.phone && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <Phone className="h-3 w-3" />
                      {payingCustomer.phone}
                    </p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-muted-foreground">Dette totale</p>
                  <p className="font-bold text-amber-600 tabular-nums text-sm">
                    {formatGNF(payingCustomer.totalDebt)}
                  </p>
                </div>
              </div>

              {/* Montant */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2.5">
                  Montant reçu (GNF)
                </p>
                <Input
                  type="number"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  className="h-12 text-xl font-bold text-center rounded-xl border-2 focus-visible:ring-0 focus-visible:border-emerald-400"
                  placeholder="0"
                  autoFocus
                />
              </div>

              {/* Raccourcis */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2.5">Montants rapides</p>
                <div className="flex flex-wrap gap-2">
                  {SHORTCUTS.filter((s) => s <= payingCustomer.totalDebt + 1).map((s) => (
                    <button
                      key={s}
                      onClick={() => setPayAmount(String(s))}
                      className={cn(
                        "px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all",
                        parseFloat(payAmount) === s
                          ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                          : "border-border hover:border-emerald-300 hover:bg-emerald-50"
                      )}
                    >
                      {new Intl.NumberFormat("fr-GN").format(s)}
                    </button>
                  ))}
                  <button
                    onClick={() => setPayAmount(String(roundGNF(payingCustomer.totalDebt)))}
                    className={cn(
                      "px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all flex items-center gap-1",
                      parseFloat(payAmount) >= payingCustomer.totalDebt
                        ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                        : "border-border hover:border-emerald-300 hover:bg-emerald-50"
                    )}
                  >
                    <CheckCircle2 className="h-3 w-3" />
                    Tout
                  </button>
                </div>
              </div>

              {/* Aperçu */}
              {parseFloat(payAmount) > 0 && (
                <div className={cn(
                  "rounded-xl border-2 p-3",
                  parseFloat(payAmount) >= payingCustomer.totalDebt
                    ? "border-emerald-300 bg-emerald-50"
                    : "border-amber-200 bg-amber-50"
                )}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground flex items-center gap-1">
                      <TrendingDown className="h-3.5 w-3.5" />
                      Reste après paiement
                    </span>
                    <span className={cn(
                      "font-bold tabular-nums",
                      Math.max(0, payingCustomer.totalDebt - parseFloat(payAmount)) === 0
                        ? "text-emerald-600"
                        : "text-amber-600"
                    )}>
                      {formatGNF(Math.max(0, payingCustomer.totalDebt - parseFloat(payAmount)))}
                    </span>
                  </div>
                  {parseFloat(payAmount) >= payingCustomer.totalDebt && (
                    <p className="text-xs text-emerald-600 mt-2 flex items-center gap-1 font-medium">
                      <CheckCircle2 className="h-3 w-3" />
                      Solde intégralement remboursé
                    </p>
                  )}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1 rounded-xl"
                  onClick={closePay}
                >
                  Annuler
                </Button>
                <Button
                  className="flex-1 h-10 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                  onClick={handlePay}
                  disabled={payMutation.isPending || !parseFloat(payAmount)}
                >
                  {payMutation.isPending ? (
                    <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  ) : (
                    <span className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4" />
                      Confirmer
                    </span>
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
