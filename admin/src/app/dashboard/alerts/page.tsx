'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  AlertTriangle, AlertCircle, Info,
  CheckCircle2, RefreshCw, ArrowUpRight,
  Mail, Clock, ChevronDown, ChevronRight,
  Users, MapPin, Calendar, Activity,
  XCircle, UserX, TrendingDown, Timer, Send,
} from 'lucide-react';
import {
  getAlerts, suspendTenant, activateTenant,
  extendTrial, sendReminder,
  type AlertItem, type AlertsResponse,
} from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { toast } from 'sonner';

// ─── Constantes ───────────────────────────────────────────────────────────────

const AUTO_REFRESH_SEC = 3 * 60; // 3 minutes

// Sujets email pré-remplis selon le type d'alerte
const EMAIL_SUBJECTS: Record<AlertItem['type'], string> = {
  TRIAL_EXPIRING_SOON: "Votre période d'essai Structura expire bientôt",
  TRIAL_EXPIRING_WEEK: "Votre essai Structura se termine cette semaine",
  TRIAL_EXPIRED:       "Votre période d'essai Structura est terminée",
  PAST_DUE:            "Problème de paiement sur votre compte Structura",
  INACTIVE_7DAYS:      "Comment se passe votre utilisation de Structura ?",
  NO_SETUP:            "Besoin d'aide pour démarrer sur Structura ?",
  LONG_FREE:           "Passez à un plan premium Structura",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hoursLabel(h: number | null): string {
  if (h == null) return '';
  if (h <= 0)    return 'Expiré';
  if (h < 24)    return `${h}h restantes`;
  return `${Math.floor(h / 24)}j restants`;
}

function healthColor(score: number): string {
  if (score >= 70) return 'text-emerald-600 bg-emerald-50 border-emerald-100';
  if (score >= 40) return 'text-amber-600 bg-amber-50 border-amber-100';
  return 'text-red-600 bg-red-50 border-red-100';
}

function timeAgo(date: Date): string {
  const diff = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diff < 60)  return 'à l\'instant';
  if (diff < 3600) return `il y a ${Math.floor(diff / 60)}min`;
  return `il y a ${Math.floor(diff / 3600)}h`;
}

// ─── AlertRow ─────────────────────────────────────────────────────────────────

