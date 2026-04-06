'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useDebounce } from '@/lib/hooks';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Search,
  Building2,
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  XCircle,
  Download,
  PlusCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  getTenants,
  suspendTenant,
  activateTenant,
  type Tenant,
} from '@/lib/api';
import { cn, formatDate, planColor, planLabel, statusColor, statusLabel, moduleColor, moduleLabel } from '@/lib/utils';

const PLANS = ['', 'FREE', 'PRO', 'PRO_PLUS'];
const PLAN_LABELS: Record<string, string> = { '': 'Tous les plans', FREE: 'Free', PRO: 'Pro', PRO_PLUS: 'Pro+' };

const MODULES = [
  { value: '',         label: 'Tous les modules' },
  { value: 'SCHOOL',   label: 'École' },
  { value: 'COMMERCE', label: 'Commerce' },
];

const COUNTRIES = [
  { value: '', label: 'Tous les pays' },
  { value: 'GN', label: '🇬🇳 Guinée' },
  { value: 'SN', label: '🇸🇳 Sénégal' },
  { value: 'CI', label: '🇨🇮 Côte d\'Ivoire' },
  { value: 'ML', label: '🇲🇱 Mali' },
  { value: 'BF', label: '🇧🇫 Burkina Faso' },
  { value: 'BJ', label: '🇧🇯 Bénin' },
  { value: 'NE', label: '🇳🇪 Niger' },
  { value: 'TG', label: '🇹🇬 Togo' },
  { value: 'CM', label: '🇨🇲 Cameroun' },
  { value: 'MR', label: '🇲🇷 Mauritanie' },
  { value: 'OTHER', label: '🌍 Autre' },
];

