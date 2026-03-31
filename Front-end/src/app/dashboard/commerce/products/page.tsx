"use client";

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import * as storage from "@/lib/storage";
import {
  getProducts,
  getCategories,
  createProduct,
  updateProduct,
  deleteProduct,
  adjustStock,
  getStockMovements,
  type CommerceProduct,
  type CommerceCategory,
  type StockMovement,
} from "@/lib/api/commerce.service";
import { toast } from "sonner";
import {
  Package,
  Plus,
  Search,
  Filter,
  Edit2,
  Trash2,
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  BarChart2,
  Sparkles,
  ChevronDown,
  ChevronUp,
  FileText,
  Clock,
} from "lucide-react";
import Link from "next/link";
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

function formatGNF(amount: number) {
  return new Intl.NumberFormat("fr-GN").format(amount) + " GNF";
}

const UNITS = [
  "pièce", "paire", "forfait",
  "kg", "tonne",
  "litre", "bidon", "bouteille", "flacon", "pot", "jerrican",
  "sac", "sachet", "boîte", "carton", "caisse", "botte",
  "barre", "planche", "mètre", "m²", "rouleau",
];

const EMPTY_FORM = {
  name: "",
  reference: "",
  categoryId: "",
  unit: "pièce",
  buyPrice: "",
  sellPrice: "",
  stockQty: "0",
  stockAlert: "5",
};

// ── Clés de cache localStorage ────────────────────────────────────────────────
const CACHE_PRODUCTS = (tid: string) => `structura_commerce_products_${tid}`;
const CACHE_CATEGORIES = (tid: string) => `structura_commerce_categories_${tid}`;

type SortField = "name" | "stock" | "price" | null;
type SortDirection = "asc" | "desc";

