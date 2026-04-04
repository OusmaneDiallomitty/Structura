"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import * as storage from "@/lib/storage";
import {
  getSupplierDebts,
  getSupplierPaymentHistory,
  paySupplierDebt,
  type SupplierDebtReceipt,
  type SupplierPaymentResult,
} from "@/lib/api/commerce.service";
import {
  generateSupplierPaymentReceiptPdf,
  type ReceiptOutputMode,
} from "@/lib/pdf-generator";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
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
import { toast } from "sonner";
import {
  TrendingDown,
  Banknote,
  Phone,
  ChevronRight,
  ChevronDown,
  Clock,
  CheckCircle2,
  Receipt,
  Printer,
  History,
  Search,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const _gnf = new Intl.NumberFormat("fr-GN");
function fmt(n: number) { return _gnf.format(Math.round(n)) + " GNF"; }
function roundGNF(n: number) { return Math.round(n / 500) * 500; }
const token = () => storage.getAuthItem("structura_token") ?? "";

const SHORTCUTS = [5_000, 10_000, 20_000, 50_000, 100_000, 200_000, 500_000];

const PAYMENT_METHODS = [
  { value: "CASH",          label: "Espèces" },
  { value: "MOBILE_MONEY",  label: "Mobile Money" },
  { value: "BANK_TRANSFER", label: "Virement bancaire" },
];

// ─── Statut badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  if (status === "PAID")
    return <Badge className="bg-emerald-100 text-emerald-700 border-0 text-xs">Soldé</Badge>;
  if (status === "PARTIAL")
    return <Badge className="bg-amber-100 text-amber-700 border-0 text-xs">Partiel</Badge>;
  return <Badge className="bg-red-100 text-red-700 border-0 text-xs">Impayé</Badge>;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SupplierDebtsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const tid = user?.tenantId ?? "";
  const commerceName = user?.schoolName ?? "Ma Boutique";

  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  // Dialog paiement
  const [payingReceipt, setPayingReceipt] = useState<SupplierDebtReceipt | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("CASH");
  const [payNotes, setPayNotes] = useState("");

  // Dialog reçu après paiement
  const [receipt, setReceipt] = useState<SupplierPaymentResult | null>(null);

  // Dialog historique
  const [showHistory, setShowHistory] = useState(false);
  const [historyMonth, setHistoryMonth] = useState(new Date().toISOString().slice(0, 7));

  // ─── Données ──────────────────────────────────────────────────────────────

  const { data, isLoading } = useQuery({
    queryKey: ["commerce-supplier-debts", tid],
    queryFn: () => getSupplierDebts(token()),
    enabled: !!user,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });

  const { data: historyData, isLoading: isHistoryLoading } = useQuery({
    queryKey: ["commerce-supplier-payments-history", tid, historyMonth],
    queryFn: () => getSupplierPaymentHistory(token(), { month: historyMonth }),
    enabled: showHistory && !!user,
    staleTime: 60_000,
  });

  const totalOwed = data?.totalOwed ?? 0;
  const suppliers = (data?.suppliers ?? []).filter((s) => {
    if (!search) return true;
    return s.supplierName.toLowerCase().includes(search.toLowerCase());
  });

  // ─── Mutation paiement ────────────────────────────────────────────────────

  const payMutation = useMutation({
    mutationFn: () =>
      paySupplierDebt(token(), payingReceipt!.id, {
        amount: parseFloat(payAmount),
        paymentMethod: payMethod,
        notes: payNotes || undefined,
      }),
    onMutate: () => {
      // Optimistic : fermer le dialog
      const snapshot = payingReceipt;
      const amountSnapshot = parseFloat(payAmount);
      const remaining = Math.max((snapshot?.amountDue ?? 0) - (snapshot?.amountPaid ?? 0) - amountSnapshot, 0);

      // Pré-afficher le reçu avec données estimées
      setReceipt({
        paymentId: "pending",
        receiptId: snapshot?.id ?? "",
        receiptNumber: snapshot?.receiptNumber ?? "",
        supplierName: snapshot?.supplierName ?? "",
        amountPaid: amountSnapshot,
        totalAmountPaid: (snapshot?.amountPaid ?? 0) + amountSnapshot,
        amountDue: snapshot?.amountDue ?? 0,
        remainingDebt: remaining,
        paymentStatus: remaining <= 0 ? "PAID" : "PARTIAL",
        paymentMethod: payMethod,
        paidAt: new Date().toISOString(),
      } as SupplierPaymentResult);

      closePay();
      return { snapshot };
    },
    onSuccess: (result) => {
      setReceipt(result);
      toast.success(
        result.remainingDebt <= 0
          ? `${result.supplierName} — Facture soldée ✓`
          : `Paiement enregistré — Reste : ${fmt(result.remainingDebt)}`
      );
      queryClient.invalidateQueries({ queryKey: ["commerce-supplier-debts", tid] });
      queryClient.invalidateQueries({ queryKey: ["commerce-supplier-payments-history", tid] });
      queryClient.invalidateQueries({ queryKey: ["commerce-dashboard"] });
    },
    onError: (e: Error, _vars, ctx: any) => {
      // Rollback : fermer le reçu optimiste
      setReceipt(null);
      // Ré-ouvrir le dialog avec les données d'avant
      if (ctx?.snapshot) setPayingReceipt(ctx.snapshot);
      toast.error(`Paiement échoué — ${e.message}`);
    },
  });

  // ─── Helpers dialog ───────────────────────────────────────────────────────

  const openPay = (r: SupplierDebtReceipt) => {
    const remaining = (r.amountDue ?? 0) - r.amountPaid;
    setPayingReceipt(r);
    setPayAmount(String(roundGNF(remaining)));
    setPayMethod("CASH");
    setPayNotes("");
  };

  const closePay = () => {
    setPayingReceipt(null);
    setPayAmount("");
    setPayNotes("");
  };

  const payingRemaining = payingReceipt
    ? (payingReceipt.amountDue ?? 0) - payingReceipt.amountPaid
    : 0;
  const amountNum = parseFloat(payAmount) || 0;
  const canPay = amountNum > 0 && amountNum <= payingRemaining;
  const isFullPayment = amountNum >= payingRemaining;

  const printReceipt = (mode: ReceiptOutputMode = "download") => {
    if (!receipt) return;
    generateSupplierPaymentReceiptPdf(
      {
        supplierName: receipt.supplierName,
        amountPaid: receipt.amountPaid,
        amountDue: receipt.amountDue,
        remainingDebt: receipt.remainingDebt,
        receiptNumber: receipt.receiptNumber,
        paidAt: receipt.paidAt,
        commerceName,
      },
      mode
    );
  };

  // ─── Rendu ────────────────────────────────────────────────────────────────

  return (
    <ProtectedRoute>
      <div className="space-y-6 p-4 md:p-6">

        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">Dettes fournisseurs</h1>
            <p className="text-sm text-muted-foreground">Suivi des paiements à régler</p>
          </div>
          <Button variant="outline" onClick={() => setShowHistory(true)} className="gap-2">
            <History className="h-4 w-4" /> Historique
          </Button>
        </div>

        {/* Stat totale */}
        <Card className="border-l-4 border-l-orange-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-orange-500" /> Total à payer
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-40" />
            ) : (
              <>
                <p className="text-2xl font-bold text-orange-600">{fmt(totalOwed)}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {data?.receiptCount ?? 0} bon{(data?.receiptCount ?? 0) > 1 ? "s" : ""} impayé{(data?.receiptCount ?? 0) > 1 ? "s" : ""}
                </p>
              </>
            )}
          </CardContent>
        </Card>

        {/* Recherche */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher un fournisseur…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Liste par fournisseur */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}
          </div>
        ) : suppliers.length === 0 ? (
          <Card>
            <CardContent className="p-10 text-center text-muted-foreground">
              <CheckCircle2 className="h-10 w-10 mx-auto mb-3 text-emerald-400" />
              <p className="font-medium">Aucune dette fournisseur</p>
              <p className="text-sm mt-1">Tous les bons de réception sont soldés.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {suppliers.map((supplier) => {
              const key = supplier.supplierId ?? supplier.supplierName;
              const isOpen = expanded === key;
              return (
                <Card key={key} className="overflow-hidden">
                  {/* En-tête fournisseur */}
                  <button
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors text-left"
                    onClick={() => setExpanded(isOpen ? null : key)}
                  >
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
                    <p className="font-bold text-orange-600 shrink-0">{fmt(supplier.totalOwed)}</p>
                    {isOpen
                      ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                      : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
                  </button>

                  {/* Lignes bons de réception */}
                  {isOpen && (
                    <div className="border-t divide-y bg-muted/10">
                      {supplier.receipts.map((r) => {
                        const remaining = (r.amountDue ?? 0) - r.amountPaid;
                        return (
                          <div key={r.id} className="flex items-center gap-3 px-4 py-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium text-sm">{r.receiptNumber}</span>
                                {r.referenceNumber && (
                                  <span className="text-xs text-muted-foreground">Réf: {r.referenceNumber}</span>
                                )}
                                <StatusBadge status={r.paymentStatus} />
                              </div>
                              <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {format(new Date(r.receivedAt), "d MMM yyyy", { locale: fr })}
                                {r.amountPaid > 0 && (
                                  <span className="ml-2 text-emerald-600">
                                    {fmt(r.amountPaid)} payé
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="font-bold text-orange-600 text-sm">{fmt(remaining)}</p>
                              <p className="text-xs text-muted-foreground">/ {fmt(r.amountDue ?? 0)}</p>
                            </div>
                            <Button
                              size="sm"
                              className="bg-orange-600 hover:bg-orange-700 text-white shrink-0"
                              onClick={() => openPay(r)}
                            >
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

        {/* ── Dialog paiement ── */}
        <Dialog open={!!payingReceipt} onOpenChange={(o) => !o && closePay()}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Payer — {payingReceipt?.supplierName}</DialogTitle>
            </DialogHeader>
            {payingReceipt && (
              <div className="space-y-4 py-1">
                {/* Infos bon */}
                <div className="rounded-lg bg-muted/40 p-3 text-sm space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Bon</span>
                    <span className="font-medium">{payingReceipt.receiptNumber}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total facture</span>
                    <span className="font-medium">{fmt(payingReceipt.amountDue ?? 0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Déjà payé</span>
                    <span className="font-medium text-emerald-600">{fmt(payingReceipt.amountPaid)}</span>
                  </div>
                  <div className="flex justify-between border-t pt-1 mt-1">
                    <span className="font-medium">Reste dû</span>
                    <span className="font-bold text-orange-600">{fmt(payingRemaining)}</span>
                  </div>
                </div>

                {/* Raccourcis */}
                <div className="flex flex-wrap gap-1.5">
                  <button
                    className={cn(
                      "px-2 py-1 text-xs rounded border transition-colors",
                      isFullPayment
                        ? "border-orange-500 bg-orange-50 text-orange-700"
                        : "border-muted-foreground/30 text-muted-foreground hover:border-orange-400"
                    )}
                    onClick={() => setPayAmount(String(roundGNF(payingRemaining)))}
                  >
                    <Zap className="inline h-3 w-3 mr-0.5" />Tout ({fmt(payingRemaining)})
                  </button>
                  {SHORTCUTS.filter((s) => s < payingRemaining).map((s) => (
                    <button
                      key={s}
                      className={cn(
                        "px-2 py-1 text-xs rounded border transition-colors",
                        amountNum === s
                          ? "border-orange-500 bg-orange-50 text-orange-700"
                          : "border-muted-foreground/30 text-muted-foreground hover:border-orange-400"
                      )}
                      onClick={() => setPayAmount(String(s))}
                    >
                      {_gnf.format(s)}
                    </button>
                  ))}
                </div>

                {/* Montant */}
                <div className="space-y-1">
                  <Label>Montant payé (GNF)</Label>
                  <Input
                    type="number"
                    placeholder="Ex: 200000"
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                    autoFocus
                  />
                  {amountNum > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Reste après paiement :{" "}
                      <span className={cn("font-medium", amountNum >= payingRemaining ? "text-emerald-600" : "text-orange-600")}>
                        {fmt(Math.max(payingRemaining - amountNum, 0))}
                        {amountNum >= payingRemaining && " — Soldé ✓"}
                      </span>
                    </p>
                  )}
                </div>

                {/* Mode de paiement */}
                <div className="space-y-1">
                  <Label>Mode de paiement</Label>
                  <Select value={payMethod} onValueChange={setPayMethod}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PAYMENT_METHODS.map((m) => (
                        <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Notes */}
                <div className="space-y-1">
                  <Label>Notes <span className="text-muted-foreground text-xs">(optionnel)</span></Label>
                  <Input
                    placeholder="Ex: Acompte sur facture janv…"
                    value={payNotes}
                    onChange={(e) => setPayNotes(e.target.value)}
                  />
                </div>

                <div className="flex gap-2 pt-1">
                  <Button variant="outline" className="flex-1" onClick={closePay}>Annuler</Button>
                  <Button
                    className="flex-1 bg-orange-600 hover:bg-orange-700 text-white"
                    onClick={() => payMutation.mutate()}
                    disabled={!canPay || payMutation.isPending}
                  >
                    {payMutation.isPending ? "Enregistrement…" : isFullPayment ? "Solder" : "Payer"}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* ── Dialog reçu ── */}
        <Dialog open={!!receipt} onOpenChange={(o) => !o && setReceipt(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Receipt className="h-5 w-5 text-orange-500" />
                Reçu paiement fournisseur
              </DialogTitle>
            </DialogHeader>
            {receipt && (
              <div className="space-y-3 py-1">
                {/* Montant */}
                <div className="rounded-lg bg-orange-50 p-4 text-center">
                  <p className="text-xs text-muted-foreground">Montant payé</p>
                  <p className="text-2xl font-bold text-orange-600">{fmt(receipt.amountPaid)}</p>
                </div>

                {/* Détails */}
                <div className="rounded-lg border divide-y text-sm">
                  <div className="flex justify-between px-3 py-2">
                    <span className="text-muted-foreground">Fournisseur</span>
                    <span className="font-medium">{receipt.supplierName}</span>
                  </div>
                  <div className="flex justify-between px-3 py-2">
                    <span className="text-muted-foreground">Bon</span>
                    <span className="font-medium">{receipt.receiptNumber}</span>
                  </div>
                  <div className="flex justify-between px-3 py-2">
                    <span className="text-muted-foreground">Total facture</span>
                    <span>{fmt(receipt.amountDue)}</span>
                  </div>
                  <div className="flex justify-between px-3 py-2">
                    <span className="text-muted-foreground">Solde restant</span>
                    {receipt.remainingDebt <= 0 ? (
                      <span className="font-bold text-emerald-600">✓ Soldé</span>
                    ) : (
                      <span className="font-bold text-amber-600">{fmt(receipt.remainingDebt)}</span>
                    )}
                  </div>
                </div>

                {/* Actions PDF */}
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1 gap-2" onClick={() => printReceipt("download")}>
                    <Receipt className="h-4 w-4" /> Télécharger
                  </Button>
                  <Button variant="outline" className="flex-1 gap-2" onClick={() => printReceipt("print")}>
                    <Printer className="h-4 w-4" /> Imprimer
                  </Button>
                </div>
                <Button className="w-full" variant="outline" onClick={() => setReceipt(null)}>
                  Fermer
                </Button>
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
              <Input
                type="month"
                value={historyMonth}
                onChange={(e) => setHistoryMonth(e.target.value)}
                className="w-44"
              />
              {isHistoryLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
                </div>
              ) : !historyData || historyData.payments.length === 0 ? (
                <p className="text-center text-muted-foreground text-sm py-6">Aucun paiement ce mois</p>
              ) : (
                <>
                  <div className="rounded-lg bg-muted/40 p-3 text-sm flex justify-between">
                    <span className="text-muted-foreground">Total payé ce mois</span>
                    <span className="font-bold text-emerald-600">{fmt(historyData.totalPaid)}</span>
                  </div>
                  <div className="divide-y max-h-64 overflow-y-auto rounded-lg border">
                    {historyData.payments.map((p) => (
                      <div key={p.id} className="flex items-center gap-3 px-3 py-2.5">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{p.supplierName}</p>
                          <p className="text-xs text-muted-foreground">
                            {p.receipt?.receiptNumber} •{" "}
                            {format(new Date(p.createdAt), "d MMM yyyy HH:mm", { locale: fr })}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-bold text-emerald-600 text-sm">{fmt(p.amount)}</p>
                          <p className="text-xs text-muted-foreground capitalize">
                            {p.paymentMethod === "CASH" ? "Espèces"
                              : p.paymentMethod === "MOBILE_MONEY" ? "Mobile Money"
                              : "Virement"}
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
    </ProtectedRoute>
  );
}
