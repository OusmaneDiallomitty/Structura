'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  AlertTriangle, AlertCircle, Info, CheckCircle2, RefreshCw,
  ArrowUpRight, Mail, Clock, ChevronDown, ChevronRight,
  Users, MapPin, Calendar, Activity, Send, Timer,
  BellOff, BellRing, StickyNote, Trash2, Plus, History,
  Filter, Download, Square, CheckSquare, X,
} from 'lucide-react';
import {
  getAlerts, suspendTenant, activateTenant, extendTrial, sendReminder,
  snoozeAlert, unsnoozeAlert, getTenantNotes, addTenantNote, deleteTenantNote,
  getTenantRecentActivity,
  type AlertItem, type AlertsResponse, type TenantNote, type TenantActivity,
} from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { toast } from 'sonner';

// ─── Constantes ───────────────────────────────────────────────────────────────

const AUTO_REFRESH_SEC = 3 * 60;

const EMAIL_SUBJECTS: Record<AlertItem['type'], string> = {
  TRIAL_EXPIRING_SOON: "Votre période d'essai Structura expire bientôt",
  TRIAL_EXPIRING_WEEK: "Votre essai Structura se termine cette semaine",
  TRIAL_EXPIRED:       "Votre période d'essai Structura est terminée",
  PAST_DUE:            "Problème de paiement sur votre compte Structura",
  INACTIVE_7DAYS:      "Comment se passe votre utilisation de Structura ?",
  NO_SETUP:            "Besoin d'aide pour démarrer sur Structura ?",
  LONG_FREE:           "Passez à un plan premium Structura",
};

