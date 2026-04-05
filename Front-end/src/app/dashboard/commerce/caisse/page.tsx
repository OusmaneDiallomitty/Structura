"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import * as storage from "@/lib/storage";
import {
  getCaisseDay,
  getCaisseHistory,
  upsertCaisseSession,
  type CaisseMovement,
  type CaisseHistoryRow,
} from "@/lib/api/commerce.service";
import { toast } from "sonner";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  Smartphone,
  CreditCard,
  Wallet,
  TrendingUp,
  TrendingDown,
  Pencil,
  Check,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  ShoppingCart,
  Package,
  Calendar,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const _gnf = new Intl.NumberFormat("fr-GN");
const fmt = (n: number) => _gnf.format(Math.round(n)) + " GNF";
const fmtShort = (n: number) => {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000)     return `${(n / 1_000).toFixed(0)}k`;
  return String(Math.round(n));
};
const today = () => new Date().toISOString().slice(0, 10);
const token = () => storage.getAuthItem("structura_token") ?? "";

const METHOD_META: Record<string, { label: string; icon: any; color: string }> = {
  CASH:          { label: "Espèces",      icon: Banknote,   color: "text-emerald-700 bg-emerald-50" },
  MOBILE_MONEY:  { label: "Mobile Money", icon: Smartphone, color: "text-blue-700 bg-blue-50"       },
  CREDIT:        { label: "Crédit",       icon: CreditCard, color: "text-amber-700 bg-amber-50"     },
  BANK_TRANSFER: { label: "Virement",     icon: Wallet,     color: "text-violet-700 bg-violet-50"   },
};

const CATEGORY_META: Record<string, { label: string; icon: any; color: string }> = {
  SALE:             { label: "Vente",              icon: ShoppingCart, color: "text-orange-600" },
  DEBT_RECOVERY:    { label: "Recouvrement",       icon: RefreshCw,    color: "text-purple-600" },
  EXPENSE:          { label: "Dépense",            icon: TrendingDown, color: "text-red-600"    },
  SUPPLIER_PAYMENT: { label: "Pmt fournisseur",    icon: Package,      color: "text-rose-600"   },
};

function getMethodMeta(method: string) {
  return METHOD_META[method] ?? { label: method, icon: Banknote, color: "text-gray-600 bg-gray-50" };
}

// ─── Composants ───────────────────────────────────────────────────────────────

