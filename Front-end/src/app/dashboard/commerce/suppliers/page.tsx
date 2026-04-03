"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import * as storage from "@/lib/storage";
import {
  getSuppliers,
  createSupplier,
  updateSupplier,
  deleteSupplier,
  type CommerceSupplier,
} from "@/lib/api/commerce.service";
import { toast } from "sonner";
import {
  Truck,
  Plus,
  Edit,
  Trash2,
  X,
  Phone,
  Mail,
  MapPin,
  Calendar,
  Check,
  Globe,
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

const CACHE_KEY = (tid: string) => `structura_commerce_suppliers_${tid}`;

function readCache(tid: string): CommerceSupplier[] | undefined {
  try { const r = localStorage.getItem(CACHE_KEY(tid)); return r ? JSON.parse(r) : undefined; }
  catch { return undefined; }
}
function writeCache(tid: string, data: CommerceSupplier[]) {
  try { localStorage.setItem(CACHE_KEY(tid), JSON.stringify(data)); } catch { /* quota */ }
}

const EMPTY = { name: "", phone: "", email: "", address: "" };

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SuppliersPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const tid = user?.tenantId ?? "";

  const [search, setSearch] = useState("");
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<CommerceSupplier | null>(null);
  const [deleting, setDeleting] = useState<CommerceSupplier | null>(null);
  const [form, setForm] = useState(EMPTY);

  const token = () => storage.getAuthItem("structura_token") ?? "";

  // ─── Données ────────────────────────────────────────────────────────────────

  const { data: suppliers = [], isLoading } = useQuery<CommerceSupplier[]>({
    queryKey: ["commerce-suppliers", tid],
    queryFn: async () => {
      const result = await getSuppliers(token());
      if (tid) writeCache(tid, result);
      return result;
    },
    enabled: !!user,
    staleTime: 120_000,
    gcTime: 5 * 60_000,
    placeholderData: () => readCache(tid),
  });

  const filtered = suppliers.filter((s) => {
    const q = search.toLowerCase();
    return !q
      || s.name.toLowerCase().includes(q)
      || (s.phone ?? "").includes(q)
      || (s.email ?? "").toLowerCase().includes(q);
  });

  // ─── Mutations ───────────────────────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: () => createSupplier(token(), form),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["commerce-suppliers"] });
      const prev = queryClient.getQueryData<CommerceSupplier[]>(["commerce-suppliers", tid]);
      queryClient.setQueryData<CommerceSupplier[]>(["commerce-suppliers", tid], (old = []) => [
        ...old,
        { ...form, id: `__tmp_${Date.now()}`, tenantId: tid, isActive: true, createdAt: new Date().toISOString() } as CommerceSupplier,
      ]);
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["commerce-suppliers", tid], ctx.prev);
    },
    onSuccess: (created) => {
      const updated = queryClient.setQueryData<CommerceSupplier[]>(["commerce-suppliers", tid], (old = []) =>
        old.map((s) => (s.id.startsWith("__tmp_") ? created : s))
      );
      toast.success(`"${created.name}" ajouté`);
      closeDialog();
      if (updated) writeCache(tid, updated);
    },
  });

  const updateMutation = useMutation({
    mutationFn: () => updateSupplier(token(), editing!.id, form),
    onSuccess: (updated) => {
      const result = queryClient.setQueryData<CommerceSupplier[]>(["commerce-suppliers", tid], (old = []) =>
        old.map((s) => (s.id === editing!.id ? updated : s))
      );
      toast.success("Fournisseur modifié");
      closeDialog();
      if (result) writeCache(tid, result);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteSupplier(token(), deleting!.id),
    onSuccess: () => {
      const result = queryClient.setQueryData<CommerceSupplier[]>(["commerce-suppliers", tid], (old = []) =>
        old.filter((s) => s.id !== deleting!.id)
      );
      toast.success("Fournisseur supprimé");
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

  const openEdit = (supplier: CommerceSupplier) => {
    setForm({
      name: supplier.name,
      phone: supplier.phone ?? "",
      email: supplier.email ?? "",
      address: supplier.address ?? "",
    });
    setEditing(supplier);
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
            <div className="h-10 w-10 rounded-xl bg-green-100 flex items-center justify-center">
              <Truck className="h-6 w-6 text-green-600" />
            </div>
            Fournisseurs
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Gérez vos fournisseurs et contacts</p>
        </div>
        <Button
          onClick={openCreate}
          className="h-11 px-4 rounded-xl gap-2 bg-green-600 hover:bg-green-700 text-white font-semibold"
        >
          <Plus className="h-5 w-5" />
          Ajouter un fournisseur
        </Button>
      </div>

      {/* Cartes résumé */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-2xl border bg-card p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Nombre de fournisseurs
          </p>
          <p className="text-3xl font-bold tabular-nums">{isLoading ? "…" : suppliers.length}</p>
        </div>
        <div className="rounded-2xl border bg-card p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Actifs
          </p>
          <p className="text-3xl font-bold text-green-600 tabular-nums">
            {isLoading ? "…" : suppliers.filter((s) => s.isActive).length}
          </p>
        </div>
      </div>

      {/* Recherche */}
      <div className="relative">
        <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Rechercher par nom, téléphone ou email..."
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
            <Truck className="h-8 w-8 opacity-30" />
          </div>
          <p className="text-sm font-medium">Aucun fournisseur trouvé</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((supplier) => (
            <div
              key={supplier.id}
              className={cn(
                "flex items-center gap-4 p-4 rounded-2xl border-2 transition-all hover:shadow-sm",
                supplier.isActive ? "border-border bg-card" : "border-muted bg-muted/20 opacity-60"
              )}
            >
              {/* Avatar */}
              <div className="h-12 w-12 rounded-xl bg-green-100 text-green-700 font-bold text-lg flex items-center justify-center shrink-0">
                {supplier.name.charAt(0).toUpperCase()}
              </div>

              {/* Infos */}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm">{supplier.name}</p>
                <div className="flex flex-wrap items-center gap-2 mt-1">
                  {supplier.phone && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Phone className="h-3 w-3" />
                      {supplier.phone}
                    </span>
                  )}
                  {supplier.email && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Mail className="h-3 w-3" />
                      {supplier.email}
                    </span>
                  )}
                  {supplier.address && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {supplier.address}
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {timeAgo(supplier.createdAt)}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-1 shrink-0">
                <button
                  onClick={() => openEdit(supplier)}
                  className="h-9 w-9 rounded-lg hover:bg-muted flex items-center justify-center transition-colors text-muted-foreground hover:text-foreground"
                >
                  <Edit className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setDeleting(supplier)}
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
              <Truck className="h-4 w-4 text-green-600" />
              {editing ? "Modifier le fournisseur" : "Ajouter un fournisseur"}
            </DialogTitle>
          </DialogHeader>

          <div className="px-5 py-4 space-y-4">
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                Nom de l'entreprise
              </label>
              <Input
                placeholder="Ex: Distributeur ABC"
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
                <Mail className="h-3.5 w-3.5" />
                Email
              </label>
              <Input
                placeholder="Ex: contact@fournisseur.com"
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                className="h-10 rounded-xl"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                Adresse
              </label>
              <Input
                placeholder="Ex: Conakry"
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
              className="flex-1 h-10 rounded-xl bg-green-600 hover:bg-green-700 text-white font-bold"
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
                Supprimer le fournisseur?
              </AlertDialogTitle>
              <AlertDialogDescription>
                Cette action est irréversible. <span className="font-semibold">{deleting.name}</span> sera supprimé définitivement.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuler</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
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
