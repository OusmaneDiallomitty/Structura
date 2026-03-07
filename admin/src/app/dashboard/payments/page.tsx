'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  RefreshCw, CreditCard, CheckCircle2, XCircle,
  Clock, AlertTriangle, Filter, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  getSubscriptionPayments,
  type SubscriptionPaymentItem,
  type SubscriptionPaymentsResponse,
} from '@/lib/api';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtGNF(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace('.0', '')} M GNF`;
  if (n >= 1_000)     return `${Math.round(n / 1_000)} k GNF`;
  return `${n} GNF`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day:   '2-digit',
    month: 'short',
    year:  'numeric',
    hour:  '2-digit',
    minute:'2-digit',
  });
}

// ─── Config statuts ───────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; icon: React.ElementType; cls: string }> = {
  SUCCESS:    { label: 'Payé',        icon: CheckCircle2,  cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  PENDING:    { label: 'En attente',  icon: Clock,         cls: 'bg-amber-50   text-amber-700   border-amber-200'   },
  CREATED:    { label: 'Créé',        icon: Clock,         cls: 'bg-gray-50    text-gray-600    border-gray-200'    },
  REDIRECTED: { label: 'Redirigé',   icon: Clock,         cls: 'bg-blue-50    text-blue-700    border-blue-200'    },
  FAILED:     { label: 'Échoué',      icon: XCircle,       cls: 'bg-red-50     text-red-700     border-red-200'     },
  CANCELLED:  { label: 'Annulé',      icon: AlertTriangle, cls: 'bg-orange-50  text-orange-700  border-orange-200'  },
};

const PLAN_LABELS: Record<string, string> = {
  PRO:      'Pro',
  PRO_PLUS: 'Pro+',
};

const PLAN_CLS: Record<string, string> = {
  PRO:      'bg-blue-100 text-blue-700',
  PRO_PLUS: 'bg-purple-100 text-purple-700',
};

const PERIOD_LABELS: Record<string, string> = {
  monthly: 'Mensuel',
  annual:  'Annuel',
};

const METHOD_LABELS: Record<string, string> = {
  OM:   'Orange Money',
  MOMO: 'MTN MoMo',
  CARD: 'Carte bancaire',
};

// ─── Filtres disponibles ──────────────────────────────────────────────────────

const STATUS_FILTERS = ['', 'SUCCESS', 'PENDING', 'CREATED', 'REDIRECTED', 'FAILED', 'CANCELLED'];
const PLAN_FILTERS   = ['', 'PRO', 'PRO_PLUS'];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PaymentsPage() {
  const [result,     setResult]     = useState<SubscriptionPaymentsResponse | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filtres
  const [status,   setStatus]   = useState('');
  const [plan,     setPlan]     = useState('');
  const [page,     setPage]     = useState(1);

  const LIMIT = 30;

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true); else setLoading(true);
    try {
      const data = await getSubscriptionPayments({
        page,
        limit:  LIMIT,
        status: status || undefined,
        plan:   plan   || undefined,
      });
      setResult(data);
    } catch {
      toast.error('Impossible de charger les paiements');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [page, status, plan]);

  useEffect(() => { load(); }, [load]);

  // Reset page quand les filtres changent
  const handleFilterChange = (setter: (v: string) => void) => (v: string) => {
    setter(v);
    setPage(1);
  };

  // ─── KPIs rapides depuis les données chargées ──────────────────────────────
  const payments = result?.data ?? [];
  const successTotal = payments
    .filter((p) => p.status === 'SUCCESS')
    .reduce((sum, p) => sum + p.amount, 0);
  const pendingCount = payments.filter((p) => ['PENDING', 'CREATED', 'REDIRECTED'].includes(p.status)).length;
  const failedCount  = payments.filter((p) => ['FAILED', 'CANCELLED'].includes(p.status)).length;

  return (
    <div className="max-w-7xl mx-auto px-6 md:px-8 py-8 space-y-6">

      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Paiements Djomy</h1>
          <p className="text-sm text-gray-500 mt-1">
            Toutes les transactions d&apos;abonnement — {result?.meta.total ?? '…'} au total
          </p>
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

      {/* ── KPIs ─────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total transactions',  value: loading ? '…' : String(result?.meta.total ?? 0),  cls: 'text-gray-900'    },
          { label: 'Encaissé (page)',      value: loading ? '…' : fmtGNF(successTotal),             cls: 'text-emerald-700' },
          { label: 'En attente (page)',    value: loading ? '…' : String(pendingCount),              cls: 'text-amber-700'   },
          { label: 'Échoués / Ann. (page)',value: loading ? '…' : String(failedCount),             cls: 'text-red-600'     },
        ].map(({ label, value, cls }) => (
          <div key={label} className="bg-white rounded-2xl border border-gray-100 p-4">
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-1">{label}</p>
            <p className={`text-2xl font-bold ${cls}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* ── Filtres ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 bg-white rounded-2xl border border-gray-100 px-4 py-3">
        <Filter className="w-4 h-4 text-gray-400 flex-shrink-0" />

        {/* Statut */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500 font-medium whitespace-nowrap">Statut</label>
          <select
            value={status}
            onChange={(e) => handleFilterChange(setStatus)(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="">Tous</option>
            {STATUS_FILTERS.slice(1).map((s) => (
              <option key={s} value={s}>{STATUS_CONFIG[s]?.label ?? s}</option>
            ))}
          </select>
        </div>

        {/* Plan */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500 font-medium">Plan</label>
          <select
            value={plan}
            onChange={(e) => handleFilterChange(setPlan)(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="">Tous</option>
            {PLAN_FILTERS.slice(1).map((p) => (
              <option key={p} value={p}>{PLAN_LABELS[p] ?? p}</option>
            ))}
          </select>
        </div>

        {(status || plan) && (
          <button
            onClick={() => { setStatus(''); setPlan(''); setPage(1); }}
            className="text-xs text-gray-400 hover:text-gray-700 underline"
          >
            Réinitialiser
          </button>
        )}
      </div>

      {/* ── Table ────────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {['École', 'Plan', 'Période', 'Montant', 'Méthode', 'Statut', 'Date'].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-50">
              {loading ? (
                [...Array(8)].map((_, i) => (
                  <tr key={i}>
                    {[...Array(7)].map((__, j) => (
                      <td key={j} className="px-4 py-3.5">
                        <div className="skeleton h-4 rounded w-24" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : payments.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-gray-400 text-sm">
                    <CreditCard className="w-8 h-8 mx-auto mb-2 text-gray-200" />
                    Aucune transaction trouvée
                  </td>
                </tr>
              ) : (
                payments.map((p) => <PaymentRow key={p.id} payment={p} />)
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {result && result.meta.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <p className="text-xs text-gray-500">
              Page {result.meta.page} / {result.meta.totalPages} — {result.meta.total} transactions
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40 transition"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(result.meta.totalPages, p + 1))}
                disabled={page >= result.meta.totalPages}
                className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40 transition"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}

// ─── Ligne de la table ────────────────────────────────────────────────────────

function PaymentRow({ payment: p }: { payment: SubscriptionPaymentItem }) {
  const cfg = STATUS_CONFIG[p.status] ?? STATUS_CONFIG['CREATED'];
  const Icon = cfg.icon;

  return (
    <tr className="hover:bg-gray-50 transition-colors">
      {/* École */}
      <td className="px-4 py-3.5">
        <Link
          href={`/dashboard/tenants/${p.tenantId}`}
          className="font-medium text-gray-900 hover:text-brand-600 transition-colors"
        >
          {p.tenant?.name ?? p.tenantId.slice(0, 8)}
        </Link>
        <p className="text-xs text-gray-400 font-mono mt-0.5 truncate max-w-[180px]">
          {p.merchantPaymentReference}
        </p>
      </td>

      {/* Plan */}
      <td className="px-4 py-3.5">
        <span className={`inline-flex px-2 py-0.5 rounded-lg text-xs font-semibold ${PLAN_CLS[p.plan] ?? 'bg-gray-100 text-gray-600'}`}>
          {PLAN_LABELS[p.plan] ?? p.plan}
        </span>
      </td>

      {/* Période */}
      <td className="px-4 py-3.5 text-sm text-gray-600 whitespace-nowrap">
        {PERIOD_LABELS[p.period] ?? p.period}
      </td>

      {/* Montant */}
      <td className="px-4 py-3.5 font-semibold text-gray-900 whitespace-nowrap">
        {fmtGNF(p.amount)}
      </td>

      {/* Méthode */}
      <td className="px-4 py-3.5 text-sm text-gray-600 whitespace-nowrap">
        {p.paymentMethod
          ? (METHOD_LABELS[p.paymentMethod] ?? p.paymentMethod)
          : <span className="text-gray-300">—</span>
        }
      </td>

      {/* Statut */}
      <td className="px-4 py-3.5">
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border ${cfg.cls}`}>
          <Icon className="w-3.5 h-3.5" />
          {cfg.label}
        </span>
      </td>

      {/* Date */}
      <td className="px-4 py-3.5 text-xs text-gray-500 whitespace-nowrap">
        {fmtDate(p.createdAt)}
      </td>
    </tr>
  );
}