const TYPE_LABELS: Record<AlertItem['type'], string> = {
  TRIAL_EXPIRING_SOON: 'Trial < 72h',
  TRIAL_EXPIRING_WEEK: 'Trial < 7j',
  TRIAL_EXPIRED:       'Trial expiré',
  PAST_DUE:            'Paiement retard',
  INACTIVE_7DAYS:      'Inactif 7j+',
  NO_SETUP:            'Onboarding abandonné',
  LONG_FREE:           'FREE 30j+',
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

function timeAgo(date: Date | string): string {
  const d    = typeof date === 'string' ? new Date(date) : date;
  const diff = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diff < 60)   return 'à l\'instant';
  if (diff < 3600) return `il y a ${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `il y a ${Math.floor(diff / 3600)}h`;
  return `il y a ${Math.floor(diff / 86400)}j`;
}

function exportCSV(alerts: AlertItem[]) {
  const rows = [
    ['Type', 'École', 'Plan', 'Statut', 'Élèves', 'Ville', 'Directeur', 'Dernière connexion', 'Health'],
    ...alerts.map(a => [
      TYPE_LABELS[a.type],
      a.tenant.name,
      a.tenant.subscriptionPlan,
      a.tenant.subscriptionStatus,
      String(a.tenant.currentStudentCount),
      a.tenant.city ?? '',
      a.director?.email ?? '',
      a.director?.lastLoginAt ? new Date(a.director.lastLoginAt).toLocaleDateString('fr-FR') : 'Jamais',
      String(a.tenant.healthScore ?? ''),
    ]),
  ];
  const csv  = rows.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(';')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `alertes_${new Date().toISOString().slice(0,10)}.csv`;
  a.click(); URL.revokeObjectURL(url);
}

// ─── Panel Notes ──────────────────────────────────────────────────────────────

function NotesPanel({ tenantId, onClose }: { tenantId: string; onClose: () => void }) {
  const [notes,   setNotes]   = useState<TenantNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [input,   setInput]   = useState('');
  const [saving,  setSaving]  = useState(false);

  const load = useCallback(async () => {
    try { setNotes(await getTenantNotes(tenantId)); }
    catch { toast.error('Impossible de charger les notes'); }
    finally { setLoading(false); }
  }, [tenantId]);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    if (!input.trim()) return;
    setSaving(true);
    try {
      await addTenantNote(tenantId, input.trim());
      setInput('');
      await load();
    } catch { toast.error('Erreur ajout note'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (noteId: string) => {
    try { await deleteTenantNote(tenantId, noteId); await load(); }
    catch { toast.error('Erreur suppression'); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[70vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <StickyNote className="w-4 h-4 text-amber-500" />
            <span className="font-semibold text-gray-900">Notes internes</span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {loading ? (
            <p className="text-sm text-gray-400 text-center py-4">Chargement…</p>
          ) : notes.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">Aucune note pour cette école.</p>
          ) : notes.map(note => (
            <div key={note.id} className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-sm">
              <p className="text-gray-800 whitespace-pre-wrap">{note.content}</p>
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs text-gray-400">{note.authorEmail} · {timeAgo(note.createdAt)}</span>
                <button onClick={() => handleDelete(note.id)} className="text-gray-300 hover:text-red-500 transition">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="p-4 border-t border-gray-100">
          <div className="flex gap-2">
            <textarea
              value={input} onChange={e => setInput(e.target.value)}
              placeholder="Ajouter une note…"
              rows={2}
              className="flex-1 text-sm border border-gray-200 rounded-xl px-3 py-2 resize-none outline-none focus:ring-2 focus:ring-amber-200 focus:border-amber-300"
              onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleAdd(); }}
            />
            <button onClick={handleAdd} disabled={saving || !input.trim()}
              className="flex items-center justify-center w-10 h-10 self-end rounded-xl bg-amber-500 text-white hover:bg-amber-600 transition disabled:opacity-40">
              <Plus className="w-4 h-4" />
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-1">Ctrl+Entrée pour envoyer</p>
        </div>
      </div>
    </div>
  );
}

// ─── Panel Historique ─────────────────────────────────────────────────────────

function HistoryPanel({ tenantId, tenantName, onClose }: { tenantId: string; tenantName: string; onClose: () => void }) {
  const [activity, setActivity] = useState<TenantActivity[]>([]);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    getTenantRecentActivity(tenantId)
      .then(setActivity)
      .catch(() => toast.error('Impossible de charger l\'historique'))
      .finally(() => setLoading(false));
  }, [tenantId]);

  const ACTION_LABELS: Record<string, string> = {
    NEW_TENANT:     'Création',
    SUSPEND:        'Suspension',
    ACTIVATE:       'Réactivation',
    DELETE:         'Suppression',
    IMPERSONATE:    'Impersonation',
    PAYMENT_FAILED: 'Paiement échoué',
    LOGIN_ADMIN:    'Connexion admin',
    EXTEND_TRIAL:   'Extension trial',
    SEND_REMINDER:  'Rappel envoyé',
    UPDATE_TENANT:  'Mise à jour',
    CREATE_TENANT:  'Création',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[70vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-indigo-500" />
            <span className="font-semibold text-gray-900">Historique — {tenantName}</span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {loading ? (
            <p className="text-sm text-gray-400 text-center py-4">Chargement…</p>
          ) : activity.length === 0 ? (
            <div className="flex items-center gap-2 py-4 justify-center text-gray-400 text-sm">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              Aucune action enregistrée.
            </div>
          ) : activity.map(log => (
            <div key={log.id} className="flex items-start gap-3 py-2.5 border-b border-gray-50 last:border-0">
              <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-2 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800">{ACTION_LABELS[log.action] ?? log.action}</p>
                {log.actorEmail && <p className="text-xs text-gray-400">par {log.actorEmail}</p>}
                {log.details && Object.keys(log.details).length > 0 && (
                  <p className="text-xs text-gray-400 mt-0.5 truncate">
                    {Object.entries(log.details).map(([k,v]) => `${k}: ${v}`).join(' · ')}
                  </p>
                )}
              </div>
              <span className="text-xs text-gray-400 flex-shrink-0">{timeAgo(log.createdAt)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── AlertRow ─────────────────────────────────────────────────────────────────

function AlertRow({ item, accentColor, onAction, canAct, selected, onSelect }: {
  item:       AlertItem;
  accentColor: string;
  onAction:   () => void;
  canAct:     boolean;
  selected:   boolean;
  onSelect:   (id: string) => void;
}) {
  const [busy,           setBusy]           = useState(false);
  const [sendingReminder,setSendingReminder] = useState(false);
  const [notesOpen,      setNotesOpen]      = useState(false);
  const [historyOpen,    setHistoryOpen]    = useState(false);

  const handleToggle = async (e: React.MouseEvent) => {
    e.preventDefault(); setBusy(true);
    try {
      if (item.tenant.isActive) { await suspendTenant(item.tenant.id); toast.success(`${item.tenant.name} suspendu`); }
      else                      { await activateTenant(item.tenant.id); toast.success(`${item.tenant.name} réactivé`); }
      onAction();
    } catch (err: any) { toast.error(err.message ?? 'Erreur'); }
    finally { setBusy(false); }
  };

  const handleExtendTrial = async (e: React.MouseEvent, days: number) => {
    e.preventDefault(); setBusy(true);
    try { const res = await extendTrial(item.tenant.id, days); toast.success(res.message); onAction(); }
    catch (err: any) { toast.error(err.message ?? 'Erreur'); }
    finally { setBusy(false); }
  };

  const handleSendReminder = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!item.director?.email) return;
    setSendingReminder(true);
    try {
      const res = await sendReminder(item.tenant.id, EMAIL_SUBJECTS[item.type],
        `Bonjour,\n\nNous vous contactons au sujet de votre compte Structura.\n\nCordialement,\nL'équipe Structura`);
      toast.success(res.message);
    } catch (err: any) { toast.error(err.message ?? 'Erreur envoi email'); }
    finally { setSendingReminder(false); }
  };

  const handleSnooze = async (e: React.MouseEvent, days: number) => {
    e.preventDefault(); setBusy(true);
    try {
      await snoozeAlert(item.tenant.id, item.type, days);
      toast.success(`Alerte snoozée ${days}j`);
      window.dispatchEvent(new CustomEvent('alerts:refresh'));
      onAction();
    } catch (err: any) { toast.error(err.message ?? 'Erreur snooze'); }
    finally { setBusy(false); }
  };

  const emailHref = item.director?.email
    ? `mailto:${item.director.email}?subject=${encodeURIComponent(EMAIL_SUBJECTS[item.type])}`
    : null;

  const daysSinceCreated = item.tenant.createdAt
    ? Math.round((Date.now() - new Date(item.tenant.createdAt).getTime()) / 86_400_000)
    : null;

  return (
    <>
      {notesOpen   && <NotesPanel   tenantId={item.tenant.id} onClose={() => setNotesOpen(false)} />}
      {historyOpen && <HistoryPanel tenantId={item.tenant.id} tenantName={item.tenant.name} onClose={() => setHistoryOpen(false)} />}

      <div className={`relative flex items-start gap-4 px-6 py-5 border-b border-gray-100 last:border-0 transition ${selected ? 'bg-indigo-50/60' : 'hover:bg-slate-50/60'}`}>
        {/* Barre accent gauche */}
        <div className={`absolute left-0 top-5 bottom-5 w-1 rounded-r-full ${accentColor}`} />

        {/* Checkbox */}
        <button onClick={() => onSelect(item.tenant.id)} className="mt-1 flex-shrink-0 text-gray-300 hover:text-indigo-500 transition">
          {selected ? <CheckSquare className="w-5 h-5 text-indigo-500" /> : <Square className="w-5 h-5" />}
        </button>

        {/* Contenu */}
        <div className="flex-1 min-w-0">
          {/* Ligne 1 */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="text-base font-bold text-gray-900">{item.tenant.name}</span>
            {item.hoursLeft != null && (
              <span className="text-sm font-bold text-red-600 bg-red-50 border border-red-100 px-2.5 py-0.5 rounded-full">{hoursLabel(item.hoursLeft)}</span>
            )}
            {item.daysExpired != null && item.daysExpired > 0 && (
              <span className="text-sm font-bold text-red-700 bg-red-50 border border-red-200 px-2.5 py-0.5 rounded-full">Expiré depuis {item.daysExpired}j</span>
            )}
            {item.tenant.healthScore != null && (
              <span className={`text-sm font-semibold px-2.5 py-0.5 rounded-full border flex items-center gap-1 ${healthColor(item.tenant.healthScore)}`}>
                <Activity className="w-3.5 h-3.5" />{item.tenant.healthScore}
              </span>
            )}
          </div>

          {/* Label alerte */}
          <p className="text-sm font-medium text-gray-600 mt-1">{item.label}</p>

          {/* Méta */}
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-gray-500">
            <span>Plan <b className="text-gray-700">{item.tenant.subscriptionPlan}</b></span>
            <span className="flex items-center gap-1.5"><Users className="w-4 h-4" />{item.tenant.currentStudentCount} élève{item.tenant.currentStudentCount !== 1 ? 's' : ''}</span>
            {item.tenant.city && <span className="flex items-center gap-1.5"><MapPin className="w-4 h-4" />{item.tenant.city}</span>}
            {daysSinceCreated != null && <span className="flex items-center gap-1.5"><Calendar className="w-4 h-4" />Inscrit il y a {daysSinceCreated}j</span>}
            {item.director?.email && <span className="flex items-center gap-1.5"><Mail className="w-4 h-4" />{item.director.email}</span>}
            {item.director?.lastLoginAt
              ? <span className="flex items-center gap-1.5"><Clock className="w-4 h-4" />Connecté le {formatDate(item.director.lastLoginAt)}</span>
              : item.director !== null
                ? <span className="flex items-center gap-1.5 text-amber-500"><Clock className="w-4 h-4" />Jamais connecté</span>
                : null
            }
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
          {/* Extension trial */}
          {(item.type === 'TRIAL_EXPIRING_SOON' || item.type === 'TRIAL_EXPIRING_WEEK' || item.type === 'TRIAL_EXPIRED') && (
            <div className="flex items-center border border-cyan-200 rounded-lg overflow-hidden">
              <span className="px-2 py-1.5 text-sm font-bold text-cyan-600 bg-cyan-50 flex items-center"><Timer className="w-4 h-4" /></span>
              {[7, 14, 30].map((d) => (
                <button key={d} onClick={(e) => handleExtendTrial(e, d)} disabled={busy} title={`+${d} jours`}
                  className="px-2 py-1.5 text-sm font-bold text-cyan-700 hover:bg-cyan-50 border-l border-cyan-200 transition disabled:opacity-40">
                  +{d}j
                </button>
              ))}
            </div>
          )}

          {/* Snooze */}
          <div className="relative group">
            <button disabled={busy} title="Snoozer cette alerte"
              className="flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-amber-600 border border-gray-200 hover:border-amber-200 bg-white px-3 py-2 rounded-lg transition disabled:opacity-40">
              <BellOff className="w-4 h-4" />
            </button>
            <div className="absolute right-0 top-full mt-1 hidden group-hover:flex flex-col bg-white border border-gray-200 rounded-xl shadow-lg z-10 overflow-hidden min-w-[120px]">
              {[3, 7, 14].map(d => (
                <button key={d} onClick={(e) => handleSnooze(e, d)}
                  className="px-4 py-2.5 text-sm text-gray-700 hover:bg-amber-50 hover:text-amber-700 text-left transition">
                  Snoozer {d}j
                </button>
              ))}
            </div>
          </div>

          {/* Rappel backend */}
          {item.director?.email && (
            <button onClick={handleSendReminder} disabled={sendingReminder || busy} title={`Rappel à ${item.director.email}`}
              className="flex items-center gap-1.5 text-sm font-medium text-sky-600 hover:text-sky-700 border border-sky-200 hover:border-sky-300 bg-white px-3 py-2 rounded-lg transition disabled:opacity-40">
              <Send className="w-4 h-4" />
              <span className="hidden sm:block">{sendingReminder ? '…' : 'Rappel'}</span>
            </button>
          )}

          {/* Email mailto */}
          {emailHref && (
            <a href={emailHref} title={`Email à ${item.director?.email}`}
              className="flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-sky-600 border border-gray-200 hover:border-sky-200 bg-white px-3 py-2 rounded-lg transition">
              <Mail className="w-4 h-4" />
            </a>
          )}

          {/* Notes */}
          <button onClick={() => setNotesOpen(true)} title="Notes internes"
            className="flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-amber-600 border border-gray-200 hover:border-amber-200 bg-white px-3 py-2 rounded-lg transition">
            <StickyNote className="w-4 h-4" />
          </button>

          {/* Historique */}
          <button onClick={() => setHistoryOpen(true)} title="Historique des actions"
            className="flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-indigo-600 border border-gray-200 hover:border-indigo-200 bg-white px-3 py-2 rounded-lg transition">
            <History className="w-4 h-4" />
          </button>

          {/* Voir tenant */}
          <Link href={`/dashboard/tenants/${item.tenant.id}`}
            className="flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-indigo-600 border border-gray-200 hover:border-indigo-200 bg-white px-3 py-2 rounded-lg transition">
            <ArrowUpRight className="w-4 h-4" />
          </Link>

          {/* Suspendre / Réactiver */}
          {canAct && (
            <button onClick={handleToggle} disabled={busy}
              className="text-sm font-medium text-gray-500 hover:text-red-600 border border-gray-200 hover:border-red-200 bg-white px-3 py-2 rounded-lg transition disabled:opacity-40">
              {busy ? '…' : item.tenant.isActive ? 'Suspendre' : 'Réactiver'}
            </button>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Section collapsible ──────────────────────────────────────────────────────

const PAGE_SIZE = 5;

function Section({ title, icon, count, items, accentColor, onAction, canAct, emptyText, badgeClass, selected, onSelect }: {
  title: string; icon: React.ReactNode; count: number; items: AlertItem[];
  accentColor: string; onAction: () => void; canAct: boolean;
  emptyText: string; badgeClass: string;
  selected: Set<string>; onSelect: (id: string) => void;
}) {
  const [open,    setOpen]    = useState(true);
  const [visible, setVisible] = useState(PAGE_SIZE);

  // Réinitialiser la pagination quand les items changent (filtre, refresh)
  useEffect(() => { setVisible(PAGE_SIZE); }, [items.length]);

  const displayed = items.slice(0, visible);
  const remaining = items.length - visible;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-slate-50/60 transition text-left">
        <div className="flex items-center gap-2.5">
          {icon}
          <span className="text-sm font-semibold text-gray-900">{title}</span>
          <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${count === 0 ? 'bg-gray-50 text-gray-400 border-gray-100' : badgeClass}`}>{count}</span>
        </div>
        <div className="text-gray-400">{open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}</div>
      </button>
      {open && (
        <div className="border-t border-gray-50">
          {items.length === 0
            ? <div className="flex items-center gap-2.5 px-5 py-4"><CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" /><p className="text-sm text-gray-500">{emptyText}</p></div>
            : <>
                {displayed.map((item, i) => (
                  <AlertRow key={i} item={item} accentColor={accentColor} onAction={onAction} canAct={canAct} selected={selected.has(item.tenant.id)} onSelect={onSelect} />
                ))}
                {remaining > 0 && (
                  <button onClick={() => setVisible(v => v + PAGE_SIZE)}
                    className="w-full py-3 text-xs font-semibold text-gray-400 hover:text-gray-700 hover:bg-slate-50 transition border-t border-gray-50">
                    Voir {Math.min(remaining, PAGE_SIZE)} de plus ({remaining} restante{remaining > 1 ? 's' : ''})
                  </button>
                )}
                {visible > PAGE_SIZE && (
                  <button onClick={() => setVisible(PAGE_SIZE)}
                    className="w-full py-2 text-xs text-gray-300 hover:text-gray-500 hover:bg-slate-50 transition">
                    Réduire
                  </button>
                )}
              </>
          }
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AlertsPage() {
  const [data,        setData]        = useState<AlertsResponse | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [countdown,   setCountdown]   = useState(AUTO_REFRESH_SEC);

  // Filtres
  const [filterType, setFilterType] = useState<string>('');
  const [filterPlan, setFilterPlan] = useState<string>('');
  const [showFilters, setShowFilters] = useState(false);

  // Sélection pour bulk actions
  const [selected,    setSelected]    = useState<Set<string>>(new Set());
  const [bulkBusy,    setBulkBusy]    = useState(false);

  const timerRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true); else setLoading(true);
    try {
      const result = await getAlerts();
      setData(result);
      setLastUpdated(new Date());
      setCountdown(AUTO_REFRESH_SEC);
      setSelected(new Set());
    } catch {
      if (!silent) toast.error('Impossible de charger les alertes');
    } finally {
      setLoading(false); setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    timerRef.current     = setInterval(() => load(true), AUTO_REFRESH_SEC * 1000);
    countdownRef.current = setInterval(() => setCountdown(c => c <= 1 ? AUTO_REFRESH_SEC : c - 1), 1000);

    // Écouter les événements déclenchés après actions (snooze, etc.) → refresh immédiat
    const onRefresh = () => load(true);
    window.addEventListener('alerts:refresh', onRefresh);

    return () => {
      if (timerRef.current)    clearInterval(timerRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
      window.removeEventListener('alerts:refresh', onRefresh);
    };
  }, [load]);

  const handleManualRefresh = () => {
    if (timerRef.current)    clearInterval(timerRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
    load(true).then(() => {
      timerRef.current     = setInterval(() => load(true), AUTO_REFRESH_SEC * 1000);
      countdownRef.current = setInterval(() => setCountdown(c => c <= 1 ? AUTO_REFRESH_SEC : c - 1), 1000);
    });
  };

  const toggleSelect = (id: string) => {
    setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  };

  // Filtrage côté client
  const applyFilters = (items: AlertItem[]) => items.filter(a => {
    if (filterType && a.type !== filterType) return false;
    if (filterPlan && a.tenant.subscriptionPlan !== filterPlan) return false;
    return true;
  });

  const allItems = data ? [...(data.urgent), ...(data.warning), ...(data.info)] : [];
  const filteredUrgent  = data ? applyFilters(data.urgent)  : [];
  const filteredWarning = data ? applyFilters(data.warning) : [];
  const filteredInfo    = data ? applyFilters(data.info)    : [];
  const filteredAll     = [...filteredUrgent, ...filteredWarning, ...filteredInfo];

  // Bulk : envoyer rappel à tous les sélectionnés
  const handleBulkReminder = async () => {
    const targets = filteredAll.filter(a => selected.has(a.tenant.id) && a.director?.email);
    if (!targets.length) { toast.error('Aucune école sélectionnée avec un directeur'); return; }
    setBulkBusy(true);
    let ok = 0;
    for (const a of targets) {
      try {
        await sendReminder(a.tenant.id, EMAIL_SUBJECTS[a.type],
          `Bonjour,\n\nNous vous contactons au sujet de votre compte Structura.\n\nCordialement,\nL'équipe Structura`);
        ok++;
      } catch {}
    }
    toast.success(`${ok} rappel${ok > 1 ? 's' : ''} envoyé${ok > 1 ? 's' : ''}`);
    setBulkBusy(false);
    setSelected(new Set());
  };

  // Bulk : snoozer tous les sélectionnés
  const handleBulkSnooze = async (days: number) => {
    const targets = filteredAll.filter(a => selected.has(a.tenant.id));
    if (!targets.length) { toast.error('Aucune école sélectionnée'); return; }
    setBulkBusy(true);
    for (const a of targets) {
      try { await snoozeAlert(a.tenant.id, a.type, days); } catch {}
    }
    toast.success(`${targets.length} alerte${targets.length > 1 ? 's' : ''} snoozée${targets.length > 1 ? 's' : ''} ${days}j`);
    window.dispatchEvent(new CustomEvent('alerts:refresh'));
    setBulkBusy(false);
    await load(true);
  };

  const totalAlerts = data?.counts.total ?? 0;
  const hasFilters  = !!filterType || !!filterPlan;

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-6 py-6 space-y-5">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Alertes</h1>
            {totalAlerts > 0 && (
              <span className="text-xs font-bold text-white bg-red-500 px-2.5 py-0.5 rounded-full">{totalAlerts}</span>
            )}
          </div>
          <p className="text-sm text-gray-500 mt-0.5">Écoles nécessitant votre attention</p>
          {lastUpdated && (
            <p className="text-xs text-gray-400 mt-0.5">
              Actualisé {timeAgo(lastUpdated)} · prochain dans {Math.floor(countdown / 60)}:{String(countdown % 60).padStart(2, '0')}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Export CSV */}
          {!loading && allItems.length > 0 && (
            <button onClick={() => exportCSV(filteredAll.length ? filteredAll : allItems)} title="Exporter CSV"
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 bg-white border border-gray-200 hover:border-gray-300 px-3 py-2 rounded-xl shadow-sm transition">
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:block">CSV</span>
            </button>
          )}
          {/* Filtres */}
          <button onClick={() => setShowFilters(s => !s)}
            className={`flex items-center gap-1.5 text-sm bg-white border px-3 py-2 rounded-xl shadow-sm transition ${showFilters || hasFilters ? 'text-indigo-600 border-indigo-300' : 'text-gray-500 hover:text-gray-900 border-gray-200 hover:border-gray-300'}`}>
            <Filter className="w-3.5 h-3.5" />
            <span className="hidden sm:block">Filtres</span>
            {hasFilters && <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />}
          </button>
          {/* Refresh */}
          <button onClick={handleManualRefresh} disabled={refreshing}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 bg-white border border-gray-200 hover:border-gray-300 px-3 py-2 rounded-xl shadow-sm transition disabled:opacity-40">
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:block">Actualiser</span>
          </button>
        </div>
      </div>

      {/* ── Filtres ────────────────────────────────────────────────────────── */}
      {showFilters && (
        <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500">Type d'alerte</label>
            <select value={filterType} onChange={e => setFilterType(e.target.value)}
              className="text-sm border border-gray-200 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-200 bg-white">
              <option value="">Tous les types</option>
              {(Object.entries(TYPE_LABELS) as [AlertItem['type'], string][]).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500">Plan</label>
            <select value={filterPlan} onChange={e => setFilterPlan(e.target.value)}
              className="text-sm border border-gray-200 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-200 bg-white">
              <option value="">Tous les plans</option>
              <option value="FREE">FREE</option>
              <option value="PRO">PRO</option>
              <option value="PRO_PLUS">PRO PLUS</option>
            </select>
          </div>
          {hasFilters && (
            <button onClick={() => { setFilterType(''); setFilterPlan(''); }}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-red-600 border border-gray-200 hover:border-red-200 px-3 py-2 rounded-xl transition">
              <X className="w-3.5 h-3.5" /> Réinitialiser
            </button>
          )}
          {hasFilters && (
            <p className="text-xs text-gray-400 self-end pb-2">{filteredAll.length} résultat{filteredAll.length !== 1 ? 's' : ''}</p>
          )}
        </div>
      )}

      {/* ── Résumé ─────────────────────────────────────────────────────────── */}
      {data && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Urgentes',       count: data.counts.urgent,  Icon: AlertTriangle, bg: 'bg-red-50',    border: 'border-red-100',    text: 'text-red-600'   },
            { label: 'Avertissements', count: data.counts.warning, Icon: AlertCircle,   bg: 'bg-amber-50',  border: 'border-amber-100',  text: 'text-amber-700' },
            { label: 'Informations',   count: data.counts.info,    Icon: Info,          bg: 'bg-sky-50',    border: 'border-sky-100',    text: 'text-sky-700'   },
          ].map(({ label, count, Icon, bg, border, text }) => (
            <div key={label} className={`${bg} border ${border} rounded-2xl p-4 text-center`}>
              <Icon className={`w-4 h-4 mx-auto mb-1.5 ${text} opacity-60`} />
              <p className={`text-3xl font-bold tracking-tight ${text}`}>{count}</p>
              <p className={`text-xs font-semibold uppercase tracking-wide mt-1.5 ${text}`}>{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Bulk actions bar ───────────────────────────────────────────────── */}
      {selected.size > 0 && (
        <div className="sticky top-4 z-20 bg-indigo-600 text-white rounded-2xl px-5 py-3 shadow-lg flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <CheckSquare className="w-4 h-4" />
            <span className="text-sm font-semibold">{selected.size} école{selected.size > 1 ? 's' : ''} sélectionnée{selected.size > 1 ? 's' : ''}</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleBulkReminder} disabled={bulkBusy}
              className="flex items-center gap-1.5 text-xs font-semibold bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg transition disabled:opacity-40">
              <Send className="w-3 h-3" /> Rappel groupé
            </button>
            <div className="relative group">
              <button disabled={bulkBusy}
                className="flex items-center gap-1.5 text-xs font-semibold bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg transition disabled:opacity-40">
                <BellOff className="w-3 h-3" /> Snoozer
              </button>
              <div className="absolute right-0 top-full mt-1 hidden group-hover:flex flex-col bg-white border border-gray-200 rounded-xl shadow-lg z-10 overflow-hidden">
                {[3, 7, 14].map(d => (
                  <button key={d} onClick={() => handleBulkSnooze(d)}
                    className="px-4 py-2 text-xs text-gray-700 hover:bg-amber-50 hover:text-amber-700 text-left transition whitespace-nowrap">
                    Snoozer {d}j
                  </button>
                ))}
              </div>
            </div>
            <button onClick={() => setSelected(new Set())}
              className="text-xs font-semibold bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg transition">
              <X className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

      {/* ── Sections ───────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => <div key={i} className="skeleton h-[72px] rounded-2xl" />)}
        </div>
      ) : (
        <div className="space-y-4">
          <Section title="Urgentes"       icon={<AlertTriangle className="w-4 h-4 text-red-500" />}   count={filteredUrgent.length}  items={filteredUrgent}  accentColor="bg-red-400"   onAction={() => load(true)} canAct  emptyText="Aucune alerte urgente — tout est en ordre." badgeClass="bg-red-50 text-red-600 border-red-100"     selected={selected} onSelect={toggleSelect} />
          <Section title="Avertissements" icon={<AlertCircle   className="w-4 h-4 text-amber-500" />} count={filteredWarning.length} items={filteredWarning} accentColor="bg-amber-400" onAction={() => load(true)} canAct={false} emptyText="Aucun avertissement en cours." badgeClass="bg-amber-50 text-amber-700 border-amber-100" selected={selected} onSelect={toggleSelect} />
          <Section title="Informations"   icon={<Info          className="w-4 h-4 text-sky-500" />}   count={filteredInfo.length}    items={filteredInfo}    accentColor="bg-sky-400"   onAction={() => load(true)} canAct={false} emptyText="Aucune information particulière."    badgeClass="bg-sky-50 text-sky-700 border-sky-100"     selected={selected} onSelect={toggleSelect} />
        </div>
      )}

      {/* ── Légende health score ─────────────────────────────────────────── */}
      {!loading && (
        <div className="flex items-center gap-4 pt-1">
          <p className="text-xs text-gray-500 font-medium">Health score :</p>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-xs text-emerald-600"><span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />≥ 70 — Actif</span>
            <span className="flex items-center gap-1.5 text-xs text-amber-600"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />40–69 — À surveiller</span>
            <span className="flex items-center gap-1.5 text-xs text-red-600"><span className="w-2 h-2 rounded-full bg-red-400 inline-block" />&lt;40 — Risque churn</span>
          </div>
        </div>
      )}
    </div>
  );
}