// Dialog Historique avec requête séparée
function HistoryDialog({
  product,
  open,
  onOpenChange,
  token,
}: {
  product: CommerceProduct;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
}) {
  const { data: historyData, isLoading } = useQuery({
    queryKey: ["stock-movements", product.id],
    queryFn: () => getStockMovements(token, product.id, 100),
    enabled: !!open && !!product.id,
  });

  const movements = historyData?.movements ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1rem)] max-w-2xl max-h-[95dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">{product.name}</DialogTitle>
          <p className="text-xs text-muted-foreground mt-1">Traçabilité des mouvements</p>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Stock actuel */}
          <div className="flex justify-between items-end border-b pb-4">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Stock actuel</p>
              <p className="text-3xl font-bold mt-1">{product.stockQty}</p>
              <p className="text-xs text-muted-foreground mt-1">{product.unit}</p>
            </div>
          </div>

          {/* Mouvements */}
          {isLoading ? (
            <p className="text-sm text-muted-foreground text-center py-8">Chargement...</p>
          ) : movements && movements.length > 0 ? (
            <div className="space-y-4 max-h-96 overflow-y-auto">
              {movements.map((m) => (
                <div key={m.id} className="pb-4 border-b last:border-b-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-lg">
                          {m.type === "IN" && "➕"}
                          {m.type === "OUT" && "➖"}
                          {m.type === "RETURN" && "🔄"}
                          {m.type === "ADJUSTMENT" && "⚙️"}
                        </span>
                        <span className="font-medium text-sm">
                          {m.type === "IN"
                            ? "Entrée"
                            : m.type === "OUT"
                            ? "Sortie"
                            : m.type === "RETURN"
                            ? "Retour"
                            : "Ajustement"}
                        </span>
                      </div>
                      <p className="text-sm font-semibold">{m.quantity} {product.unit}</p>
                      {m.reason && (
                        <p className="text-xs text-muted-foreground mt-1">{m.reason}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-2">
                        {new Date(m.createdAt).toLocaleDateString("fr-FR", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">Aucun mouvement enregistré</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fermer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ProductsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<CommerceProduct | null>(null);
  const [deleting, setDeleting] = useState<CommerceProduct | null>(null);
  const [stockDialog, setStockDialog] = useState<CommerceProduct | null>(null);
  const [stockForm, setStockForm] = useState<{ quantity: string; type: "IN" | "OUT"; reason: string }>({ quantity: "", type: "IN", reason: "" });
  const [form, setForm] = useState(EMPTY_FORM);
  const [sortField, setSortField] = useState<SortField>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showHistoryDialog, setShowHistoryDialog] = useState(false);
  const [historyProduct, setHistoryProduct] = useState<CommerceProduct | null>(null);

  const token = () => storage.getAuthItem("structura_token") ?? "";
  const tid = user?.tenantId ?? "";

  // ── Produits — stale-while-revalidate + cache localStorage ───────────────
  const { data, isLoading } = useQuery({
    queryKey: ["commerce-products", tid, search, categoryFilter],
    queryFn: async () => {
      const result = await getProducts(token(), {
        search: search || undefined,
        categoryId: categoryFilter !== "all" ? categoryFilter : undefined,
        limit: 200,
      });
      // Sauvegarder sans filtre pour le cache (requête sans filtre seulement)
      if (!search && categoryFilter === "all") {
        try { localStorage.setItem(CACHE_PRODUCTS(tid), JSON.stringify(result)); } catch { /* quota */ }
      }
      return result;
    },
    enabled: !!user,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    // Affichage instantané depuis localStorage tant que React Query revalide
    placeholderData: () => {
      if (search || categoryFilter !== "all") return undefined;
      try {
        const c = localStorage.getItem(CACHE_PRODUCTS(tid));
        return c ? JSON.parse(c) : undefined;
      } catch { return undefined; }
    },
  });

  // ── Catégories — très stables, cache 5 min ────────────────────────────────
  const { data: categories } = useQuery({
    queryKey: ["commerce-categories", tid],
    queryFn: async () => {
      const result = await getCategories(token());
      try { localStorage.setItem(CACHE_CATEGORIES(tid), JSON.stringify(result)); } catch { /* quota */ }
      return result;
    },
    enabled: !!user,
    staleTime: 300_000,
    gcTime: 10 * 60_000,
    placeholderData: () => {
      try {
        const c = localStorage.getItem(CACHE_CATEGORIES(tid));
        return c ? JSON.parse(c) : undefined;
      } catch { return undefined; }
    },
  });

  const products: CommerceProduct[] = data?.data ?? [];

  // ── Tri et filtrage ────────────────────────────────────────────────────────
  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const sortedProducts = [...products].sort((a, b) => {
    if (!sortField) return 0;
    const direction = sortDirection === "asc" ? 1 : -1;

    if (sortField === "name") {
      return direction * a.name.localeCompare(b.name);
    }
    if (sortField === "stock") {
      return direction * (a.stockQty - b.stockQty);
    }
    if (sortField === "price") {
      return direction * (a.sellPrice - b.sellPrice);
    }
    return 0;
  });

  const getStockEmoji = (p: CommerceProduct): string => {
    if (p.stockQty <= 0) return "❌";
    if (p.stockAlert && p.stockQty <= p.stockAlert) return "⚠️";
    return "✅";
  };

  // ── Sélection multiple ────────────────────────────────────────────────────
  const toggleSelect = (id: string) => {
    const newSelected = new Set(selected);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelected(newSelected);
  };

  const toggleSelectAll = () => {
    if (selected.size === sortedProducts.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(sortedProducts.map((p) => p.id)));
    }
  };

  const handleBulkDelete = async () => {
    if (!window.confirm(`Supprimer ${selected.size} produit(s) ?`)) return;

    const ids = Array.from(selected);
    setDeleting(null);

    for (const id of ids) {
      try {
        await deleteProduct(token(), id);
      } catch (e) {
        console.error("Erreur suppression:", e);
      }
    }

    toast.success(`${ids.length} produit(s) supprimé(s)`);
    setSelected(new Set());
    queryClient.invalidateQueries({ queryKey: ["commerce-products", tid] });
  };

  // ── Mutation : créer / modifier — optimistic update ───────────────────────
  const saveMutation = useMutation({
    mutationFn: () => {
      const values = {
        name: form.name,
        reference: form.reference || undefined,
        categoryId: form.categoryId || undefined,
        unit: form.unit,
        buyPrice: parseFloat(form.buyPrice),
        sellPrice: parseFloat(form.sellPrice),
        stockQty: parseInt(form.stockQty),
        stockAlert: parseInt(form.stockAlert),
      };
      return editing
        ? updateProduct(token(), editing.id, values)
        : createProduct(token(), values);
    },
    onMutate: async () => {
      // Annuler les requêtes en vol pour éviter les conflits
      await queryClient.cancelQueries({ queryKey: ["commerce-products", tid] });
    },
    onSuccess: (result) => {
      toast.success(editing ? "Produit mis à jour" : "Produit créé");
      // Mise à jour chirurgicale du cache — pas de refetch réseau
      queryClient.setQueryData(
        ["commerce-products", tid, "", "all"],
        (old: any) => {
          if (!old) return old;
          const list: CommerceProduct[] = old?.data ?? old ?? [];
          const updated = editing
            ? list.map((p) => (p.id === editing.id ? result : p))
            : [result, ...list];
          const newData = old?.data !== undefined ? { ...old, data: updated } : updated;
          try { localStorage.setItem(CACHE_PRODUCTS(tid), JSON.stringify(newData)); } catch { /* quota */ }
          return newData;
        }
      );
      // Mettre à jour la caisse aussi
      queryClient.invalidateQueries({ queryKey: ["commerce-products-pos"] });
      setShowDialog(false);
      setEditing(null);
      setForm(EMPTY_FORM);
    },
    onError: (e: Error) => {
      toast.error(e.message);
      queryClient.invalidateQueries({ queryKey: ["commerce-products", tid] });
    },
  });

  // ── Mutation : supprimer — optimistic update ──────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteProduct(token(), id),
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: ["commerce-products", tid] });
      const previous = queryClient.getQueryData(["commerce-products", tid, "", "all"]);
      // Retrait immédiat du cache
      queryClient.setQueryData(
        ["commerce-products", tid, "", "all"],
        (old: any) => {
          if (!old) return old;
          const list: CommerceProduct[] = old?.data ?? old ?? [];
          const updated = list.filter((p) => p.id !== id);
          return old?.data !== undefined ? { ...old, data: updated } : updated;
        }
      );
      return { previous };
    },
    onSuccess: () => {
      toast.success("Produit supprimé");
      setDeleting(null);
    },
    onError: (e: Error, _, context: any) => {
      toast.error(e.message);
      if (context?.previous) {
        queryClient.setQueryData(["commerce-products", tid, "", "all"], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["commerce-products", tid] });
      queryClient.invalidateQueries({ queryKey: ["commerce-products-pos"] });
    },
  });

  // ── Mutation : ajustement stock — optimistic ──────────────────────────────
  const stockMutation = useMutation({
    mutationFn: () =>
      adjustStock(token(), stockDialog!.id, {
        quantity: parseInt(stockForm.quantity),
        type: stockForm.type,
        reason: stockForm.reason || undefined,
      }),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["commerce-products", tid] });
      const delta = parseInt(stockForm.quantity) || 0;
      const sign = stockForm.type === "IN" ? 1 : -1;
      queryClient.setQueryData(
        ["commerce-products", tid, "", "all"],
        (old: any) => {
          if (!old || !stockDialog) return old;
          const list: CommerceProduct[] = old?.data ?? old ?? [];
          const updated = list.map((p) =>
            p.id === stockDialog.id
              ? { ...p, stockQty: Math.max(0, p.stockQty + sign * delta) }
              : p
          );
          return old?.data !== undefined ? { ...old, data: updated } : updated;
        }
      );
    },
    onSuccess: () => {
      toast.success("Stock ajusté");
      setStockDialog(null);
      setStockForm({ quantity: "", type: "IN", reason: "" });
      queryClient.invalidateQueries({ queryKey: ["commerce-products", tid] });
      queryClient.invalidateQueries({ queryKey: ["commerce-products-pos"] });
      queryClient.invalidateQueries({ queryKey: ["commerce-dashboard"] });
    },
    onError: (e: Error) => {
      toast.error(e.message);
      queryClient.invalidateQueries({ queryKey: ["commerce-products", tid] });
      queryClient.invalidateQueries({ queryKey: ["commerce-products-pos"] });
    },
  });


  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setShowDialog(true);
  };

  const openEdit = (p: CommerceProduct) => {
    setEditing(p);
    setForm({
      name: p.name,
      reference: p.reference ?? "",
      categoryId: p.categoryId ?? "",
      unit: p.unit || "pièce",
      buyPrice: String(p.buyPrice),
      sellPrice: String(p.sellPrice),
      stockQty: String(p.stockQty),
      stockAlert: String(p.stockAlert),
    });
    setShowDialog(true);
  };

  const margin = (p: CommerceProduct) =>
    p.buyPrice > 0
      ? Math.round(((p.sellPrice - p.buyPrice) / p.buyPrice) * 100)
      : null;

  return (
    <div className="p-6 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Produits</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {products.length} produit{products.length > 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/dashboard/commerce/setup-catalog">
            <Button variant="outline" className="gap-2">
              <Sparkles className="h-4 w-4 text-orange-500" />
              Importer un catalogue
            </Button>
          </Link>
          <Button onClick={openCreate} className="bg-orange-600 hover:bg-orange-700 text-white">
            <Plus className="h-4 w-4 mr-2" />
            Ajouter un produit
          </Button>
        </div>
      </div>

      {/* Filtres + Actions groupées */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher par nom, référence..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-full sm:w-48">
              <Filter className="h-4 w-4 mr-2 text-muted-foreground" />
              <SelectValue placeholder="Catégorie" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes les catégories</SelectItem>
              {categories?.map((c: CommerceCategory) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Actions groupées si sélection */}
        {selected.size > 0 && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-50 border border-blue-200">
            <div className="inline-flex h-5 w-5 items-center justify-center rounded border border-blue-400 bg-blue-500 text-white text-xs">
              ✓
            </div>
            <span className="font-medium text-blue-900">{selected.size} sélectionné(s)</span>
            <div className="flex-1" />
            <Button
              variant="ghost"
              size="sm"
              className="text-red-600 hover:bg-red-100 hover:text-red-700"
              onClick={handleBulkDelete}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Supprimer
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
              Annuler
            </Button>
          </div>
        )}
      </div>

      {/* Tableau */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="px-4 py-3 w-12">
                  <button
                    className="inline-flex h-5 w-5 items-center justify-center rounded border"
                    onClick={toggleSelectAll}
                    title={selected.size === sortedProducts.length && sortedProducts.length > 0 ? "Désélectionner tout" : "Sélectionner tout"}
                  >
                    {selected.size === sortedProducts.length && sortedProducts.length > 0 && (
                      <span className="text-xs">✓</span>
                    )}
                  </button>
                </th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground cursor-pointer hover:text-foreground"
                  onClick={() => toggleSort("name")}
                >
                  <div className="flex items-center gap-1">
                    Produit
                    {sortField === "name" && (
                      sortDirection === "asc" ? (
                        <ChevronUp className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5" />
                      )
                    )}
                  </div>
                </th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Catégorie</th>
                <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Achat</th>
                <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Vente</th>
                <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Marge</th>
                <th className="text-right px-4 py-3 font-semibold text-muted-foreground cursor-pointer hover:text-foreground"
                  onClick={() => toggleSort("stock")}
                >
                  <div className="flex items-center justify-end gap-1">
                    Stock
                    {sortField === "stock" && (
                      sortDirection === "asc" ? (
                        <ChevronUp className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5" />
                      )
                    )}
                  </div>
                </th>
                <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Alerte</th>
                <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && sortedProducts.length === 0 ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-b">
                    <td className="px-4 py-3"><Skeleton className="h-4 w-4" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-5 w-40" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-5 w-24" /></td>
                    <td className="px-4 py-3 text-right"><Skeleton className="h-5 w-20 ml-auto" /></td>
                    <td className="px-4 py-3 text-right"><Skeleton className="h-5 w-20 ml-auto" /></td>
                    <td className="px-4 py-3 text-right"><Skeleton className="h-5 w-12 ml-auto" /></td>
                    <td className="px-4 py-3 text-right"><Skeleton className="h-5 w-16 ml-auto" /></td>
                    <td className="px-4 py-3 text-right"><Skeleton className="h-5 w-12 ml-auto" /></td>
                    <td className="px-4 py-3 text-right"><Skeleton className="h-5 w-20 ml-auto" /></td>
                  </tr>
                ))
              ) : sortedProducts.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-16 text-muted-foreground">
                    <Package className="h-10 w-10 mx-auto mb-2 opacity-20" />
                    <p>Aucun produit trouvé</p>
                  </td>
                </tr>
              ) : (
                sortedProducts.map((p) => {
                  const m = margin(p);
                  const emoji = getStockEmoji(p);
                  const isSelected = selected.has(p.id);
                  return (
                    <tr key={p.id} className={`border-b hover:bg-muted/30 transition-colors ${isSelected ? "bg-blue-50" : ""}`}>
                      <td className="px-4 py-3">
                        <button
                          className="inline-flex h-5 w-5 items-center justify-center rounded border cursor-pointer hover:border-blue-500"
                          onClick={() => toggleSelect(p.id)}
                          title={isSelected ? "Désélectionner" : "Sélectionner"}
                        >
                          {isSelected && <span className="text-xs">✓</span>}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-start gap-2">
                          <span className="text-lg mt-0.5">{emoji}</span>
                          <div>
                            <p className="font-medium">{p.name}</p>
                            {p.reference && (
                              <p className="text-xs text-muted-foreground">{p.reference}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {p.category?.name ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-right text-muted-foreground">
                        {formatGNF(p.buyPrice)}
                      </td>
                      <td className="px-4 py-3 text-right font-medium">
                        {formatGNF(p.sellPrice)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {m !== null ? (
                          <span className={`text-xs font-semibold ${m >= 20 ? "text-emerald-600" : m >= 0 ? "text-amber-600" : "text-red-600"}`}>
                            {m >= 0 ? "+" : ""}{m}%
                          </span>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={`font-medium ${p.stockQty <= 0 ? "text-red-600" : p.stockQty <= p.stockAlert ? "text-amber-600" : ""}`}>
                          {p.stockQty} {p.unit}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Badge variant={p.stockQty <= p.stockAlert ? "destructive" : "secondary"}>
                          {p.stockAlert}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost" size="icon" className="h-8 w-8 text-purple-600 hover:bg-purple-100 hover:text-purple-700"
                            title="Voir l'historique des mouvements"
                            onClick={() => {
                              setHistoryProduct(p);
                              setShowHistoryDialog(true);
                            }}
                          >
                            <FileText className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost" size="icon" className="h-8 w-8 text-blue-600 hover:bg-blue-100 hover:text-blue-700"
                            title="Ajuster le stock"
                            onClick={() => { setStockDialog(p); setStockForm({ quantity: "", type: "IN", reason: "" }); }}
                          >
                            <BarChart2 className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-slate-100" onClick={() => openEdit(p)}>
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost" size="icon"
                            className="h-8 w-8 text-destructive hover:bg-red-100 hover:text-destructive"
                            onClick={() => setDeleting(p)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Dialog création / modification */}
      <Dialog open={showDialog} onOpenChange={(o) => { setShowDialog(o); if (!o) { setEditing(null); setForm(EMPTY_FORM); } }}>
        <DialogContent className="w-[calc(100vw-1rem)] max-w-lg max-h-[95dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">{editing ? form.name || "Modifier" : "Nouveau produit"}</DialogTitle>
            <p className="text-xs text-muted-foreground mt-1">{editing ? "Mettre à jour les informations" : "Ajouter un nouveau produit"}</p>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>Nom *</Label>
              <Input placeholder="Coca-Cola 33cl" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Référence</Label>
                <Input placeholder="SKU-001" value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label>Unité</Label>
                <Select value={form.unit || "pièce"} onValueChange={(v) => setForm({ ...form, unit: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {UNITS.map((u) => (<SelectItem key={u} value={u}>{u}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Catégorie</Label>
              <Select
                value={form.categoryId || "none"}
                onValueChange={(v) => setForm({ ...form, categoryId: v === "none" ? "" : v })}
              >
                <SelectTrigger><SelectValue placeholder="Aucune catégorie" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Aucune catégorie</SelectItem>
                  {categories?.map((c: CommerceCategory) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Prix d&apos;achat (GNF) *</Label>
                <Input type="number" placeholder="0" value={form.buyPrice} onChange={(e) => setForm({ ...form, buyPrice: e.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label>Prix de vente (GNF) *</Label>
                <Input type="number" placeholder="0" value={form.sellPrice} onChange={(e) => setForm({ ...form, sellPrice: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Stock initial</Label>
                <Input type="number" placeholder="0" value={form.stockQty} onChange={(e) => setForm({ ...form, stockQty: e.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label>Alerte stock bas</Label>
                <Input type="number" placeholder="5" value={form.stockAlert} onChange={(e) => setForm({ ...form, stockAlert: e.target.value })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Annuler</Button>
            <Button
              className="bg-orange-600 hover:bg-orange-700 text-white"
              onClick={() => saveMutation.mutate()}
              disabled={!form.name || !form.buyPrice || !form.sellPrice || saveMutation.isPending}
            >
              {saveMutation.isPending ? "Enregistrement..." : editing ? "Mettre à jour" : "Créer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog ajustement stock */}
      <Dialog open={!!stockDialog} onOpenChange={(o) => !o && setStockDialog(null)}>
        <DialogContent className="w-[calc(100vw-1rem)] max-w-sm max-h-[95dvh]">
          <DialogHeader>
            <DialogTitle className="text-base">{stockDialog?.name}</DialogTitle>
            <p className="text-xs text-muted-foreground mt-1">Ajustement de stock</p>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Stock actuel */}
            <div className="border-b pb-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Stock actuel</p>
              <p className="text-2xl font-bold mt-1">{stockDialog?.stockQty} {stockDialog?.unit}</p>
            </div>

            {/* Type */}
            <div className="grid gap-3">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Type</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setStockForm({ ...stockForm, type: "IN" })}
                  className={`p-3 rounded-lg border-2 text-sm font-medium transition-colors ${
                    stockForm.type === "IN"
                      ? "border-slate-900 bg-slate-100 text-slate-900"
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  ➕ Entrée
                </button>
                <button
                  onClick={() => setStockForm({ ...stockForm, type: "OUT" })}
                  className={`p-3 rounded-lg border-2 text-sm font-medium transition-colors ${
                    stockForm.type === "OUT"
                      ? "border-slate-900 bg-slate-100 text-slate-900"
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  ➖ Sortie
                </button>
              </div>
            </div>

            {/* Quantité */}
            <div className="grid gap-2">
              <Label>Quantité *</Label>
              <Input
                type="number"
                placeholder="0"
                value={stockForm.quantity}
                onChange={(e) => setStockForm({ ...stockForm, quantity: e.target.value })}
              />
            </div>

            {/* Motif */}
            <div className="grid gap-2">
              <Label>Motif (optionnel)</Label>
              <Input
                placeholder="Ex: inventaire, retour client..."
                value={stockForm.reason}
                onChange={(e) => setStockForm({ ...stockForm, reason: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStockDialog(null)}>Annuler</Button>
            <Button
              className="bg-orange-600 hover:bg-orange-700 text-white"
              onClick={() => stockMutation.mutate()}
              disabled={!stockForm.quantity || stockMutation.isPending}
            >
              {stockMutation.isPending ? "Enregistrement..." : "Confirmer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Historique mouvements */}
      {historyProduct && (
        <HistoryDialog
          product={historyProduct}
          open={showHistoryDialog}
          onOpenChange={setShowHistoryDialog}
          token={token()}
        />
      )}

      {/* Dialog suppression */}
      <AlertDialog open={!!deleting} onOpenChange={() => setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce produit ?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{deleting?.name}</strong> sera supprimé définitivement. Les ventes existantes ne seront pas affectées.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground"
              onClick={() => deleting && deleteMutation.mutate(deleting.id)}
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
