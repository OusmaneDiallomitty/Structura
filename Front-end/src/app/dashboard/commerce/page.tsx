"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import * as storage from "@/lib/storage";
import {
  getCommerceDashboard,
  getRevenueChart,
  type CommerceDashboardStats,
} from "@/lib/api/commerce.service";
import {
  TrendingUp,
  ShoppingCart,
  Package,
  Users,
  AlertTriangle,
  ArrowUpRight,
  Banknote,
  Clock,
  Sparkles,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import Link from "next/link";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

const CACHE_KEY = (tenantId: string) => `structura_commerce_dashboard:${tenantId}`;

function formatGNF(amount: number) {
  return new Intl.NumberFormat("fr-GN", {
    style: "decimal",
    minimumFractionDigits: 0,
  }).format(amount) + " GNF";
}

function StatCard({
  title,
  value,
  sub,
  icon: Icon,
  iconColor,
  trend,
}: {
  title: string;
  value: string;
  sub?: string;
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  trend?: string;
}) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className={`p-2.5 rounded-xl ${iconColor}`}>
            <Icon className="h-5 w-5 text-white" />
          </div>
          {trend && (
            <div className="flex items-center gap-1 text-emerald-600 text-xs font-medium">
              <ArrowUpRight className="h-3.5 w-3.5" />
              {trend}
            </div>
          )}
        </div>
        <p className="text-2xl font-bold text-foreground">{value}</p>
        <p className="text-sm text-muted-foreground mt-1">{title}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function StatCardSkeleton() {
  return (
    <Card>
      <CardContent className="p-6">
        <Skeleton className="h-10 w-10 rounded-xl mb-4" />
        <Skeleton className="h-7 w-32 mb-2" />
        <Skeleton className="h-4 w-24" />
      </CardContent>
    </Card>
  );
}

export default function CommerceDashboardPage() {
  const { user } = useAuth();

  const { data: stats, isLoading } = useQuery({
    queryKey: ["commerce-dashboard", user?.tenantId],
    queryFn: async () => {
      const token = storage.getAuthItem("structura_token");
      if (!token) throw new Error("Non authentifié");
      const data = await getCommerceDashboard(token);
      try {
        localStorage.setItem(CACHE_KEY(user!.tenantId), JSON.stringify(data));
      } catch {}
      return data;
    },
    placeholderData: (): CommerceDashboardStats | undefined => {
      try {
        const c = localStorage.getItem(CACHE_KEY(user?.tenantId ?? ""));
        return c ? JSON.parse(c) : undefined;
      } catch {
        return undefined;
      }
    },
    enabled: !!user,
    staleTime: 60_000,
    gcTime: 10 * 60_000,
  });

  const { data: chartData } = useQuery({
    queryKey: ["commerce-chart", user?.tenantId],
    queryFn: async () => {
      const token = storage.getAuthItem("structura_token");
      if (!token) throw new Error("Non authentifié");
      return getRevenueChart(token, 30);
    },
    enabled: !!user,
    staleTime: 300_000,
  });

  const formattedChart = chartData?.map((row) => ({
    ...row,
    date: format(new Date(row.date), "dd MMM", { locale: fr }),
  }));

  // Banière setup catalogue si aucun produit et pas encore en loading
  const showSetupBanner = !isLoading && stats && (stats.inventory?.totalProducts ?? 0) === 0;

  return (
    <div className="p-6 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* Bannière setup catalogue */}
      {showSetupBanner && (
        <Link
          href="/dashboard/commerce/setup-catalog"
          className="flex items-center gap-4 p-5 rounded-2xl bg-gradient-to-r from-orange-500 to-orange-600 text-white hover:from-orange-600 hover:to-orange-700 transition-all shadow-lg shadow-orange-200 dark:shadow-none"
        >
          <div className="flex-shrink-0 h-12 w-12 rounded-xl bg-white/20 flex items-center justify-center">
            <Sparkles className="h-6 w-6" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-lg">Configurer votre catalogue</p>
            <p className="text-orange-100 text-sm">
              Choisissez votre secteur et importez vos produits en quelques clics — construction, alimentation, électronique...
            </p>
          </div>
          <ArrowUpRight className="h-6 w-6 flex-shrink-0" />
        </Link>
      )}

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Tableau de bord</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {format(new Date(), "EEEE dd MMMM yyyy", { locale: fr })}
        </p>
      </div>

      {/* Stats du jour */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Aujourd&apos;hui
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)
          ) : (
            <>
              <StatCard
                title="Chiffre d'affaires"
                value={formatGNF(stats?.today.revenue ?? 0)}
                sub="Ventes du jour"
                icon={TrendingUp}
                iconColor="bg-orange-500"
              />
              <StatCard
                title="Encaissé"
                value={formatGNF(stats?.today.collected ?? 0)}
                sub="Montant reçu"
                icon={Banknote}
                iconColor="bg-emerald-500"
              />
              <StatCard
                title="Ventes"
                value={String(stats?.today.salesCount ?? 0)}
                sub="Transactions du jour"
                icon={ShoppingCart}
                iconColor="bg-blue-500"
              />
              <StatCard
                title="Produits en rupture"
                value={String(stats?.inventory.lowStockCount ?? 0)}
                sub={`Sur ${stats?.inventory.totalProducts ?? 0} produits`}
                icon={AlertTriangle}
                iconColor={
                  (stats?.inventory.lowStockCount ?? 0) > 0
                    ? "bg-red-500"
                    : "bg-gray-400"
                }
              />
            </>
          )}
        </div>
      </div>

      {/* Stats du mois */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Ce mois
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {isLoading ? (
            Array.from({ length: 3 }).map((_, i) => <StatCardSkeleton key={i} />)
          ) : (
            <>
              <StatCard
                title="Chiffre d'affaires mensuel"
                value={formatGNF(stats?.month.revenue ?? 0)}
                sub={`${stats?.month.salesCount ?? 0} ventes`}
                icon={TrendingUp}
                iconColor="bg-orange-500"
              />
              <StatCard
                title="Total encaissé"
                value={formatGNF(stats?.month.collected ?? 0)}
                icon={Banknote}
                iconColor="bg-emerald-500"
              />
              <StatCard
                title="Dettes clients"
                value={formatGNF(stats?.month.remainingDebt ?? 0)}
                sub="Montants non encaissés"
                icon={Clock}
                iconColor={
                  (stats?.month.remainingDebt ?? 0) > 0
                    ? "bg-amber-500"
                    : "bg-gray-400"
                }
              />
            </>
          )}
        </div>
      </div>

      {/* Graphique + Top produits */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Graphique revenus 30 jours */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Revenus — 30 derniers jours</CardTitle>
          </CardHeader>
          <CardContent>
            {!formattedChart ? (
              <Skeleton className="h-48 w-full rounded-lg" />
            ) : formattedChart.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
                Aucune vente sur cette période
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={formattedChart}>
                  <defs>
                    <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f97316" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11 }}
                    className="text-muted-foreground"
                  />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    className="text-muted-foreground"
                    tickFormatter={(v) =>
                      v >= 1_000_000
                        ? `${(v / 1_000_000).toFixed(1)}M`
                        : v >= 1000
                        ? `${(v / 1000).toFixed(0)}k`
                        : String(v)
                    }
                  />
                  <Tooltip
                    formatter={(value) => [formatGNF(Number(value)), "Revenus"]}
                    labelClassName="font-medium"
                  />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke="#f97316"
                    strokeWidth={2}
                    fill="url(#colorRevenue)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Top produits */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top produits</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : !stats?.topProducts?.length ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Aucune vente ce mois
              </p>
            ) : (
              <div className="space-y-3">
                {stats.topProducts.map((p, i) => (
                  <div key={p.productId} className="flex items-center gap-3">
                    <span className="text-xs font-bold text-muted-foreground w-4">
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{p.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {p.totalQty} {p.unit}
                      </p>
                    </div>
                    <span className="text-xs font-semibold text-orange-600 shrink-0">
                      {formatGNF(p.totalRevenue)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Ventes récentes + clients */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Ventes récentes */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Ventes récentes</CardTitle>
            <Link
              href="/dashboard/commerce/sales"
              className="text-xs text-orange-600 hover:underline font-medium"
            >
              Voir tout
            </Link>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : !stats?.recentSales?.length ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Aucune vente aujourd&apos;hui
              </p>
            ) : (
              <div className="space-y-2">
                {stats.recentSales.map((sale: any) => (
                  <div
                    key={sale.id}
                    className="flex items-center justify-between py-2 border-b last:border-0"
                  >
                    <div>
                      <p className="text-sm font-medium">{sale.receiptNumber}</p>
                      <p className="text-xs text-muted-foreground">
                        {sale.customer?.name ?? "Client anonyme"} •{" "}
                        {format(new Date(sale.createdAt), "HH:mm")}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold">
                        {formatGNF(sale.totalAmount)}
                      </p>
                      <Badge
                        variant="outline"
                        className={
                          sale.status === "COMPLETED"
                            ? "text-emerald-600 border-emerald-200 text-[10px]"
                            : sale.status === "PARTIAL"
                            ? "text-amber-600 border-amber-200 text-[10px]"
                            : "text-red-600 border-red-200 text-[10px]"
                        }
                      >
                        {sale.status === "COMPLETED"
                          ? "Payé"
                          : sale.status === "PARTIAL"
                          ? "Partiel"
                          : "Annulé"}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Raccourcis rapides */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Accès rapide</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              {[
                {
                  href: "/dashboard/commerce/pos",
                  icon: ShoppingCart,
                  label: "Ouvrir la caisse",
                  color: "bg-orange-50 hover:bg-orange-100 border-orange-200 text-orange-700",
                },
                {
                  href: "/dashboard/commerce/products",
                  icon: Package,
                  label: "Gérer les produits",
                  color: "bg-blue-50 hover:bg-blue-100 border-blue-200 text-blue-700",
                },
                {
                  href: "/dashboard/commerce/customers",
                  icon: Users,
                  label: "Voir les clients",
                  color: "bg-emerald-50 hover:bg-emerald-100 border-emerald-200 text-emerald-700",
                },
                {
                  href: "/dashboard/commerce/sales",
                  icon: TrendingUp,
                  label: "Historique ventes",
                  color: "bg-purple-50 hover:bg-purple-100 border-purple-200 text-purple-700",
                },
              ].map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-all duration-200 active:scale-95 ${item.color}`}
                >
                  <item.icon className="h-6 w-6" />
                  <span className="text-xs font-medium text-center leading-tight">
                    {item.label}
                  </span>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
