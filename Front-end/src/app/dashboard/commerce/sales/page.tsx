"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import * as storage from "@/lib/storage";
import { getSales, cancelSale, type CommerceSale } from "@/lib/api/commerce.service";
import { toast } from "sonner";
import { Receipt, X, ChevronDown, ChevronUp, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { SalesReceiptDialog } from "@/components/commerce/SalesReceiptDialog";
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
import { format } from "date-fns";
import { fr } from "date-fns/locale";

const _gnf = new Intl.NumberFormat("fr-GN");
function formatGNF(n: number) {
  return _gnf.format(n) + " GNF";
}

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  COMPLETED: { label: "Payé",    className: "text-emerald-600 border-emerald-200 bg-emerald-50" },
  PARTIAL:   { label: "Partiel", className: "text-amber-600 border-amber-200 bg-amber-50" },
  CANCELLED: { label: "Annulé", className: "text-red-600 border-red-200 bg-red-50" },
};

const METHOD_LABELS: Record<string, string> = {
  CASH: "Espèces",
  MOBILE_MONEY: "Mobile Money",
  CREDIT: "Crédit",
};

// ─── Cache key par jour ──────────────────────────────────────────────────────
const CACHE_SALES = (tid: string, date: string) =>
  `structura_commerce_sales_${tid}_${date}`;

function readCache<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch { return undefined; }
}

function writeCache(key: string, data: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(data)); } catch { /* quota */ }
}

