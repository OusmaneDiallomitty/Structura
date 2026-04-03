"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import * as storage from "@/lib/storage";
import {
  getCustomers,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  type CommerceCustomer,
} from "@/lib/api/commerce.service";
import { toast } from "sonner";
import {
  UserRound,
  Plus,
  Search,
  Edit,
  Trash2,
  X,
  Phone,
  MapPin,
  DollarSign,
  Calendar,
  Check,
  ChevronRight,
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
import { cn } from "@/lib/utils";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatGNF(n: number) {
  return new Intl.NumberFormat("fr-GN").format(Math.round(n)) + " GNF";
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

const EMPTY = { name: "", phone: "", address: "" };

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CustomersPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const tid = user?.tenantId ?? "";

  const [search, setSearch] = useState("");
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<CommerceCustomer | null>(null);
  const [deleting, setDeleting] = useState<CommerceCustomer | null>(null);
  const [form, setForm] = useState(EMPTY);

  const token = () => storage.getAuthItem("structura_token") ?? "";

  // ─── Données ────────────────────────────────────────────────────────────────

  const { data: customers = [], isLoading } = useQuery<CommerceCustomer[]>({
    queryKey: ["commerce-customers", tid],
    queryFn: async () => {
      const result = await getCustomers(token(), search || undefined);
      if (tid) writeCache(tid, result);
      return result;
    },
    enabled: !!user,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    placeholderData: () => readCache(tid),
  });

  const filtered = customers.filter((c) => {
    const q = search.toLowerCase();
    return !q || c.name.toLowerCase().includes(q) || (c.phone ?? "").includes(q);
  });

  const totalDebt = customers.reduce((s, c) => s + c.totalDebt, 0);

  // ─── Mutations ───────────────────────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: () => createCustomer(token(), form),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["commerce-customers"] });
      const prev = queryClient.getQueryData<CommerceCustomer[]>(["commerce-customers", tid]);
      queryClient.setQueryData<CommerceCustomer[]>(["commerce-customers", tid], (old = []) => [
        ...old,
        { ...form, id: `__tmp_${Date.now()}`, tenantId: tid, isActive: true, totalDebt: 0, createdAt: new Date().toISOString() } as CommerceCustomer,
      ]);
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["commerce-customers", tid], ctx.prev);
    },
    onSuccess: (created) => {
      const updated = queryClient.setQueryData<CommerceCustomer[]>(["commerce-customers", tid], (old = []) =>
        old.map((c) => (c.id.startsWith("__tmp_") ? created : c))
      );
      toast.success(`"${created.name}" ajouté`);
      closeDialog();
      if (updated) writeCache(tid, updated);
    },
  });

  const updateMutation = useMutation({
    mutationFn: () => updateCustomer(token(), editing!.id, form),
    onSuccess: (updated) => {
      const result = queryClient.setQueryData<CommerceCustomer[]>(["commerce-customers", tid], (old = []) =>
        old.map((c) => (c.id === editing!.id ? updated : c))
      );
      toast.success("Client modifié");
      closeDialog();
      if (result) writeCache(tid, result);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteCustomer(token(), deleting!.id),
    onSuccess: () => {
      const result = queryClient.setQueryData<CommerceCustomer[]>(["commerce-customers", tid], (old = []) =>
        old.filter((c) => c.id !== deleting!.id)
      );
      toast.success("Client supprimé");
      setDeleting(null);
      if (result) writeCache(tid, result);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ─── Handlers ────────────────────────────────────────────────────────────────

  const openCreate = () => {
    setForm(EMPTY);
    setEditing(null);
    setShowDialog(true);
  };

  const openEdit = (customer: CommerceCustomer) => {
    setForm({ name: customer.name, phone: customer.phone ?? "", address: customer.address ?? "" });
    setEditing(customer);
    setShowDialog(true);
  };

  const closeDialog = () => {
    setShowDialog(false);
    setEditing(null);
    setForm(EMPTY);
  };

  const handleSubmit = () => {
    if (!form.name.trim()) { toast.error("Le nom est requis"); return; }
    if (editing) {
      updateMutation.mutate();
    } else {
      createMutation.mutate();
    }
  };

  // ─── Rendu ──────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">

      {/* En-tête */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <div className="h-10 w-10 rounded-xl bg-blue-100 flex items-center justify-center">
              <UserRound className="h-6 w-6 text-blue-600" />
            </div>
            Clients
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Gérez vos clients et leurs dettes</p>
        </div>
        <Button
          onClick={openCreate}
          className="h-11 px-4 rounded-xl gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold"
        >
          <Plus className="h-5 w-5" />
          Ajouter un client
        </Button>
      </div>

      {/* Cartes résumé */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl border bg-card p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Nombre de clients
          </p>
          <p className="text-3xl font-bold tabular-nums">{isLoading ? "…" : customers.length}</p>
        </div>
        <div className="rounded-2xl border bg-card p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            En dette
          </p>
          <p className="text-3xl font-bold text-amber-600 tabular-nums">
            {isLoading ? "…" : customers.filter((c) => c.totalDebt > 0).length}
          </p>
        </div>
        <div className="rounded-2xl border bg-card p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Total dû
          </p>
          <p className="text-2xl font-bold text-amber-600 tabular-nums">
            {isLoading ? "…" : formatGNF(totalDebt)}
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
          <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Liste */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-2xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
          <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center">
            <UserRound className="h-8 w-8 opacity-30" />
          </div>
          <p className="text-sm font-medium">Aucun client trouvé</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((customer) => (
            <div
              key={customer.id}
              className={cn(
                "flex items-center gap-4 p-4 rounded-2xl border-2 transition-all hover:shadow-sm",
                customer.totalDebt > 0 ? "border-amber-200 bg-amber-50/30" : "border-border bg-card"
              )}
            >
              {/* Avatar */}
              <div className="h-12 w-12 rounded-xl bg-blue-100 text-blue-700 font-bold text-lg flex items-center justify-center shrink-0">
                {customer.name.charAt(0).toUpperCase()}
              </div>

              {/* Infos */}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm">{customer.name}</p>
                <div className="flex flex-wrap items-center gap-2 mt-1">
                  {customer.phone && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Phone className="h-3 w-3" />
                      {customer.phone}
                    </span>
                  )}
                  {customer.address && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {customer.address}
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {timeAgo(customer.createdAt)}
                  </span>
                </div>
              </div>

              {/* Montant dû */}
              {customer.totalDebt > 0 && (
                <div className="text-right shrink-0">
                  <p className="text-xs text-muted-foreground">Dû</p>
                  <p className="font-bold text-amber-600 tabular-nums">
                    {formatGNF(customer.totalDebt)}
                  </p>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-1 shrink-0">
                <button
                  onClick={() => openEdit(customer)}
                  className="h-9 w-9 rounded-lg hover:bg-muted flex items-center justify-center transition-colors text-muted-foreground hover:text-foreground"
                >
                  <Edit className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setDeleting(customer)}
                  className="h-9 w-9 rounded-lg hover:bg-destructive/10 flex items-center justify-center transition-colors text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Dialog Créer/Éditer ────────────────────────────────────────────── */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-sm p-0 overflow-hidden gap-0">
          <DialogHeader className="px-5 pt-5 pb-4 border-b">
            <DialogTitle className="flex items-center gap-2 text-base">
              <UserRound className="h-4 w-4 text-blue-600" />
              {editing ? "Modifier le client" : "Ajouter un client"}
            </DialogTitle>
          </DialogHeader>

          <div className="px-5 py-4 space-y-4">
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                Nom complet
              </label>
              <Input
                placeholder="Ex: Jean Diallo"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="h-10 rounded-xl"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 flex items-center gap-1">
                <Phone className="h-3.5 w-3.5" />
                Téléphone
              </label>
              <Input
                placeholder="Ex: 622 123 456"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                className="h-10 rounded-xl"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                Adresse
              </label>
              <Input
                placeholder="Ex: Kindia"
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                className="h-10 rounded-xl"
              />
            </div>
          </div>

          <div className="flex gap-2 px-5 pb-5 pt-2">
            <Button
              variant="outline"
              className="flex-1 rounded-xl"
              onClick={() => setShowDialog(false)}
            >
              Annuler
            </Button>
            <Button
              className="flex-1 h-10 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold"
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {(createMutation.isPending || updateMutation.isPending) ? (
                <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              ) : (
                <span className="flex items-center gap-2">
                  <Check className="h-4 w-4" />
                  {editing ? "Modifier" : "Ajouter"}
                </span>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Alert suppression ──────────────────────────────────────────────── */}
      {deleting && (
        <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
          <AlertDialogContent className="max-w-sm">
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <Trash2 className="h-5 w-5 text-destructive" />
                Supprimer le client?
              </AlertDialogTitle>
              <AlertDialogDescription>
                {deleting.totalDebt > 0 ? (
                  <>
                    <span className="text-destructive font-semibold">{deleting.name}</span> a une dette en cours de{" "}
                    <span className="text-destructive font-semibold">{formatGNF(deleting.totalDebt)}</span>.
                    <br />
                    Vous devez régler la dette avant de supprimer.
                  </>
                ) : (
                  <>Cette action est irréversible. <span className="font-semibold">{deleting.name}</span> sera supprimé définitivement.</>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuler</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteMutation.mutate()}
                disabled={deleting.totalDebt > 0 || deleteMutation.isPending}
                className="bg-destructive hover:bg-destructive/90"
              >
                {deleteMutation.isPending ? "Suppression..." : "Supprimer"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