function SoldeCard({
  label, value, sub, highlight, large,
}: { label: string; value: number; sub?: string; highlight?: "positive" | "negative" | "neutral"; large?: boolean }) {
  const color =
    highlight === "positive" ? "text-emerald-600" :
    highlight === "negative" ? "text-red-500" :
    "text-foreground";
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className={`font-bold ${large ? "text-2xl" : "text-xl"} ${color}`}>{fmt(value)}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function MovementRow({ m }: { m: CaisseMovement }) {
  const isIn = m.type === "IN";
  const cat = CATEGORY_META[m.category] ?? CATEGORY_META.SALE;
  const meth = getMethodMeta(m.method);
  const MethodIcon = meth.icon;
  const CatIcon = cat.icon;
  const time = new Date(m.at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="flex items-center gap-3 py-2.5 border-b last:border-0">
      {/* Icône type */}
      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${isIn ? "bg-emerald-100" : "bg-red-100"}`}>
        {isIn
          ? <ArrowDownLeft className="h-4 w-4 text-emerald-600" />
          : <ArrowUpRight className="h-4 w-4 text-red-600" />
        }
      </div>
      {/* Détail */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <CatIcon className={`h-3.5 w-3.5 ${cat.color} flex-shrink-0`} />
          <p className="text-sm font-medium truncate">{m.label}</p>
        </div>
        {m.sub && <p className="text-xs text-muted-foreground truncate">{m.sub}</p>}
      </div>
      {/* Méthode + heure */}
      <div className="flex flex-col items-end gap-0.5 shrink-0">
        <span className={`font-semibold text-sm ${isIn ? "text-emerald-600" : "text-red-600"}`}>
          {isIn ? "+" : "−"}{fmt(m.amount)}
        </span>
        <div className="flex items-center gap-1">
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${meth.color}`}>
            <MethodIcon className="h-2.5 w-2.5 inline mr-0.5" />{meth.label}
          </span>
          <span className="text-[10px] text-muted-foreground">{time}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CaissePage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const tid = user?.tenantId ?? "";
  const [date, setDate] = useState(today());
  const [editingOpening, setEditingOpening] = useState(false);
  const [openingInput, setOpeningInput] = useState("");
  const [showIn, setShowIn] = useState(true);
  const [showOut, setShowOut] = useState(true);
  const [historyDays, setHistoryDays] = useState(30);

  // ── Données du jour ──
  const { data, isLoading } = useQuery({
    queryKey: ["caisse-day", tid, date],
    queryFn: () => getCaisseDay(token(), date),
    enabled: !!user,
    staleTime: 30_000,
    refetchInterval: date === today() ? 60_000 : false,
  });

  // ── Historique ──
  const { data: history } = useQuery({
    queryKey: ["caisse-history", tid, historyDays],
    queryFn: () => getCaisseHistory(token(), historyDays),
    enabled: !!user,
    staleTime: 300_000,
  });

  // ── Mutation solde d'ouverture ──
  const sessionMutation = useMutation({
    mutationFn: () => upsertCaisseSession(token(), {
      date,
      openingBalance: parseFloat(openingInput) || 0,
    }),
    onSuccess: () => {
      toast.success("Solde d'ouverture enregistré");
      setEditingOpening(false);
      queryClient.invalidateQueries({ queryKey: ["caisse-day", tid, date] });
      queryClient.invalidateQueries({ queryKey: ["caisse-history", tid] });
    },
    onError: () => toast.error("Erreur lors de l'enregistrement"),
  });

  const startEditing = () => {
    setOpeningInput(String(data?.openingBalance ?? 0));
    setEditingOpening(true);
  };

  const isToday = date === today();
  const movements = data?.movements ?? [];
  const inMovements  = movements.filter((m) => m.type === "IN");
  const outMovements = movements.filter((m) => m.type === "OUT");

  const chartData = (history ?? []).map((r: CaisseHistoryRow) => ({
    ...r,
    date: format(new Date(r.date + "T00:00:00"), "dd/MM", { locale: fr }),
  }));

  return (
    <div className="p-4 md:p-6 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* ── Header ── */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Livre de Caisse</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Tout l'argent qui entre et sort de votre boutique
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-44 h-9 text-sm"
          />
          {!isToday && (
            <Button variant="outline" size="sm" onClick={() => setDate(today())}>
              Aujourd'hui
            </Button>
          )}
        </div>
      </div>

      {/* ── Résumé — 4 colonnes ── */}
      <Card>
        <CardContent className="p-5">
          {isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-7 w-32" />
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
              {/* Ouverture */}
              <div className="flex flex-col gap-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Solde d'ouverture
                </p>
                {editingOpening ? (
                  <div className="flex items-center gap-1">
                    <NumberInput
                      value={openingInput ? parseFloat(openingInput) : null}
                      onChange={(v) => setOpeningInput(v != null ? String(v) : "")}
                      className="h-8 w-36 text-sm"
                      autoFocus
                      onKeyDown={(e: React.KeyboardEvent) => { if (e.key === "Enter") sessionMutation.mutate(); if (e.key === "Escape") setEditingOpening(false); }}
                    />
                    <Button size="icon" className="h-8 w-8 bg-emerald-500 hover:bg-emerald-600" onClick={() => sessionMutation.mutate()} disabled={sessionMutation.isPending}>
                      <Check className="h-4 w-4 text-white" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <p className="text-xl font-bold">{fmt(data?.openingBalance ?? 0)}</p>
                    <button onClick={startEditing} className="text-muted-foreground hover:text-foreground transition-colors">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">En caisse au départ</p>
              </div>

              {/* Entrées */}
              <SoldeCard
                label="Total entrées"
                value={data?.totalIn ?? 0}
                sub={`${(data?.counts.sales ?? 0) + (data?.counts.debtRecoveries ?? 0)} mouvements`}
                highlight="positive"
              />

              {/* Sorties */}
              <SoldeCard
                label="Total sorties"
                value={data?.totalOut ?? 0}
                sub={`${(data?.counts.expenses ?? 0) + (data?.counts.supplierPayments ?? 0)} mouvements`}
                highlight="negative"
              />

              {/* Clôture */}
              <SoldeCard
                label={isToday ? "Solde actuel" : "Solde de clôture"}
                value={data?.closingBalance ?? 0}
                sub="Ouverture + entrées − sorties"
                highlight={(data?.closingBalance ?? 0) >= 0 ? "positive" : "negative"}
                large
              />
            </div>
          )}

          {/* Formule explicative */}
          {!isLoading && data && (
            <div className="mt-4 pt-4 border-t flex flex-wrap items-center gap-2 text-xs text-muted-foreground font-mono">
              <span className="font-semibold text-foreground">{fmt(data.openingBalance)}</span>
              <span>(ouverture)</span>
              <span className="text-emerald-600 font-bold">+ {fmt(data.totalIn)}</span>
              <span>(entrées)</span>
              <span className="text-red-500 font-bold">− {fmt(data.totalOut)}</span>
              <span>(sorties)</span>
              <span>=</span>
              <span className={`font-bold text-sm ${data.closingBalance >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                {fmt(data.closingBalance)}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Détail par méthode ── */}
      {data && Object.keys(data.byMethod).length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Object.entries(data.byMethod).map(([method, amounts]) => {
            const meta = getMethodMeta(method);
            const Icon = meta.icon;
            const net = amounts.in - amounts.out;
            return (
              <Card key={method}>
                <CardContent className="p-4">
                  <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium mb-3 ${meta.color}`}>
                    <Icon className="h-3.5 w-3.5" />
                    {meta.label}
                  </div>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Entrées</span>
                      <span className="text-emerald-600 font-medium">+{fmt(amounts.in)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Sorties</span>
                      <span className="text-red-500 font-medium">−{fmt(amounts.out)}</span>
                    </div>
                    <div className="flex justify-between border-t pt-1">
                      <span className="font-semibold">Net</span>
                      <span className={`font-bold ${net >= 0 ? "text-emerald-600" : "text-red-500"}`}>{fmt(net)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ── Mouvements ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Entrées */}
        <Card>
          <CardHeader className="pb-2">
            <button
              className="flex items-center justify-between w-full"
              onClick={() => setShowIn((v) => !v)}
            >
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-emerald-100 flex items-center justify-center">
                  <ArrowDownLeft className="h-4 w-4 text-emerald-600" />
                </div>
                <CardTitle className="text-base">Entrées</CardTitle>
                <Badge variant="outline" className="text-emerald-700 border-emerald-200 text-xs">
                  +{fmt(data?.totalIn ?? 0)}
                </Badge>
              </div>
              {showIn ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
            </button>
          </CardHeader>
          {showIn && (
            <CardContent>
              {/* Sous-total ventes + recouvrements */}
              {data && (
                <div className="flex gap-4 mb-3 text-xs">
                  <span className="text-muted-foreground">Ventes : <span className="text-orange-600 font-semibold">{fmt(data.breakdown.salesCash)}</span></span>
                  <span className="text-muted-foreground">Recouvrements : <span className="text-purple-600 font-semibold">{fmt(data.breakdown.debtRecovered)}</span></span>
                </div>
              )}
              {isLoading ? (
                <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
              ) : inMovements.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Aucune entrée ce jour</p>
              ) : (
                <div>{inMovements.map((m) => <MovementRow key={m.id} m={m} />)}</div>
              )}
            </CardContent>
          )}
        </Card>

        {/* Sorties */}
        <Card>
          <CardHeader className="pb-2">
            <button
              className="flex items-center justify-between w-full"
              onClick={() => setShowOut((v) => !v)}
            >
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-red-100 flex items-center justify-center">
                  <ArrowUpRight className="h-4 w-4 text-red-600" />
                </div>
                <CardTitle className="text-base">Sorties</CardTitle>
                <Badge variant="outline" className="text-red-700 border-red-200 text-xs">
                  −{fmt(data?.totalOut ?? 0)}
                </Badge>
              </div>
              {showOut ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
            </button>
          </CardHeader>
          {showOut && (
            <CardContent>
              {data && (
                <div className="flex gap-4 mb-3 text-xs">
                  <span className="text-muted-foreground">Dépenses : <span className="text-red-600 font-semibold">{fmt(data.breakdown.expenses)}</span></span>
                  <span className="text-muted-foreground">Fournisseurs : <span className="text-rose-600 font-semibold">{fmt(data.breakdown.supplierPayments)}</span></span>
                </div>
              )}
              {isLoading ? (
                <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
              ) : outMovements.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Aucune sortie ce jour</p>
              ) : (
                <div>{outMovements.map((m) => <MovementRow key={m.id} m={m} />)}</div>
              )}
            </CardContent>
          )}
        </Card>
      </div>

      {/* ── Graphique historique ── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-base">Évolution du solde — {historyDays} jours</CardTitle>
            <div className="flex gap-1">
              {[7, 30, 90].map((d) => (
                <button
                  key={d}
                  onClick={() => setHistoryDays(d)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${historyDays === d ? "bg-orange-500 text-white" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
                >
                  {d}j
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {!chartData.length ? (
            <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">Aucune donnée</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="gClosing" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f97316" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gIn" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtShort} width={55} />
                <Tooltip
                  formatter={(value, name) => [
                    fmt(Number(value)),
                    name === "closingBalance" ? "Solde clôture" :
                    name === "totalIn" ? "Entrées" : "Sorties",
                  ]}
                />
                <Legend formatter={(v) => v === "closingBalance" ? "Solde clôture" : v === "totalIn" ? "Entrées" : "Sorties"} wrapperStyle={{ fontSize: 11 }} />
                <Area type="monotone" dataKey="totalIn"       stroke="#22c55e" strokeWidth={1.5} fill="url(#gIn)"      strokeDasharray="4 2" />
                <Area type="monotone" dataKey="totalOut"      stroke="#ef4444" strokeWidth={1.5} fill="none"           strokeDasharray="4 2" />
                <Area type="monotone" dataKey="closingBalance" stroke="#f97316" strokeWidth={2.5} fill="url(#gClosing)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* ── Comment ça marche ── */}
      <Card className="bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-800">
        <CardContent className="p-4">
          <p className="text-sm font-semibold text-orange-800 dark:text-orange-200 mb-2">Comment utiliser le livre de caisse</p>
          <div className="space-y-1.5 text-xs text-orange-700 dark:text-orange-300">
            <p>• <strong>Chaque matin</strong> : cliquez sur le crayon ✏️ à côté du solde d'ouverture et entrez le montant que vous avez en caisse (espèces + mobile money).</p>
            <p>• <strong>Pendant la journée</strong> : les ventes, recouvrements, dépenses et paiements fournisseurs s'ajoutent automatiquement.</p>
            <p>• <strong>Chaque soir</strong> : le solde de clôture indique combien vous devriez avoir. Vérifiez avec l'argent réel en caisse — si c'est différent, il y a une erreur à chercher.</p>
            <p>• <strong>Astuce</strong> : le solde de clôture du soir devient le solde d'ouverture du lendemain.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
