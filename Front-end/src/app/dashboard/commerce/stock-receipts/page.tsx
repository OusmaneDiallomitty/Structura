"use client";

import { useState, useCallback } from "react";
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
  type StockReceipt,
  type CommerceSupplier,
  type CommerceProduct,
} from "@/lib/api/commerce.service";
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
  ChevronDown,
  ChevronUp,
  Trash2,
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

const _gnf = new Intl.NumberFormat("fr-GN");
function formatGNF(amount: number) {
  return _gnf.format(amount) + " GNF";
}

function formatDate(isoString: string) {
  return new Date(isoString).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const CACHE_RECEIPTS = (tid: string) => `structura_commerce_receipts_${tid}`;

export default function StockReceiptsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [supplierFilter, setSupplierFilter] = useState<string>("all");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState<StockReceipt | null>(null);

  // Formulaire création
  const [createForm, setCreateForm] = useState({
    supplierId: "",
    supplierName: "",
    referenceNumber: "",
    notes: "",
  });
  const [receiptLines, setReceiptLines] = useState<
    Array<{ productId: string; quantity: string; notes: string }>
  >([{ productId: "", quantity: "", notes: "" }]);

  const token = () => storage.getAuthItem("structura_token") ?? "";
  const tid = user?.tenantId ?? "";

  // ── Requêtes ────────────────────────────────────────────────────────────────
  const { data: receiptsData, isLoading } = useQuery({
    queryKey: ["commerce-receipts", tid, search, statusFilter, supplierFilter],
    queryFn: async () => {
      const result = await getStockReceipts(token(), {
        supplierId: supplierFilter !== "all" ? supplierFilter : undefined,
        status: statusFilter !== "all" ? statusFilter : undefined,
        limit: 100,
      });
      if (!search && statusFilter === "all" && supplierFilter === "all") {
        try {
          localStorage.setItem(CACHE_RECEIPTS(tid), JSON.stringify(result));
        } catch {}
      }
      return result;
    },
    enabled: !!user,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    placeholderData: () => {
      if (search || statusFilter !== "all" || supplierFilter !== "all") return undefined;
      try {
        const c = localStorage.getItem(CACHE_RECEIPTS(tid));
        return c ? JSON.parse(c) : undefined;
      } catch {
        return undefined;
      }
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

  const receipts = receiptsData?.data ?? [];
  const productsArray = products?.data ?? [];

  // ── Mutations ────────────────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: async () => {
      const lines = receiptLines
        .filter((l) => l.productId && l.quantity)
        .map((l) => ({
          productId: l.productId,
          quantity: parseFloat(l.quantity),
          unit: productsArray.find((p) => p.id === l.productId)?.unit || "pièce",
          notes: l.notes || undefined,
        }));

      if (lines.length === 0) throw new Error("Au moins 1 produit requis");

      return createStockReceipt(token(), {
        supplierId: createForm.supplierId || undefined,
        supplierName: createForm.supplierName,
        referenceNumber: createForm.referenceNumber || undefined,
        lines,
        notes: createForm.notes || undefined,
      });
    },
    onSuccess: (result) => {
      toast.success(`Bon ${result.receiptNumber} créé`);
      setShowCreateDialog(false);
      setCreateForm({ supplierId: "", supplierName: "", referenceNumber: "", notes: "" });
      setReceiptLines([{ productId: "", quantity: "", notes: "" }]);
      queryClient.invalidateQueries({ queryKey: ["commerce-receipts", tid] });
      queryClient.invalidateQueries({ queryKey: ["commerce-products", tid] });
    },
    onError: (e: Error) => {
      toast.error(e.message);
    },
  });

  const verifyMutation = useMutation({
    mutationFn: (receiptId: string) => verifyStockReceipt(token(), receiptId),
    onSuccess: (result) => {
      toast.success(`Bon ${result.receiptNumber} vérifié`);
      setShowDetailDialog(false);
      queryClient.invalidateQueries({ queryKey: ["commerce-receipts", tid] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancelMutation = useMutation({
    mutationFn: (receiptId: string) => cancelStockReceipt(token(), receiptId),
    onSuccess: () => {
      toast.success("Bon annulé — stock restauré");
      setShowDetailDialog(false);
      queryClient.invalidateQueries({ queryKey: ["commerce-receipts", tid] });
      queryClient.invalidateQueries({ queryKey: ["commerce-products", tid] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "RECEIVED":
        return <Badge className="bg-blue-100 text-blue-900">Reçu</Badge>;
      case "VERIFIED":
        return <Badge className="bg-green-100 text-green-900">Vérifié</Badge>;
      case "CANCELLED":
        return <Badge variant="destructive">Annulé</Badge>;
      default:
        return <Badge variant="secondary">-</Badge>;
    }
  };

  return (
    <div className="p-6 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Bons de Réception</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {receipts.length} bon{receipts.length > 1 ? "s" : ""} — Traçabilité complète des arrivages
          </p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)} className="bg-orange-600 hover:bg-orange-700 text-white">
          <Plus className="h-4 w-4 mr-2" />
          Nouveau bon
        </Button>
      </div>

      {/* Filtres */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher par numéro, fournisseur..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-40">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Statut" />
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
            <Truck className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Fournisseur" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les fournisseurs</SelectItem>
            {suppliers?.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Tableau */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Numéro</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Fournisseur</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Date</th>
                <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Produits</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Statut</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Enregistré par</th>
                <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && receipts.length === 0 ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-b">
                    <td className="px-4 py-3">
                      <Skeleton className="h-5 w-24" />
                    </td>
                    <td className="px-4 py-3">
                      <Skeleton className="h-5 w-32" />
                    </td>
                    <td className="px-4 py-3">
                      <Skeleton className="h-5 w-28" />
                    </td>
                    <td className="px-4 py-3">
                      <Skeleton className="h-5 w-12 ml-auto" />
                    </td>
                    <td className="px-4 py-3">
                      <Skeleton className="h-5 w-20" />
                    </td>
                    <td className="px-4 py-3">
                      <Skeleton className="h-5 w-24" />
                    </td>
                    <td className="px-4 py-3">
                      <Skeleton className="h-5 w-20 ml-auto" />
                    </td>
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
                        <Clock className="h-3.5 w-3.5" />
                        {formatDate(r.receivedAt)}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-medium">{r.totalItems}</td>
                    <td className="px-4 py-3">{getStatusBadge(r.status)}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{r.receivedByName}</td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-blue-600 hover:bg-blue-100"
                        title="Détails"
                        onClick={() => {
                          setSelectedReceipt(r);
                          setShowDetailDialog(true);
                        }}
                      >
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

      {/* Dialog Créer bon */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">Bon de réception</DialogTitle>
            <p className="text-xs text-muted-foreground mt-1">Enregistrer une livraison fournisseur</p>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Fournisseur */}
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Fournisseur *</Label>
                <Select
                  value={createForm.supplierId}
                  onValueChange={(id) => {
                    const supplier = suppliers?.find((s) => s.id === id);
                    setCreateForm({
                      ...createForm,
                      supplierId: id,
                      supplierName: supplier?.name || "",
                    });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner..." />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers?.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Numéro BC/Facture (optionnel)</Label>
                <Input
                  placeholder="BC-2026-0342"
                  value={createForm.referenceNumber}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, referenceNumber: e.target.value })
                  }
                />
              </div>
            </div>

            {/* Saisie manuelle nom si nécessaire */}
            {!createForm.supplierId && (
              <div className="grid gap-2">
                <Label>Nom fournisseur (si pas en BDD) *</Label>
                <Input
                  placeholder="Nom du fournisseur"
                  value={createForm.supplierName}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, supplierName: e.target.value })
                  }
                />
              </div>
            )}

            {/* Lignes produits */}
            <div className="space-y-3">
              <Label className="font-semibold">Produits reçus *</Label>
              {receiptLines.map((line, idx) => (
                <div key={idx} className="flex gap-2 items-end">
                  <Select
                    value={line.productId}
                    onValueChange={(v) => {
                      const updated = [...receiptLines];
                      updated[idx].productId = v;
                      setReceiptLines(updated);
                    }}
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Produit..." />
                    </SelectTrigger>
                    <SelectContent>
                      {productsArray.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name} ({p.unit})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    placeholder="Qté"
                    className="w-24"
                    value={line.quantity}
                    onChange={(e) => {
                      const updated = [...receiptLines];
                      updated[idx].quantity = e.target.value;
                      setReceiptLines(updated);
                    }}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 text-destructive"
                    onClick={() => {
                      setReceiptLines(receiptLines.filter((_, i) => i !== idx));
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setReceiptLines([...receiptLines, { productId: "", quantity: "", notes: "" }])
                }
              >
                + Ajouter produit
              </Button>
            </div>

            {/* Notes */}
            <div className="grid gap-2">
              <Label>Notes (optionnel)</Label>
              <Input
                placeholder="Remarques sur la livraison..."
                value={createForm.notes}
                onChange={(e) =>
                  setCreateForm({ ...createForm, notes: e.target.value })
                }
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Annuler
            </Button>
            <Button
              className="bg-orange-600 hover:bg-orange-700 text-white"
              onClick={() => createMutation.mutate()}
              disabled={
                !createForm.supplierName ||
                receiptLines.filter((l) => l.productId && l.quantity).length === 0 ||
                createMutation.isPending
              }
            >
              {createMutation.isPending ? "Création..." : "Créer bon"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Détail bon */}
      {selectedReceipt && (
        <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-base">{selectedReceipt.receiptNumber}</DialogTitle>
              <p className="text-xs text-muted-foreground mt-1">
                {getStatusBadge(selectedReceipt.status)} · {selectedReceipt.supplierName}
              </p>
            </DialogHeader>

            <div className="space-y-6 py-4">
              {/* Info principale */}
              <div className="border-b pb-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Fournisseur</p>
                    <p className="font-semibold mt-1">{selectedReceipt.supplierName}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Date/Heure</p>
                    <p className="font-semibold mt-1 text-sm">{formatDate(selectedReceipt.receivedAt)}</p>
                  </div>
                  {selectedReceipt.referenceNumber && (
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">Numéro BC</p>
                      <p className="font-semibold mt-1">{selectedReceipt.referenceNumber}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Enregistré par</p>
                    <p className="font-semibold mt-1">{selectedReceipt.receivedByName}</p>
                  </div>
                </div>
              </div>

              {/* Vérification */}
              {selectedReceipt.verifiedAt && (
                <div className="p-3 rounded-lg border">
                  <p className="text-sm">
                    ✓ Vérifié le {formatDate(selectedReceipt.verifiedAt)}
                  </p>
                </div>
              )}

              {/* Produits */}
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Produits reçus</p>
                <div className="space-y-3">
                  {selectedReceipt.lines?.map((line) => (
                    <div key={line.id} className="pb-3 border-b last:border-b-0">
                      <p className="font-semibold text-sm">{line.product?.name}</p>
                      <p className="text-sm mt-1">
                        {line.quantity} {line.unit}
                        {line.unitPrice && ` · ${formatGNF(line.unitPrice)}`}
                      </p>
                      {line.totalPrice && (
                        <p className="text-sm font-semibold mt-1">{formatGNF(line.totalPrice)}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Notes */}
              {selectedReceipt.notes && (
                <div className="p-3 rounded-lg border">
                  <p className="text-sm">📝 {selectedReceipt.notes}</p>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDetailDialog(false)}>
                Fermer
              </Button>
              {selectedReceipt.status === "RECEIVED" && (
                <Button
                  className="bg-orange-600 hover:bg-orange-700 text-white"
                  onClick={() => verifyMutation.mutate(selectedReceipt.id)}
                  disabled={verifyMutation.isPending}
                >
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  {verifyMutation.isPending ? "Vérification..." : "Vérifier"}
                </Button>
              )}
              {selectedReceipt.status !== "CANCELLED" && (
                <Button
                  variant="destructive"
                  onClick={() => {
                    if (
                      window.confirm(
                        `Annuler ${selectedReceipt.receiptNumber}? Le stock sera restauré.`
                      )
                    ) {
                      cancelMutation.mutate(selectedReceipt.id);
                    }
                  }}
                  disabled={cancelMutation.isPending}
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  {cancelMutation.isPending ? "Annulation..." : "Annuler"}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
