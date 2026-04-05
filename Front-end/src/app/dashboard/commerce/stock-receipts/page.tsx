"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import * as storage from "@/lib/storage";
import {
  getStockReceipts,
  getSuppliers,
  getProducts,
  createStockReceipt,
  verifyStockReceipt,
  cancelStockReceipt,
  getSupplierDebts,
  getSupplierPaymentHistory,
  paySupplierDebt,
  type StockReceipt,
  type CommerceSupplier,
  type CommerceProduct,
  type SupplierDebtReceipt,
  type SupplierPaymentResult,
} from "@/lib/api/commerce.service";
import {
  generateSupplierPaymentReceiptPdf,
  type ReceiptOutputMode,
} from "@/lib/pdf-generator";
import { toast } from "sonner";
import {
  Package,
  Plus,
  Search,
  Filter,
  Eye,
  CheckCircle2,
  XCircle,
  Clock,
  Truck,
  Trash2,
  TrendingDown,
  Phone,
  ChevronRight,
  ChevronDown,
  Receipt,
  Printer,
  History,
  Zap,
  Banknote,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const _gnf = new Intl.NumberFormat("fr-GN");
function formatGNF(n: number) { return _gnf.format(Math.round(n)) + " GNF"; }
function roundGNF(n: number) { return Math.round(n / 500) * 500; }
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

const token = () => storage.getAuthItem("structura_token") ?? "";
const CACHE_RECEIPTS = (tid: string) => `structura_commerce_receipts_${tid}`;
const SHORTCUTS = [5_000, 10_000, 20_000, 50_000, 100_000, 200_000, 500_000];
const PAYMENT_METHODS = [
  { value: "CASH",          label: "Espèces" },
  { value: "MOBILE_MONEY",  label: "Mobile Money" },
  { value: "BANK_TRANSFER", label: "Virement bancaire" },
];

// ─── Badges ───────────────────────────────────────────────────────────────────

function ReceiptStatusBadge({ status }: { status: string }) {
  if (status === "RECEIVED")  return <Badge className="bg-blue-100 text-blue-900 border-0">Reçu</Badge>;
  if (status === "VERIFIED")  return <Badge className="bg-green-100 text-green-900 border-0">Vérifié</Badge>;
  if (status === "CANCELLED") return <Badge variant="destructive">Annulé</Badge>;
  return <Badge variant="secondary">-</Badge>;
}

function DebtStatusBadge({ status }: { status: string }) {
  if (status === "PAID")    return <Badge className="bg-emerald-100 text-emerald-700 border-0 text-xs">Soldé</Badge>;
  if (status === "PARTIAL") return <Badge className="bg-amber-100 text-amber-700 border-0 text-xs">Partiel</Badge>;
  return <Badge className="bg-red-100 text-red-700 border-0 text-xs">Impayé</Badge>;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function StockReceiptsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const tid = user?.tenantId ?? "";
  const commerceName = user?.schoolName ?? "Ma Boutique";

  const [activeTab, setActiveTab] = useState<"receptions" | "apayer">("receptions");

  // ── État onglet Réceptions ──
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState<StockReceipt | null>(null);
  const [createForm, setCreateForm] = useState({
    supplierId: "", supplierName: "", referenceNumber: "", notes: "", amountDue: "",
  });
  const [receiptLines, setReceiptLines] = useState<
    Array<{ productId: string; quantity: string; unitPrice: string; notes: string }>
  >([{ productId: "", quantity: "", unitPrice: "", notes: "" }]);

  // ── État onglet À payer ──
  const [debtSearch, setDebtSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [payingReceipt, setPayingReceipt] = useState<SupplierDebtReceipt | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("CASH");
  const [payNotes, setPayNotes] = useState("");
  const [receipt, setReceipt] = useState<SupplierPaymentResult | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [historyMonth, setHistoryMonth] = useState(new Date().toISOString().slice(0, 7));

  // ─── Requêtes ─────────────────────────────────────────────────────────────

  const { data: receiptsData, isLoading: isLoadingReceipts } = useQuery({
    queryKey: ["commerce-receipts", tid, statusFilter, supplierFilter],
    queryFn: async () => {
      const result = await getStockReceipts(token(), {
        supplierId: supplierFilter !== "all" ? supplierFilter : undefined,
        status: statusFilter !== "all" ? statusFilter : undefined,
        limit: 100,
      });
      if (statusFilter === "all" && supplierFilter === "all") {
        try { localStorage.setItem(CACHE_RECEIPTS(tid), JSON.stringify(result)); } catch {}
      }
      return result;
    },
    enabled: !!user,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    placeholderData: () => {
      try { const c = localStorage.getItem(CACHE_RECEIPTS(tid)); return c ? JSON.parse(c) : undefined; }
      catch { return undefined; }
    },
  });

  const { data: suppliers } = useQuery({
    queryKey: ["commerce-suppliers", tid],
    queryFn: () => getSuppliers(token()),
    enabled: !!user,
    staleTime: 300_000,
  });

  const { data: products } = useQuery({
    queryKey: ["commerce-products-for-receipt", tid],
    queryFn: () => getProducts(token(), { limit: 500 }),
    enabled: !!user,
  });

  const { data: debtsData, isLoading: isLoadingDebts } = useQuery({
    queryKey: ["commerce-supplier-debts", tid],
    queryFn: () => getSupplierDebts(token()),
    enabled: !!user && activeTab === "apayer",
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });

  const { data: historyData, isLoading: isHistoryLoading } = useQuery({
    queryKey: ["commerce-supplier-payments-history", tid, historyMonth],
    queryFn: () => getSupplierPaymentHistory(token(), { month: historyMonth }),
    enabled: showHistory && !!user,
    staleTime: 60_000,
  });

  const receipts = (receiptsData?.data ?? []).filter((r) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return r.receiptNumber.toLowerCase().includes(q) || r.supplierName.toLowerCase().includes(q);
  });
  const productsArray = products?.data ?? [];
  const debtSuppliers = (debtsData?.suppliers ?? []).filter((s) => {
    if (!debtSearch) return true;
    return s.supplierName.toLowerCase().includes(debtSearch.toLowerCase());
  });

  // ─── Mutations réceptions ─────────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: async () => {
      const lines = receiptLines
        .filter((l) => l.productId && l.quantity)
        .map((l) => ({
          productId: l.productId,
          quantity: parseFloat(l.quantity),
          unit: productsArray.find((p) => p.id === l.productId)?.unit || "pièce",
          unitPrice: l.unitPrice ? parseFloat(l.unitPrice) : undefined,
          notes: l.notes || undefined,
        }));
      if (lines.length === 0) throw new Error("Au moins 1 produit requis");
      return createStockReceipt(token(), {
        supplierId: createForm.supplierId || undefined,
        supplierName: createForm.supplierName,
        referenceNumber: createForm.referenceNumber || undefined,
        lines,
        notes: createForm.notes || undefined,
        amountDue: createForm.amountDue ? parseFloat(createForm.amountDue) : undefined,
      });
    },
    onSuccess: (result) => {
      toast.success(`Bon ${result.receiptNumber} créé`);
      setShowCreateDialog(false);
      setCreateForm({ supplierId: "", supplierName: "", referenceNumber: "", notes: "", amountDue: "" });
      setReceiptLines([{ productId: "", quantity: "", unitPrice: "", notes: "" }]);
      queryClient.invalidateQueries({ queryKey: ["commerce-receipts", tid] });
      queryClient.invalidateQueries({ queryKey: ["commerce-products", tid] });
      queryClient.invalidateQueries({ queryKey: ["commerce-supplier-debts", tid] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const verifyMutation = useMutation({
    mutationFn: (id: string) => verifyStockReceipt(token(), id),
    onSuccess: (result) => {
      toast.success(`Bon ${result.receiptNumber} vérifié`);
      setShowDetailDialog(false);
      queryClient.invalidateQueries({ queryKey: ["commerce-receipts", tid] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => cancelStockReceipt(token(), id),
    onSuccess: () => {
      toast.success("Bon annulé — stock restauré");
      setShowDetailDialog(false);
      queryClient.invalidateQueries({ queryKey: ["commerce-receipts", tid] });
      queryClient.invalidateQueries({ queryKey: ["commerce-products", tid] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ─── Mutation paiement dette ───────────────────────────────────────────────

  const payMutation = useMutation({
    mutationFn: () => paySupplierDebt(token(), payingReceipt!.id, {
      amount: parseFloat(payAmount),
      paymentMethod: payMethod,
      notes: payNotes || undefined,
    }),
    onMutate: () => {
      const snap = payingReceipt;
      const amt = parseFloat(payAmount);
      const remaining = Math.max((snap?.amountDue ?? 0) - (snap?.amountPaid ?? 0) - amt, 0);
      setReceipt({
        paymentId: "pending",
        receiptId: snap?.id ?? "",
        receiptNumber: snap?.receiptNumber ?? "",
        supplierName: snap?.supplierName ?? "",
        amountPaid: amt,
        totalAmountPaid: (snap?.amountPaid ?? 0) + amt,
        amountDue: snap?.amountDue ?? 0,
        remainingDebt: remaining,
        paymentStatus: remaining <= 0 ? "PAID" : "PARTIAL",
        paymentMethod: payMethod,
        paidAt: new Date().toISOString(),
      } as SupplierPaymentResult);
      closePay();
      return { snap };
    },
    onSuccess: (result) => {
      setReceipt(result);
      toast.success(result.remainingDebt <= 0
        ? `${result.supplierName} — Facture soldée ✓`
        : `Paiement enregistré — Reste : ${formatGNF(result.remainingDebt)}`
      );
      queryClient.invalidateQueries({ queryKey: ["commerce-supplier-debts", tid] });
      queryClient.invalidateQueries({ queryKey: ["commerce-supplier-payments-history", tid] });
    },
    onError: (e: Error, _v, ctx: any) => {
      setReceipt(null);
      if (ctx?.snap) setPayingReceipt(ctx.snap);
      toast.error(`Paiement échoué — ${e.message}`);
    },
  });

  // ─── Helpers paiement ─────────────────────────────────────────────────────

  const openPay = (r: SupplierDebtReceipt) => {
    setPayingReceipt(r);
    setPayAmount(String(roundGNF((r.amountDue ?? 0) - r.amountPaid)));
    setPayMethod("CASH");
    setPayNotes("");
  };
  const closePay = () => { setPayingReceipt(null); setPayAmount(""); setPayNotes(""); };

  const payingRemaining = payingReceipt ? (payingReceipt.amountDue ?? 0) - payingReceipt.amountPaid : 0;
  const amountNum = parseFloat(payAmount) || 0;
  const isFullPayment = amountNum >= payingRemaining;

  const printReceipt = (mode: ReceiptOutputMode = "download") => {
    if (!receipt) return;
    generateSupplierPaymentReceiptPdf({
      supplierName: receipt.supplierName,
      amountPaid: receipt.amountPaid,
      amountDue: receipt.amountDue,
      remainingDebt: receipt.remainingDebt,
      receiptNumber: receipt.receiptNumber,
      paidAt: receipt.paidAt,
      commerceName,
    }, mode);
  };

  // ─── Rendu ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5 p-4 md:p-6">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Fournisseurs & Stock</h1>
          <p className="text-sm text-muted-foreground">Réceptions et paiements fournisseurs</p>
        </div>
        {activeTab === "receptions" && (
          <Button onClick={() => setShowCreateDialog(true)} className="bg-orange-600 hover:bg-orange-700 text-white gap-2">
            <Plus className="h-4 w-4" /> Nouveau bon
          </Button>
        )}
        {activeTab === "apayer" && (
          <Button variant="outline" onClick={() => setShowHistory(true)} className="gap-2">
            <History className="h-4 w-4" /> Historique
          </Button>
        )}
      </div>

      {/* Onglets */}
      <div className="flex gap-1 bg-muted/50 p-1 rounded-lg w-fit">
        <button
          onClick={() => setActiveTab("receptions")}
          className={cn(
            "px-4 py-2 rounded-md text-sm font-medium transition-colors",
            activeTab === "receptions"
              ? "bg-background shadow text-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Package className="inline h-4 w-4 mr-1.5 -mt-0.5" />
          Réceptions ({receiptsData?.total ?? 0})
        </button>
        <button
          onClick={() => setActiveTab("apayer")}
          className={cn(
            "px-4 py-2 rounded-md text-sm font-medium transition-colors",
            activeTab === "apayer"
              ? "bg-background shadow text-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <TrendingDown className="inline h-4 w-4 mr-1.5 -mt-0.5" />
          À payer
          {debtsData?.totalOwed ? (
            <span className="ml-1.5 text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full">
              {formatGNF(debtsData.totalOwed)}
            </span>
          ) : null}
        </button>
      </div>

      {/* ════════════════════════════════════════════════════════════════════════
          ONGLET 1 : RÉCEPTIONS
      ════════════════════════════════════════════════════════════════════════ */}
      {activeTab === "receptions" && (
        <div className="space-y-4">
          {/* Filtres */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Rechercher par numéro, fournisseur..." className="pl-9"
                value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-40">
                <Filter className="h-4 w-4 mr-2" /><SelectValue placeholder="Statut" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les statuts</SelectItem>
                <SelectItem value="RECEIVED">Reçu</SelectItem>
                <SelectItem value="VERIFIED">Vérifié</SelectItem>
                <SelectItem value="CANCELLED">Annulé</SelectItem>
              </SelectContent>
            </Select>
            <Select value={supplierFilter} onValueChange={setSupplierFilter}>
              <SelectTrigger className="w-full sm:w-48">
                <Truck className="h-4 w-4 mr-2" /><SelectValue placeholder="Fournisseur" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les fournisseurs</SelectItem>
                {suppliers?.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Numéro</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Fournisseur</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Date</th>
                    <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Produits</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Statut réception</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Paiement</th>
                    <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoadingReceipts && receipts.length === 0 ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i} className="border-b">
                        {Array.from({ length: 7 }).map((_, j) => (
                          <td key={j} className="px-4 py-3"><Skeleton className="h-5 w-full" /></td>
                        ))}
                      </tr>
                    ))
                  ) : receipts.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-16 text-muted-foreground">
                        <Package className="h-10 w-10 mx-auto mb-2 opacity-20" />
                        <p>Aucun bon de réception</p>
                      </td>
                    </tr>
                  ) : (
                    receipts.map((r) => (
                      <tr key={r.id} className="border-b hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 font-medium">{r.receiptNumber}</td>
                        <td className="px-4 py-3">{r.supplierName}</td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" />{formatDate(r.receivedAt)}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-medium">{r.totalItems}</td>
                        <td className="px-4 py-3"><ReceiptStatusBadge status={r.status} /></td>
                        <td className="px-4 py-3">
                          {(r as any).amountDue
                            ? <DebtStatusBadge status={(r as any).paymentStatus ?? "UNPAID"} />
                            : <span className="text-xs text-muted-foreground">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-600 hover:bg-blue-100"
                            onClick={() => { setSelectedReceipt(r); setShowDetailDialog(true); }}>
                            <Eye className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          ONGLET 2 : À PAYER
      ════════════════════════════════════════════════════════════════════════ */}
      {activeTab === "apayer" && (
        <div className="space-y-4">
          {/* Stat totale */}
          <Card className="border-l-4 border-l-orange-500">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-orange-500" /> Total à payer
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoadingDebts ? <Skeleton className="h-8 w-40" /> : (
                <>
                  <p className="text-2xl font-bold text-orange-600">{formatGNF(debtsData?.totalOwed ?? 0)}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {debtsData?.receiptCount ?? 0} bon{(debtsData?.receiptCount ?? 0) > 1 ? "s" : ""} impayé{(debtsData?.receiptCount ?? 0) > 1 ? "s" : ""}
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          {/* Recherche */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Rechercher un fournisseur…" value={debtSearch}
              onChange={(e) => setDebtSearch(e.target.value)} className="pl-9" />
          </div>

          {/* Liste */}
          {isLoadingDebts ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}
            </div>
          ) : debtSuppliers.length === 0 ? (
            <Card>
              <CardContent className="p-10 text-center text-muted-foreground">
                <CheckCircle2 className="h-10 w-10 mx-auto mb-3 text-emerald-400" />
                <p className="font-medium">Aucune dette fournisseur</p>
                <p className="text-sm mt-1">Tous les bons sont soldés.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {debtSuppliers.map((supplier) => {
                const key = supplier.supplierId ?? supplier.supplierName;
                const isOpen = expanded === key;
                return (
                  <Card key={key} className="overflow-hidden">
                    <button className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors text-left"
                      onClick={() => setExpanded(isOpen ? null : key)}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold truncate">{supplier.supplierName}</span>
                          {supplier.phone && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Phone className="h-3 w-3" />{supplier.phone}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {supplier.receipts.length} bon{supplier.receipts.length > 1 ? "s" : ""} impayé{supplier.receipts.length > 1 ? "s" : ""}
                        </p>
                      </div>
                      <p className="font-bold text-orange-600 shrink-0">{formatGNF(supplier.totalOwed)}</p>
                      {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                               : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
                    </button>

                    {isOpen && (
                      <div className="border-t divide-y bg-muted/10">
                        {supplier.receipts.map((r) => {
                          const remaining = (r.amountDue ?? 0) - r.amountPaid;
                          return (
                            <div key={r.id} className="flex items-center gap-3 px-4 py-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-medium text-sm">{r.receiptNumber}</span>
                                  {r.referenceNumber && <span className="text-xs text-muted-foreground">Réf: {r.referenceNumber}</span>}
                                  <DebtStatusBadge status={r.paymentStatus} />
                                </div>
                                <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {format(new Date(r.receivedAt), "d MMM yyyy", { locale: fr })}
                                  {r.amountPaid > 0 && <span className="ml-2 text-emerald-600">{formatGNF(r.amountPaid)} payé</span>}
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                <p className="font-bold text-orange-600 text-sm">{formatGNF(remaining)}</p>
                                <p className="text-xs text-muted-foreground">/ {formatGNF(r.amountDue ?? 0)}</p>
                              </div>
                              <Button size="sm" className="bg-orange-600 hover:bg-orange-700 text-white shrink-0"
                                onClick={() => openPay(r)}>
                                Payer
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Dialog Créer bon ── */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nouveau bon de réception</DialogTitle>
            <p className="text-xs text-muted-foreground mt-1">Enregistrer une livraison fournisseur</p>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Fournisseur *</Label>
                <Select value={createForm.supplierId} onValueChange={(id) => {
                  const s = suppliers?.find((s) => s.id === id);
                  setCreateForm({ ...createForm, supplierId: id, supplierName: s?.name || "" });
                }}>
                  <SelectTrigger><SelectValue placeholder="Sélectionner..." /></SelectTrigger>
                  <SelectContent>
                    {suppliers?.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Numéro BC/Facture <span className="text-muted-foreground text-xs">(optionnel)</span></Label>
                <Input placeholder="BC-2026-0342" value={createForm.referenceNumber}
                  onChange={(e) => setCreateForm({ ...createForm, referenceNumber: e.target.value })} />
              </div>
            </div>

            {!createForm.supplierId && (
              <div className="grid gap-2">
                <Label>Nom fournisseur (si pas en BDD) *</Label>
                <Input placeholder="Nom du fournisseur" value={createForm.supplierName}
                  onChange={(e) => setCreateForm({ ...createForm, supplierName: e.target.value })} />
              </div>
            )}

            {/* Lignes produits */}
            <div className="space-y-3">
              <Label className="font-semibold">Produits reçus *</Label>
              {receiptLines.map((line, idx) => (
                <div key={idx} className="flex gap-2 items-end">
                  <Select value={line.productId} onValueChange={(v) => {
                    const u = [...receiptLines]; u[idx].productId = v; setReceiptLines(u);
                  }}>
                    <SelectTrigger className="flex-1"><SelectValue placeholder="Produit..." /></SelectTrigger>
                    <SelectContent>
                      {productsArray.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} ({p.unit})</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Input type="number" placeholder="Qté" className="w-20" value={line.quantity}
                    onChange={(e) => { const u = [...receiptLines]; u[idx].quantity = e.target.value; setReceiptLines(u); }} />
                  <Input type="number" placeholder="Prix unit." className="w-28" value={line.unitPrice}
                    onChange={(e) => { const u = [...receiptLines]; u[idx].unitPrice = e.target.value; setReceiptLines(u); }} />
                  <Button variant="ghost" size="icon" className="h-9 w-9 text-destructive"
                    onClick={() => setReceiptLines(receiptLines.filter((_, i) => i !== idx))}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm"
                onClick={() => setReceiptLines([...receiptLines, { productId: "", quantity: "", unitPrice: "", notes: "" }])}>
                + Ajouter produit
              </Button>
            </div>

            {/* Montant dû */}
            <div className="grid gap-2">
              <Label>Montant total dû au fournisseur <span className="text-muted-foreground text-xs">(optionnel — calculé auto si prix renseignés)</span></Label>
              <Input type="number" placeholder="Ex: 500000" value={createForm.amountDue}
                onChange={(e) => setCreateForm({ ...createForm, amountDue: e.target.value })} />
            </div>

            <div className="grid gap-2">
              <Label>Notes <span className="text-muted-foreground text-xs">(optionnel)</span></Label>
              <Input placeholder="Remarques sur la livraison..." value={createForm.notes}
                onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Annuler</Button>
            <Button className="bg-orange-600 hover:bg-orange-700 text-white"
              onClick={() => createMutation.mutate()}
              disabled={!createForm.supplierName || receiptLines.filter((l) => l.productId && l.quantity).length === 0 || createMutation.isPending}>
              {createMutation.isPending ? "Création..." : "Créer bon"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog Détail bon ── */}
      {selectedReceipt && (
        <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{selectedReceipt.receiptNumber}</DialogTitle>
              <p className="text-xs text-muted-foreground mt-1">
                <ReceiptStatusBadge status={selectedReceipt.status} /> · {selectedReceipt.supplierName}
              </p>
            </DialogHeader>
            <div className="space-y-6 py-4">
              <div className="border-b pb-4 grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Fournisseur</p>
                  <p className="font-semibold mt-1">{selectedReceipt.supplierName}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Date</p>
                  <p className="font-semibold mt-1 text-sm">{formatDate(selectedReceipt.receivedAt)}</p>
                </div>
                {selectedReceipt.referenceNumber && (
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Réf BC</p>
                    <p className="font-semibold mt-1">{selectedReceipt.referenceNumber}</p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Enregistré par</p>
                  <p className="font-semibold mt-1">{selectedReceipt.receivedByName}</p>
                </div>
              </div>

              {selectedReceipt.verifiedAt && (
                <div className="p-3 rounded-lg border">
                  <p className="text-sm">✓ Vérifié le {formatDate(selectedReceipt.verifiedAt)}</p>
                </div>
              )}

              <div className="space-y-3">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Produits reçus</p>
                {selectedReceipt.lines?.map((line) => (
                  <div key={line.id} className="pb-3 border-b last:border-b-0">
                    <p className="font-semibold text-sm">{line.product?.name}</p>
                    <p className="text-sm mt-1">
                      {line.quantity} {line.unit}
                      {line.unitPrice && ` · ${formatGNF(line.unitPrice)}`}
                    </p>
                    {line.totalPrice && <p className="text-sm font-semibold mt-1">{formatGNF(line.totalPrice)}</p>}
                  </div>
                ))}
              </div>

              {selectedReceipt.notes && (
                <div className="p-3 rounded-lg border">
                  <p className="text-sm">📝 {selectedReceipt.notes}</p>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDetailDialog(false)}>Fermer</Button>
              {selectedReceipt.status === "RECEIVED" && (
                <Button className="bg-orange-600 hover:bg-orange-700 text-white"
                  onClick={() => verifyMutation.mutate(selectedReceipt.id)}
                  disabled={verifyMutation.isPending}>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  {verifyMutation.isPending ? "Vérification..." : "Vérifier"}
                </Button>
              )}
              {selectedReceipt.status !== "CANCELLED" && (
                <Button variant="destructive"
                  onClick={() => { if (window.confirm(`Annuler ${selectedReceipt.receiptNumber}? Le stock sera restauré.`)) cancelMutation.mutate(selectedReceipt.id); }}
                  disabled={cancelMutation.isPending}>
                  <XCircle className="h-4 w-4 mr-2" />
                  {cancelMutation.isPending ? "Annulation..." : "Annuler"}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* ── Dialog paiement ── */}
      <Dialog open={!!payingReceipt} onOpenChange={(o) => !o && closePay()}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Payer — {payingReceipt?.supplierName}</DialogTitle></DialogHeader>
          {payingReceipt && (
            <div className="space-y-4 py-1">
              <div className="rounded-lg bg-muted/40 p-3 text-sm space-y-1">
                <div className="flex justify-between"><span className="text-muted-foreground">Bon</span><span className="font-medium">{payingReceipt.receiptNumber}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Total facture</span><span className="font-medium">{formatGNF(payingReceipt.amountDue ?? 0)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Déjà payé</span><span className="font-medium text-emerald-600">{formatGNF(payingReceipt.amountPaid)}</span></div>
                <div className="flex justify-between border-t pt-1 mt-1"><span className="font-medium">Reste dû</span><span className="font-bold text-orange-600">{formatGNF(payingRemaining)}</span></div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                <button className={cn("px-2 py-1 text-xs rounded border transition-colors", isFullPayment ? "border-orange-500 bg-orange-50 text-orange-700" : "border-muted-foreground/30 text-muted-foreground hover:border-orange-400")}
                  onClick={() => setPayAmount(String(roundGNF(payingRemaining)))}>
                  <Zap className="inline h-3 w-3 mr-0.5" />Tout ({formatGNF(payingRemaining)})
                </button>
                {SHORTCUTS.filter((s) => s < payingRemaining).map((s) => (
                  <button key={s} className={cn("px-2 py-1 text-xs rounded border transition-colors", amountNum === s ? "border-orange-500 bg-orange-50 text-orange-700" : "border-muted-foreground/30 text-muted-foreground hover:border-orange-400")}
                    onClick={() => setPayAmount(String(s))}>
                    {_gnf.format(s)}
                  </button>
                ))}
              </div>

              <div className="space-y-1">
                <Label>Montant payé (GNF)</Label>
                <Input type="number" placeholder="Ex: 200000" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} autoFocus />
                {amountNum > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Reste : <span className={cn("font-medium", amountNum >= payingRemaining ? "text-emerald-600" : "text-orange-600")}>
                      {formatGNF(Math.max(payingRemaining - amountNum, 0))}{amountNum >= payingRemaining && " — Soldé ✓"}
                    </span>
                  </p>
                )}
              </div>

              <div className="space-y-1">
                <Label>Mode de paiement</Label>
                <Select value={payMethod} onValueChange={setPayMethod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label>Notes <span className="text-muted-foreground text-xs">(optionnel)</span></Label>
                <Input placeholder="Ex: Acompte sur facture…" value={payNotes} onChange={(e) => setPayNotes(e.target.value)} />
              </div>

              <div className="flex gap-2 pt-1">
                <Button variant="outline" className="flex-1" onClick={closePay}>Annuler</Button>
                <Button className="flex-1 bg-orange-600 hover:bg-orange-700 text-white"
                  onClick={() => payMutation.mutate()}
                  disabled={amountNum <= 0 || amountNum > payingRemaining || payMutation.isPending}>
                  {payMutation.isPending ? "Enregistrement…" : isFullPayment ? "Solder" : "Payer"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Dialog reçu paiement ── */}
      <Dialog open={!!receipt} onOpenChange={(o) => !o && setReceipt(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-orange-500" /> Reçu paiement fournisseur
            </DialogTitle>
          </DialogHeader>
          {receipt && (
            <div className="space-y-3 py-1">
              <div className="rounded-lg bg-orange-50 p-4 text-center">
                <p className="text-xs text-muted-foreground">Montant payé</p>
                <p className="text-2xl font-bold text-orange-600">{formatGNF(receipt.amountPaid)}</p>
              </div>
              <div className="rounded-lg border divide-y text-sm">
                <div className="flex justify-between px-3 py-2"><span className="text-muted-foreground">Fournisseur</span><span className="font-medium">{receipt.supplierName}</span></div>
                <div className="flex justify-between px-3 py-2"><span className="text-muted-foreground">Bon</span><span className="font-medium">{receipt.receiptNumber}</span></div>
                <div className="flex justify-between px-3 py-2"><span className="text-muted-foreground">Total facture</span><span>{formatGNF(receipt.amountDue)}</span></div>
                <div className="flex justify-between px-3 py-2">
                  <span className="text-muted-foreground">Solde restant</span>
                  {receipt.remainingDebt <= 0
                    ? <span className="font-bold text-emerald-600">✓ Soldé</span>
                    : <span className="font-bold text-amber-600">{formatGNF(receipt.remainingDebt)}</span>}
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 gap-2" onClick={() => printReceipt("download")}>
                  <Receipt className="h-4 w-4" /> Télécharger
                </Button>
                <Button variant="outline" className="flex-1 gap-2" onClick={() => printReceipt("print")}>
                  <Printer className="h-4 w-4" /> Imprimer
                </Button>
              </div>
              <Button className="w-full" variant="outline" onClick={() => setReceipt(null)}>Fermer</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Dialog historique ── */}
      <Dialog open={showHistory} onOpenChange={setShowHistory}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5" /> Historique des paiements
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <Input type="month" value={historyMonth} onChange={(e) => setHistoryMonth(e.target.value)} className="w-44" />
            {isHistoryLoading ? (
              <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
            ) : !historyData || historyData.payments.length === 0 ? (
              <p className="text-center text-muted-foreground text-sm py-6">Aucun paiement ce mois</p>
            ) : (
              <>
                <div className="rounded-lg bg-muted/40 p-3 text-sm flex justify-between">
                  <span className="text-muted-foreground">Total payé ce mois</span>
                  <span className="font-bold text-emerald-600">{formatGNF(historyData.totalPaid)}</span>
                </div>
                <div className="divide-y max-h-64 overflow-y-auto rounded-lg border">
                  {historyData.payments.map((p) => (
                    <div key={p.id} className="flex items-center gap-3 px-3 py-2.5">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{p.supplierName}</p>
                        <p className="text-xs text-muted-foreground">
                          {p.receipt?.receiptNumber} · {format(new Date(p.createdAt), "d MMM yyyy HH:mm", { locale: fr })}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-bold text-emerald-600 text-sm">{formatGNF(p.amount)}</p>
                        <p className="text-xs text-muted-foreground">
                          {p.paymentMethod === "CASH" ? "Espèces" : p.paymentMethod === "MOBILE_MONEY" ? "Mobile Money" : "Virement"}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