function TenantsPageContent() {
  const urlParams    = useSearchParams();
  const urlModule    = urlParams.get('module') ?? '';

  const [tenants,    setTenants]    = useState<Tenant[]>([]);
  const [total,      setTotal]      = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page,       setPage]       = useState(1);
  const [search,     setSearch]     = useState('');
  const [status,     setStatus]     = useState<'' | 'active' | 'inactive'>('');
  const [plan,       setPlan]       = useState('');
  const [country,    setCountry]    = useState('');
  const [moduleType, setModuleType] = useState(urlModule);
  const [loading,    setLoading]    = useState(true);
  const [actionId,   setActionId]   = useState<string | null>(null);

  // Sync filtre module si l'URL change (clic sidebar)
  useEffect(() => { setModuleType(urlModule); setPage(1); }, [urlModule]);

  // Debounce 500ms — évite un appel API à chaque frappe clavier
  const debouncedSearch = useDebounce(search, 500);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getTenants({
        page,
        limit: 20,
        search:     debouncedSearch || undefined,
        status:     (status as 'active' | 'inactive') || undefined,
        plan:       plan       || undefined,
        country:    country    || undefined,
        moduleType: moduleType || undefined,
      });
      setTenants(res.data);
      setTotal(res.meta.total);
      setTotalPages(res.meta.totalPages);
    } catch {
      // silencieux — l'utilisateur voit la liste vide
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, status, plan, country, moduleType]);

  useEffect(() => { load(); }, [load]);

  // Reset page si les filtres changent (utilise la valeur debouncée pour la recherche)
  useEffect(() => { setPage(1); }, [debouncedSearch, status, plan, country, moduleType]);

  function exportCSV() {
    const headers = ['Nom', 'Module', 'Email', 'Ville', 'Pays', 'Plan', 'Statut', 'Élèves', 'Utilisateurs', 'Créé le', 'Actif'];
    const rows = tenants.map((t) => [
      t.name,
      moduleLabel(t.moduleType),
      t.email ?? '',
      t.city ?? '',
      t.country,
      t.subscriptionPlan,
      t.subscriptionStatus,
      String(t.currentStudentCount),
      String(t.currentUserCount),
      new Date(t.createdAt).toLocaleDateString('fr-FR'),
      t.isActive ? 'Oui' : 'Non',
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `clients-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleToggle(tenant: Tenant) {
    setActionId(tenant.id);
    try {
      if (tenant.isActive) {
        await suspendTenant(tenant.id);
        toast.success(`${tenant.name} suspendue`);
      } else {
        await activateTenant(tenant.id);
        toast.success(`${tenant.name} réactivée`);
      }
      await load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setActionId(null);
    }
  }

  return (
    <div className="p-8 space-y-6">
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {moduleType === 'SCHOOL' ? 'Écoles' : moduleType === 'COMMERCE' ? 'Commerces' : 'Clients'}
          </h1>
          <p className="text-sm text-gray-600 mt-0.5">
            {total} {moduleType === 'SCHOOL' ? `école${total > 1 ? 's' : ''}` : moduleType === 'COMMERCE' ? `commerce${total > 1 ? 's' : ''}` : `client${total > 1 ? 's' : ''}`} inscrit{total > 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={exportCSV}
            disabled={tenants.length === 0}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-600
                       border border-gray-200 rounded-xl hover:bg-gray-50 transition disabled:opacity-40"
            title="Exporter la liste en CSV"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:block">Exporter CSV</span>
          </button>
          <Link
            href="/dashboard/tenants/new"
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white
                       bg-brand-600 hover:bg-brand-700 rounded-xl transition"
          >
            <PlusCircle className="w-4 h-4" />
            <span className="hidden sm:block">Nouveau client</span>
          </Link>
        </div>
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap gap-3">
        {/* Recherche */}
        <div className="relative flex-1 min-w-60">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par nom, email, ville…"
            className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm
                       focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
          />
        </div>

        {/* Statut */}
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as '' | 'active' | 'inactive')}
          className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm
                     focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value="">Tous les statuts</option>
          <option value="active">Actives</option>
          <option value="inactive">Inactives</option>
        </select>

        {/* Plan */}
        <select
          value={plan}
          onChange={(e) => setPlan(e.target.value)}
          className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm
                     focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          {PLANS.map((p) => (
            <option key={p} value={p}>{PLAN_LABELS[p] ?? p}</option>
          ))}
        </select>

        {/* Pays */}
        <select
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm
                     focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          {COUNTRIES.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>

        {/* Module */}
        <select
          value={moduleType}
          onChange={(e) => setModuleType(e.target.value)}
          className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm
                     focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          {MODULES.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
      </div>

      {/* Tableau */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="w-7 h-7 border-4 border-brand-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : tenants.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-gray-400">
            <Building2 className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm text-gray-500">Aucun client trouvé</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide">Client</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide">Module</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide">Pays</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide">Plan</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide">Statut abo.</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide">Élèves</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide">Utilisateurs</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide">Inscrite le</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide">Actif</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {tenants.map((t) => (
                <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      {t.logo ? (
                        <img src={t.logo} alt="" className="w-8 h-8 rounded-lg object-cover" />
                      ) : (
                        <div className="w-8 h-8 rounded-lg bg-brand-100 flex items-center justify-center font-bold text-brand-600 text-xs">
                          {t.name[0]}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 truncate max-w-48">{t.name}</p>
                        <p className="text-xs text-gray-500 truncate">{t.city ?? '—'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <span className={cn('px-2 py-1 rounded-lg text-xs font-semibold', moduleColor(t.moduleType))}>
                      {moduleLabel(t.moduleType)}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-sm text-gray-600 whitespace-nowrap">
                    {COUNTRIES.find((c) => c.value === t.country)?.label ?? t.country}
                  </td>
                  <td className="px-4 py-4">
                    <span className={cn('px-2 py-1 rounded-lg text-xs font-semibold', planColor(t.subscriptionPlan))}>
                      {planLabel(t.subscriptionPlan)}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <span className={cn('px-2 py-1 rounded-lg text-xs font-semibold', statusColor(t.subscriptionStatus))}>
                      {statusLabel(t.subscriptionStatus)}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-center font-medium text-gray-700">
                    {t._count?.students ?? t.currentStudentCount}
                  </td>
                  <td className="px-4 py-4 text-center font-medium text-gray-700">
                    {t._count?.users ?? t.currentUserCount}
                  </td>
                  <td className="px-4 py-4 text-gray-600 text-sm whitespace-nowrap">
                    {formatDate(t.createdAt)}
                  </td>
                  <td className="px-4 py-4 text-center">
                    {t.isActive
                      ? <CheckCircle className="w-5 h-5 text-green-500 mx-auto" />
                      : <XCircle    className="w-5 h-5 text-red-400 mx-auto" />
                    }
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2 justify-end">
                      <Link
                        href={`/dashboard/tenants/${t.id}`}
                        className="px-3 py-1.5 text-xs font-medium text-brand-600 hover:bg-brand-50
                                   rounded-lg border border-brand-200 transition"
                      >
                        Détail
                      </Link>
                      <button
                        onClick={() => handleToggle(t)}
                        disabled={actionId === t.id}
                        className={cn(
                          'px-3 py-1.5 text-xs font-medium rounded-lg border transition',
                          t.isActive
                            ? 'text-orange-600 border-orange-200 hover:bg-orange-50'
                            : 'text-green-600 border-green-200 hover:bg-green-50',
                          'disabled:opacity-50',
                        )}
                      >
                        {actionId === t.id ? '…' : (t.isActive ? 'Suspendre' : 'Activer')}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Page {page} sur {totalPages}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50 disabled:opacity-40 transition"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50 disabled:opacity-40 transition"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function TenantsPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-64">
        <div className="w-7 h-7 border-4 border-brand-600 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <TenantsPageContent />
    </Suspense>
  );
}
