'use client';

import { useEffect, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { RefreshCw, TrendingUp, TrendingDown, DollarSign, Users } from 'lucide-react';
import { toast } from 'sonner';
import { getFinanceStats, type FinanceStats } from '@/lib/api';

// Recharts lazy-loaded
const RevenueChart = dynamic(() => import('@/components/RevenueChart'), {
  ssr: false,
  loading: () => <div className="skeleton h-64 rounded-xl" />,
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtGNF(n: number): string {
  if (n === 0) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace('.0', '')} M GNF`;
  if (n >= 1_000)     return `${Math.round(n / 1_000)} k GNF`;
  return `${n} GNF`;
}

/** Formate "2025-09" → "Sept. 25" */
function fmtMonth(key: string): string {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
}

const PLAN_COLORS: Record<string, string> = {
  FREE:     'bg-gray-100 text-gray-600',
  PRO:      'bg-blue-100 text-blue-700',
  PRO_PLUS: 'bg-purple-100 text-purple-700',
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FinancePage() {
  const [data,       setData]       = useState<FinanceStats | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true); else setLoading(true);
    try {
      setData(await getFinanceStats());
    } catch {
      toast.error('Impossible de charger les statistiques financières');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Calcul variation MoM (mois sur mois)
  const lastTwo  = data?.monthly.slice(-2) ?? [];
  const prev     = lastTwo[0]?.revenue ?? 0;
  const curr     = lastTwo[1]?.revenue ?? 0;
  const momDelta = prev > 0 ? ((curr - prev) / prev) * 100 : 0;

  return (
    <div className="max-w-5xl mx-auto px-6 md:px-8 py-8 space-y-6">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Finance</h1>
          <p className="text-sm text-gray-500 mt-1">Revenus Structura — abonnements PRO / PRO+ via Djomy</p>
        </div>
        <button
          onClick={() => load(true)}
          disabled={refreshing}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 bg-white border
                     border-gray-200 hover:border-gray-300 px-3 py-2 rounded-xl shadow-sm transition active:scale-95 disabled:opacity-40"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          Actualiser
        </button>
      </div>

      {/* ── KPIs ────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 animate-fade-in-up anim-delay-1">
        {[
          {
            label: 'Revenue total',
            value: loading ? '…' : fmtGNF(data?.totals.allTime ?? 0),
            icon:  DollarSign, iconBg: 'bg-amber-50', iconColor: 'text-amber-600',
            sub: null,
          },
          {
            label: 'Ce mois',
            value: loading ? '…' : fmtGNF(data?.totals.thisMonth ?? 0),
            icon:  TrendingUp, iconBg: 'bg-emerald-50', iconColor: 'text-emerald-600',
            sub: prev > 0
              ? `${momDelta >= 0 ? '+' : ''}${momDelta.toFixed(1)}% vs mois précédent`
              : null,
          },
          {
            label: 'Tenants payants',
            value: loading ? '…' : String(data?.payingTenants ?? 0),
            icon:  Users, iconBg: 'bg-sky-50', iconColor: 'text-sky-600',
            sub: null,
          },
          {
            label: 'Tendance MoM',
            value: loading ? '…' : `${momDelta >= 0 ? '+' : ''}${momDelta.toFixed(1)}%`,
            icon:  momDelta >= 0 ? TrendingUp : TrendingDown,
            iconBg:    momDelta >= 0 ? 'bg-emerald-50' : 'bg-red-50',
            iconColor: momDelta >= 0 ? 'text-emerald-600' : 'text-red-500',
            sub: null,
          },
        ].map(({ label, value, icon: Icon, iconBg, iconColor, sub }) => (
          <div key={label} className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="flex items-start justify-between mb-3">
              <p className="text-xs font-semibold tracking-wider uppercase text-gray-500">{label}</p>
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${iconBg}`}>
                <Icon className={`w-4 h-4 ${iconColor}`} />
              </div>
            </div>
            {loading
              ? <div className="skeleton h-8 w-24 rounded-lg" />
              : <p className="text-2xl font-bold text-gray-900 leading-none">{value}</p>
            }
            {sub && !loading && (
              <p className={`text-xs mt-2 font-medium ${momDelta >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                {sub}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* ── Graphe revenus 12 mois ───────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 animate-fade-in-up anim-delay-2">
        <div className="mb-5">
          <h2 className="text-base font-semibold text-gray-900">Revenus mensuels (12 derniers mois)</h2>
          <p className="text-xs text-gray-500 mt-0.5">Abonnements confirmés via Djomy (statut SUCCESS)</p>
        </div>
        {loading
          ? <div className="skeleton h-64 rounded-xl" />
          : <RevenueChart data={(data?.monthly ?? []).map((m) => ({ month: fmtMonth(m.month), revenue: m.revenue }))} />
        }
      </div>

      {/* ── Répartition par plan ─────────────────────────────────────────────── */}
      {!loading && (data?.byPlan ?? []).length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 animate-fade-in-up anim-delay-3">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Revenus par plan d'abonnement</h2>
          <div className="space-y-3">
            {(data?.byPlan ?? [])
              .sort((a, b) => b.revenue - a.revenue)
              .map(({ plan, revenue }) => {
                const total = (data?.totals.allTime ?? 0) || 1;
                const pct = Math.round((revenue / total) * 100);
                return (
                  <div key={plan}>
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-lg ${PLAN_COLORS[plan] ?? 'bg-gray-100 text-gray-600'}`}>
                        {plan}
                      </span>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-gray-600">{pct}%</span>
                        <span className="text-sm font-bold text-gray-900">{fmtGNF(revenue)}</span>
                      </div>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-brand-400 rounded-full transition-all duration-700"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* ── Table revenus mensuels ───────────────────────────────────────────── */}
      {!loading && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden animate-fade-in-up anim-delay-4">
          <div className="px-6 py-4 border-b border-gray-50">
            <h2 className="text-base font-semibold text-gray-900">Détail mensuel</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide">Mois</th>
                  <th className="text-right px-6 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide">Revenus</th>
                  <th className="text-right px-6 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide">Variation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {[...(data?.monthly ?? [])].reverse().map((m, i, arr) => {
                  const prev = arr[i + 1]?.revenue ?? null;
                  const delta = prev != null && prev > 0 ? ((m.revenue - prev) / prev) * 100 : null;
                  return (
                    <tr key={m.month} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-3.5 font-medium text-gray-900">{fmtMonth(m.month)}</td>
                      <td className="px-6 py-3.5 text-right font-bold text-gray-900">{fmtGNF(m.revenue)}</td>
                      <td className="px-6 py-3.5 text-right">
                        {delta != null ? (
                          <span className={`text-xs font-semibold ${delta >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                            {delta >= 0 ? '+' : ''}{delta.toFixed(1)}%
                          </span>
                        ) : (
                          <span className="text-gray-400 text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
