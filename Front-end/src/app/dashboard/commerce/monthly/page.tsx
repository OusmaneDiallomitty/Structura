"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import * as storage from "@/lib/storage";
import { getMonthlyReport } from "@/lib/api/commerce.service";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  TrendingUp, TrendingDown, Receipt, Banknote, Truck,
  ChevronLeft, ChevronRight, BarChart3, Wallet, ShoppingCart,
  ArrowUpRight, ArrowDownRight,
} from "lucide-react";
import { format, addMonths, subMonths, parseISO } from "date-fns";
import { fr } from "date-fns/locale";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const _gnf = new Intl.NumberFormat("fr-GN");
const fmt  = (n: number) => _gnf.format(Math.round(n)) + " GNF";
const fmtShort = (n: number) => {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000)     return `${(n / 1_000).toFixed(0)}k`;
  return String(Math.round(n));
};

const CATEGORY_LABELS: Record<string, string> = {
  loyer: "Loyer", salaire: "Salaires", transport: "Transport",
  achat_divers: "Achats divers", electricite: "Électricité",
  eau: "Eau", communication: "Communication", autre: "Autre",
};

function healthBadge(grossProfit: number, marginPct: number | null) {
  if (grossProfit < 0)      return { label: "⚠️ Vente à perte ce mois", cls: "bg-red-100 text-red-700" };
  if (grossProfit === 0)    return { label: "Aucune vente", cls: "bg-gray-100 text-gray-500" };
  if (marginPct === null)   return { label: "Rentable ✓", cls: "bg-emerald-100 text-emerald-700" };
  if (marginPct < 10)       return { label: "⚠️ Marge très faible", cls: "bg-orange-100 text-orange-700" };
  if (marginPct < 20)       return { label: "Marge correcte", cls: "bg-amber-100 text-amber-700" };
  if (marginPct < 35)       return { label: "Bonne marge ✓", cls: "bg-emerald-100 text-emerald-700" };
  return                           { label: "Excellente marge ✓", cls: "bg-emerald-100 text-emerald-700" };
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function MonthlyReportPage() {
  const { user } = useAuth();
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });

  const token = () => storage.getAuthItem("structura_token") ?? "";

  const { data, isLoading } = useQuery({
    queryKey: ["commerce-monthly", user?.tenantId, currentMonth],
    queryFn: () => getMonthlyReport(token(), currentMonth),
    enabled: !!user,
    staleTime: 120_000,
  });

  const s = data?.summary;
  const byDay: any[] = data?.byDay ?? [];
  const expCats: any[] = data?.expensesByCategory ?? [];
  const supplierList: any[] = data?.supplierPaymentsList ?? [];

  const health = s ? healthBadge(s.grossProfit, s.marginPct) : null;

  // Navigation mois
  const goMonth = (dir: 1 | -1) => {
    const d = dir === 1
      ? addMonths(parseISO(currentMonth + "-01"), 1)
      : subMonths(parseISO(currentMonth + "-01"), 1);
    setCurrentMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };

  const monthLabel = format(parseISO(currentMonth + "-01"), "MMMM yyyy", { locale: fr });
  const isCurrentMonth = currentMonth === (() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`;
  })();

  return (
    <ProtectedRoute>
      <div className="space-y-6 p-4 md:p-6">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold">Rapport mensuel</h1>
            <p className="text-sm text-muted-foreground">Vue globale de tous les mouvements du mois</p>
          </div>
          {/* Navigation mois */}
          <div className="flex items-center gap-2">
            <button onClick={() => goMonth(-1)} className="p-2 rounded-lg border hover:bg-accent transition-colors">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm font-semibold capitalize min-w-36 text-center">{monthLabel}</span>
            <button
              onClick={() => goMonth(1)}
              disabled={isCurrentMonth}
              className="p-2 rounded-lg border hover:bg-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="text-center text-muted-foreground py-16">Chargement du rapport…</div>
        ) : !s ? (
          <div className="text-center text-muted-foreground py-16">Aucune donnée pour ce mois</div>
        ) : (
          <>
            {/* Badge santé */}
            {health && (
              <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold ${health.cls}`}>
                {health.label}
                {s.marginPct !== null && (
                  <span className="opacity-75">— Marge : {s.marginPct.toFixed(1)}%</span>
                )}
              </div>
            )}

            {/* KPIs principaux */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Card className="border-l-4 border-l-orange-400">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Receipt className="h-4 w-4 text-orange-500" />
                    <span className="text-xs text-muted-foreground font-medium">Chiffre d'affaires</span>
                  </div>
                  <p className="text-xl font-bold">{fmt(s.revenue)}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{s.salesCount} vente{s.salesCount > 1 ? "s" : ""}</p>
                </CardContent>
              </Card>

              <Card className={`border-l-4 ${s.grossProfit >= 0 ? "border-l-emerald-400" : "border-l-red-400"}`}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <TrendingUp className="h-4 w-4 text-emerald-500" />
                    <span className="text-xs text-muted-foreground font-medium">Bénéfice brut</span>
                  </div>
                  <p className={`text-xl font-bold ${s.grossProfit >= 0 ? "text-emerald-600" : "text-red-600"}`}>{fmt(s.grossProfit)}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Coût stock : {fmt(s.cog)}</p>
                </CardContent>
              </Card>

              <Card className={`border-l-4 ${s.netProfit >= 0 ? "border-l-blue-400" : "border-l-red-400"}`}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Wallet className="h-4 w-4 text-blue-500" />
                    <span className="text-xs text-muted-foreground font-medium">Bénéfice net</span>
                  </div>
                  <p className={`text-xl font-bold ${s.netProfit >= 0 ? "text-blue-600" : "text-red-600"}`}>
                    {s.netProfit >= 0 ? "+" : ""}{fmt(s.netProfit)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">Dépenses : {fmt(s.expenses)}</p>
                </CardContent>
              </Card>

              <Card className={`border-l-4 ${s.cashNet >= 0 ? "border-l-violet-400" : "border-l-red-400"}`}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Banknote className="h-4 w-4 text-violet-500" />
                    <span className="text-xs text-muted-foreground font-medium">Cash net</span>
                  </div>
                  <p className={`text-xl font-bold ${s.cashNet >= 0 ? "text-violet-600" : "text-red-600"}`}>
                    {s.cashNet >= 0 ? "+" : ""}{fmt(s.cashNet)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">Encaissé − sorties réelles</p>
                </CardContent>
              </Card>
            </div>

            {/* Récap P&L complet */}
            <Card className="bg-muted/30">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" /> Récapitulatif — {monthLabel}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-2 gap-6">
                  {/* P&L */}
                  <div className="space-y-2 text-sm">
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">Compte de résultat</p>
                    <div className="flex justify-between"><span>Ventes totales</span><span className="font-semibold">{fmt(s.revenue)}</span></div>
                    <div className="flex justify-between text-muted-foreground"><span>− Coût des marchandises</span><span>−{fmt(s.cog)}</span></div>
                    <div className="flex justify-between font-semibold pt-1 border-t"><span>= Bénéfice brut</span><span className={s.grossProfit >= 0 ? "text-emerald-600" : "text-red-600"}>{fmt(s.grossProfit)}</span></div>
                    {s.marginPct !== null && (
                      <div className="flex justify-between text-xs text-muted-foreground"><span>Marge brute</span><Badge variant="outline" className={s.marginPct >= 20 ? "border-emerald-300 text-emerald-700" : s.marginPct >= 10 ? "border-amber-300 text-amber-700" : "border-red-300 text-red-700"}>{s.marginPct.toFixed(1)}%</Badge></div>
                    )}
                    <div className="flex justify-between text-muted-foreground"><span>− Dépenses boutique</span><span>−{fmt(s.expenses)}</span></div>
                    <div className="flex justify-between font-bold text-base pt-1 border-t"><span>= Bénéfice net</span><span className={s.netProfit >= 0 ? "text-blue-600" : "text-red-600"}>{s.netProfit >= 0 ? "+" : ""}{fmt(s.netProfit)}</span></div>
                  </div>

                  {/* Trésorerie */}
                  <div className="space-y-2 text-sm">
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">Trésorerie réelle</p>
                    <div className="flex justify-between"><span>Cash encaissé (ventes)</span><span className="font-semibold text-emerald-600">+{fmt(s.collected)}</span></div>
                    {s.debtRecovered > 0 && <div className="flex justify-between text-muted-foreground"><span>+ Dettes recouvrées</span><span className="text-purple-600">+{fmt(s.debtRecovered)}</span></div>}
                    {s.expenses > 0 && <div className="flex justify-between text-muted-foreground"><span>− Dépenses payées</span><span className="text-red-500">−{fmt(s.expenses)}</span></div>}
                    {s.supplierPayments > 0 && <div className="flex justify-between text-muted-foreground"><span>− Payé fournisseurs</span><span className="text-orange-500">−{fmt(s.supplierPayments)}</span></div>}
                    <div className="flex justify-between font-bold text-base pt-1 border-t"><span>= Cash net du mois</span><span className={s.cashNet >= 0 ? "text-violet-600" : "text-red-600"}>{s.cashNet >= 0 ? "+" : ""}{fmt(s.cashNet)}</span></div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Tableau jour par jour */}
            {byDay.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <ShoppingCart className="h-4 w-4" /> Détail jour par jour
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                          <th className="text-left px-4 py-2 font-medium">Date</th>
                          <th className="text-right px-4 py-2 font-medium">Ventes</th>
                          <th className="text-right px-4 py-2 font-medium">Bén. brut</th>
                          <th className="text-right px-4 py-2 font-medium">Dépenses</th>
                          <th className="text-right px-4 py-2 font-medium">Fournisseurs</th>
                          <th className="text-right px-4 py-2 font-medium">Net</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {byDay.map((day) => (
                          <tr key={day.date} className="hover:bg-muted/20 transition-colors">
                            <td className="px-4 py-2.5">
                              <div className="font-medium">{format(parseISO(day.date), "EEE dd", { locale: fr })}</div>
                              {day.salesCount > 0 && <div className="text-xs text-muted-foreground">{day.salesCount} vente{day.salesCount > 1 ? "s" : ""}</div>}
                            </td>
                            <td className="px-4 py-2.5 text-right font-medium">{day.revenue > 0 ? fmtShort(day.revenue) : "—"}</td>
                            <td className={`px-4 py-2.5 text-right font-medium ${day.grossProfit >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                              {day.revenue > 0 ? (day.grossProfit >= 0 ? "+" : "") + fmtShort(day.grossProfit) : "—"}
                            </td>
                            <td className="px-4 py-2.5 text-right text-red-500">{day.expenses > 0 ? "−" + fmtShort(day.expenses) : "—"}</td>
                            <td className="px-4 py-2.5 text-right text-orange-500">{day.supplierPayments > 0 ? "−" + fmtShort(day.supplierPayments) : "—"}</td>
                            <td className={`px-4 py-2.5 text-right font-semibold ${day.netProfit >= 0 ? "text-blue-600" : "text-red-600"}`}>
                              {(day.revenue > 0 || day.expenses > 0 || day.supplierPayments > 0) ? (day.netProfit >= 0 ? "+" : "") + fmtShort(day.netProfit) : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 bg-muted/30 font-bold text-sm">
                          <td className="px-4 py-2.5">Total</td>
                          <td className="px-4 py-2.5 text-right">{fmtShort(s.revenue)}</td>
                          <td className={`px-4 py-2.5 text-right ${s.grossProfit >= 0 ? "text-emerald-600" : "text-red-600"}`}>{s.grossProfit >= 0 ? "+" : ""}{fmtShort(s.grossProfit)}</td>
                          <td className="px-4 py-2.5 text-right text-red-500">{s.expenses > 0 ? "−" + fmtShort(s.expenses) : "—"}</td>
                          <td className="px-4 py-2.5 text-right text-orange-500">{s.supplierPayments > 0 ? "−" + fmtShort(s.supplierPayments) : "—"}</td>
                          <td className={`px-4 py-2.5 text-right ${s.netProfit >= 0 ? "text-blue-600" : "text-red-600"}`}>{s.netProfit >= 0 ? "+" : ""}{fmtShort(s.netProfit)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Dépenses par catégorie */}
            {expCats.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2 text-red-600">
                    <TrendingDown className="h-4 w-4" /> Dépenses par catégorie
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {expCats.map((cat) => {
                    const pct = s.expenses > 0 ? (cat.total / s.expenses) * 100 : 0;
                    return (
                      <div key={cat.category}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="font-medium capitalize">{CATEGORY_LABELS[cat.category] ?? cat.category}</span>
                          <span className="text-muted-foreground">{fmt(cat.total)} <span className="text-xs">({pct.toFixed(0)}%)</span></span>
                        </div>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-red-400 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            )}

            {/* Paiements fournisseurs */}
            {supplierList.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2 text-orange-600">
                    <Truck className="h-4 w-4" /> Paiements fournisseurs ({supplierList.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y">
                    {supplierList.map((p: any) => (
                      <div key={p.id} className="px-4 py-3 flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{p.supplierName}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-muted-foreground">{format(new Date(p.createdAt), "dd MMM HH:mm", { locale: fr })}</span>
                            {p.notes && <span className="text-xs text-muted-foreground">· {p.notes}</span>}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-bold text-orange-600">−{fmt(p.amount)}</p>
                          <p className="text-xs text-muted-foreground">{p.paymentMethod === "CASH" ? "Espèces" : p.paymentMethod === "MOBILE_MONEY" ? "Mobile Money" : p.paymentMethod}</p>
                        </div>
                      </div>
                    ))}
                    <div className="px-4 py-3 flex justify-between items-center bg-muted/30">
                      <span className="text-sm font-semibold">Total payé fournisseurs</span>
                      <span className="font-bold text-orange-600">−{fmt(s.supplierPayments)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {byDay.length === 0 && (
              <div className="text-center text-muted-foreground py-12">
                <BarChart3 className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p>Aucune activité enregistrée pour {monthLabel}</p>
              </div>
            )}
          </>
        )}
      </div>
    </ProtectedRoute>
  );
}