function AlertRow({ item, accentColor, onAction, canAct }: {
  item: AlertItem;
  accentColor: string;
  onAction: () => void;
  canAct: boolean;
}) {
  const [busy,          setBusy]          = useState(false);
  const [sendingReminder, setSendingReminder] = useState(false);

  const handleToggle = async (e: React.MouseEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (item.tenant.isActive) {
        await suspendTenant(item.tenant.id);
        toast.success(`${item.tenant.name} suspendu`);
      } else {
        await activateTenant(item.tenant.id);
        toast.success(`${item.tenant.name} réactivé`);
      }
      onAction();
    } catch (err: any) {
      toast.error(err.message ?? 'Erreur');
    } finally {
      setBusy(false);
    }
  };

  const handleExtendTrial = async (e: React.MouseEvent, days: number) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await extendTrial(item.tenant.id, days);
      toast.success(res.message);
      onAction();
    } catch (err: any) {
      toast.error(err.message ?? 'Erreur');
    } finally {
      setBusy(false);
    }
  };

  const handleSendReminder = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!item.director?.email) return;
    setSendingReminder(true);
    try {
      const subject = EMAIL_SUBJECTS[item.type];
      const message = `Bonjour,\n\nNous vous contactons au sujet de votre compte Structura.\n\nCordialement,\nL'équipe Structura`;
      const res = await sendReminder(item.tenant.id, subject, message);
      toast.success(res.message);
    } catch (err: any) {
      toast.error(err.message ?? 'Erreur envoi email');
    } finally {
      setSendingReminder(false);
    }
  };

  const emailHref = item.director?.email
    ? `mailto:${item.director.email}?subject=${encodeURIComponent(EMAIL_SUBJECTS[item.type])}`
    : null;

  const daysSinceCreated = item.tenant.createdAt
    ? Math.round((Date.now() - new Date(item.tenant.createdAt).getTime()) / 86_400_000)
    : null;

  return (
    <div className="relative flex items-start gap-4 px-6 py-5 border-b border-gray-100 last:border-0 hover:bg-slate-50/50 transition">
      {/* Barre accent gauche */}
      <div className={`absolute left-0 top-5 bottom-5 w-[3px] rounded-r-full ${accentColor}`} />

      {/* Contenu principal */}
      <div className="flex-1 min-w-0 pl-2">

        {/* Ligne 1 : nom + badges */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="text-base font-bold text-gray-900">{item.tenant.name}</span>

          {/* hoursLeft (trial expiring soon) */}
          {item.hoursLeft != null && (
            <span className="text-xs font-bold text-red-600 bg-red-50 border border-red-100 px-2 py-0.5 rounded-full">
              {hoursLabel(item.hoursLeft)}
            </span>
          )}

          {/* daysExpired (trial expired) */}
          {item.daysExpired != null && item.daysExpired > 0 && (
            <span className="text-xs font-bold text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
              Expiré depuis {item.daysExpired}j
            </span>
          )}

          {/* Health score */}
          {item.tenant.healthScore != null && (
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border flex items-center gap-1 ${healthColor(item.tenant.healthScore)}`}>
              <Activity className="w-2.5 h-2.5" />
              {item.tenant.healthScore}
            </span>
          )}
        </div>

        {/* Ligne 2 : label alerte */}
        <p className="text-sm font-medium text-gray-700 mt-1">{item.label}</p>

        {/* Ligne 3 : méta-données */}
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-gray-500">

          {/* Plan + statut */}
          <span>
            Plan <b className="text-gray-600">{item.tenant.subscriptionPlan}</b>
          </span>

          {/* Nb élèves */}
          <span className="flex items-center gap-1">
            <Users className="w-3 h-3" />
            {item.tenant.currentStudentCount} élève{item.tenant.currentStudentCount !== 1 ? 's' : ''}
          </span>

          {/* Ville */}
          {item.tenant.city && (
            <span className="flex items-center gap-1">
              <MapPin className="w-3 h-3" />{item.tenant.city}
            </span>
          )}

          {/* Ancienneté */}
          {daysSinceCreated != null && (
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />Inscrit il y a {daysSinceCreated}j
            </span>
          )}

          {/* Directeur — email */}
          {item.director?.email && (
            <span className="flex items-center gap-1">
              <Mail className="w-3 h-3" />{item.director.email}
            </span>
          )}

          {/* Directeur — dernière connexion */}
          {item.director?.lastLoginAt ? (
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />Connecté le {formatDate(item.director.lastLoginAt)}
            </span>
          ) : item.director !== null ? (
            <span className="flex items-center gap-1 text-amber-500">
              <Clock className="w-3 h-3" />Jamais connecté
            </span>
          ) : null}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 flex-shrink-0 pt-0.5 flex-wrap">

        {/* Extension trial rapide */}
        {(item.type === 'TRIAL_EXPIRING_SOON' || item.type === 'TRIAL_EXPIRING_WEEK' || item.type === 'TRIAL_EXPIRED') && (
          <div className="flex items-center border border-cyan-200 rounded-lg overflow-hidden">
            <span className="px-2 py-1 text-xs font-bold text-cyan-600 bg-cyan-50 flex items-center">
              <Timer className="w-3 h-3" />
            </span>
            {[7, 14, 30].map((days) => (
              <button
                key={days}
                onClick={(e) => handleExtendTrial(e, days)}
                disabled={busy}
                title={`+${days} jours`}
                className="px-2 py-1 text-xs font-bold text-cyan-700 hover:bg-cyan-50
                           border-l border-cyan-200 transition disabled:opacity-40"
              >
                +{days}j
              </button>
            ))}
          </div>
        )}

        {/* Rappel email via backend */}
        {item.director?.email && (
          <button
            onClick={handleSendReminder}
            disabled={sendingReminder || busy}
            title={`Envoyer rappel automatique à ${item.director.email}`}
            className="flex items-center gap-1 text-xs font-medium text-sky-600 hover:text-sky-700
                       border border-sky-200 hover:border-sky-300 bg-white px-2 py-1.5 rounded-lg transition disabled:opacity-40"
          >
            <Send className="w-3 h-3" />
            {sendingReminder ? '…' : <span className="hidden sm:block">Rappel</span>}
          </button>
        )}

        {/* Email client (mailto) */}
        {emailHref && (
          <a href={emailHref}
            className="flex items-center gap-1 text-xs font-medium text-gray-400 hover:text-sky-600 border border-gray-200 hover:border-sky-200 bg-white px-2.5 py-1.5 rounded-lg transition"
            title={`Composer un email à ${item.director?.email}`}>
            <Mail className="w-3 h-3" />
            <span className="hidden sm:block">Email</span>
          </a>
        )}

        {/* Voir le tenant */}
        <Link href={`/dashboard/tenants/${item.tenant.id}`}
          className="flex items-center gap-1 text-xs font-medium text-gray-400 hover:text-indigo-600 border border-gray-200 hover:border-indigo-200 bg-white px-2.5 py-1.5 rounded-lg transition">
          Voir <ArrowUpRight className="w-3 h-3" />
        </Link>

        {/* Suspendre / Réactiver */}
        {canAct && (
          <button onClick={handleToggle} disabled={busy}
            className="text-xs font-medium text-gray-500 hover:text-red-600 border border-gray-200 hover:border-red-200 bg-white px-2.5 py-1.5 rounded-lg transition disabled:opacity-40">
            {busy ? '…' : item.tenant.isActive ? 'Suspendre' : 'Réactiver'}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Section collapsible ──────────────────────────────────────────────────────

function Section({ title, icon, count, items, accentColor, onAction, canAct, emptyText, badgeClass }: {
  title: string; icon: React.ReactNode; count: number; items: AlertItem[];
  accentColor: string; onAction: () => void; canAct: boolean;
  emptyText: string; badgeClass: string;
}) {
  const [open, setOpen] = useState(true);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <button onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-slate-50/60 transition text-left">
        <div className="flex items-center gap-2.5">
          {icon}
          <span className="text-base font-semibold text-gray-900">{title}</span>
          <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${
            count === 0 ? 'bg-gray-50 text-gray-400 border-gray-100' : badgeClass
          }`}>
            {count}
          </span>
        </div>
        <div className="text-gray-400">
          {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </div>
      </button>

      {open && (
        <div className="border-t border-gray-50">
          {items.length === 0 ? (
            <div className="flex items-center gap-2.5 px-6 py-5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <p className="text-sm text-gray-500">{emptyText}</p>
            </div>
          ) : (
            items.map((item, i) => (
              <AlertRow key={i} item={item} accentColor={accentColor}
                onAction={onAction} canAct={canAct} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AlertsPage() {
  const [data,       setData]       = useState<AlertsResponse | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [countdown,   setCountdown]   = useState(AUTO_REFRESH_SEC);

  const timerRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true); else setLoading(true);
    try {
      const result = await getAlerts();
      setData(result);
      setLastUpdated(new Date());
      setCountdown(AUTO_REFRESH_SEC);
    } catch {
      if (!silent) toast.error('Impossible de charger les alertes');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Démarrage : chargement initial + auto-refresh
  useEffect(() => {
    load();

    // Auto-refresh toutes les 3 minutes
    timerRef.current = setInterval(() => load(true), AUTO_REFRESH_SEC * 1000);

    // Countdown affiché dans le bouton refresh
    countdownRef.current = setInterval(() => {
      setCountdown((c) => (c <= 1 ? AUTO_REFRESH_SEC : c - 1));
    }, 1000);

    return () => {
      if (timerRef.current)    clearInterval(timerRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [load]);

  // Refresh manuel : réinitialise aussi le timer pour éviter un double-refresh
  const handleManualRefresh = () => {
    if (timerRef.current)    clearInterval(timerRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
    load(true).then(() => {
      timerRef.current    = setInterval(() => load(true), AUTO_REFRESH_SEC * 1000);
      countdownRef.current = setInterval(() => {
        setCountdown((c) => (c <= 1 ? AUTO_REFRESH_SEC : c - 1));
      }, 1000);
    });
  };

  const totalAlerts = data?.counts.total ?? 0;

  return (
    <div className="max-w-4xl mx-auto px-6 md:px-8 py-8 space-y-6">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between animate-fade-in">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Alertes</h1>
            {totalAlerts > 0 && (
              <span className="text-xs font-bold text-white bg-red-500 px-2.5 py-0.5 rounded-full">
                {totalAlerts}
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500 mt-1">Écoles nécessitant votre attention</p>
          {lastUpdated && (
            <p className="text-xs text-gray-400 mt-1">
              Actualisé {timeAgo(lastUpdated)} · prochain dans {Math.floor(countdown / 60)}:{String(countdown % 60).padStart(2, '0')}
            </p>
          )}
        </div>

        <button onClick={handleManualRefresh} disabled={refreshing}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 bg-white border border-gray-200 hover:border-gray-300 px-3 py-2 rounded-xl shadow-sm transition active:scale-95 disabled:opacity-40">
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          <span className="hidden sm:block">Actualiser</span>
        </button>
      </div>

      {/* ── Résumé ─────────────────────────────────────────────────────────── */}
      {data && (
        <div className="grid grid-cols-3 gap-3 animate-fade-in-up anim-delay-1">
          {[
            { label: 'Urgentes',       count: data.counts.urgent,  Icon: AlertTriangle, bg: 'bg-red-50',    border: 'border-red-100',    text: 'text-red-600'   },
            { label: 'Avertissements', count: data.counts.warning, Icon: AlertCircle,   bg: 'bg-amber-50',  border: 'border-amber-100',  text: 'text-amber-700' },
            { label: 'Informations',   count: data.counts.info,    Icon: Info,          bg: 'bg-sky-50',    border: 'border-sky-100',    text: 'text-sky-700'   },
          ].map(({ label, count, Icon, bg, border, text }) => (
            <div key={label} className={`${bg} border ${border} rounded-2xl p-4 text-center card-hover`}>
              <Icon className={`w-4 h-4 mx-auto mb-1.5 ${text} opacity-60`} />
              <p className={`text-3xl font-bold tracking-tight ${text}`}>{count}</p>
              <p className={`text-xs font-semibold uppercase tracking-wide mt-2 ${text}`}>{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Sections ───────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="skeleton h-[72px] rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="space-y-4 animate-fade-in-up anim-delay-2">

          {/* Urgentes : trial 72h + PAST_DUE + trial expiré */}
          <Section
            title="Urgentes"
            icon={<AlertTriangle className="w-4 h-4 text-red-500" />}
            count={data?.counts.urgent ?? 0}
            items={data?.urgent ?? []}
            accentColor="bg-red-400"
            onAction={() => load(true)}
            canAct
            emptyText="Aucune alerte urgente — tout est en ordre."
            badgeClass="bg-red-50 text-red-600 border-red-100"
          />

          {/* Avertissements : inactifs + onboarding abandonné */}
          <Section
            title="Avertissements"
            icon={<AlertCircle className="w-4 h-4 text-amber-500" />}
            count={data?.counts.warning ?? 0}
            items={data?.warning ?? []}
            accentColor="bg-amber-400"
            onAction={() => load(true)}
            canAct={false}
            emptyText="Aucun avertissement en cours."
            badgeClass="bg-amber-50 text-amber-700 border-amber-100"
          />

          {/* Informations : trial 7j + long FREE */}
          <Section
            title="Informations"
            icon={<Info className="w-4 h-4 text-sky-500" />}
            count={data?.counts.info ?? 0}
            items={data?.info ?? []}
            accentColor="bg-sky-400"
            onAction={() => load(true)}
            canAct={false}
            emptyText="Aucune information particulière."
            badgeClass="bg-sky-50 text-sky-700 border-sky-100"
          />

        </div>
      )}

      {/* ── Légende health score ─────────────────────────────────────────── */}
      {!loading && (
        <div className="flex items-center gap-4 pt-2 animate-fade-in anim-delay-3">
          <p className="text-xs text-gray-500 font-medium">Health score :</p>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-xs text-emerald-600">
              <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />≥ 70 — Actif
            </span>
            <span className="flex items-center gap-1.5 text-xs text-amber-600">
              <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />40–69 — À surveiller
            </span>
            <span className="flex items-center gap-1.5 text-xs text-red-600">
              <span className="w-2 h-2 rounded-full bg-red-400 inline-block" />&lt; 40 — Risque churn
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
