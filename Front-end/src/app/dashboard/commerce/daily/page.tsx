"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import * as storage from "@/lib/storage";
import { getDailySituation } from "@/lib/api/commerce.service";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  TrendingUp, TrendingDown, DollarSign, ShoppingCart,
  Banknote, Smartphone, CreditCard, Calendar, Package, RefreshCw, Truck,
} from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

const _gnf = new Intl.NumberFormat("fr-GN");
const fmt = (n: number) => _gnf.format(Math.round(n)) + " GNF";
const token = () => storage.getAuthItem("structura_token") ?? "";
const today = () => new Date().toISOString().slice(0, 10);

const CACHE_KEY = (tid: string, date: string) => `structura_commerce_daily_${tid}_${date}`;
function readCache(tid: string, date: string) {
  try { const r = localStorage.getItem(CACHE_KEY(tid, date)); return r ? JSON.parse(r) : undefined; } catch { return undefined; }
}
function writeCache(tid: string, date: string, data: unknown) {
  try { localStorage.setItem(CACHE_KEY(tid, date), JSON.stringify(data)); } catch { /* quota */ }
}

const METHOD_LABEL: Record<string, { label: string; icon: any; color: string }> = {
  CASH:          { label: "Espèces",          icon: Banknote,   color: "text-emerald-600" },
  MOBILE_MONEY:  { label: "Mobile Money",     icon: Smartphone, color: "text-blue-600"    },
  CREDIT:        { label: "Crédit",           icon: CreditCard, color: "text-amber-600"   },
  DEBT_RECOVERY: { label: "Recouvrement dettes", icon: RefreshCw, color: "text-purple-600" },
};

