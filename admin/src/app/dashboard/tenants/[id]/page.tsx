'use client';

import { useEffect, useState }  from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Building2,
  Users,
  GraduationCap,
  Mail,
  Phone,
  MapPin,
  CheckCircle,
  XCircle,
  Copy,
  Check,
  Settings,
  Timer,
  Send,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  getTenant,
  updateTenant,
  suspendTenant,
  activateTenant,
  deleteTenant,
  impersonateTenant,
  extendTrial,
  sendReminder,
  type TenantDetail,
} from '@/lib/api';
import { cn, formatDate, planColor, statusColor } from '@/lib/utils';

const PLANS    = ['FREE', 'PRO', 'PRO_PLUS'];
const STATUSES = ['ACTIVE', 'TRIALING', 'PAST_DUE', 'CANCELED', 'EXPIRED'];

export default function TenantDetailPage() {
  const { id }   = useParams<{ id: string }>();
  const router   = useRouter();

  const [tenant,   setTenant]   = useState<TenantDetail | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [busy,     setBusy]     = useState(false);
  const [copied,   setCopied]   = useState(false);
  const [showPlan,     setShowPlan]     = useState(false);
  const [showReminder, setShowReminder] = useState(false);

  // Champs du formulaire plan
  const [selPlan,   setSelPlan]   = useState('');
  const [selStatus, setSelStatus] = useState('');
  const [trialDate, setTrialDate] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');

  // Champs formulaire rappel
  const [reminderSubject, setReminderSubject] = useState('');
  const [reminderMessage, setReminderMessage] = useState('');

  useEffect(() => {
    getTenant(id)
      .then((t) => {
        setTenant(t);
        setSelPlan(t.subscriptionPlan);
        setSelStatus(t.subscriptionStatus);
        setTrialDate(t.trialEndsAt   ? t.trialEndsAt.slice(0, 10)      : '');
        setPeriodEnd(t.currentPeriodEnd ? t.currentPeriodEnd.slice(0, 10) : '');
      })
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  // ─── Actions ──────────────────────────────────────────────────────────────

  async function handleToggle() {
    if (!tenant) return;
    setBusy(true);
    try {
      if (tenant.isActive) {
        await suspendTenant(id);
        setTenant((t) => t ? { ...t, isActive: false } : t);
        toast.success(`${tenant.name} suspendue`);
      } else {
        await activateTenant(id);
        setTenant((t) => t ? { ...t, isActive: true } : t);
        toast.success(`${tenant.name} réactivée`);
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function handlePlanSave() {
    if (!tenant) return;
    setBusy(true);
    try {
      const updated = await updateTenant(id, {
        subscriptionPlan:   selPlan   || undefined,
        subscriptionStatus: selStatus || undefined,
        trialEndsAt:        trialDate || undefined,
        currentPeriodEnd:   periodEnd || undefined,
      });
      setTenant((t) => t ? {
        ...t,
        subscriptionPlan:   updated.subscriptionPlan,
        subscriptionStatus: updated.subscriptionStatus,
        trialEndsAt:        updated.trialEndsAt,
        currentPeriodEnd:   updated.currentPeriodEnd,
      } : t);
      setShowPlan(false);
      toast.success('Abonnement mis à jour');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!confirm(
      `Supprimer définitivement "${tenant?.name}" et toutes ses données ?\n\nCette action est IRRÉVERSIBLE.`,
    )) return;
    setBusy(true);
    try {
      await deleteTenant(id);
      toast.success('École supprimée définitivement');
      router.push('/dashboard/tenants');
    } catch (e: any) {
      toast.error(e.message);
      setBusy(false);
    }
  }

  async function handleImpersonate() {
    setBusy(true);
    try {
      const res = await impersonateTenant(id);
      const saasUrl = process.env.NEXT_PUBLIC_SAAS_URL ?? 'http://localhost:3000';
      // Utilisation du code opaque (UUID) — le JWT ne passe JAMAIS dans l'URL
      const target  = `${saasUrl}/impersonate?code=${encodeURIComponent(res.code)}`;

      window.open(target, '_blank', 'noopener,noreferrer');
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
      toast.success(
        `Onglet ouvert — ${res.impersonating.directorEmail} (code valide 2min)`,
        { duration: 6000 },
      );
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleExtendTrial(days: number) {
    setBusy(true);
    try {
      const res = await extendTrial(id, days);
      // Mettre à jour le state local
      const newDate = res.newTrialEnd;
      setTenant((t) => t ? { ...t, trialEndsAt: newDate, subscriptionStatus: 'TRIALING' } : t);
      setTrialDate(newDate.slice(0, 10));
      toast.success(res.message);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleSendReminder() {
    if (!reminderSubject.trim() || !reminderMessage.trim()) {
      toast.error('Objet et message requis');
      return;
    }
    setBusy(true);
    try {
      const res = await sendReminder(id, reminderSubject, reminderMessage);
      toast.success(res.message);
      setShowReminder(false);
      setReminderSubject('');
      setReminderMessage('');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-brand-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!tenant) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4">
          École introuvable
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6 max-w-5xl">

      {/* Retour */}
      <button
        onClick={() => router.back()}
        className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Retour aux écoles
      </button>

      {/* ─── En-tête ───────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
        <div className="flex items-start justify-between gap-4 flex-wrap">

          {/* Identité */}
          <div className="flex items-center gap-4">
            {tenant.logo ? (
              <img src={tenant.logo} alt="" className="w-14 h-14 rounded-xl object-cover" />
            ) : (
              <div className="w-14 h-14 rounded-xl bg-brand-100 flex items-center justify-center text-brand-600 font-bold text-xl">
                {tenant.name[0]}
              </div>
            )}
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-gray-900">{tenant.name}</h1>
                {tenant.isActive
                  ? <CheckCircle className="w-5 h-5 text-green-500" />
                  : <XCircle    className="w-5 h-5 text-red-400" />
                }
              </div>
              <p className="text-sm text-gray-600 capitalize">{tenant.type}</p>
              <div className="flex gap-2 mt-2">
                <span className={cn('px-2.5 py-0.5 rounded-lg text-xs font-semibold', planColor(tenant.subscriptionPlan))}>
                  {tenant.subscriptionPlan}
                </span>
                <span className={cn('px-2.5 py-0.5 rounded-lg text-xs font-semibold', statusColor(tenant.subscriptionStatus))}>
                  {tenant.subscriptionStatus}
                </span>
                {tenant.currentPeriodEnd && (
                  <span className="px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-gray-100 text-gray-600">
                    Expire le {formatDate(tenant.currentPeriodEnd)}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => { setShowPlan((v) => !v); setShowReminder(false); }}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-600
                         border border-gray-200 rounded-xl hover:bg-gray-50 transition"
            >
              <Settings className="w-4 h-4" />
              Gérer plan
            </button>

            {/* Extension trial rapide */}
            {(tenant.subscriptionStatus === 'TRIALING' || tenant.subscriptionStatus === 'EXPIRED') && (
              <div className="flex items-center gap-1 border border-cyan-200 rounded-xl overflow-hidden">
                <span className="px-2.5 py-2 text-xs font-semibold text-cyan-600 bg-cyan-50 flex items-center gap-1">
                  <Timer className="w-3.5 h-3.5" />
                  <span className="hidden sm:block">Trial</span>
                </span>
                {[7, 14, 30].map((days) => (
                  <button
                    key={days}
                    onClick={() => handleExtendTrial(days)}
                    disabled={busy}
                    className="px-3 py-2 text-xs font-semibold text-cyan-700 hover:bg-cyan-50
                               border-l border-cyan-200 transition disabled:opacity-40"
                    title={`Prolonger le trial de ${days} jours`}
                  >
                    +{days}j
                  </button>
                ))}
              </div>
            )}

            <button
              onClick={() => { setShowReminder((v) => !v); setShowPlan(false); }}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-sky-600
                         border border-sky-200 rounded-xl hover:bg-sky-50 transition"
              title="Envoyer un email au directeur"
            >
              <Send className="w-4 h-4" />
              <span className="hidden sm:block">Rappel</span>
            </button>

            <button
              onClick={handleImpersonate}
              disabled={busy}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-brand-600
                         border border-brand-200 rounded-xl hover:bg-brand-50 transition disabled:opacity-50"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Ouvert !' : 'Impersonater'}
            </button>

            <button
              onClick={handleToggle}
              disabled={busy}
              className={cn(
                'px-4 py-2 text-sm font-medium rounded-xl border transition disabled:opacity-50',
                tenant.isActive
                  ? 'text-orange-600 border-orange-200 hover:bg-orange-50'
                  : 'text-green-600 border-green-200 hover:bg-green-50',
              )}
            >
              {tenant.isActive ? 'Suspendre' : 'Réactiver'}
            </button>

            {!tenant.isActive && (
              <button
                onClick={handleDelete}
                disabled={busy}
                className="px-4 py-2 text-sm font-medium text-red-600 border border-red-200
                           rounded-xl hover:bg-red-50 transition disabled:opacity-50"
              >
                Supprimer
              </button>
            )}
          </div>
        </div>

        {/* ─── Formulaire modification plan ────────────────────────────────── */}
        {showPlan && (
          <div className="mt-6 pt-6 border-t border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Modifier l'abonnement</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Plan</label>
                <select
                  value={selPlan}
                  onChange={(e) => setSelPlan(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm
                             focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  {PLANS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Statut</label>
                <select
                  value={selStatus}
                  onChange={(e) => setSelStatus(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm
                             focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Fin trial</label>
                <input
                  type="date"
                  value={trialDate}
                  onChange={(e) => setTrialDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm
                             focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Fin période</label>
                <input
                  type="date"
                  value={periodEnd}
                  onChange={(e) => setPeriodEnd(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm
                             focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={handlePlanSave}
                disabled={busy}
                className="px-5 py-2 bg-brand-600 text-white text-sm font-medium rounded-xl
                           hover:bg-brand-700 transition disabled:opacity-50"
              >
                {busy ? 'Enregistrement…' : 'Enregistrer'}
              </button>
              <button
                onClick={() => setShowPlan(false)}
                className="px-5 py-2 border border-gray-200 text-sm text-gray-600 rounded-xl
                           hover:bg-gray-50 transition"
              >
                Annuler
              </button>
            </div>
          </div>
        )}

        {/* ─── Formulaire rappel email ──────────────────────────────────── */}
        {showReminder && (
          <div className="mt-6 pt-6 border-t border-gray-100">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-700">Envoyer un rappel au directeur</h3>
              <button onClick={() => setShowReminder(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Objet de l'email</label>
                <input
                  type="text"
                  value={reminderSubject}
                  onChange={(e) => setReminderSubject(e.target.value)}
                  placeholder="ex: Votre essai Structura expire bientôt"
                  maxLength={200}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm
                             focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Message</label>
                <textarea
                  value={reminderMessage}
                  onChange={(e) => setReminderMessage(e.target.value)}
                  placeholder="Bonjour, nous vous contactons au sujet de…"
                  maxLength={5000}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm
                             focus:outline-none focus:ring-2 focus:ring-sky-500 resize-none"
                />
                <p className="text-xs text-gray-400 mt-1">{reminderMessage.length}/5000</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleSendReminder}
                  disabled={busy || !reminderSubject.trim() || !reminderMessage.trim()}
                  className="flex items-center gap-1.5 px-5 py-2 bg-sky-600 text-white text-sm
                             font-medium rounded-xl hover:bg-sky-700 transition disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  {busy ? 'Envoi…' : 'Envoyer'}
                </button>
                <button
                  onClick={() => setShowReminder(false)}
                  className="px-5 py-2 border border-gray-200 text-sm text-gray-600 rounded-xl
                             hover:bg-gray-50 transition"
                >
                  Annuler
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Infos de contact */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-6 border-t border-gray-100">
          {tenant.email && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Mail className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <span className="truncate">{tenant.email}</span>
            </div>
          )}
          {tenant.phone && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Phone className="w-4 h-4 text-gray-400 flex-shrink-0" />
              {tenant.phone}
            </div>
          )}
          {(tenant.city || tenant.country) && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0" />
              {[tenant.city, tenant.country].filter(Boolean).join(', ')}
            </div>
          )}
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Building2 className="w-4 h-4 text-gray-400 flex-shrink-0" />
            Inscrite le {formatDate(tenant.createdAt)}
          </div>
        </div>
      </div>

      {/* ─── Compteurs ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {([
          { label: 'Élèves',       value: tenant._count.students,  icon: GraduationCap, colorIcon: 'text-purple-600', colorBg: 'bg-purple-50' },
          { label: 'Utilisateurs', value: tenant._count.users,     icon: Users,         colorIcon: 'text-blue-600',   colorBg: 'bg-blue-50'   },
          { label: 'Classes',      value: tenant._count.classes,   icon: Building2,     colorIcon: 'text-green-600',  colorBg: 'bg-green-50'  },
          { label: 'Paiements',    value: tenant._count.payments,  icon: CheckCircle,   colorIcon: 'text-amber-600',  colorBg: 'bg-amber-50'  },
        ] as const).map(({ label, value, icon: Icon, colorIcon, colorBg }) => (
          <div key={label} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex items-center gap-4">
            <div className={cn('p-2.5 rounded-xl', colorBg)}>
              <Icon className={cn('w-5 h-5', colorIcon)} />
            </div>
            <div>
              <p className="text-sm text-gray-600">{label}</p>
              <p className="text-2xl font-bold text-gray-900">{value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ─── Historique abonnement ─────────────────────────────────────────── */}
      {tenant.subscriptionHistory.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Historique abonnement</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {(tenant.subscriptionHistory as any[]).map((h) => (
              <div key={h.id} className="px-6 py-3 flex items-center justify-between text-sm">
                <div className="flex items-center gap-3">
                  <span className={cn('px-2 py-0.5 rounded-lg text-xs font-semibold', planColor(h.plan))}>
                    {h.plan}
                  </span>
                  <span className={cn('px-2 py-0.5 rounded-lg text-xs font-semibold', statusColor(h.status))}>
                    {h.status}
                  </span>
                </div>
                <span className="text-xs text-gray-600">{formatDate(h.createdAt)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── Utilisateurs ──────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">
            Utilisateurs ({tenant.users.length})
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                {['Nom', 'Rôle', 'Dernière connexion', 'Vérifié', 'Actif'].map((h) => (
                  <th
                    key={h}
                    className={cn(
                      'py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide',
                      h === 'Nom' ? 'text-left px-6' : h === 'Rôle' || h === 'Dernière connexion' ? 'text-left px-4' : 'text-center px-4',
                    )}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {tenant.users.map((u) => (
                <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-3.5">
                    <p className="font-medium text-gray-900">{u.firstName} {u.lastName}</p>
                    <p className="text-xs text-gray-500">{u.email}</p>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs font-medium rounded-lg">
                      {u.role}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-sm text-gray-600">
                    {u.lastLoginAt ? formatDate(u.lastLoginAt) : (
                      <span className="text-orange-500">Jamais connecté</span>
                    )}
                  </td>
                  <td className="px-4 py-3.5 text-center">
                    {u.emailVerified
                      ? <CheckCircle className="w-4 h-4 text-green-500 mx-auto" />
                      : <XCircle    className="w-4 h-4 text-gray-400 mx-auto" />
                    }
                  </td>
                  <td className="px-4 py-3.5 text-center">
                    {u.isActive
                      ? <CheckCircle className="w-4 h-4 text-green-500 mx-auto" />
                      : <XCircle    className="w-4 h-4 text-red-400 mx-auto" />
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
