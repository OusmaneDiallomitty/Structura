'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import {
  RefreshCw, AlertTriangle, CheckCircle2,
  ArrowRight, ArrowUpRight, TrendingUp, TrendingDown,
  Building2, Users, GraduationCap, Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  getGlobalStats, getAlerts, getActivity,
  type GlobalStats, type AlertsResponse, type ActivityResponse,
} from '@/lib/api';
import { formatDate } from '@/lib/utils';

// ─── Recharts lazy (économise ~80 kB au chargement initial) ──────────────────

const PlanChart = dynamic(() => import('@/components/PlanChart'), {
  ssr: false,
  loading: () => <div className="skeleton h-[150px] rounded-xl" />,
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Formate un montant en GNF avec unité (M / k) */
function fmtGNF(n: number): string {
  if (n === 0) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace('.0', '')} M GNF`;
  if (n >= 1_000)     return `${Math.round(n / 1_000)} k GNF`;
  return `${n} GNF`;
}

/** Séparateur de milliers */
function fmtNum(n: number): string {
  return new Intl.NumberFormat('fr-FR').format(n);
}

/** Intervalle auto-refresh : 5 minutes */
const AUTO_REFRESH_SEC = 5 * 60;

// ─── Composant KPI Card ───────────────────────────────────────────────────────

type Hue = 'green' | 'red' | 'amber' | 'sky' | 'gray';

const HUE: Record<Hue, string> = {
  green: 'text-emerald-700 bg-emerald-50 border-emerald-100',
  red:   'text-red-600    bg-red-50    border-red-100',
  amber: 'text-amber-700  bg-amber-50  border-amber-100',
  sky:   'text-sky-700    bg-sky-50    border-sky-100',
  gray:  'text-gray-500   bg-gray-50   border-gray-100',
};

function KpiCard({
  label, value, sub, hue = 'gray', icon, iconBg, progress, skeleton,
}: {
  label: string; value: string; sub?: string; hue?: Hue;
  icon: React.ReactNode; iconBg: string;
  progress?: number; skeleton?: boolean;
}) {
  if (skeleton) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <div className="skeleton h-3.5 w-20 rounded-lg mb-5" />
        <div className="skeleton h-10 w-24 rounded-lg mb-4" />
        <div className="skeleton h-5 w-28 rounded-full" />
      </div>
    );
  }
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 card-hover">
      <div className="flex items-start justify-between mb-4">
        <p className="text-xs font-semibold tracking-wider uppercase text-gray-500 leading-tight">
          {label}
        </p>
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${iconBg}`}>
          {icon}
        </div>
      </div>
      <p className="text-[2.25rem] font-bold leading-none tracking-tight text-gray-900">{value}</p>
      {progress !== undefined && (
        <div className="mt-3 h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-400 rounded-full transition-all duration-700"
            style={{ width: `${Math.max(progress, 2)}%` }}
          />
        </div>
      )}
      {sub && (
        <div className="mt-3">
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${HUE[hue]}`}>
            {sub}
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Badge action activité ────────────────────────────────────────────────────

const ACTION_META: Record<string, { label: string; cls: string }> = {
  NEW_TENANT:   { label: 'Nouvelle école',   cls: 'text-emerald-700 bg-emerald-50' },
  CREATE_TENANT:{ label: 'École créée',      cls: 'text-emerald-700 bg-emerald-50' },
  SUSPEND:      { label: 'Suspension',       cls: 'text-red-600    bg-red-50'      },
  ACTIVATE:     { label: 'Réactivation',     cls: 'text-blue-700   bg-blue-50'     },
  DELETE:       { label: 'Suppression',      cls: 'text-gray-600   bg-gray-100'    },
  IMPERSONATE:  { label: 'Accès temporaire', cls: 'text-purple-700 bg-purple-50'   },
  UPDATE_TENANT:{ label: 'Mise à jour',      cls: 'text-amber-700  bg-amber-50'    },
  UPDATE:       { label: 'Mise à jour',      cls: 'text-amber-700  bg-amber-50'    },
  EXTEND_TRIAL: { label: 'Trial prolongé',   cls: 'text-cyan-700   bg-cyan-50'     },
  SEND_REMINDER:{ label: 'Rappel envoyé',    cls: 'text-sky-700    bg-sky-50'      },
  LOGIN_ADMIN:  { label: 'Connexion admin',  cls: 'text-sky-700    bg-sky-50'      },
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [stats,      setStats]      = useState<GlobalStats | null>(null);
  const [alerts,     setAlerts]     = useState<AlertsResponse | null>(null);
  const [activity,   setActivity]   = useState<ActivityResponse | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated,   setLastUpdated]   = useState<Date>(new Date());
  const [nextRefresh,   setNextRefresh]   = useState(AUTO_REFRESH_SEC);

  const timerRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Chargement données réelles ─────────────────────────────────────────────
  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    try {
      const [s, a, act] = await Promise.all([
        getGlobalStats().catch(() => null),
        getAlerts().catch(() => null),
        getActivity({ page: 1, limit: 6 }).catch(() => null),
      ]);
      setStats(s); setAlerts(a); setActivity(act);
      setLastUpdated(new Date());
      setNextRefresh(AUTO_REFRESH_SEC);
    } catch {
      if (!silent) toast.error('Impossible de charger les données du tableau de bord');
    } finally {
      setLoading(false); setRefreshing(false);
    }
  }, []);

  // ── Auto-refresh 5 min + compte à rebours ──────────────────────────────────
  useEffect(() => {
    load();

    timerRef.current = setInterval(() => load(true), AUTO_REFRESH_SEC * 1000);

    countdownRef.current = setInterval(() => {
      setNextRefresh((n) => (n <= 1 ? AUTO_REFRESH_SEC : n - 1));
    }, 1000);

    return () => {
      clearInterval(timerRef.current!);
      clearInterval(countdownRef.current!);
    };
  }, [load]);

  // ── Métriques dérivées (aucune donnée mockée) ──────────────────────────────
  const total        = stats?.tenants.total        ?? 0;
  const active       = stats?.tenants.active       ?? 0;
  const trial        = stats?.tenants.trial        ?? 0;
  const inactive     = total - active;
  const newThisWeek  = stats?.tenants.newThisWeek  ?? 0;
  const newThisMonth = stats?.tenants.newThisMonth ?? 0;
  const churnCount   = stats?.churn.thisMonth      ?? 0;
  const urgentCount  = alerts?.counts.urgent       ?? 0;
  const warnCount    = alerts?.counts.warning      ?? 0;
  const totalAlerts  = alerts?.counts.total        ?? 0;

  const activeRate = total > 0 ? Math.round((active / total) * 100) : 0;
  const trialPct   = total > 0 ? Math.round((trial  / total) * 100) : 0;
  const inactPct   = total > 0 ? Math.round((inactive / total) * 100) : 0;

  // Taux de croissance mensuel basé sur la base avant ce mois
  const base       = Math.max(1, total - newThisMonth);
  const growthRate = ((newThisMonth / base) * 100).toFixed(1);

  const mrrValue   = fmtGNF(stats?.revenue.thisMonth ?? 0);
  const totalRevStr = fmtGNF(stats?.revenue.total ?? 0);

  // Sous-titre alertes
  const alertSub   = urgentCount > 0
    ? `${urgentCount} critique${urgentCount > 1 ? 's' : ''}`
    : warnCount > 0 ? `${warnCount} avertissement${warnCount > 1 ? 's' : ''}` : 'Tout est OK';
  const alertHue: Hue = urgentCount > 0 ? 'red' : warnCount > 0 ? 'amber' : 'green';

  const urgentItems = alerts?.urgent ?? [];
  const recentLogs  = activity?.data ?? [];

  // Compte à rebours formaté
  const mins = Math.floor(nextRefresh / 60);
  const secs = nextRefresh % 60;
  const countdownStr = mins > 0 ? `${mins}m ${String(secs).padStart(2, '0')}s` : `${secs}s`;

  return (
    <div className="max-w-6xl mx-auto px-6 md:px-8 py-8 space-y-5">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Vue d'ensemble</h1>
          <p className="text-sm text-gray-500 mt-1 capitalize">
            {format(new Date(), 'EEEE d MMMM yyyy', { locale: fr })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Compte à rebours auto-refresh */}
          <div className="hidden sm:flex items-center gap-1.5 text-xs text-gray-500 bg-white border border-gray-100 px-3 py-2 rounded-xl select-none">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
            {countdownStr}
          </div>
          <button
            onClick={() => load(true)} disabled={refreshing}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 bg-white border border-gray-200 hover:border-gray-300 px-3 py-2 rounded-xl shadow-sm transition-all active:scale-95 disabled:opacity-40"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:block">Actualiser</span>
          </button>
        </div>
      </div>

      {/* ── KPI Row ─────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 animate-fade-in-up anim-delay-1">
        <KpiCard skeleton={loading}
          label="Total écoles"
          value={fmtNum(total)}
          sub={`+${newThisWeek} cette semaine`}
          hue={newThisWeek > 0 ? 'green' : 'gray'}
          icon={<Building2 className="w-4 h-4 text-brand-600" />}
          iconBg="bg-brand-50"
        />
        <KpiCard skeleton={loading}
          label="Taux d'activité"
          value={`${activeRate}%`}
          sub={`${fmtNum(active)} actives · ${fmtNum(trial)} essai`}
          hue={activeRate >= 80 ? 'green' : activeRate >= 50 ? 'amber' : 'red'}
          icon={<Zap className="w-4 h-4 text-emerald-600" />}
          iconBg="bg-emerald-50"
          progress={activeRate}
        />
        <KpiCard skeleton={loading}
          label="MRR du mois"
          value={mrrValue}
          sub={churnCount === 0 ? 'Churn : 0 école' : `Churn : ${churnCount} école${churnCount > 1 ? 's' : ''}`}
          hue={churnCount === 0 ? 'green' : 'red'}
          icon={<TrendingUp className="w-4 h-4 text-amber-600" />}
          iconBg="bg-amber-50"
        />
        <KpiCard skeleton={loading}
          label="Alertes actives"
          value={fmtNum(totalAlerts)}
          sub={alertSub}
          hue={alertHue}
          icon={<AlertTriangle className={`w-4 h-4 ${urgentCount > 0 ? 'text-red-500' : 'text-gray-400'}`} />}
          iconBg={urgentCount > 0 ? 'bg-red-50' : 'bg-gray-50'}
        />
      </div>

      {/* ── Santé plateforme (barre stacked) ────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-6 py-5 animate-fade-in-up anim-delay-2">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-700">
            Santé de la plateforme
          </h2>
          {!loading && (
            <div className="flex items-center gap-5 text-xs text-gray-600">
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />Actives {activeRate}%</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-400 inline-block" />Essai {trialPct}%</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-gray-200 inline-block" />Inactives {inactPct}%</span>
            </div>
          )}
        </div>

        {loading ? (
          <div className="skeleton h-5 rounded-full" />
        ) : total === 0 ? (
          <div className="h-5 rounded-full bg-gray-100 flex items-center justify-center">
            <p className="text-xs text-gray-400">Aucune école enregistrée</p>
          </div>
        ) : (
          <div className="h-5 rounded-full overflow-hidden flex gap-0.5 bg-gray-100">
            {active > 0 && (
              <div className="h-full bg-emerald-400 transition-all duration-700"
                style={{ width: `${(active / total) * 100}%` }}
                title={`${active} actives`} />
            )}
            {trial > 0 && (
              <div className="h-full bg-blue-400 transition-all duration-700"
                style={{ width: `${(trial / total) * 100}%` }}
                title={`${trial} en essai`} />
            )}
            {inactive > 0 && (
              <div className="h-full bg-gray-300 transition-all duration-700"
                style={{ width: `${(inactive / total) * 100}%` }}
                title={`${inactive} inactives`} />
            )}
          </div>
        )}

        {!loading && total > 0 && (
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-4 mt-5 pt-4 border-t border-gray-50">
            {[
              { label: 'Total écoles',        value: fmtNum(total)                              },
              { label: 'Nouvelles ce mois',   value: `+${newThisMonth}`                         },
              { label: 'Croissance',          value: `+${growthRate}%`                          },
              { label: 'Utilisateurs',        value: fmtNum(stats?.users.total    ?? 0)          },
              { label: 'Élèves',              value: fmtNum(stats?.students.total ?? 0)          },
              { label: 'Revenue total',       value: totalRevStr                                 },
            ].map(({ label, value }) => (
              <div key={label}>
                <p className="text-xs font-medium text-gray-500">{label}</p>
                <p className="text-lg font-bold text-gray-900 mt-0.5">{value}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Plans + Métriques ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 animate-fade-in-up anim-delay-3">

        {/* Répartition plans — Recharts lazy */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="mb-5">
            <h2 className="text-base font-semibold text-gray-900">Plans d'abonnement</h2>
            <p className="text-xs text-gray-600 mt-0.5">
              {loading ? '…' : `Répartition sur ${fmtNum(total)} école${total !== 1 ? 's' : ''}`}
            </p>
          </div>
          {loading
            ? <div className="skeleton h-[150px] rounded-xl" />
            : <PlanChart data={stats?.tenants.byPlan ?? []} />
          }
        </div>

        {/* Indicateurs clés */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Indicateurs clés</h2>
          {loading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => <div key={i} className="skeleton h-11 rounded-xl" />)}
            </div>
          ) : (
            <div className="space-y-2.5">
              {[
                {
                  label: 'Utilisateurs actifs',
                  value: fmtNum(stats?.users.total ?? 0),
                  icon: Users,
                  color: 'text-brand-600', bg: 'bg-brand-50',
                },
                {
                  label: 'Élèves inscrits',
                  value: fmtNum(stats?.students.total ?? 0),
                  icon: GraduationCap,
                  color: 'text-emerald-600', bg: 'bg-emerald-50',
                },
                {
                  label: 'Revenue total cumulé',
                  value: totalRevStr,
                  icon: TrendingUp,
                  color: 'text-amber-600', bg: 'bg-amber-50',
                },
                {
                  label: 'Croissance ce mois',
                  value: `+${newThisMonth} école${newThisMonth > 1 ? 's' : ''} (+${growthRate}%)`,
                  icon: newThisMonth > 0 ? TrendingUp : TrendingDown,
                  color: newThisMonth > 0 ? 'text-emerald-600' : 'text-gray-400',
                  bg:   newThisMonth > 0 ? 'bg-emerald-50'    : 'bg-gray-50',
                },
                {
                  label: 'Churn ce mois',
                  value: churnCount === 0 ? 'Aucun' : `${churnCount} école${churnCount > 1 ? 's' : ''}`,
                  icon: churnCount === 0 ? CheckCircle2 : TrendingDown,
                  color: churnCount === 0 ? 'text-emerald-600' : 'text-red-500',
                  bg:   churnCount === 0 ? 'bg-emerald-50'     : 'bg-red-50',
                },
              ].map(({ label, value, icon: Icon, color, bg }) => (
                <div key={label}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-gray-50/60 border border-gray-50">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${bg}`}>
                    <Icon className={`w-3.5 h-3.5 ${color}`} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-gray-500 leading-tight">{label}</p>
                    <p className="text-sm font-bold text-gray-900 leading-tight truncate">{value}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Alertes urgentes + Activité récente ─────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 animate-fade-in-up anim-delay-4">

        {/* Alertes urgentes */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
            <div className="flex items-center gap-2">
              <span className="text-base font-semibold text-gray-900">Alertes urgentes</span>
              {!loading && urgentCount > 0 && (
                <span className="text-xs font-bold bg-red-50 text-red-500 border border-red-100 px-2 py-0.5 rounded-full">
                  {urgentCount}
                </span>
              )}
            </div>
            <Link href="/dashboard/alerts"
              className="flex items-center gap-1 text-xs font-medium text-gray-400 hover:text-brand-600 transition">
              Voir toutes <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {loading ? (
            <div className="p-4 space-y-3">
              {[...Array(3)].map((_, i) => <div key={i} className="skeleton h-14 rounded-xl" />)}
            </div>
          ) : urgentItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <CheckCircle2 className="w-10 h-10 text-emerald-200" />
              <p className="text-sm font-medium text-gray-500">Aucune alerte urgente</p>
              <p className="text-xs text-gray-400">Toutes les écoles sont dans les normes</p>
            </div>
          ) : (
            urgentItems.slice(0, 5).map((a, i) => (
              <Link key={i} href={`/dashboard/tenants/${a.tenant.id}`}
                className="flex items-center gap-3 px-5 py-3.5 border-b border-gray-50 last:border-0 hover:bg-slate-50/70 transition group">
                <div className="w-2 h-2 rounded-full bg-red-400 flex-shrink-0 animate-pulse" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{a.tenant.name}</p>
                  <p className="text-xs text-gray-600 truncate mt-0.5">
                    {a.label}
                    {a.director?.email && ` · ${a.director.email}`}
                  </p>
                </div>
                {a.hoursLeft != null && (
                  <span className="text-xs font-bold text-red-500 bg-red-50 border border-red-100 px-2 py-0.5 rounded-full whitespace-nowrap flex-shrink-0">
                    {a.hoursLeft < 24 ? `${a.hoursLeft}h` : `${Math.floor(a.hoursLeft / 24)}j`}
                  </span>
                )}
                <ArrowUpRight className="w-4 h-4 text-gray-200 group-hover:text-brand-500 transition flex-shrink-0" />
              </Link>
            ))
          )}
        </div>

        {/* Activité récente */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
            <span className="text-base font-semibold text-gray-900">Activité récente</span>
            <Link href="/dashboard/activity"
              className="flex items-center gap-1 text-xs font-medium text-gray-400 hover:text-brand-600 transition">
              Journal complet <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {loading ? (
            <div className="p-4 space-y-3">
              {[...Array(4)].map((_, i) => <div key={i} className="skeleton h-12 rounded-xl" />)}
            </div>
          ) : recentLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2 flex-1">
              <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center">
                <div className="w-4 h-4 rounded-full bg-gray-200" />
              </div>
              <p className="text-sm font-medium text-gray-500">Aucune activité enregistrée</p>
            </div>
          ) : (
            <>
              <div className="flex-1">
                {recentLogs.map((log) => {
                  const meta = ACTION_META[log.action];
                  return (
                    <div key={log.id}
                      className="flex items-start gap-3 px-5 py-3 border-b border-gray-50 last:border-0 hover:bg-slate-50/70 transition">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-md mt-0.5 flex-shrink-0 whitespace-nowrap ${meta?.cls ?? 'text-gray-500 bg-gray-100'}`}>
                        {meta?.label ?? log.action}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">
                          {log.tenantName ?? <span className="text-gray-400 italic font-normal">Système</span>}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5 truncate">
                          {log.actorEmail ?? 'Système'} · {formatDate(log.createdAt)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="px-5 py-2.5 border-t border-gray-50 bg-gray-50/40">
                <p className="text-xs text-gray-400">
                  Actualisé à {format(lastUpdated, 'HH:mm:ss')}
                </p>
              </div>
            </>
          )}
        </div>

      </div>
    </div>
  );
}
