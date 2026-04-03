"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import * as storage from "@/lib/storage";
import { toast } from "sonner";
import {
  SECTOR_TEMPLATES,
  type SectorTemplate,
  type CatalogProduct,
} from "@/lib/commerce-catalog-templates";
import {
  ChevronLeft,
  Check,
  Plus,
  X,
  PackagePlus,
  Zap,
  Settings2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProductRow {
  id: string;
  categoryName: string;
  name: string;
  unit: string;
  buyPrice: string;
  sellPrice: string;
  stockQty: string;
  stockAlert: string;
  selected: boolean;
  custom: boolean;
}

type CatalogItem = {
  categoryName: string;
  name: string;
  unit: string;
  buyPrice: number;
  sellPrice: number;
  stockAlert: number;
};

function makeId() {
  return Math.random().toString(36).slice(2);
}

function rowFromTemplate(cat: string, p: CatalogProduct): ProductRow {
  return {
    id: makeId(),
    categoryName: cat,
    name: p.name,
    unit: p.unit,
    buyPrice: String(p.buyPrice),
    sellPrice: String(p.sellPrice),
    stockQty: "0",
    stockAlert: String(p.stockAlert),
    selected: true,
    custom: false,
  };
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

async function postSetupCatalog(token: string, items: CatalogItem[]) {
  const res = await fetch(`${API_BASE}/commerce/products/catalog/setup`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ items }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message ?? "Erreur lors de l'importation");
  }
  return res.json();
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SetupCatalogPage() {
  const { user } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<1 | 2>(1);
  const [sector, setSector] = useState<SectorTemplate | null>(null);
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [newCatName, setNewCatName] = useState("");
  const [addingCat, setAddingCat] = useState(false);
  const [quickLoadingSector, setQuickLoadingSector] = useState<string | null>(null);

  const token = () => storage.getAuthItem("structura_token") ?? "";

  // ── Callback commun après import ─────────────────────────────────────────
  const onImportSuccess = (data: { products: number; skipped?: number }) => {
    const msg = `${data.products} produit${data.products > 1 ? "s" : ""} importé${data.products > 1 ? "s" : ""}`;
    const hint = data.skipped ? ` · ${data.skipped} ignoré${data.skipped > 1 ? "s" : ""}` : "";
    toast.success(`${msg}${hint} — Ajustez les prix dans Produits si besoin`);
    queryClient.invalidateQueries({ queryKey: ["commerce-products"] });
    queryClient.invalidateQueries({ queryKey: ["commerce-categories"] });
    queryClient.invalidateQueries({ queryKey: ["commerce-dashboard"] });
    if (user?.tenantId) {
      localStorage.removeItem(`structura_commerce_products_${user.tenantId}`);
      localStorage.removeItem(`structura_commerce_categories_${user.tenantId}`);
    }
    router.push("/dashboard/commerce/products");
  };

  // ── Import direct (1 clic, depuis étape 1) ───────────────────────────────
  const quickMutation = useMutation({
    mutationFn: (items: CatalogItem[]) => postSetupCatalog(token(), items),
    onSuccess: onImportSuccess,
    onError: (e: Error) => {
      setQuickLoadingSector(null);
      toast.error(e.message);
    },
  });

  const handleQuickImport = (s: SectorTemplate) => {
    setQuickLoadingSector(s.id);
    const items: CatalogItem[] = s.categories.flatMap((cat) =>
      cat.products.map((p) => ({
        categoryName: cat.name,
        name: p.name,
        unit: p.unit,
        buyPrice: p.buyPrice,
        sellPrice: p.sellPrice,
        stockAlert: p.stockAlert,
      }))
    );
    quickMutation.mutate(items);
  };

  // ── Personnaliser (aller à étape 2) ──────────────────────────────────────
  const pickSector = (s: SectorTemplate) => {
    setSector(s);
    const built: ProductRow[] = [];
    for (const cat of s.categories) {
      for (const p of cat.products) {
        built.push(rowFromTemplate(cat.name, p));
      }
    }
    setRows(built);
    setStep(2);
  };

  // ── Import depuis étape 2 ────────────────────────────────────────────────
  const setupMutation = useMutation({
    mutationFn: () => {
      const items: CatalogItem[] = rows
        .filter((r) => r.selected && r.name.trim())
        .map((r) => ({
          categoryName: r.categoryName,
          name: r.name.trim(),
          unit: r.unit,
          buyPrice: parseFloat(r.buyPrice) || 0,
          sellPrice: parseFloat(r.sellPrice) || 0,
          stockAlert: parseFloat(r.stockAlert) || 5,
        }));
      return postSetupCatalog(token(), items);
    },
    onSuccess: onImportSuccess,
    onError: (e: Error) => toast.error(e.message),
  });

  // ── Helpers étape 2 ──────────────────────────────────────────────────────
  const categories = useMemo(() => {
    const seen = new Set<string>();
    return rows.reduce<string[]>((acc, r) => {
      if (!seen.has(r.categoryName)) { seen.add(r.categoryName); acc.push(r.categoryName); }
      return acc;
    }, []);
  }, [rows]);

  const toggleRow = (id: string) =>
    setRows((p) => p.map((r) => r.id === id ? { ...r, selected: !r.selected } : r));

  const toggleCat = (cat: string) => {
    const catRows = rows.filter((r) => r.categoryName === cat);
    const allOn = catRows.every((r) => r.selected);
    setRows((p) => p.map((r) => r.categoryName === cat ? { ...r, selected: !allOn } : r));
  };

  const updateRow = (id: string, field: keyof ProductRow, value: string) =>
    setRows((p) => p.map((r) => r.id === id ? { ...r, [field]: value } : r));

  const removeRow = (id: string) => setRows((p) => p.filter((r) => r.id !== id));

  const addProduct = (cat: string) => {
    const newRow: ProductRow = {
      id: makeId(), categoryName: cat,
      name: "", unit: "pièce", buyPrice: "0", sellPrice: "0", stockQty: "0", stockAlert: "5",
      selected: true, custom: true,
    };
    setRows((prev) => {
      const lastIdx = [...prev].map((r) => r.categoryName).lastIndexOf(cat);
      const result = [...prev];
      result.splice(lastIdx + 1, 0, newRow);
      return result;
    });
  };

  const addCategory = () => {
    const name = newCatName.trim();
    if (!name) return;
    if (rows.some((r) => r.categoryName.toLowerCase() === name.toLowerCase())) {
      toast.error("Cette catégorie existe déjà"); return;
    }
    addProduct(name);
    setNewCatName("");
    setAddingCat(false);
  };

  const selectedCount = rows.filter((r) => r.selected && r.name.trim()).length;
  const isAnyImporting = quickMutation.isPending || setupMutation.isPending;

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">

      {/* ── ÉTAPE 1 : Choix secteur ──────────────────────────────────────── */}
      {step === 1 && (
        <>
          <div>
            <h1 className="text-2xl font-bold">Configurer votre catalogue</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Choisissez votre secteur — vos produits seront prêts en quelques secondes.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {SECTOR_TEMPLATES.map((s) => {
              const totalProducts = s.categories.reduce((n, c) => n + c.products.length, 0);
              const isLoadingThis = quickLoadingSector === s.id && quickMutation.isPending;

              return (
                <div
                  key={s.id}
                  className="flex flex-col gap-3 p-4 rounded-2xl border-2 bg-card hover:border-orange-200 transition-all"
                >
                  {/* Info secteur */}
                  <div className="flex items-center gap-3">
                    <span className="text-3xl shrink-0">{s.emoji}</span>
                    <div className="min-w-0">
                      <p className="font-semibold text-sm leading-tight">{s.label}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">
                        {s.description}
                      </p>
                      <p className="text-[10px] text-orange-600 font-medium mt-0.5">
                        {totalProducts} produits · {s.categories.length} catégories
                      </p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    <Button
                      className="flex-1 h-9 bg-orange-600 hover:bg-orange-700 text-white text-sm gap-1.5"
                      onClick={() => handleQuickImport(s)}
                      disabled={isAnyImporting}
                    >
                      {isLoadingThis ? (
                        <span className="h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                      ) : (
                        <Zap className="h-3.5 w-3.5" />
                      )}
                      {isLoadingThis ? "Import..." : "Importer"}
                    </Button>
                    <Button
                      variant="outline"
                      className="h-9 px-3 text-sm gap-1.5"
                      onClick={() => pickSector(s)}
                      disabled={isAnyImporting}
                    >
                      <Settings2 className="h-3.5 w-3.5" />
                      Personnaliser
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="text-xs text-center text-muted-foreground space-y-1">
            <p>
              <Zap className="h-3 w-3 inline mr-1 text-orange-500" />
              <strong>Importer</strong> — catalogue prêt en 1 clic, ajustez les prix dans Produits ensuite
            </p>
            <p className="opacity-60">
              <Settings2 className="h-3 w-3 inline mr-1" />
              <strong>Personnaliser</strong> — choisissez les produits et modifiez les prix avant l&apos;import
            </p>
          </div>
        </>
      )}

      {/* ── ÉTAPE 2 : Personnalisation (3 colonnes) ──────────────────────── */}
      {step === 2 && sector && (
        <>
          {/* Header sticky */}
          <div className="sticky top-0 z-10 -mx-4 px-4 py-3 bg-background border-b flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <button
                onClick={() => setStep(1)}
                className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
              >
                <ChevronLeft className="h-4 w-4" />
                Changer
              </button>
              <span className="text-muted-foreground">·</span>
              <span className="text-xl">{sector.emoji}</span>
              <span className="font-semibold text-sm truncate">{sector.label}</span>
              <span className="text-xs text-muted-foreground hidden sm:block">
                {selectedCount} sélectionné{selectedCount > 1 ? "s" : ""}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button variant="ghost" size="sm" onClick={() => router.push("/dashboard/commerce/products")}>
                Annuler
              </Button>
              <Button
                size="sm"
                className="bg-orange-600 hover:bg-orange-700 text-white"
                onClick={() => setupMutation.mutate()}
                disabled={selectedCount === 0 || setupMutation.isPending}
              >
                {setupMutation.isPending ? "Import..." : (
                  <><Check className="h-4 w-4 mr-1.5" />Importer {selectedCount > 0 && `(${selectedCount})`}</>
                )}
              </Button>
            </div>
          </div>

          <p className="text-sm text-muted-foreground">
            Cochez vos produits · Ajustez le prix de vente · Les autres détails se configurent dans la fiche produit
          </p>

          {/* Catégories */}
          <div className="space-y-4">
            {categories.map((catName) => {
              const catRows = rows.filter((r) => r.categoryName === catName);
              const selectedInCat = catRows.filter((r) => r.selected).length;
              const allOn = selectedInCat === catRows.length;

              return (
                <div key={catName} className="rounded-2xl border bg-card overflow-hidden">

                  {/* Header catégorie */}
                  <div className="flex items-center px-4 py-2.5 bg-muted/30 border-b">
                    <button
                      onClick={() => toggleCat(catName)}
                      className="flex items-center gap-2.5 min-w-0"
                    >
                      <span className={cn(
                        "h-5 w-5 rounded flex items-center justify-center border-2 transition-colors shrink-0",
                        allOn
                          ? "bg-orange-500 border-orange-500"
                          : selectedInCat > 0
                          ? "bg-orange-200 border-orange-400 dark:bg-orange-900"
                          : "border-muted-foreground/40"
                      )}>
                        {(allOn || selectedInCat > 0) && <Check className="h-3 w-3 text-white" />}
                      </span>
                      <span className="font-semibold text-sm">{catName}</span>
                      <span className="text-xs text-muted-foreground">
                        {selectedInCat}/{catRows.length}
                      </span>
                    </button>
                  </div>

                  {/* En-têtes colonnes */}
                  <div className="grid grid-cols-[32px_1fr_130px_32px] gap-x-2 items-center px-3 py-1.5 bg-muted/10 text-[10px] font-medium text-muted-foreground uppercase tracking-wide border-b">
                    <div />
                    <div>Produit</div>
                    <div>Prix de vente</div>
                    <div />
                  </div>

                  {/* Lignes */}
                  <div className="divide-y">
                    {catRows.map((row) => (
                      <div
                        key={row.id}
                        className={cn(
                          "grid grid-cols-[32px_1fr_130px_32px] gap-x-2 items-center px-3 py-2 transition-colors",
                          row.selected ? "bg-card" : "bg-muted/20 opacity-50"
                        )}
                      >
                        {/* Checkbox */}
                        <button
                          onClick={() => toggleRow(row.id)}
                          className={cn(
                            "h-5 w-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors",
                            row.selected
                              ? "bg-orange-500 border-orange-500"
                              : "border-muted-foreground/40 hover:border-orange-400"
                          )}
                        >
                          {row.selected && <Check className="h-3 w-3 text-white" />}
                        </button>

                        {/* Nom */}
                        <Input
                          value={row.name}
                          onChange={(e) => updateRow(row.id, "name", e.target.value)}
                          className="h-8 text-sm border-0 shadow-none focus-visible:ring-1 px-1"
                          placeholder="Nom du produit"
                        />

                        {/* Prix de vente */}
                        <div className="flex items-center relative">
                          <Input
                            type="number"
                            value={row.sellPrice}
                            onChange={(e) => updateRow(row.id, "sellPrice", e.target.value)}
                            className="h-8 text-xs pr-9 pl-2"
                          />
                          <span className="absolute right-2 text-[9px] text-muted-foreground">GNF</span>
                        </div>

                        {/* Supprimer — custom seulement */}
                        {row.custom ? (
                          <button
                            onClick={() => removeRow(row.id)}
                            className="text-destructive hover:text-destructive/70 flex items-center justify-center"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        ) : <div />}
                      </div>
                    ))}
                  </div>

                  {/* Ajouter produit dans la catégorie */}
                  <button
                    onClick={() => addProduct(catName)}
                    className="w-full flex items-center gap-2 px-4 py-2 text-xs text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950/30 transition-colors border-t"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Ajouter un produit dans « {catName} »
                  </button>
                </div>
              );
            })}

            {/* Ajouter catégorie */}
            {addingCat ? (
              <div className="flex items-center gap-2 p-3 rounded-2xl border-2 border-dashed border-orange-300">
                <Input
                  autoFocus
                  placeholder="Nom de la catégorie..."
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") addCategory();
                    if (e.key === "Escape") setAddingCat(false);
                  }}
                  className="flex-1 h-9"
                />
                <Button
                  size="sm"
                  onClick={addCategory}
                  disabled={!newCatName.trim()}
                  className="bg-orange-600 hover:bg-orange-700 text-white shrink-0"
                >
                  Ajouter
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => { setAddingCat(false); setNewCatName(""); }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <button
                onClick={() => setAddingCat(true)}
                className="w-full flex items-center justify-center gap-2 p-4 rounded-2xl border-2 border-dashed text-sm text-muted-foreground hover:border-orange-400 hover:text-orange-600 transition-colors"
              >
                <PackagePlus className="h-4 w-4" />
                Ajouter une nouvelle catégorie
              </button>
            )}
          </div>

          {/* Bouton bas de page */}
          <div className="flex justify-between items-center pt-4 pb-10">
            <Button
              variant="ghost"
              onClick={() => router.push("/dashboard/commerce/products")}
            >
              Ignorer pour l&apos;instant
            </Button>
            <Button
              className="bg-orange-600 hover:bg-orange-700 text-white px-8 h-11"
              onClick={() => setupMutation.mutate()}
              disabled={selectedCount === 0 || setupMutation.isPending}
            >
              {setupMutation.isPending ? "Import en cours..." : (
                <><Check className="h-4 w-4 mr-2" />Importer {selectedCount} produit{selectedCount > 1 ? "s" : ""}</>
              )}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