export default function SalesPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const tid = user?.tenantId ?? "";
  const today = format(new Date(), "yyyy-MM-dd");

  const [date, setDate] = useState(today);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [canceling, setCanceling] = useState<CommerceSale | null>(null);
  const [showReceiptDialog, setShowReceiptDialog] = useState(false);
  const [selectedSale, setSelectedSale] = useState<CommerceSale | null>(null);

  const token = () => storage.getAuthItem("structura_token") ?? "";

  const { data, isLoading } = useQuery({
    queryKey: ["commerce-sales", tid, date],
    queryFn: async () => {
      const result = await getSales(token(), { date, limit: 50 });
      // Cacher uniquement le jour courant (données stables une fois le jour passé)
      if (tid && date === today) writeCache(CACHE_SALES(tid, date), result);
      return result;
    },
    enabled: !!user,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    placeholderData: () => {
      if (!tid) return undefined;
      return readCache(CACHE_SALES(tid, date));
    },
  });

  // ─── Annulation optimiste ────────────────────────────────────────────────────
  const cancelMutation = useMutation({
    mutationFn: (id: string) => cancelSale(token(), id),
    onMutate: async (id: string) => {
      // Fermer le dialog immédiatement — pas d'attente
      setCanceling(null);

      await queryClient.cancelQueries({ queryKey: ["commerce-sales", tid, date] });
      const prev = queryClient.getQueryData(["commerce-sales", tid, date]);

      // Marquer CANCELLED dans le cache localement
      queryClient.setQueryData(
        ["commerce-sales", tid, date],
        (old: { data: CommerceSale[]; total: number } | undefined) => {
          if (!old?.data) return old;
          return {
            ...old,
            data: old.data.map((s) =>
              s.id === id ? { ...s, status: "CANCELLED" } : s
            ),
          };
        }
      );

      return { prev };
    },
    onError: (_e, _id, context) => {
      // Rollback si l'API retourne une erreur
      if (context?.prev) {
        queryClient.setQueryData(["commerce-sales", tid, date], context.prev);
      }
      toast.error("Impossible d'annuler cette vente");
    },
    onSuccess: () => {
      toast.success("Vente annulée — stock restauré");
      // Mettre à jour le cache localStorage
      const updated = queryClient.getQueryData(["commerce-sales", tid, date]);
      if (updated && tid && date === today) writeCache(CACHE_SALES(tid, date), updated);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["commerce-sales"] });
      queryClient.invalidateQueries({ queryKey: ["commerce-dashboard"] });
    },
  });

  const sales = data?.data ?? [];
  const totalRevenue = sales
    .filter((s) => s.status !== "CANCELLED")
    .reduce((sum, s) => sum + s.totalAmount, 0);

  return (
    <div className="p-6 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Ventes</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {data?.total ?? 0} vente{(data?.total ?? 0) > 1 ? "s" : ""} —{" "}
            <span className="font-semibold text-orange-600">{formatGNF(totalRevenue)}</span>
          </p>
        </div>
        <Input
          type="date"
          className="w-auto"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>

      {/* Liste */}
      <div className="space-y-2">
        {isLoading && sales.length === 0 ? (
          Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))
        ) : sales.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <Receipt className="h-12 w-12 mb-3 opacity-20" />
            <p className="font-medium">Aucune vente ce jour</p>
            <p className="text-sm mt-1">
              {format(new Date(date + "T12:00:00"), "EEEE dd MMMM yyyy", { locale: fr })}
            </p>
          </div>
        ) : (
          sales.map((sale) => {
            const isExpanded = expanded === sale.id;
            const status = STATUS_LABELS[sale.status] ?? STATUS_LABELS.COMPLETED;
            return (
              <div
                key={sale.id}
                className={`rounded-xl border-2 bg-card overflow-hidden transition-all ${
                  isExpanded
                    ? "border-orange-500 shadow-lg bg-orange-50/30 dark:bg-orange-950/20"
                    : "border-border hover:border-orange-300 hover:shadow-md"
                }`}
              >
                {/* Ligne principale */}
                <div
                  className={`flex items-center gap-4 p-4 cursor-pointer transition-all ${
                    isExpanded ? "bg-orange-100/40 dark:bg-orange-950/30" : "hover:bg-muted/30"
                  }`}
                  onClick={() => setExpanded(isExpanded ? null : sale.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{sale.receiptNumber}</span>
                      <Badge variant="outline" className={`text-[10px] ${status.className}`}>
                        {status.label}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {METHOD_LABELS[sale.paymentMethod] ?? sale.paymentMethod}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {sale.customer?.name ?? "Client anonyme"} •{" "}
                      {format(new Date(sale.createdAt), "HH:mm")}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-bold">{formatGNF(sale.totalAmount)}</p>
                    {sale.remainingDebt > 0 && (
                      <p className="text-xs text-amber-600">
                        Reste : {formatGNF(sale.remainingDebt)}
                      </p>
                    )}
                  </div>
                  {isExpanded ? (
                    <ChevronUp className="h-5 w-5 text-orange-600 shrink-0 font-bold" />
                  ) : (
                    <ChevronDown className="h-5 w-5 text-muted-foreground shrink-0" />
                  )}
                </div>

                {/* Détail expandable */}
                {isExpanded && (
                  <div className="border-t px-4 py-3 bg-muted/20 space-y-3 animate-in slide-in-from-top-2 duration-200">
                    <div className="space-y-1">
                      {sale.items?.map((item) => (
                        <div key={item.id} className="flex justify-between text-sm">
                          <span className="text-muted-foreground">
                            {item.product?.name ?? "Produit"} × {item.quantity} {item.product?.unit}
                          </span>
                          <span className="font-medium">{formatGNF(item.totalPrice)}</span>
                        </div>
                      ))}
                    </div>
                    <div className="border-t pt-2 grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <p className="text-muted-foreground">Encaissé</p>
                        <p className="font-semibold">{formatGNF(sale.paidAmount)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Monnaie</p>
                        <p className="font-semibold">{formatGNF(sale.changeAmount)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Reste dû</p>
                        <p className={`font-semibold ${sale.remainingDebt > 0 ? "text-amber-600" : ""}`}>
                          {formatGNF(sale.remainingDebt)}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => {
                          setSelectedSale(sale);
                          setShowReceiptDialog(true);
                        }}
                      >
                        <FileText className="h-3.5 w-3.5 mr-1" />
                        Reçu
                      </Button>
                      {sale.status !== "CANCELLED" && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 text-destructive border-destructive/30 hover:bg-destructive/10"
                          onClick={() => setCanceling(sale)}
                        >
                          <X className="h-3.5 w-3.5 mr-1" />
                          Annuler
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <AlertDialog open={!!canceling} onOpenChange={() => setCanceling(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Annuler la vente {canceling?.receiptNumber} ?</AlertDialogTitle>
            <AlertDialogDescription>
              Le stock sera restauré automatiquement. Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Retour</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => canceling && cancelMutation.mutate(canceling.id)}
            >
              Confirmer l&apos;annulation
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog reçu */}
      {selectedSale && (
        <SalesReceiptDialog
          open={showReceiptDialog}
          onOpenChange={(open) => {
            setShowReceiptDialog(open);
            if (!open) setSelectedSale(null);
          }}
          saleId={selectedSale.id}
          receiptData={{
            receiptNumber: selectedSale.receiptNumber,
            date: format(new Date(selectedSale.createdAt), "dd/MM/yyyy", { locale: fr }),
            time: format(new Date(selectedSale.createdAt), "HH:mm", { locale: fr }),
            cashierName: "—",
            items: selectedSale.items.map((item) => ({
              name: item.product?.name ?? "Produit",
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              totalPrice: item.totalPrice,
              unit: item.product?.unit,
            })),
            totalAmount: selectedSale.totalAmount,
            paidAmount: selectedSale.paidAmount,
            remainingAmount: selectedSale.remainingDebt,
            paymentMethod: METHOD_LABELS[selectedSale.paymentMethod] ?? selectedSale.paymentMethod,
            customerName: selectedSale.customer?.name,
            customerPhone: undefined,
            commerceName: user?.schoolName ?? "Commerce",
            commerceLogo: user?.schoolLogo ?? undefined,
            commerceAddress: undefined,
            commercePhone: undefined,
          }}
          token={token()}
        />
      )}
    </div>
  );
}
