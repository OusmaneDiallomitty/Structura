"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import * as storage from "@/lib/storage";
import {
  getCommerceDashboard,
  getRevenueChart,
  getCommerceAnalytics,
  type CommerceDashboardStats,
  type CommerceChartRow,
} from "@/lib/api/commerce.service";
import {
  TrendingUp,
  ShoppingCart,
  Package,
  Users,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  Banknote,
  Clock,
  Sparkles,
  TrendingDown,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  Receipt,
  CircleDollarSign,
  Wallet,
  BarChart3,
  Info,
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
  Legend,
} from "recharts";
import Link from "next/link";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { useState } from "react";

// ─── Formatage ────────────────────────────────────────────────────────────────

const _gnf = new Intl.NumberFormat("fr-GN", { style: "decimal", minimumFractionDigits: 0 });
function formatGNF(amount: number) {
  return _gnf.format(Math.round(amount)) + " GNF";
}
function formatGNFShort(n: number) {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M GNF`;
  if (Math.abs(n) >= 1_000)     return `${(n / 1_000).toFixed(0)}k GNF`;
  return formatGNF(n);
}
function formatPct(n: number) {
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
}

// ─── Composants utilitaires ───────────────────────────────────────────────────

function StatCardSkeleton() {
  return (
    <Card>
      <CardContent className="p-5">
        <Skeleton className="h-9 w-9 rounded-xl mb-3" />
        <Skeleton className="h-7 w-32 mb-1.5" />
        <Skeleton className="h-4 w-24" />
      </CardContent>
    </Card>
  );
}

function Trend({ pct }: { pct: number | null }) {
  if (pct === null) return null;
  const pos = pct >= 0;
  return (
    <span className={`flex items-center gap-0.5 text-xs font-semibold ${pos ? "text-emerald-600" : "text-red-500"}`}>
      {pos ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
      {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

interface StatCardProps {
  title: string;
  value: string;
  sub?: string;
  icon: React.ComponentType<{ className?: string }>;
  iconBg: string;
  trend?: number | null;
  trendLabel?: string;
  highlight?: "positive" | "negative" | "neutral";
  tooltip?: string;
  health?: { label: string; bg: string; text: string };
}

function StatCard({ title, value, sub, icon: Icon, iconBg, trend, trendLabel, highlight, tooltip, health }: StatCardProps) {
  const [showTip, setShowTip] = useState(false);
  const borderClass =
    highlight === "positive" ? "border-l-4 border-l-emerald-400" :
    highlight === "negative" ? "border-l-4 border-l-red-400" : "";

  return (
    <Card className={`hover:shadow-md transition-shadow relative ${borderClass}`}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className={`p-2 rounded-xl ${iconBg}`}>
            <Icon className="h-4 w-4 text-white" />
          </div>
          <div className="flex items-center gap-2">
            {trend !== undefined && <Trend pct={trend ?? null} />}
            {tooltip && (
              <div className="relative">
                <button
                  onClick={() => setShowTip((v) => !v)}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  <HelpCircle className="h-3.5 w-3.5" />
                </button>
                {showTip && (
                  <>
                    {/* Overlay transparent pour fermer en cliquant ailleurs */}
                    <div className="fixed inset-0 z-40" onClick={() => setShowTip(false)} />
                    <div className="absolute right-0 bottom-full mb-2 z-50 w-64 p-3 bg-white dark:bg-gray-900 border rounded-xl shadow-xl text-xs text-foreground/85 leading-relaxed">
                      {tooltip}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
        <p className="text-2xl font-bold text-foreground leading-none">{value}</p>
        <p className="text-sm font-medium text-foreground/75 mt-1.5">{title}</p>
        {sub && <p className="text-xs text-foreground/60 mt-0.5">{sub}</p>}
        {health && (
          <span className={`inline-block mt-2 px-2 py-0.5 rounded-full text-[11px] font-semibold ${health.bg} ${health.text}`}>
            {health.label}
          </span>
        )}
        {trendLabel && <p className="text-[10px] text-foreground/50 mt-1">{trendLabel}</p>}
      </CardContent>
    </Card>
  );
}

// ─── Explication concept ──────────────────────────────────────────────────────

function ConceptCard({ icon: Icon, color, title, formula, description }: {
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  title: string;
  formula: string;
  description: string;
}) {
  return (
    <div className="flex gap-3 p-4 rounded-xl border bg-card">
      <div className={`p-2 rounded-lg ${color} shrink-0 h-fit`}>
        <Icon className="h-4 w-4 text-white" />
      </div>
      <div>
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs text-orange-600 font-mono mt-0.5">{formula}</p>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{description}</p>
      </div>
    </div>
  );
}

// ─── Indicateurs de santé business ───────────────────────────────────────────

function grossProfitHealth(profit: number, marginPct: number | null) {
  if (profit < 0)       return { label: "⚠️ Vente à perte !", bg: "bg-red-100", text: "text-red-700" };
  if (profit === 0)     return { label: "Aucune vente", bg: "bg-gray-100", text: "text-gray-500" };
  if (marginPct === null) return { label: "Rentable ✓", bg: "bg-emerald-100", text: "text-emerald-700" };
  if (marginPct < 10)   return { label: "⚠️ Marge très faible", bg: "bg-orange-100", text: "text-orange-700" };
  if (marginPct < 20)   return { label: "Marge correcte", bg: "bg-amber-100", text: "text-amber-700" };
  if (marginPct < 35)   return { label: "Bonne marge ✓", bg: "bg-emerald-100", text: "text-emerald-700" };
  return                       { label: "Excellente marge ✓", bg: "bg-emerald-100", text: "text-emerald-700" };
}

function netProfitHealth(profit: number) {
  if (profit < 0)   return { label: "⚠️ Journée déficitaire", bg: "bg-red-100", text: "text-red-700" };
  if (profit === 0) return { label: "À l'équilibre", bg: "bg-gray-100", text: "text-gray-500" };
  return                   { label: "Journée rentable ✓", bg: "bg-emerald-100", text: "text-emerald-700" };
}

// ─── Page principale ──────────────────────────────────────────────────────────

const CACHE_KEY = (tid: string) => `structura_commerce_dashboard:${tid}`;

export default function CommerceDashboardPage() {
  const { user } = useAuth();
  const [showExplainer, setShowExplainer] = useState(false);
  const [topTab, setTopTab] = useState<"revenue" | "profit">("revenue");
  const [chartDays, setChartDays] = useState(30);

  const { data: stats, isLoading } = useQuery({
    queryKey: ["commerce-dashboard", user?.tenantId],
    queryFn: async () => {
      const token = storage.getAuthItem("structura_token");
      if (!token) throw new Error("Non authentifié");
      const data = await getCommerceDashboard(token);
      try { localStorage.setItem(CACHE_KEY(user!.tenantId), JSON.stringify(data)); } catch {}
      return data;
    },
    placeholderData: (): CommerceDashboardStats | undefined => {
      try {
        const c = localStorage.getItem(CACHE_KEY(user?.tenantId ?? ""));
        return c ? JSON.parse(c) : undefined;
      } catch { return undefined; }
    },
    enabled: !!user,
    staleTime: 60_000,
    gcTime: 10 * 60_000,
  });

  const { data: chartRaw } = useQuery({
    queryKey: ["commerce-chart", user?.tenantId, chartDays],
    queryFn: async () => {
      const token = storage.getAuthItem("structura_token");
      if (!token) throw new Error("Non authentifié");
      return getRevenueChart(token, chartDays);
    },
    enabled: !!user,
    staleTime: 300_000,
  });

  const { data: analytics } = useQuery({
    queryKey: ["commerce-analytics", user?.tenantId],
    queryFn: async () => {
      const token = storage.getAuthItem("structura_token");
      if (!token) throw new Error("Non authentifié");
      return getCommerceAnalytics(token);
    },
    enabled: !!user,
    staleTime: 300_000,
  });

  const chartData = (chartRaw ?? []).map((row: CommerceChartRow) => ({
    ...row,
    date: format(new Date(row.date), "dd MMM", { locale: fr }),
  }));

  const showSetupBanner = !isLoading && stats && (stats.inventory?.totalProducts ?? 0) === 0;

  // Calcul marge %
  const todayMarginPct = (stats?.today.revenue ?? 0) > 0
    ? ((stats!.today.grossProfit) / stats!.today.revenue) * 100
    : null;
  const monthMarginPct = (stats?.month.revenue ?? 0) > 0
    ? ((stats!.month.grossProfit) / stats!.month.revenue) * 100
    : null;

  const topByProfit = [...(stats?.topProducts ?? [])].sort((a, b) => b.grossProfit - a.grossProfit);

  return (
    <div className="p-4 md:p-6 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* Bannière setup */}
      {showSetupBanner && (
        <Link
          href="/dashboard/commerce/setup-catalog"
          className="flex items-center gap-4 p-5 rounded-2xl bg-linear-to-r from-orange-500 to-orange-600 text-white hover:from-orange-600 hover:to-orange-700 transition-all shadow-lg shadow-orange-200 dark:shadow-none"
        >
          <div className="shrink-0 h-12 w-12 rounded-xl bg-white/20 flex items-center justify-center">
            <Sparkles className="h-6 w-6" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-lg">Configurer votre catalogue</p>
            <p className="text-orange-100 text-sm">Choisissez votre secteur et importez vos produits en quelques clics</p>
          </div>
          <ArrowUpRight className="h-6 w-6 shrink-0" />
        </Link>
      )}

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Tableau de bord</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {format(new Date(), "EEEE dd MMMM yyyy", { locale: fr })}
          </p>
        </div>
        <Link
          href="/dashboard/commerce/pos"
          className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-sm font-medium transition-colors shadow-sm"
        >
          <ShoppingCart className="h-4 w-4" />
          Ouvrir la caisse
        </Link>
      </div>

      {/* Alertes */}
      {((stats?.inventory.lowStockCount ?? 0) > 0 || (analytics?.alerts.lowMarginProducts.length ?? 0) > 0) && (
        <div className="space-y-2">
          {(stats?.inventory.lowStockCount ?? 0) > 0 && (
            <Link href="/dashboard/commerce/products" className="flex items-center gap-3 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 hover:bg-amber-100 transition-colors">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
              <p className="text-sm text-amber-800 dark:text-amber-200 font-medium">
                {stats!.inventory.lowStockCount} produit{stats!.inventory.lowStockCount > 1 ? "s" : ""} proche{stats!.inventory.lowStockCount > 1 ? "s" : ""} de la rupture de stock
              </p>
              <ArrowUpRight className="h-4 w-4 text-amber-600 ml-auto shrink-0" />
            </Link>
          )}
          {(analytics?.alerts.lowMarginProducts.length ?? 0) > 0 && (
            <div className="flex items-start gap-3 p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
              <TrendingDown className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-red-800 dark:text-red-200 font-medium">
                  {analytics!.alerts.lowMarginProducts.length} produit{analytics!.alerts.lowMarginProducts.length > 1 ? "s" : ""} à faible marge ce mois
                </p>
                <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">
                  {analytics!.alerts.lowMarginProducts.map((p) => p.name).join(", ")}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── AUJOURD'HUI ─────────────────────────────────────────────────────── */}
      <section>
        <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">Aujourd'hui</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {isLoading ? Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />) : (
            <>
              <StatCard
                title="Chiffre d'affaires"
                value={formatGNF(stats?.today.revenue ?? 0)}
                sub={`${stats?.today.salesCount ?? 0} vente${(stats?.today.salesCount ?? 0) > 1 ? "s" : ""}`}
                icon={Receipt}
                iconBg="bg-orange-500"
                tooltip="Le total de ce que vos clients ont acheté aujourd'hui, qu'ils aient payé comptant ou à crédit."
              />
              <StatCard
                title="Bénéfice brut"
                value={formatGNF(stats?.today.grossProfit ?? 0)}
                sub={todayMarginPct !== null ? `Marge : ${todayMarginPct.toFixed(1)}%` : undefined}
                icon={TrendingUp}
                iconBg={(stats?.today.grossProfit ?? 0) >= 0 ? "bg-emerald-500" : "bg-red-500"}
                highlight={(stats?.today.grossProfit ?? 0) >= 0 ? "positive" : "negative"}
                tooltip="Ce qu'il vous reste après avoir retiré le prix d'achat des produits vendus. C'est votre vrai gain avant les dépenses du commerce. Si ce chiffre est négatif, vous vendez à perte !"
                health={grossProfitHealth(stats?.today.grossProfit ?? 0, todayMarginPct)}
              />
              <StatCard
                title="Bénéfice net"
                value={formatGNF(stats?.today.netProfit ?? 0)}
                sub={`Dépenses : ${formatGNF(stats?.today.expenses ?? 0)}`}
                icon={CircleDollarSign}
                iconBg={(stats?.today.netProfit ?? 0) >= 0 ? "bg-blue-500" : "bg-red-500"}
                highlight={(stats?.today.netProfit ?? 0) >= 0 ? "positive" : "negative"}
                tooltip="Votre gain réel après avoir soustrait toutes les dépenses du jour (loyer au prorata, électricité, salaires...). C'est ce qui reste vraiment dans votre poche."
                health={netProfitHealth(stats?.today.netProfit ?? 0)}
              />
              <StatCard
                title="Encaissé"
                value={formatGNF(stats?.today.collected ?? 0)}
                sub={`Créances : ${formatGNF(stats?.today.debt ?? 0)}`}
                icon={Banknote}
                iconBg="bg-violet-500"
                tooltip="L'argent réellement reçu en espèces ou mobile money. Les ventes à crédit ne sont pas comptées ici."
              />
            </>
          )}
        </div>
      </section>

      {/* ── CE MOIS ─────────────────────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Ce mois</h2>
          {analytics && (
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span>vs sem. dernière :</span>
              <Trend pct={analytics.week.revenueChange} />
              <span className="text-muted-foreground/50">CA</span>
              <Trend pct={analytics.week.profitChange} />
              <span className="text-muted-foreground/50">bénéfice</span>
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {isLoading ? Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />) : (
            <>
              <StatCard
                title="Chiffre d'affaires"
                value={formatGNF(stats?.month.revenue ?? 0)}
                sub={`${stats?.month.salesCount ?? 0} ventes`}
                icon={BarChart3}
                iconBg="bg-orange-500"
              />
              <StatCard
                title="Bénéfice brut"
                value={formatGNF(stats?.month.grossProfit ?? 0)}
                sub={monthMarginPct !== null ? `Marge : ${monthMarginPct.toFixed(1)}%` : undefined}
                icon={TrendingUp}
                iconBg={(stats?.month.grossProfit ?? 0) >= 0 ? "bg-emerald-500" : "bg-red-500"}
                highlight={(stats?.month.grossProfit ?? 0) >= 0 ? "positive" : "negative"}
                health={grossProfitHealth(stats?.month.grossProfit ?? 0, monthMarginPct)}
              />
              <StatCard
                title="Bénéfice net"
                value={formatGNF(stats?.month.netProfit ?? 0)}
                sub={`Dépenses : ${formatGNF(stats?.month.expenses ?? 0)}`}
                icon={CircleDollarSign}
                iconBg={(stats?.month.netProfit ?? 0) >= 0 ? "bg-blue-500" : "bg-red-500"}
                highlight={(stats?.month.netProfit ?? 0) >= 0 ? "positive" : "negative"}
                health={netProfitHealth(stats?.month.netProfit ?? 0)}
              />
              <StatCard
                title="Dettes clients"
                value={formatGNF(stats?.month.remainingDebt ?? 0)}
                sub="Montants non encaissés"
                icon={Clock}
                iconBg={(stats?.month.remainingDebt ?? 0) > 0 ? "bg-amber-500" : "bg-gray-400"}
                tooltip="Ventes faites à crédit qui n'ont pas encore été payées. Allez dans 'Dettes clients' pour les récupérer."
              />
            </>
          )}
        </div>
      </section>

      {/* ── COMPRENDRE VOS CHIFFRES ──────────────────────────────────────────── */}
      <section>
        <button
          onClick={() => setShowExplainer((v) => !v)}
          className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors w-full text-left"
        >
          <Info className="h-4 w-4 text-orange-500" />
          Comprendre vos indicateurs
          {showExplainer ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
        </button>

        {showExplainer && (
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <ConceptCard
              icon={Receipt}
              color="bg-orange-500"
              title="Chiffre d'affaires (Recette)"
              formula="= Prix de vente × Quantités vendues"
              description="Tout ce que vos clients vous ont payé ou doivent payer. Ce n'est pas encore votre bénéfice — il faut d'abord enlever ce que vous avez dépensé pour avoir les produits."
            />
            <ConceptCard
              icon={Package}
              color="bg-gray-500"
              title="Coût des marchandises"
              formula="= Prix d'achat fournisseur × Quantités vendues"
              description="Ce que vous avez payé pour acheter les produits que vous avez revendus. Si vous achetez un article à 10 000 GNF et le revendez à 15 000, votre coût marchandise est 10 000."
            />
            <ConceptCard
              icon={TrendingUp}
              color="bg-emerald-500"
              title="Bénéfice brut"
              formula="= Chiffre d'affaires − Coût marchandises"
              description="Ce qui reste après avoir payé vos fournisseurs. C'est votre marge commerciale. Si ce chiffre est négatif, vous vendez à perte !"
            />
            <ConceptCard
              icon={Wallet}
              color="bg-red-500"
              title="Dépenses"
              formula="= Loyer + Électricité + Salaires + Autres"
              description="Tous vos frais de fonctionnement qui ne sont pas liés à l'achat des produits. Enregistrez-les dans la section 'Dépenses' pour avoir un bénéfice net exact."
            />
            <ConceptCard
              icon={CircleDollarSign}
              color="bg-blue-500"
              title="Bénéfice net"
              formula="= Bénéfice brut − Dépenses"
              description="Ce qui reste vraiment dans votre poche à la fin. C'est le chiffre le plus important : il montre si votre commerce est rentable après toutes les charges."
            />
            <ConceptCard
              icon={BarChart3}
              color="bg-violet-500"
              title="Marge (%)"
              formula="= Bénéfice brut ÷ Chiffre d'affaires × 100"
              description="Le pourcentage de profit sur chaque vente. Une marge de 30% signifie que pour 10 000 GNF vendus, 3 000 GNF est votre gain avant dépenses. Visez au minimum 20-30%."
            />
          </div>
        )}
      </section>

      {/* ── GRAPHIQUE ───────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-base">Évolution sur {chartDays} jours</CardTitle>
            <div className="flex gap-1">
              {[7, 30, 90].map((d) => (
                <button
                  key={d}
                  onClick={() => setChartDays(d)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${chartDays === d ? "bg-orange-500 text-white" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
                >
                  {d}j
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <div className="h-52 flex items-center justify-center text-muted-foreground text-sm">
              Aucune vente sur cette période
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="gRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f97316" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gProfit" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gExpenses" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} className="text-muted-foreground" />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={formatGNFShort} width={60} className="text-muted-foreground" />
                <Tooltip
                  formatter={(value, name) => [
                    formatGNF(Number(value)),
                    name === "revenue" ? "Recette" : name === "grossProfit" ? "Bénéfice brut" : "Dépenses",
                  ]}
                  labelClassName="font-medium text-foreground"
                />
                <Legend
                  formatter={(value) =>
                    value === "revenue" ? "Recette" : value === "grossProfit" ? "Bénéfice brut" : "Dépenses"
                  }
                  wrapperStyle={{ fontSize: 11 }}
                />
                <Area type="monotone" dataKey="revenue"     stroke="#f97316" strokeWidth={2} fill="url(#gRevenue)"  />
                <Area type="monotone" dataKey="grossProfit" stroke="#22c55e" strokeWidth={2} fill="url(#gProfit)"   />
                <Area type="monotone" dataKey="expenses"    stroke="#ef4444" strokeWidth={1.5} fill="url(#gExpenses)" strokeDasharray="4 2" />
              </AreaChart>
            </ResponsiveContainer>
          )}
          <p className="text-[10px] text-muted-foreground/70 mt-2 text-center">
            Zone verte = bénéfice brut • Zone orange = chiffre d'affaires • Ligne rouge = dépenses
          </p>
        </CardContent>
      </Card>

      {/* ── TOP PRODUITS ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Top produits</CardTitle>
              <div className="flex gap-1">
                <button
                  onClick={() => setTopTab("revenue")}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${topTab === "revenue" ? "bg-orange-500 text-white" : "bg-muted text-muted-foreground"}`}
                >
                  Par CA
                </button>
                <button
                  onClick={() => setTopTab("profit")}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${topTab === "profit" ? "bg-emerald-500 text-white" : "bg-muted text-muted-foreground"}`}
                >
                  Par bénéfice
                </button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {topTab === "revenue"
                ? "Les produits qui génèrent le plus de ventes ce mois"
                : "Les produits qui vous rapportent le plus de bénéfice réel"}
            </p>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
            ) : !(stats?.topProducts?.length) ? (
              <p className="text-sm text-muted-foreground text-center py-8">Aucune vente ce mois</p>
            ) : (
              <div className="space-y-2">
                {(topTab === "revenue" ? stats!.topProducts : topByProfit).map((p, i) => {
                  const margin = p.totalRevenue > 0 ? (p.grossProfit / p.totalRevenue) * 100 : null;
                  return (
                    <div key={p.productId} className="flex items-center gap-3 py-2 border-b last:border-0">
                      <span className="text-xs font-bold text-muted-foreground w-5 shrink-0">#{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{p.name}</p>
                        <p className="text-xs text-muted-foreground">{p.totalQty} {p.unit}</p>
                      </div>
                      <div className="text-right shrink-0">
                        {topTab === "revenue" ? (
                          <>
                            <p className="text-sm font-semibold text-orange-600">{formatGNF(p.totalRevenue)}</p>
                            <p className="text-[10px] text-emerald-600">+{formatGNF(p.grossProfit)} bén.</p>
                          </>
                        ) : (
                          <>
                            <p className="text-sm font-semibold text-emerald-600">{formatGNF(p.grossProfit)}</p>
                            {margin !== null && (
                              <p className={`text-[10px] ${margin >= 20 ? "text-emerald-600" : margin >= 10 ? "text-amber-600" : "text-red-500"}`}>
                                Marge {margin.toFixed(1)}%
                              </p>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Chiffres clés du mois */}
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-sm">Résumé du mois</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {isLoading ? (
                <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
              ) : (
                <>
                  {[
                    { label: "Recette totale",   value: stats?.month.revenue ?? 0,    color: "text-orange-600" },
                    { label: "Coût marchandises", value: stats?.month.cog ?? 0,        color: "text-gray-600",   prefix: "−" },
                    { label: "Bénéfice brut",     value: stats?.month.grossProfit ?? 0, color: "text-emerald-600" },
                    { label: "Dépenses",          value: stats?.month.expenses ?? 0,   color: "text-red-500",    prefix: "−" },
                    { label: "Bénéfice net",      value: stats?.month.netProfit ?? 0,  color: "text-blue-600",   bold: true },
                  ].map(({ label, value, color, prefix, bold }) => (
                    <div key={label} className="flex justify-between items-center text-sm">
                      <span className={`text-muted-foreground ${bold ? "font-semibold" : ""}`}>{label}</span>
                      <span className={`font-semibold ${color}`}>{prefix}{formatGNF(value)}</span>
                    </div>
                  ))}
                  {monthMarginPct !== null && (
                    <div className="flex justify-between items-center text-sm pt-2 border-t">
                      <span className="text-muted-foreground">Marge brute</span>
                      <Badge variant="outline" className={monthMarginPct >= 20 ? "border-emerald-300 text-emerald-700" : monthMarginPct >= 10 ? "border-amber-300 text-amber-700" : "border-red-300 text-red-700"}>
                        {monthMarginPct.toFixed(1)}%
                      </Badge>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm">Inventaire</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {isLoading ? <Skeleton className="h-16 w-full" /> : (
                <>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Produits actifs</span>
                    <span className="font-semibold">{stats?.inventory.totalProducts ?? 0}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Alerte stock bas</span>
                    <span className={`font-semibold ${(stats?.inventory.lowStockCount ?? 0) > 0 ? "text-amber-600" : "text-muted-foreground"}`}>
                      {stats?.inventory.lowStockCount ?? 0}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Clients enregistrés</span>
                    <span className="font-semibold">{stats?.totalCustomers ?? 0}</span>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── VENTES RÉCENTES + ACCÈS RAPIDE ──────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Ventes récentes</CardTitle>
            <Link href="/dashboard/commerce/sales" className="text-xs text-orange-600 hover:underline font-medium">
              Voir tout
            </Link>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
            ) : !stats?.recentSales?.length ? (
              <p className="text-sm text-muted-foreground text-center py-8">Aucune vente récente</p>
            ) : (
              <div className="space-y-2">
                {stats.recentSales.map((sale: any) => (
                  <div key={sale.id} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div>
                      <p className="text-sm font-medium">{sale.receiptNumber}</p>
                      <p className="text-xs text-muted-foreground">
                        {sale.customer?.name ?? "Anonyme"} • {format(new Date(sale.createdAt), "HH:mm")}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold">{formatGNF(sale.totalAmount)}</p>
                      <Badge variant="outline" className={
                        sale.status === "COMPLETED" ? "text-emerald-600 border-emerald-200 text-[10px]" :
                        sale.status === "PARTIAL"   ? "text-amber-600 border-amber-200 text-[10px]" :
                        "text-red-600 border-red-200 text-[10px]"
                      }>
                        {sale.status === "COMPLETED" ? "Payé" : sale.status === "PARTIAL" ? "Partiel" : "Annulé"}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Accès rapide</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              {[
                { href: "/dashboard/commerce/pos",          icon: ShoppingCart,      label: "Ouvrir la caisse",    color: "bg-orange-50 hover:bg-orange-100 border-orange-200 text-orange-700" },
                { href: "/dashboard/commerce/daily",         icon: BarChart3,         label: "Situation du jour",   color: "bg-blue-50 hover:bg-blue-100 border-blue-200 text-blue-700" },
                { href: "/dashboard/commerce/customers",     icon: Users,             label: "Clients & dettes",    color: "bg-emerald-50 hover:bg-emerald-100 border-emerald-200 text-emerald-700" },
                { href: "/dashboard/commerce/products",      icon: Package,           label: "Produits & stock",    color: "bg-violet-50 hover:bg-violet-100 border-violet-200 text-violet-700" },
                { href: "/dashboard/commerce/sales",         icon: Receipt,           label: "Historique ventes",   color: "bg-gray-50 hover:bg-gray-100 border-gray-200 text-gray-700" },
                { href: "/dashboard/commerce/expenses",      icon: Wallet,            label: "Dépenses",            color: "bg-red-50 hover:bg-red-100 border-red-200 text-red-700" },
              ].map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-all duration-200 active:scale-95 ${item.color}`}
                >
                  <item.icon className="h-5 w-5" />
                  <span className="text-xs font-medium text-center leading-tight">{item.label}</span>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
