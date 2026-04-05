"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import * as storage from "@/lib/storage";
import {
  getCustomers,
  payCustomerDebt,
  getSales,
  recordSalePayment,
  payAllSalesBatch,
  payCustomerAllDebt,
  getCustomerPaymentHistory,
  type CommerceCustomer,
  type CommerceSale,
} from "@/lib/api/commerce.service";
import { generateDebtPaymentReceiptPdf } from "@/lib/pdf-generator";
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
  Receipt,
  Printer,
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

const _gnf = new Intl.NumberFormat("fr-GN");
function formatGNF(n: number) {
  return _gnf.format(Math.round(n)) + " GNF";
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
  const [payingSale, setPayingSale] = useState<CommerceSale | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [activeTab, setActiveTab] = useState<"clients" | "sales">("clients");
  const [expandedSaleCustomer, setExpandedSaleCustomer] = useState<string | null>(null);
  const [payingAllCustomer, setPayingAllCustomer] = useState<CommerceCustomer | null>(null);
  const [payingAllSalesGroup, setPayingAllSalesGroup] = useState<{ id: string; saleIds: string[] } | null>(null);
  const [consolidatedReceipt, setConsolidatedReceipt] = useState<any | null>(null);
  const [debtReceipt, setDebtReceipt] = useState<any | null>(null);
  const [showPaymentHistory, setShowPaymentHistory] = useState<string | null>(null);

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

  // Ventes partielles (reste à payer)
  const { data: allSales = { data: [], total: 0 }, isLoading: isSalesLoading } = useQuery({
    queryKey: ["commerce-sales-pending", tid],
    queryFn: async () => {
      // Récupérer les ventes des 90 derniers jours
      const today = new Date();
      const ninetyDaysAgo = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000);
      const fromDate = ninetyDaysAgo.toISOString().split('T')[0];

      return getSales(token(), { limit: 100 });
    },
    enabled: !!user,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });

  const pendingSales = (allSales?.data ?? [])
    .filter((s) => s.remainingDebt > 0 && s.status !== "CANCELLED")
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const totalPendingDebt = pendingSales.reduce((s, sale) => s + sale.remainingDebt, 0);

  // Grouper les ventes par client/anonyme
  const salesByCustomer = pendingSales.reduce((acc, sale) => {
    const key = sale.customerId || "anonymous";
    if (!acc[key]) {
      acc[key] = {
        customerName: sale.customer?.name || "Client anonyme",
        sales: [],
        totalRemaining: 0,
      };
    }
    acc[key].sales.push(sale);
    acc[key].totalRemaining += sale.remainingDebt;
    return acc;
  }, {} as Record<string, { customerName: string; sales: CommerceSale[]; totalRemaining: number }>);

  const salesCustomerList = Object.entries(salesByCustomer).map(([key, data]) => ({
    id: key,
    ...data,
  }));

  // ─── Paiement ───────────────────────────────────────────────────────────────

  const payMutation = useMutation<any, Error, { id: string; amount: number; type: "customer" | "sale" }>({
    mutationFn: ({ id, amount, type }: { id: string; amount: number; type: "customer" | "sale" }) => {
      if (type === "customer") {
        return payCustomerDebt(token(), id, amount);
      } else {
        return recordSalePayment(token(), id, amount);
      }
    },
    onMutate: async ({ id, amount, type }: any) => {
      // Capturer les infos avant fermeture du dialog
      const customerSnapshot = payingCustomer;
      const saleSnapshot = payingSale;
      const amountSnapshot = parseFloat(payAmount);
      const previousDebtSnapshot = payingCustomer ? payingCustomer.totalDebt : (payingSale?.remainingDebt ?? 0);
      const remainingEstimated = Math.max(previousDebtSnapshot - amountSnapshot, 0);

      // Afficher le reçu IMMÉDIATEMENT — pas d'attente réseau
      setDebtReceipt({
        amountPaid: amountSnapshot,
        customerName: customerSnapshot?.name ?? saleSnapshot?.customer?.name ?? "Client anonyme",
        receiptNumber: saleSnapshot?.receiptNumber ?? null,
        remainingDebt: remainingEstimated,
        previousDebt: previousDebtSnapshot,
        paidAt: new Date().toISOString(),
      });

      closePay();

      if (type === "customer") {
        await queryClient.cancelQueries({ queryKey: ["commerce-customers", tid] });
        const prev = queryClient.getQueryData<CommerceCustomer[]>(["commerce-customers", tid]);
        queryClient.setQueryData<CommerceCustomer[]>(["commerce-customers", tid], (old = []) =>
          old.map((c) =>
            c.id === id ? { ...c, totalDebt: Math.max(0, c.totalDebt - amount) } : c
          )
        );
        return { prev, type, remainingEstimated };
      } else {
        await queryClient.cancelQueries({ queryKey: ["commerce-sales-pending", tid] });
        const prev = queryClient.getQueryData(["commerce-sales-pending", tid]);
        return { prev, type, remainingEstimated };
      }
    },
    onError: (_e, _v, ctx: any) => {
      // Rollback cache
      if (ctx?.type === "customer" && ctx?.prev) {
        queryClient.setQueryData(["commerce-customers", tid], ctx.prev);
      } else if (ctx?.type === "sale" && ctx?.prev) {
        queryClient.setQueryData(["commerce-sales-pending", tid], ctx.prev);
      }
      // Fermer le reçu optimiste car l'opération a échoué
      setDebtReceipt(null);
      toast.error("Erreur lors de l'enregistrement");
    },
    onSuccess: (res, _vars, ctx: any) => {
      // Mettre à jour le reçu avec le vrai solde retourné par l'API
      const remainingDebt = "remainingDebt" in res ? res.remainingDebt : (ctx?.remainingEstimated ?? 0);
      setDebtReceipt((prev: any) => prev ? { ...prev, remainingDebt } : prev);
      toast.success(
        `Paiement enregistré — Reste : ${formatGNF(remainingDebt)}` +
        (remainingDebt === 0 ? " ✓" : "")
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["commerce-customers", tid] });
      queryClient.invalidateQueries({ queryKey: ["commerce-sales-pending", tid] });
      queryClient.invalidateQueries({ queryKey: ["commerce-dashboard"] });
    },
  });

  const payAllMutation = useMutation<any, Error, { customerId?: string; saleIds?: string[] }>({
    mutationFn: async ({ customerId, saleIds }: any) => {
      if (customerId) {
        return payCustomerAllDebt(token(), customerId);
      } else if (saleIds) {
        return payAllSalesBatch(token(), saleIds);
      }
      throw new Error("Données invalides");
    },
    onMutate: async ({ customerId, saleIds }: any) => {
      // Fermer immédiatement
      closePayAll();
      if (customerId) {
        await queryClient.cancelQueries({ queryKey: ["commerce-customers", tid] });
        const prev = queryClient.getQueryData<CommerceCustomer[]>(["commerce-customers", tid]);
        queryClient.setQueryData<CommerceCustomer[]>(["commerce-customers", tid], (old = []) =>
          old.map((c) => (c.id === customerId ? { ...c, totalDebt: 0 } : c))
        );
        return { prev, type: "customer" };
      } else {
        await queryClient.cancelQueries({ queryKey: ["commerce-sales-pending", tid] });
        const prev = queryClient.getQueryData(["commerce-sales-pending", tid]);
        return { prev, type: "sale" };
      }
    },
    onError: (_e, _v, ctx: any) => {
      if (ctx?.type === "customer" && ctx?.prev) {
        queryClient.setQueryData(["commerce-customers", tid], ctx.prev);
      } else if (ctx?.type === "sale" && ctx?.prev) {
        queryClient.setQueryData(["commerce-sales-pending", tid], ctx.prev);
      }
      toast.error("Erreur lors du paiement consolidé");
    },
    onSuccess: (res) => {
      setConsolidatedReceipt(res);
      if ("amountPaid" in res) {
        toast.success(
          `Paiement consolidé réussi — ${formatGNF(res.amountPaid)} payés ✓`
        );
      } else if ("totalPaid" in res) {
        toast.success(
          `${res.salesCount} vente(s) payée(s) — ${formatGNF(res.totalPaid)} ✓`
        );
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["commerce-customers", tid] });
      queryClient.invalidateQueries({ queryKey: ["commerce-sales-pending", tid] });
      queryClient.invalidateQueries({ queryKey: ["commerce-dashboard"] });
    },
  });

  const openPay = (customer: CommerceCustomer) => {
    setPayingCustomer(customer);
    setPayAmount(String(roundGNF(customer.totalDebt)));
  };

  const closePay = () => {
    setPayingCustomer(null);
    setPayingSale(null);
    setPayAmount("");
  };

  const handlePay = () => {
    const amount = parseFloat(payAmount);
    if (!amount || amount <= 0) { toast.error("Montant invalide"); return; }
    const maxAmount = payingCustomer ? payingCustomer.totalDebt : (payingSale?.remainingDebt ?? 0);
    if (amount > maxAmount) {
      toast.error(`Montant trop élevé — le client ne doit que ${formatGNF(maxAmount)}`);
      return;
    }
    if (payingCustomer) {
      payMutation.mutate({ id: payingCustomer.id, amount, type: "customer" });
    } else if (payingSale) {
      payMutation.mutate({ id: payingSale.id, amount, type: "sale" });
    }
  };

  const openPayAll = (customer: CommerceCustomer) => {
    setPayingAllCustomer(customer);
  };

  const openPayAllSales = (groupId: string, saleIds: string[]) => {
    setPayingAllSalesGroup({ id: groupId, saleIds });
  };

  const closePayAll = () => {
    setPayingAllCustomer(null);
    setPayingAllSalesGroup(null);
  };

  const handlePayAll = async () => {
    if (payingAllCustomer) {
      payAllMutation.mutate({ customerId: payingAllCustomer.id });
    } else if (payingAllSalesGroup) {
      payAllMutation.mutate({ saleIds: payingAllSalesGroup.saleIds });
    }
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
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="rounded-2xl border bg-amber-50 border-amber-200 p-4">
          <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2">
            Total dû (clients)
          </p>
          <p className="text-2xl font-bold text-amber-700 tabular-nums">
            {isLoading ? "…" : formatGNF(totalDebt)}
          </p>
        </div>
        <div className="rounded-2xl border bg-red-50 border-red-200 p-4">
          <p className="text-xs font-semibold text-red-700 uppercase tracking-wide mb-2">
            Total (ventes partielles)
          </p>
          <p className="text-2xl font-bold text-red-700 tabular-nums">
            {isSalesLoading ? "…" : formatGNF(totalPendingDebt)}
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
            Ventes en attente
          </p>
          <p className="text-3xl font-bold tabular-nums">
            {isSalesLoading ? "…" : pendingSales.length}
          </p>
        </div>
      </div>

      {/* Onglets */}
      <div className="flex gap-2 border-b">
        <button
          onClick={() => setActiveTab("clients")}
          className={`px-4 py-2 font-semibold border-b-2 transition-all ${
            activeTab === "clients"
              ? "border-orange-600 text-orange-600"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Clients ({debtors.length})
        </button>
        <button
          onClick={() => setActiveTab("sales")}
          className={`px-4 py-2 font-semibold border-b-2 transition-all flex items-center gap-2 ${
            activeTab === "sales"
              ? "border-orange-600 text-orange-600"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Receipt className="h-4 w-4" />
          Ventes partielles ({pendingSales.length})
        </button>
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
      {activeTab === "clients" && (isLoading ? (
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

                {/* Boutons */}
                <div className="flex gap-2 shrink-0">
                  <Button
                    size="sm"
                    onClick={() => openPay(customer)}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl gap-1.5 h-10 px-3"
                  >
                    <Banknote className="h-4 w-4" />
                    Paiement
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => openPayAll(customer)}
                    className="bg-orange-600 hover:bg-orange-700 text-white rounded-xl gap-1.5 h-10 px-3"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Payer tout
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      ))}

      {/* Onglet Ventes partielles */}
      {activeTab === "sales" && (isSalesLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-2xl" />
          ))}
        </div>
      ) : pendingSales.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
          <div className="h-16 w-16 rounded-2xl bg-emerald-100 flex items-center justify-center">
            <CheckCircle2 className="h-8 w-8 text-emerald-600" />
          </div>
          <div className="text-center">
            <p className="font-semibold">Aucune vente partiellement payée</p>
            <p className="text-xs mt-1 text-muted-foreground">Toutes les ventes sont complètes</p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {salesCustomerList.map((group) => (
            <div
              key={group.id}
              className="rounded-2xl border-2 border-red-200 bg-red-50 overflow-hidden"
            >
              {/* En-tête client */}
              <div className="flex items-center justify-between px-4 py-4 hover:bg-red-100/50 transition-colors border-b">
                <button
                  onClick={() => setExpandedSaleCustomer(expandedSaleCustomer === group.id ? null : group.id)}
                  className="flex-1 flex items-center gap-4 min-w-0 text-left"
                >
                  <div className="h-12 w-12 rounded-xl bg-red-100 flex items-center justify-center shrink-0 font-bold text-red-700">
                    {group.customerName.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm">{group.customerName}</p>
                    <p className="text-xs text-muted-foreground">{group.sales.length} vente{group.sales.length > 1 ? "s" : ""}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-bold text-red-600 tabular-nums">
                      {formatGNF(group.totalRemaining)}
                    </p>
                    <p className="text-xs text-muted-foreground">à payer</p>
                  </div>
                  <ChevronRight className={`h-5 w-5 text-muted-foreground shrink-0 transition-transform ${expandedSaleCustomer === group.id ? "rotate-90" : ""}`} />
                </button>
                <Button
                  size="sm"
                  onClick={() => openPayAllSales(group.id, group.sales.map(s => s.id))}
                  className="shrink-0 bg-orange-600 hover:bg-orange-700 text-white rounded-lg h-9 px-3 ml-2"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Payer tout
                </Button>
              </div>

              {/* Ventes groupées */}
              {expandedSaleCustomer === group.id && (
                <div className="border-t divide-y">
                  {group.sales.map((sale) => (
                    <div key={sale.id} className="p-4 flex items-center justify-between hover:bg-red-100/30">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-mono text-muted-foreground">{sale.receiptNumber}</span>
                          <span className="text-xs text-muted-foreground">{new Date(sale.createdAt).toLocaleDateString("fr-FR")}</span>
                        </div>
                        <div className="text-sm">
                          <span className="text-muted-foreground">Total: </span>
                          <span className="font-semibold">{formatGNF(sale.totalAmount)}</span>
                        </div>
                      </div>
                      <div className="text-right mx-4">
                        <p className="text-sm font-bold text-red-600 tabular-nums">
                          {formatGNF(sale.remainingDebt)}
                        </p>
                        <p className="text-xs text-muted-foreground">Reste</p>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => {
                          setPayingSale(sale);
                          setPayAmount(String(roundGNF(sale.remainingDebt)));
                        }}
                        className="shrink-0 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg h-9 px-3"
                      >
                        Payer
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      ))}

      {/* ── Dialog paiement ────────────────────────────────────────────────── */}
      <Dialog open={!!payingCustomer || !!payingSale} onOpenChange={(o) => !o && closePay()}>
        <DialogContent className="w-[calc(100vw-1rem)] max-w-sm max-h-[95dvh] p-0 overflow-hidden gap-0">
          <DialogHeader className="px-5 pt-5 pb-4 border-b">
            <DialogTitle className="flex items-center gap-2 text-base">
              <Banknote className="h-4 w-4 text-emerald-600" />
              {payingSale ? "Compléter le paiement" : "Enregistrer un paiement"}
            </DialogTitle>
          </DialogHeader>

          {(payingCustomer || payingSale) && (
            <div className="px-5 py-4 space-y-5 overflow-y-auto max-h-[calc(100vh-200px)]">

              {/* Info client ou vente */}
              {payingCustomer ? (
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
                    <p className="text-xs text-muted-foreground">Total dû</p>
                    <p className="font-bold text-amber-600 tabular-nums text-sm">
                      {formatGNF(payingCustomer.totalDebt)}
                    </p>
                  </div>
                </div>
              ) : payingSale ? (
                <div className="flex items-center gap-3 p-3 rounded-xl bg-red-50 border border-red-200">
                  <div className="h-10 w-10 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
                    <Receipt className="h-5 w-5 text-red-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm">{payingSale.receiptNumber}</p>
                    <p className="text-xs text-muted-foreground">{payingSale.customer?.name ?? "Client anonyme"}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-muted-foreground">Reste</p>
                    <p className="font-bold text-red-600 tabular-nums text-sm">
                      {formatGNF(payingSale.remainingDebt)}
                    </p>
                  </div>
                </div>
              ) : null}

              {/* Montant */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2.5">
                  Montant reçu (GNF)
                </p>
                {(() => {
                  const maxAmount = payingCustomer ? payingCustomer.totalDebt : (payingSale?.remainingDebt ?? 0);
                  const amount = parseFloat(payAmount) || 0;
                  const isOver = amount > maxAmount;
                  return (
                    <>
                      <Input
                        type="number"
                        value={payAmount}
                        onChange={(e) => setPayAmount(e.target.value)}
                        className={cn(
                          "h-12 text-xl font-bold text-center rounded-xl border-2 focus-visible:ring-0",
                          isOver
                            ? "border-red-400 bg-red-50 text-red-600 focus-visible:border-red-500"
                            : "focus-visible:border-emerald-400"
                        )}
                        placeholder="0"
                        autoFocus
                      />
                      {isOver && (
                        <p className="text-xs text-red-600 font-medium mt-1.5 flex items-center gap-1">
                          ⚠ Montant trop élevé — maximum {formatGNF(maxAmount)}
                        </p>
                      )}
                    </>
                  );
                })()}
              </div>

              {/* Raccourcis */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2.5">Montants rapides</p>
                <div className="flex flex-wrap gap-2">
                  {(() => {
                    const maxAmount = payingCustomer ? payingCustomer.totalDebt : (payingSale?.remainingDebt ?? 0);
                    return SHORTCUTS.filter((s) => s <= maxAmount + 1).map((s) => (
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
                        {_gnf.format(s)}
                      </button>
                    ));
                  })()}
                  <button
                    onClick={() => {
                      const maxAmount = payingCustomer ? payingCustomer.totalDebt : (payingSale?.remainingDebt ?? 0);
                      setPayAmount(String(roundGNF(maxAmount)));
                    }}
                    className={cn(
                      "px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all flex items-center gap-1",
                      (() => {
                        const maxAmount = payingCustomer ? payingCustomer.totalDebt : (payingSale?.remainingDebt ?? 0);
                        return parseFloat(payAmount) >= maxAmount
                          ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                          : "border-border hover:border-emerald-300 hover:bg-emerald-50";
                      })()
                    )}
                  >
                    <CheckCircle2 className="h-3 w-3" />
                    Tout
                  </button>
                </div>
              </div>

              {/* Aperçu */}
              {parseFloat(payAmount) > 0 && (
                (() => {
                  const maxAmount = payingCustomer ? payingCustomer.totalDebt : (payingSale?.remainingDebt ?? 0);
                  const remaining = Math.max(0, maxAmount - parseFloat(payAmount));
                  const isPaid = remaining === 0;
                  return (
                    <div className={cn(
                      "rounded-xl border-2 p-3",
                      parseFloat(payAmount) >= maxAmount
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
                          isPaid
                        ? "text-emerald-600"
                        : "text-amber-600"
                    )}>
                      {formatGNF(remaining)}
                    </span>
                  </div>
                  {isPaid && (
                    <p className="text-xs text-emerald-600 mt-2 flex items-center gap-1 font-medium">
                      <CheckCircle2 className="h-3 w-3" />
                      Solde intégralement remboursé
                    </p>
                  )}
                    </div>
                  );
                })()
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
                  disabled={payMutation.isPending || !parseFloat(payAmount) || (() => {
                    const maxAmount = payingCustomer ? payingCustomer.totalDebt : (payingSale?.remainingDebt ?? 0);
                    return parseFloat(payAmount) > maxAmount;
                  })()}
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

      {/* ── Dialog paiement consolidé ─────────────────────────────────────── */}
      <Dialog open={!!payingAllCustomer || !!payingAllSalesGroup} onOpenChange={(o) => !o && closePayAll()}>
        <DialogContent className="w-[calc(100vw-1rem)] max-w-sm max-h-[95dvh] p-0 overflow-hidden gap-0">
          <DialogHeader className="px-5 pt-5 pb-4 border-b">
            <DialogTitle className="flex items-center gap-2 text-base">
              <CheckCircle2 className="h-4 w-4 text-orange-600" />
              Paiement consolidé
            </DialogTitle>
          </DialogHeader>

          {(payingAllCustomer || payingAllSalesGroup) && (
            <div className="px-5 py-4 space-y-4 overflow-y-auto max-h-[calc(100vh-200px)]">

              {/* Info */}
              {payingAllCustomer ? (
                <div className="flex items-center gap-3 p-3 rounded-xl bg-amber-50 border border-amber-200">
                  <div className="h-10 w-10 rounded-xl bg-amber-100 text-amber-700 font-bold text-base flex items-center justify-center shrink-0">
                    {payingAllCustomer.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm">{payingAllCustomer.name}</p>
                    <p className="text-xs text-muted-foreground">Paiement de toutes les dettes</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-muted-foreground">Total dû</p>
                    <p className="font-bold text-amber-600 tabular-nums text-sm">
                      {formatGNF(payingAllCustomer.totalDebt)}
                    </p>
                  </div>
                </div>
              ) : payingAllSalesGroup ? (
                <div className="flex items-center gap-3 p-3 rounded-xl bg-red-50 border border-red-200">
                  <div className="h-10 w-10 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
                    <Receipt className="h-5 w-5 text-red-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm">{salesByCustomer[payingAllSalesGroup.id]?.customerName || "Client"}</p>
                    <p className="text-xs text-muted-foreground">{payingAllSalesGroup.saleIds.length} vente(s)</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-muted-foreground">Total à payer</p>
                    <p className="font-bold text-red-600 tabular-nums text-sm">
                      {formatGNF(salesByCustomer[payingAllSalesGroup.id]?.totalRemaining ?? 0)}
                    </p>
                  </div>
                </div>
              ) : null}

              {/* Détails */}
              {payingAllSalesGroup && (
                <div className="space-y-2 p-3 rounded-xl bg-muted/40 border">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Détails des ventes</p>
                  <div className="space-y-1">
                    {salesByCustomer[payingAllSalesGroup.id]?.sales.map((sale) => (
                      <div key={sale.id} className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">{sale.receiptNumber}</span>
                        <span className="font-semibold">{formatGNF(sale.remainingDebt)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Confirmation */}
              <div className="p-3 rounded-xl bg-orange-50 border border-orange-200">
                <p className="text-xs text-orange-700 font-medium mb-1.5">⚠️ Paiement consolidé</p>
                <p className="text-xs text-orange-600">
                  {payingAllCustomer
                    ? `Toutes les dettes seront payées en un seul paiement. Un reçu consolidé sera généré.`
                    : `${payingAllSalesGroup?.saleIds.length} vente(s) seront payées en un seul paiement. Un reçu consolidé sera généré.`}
                </p>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1 rounded-xl"
                  onClick={closePayAll}
                >
                  Annuler
                </Button>
                <Button
                  className="flex-1 h-10 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold"
                  onClick={handlePayAll}
                  disabled={payAllMutation.isPending}
                >
                  {payAllMutation.isPending ? (
                    <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  ) : (
                    <span className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4" />
                      Confirmer paiement
                    </span>
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Dialog reçu paiement individuel ──────────────────────────── */}
      <Dialog open={!!debtReceipt} onOpenChange={(o) => !o && setDebtReceipt(null)}>
        <DialogContent className="w-[calc(100vw-1rem)] max-w-sm max-h-[95dvh] p-0 overflow-hidden gap-0">
          <DialogHeader className="px-5 pt-5 pb-4 border-b">
            <DialogTitle className="flex items-center gap-2 text-base">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              Reçu de paiement
            </DialogTitle>
          </DialogHeader>
          {debtReceipt && (
            <div className="px-5 py-4 space-y-4">
              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-center">
                <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto mb-2" />
                <p className="text-2xl font-bold text-emerald-700 tabular-nums">
                  {formatGNF(debtReceipt.amountPaid)}
                </p>
                <p className="text-xs text-emerald-600 mt-1">Montant encaissé</p>
              </div>
              <div className="space-y-0 text-sm divide-y">
                <div className="flex justify-between py-2">
                  <span className="text-muted-foreground">Client</span>
                  <span className="font-semibold">{debtReceipt.customerName}</span>
                </div>
                {debtReceipt.receiptNumber && (
                  <div className="flex justify-between py-2">
                    <span className="text-muted-foreground">Reçu vente N°</span>
                    <span className="font-mono text-xs">{debtReceipt.receiptNumber}</span>
                  </div>
                )}
                <div className="flex justify-between py-2">
                  <span className="text-muted-foreground">Date</span>
                  <span>{new Date(debtReceipt.paidAt).toLocaleString("fr-FR")}</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-muted-foreground">Dette avant</span>
                  <span className="text-amber-600 tabular-nums">{formatGNF(debtReceipt.previousDebt)}</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-muted-foreground">Solde restant</span>
                  <span className={cn("font-bold tabular-nums", debtReceipt.remainingDebt === 0 ? "text-emerald-600" : "text-amber-600")}>
                    {debtReceipt.remainingDebt === 0 ? "✓ Soldé" : formatGNF(debtReceipt.remainingDebt)}
                  </span>
                </div>
              </div>
              {/* Actions PDF */}
              <div className="grid grid-cols-3 gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-xl text-xs"
                  onClick={() => generateDebtPaymentReceiptPdf({
                    customerName: debtReceipt.customerName,
                    amountPaid: debtReceipt.amountPaid,
                    previousDebt: debtReceipt.previousDebt,
                    remainingDebt: debtReceipt.remainingDebt,
                    receiptNumber: debtReceipt.receiptNumber,
                    paidAt: debtReceipt.paidAt,
                    commerceName: user?.schoolName ?? "Commerce",
                  }, "preview")}
                >
                  Voir
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-xl text-xs"
                  onClick={() => generateDebtPaymentReceiptPdf({
                    customerName: debtReceipt.customerName,
                    amountPaid: debtReceipt.amountPaid,
                    previousDebt: debtReceipt.previousDebt,
                    remainingDebt: debtReceipt.remainingDebt,
                    receiptNumber: debtReceipt.receiptNumber,
                    paidAt: debtReceipt.paidAt,
                    commerceName: user?.schoolName ?? "Commerce",
                  }, "download")}
                >
                  <Printer className="h-3 w-3 mr-1" /> PDF
                </Button>
                <Button
                  size="sm"
                  className="rounded-xl text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={() => generateDebtPaymentReceiptPdf({
                    customerName: debtReceipt.customerName,
                    amountPaid: debtReceipt.amountPaid,
                    previousDebt: debtReceipt.previousDebt,
                    remainingDebt: debtReceipt.remainingDebt,
                    receiptNumber: debtReceipt.receiptNumber,
                    paidAt: debtReceipt.paidAt,
                    commerceName: user?.schoolName ?? "Commerce",
                  }, "print")}
                >
                  Imprimer
                </Button>
              </div>
              <Button
                variant="ghost"
                className="w-full text-muted-foreground text-sm"
                onClick={() => setDebtReceipt(null)}
              >
                Fermer
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Dialog reçu consolidé ─────────────────────────────────────── */}
      <Dialog open={!!consolidatedReceipt} onOpenChange={(o) => !o && setConsolidatedReceipt(null)}>
        <DialogContent className="w-[calc(100vw-1rem)] max-w-2xl max-h-[95dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              Reçu de paiement consolidé
            </DialogTitle>
          </DialogHeader>

          {consolidatedReceipt && (
            <div className="space-y-4">
              {/* Info générale */}
              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-xs text-emerald-700 font-semibold uppercase">Paiement #</p>
                    <p className="text-lg font-bold text-emerald-900">{consolidatedReceipt.paymentId}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-emerald-700 font-semibold uppercase">Montant</p>
                    <p className="text-2xl font-bold text-emerald-700 tabular-nums">
                      {formatGNF(consolidatedReceipt.amountPaid ?? consolidatedReceipt.totalPaid)}
                    </p>
                  </div>
                </div>
                <div className="text-xs text-emerald-600">
                  {new Date(consolidatedReceipt.createdAt).toLocaleString('fr-FR')}
                </div>
              </div>

              {/* Détails client ou ventes */}
              {consolidatedReceipt.customerName ? (
                <div className="p-4 rounded-xl border bg-card">
                  <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">Client</p>
                  <p className="font-bold text-lg">{consolidatedReceipt.customerName}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {consolidatedReceipt.paidSales?.length || 0} vente(s) payée(s)
                  </p>
                </div>
              ) : null}

              {/* Liste des ventes payées */}
              {(consolidatedReceipt.paidSales?.length ?? 0) > 0 && (
                <div className="p-4 rounded-xl border bg-card">
                  <p className="text-xs font-semibold text-muted-foreground uppercase mb-3">Ventes payées</p>
                  <div className="space-y-2">
                    {consolidatedReceipt.paidSales.map((sale: any) => (
                      <div key={sale.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                        <div>
                          <p className="text-sm font-mono text-muted-foreground">{sale.receiptNumber}</p>
                          <p className="text-xs text-muted-foreground">{new Date(sale.createdAt).toLocaleDateString('fr-FR')}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold">{formatGNF(sale.amountPaid)}</p>
                          <p className="text-xs text-emerald-600">payé</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Liste des ventes du batch */}
              {(consolidatedReceipt.sales?.length ?? 0) > 0 && !consolidatedReceipt.customerName && (
                <div className="p-4 rounded-xl border bg-card">
                  <p className="text-xs font-semibold text-muted-foreground uppercase mb-3">
                    {consolidatedReceipt.sales.length} vente(s) payée(s)
                  </p>
                  <div className="space-y-2">
                    {consolidatedReceipt.sales.map((sale: any) => (
                      <div key={sale.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                        <div>
                          <p className="text-sm font-mono text-muted-foreground">{sale.receiptNumber}</p>
                          <p className="text-xs text-muted-foreground">
                            {sale.customer?.name || "Client anonyme"}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold">{formatGNF(sale.remainingDebt)}</p>
                          <p className="text-xs text-emerald-600">payé</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1 rounded-xl"
                  onClick={() => setConsolidatedReceipt(null)}
                >
                  Fermer
                </Button>
                <Button
                  className="flex-1 h-10 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                  onClick={() => {
                    // Imprimer le reçu (futur)
                    toast.info("Impression en cours...");
                  }}
                >
                  <Printer className="h-4 w-4 mr-2" />
                  Imprimer
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
