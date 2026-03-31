"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import * as storage from "@/lib/storage";
import {
  getProducts,
  getCategories,
  getCustomers,
  createSale,
  createCustomer,
  type CommerceProduct,
  type CommerceCategory,
  type CommerceCustomer,
  type PaginatedResponse,
} from "@/lib/api/commerce.service";
import { toast } from "sonner";
import {
  Search,
  Plus,
  Minus,
  ShoppingCart,
  Check,
  User,
  Banknote,
  Smartphone,
  CreditCard,
  X,
  Tag,
  Pencil,
  PackageX,
  Receipt,
  ChevronRight,
  UserPlus,
  Phone,
  Clock,
  Heart,
  AlertCircle,
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
import { SalesReceiptDialog } from "@/components/commerce/SalesReceiptDialog";
import { CommerceSalesReceiptData } from "@/lib/pdf-generator";
import type { CommerceSale } from "@/lib/api/commerce.service";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CartItem {
  product: CommerceProduct;
  quantity: number;
  customPrice: number;
}

type PaymentMethod = "CASH" | "MOBILE_MONEY" | "CREDIT";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatGNF(n: number) {
  return new Intl.NumberFormat("fr-GN").format(Math.round(n)) + " GNF";
}

function roundGNF(n: number) {
  return Math.round(n / 500) * 500;
}

function getStockEmoji(product: CommerceProduct): string {
  if (product.stockQty <= 0) return "❌";
  if (product.stockAlert && product.stockQty <= product.stockAlert) return "⚠️";
  return "✅";
}

const PAYMENT_METHODS: {
  value: PaymentMethod;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  activeClass: string;
}[] = [
  { value: "CASH",         label: "Espèces",      icon: Banknote,   color: "text-emerald-600", activeClass: "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40" },
  { value: "MOBILE_MONEY", label: "Mobile Money", icon: Smartphone, color: "text-blue-600",    activeClass: "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/40"           },
  { value: "CREDIT",       label: "Crédit",       icon: CreditCard, color: "text-amber-600",   activeClass: "border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-950/40"       },
];

// ─── Cache localStorage ───────────────────────────────────────────────────────

const CACHE_PRODUCTS   = (tid: string) => `structura_commerce_products_${tid}`;
const CACHE_CATEGORIES = (tid: string) => `structura_commerce_categories_${tid}`;
const CACHE_CUSTOMERS  = (tid: string) => `structura_commerce_customers_${tid}`;
const CACHE_FAVORITES  = (tid: string) => `structura_commerce_favorites_${tid}`;
const CACHE_RECENTS    = (tid: string) => `structura_commerce_recents_${tid}`;

function readCache<T>(key: string): T | undefined {
  try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : undefined; }
  catch { return undefined; }
}
function writeCache(key: string, data: unknown) {
  try { localStorage.setItem(key, JSON.stringify(data)); } catch { /* quota */ }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function POSPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const tid = user?.tenantId ?? "";

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null);
  const [editingPriceVal, setEditingPriceVal] = useState("");
  const [showTab, setShowTab] = useState<"all" | "favorites" | "recents">("all");

  const priceInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const cartSnapshotRef = useRef<CartItem[]>([]);
  const cartContainerRef = useRef<HTMLDivElement>(null);
  const paidAmountRef = useRef<number>(0);
  const paymentMethodRef = useRef<PaymentMethod>("CASH");
  const customerIdRef = useRef<string>("");

  const [showCheckout, setShowCheckout] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [paidAmount, setPaidAmount] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [lastReceipt, setLastReceipt] = useState<string | null>(null);

  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [newCustomerForm, setNewCustomerForm] = useState({ name: "", phone: "" });

  const [favorites, setFavorites] = useState<string[]>(readCache(CACHE_FAVORITES(tid)) ?? []);
  const [recents, setRecents] = useState<string[]>(readCache(CACHE_RECENTS(tid)) ?? []);

  const [showReceiptDialog, setShowReceiptDialog] = useState(false);
  const [lastSale, setLastSale] = useState<CommerceSale | null>(null);
  const [mobilePanel, setMobilePanel] = useState<"products" | "cart">("products");

  const token = () => storage.getAuthItem("structura_token") ?? "";

  // ─── Mutations ────────────────────────────────────────────────────────────────

  const newCustomerMutation = useMutation({
    mutationFn: () =>
      createCustomer(token(), {
        name: newCustomerForm.name.trim(),
        phone: newCustomerForm.phone.trim() || undefined,
      }),
    onSuccess: (created) => {
      // Mise à jour immédiate de la liste caisse
      queryClient.setQueryData<CommerceCustomer[]>(["commerce-customers-pos", tid], (old = []) =>
        [...old, created]
      );
      // Propager vers la page Clients et la page Dettes
      queryClient.setQueryData<CommerceCustomer[]>(["commerce-customers", tid], (old = []) =>
        [created, ...old]
      );
      setCustomerId(created.id);
      setShowNewCustomer(false);
      setNewCustomerForm({ name: "", phone: "" });
      toast.success(`Client "${created.name}" ajouté`);
      // Refetch en arrière-plan pour synchroniser les deux pages
      queryClient.invalidateQueries({ queryKey: ["commerce-customers", tid] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ─── Données ────────────────────────────────────────────────────────────────

  const { data: productsData, isLoading } = useQuery({
    queryKey: ["commerce-products-pos", tid],
    queryFn: async () => {
      const result = await getProducts(token(), { limit: 500 });
      if (tid) writeCache(CACHE_PRODUCTS(tid), result.data ?? result);
      return result;
    },
    enabled: !!user,
    staleTime: 0,         // toujours refetch si le cache a été invalidé
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: true,
    placeholderData: () => {
      if (!tid) return undefined;
      const cached = readCache<CommerceProduct[]>(CACHE_PRODUCTS(tid));
      return cached ? { data: cached, total: cached.length, page: 1, pageCount: 1 } : undefined;
    },
  });

  const { data: categories } = useQuery({
    queryKey: ["commerce-categories", tid],
    queryFn: async () => {
      const result = await getCategories(token());
      if (tid) writeCache(CACHE_CATEGORIES(tid), result);
      return result;
    },
    enabled: !!user,
    staleTime: 300_000,
    gcTime: 10 * 60_000,
    placeholderData: () => readCache<CommerceCategory[]>(CACHE_CATEGORIES(tid)),
  });

  const { data: customers } = useQuery({
    queryKey: ["commerce-customers-pos", tid],
    queryFn: async () => {
      const result = await getCustomers(token());
      if (tid) writeCache(CACHE_CUSTOMERS(tid), result);
      return result;
    },
    enabled: !!user,
    staleTime: 120_000,
    gcTime: 5 * 60_000,
    placeholderData: () => readCache<CommerceCustomer[]>(CACHE_CUSTOMERS(tid)),
  });

  const productsRaw = productsData?.data ?? productsData;
  const products: CommerceProduct[] = Array.isArray(productsRaw) ? productsRaw : [];

  const filtered = useMemo(() => products.filter((p) => {
    const q = search.toLowerCase();
    const matchSearch = !search || p.name.toLowerCase().includes(q) || (p.reference ?? "").toLowerCase().includes(q);
    const matchCat = !categoryFilter || p.categoryId === categoryFilter;
    return matchSearch && matchCat;
  }), [products, search, categoryFilter]);

  // ─── Tabs (All / Favorites / Recents) ──────────────────────────────────────

  const favoriteProducts = products.filter((p) => favorites.includes(p.id));
  const recentProducts = products.filter((p) => recents.includes(p.id));
  const displayProducts =
    showTab === "favorites" ? favoriteProducts
    : showTab === "recents" ? recentProducts
    : filtered;

  const toggleFavorite = useCallback((productId: string) => {
    setFavorites((prev) => {
      const updated = prev.includes(productId)
        ? prev.filter((id) => id !== productId)
        : [productId, ...prev];
      writeCache(CACHE_FAVORITES(tid), updated);
      return updated;
    });
  }, [tid]);

  const addToRecents = useCallback((productId: string) => {
    setRecents((prev) => {
      const updated = [productId, ...prev.filter((id) => id !== productId)].slice(0, 10);
      writeCache(CACHE_RECENTS(tid), updated);
      return updated;
    });
  }, [tid]);

  // ─── Calculs ───────────────────────────────────────────────────────────────

  const totalNet = cart.reduce((s, i) => s + i.customPrice * i.quantity, 0);
  const itemCount = cart.reduce((s, i) => s + i.quantity, 0);
  const paid = parseFloat(paidAmount) || 0;
  const change = Math.max(paid - totalNet, 0);
  const remaining = Math.max(totalNet - paid, 0);

  // ─── Panier ────────────────────────────────────────────────────────────────

  const addToCart = (product: CommerceProduct, qty = 1) => {
    if (product.stockQty <= 0) {
      toast.error(`"${product.name}" est en rupture`);
      return;
    }
    addToRecents(product.id);
    setCart((prev) => {
      const existing = prev.find((i) => i.product.id === product.id);
      if (existing) {
        const newQty = existing.quantity + qty;
        if (newQty > product.stockQty) {
          toast.warning(`Stock max: ${product.stockQty} ${product.unit}`);
          return prev;
        }
        return prev.map((i) =>
          i.product.id === product.id ? { ...i, quantity: newQty } : i
        );
      }
      return [...prev, { product, quantity: qty, customPrice: product.sellPrice }];
    });
    // Sur mobile, switcher vers le panier après ajout
    if (window.innerWidth < 768) setMobilePanel("cart");
  };

  const updateQty = (productId: string, delta: number) =>
    setCart((prev) =>
      prev
        .map((i) => i.product.id === productId ? { ...i, quantity: i.quantity + delta } : i)
        .filter((i) => i.quantity > 0)
    );

  const removeFromCart = (productId: string) =>
    setCart((prev) => prev.filter((i) => i.product.id !== productId));

  const clearCart = () => {
    setCart([]);
    setPaidAmount("");
    setCustomerId("");
    setPaymentMethod("CASH");
  };

  // ─── Prix inline ───────────────────────────────────────────────────────────

  const startEditPrice = (item: CartItem) => {
    setEditingPriceId(item.product.id);
    setEditingPriceVal(String(item.customPrice));
    setTimeout(() => priceInputRef.current?.select(), 50);
  };

  const commitPrice = (productId: string) => {
    const val = roundGNF(parseFloat(editingPriceVal) || 0);
    if (val < 0) { toast.error("Prix invalide"); return; }
    setCart((prev) =>
      prev.map((i) => i.product.id === productId ? { ...i, customPrice: val } : i)
    );
    setEditingPriceId(null);
  };


  // ─── Checkout ──────────────────────────────────────────────────────────────

  const openCheckout = () => {
    if (cart.length === 0) return;
    setPaidAmount(String(totalNet));
    setShowCheckout(true);
  };

  const saleMutation = useMutation({
    mutationFn: () => {
      const snapshot = cartSnapshotRef.current;
      if (!snapshot || snapshot.length === 0) {
        return Promise.reject(new Error("Panier vide — veuillez réessayer"));
      }
      const items = snapshot.map((i) => ({
        productId: i.product.id,
        quantity: i.quantity,
        unitPrice: i.customPrice,
      }));
      return createSale(token(), {
        items,
        paidAmount: paymentMethodRef.current === "CREDIT" ? 0 : paidAmountRef.current,
        paymentMethod: paymentMethodRef.current,
        customerId: customerIdRef.current || undefined,
      });
    },
    onMutate: () => {
      const snapshot = cartSnapshotRef.current;
      const totalFromSnapshot = snapshot.reduce((s, i) => s + i.customPrice * i.quantity, 0);
      const paid = paidAmountRef.current;
      const remaining = paymentMethodRef.current === "CREDIT" ? totalFromSnapshot : Math.max(totalFromSnapshot - paid, 0);

      // Afficher le reçu IMMÉDIATEMENT avec données estimées (avant réponse API)
      const now = new Date();
      setLastSale({
        id: "pending",
        receiptNumber: "…",
        createdAt: now.toISOString(),
        totalAmount: totalFromSnapshot,
        paidAmount: paymentMethodRef.current === "CREDIT" ? 0 : paid,
        remainingDebt: remaining,
        paymentMethod: paymentMethodRef.current,
        status: remaining > 0 ? "PARTIAL" : "COMPLETED",
        customerId: customerIdRef.current || null,
        customer: customers?.find((c: CommerceCustomer) => c.id === customerIdRef.current) ?? null,
        items: snapshot.map((i) => ({
          id: i.product.id,
          productId: i.product.id,
          quantity: i.quantity,
          unitPrice: i.customPrice,
          totalPrice: i.customPrice * i.quantity,
          costPrice: i.product.buyPrice,
          product: { id: i.product.id, name: i.product.name, unit: i.product.unit },
        })),
      } as any);
      setShowReceiptDialog(true);
      setShowCheckout(false);
      clearCart();
      return { cartSnapshot: snapshot };
    },
    onSuccess: (sale, _vars, context) => {
      // Mettre à jour avec les vraies données API (numéro de reçu, etc.)
      toast.success(`Vente confirmée — ${sale.receiptNumber}`);
      setLastReceipt(sale.receiptNumber);
      setLastSale(sale);

      const cartItems = context?.cartSnapshot ?? [];
      const decreaseStock = (old: PaginatedResponse<CommerceProduct> | undefined) => {
        if (!old?.data) return old;
        return {
          ...old,
          data: old.data.map((p) => {
            const item = cartItems.find((i) => i.product.id === p.id);
            return item ? { ...p, stockQty: Math.max(0, p.stockQty - item.quantity) } : p;
          }),
        };
      };

      queryClient.setQueryData(["commerce-products-pos", tid], decreaseStock);
      queryClient.setQueryData(["commerce-products", tid], decreaseStock);

      const updated = queryClient.getQueryData<PaginatedResponse<CommerceProduct>>(["commerce-products-pos", tid]);
      if (updated?.data && tid) writeCache(CACHE_PRODUCTS(tid), updated.data);

      queryClient.invalidateQueries({ queryKey: ["commerce-products-pos"] });
      queryClient.invalidateQueries({ queryKey: ["commerce-products"] });
      queryClient.invalidateQueries({ queryKey: ["commerce-dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["commerce-daily"] });
      // Si vente à crédit → mettre à jour la page dettes immédiatement
      if (sale.remainingDebt > 0) {
        queryClient.invalidateQueries({ queryKey: ["commerce-sales-pending", tid] });
        queryClient.invalidateQueries({ queryKey: ["commerce-customers", tid] });
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ─── Raccourcis clavier ────────────────────────────────────────────────────

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Entrée = Encaisser
      if (e.ctrlKey && e.key === "Enter" && cart.length > 0) {
        e.preventDefault();
        openCheckout();
      }
      // Escape = Fermer dialog
      if (e.key === "Escape" && showCheckout) {
        setShowCheckout(false);
      }
      // Entrée en édition prix
      if (e.key === "Enter" && editingPriceId) {
        e.preventDefault();
        commitPrice(editingPriceId);
      }
      // Focus recherche Ctrl+F
      if (e.ctrlKey && e.key === "f") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [cart.length, showCheckout, editingPriceId]);

  // ─── Rendu ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col md:flex-row h-[calc(100vh-4rem)] overflow-hidden bg-muted/30 relative">

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* GAUCHE — Catalogue                                                  */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      <div className={cn("flex-1 flex flex-col overflow-hidden pb-14 md:pb-0", mobilePanel === "cart" ? "hidden md:flex" : "flex")}>

        {/* Barre recherche + catégories */}
        <div className="bg-background border-b px-4 pt-4 pb-3 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              ref={searchInputRef}
              placeholder="Rechercher (Ctrl+F)..."
              className="pl-9 h-10 bg-muted/50 border-0 focus-visible:ring-1 focus-visible:ring-orange-400"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Tabs */}
          <div className="flex gap-1">
            <button
              onClick={() => setShowTab("all")}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all",
                showTab === "all" ? "bg-orange-600 text-white" : "bg-muted hover:bg-muted/80"
              )}
            >
              Tous ({filtered.length})
            </button>
            <button
              onClick={() => setShowTab("favorites")}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1",
                showTab === "favorites" ? "bg-orange-600 text-white" : "bg-muted hover:bg-muted/80"
              )}
            >
              <Heart className="h-3 w-3" />
              {favorites.length}
            </button>
            <button
              onClick={() => setShowTab("recents")}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1",
                showTab === "recents" ? "bg-orange-600 text-white" : "bg-muted hover:bg-muted/80"
              )}
            >
              <Clock className="h-3 w-3" />
              {recents.length}
            </button>
          </div>

          {/* Catégories */}
          {showTab === "all" && (
            <div className="flex gap-1.5 overflow-x-auto pb-0.5">
              <button
                onClick={() => setCategoryFilter("")}
                className={cn(
                  "shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold",
                  !categoryFilter ? "bg-orange-600 text-white" : "bg-muted hover:bg-muted/80"
                )}
              >
                Tout
              </button>
              {categories?.map((c: CommerceCategory) => {
                const count = products.filter((p) => p.categoryId === c.id).length;
                return (
                  <button
                    key={c.id}
                    onClick={() => setCategoryFilter(c.id)}
                    className={cn(
                      "shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold",
                      categoryFilter === c.id ? "bg-orange-600 text-white" : "bg-muted hover:bg-muted/80"
                    )}
                  >
                    {c.name} ({count})
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Grille produits */}
        <div className="flex-1 overflow-y-auto p-4 bg-background">
          {isLoading && products.length === 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {Array.from({ length: 10 }).map((_, i) => (
                <Skeleton key={i} className="h-32 rounded-2xl" />
              ))}
            </div>
          ) : displayProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground gap-3">
              <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center">
                <ShoppingCart className="h-7 w-7 opacity-40" />
              </div>
              <p className="font-medium text-sm">Aucun produit</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {displayProducts.map((p) => {
                const inCart = cart.find((i) => i.product.id === p.id);
                const isFav = favorites.includes(p.id);
                return (
                  <div
                    key={p.id}
                    className="relative group"
                  >
                    {/* Bouton favoris */}
                    <button
                      onClick={() => toggleFavorite(p.id)}
                      className="absolute top-2 right-2 z-10 h-6 w-6 rounded-lg bg-white/90 flex items-center justify-center hover:bg-white transition-all shadow-sm"
                    >
                      <Heart className={cn("h-3.5 w-3.5", isFav ? "fill-red-500 text-red-500" : "text-muted-foreground")} />
                    </button>

                    {/* Carte produit */}
                    <div
                      className={cn(
                        "w-full flex flex-col items-start p-3.5 rounded-2xl border-2 text-left transition-all h-full",
                        inCart
                          ? "border-orange-400 bg-orange-50 dark:bg-orange-950/20"
                          : "border-border bg-background hover:border-orange-300 hover:shadow-md"
                      )}
                    >
                      {/* Badge quantité */}
                      {inCart && (
                        <span className="absolute -top-1.5 -left-1.5 h-6 w-6 rounded-full bg-orange-600 text-white text-xs font-bold flex items-center justify-center shadow-md border-2 border-background">
                          {inCart.quantity}
                        </span>
                      )}

                      {/* Stock emoji */}
                      <span className="text-lg mb-1">{getStockEmoji(p)}</span>

                      {/* Nom */}
                      <p className="text-sm font-semibold leading-tight mb-auto line-clamp-2">{p.name}</p>

                      {/* Info stock */}
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {p.stockQty <= 0 ? "Rupture" : `${p.stockQty} ${p.unit}`}
                      </p>

                      {/* Prix */}
                      <p className={cn(
                        "text-base font-bold mt-2",
                        inCart ? "text-orange-600" : "text-foreground"
                      )}>
                        {formatGNF(p.sellPrice)}
                      </p>

                      {/* Bouton ajouter */}
                      <button
                        onClick={() => addToCart(p, 1)}
                        disabled={p.stockQty <= 0}
                        className={cn(
                          "w-full mt-3 py-2 px-2 rounded-lg font-semibold text-sm transition-all flex items-center justify-center gap-2",
                          p.stockQty <= 0
                            ? "bg-muted text-muted-foreground cursor-not-allowed"
                            : "bg-orange-600 text-white hover:bg-orange-700 active:scale-95"
                        )}
                      >
                        <Plus className="h-4 w-4" />
                        Ajouter
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* DROITE — Panier DENSE                                              */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      <div className={cn("flex flex-col bg-background border-l transition-all", mobilePanel === "products" ? "hidden md:flex md:w-85 xl:w-95" : "flex w-full md:w-85 xl:w-95")}>

        {/* En-tête */}
        <div className="px-4 py-2 border-b">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setMobilePanel("products")}
                className="md:hidden text-muted-foreground hover:text-foreground"
              >
                <ChevronRight className="h-4 w-4 rotate-180" />
              </button>
              <p className="font-semibold text-sm flex items-center gap-1">
                <ShoppingCart className="h-4 w-4 text-orange-600" />
                {itemCount} art.
              </p>
            </div>
            {cart.length > 0 && (
              <button onClick={clearCart} className="text-xs text-muted-foreground hover:text-destructive">
                Vider
              </button>
            )}
          </div>
        </div>

        {/* Articles — Très dense */}
        <div ref={cartContainerRef} className="flex-1 overflow-y-auto">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2 p-4">
              <ShoppingCart className="h-10 w-10 opacity-20" />
              <p className="text-xs">Panier vide</p>
            </div>
          ) : (
            <div className="divide-y">
              {cart.map((item) => {
                const isNegotiated = item.customPrice !== item.product.sellPrice;
                return (
                  <div key={item.product.id} className="px-3 py-2 hover:bg-muted/30 transition-colors">
                    {/* Ligne 1 : nom + supprimer */}
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <p className="text-xs font-semibold line-clamp-1 flex-1">{item.product.name}</p>
                      <button
                        onClick={() => removeFromCart(item.product.id)}
                        className="shrink-0 text-muted-foreground hover:text-destructive text-xs"
                      >
                        ✕
                      </button>
                    </div>

                    {/* Ligne 2 : Qty | Prix | Sous-total */}
                    <div className="flex items-center gap-1 text-xs">
                      {/* Qty contrôls */}
                      <div className="flex items-center gap-0.5 bg-muted rounded px-1">
                        <button onClick={() => updateQty(item.product.id, -1)} className="p-0.5 hover:bg-white">−</button>
                        <span className="w-5 text-center font-bold">{item.quantity}</span>
                        <button onClick={() => updateQty(item.product.id, 1)} className="p-0.5 hover:bg-white">+</button>
                      </div>

                      {/* Prix cliquable */}
                      {editingPriceId === item.product.id ? (
                        <input
                          ref={priceInputRef}
                          type="number"
                          value={editingPriceVal}
                          onChange={(e) => setEditingPriceVal(e.target.value)}
                          onBlur={() => commitPrice(item.product.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") commitPrice(item.product.id);
                            if (e.key === "Escape") setEditingPriceId(null);
                          }}
                          className="w-16 h-6 text-center rounded border border-orange-400 bg-background text-xs px-1"
                          autoFocus
                        />
                      ) : (
                        <button
                          onClick={() => startEditPrice(item)}
                          className={cn(
                            "px-1.5 py-0.5 rounded text-xs font-semibold",
                            isNegotiated
                              ? "border border-orange-400 bg-orange-100 text-orange-700"
                              : "border border-dashed border-muted-foreground/30 hover:bg-orange-50"
                          )}
                        >
                          {new Intl.NumberFormat("fr-GN").format(item.customPrice)}
                        </button>
                      )}

                      {/* Sous-total */}
                      <span className="ml-auto font-bold text-orange-600">
                        {new Intl.NumberFormat("fr-GN").format(item.customPrice * item.quantity)}
                      </span>
                    </div>

                    {/* Indication remise */}
                    {isNegotiated && (
                      <p className="text-[9px] text-orange-600 mt-0.5">
                        Remisé de {formatGNF((item.product.sellPrice - item.customPrice) * item.quantity)}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer — Total + Encaisser */}
        {cart.length > 0 && (
          <div className="border-t bg-background p-3 space-y-2 pb-16 md:pb-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Total</p>
              <p className="text-lg font-bold text-orange-600">{formatGNF(totalNet)}</p>
            </div>

            {lastReceipt && (
              <div className="text-xs text-emerald-600 bg-emerald-50 p-1.5 rounded">
                ✓ {lastReceipt}
              </div>
            )}

            <Button
              className="w-full bg-orange-600 hover:bg-orange-700 text-white h-10 font-bold text-sm rounded-xl"
              onClick={openCheckout}
              disabled={cart.length === 0}
              title="Ctrl+Entrée"
            >
              Encaisser (Ctrl+↵)
            </Button>
          </div>
        )}
      </div>


      {/* ── Navigation mobile bas ──────────────────────────────────────────── */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-background border-t flex h-14">
        <button
          onClick={() => setMobilePanel("products")}
          className={cn(
            "flex-1 flex flex-col items-center justify-center text-xs font-semibold gap-0.5 transition-colors",
            mobilePanel === "products" ? "text-orange-600" : "text-muted-foreground"
          )}
        >
          <Tag className="h-5 w-5" />
          Catalogue
        </button>
        <button
          onClick={() => setMobilePanel("cart")}
          className={cn(
            "flex-1 flex flex-col items-center justify-center text-xs font-semibold gap-0.5 transition-colors relative",
            mobilePanel === "cart" ? "text-orange-600" : "text-muted-foreground"
          )}
        >
          <ShoppingCart className="h-5 w-5" />
          {itemCount > 0 && (
            <span className="absolute top-1 right-8 h-4 w-4 rounded-full bg-orange-600 text-white text-[10px] flex items-center justify-center font-bold">
              {itemCount}
            </span>
          )}
          Panier
        </button>
      </div>

      {/* ── Dialog Checkout ────────────────────────────────────────────────── */}
      <Dialog open={showCheckout} onOpenChange={setShowCheckout}>
        <DialogContent className="w-[calc(100vw-1rem)] max-w-sm p-0 max-h-[95dvh]">
          <DialogHeader className="px-5 pt-5 pb-4 border-b">
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-4 w-4 text-orange-600" />
              Finaliser
            </DialogTitle>
          </DialogHeader>

          <div className="overflow-y-auto max-h-[calc(100vh-200px)] px-5 py-4 space-y-4">

            {/* Recap articles */}
            <div className="rounded-xl bg-muted p-3 space-y-1 max-h-32 overflow-y-auto">
              <p className="text-xs font-semibold text-muted-foreground mb-2">Récapitulatif</p>
              {cart.map((i) => (
                <div key={i.product.id} className="flex justify-between text-xs">
                  <span>{i.product.name} ×{i.quantity}</span>
                  <span className="font-semibold">{formatGNF(i.customPrice * i.quantity)}</span>
                </div>
              ))}
            </div>

            {/* Total */}
            <div className="p-4 rounded-xl border-2 border-foreground/20 bg-muted/40 text-center">
              <p className="text-xs text-muted-foreground">Total</p>
              <p className="text-2xl font-bold text-foreground">{formatGNF(totalNet)}</p>
            </div>

            {/* Mode paiement */}
            <div>
              <p className="text-xs font-semibold mb-2">Mode</p>
              <div className="grid grid-cols-3 gap-2">
                {PAYMENT_METHODS.map((m) => (
                  <button
                    key={m.value}
                    onClick={() => {
                      setPaymentMethod(m.value);
                      setPaidAmount(m.value === "CREDIT" ? "0" : String(totalNet));
                    }}
                    className={cn(
                      "flex flex-col items-center gap-1 p-3 rounded-lg border-2 text-xs font-semibold transition-all",
                      paymentMethod === m.value ? m.activeClass : "border-border text-muted-foreground hover:border-foreground/50"
                    )}
                  >
                    <m.icon className="h-4 w-4" />
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Client */}
            <div>
              <p className="text-xs font-semibold mb-2 flex items-center gap-1">
                <User className="h-3 w-3" /> Client
              </p>
              {showNewCustomer ? (
                <div className="space-y-2">
                  <Input placeholder="Nom" value={newCustomerForm.name} onChange={(e) => setNewCustomerForm((f) => ({ ...f, name: e.target.value }))} className="h-8 text-xs" />
                  <div className="flex gap-2">
                    <button onClick={() => setShowNewCustomer(false)} className="flex-1 text-xs px-2 py-1 rounded border hover:bg-muted">Annuler</button>
                    <button onClick={() => newCustomerMutation.mutate()} className="flex-1 text-xs px-2 py-1 rounded bg-orange-600 text-white font-bold hover:bg-orange-700" disabled={!newCustomerForm.name.trim()}>Ajouter</button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="w-full h-8 px-2 rounded border text-xs bg-background">
                    <option value="">Anonyme</option>
                    {customers?.map((c: CommerceCustomer) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  <button onClick={() => setShowNewCustomer(true)} className="w-full text-xs px-2 py-1 rounded border border-dashed hover:bg-orange-50 flex items-center justify-center gap-1">
                    <UserPlus className="h-3 w-3" /> Nouveau
                  </button>
                </div>
              )}
            </div>

            {/* Montant reçu */}
            {paymentMethod !== "CREDIT" && (
              <div>
                <p className="text-xs font-semibold mb-2">Reçu</p>
                <Input type="number" value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)} className="h-10 text-lg font-bold text-center" />
              </div>
            )}

            {/* Monnaie / Reste */}
            {paymentMethod !== "CREDIT" && paid > 0 && (
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-lg border-2 border-border bg-muted/30 text-center">
                  <p className="text-xs text-muted-foreground mb-1">Monnaie</p>
                  <p className="text-sm font-bold">{formatGNF(change)}</p>
                </div>
                <div className="p-3 rounded-lg border-2 border-border bg-muted/30 text-center">
                  <p className="text-xs text-muted-foreground mb-1">Reste dû</p>
                  <p className={cn("text-sm font-bold", remaining > 0 && "text-red-600")}>{formatGNF(remaining)}</p>
                </div>
              </div>
            )}
          </div>

          <div className="px-5 pb-4 flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setShowCheckout(false)}>Annuler</Button>
            <Button
              className="flex-1 bg-orange-600 hover:bg-orange-700 text-white font-bold"
              onClick={() => {
                // Capturer TOUT ici avant que React ne vide les états
                cartSnapshotRef.current = [...cart];
                paidAmountRef.current = paymentMethod === "CREDIT" ? 0 : (parseFloat(paidAmount) || totalNet);
                paymentMethodRef.current = paymentMethod;
                customerIdRef.current = customerId;
                saleMutation.mutate();
              }}
              disabled={saleMutation.isPending || cart.length === 0 || (paymentMethod !== "CREDIT" && (!paid || paid < 0))}
            >
              {saleMutation.isPending ? "..." : "Confirmer"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog reçu */}
      {lastSale && (
        <SalesReceiptDialog
          open={showReceiptDialog}
          onOpenChange={(open) => {
            setShowReceiptDialog(open);
            if (!open) setLastSale(null);
          }}
          saleId={lastSale.id}
          receiptData={{
            receiptNumber: lastSale.receiptNumber,
            date: new Date(lastSale.createdAt).toLocaleDateString("fr-FR", {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
            }),
            time: new Date(lastSale.createdAt).toLocaleTimeString("fr-FR", {
              hour: "2-digit",
              minute: "2-digit",
            }),
            cashierName: user?.firstName && user?.lastName ? `${user.firstName} ${user.lastName}` : user?.email ?? "—",
            items: lastSale.items.map((item) => ({
              name: item.product?.name ?? "Produit",
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              totalPrice: item.totalPrice,
            })),
            totalAmount: lastSale.totalAmount,
            paidAmount: lastSale.paidAmount,
            remainingAmount: lastSale.remainingDebt,
            paymentMethod: lastSale.paymentMethod,
            customerName: lastSale.customer?.name,
            customerPhone: undefined,
            commerceName: user?.schoolName ?? "Commerce",
            commerceLogo: undefined, // À ajouter depuis les paramètres
            commerceAddress: undefined, // À ajouter depuis les paramètres
            commercePhone: undefined, // À ajouter depuis les paramètres
          }}
          token={token()}
        />
      )}
    </div>
  );
}
