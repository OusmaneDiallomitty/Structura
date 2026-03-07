'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  RefreshCw, ChevronLeft, ChevronRight,
  ArrowUpRight, SlidersHorizontal, Inbox,
} from 'lucide-react';
import { getActivity, getTenants, type ActivityResponse, type Tenant } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { toast } from 'sonner';

// ─── Constantes ───────────────────────────────────────────────────────────────

const ACTION_META: Record<string, { label: string; dot: string; badge: string }> = {
  NEW_TENANT:    { label: 'Nouvelle école',   dot: 'bg-emerald-400', badge: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
  CREATE_TENANT: { label: 'École créée',      dot: 'bg-emerald-400', badge: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
  SUSPEND:       { label: 'Suspension',       dot: 'bg-red-400',     badge: 'bg-red-50 text-red-600 border-red-100'             },
  ACTIVATE:      { label: 'Réactivation',     dot: 'bg-blue-400',    badge: 'bg-blue-50 text-blue-700 border-blue-100'          },
  DELETE:        { label: 'Suppression',      dot: 'bg-gray-400',    badge: 'bg-gray-50 text-gray-600 border-gray-200'          },
  IMPERSONATE:   { label: 'Accès temporaire', dot: 'bg-purple-400',  badge: 'bg-purple-50 text-purple-700 border-purple-100'    },
  PAYMENT_FAILED:{ label: 'Paiement échoué',  dot: 'bg-orange-400',  badge: 'bg-orange-50 text-orange-700 border-orange-100'    },
  LOGIN_ADMIN:   { label: 'Connexion admin',  dot: 'bg-sky-400',     badge: 'bg-sky-50 text-sky-700 border-sky-100'             },
  UPDATE_TENANT: { label: 'Mise à jour',      dot: 'bg-yellow-400',  badge: 'bg-yellow-50 text-yellow-700 border-yellow-100'    },
  UPDATE:        { label: 'Mise à jour',      dot: 'bg-yellow-400',  badge: 'bg-yellow-50 text-yellow-700 border-yellow-100'    },
  EXTEND_TRIAL:  { label: 'Trial prolongé',   dot: 'bg-cyan-400',    badge: 'bg-cyan-50 text-cyan-700 border-cyan-100'          },
  SEND_REMINDER: { label: 'Rappel envoyé',    dot: 'bg-sky-400',     badge: 'bg-sky-50 text-sky-700 border-sky-100'             },
};

function ActionBadge({ action }: { action: string }) {
  const m = ACTION_META[action] ?? { label: action, dot: 'bg-gray-300', badge: 'bg-gray-50 text-gray-600 border-gray-200' };
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border whitespace-nowrap ${m.badge}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${m.dot}`} />
      {m.label}
    </span>
  );
}

function formatDetails(d: Record<string, unknown> | null): string {
  if (!d) return '';
  return Object.entries(d)
    .filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
    .join(' · ');
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ActivityPage() {
  const [data,       setData]       = useState<ActivityResponse | null>(null);
  const [tenants,    setTenants]    = useState<Tenant[]>([]);
  const [page,       setPage]       = useState(1);
  const [limit,      setLimit]      = useState(25);
  const [tenantId,   setTenantId]   = useState('');
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showFilter, setShowFilter] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true); else setLoading(true);
    try {
      setData(await getActivity({ page, limit, tenantId: tenantId || undefined }));
    } catch {
      if (!silent) toast.error('Impossible de charger le journal');
    } finally { setLoading(false); setRefreshing(false); }
  }, [page, limit, tenantId]);

  useEffect(() => {
    getTenants({ limit: 200 }).then((r) => setTenants(r.data)).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  const meta = data?.meta;
  const logs = data?.data ?? [];

  // Pages visibles dans la pagination
  const visiblePages = (): number[] => {
    if (!meta) return [];
    const total = meta.totalPages;
    const cur   = meta.page;
    if (total <= 5) return Array.from({ length: total }, (_, i) => i + 1);
    if (cur <= 3)   return [1, 2, 3, 4, 5];
    if (cur >= total - 2) return [total - 4, total - 3, total - 2, total - 1, total];
    return [cur - 2, cur - 1, cur, cur + 1, cur + 2];
  };

  return (
    <div className="max-w-6xl mx-auto px-6 md:px-8 py-8 space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Journal d'activité</h1>
          <p className="text-sm text-gray-500 mt-1">
            {meta ? `${meta.total.toLocaleString()} événements enregistrés` : 'Toutes les actions administratives'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowFilter((s) => !s)}
            className={`flex items-center gap-1.5 text-sm border px-3 py-2 rounded-xl shadow-sm transition active:scale-95
              ${showFilter ? 'bg-brand-50 border-brand-200 text-brand-700' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-900'}`}>
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span className="hidden sm:block">Filtres</span>
          </button>
          <button onClick={() => load(true)} disabled={refreshing}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 bg-white border border-gray-200 hover:border-gray-300 px-3 py-2 rounded-xl shadow-sm transition active:scale-95 disabled:opacity-40">
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:block">Actualiser</span>
          </button>
        </div>
      </div>

      {/* Filtres */}
      {showFilter && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 animate-scale-in">
          <div className="flex flex-wrap items-end gap-4">
            <div className="min-w-[200px] flex-1 max-w-sm">
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">École</label>
              <select value={tenantId} onChange={(e) => setTenantId(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition">
                <option value="">Toutes les écoles</option>
                {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Lignes/page</label>
              <select value={limit} onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}
                className="text-sm border border-gray-200 rounded-xl px-3 py-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 transition">
                {[15, 25, 50].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <button onClick={() => { setPage(1); }}
              className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition active:scale-95">
              Appliquer
            </button>
          </div>
        </div>
      )}

      {/* Tableau */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden animate-fade-in-up anim-delay-1">
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-7 h-7 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Inbox className="w-10 h-10 text-gray-200" />
            <p className="text-sm font-medium text-gray-500">Aucune activité trouvée</p>
            <p className="text-xs text-gray-400">Essayez de modifier les filtres</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-50 bg-gray-50/50">
                  <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-600 uppercase tracking-wider">Événement</th>
                  <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-600 uppercase tracking-wider">École</th>
                  <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-600 uppercase tracking-wider hidden md:table-cell">Acteur</th>
                  <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-600 uppercase tracking-wider hidden xl:table-cell">Détails</th>
                  <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-600 uppercase tracking-wider">Date</th>
                  <th className="px-5 py-3.5 w-10" />
                </tr>
              </thead>
              <tbody>
                {logs.map((log, idx) => (
                  <tr key={log.id}
                    className="border-b border-gray-50 last:border-0 hover:bg-slate-50/60 transition">
                    <td className="px-5 py-3.5"><ActionBadge action={log.action} /></td>
                    <td className="px-5 py-3.5">
                      <span className="text-sm font-semibold text-gray-900">
                        {log.tenantName ?? <span className="italic text-gray-400 font-normal">Système</span>}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 hidden md:table-cell">
                      <span className="text-xs text-gray-600">{log.actorEmail ?? '—'}</span>
                    </td>
                    <td className="px-5 py-3.5 hidden xl:table-cell max-w-[180px]">
                      <span className="text-xs text-gray-600 truncate block">{formatDetails(log.details) || '—'}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-xs text-gray-600 whitespace-nowrap">{formatDate(log.createdAt)}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      {log.tenantId && (
                        <Link href={`/dashboard/tenants/${log.tenantId}`}
                          className="text-gray-400 hover:text-brand-500 transition">
                          <ArrowUpRight className="w-4 h-4" />
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between animate-fade-in">
          <p className="text-xs text-gray-600">
            {((meta.page - 1) * meta.limit) + 1}–{Math.min(meta.page * meta.limit, meta.total)} sur{' '}
            <span className="font-semibold text-gray-600">{meta.total.toLocaleString()}</span>
          </p>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={meta.page <= 1}
              className="w-9 h-9 flex items-center justify-center border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-30 transition text-gray-500 active:scale-95">
              <ChevronLeft className="w-4 h-4" />
            </button>
            {visiblePages().map((p) => (
              <button key={p} onClick={() => setPage(p)}
                className={`w-9 h-9 text-sm font-semibold rounded-xl border transition active:scale-95
                  ${p === meta.page
                    ? 'bg-brand-600 border-brand-600 text-white shadow-sm shadow-brand-200'
                    : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                  }`}>
                {p}
              </button>
            ))}
            <button onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))} disabled={meta.page >= meta.totalPages}
              className="w-9 h-9 flex items-center justify-center border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-30 transition text-gray-500 active:scale-95">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