export default function DailySituationPage() {
  const { user } = useAuth();
  const [date, setDate] = useState(today());

  const tid = user?.tenantId ?? "";

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["commerce-daily", tid, date],
    queryFn: async () => {
      const result = await getDailySituation(token(), date);
      if (tid) writeCache(tid, date, result);
      return result;
    },
    enabled: !!user,
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    placeholderData: () => readCache(tid, date),
  });

  const s = data?.summary;
  const debtPayments: any[] = data?.debtPayments ?? [];
  const supplierPayments: any[] = data?.supplierPayments ?? [];

  return (
    <ProtectedRoute>
      <div className="space-y-6 p-4 md:p-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">Situation journalière</h1>
            <p className="text-sm text-muted-foreground">Recettes, dépenses et bénéfice du jour</p>
          </div>
          <div className="flex items-center gap-2">
            {isFetching && !isLoading && (
              <span className="text-xs text-muted-foreground animate-pulse">Actualisation…</span>
            )}
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44 h-9" />
          </div>
        </div>

        {isLoading && !data ? (
          <div className="text-center text-muted-foreground py-12">Chargement…</div>
        ) : !s ? (
          <div className="text-center text-muted-foreground py-12">
            {isFetching ? "Chargement…" : "Aucune donnée pour ce jour"}
          </div>
        ) : (
          <>
            {/* Résumé principal */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 xl:grid-cols-4">
              <Card className="border-l-4 border-l-blue-500">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <ShoppingCart className="h-3.5 w-3.5" /> Ventes
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xl font-bold">{fmt(s.totalRevenue)}</p>
                  <p className="text-xs text-muted-foreground">{s.salesCount} vente{s.salesCount > 1 ? "s" : ""}</p>
                </CardContent>
              </Card>

              <Card className="border-l-4 border-l-emerald-500">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <Banknote className="h-3.5 w-3.5" /> Encaissé (ventes)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xl font-bold text-emerald-600">{fmt(s.totalCollected)}</p>
                  {s.totalDebt > 0 && (
                    <p className="text-xs text-amber-600">+ {fmt(s.totalDebt)} en crédit</p>
                  )}
                </CardContent>
              </Card>

              {/* Dettes recouvrées aujourd'hui */}
              <Card className="border-l-4 border-l-purple-500">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <RefreshCw className="h-3.5 w-3.5" /> Dettes recouvrées
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xl font-bold text-purple-600">{fmt(s.totalDebtRecovered ?? 0)}</p>
                  <p className="text-xs text-muted-foreground">{debtPayments.length} règlement{debtPayments.length > 1 ? "s" : ""}</p>
                </CardContent>
              </Card>

              <Card className="border-l-4 border-l-red-500">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <TrendingDown className="h-3.5 w-3.5 text-red-500" /> Dépenses
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xl font-bold text-red-600">{fmt(s.totalExpenses)}</p>
                  <p className="text-xs text-muted-foreground">Coût stock: {fmt(s.totalCog)}</p>
                </CardContent>
              </Card>

              <Card className="border-l-4 border-l-orange-400 col-span-2 lg:col-span-1">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <Truck className="h-3.5 w-3.5 text-orange-500" /> Payé fournisseurs
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xl font-bold text-orange-600">{fmt(s.totalSupplierPaid ?? 0)}</p>
                  <p className="text-xs text-muted-foreground">{supplierPayments.length} paiement{supplierPayments.length > 1 ? "s" : ""}</p>
                </CardContent>
              </Card>
            </div>

            {/* Cash total du jour */}
            <Card className={`border-l-4 ${s.netProfit >= 0 ? "border-l-orange-500" : "border-l-red-600"}`}>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <TrendingUp className="h-3.5 w-3.5" /> Bénéfice net du jour
                </CardTitle>
              </CardHeader>
              <CardContent className="flex items-center gap-6">
                <div>
                  <p className={`text-2xl font-bold ${s.netProfit >= 0 ? "text-orange-600" : "text-red-600"}`}>
                    {s.netProfit >= 0 ? "+" : ""}{fmt(s.netProfit)}
                  </p>
                  <p className="text-xs text-muted-foreground">Brut: {fmt(s.grossProfit)}</p>
                </div>
                <div className="flex-1 text-right">
                  <p className="text-xs text-muted-foreground">Total cash reçu</p>
                  <p className="text-lg font-bold text-emerald-600">
                    {fmt(s.totalCollected + (s.totalDebtRecovered ?? 0))}
                  </p>
                  <p className="text-xs text-muted-foreground">ventes + recouvrements</p>
                </div>
              </CardContent>
            </Card>

            {/* Répartition par mode de paiement */}
            {Object.keys(data.byMethod).length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <DollarSign className="h-4 w-4" /> Encaissements par mode
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {Object.entries(data.byMethod).map(([method, amount]) => {
                      const info = METHOD_LABEL[method] ?? { label: method, icon: DollarSign, color: "text-gray-600" };
                      return (
                        <div key={method} className="flex items-center gap-3 p-3 rounded-lg bg-muted/40">
                          <info.icon className={`h-5 w-5 ${info.color} shrink-0`} />
                          <div>
                            <p className="text-xs text-muted-foreground">{info.label}</p>
                            <p className="font-bold">{fmt(Number(amount))}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Détail ventes */}
            {data.sales.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Package className="h-4 w-4" /> Ventes du jour ({data.sales.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y">
                    {data.sales.map((sale: any) => (
                      <div key={sale.id} className="px-4 py-3 flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">#{sale.receiptNumber}</span>
                            {sale.customer && (
                              <span className="text-xs text-muted-foreground">— {sale.customer.name}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(sale.createdAt), "HH:mm", { locale: fr })}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              · {sale.items.length} article{sale.items.length > 1 ? "s" : ""}
                            </span>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-bold">{fmt(sale.totalAmount)}</p>
                          {sale.remainingDebt > 0 && (
                            <p className="text-xs text-amber-600">Crédit: {fmt(sale.remainingDebt)}</p>
                          )}
                        </div>
                        <Badge variant="outline" className="text-xs shrink-0">
                          {METHOD_LABEL[sale.paymentMethod]?.label ?? sale.paymentMethod}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Dettes recouvrées */}
            {debtPayments.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2 text-purple-600">
                    <RefreshCw className="h-4 w-4" /> Dettes recouvrées ({debtPayments.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y">
                    {debtPayments.map((p: any) => (
                      <div key={p.id} className="px-4 py-3 flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            {p.sale?.customer?.name && (
                              <span className="text-sm font-medium">{p.sale.customer.name}</span>
                            )}
                            {p.sale?.receiptNumber && (
                              <span className="text-xs text-muted-foreground font-mono">#{p.sale.receiptNumber}</span>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(p.createdAt), "HH:mm", { locale: fr })}
                          </span>
                        </div>
                        <p className="font-bold text-purple-600 shrink-0">{fmt(p.amount)}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Dépenses du jour */}
            {data.expenses.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2 text-red-600">
                    <TrendingDown className="h-4 w-4" /> Dépenses du jour ({data.expenses.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y">
                    {data.expenses.map((exp: any) => (
                      <div key={exp.id} className="px-4 py-3 flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium capitalize">{exp.category.replace("_", " ")}</p>
                          {exp.description && (
                            <p className="text-xs text-muted-foreground">{exp.description}</p>
                          )}
                        </div>
                        <p className="font-bold text-red-600 shrink-0">{fmt(exp.amount)}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Paiements fournisseurs du jour */}
            {supplierPayments.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2 text-orange-600">
                    <Truck className="h-4 w-4" /> Paiements fournisseurs ({supplierPayments.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y">
                    {supplierPayments.map((p: any) => (
                      <div key={p.id} className="px-4 py-3 flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{p.supplierName}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(p.createdAt), "HH:mm", { locale: fr })}
                            </span>
                            {p.notes && (
                              <span className="text-xs text-muted-foreground">· {p.notes}</span>
                            )}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-bold text-orange-600">−{fmt(p.amount)}</p>
                          <p className="text-xs text-muted-foreground">{p.paymentMethod === "CASH" ? "Espèces" : p.paymentMethod === "MOBILE_MONEY" ? "Mobile Money" : p.paymentMethod}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Récap final */}
            <Card className="bg-muted/30">
              <CardContent className="py-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
                  <Calendar className="h-3.5 w-3.5" />
                  Récapitulatif — {date ? format(new Date(date), "d MMMM yyyy", { locale: fr }) : "aujourd'hui"}
                </p>
                <div className="space-y-1.5 text-sm">
                  {/* ── Bénéfice (P&L) ── */}
                  <div className="flex justify-between"><span>Ventes totales</span><span className="font-medium">{fmt(s.totalRevenue)}</span></div>
                  <div className="flex justify-between text-muted-foreground"><span>− Coût des marchandises</span><span>−{fmt(s.totalCog)}</span></div>
                  <div className="flex justify-between font-medium"><span>= Bénéfice brut</span><span className={s.grossProfit >= 0 ? "text-emerald-600" : "text-red-600"}>{fmt(s.grossProfit)}</span></div>
                  <div className="flex justify-between text-muted-foreground"><span>− Dépenses du jour</span><span>−{fmt(s.totalExpenses)}</span></div>
                  <div className="flex justify-between font-bold text-base pt-1 border-t">
                    <span>= Bénéfice net</span>
                    <span className={s.netProfit >= 0 ? "text-orange-600" : "text-red-600"}>
                      {s.netProfit >= 0 ? "+" : ""}{fmt(s.netProfit)}
                    </span>
                  </div>

                  {/* ── Trésorerie réelle ── */}
                  <div className="pt-2 mt-2 border-t border-dashed space-y-1.5">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Trésorerie du jour</p>
                    <div className="flex justify-between text-muted-foreground"><span>Cash encaissé (ventes)</span><span className="text-emerald-600">+{fmt(s.totalCollected)}</span></div>
                    {(s.totalDebtRecovered ?? 0) > 0 && (
                      <div className="flex justify-between text-muted-foreground"><span>+ Dettes recouvrées</span><span className="text-purple-600">+{fmt(s.totalDebtRecovered ?? 0)}</span></div>
                    )}
                    {(s.totalExpenses ?? 0) > 0 && (
                      <div className="flex justify-between text-muted-foreground"><span>− Dépenses</span><span className="text-red-500">−{fmt(s.totalExpenses)}</span></div>
                    )}
                    {(s.totalSupplierPaid ?? 0) > 0 && (
                      <div className="flex justify-between text-muted-foreground"><span>− Payé fournisseurs</span><span className="text-orange-500">−{fmt(s.totalSupplierPaid ?? 0)}</span></div>
                    )}
                    <div className="flex justify-between font-bold text-base pt-1 border-t">
                      <span>= Cash net du jour</span>
                      <span className={(s.cashNet ?? 0) >= 0 ? "text-emerald-600" : "text-red-600"}>
                        {(s.cashNet ?? 0) >= 0 ? "+" : ""}{fmt(s.cashNet ?? 0)}
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </ProtectedRoute>
  );
}
