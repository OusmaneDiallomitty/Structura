'use client';

import { useState, useEffect } from 'react';
import { ShieldCheck, Mail, User, Lock, Eye, EyeOff, Check, X } from 'lucide-react';
import { changePassword } from '@/lib/api';
import { getStoredUser, type AdminUser } from '@/lib/auth';
import { toast } from 'sonner';

// ─── PasswordField ────────────────────────────────────────────────────────────

function PasswordField({ id, label, value, onChange }: {
  id: string; label: string; value: string; onChange: (v: string) => void;
}) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="••••••••••"
          className="w-full border border-gray-200 rounded-xl px-4 py-3 pr-11 text-sm text-gray-900 placeholder-gray-400
                     focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition bg-white"
        />
        <button type="button" onClick={() => setShow((s) => !s)} tabIndex={-1}
          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition">
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}

// ─── StrengthMeter ────────────────────────────────────────────────────────────

const RULES = [
  { label: '8 caractères min.', test: (p: string) => p.length >= 8 },
  { label: 'Une majuscule',     test: (p: string) => /[A-Z]/.test(p) },
  { label: 'Un chiffre',        test: (p: string) => /[0-9]/.test(p) },
  { label: 'Caractère spécial', test: (p: string) => /[^A-Za-z0-9]/.test(p) },
];
const BAR_COLORS = ['', 'bg-red-400', 'bg-orange-400', 'bg-yellow-400', 'bg-emerald-500'];
const SCORE_LABEL = ['', 'Faible', 'Acceptable', 'Bien', 'Fort'];

function StrengthMeter({ password }: { password: string }) {
  if (!password) return null;
  const score = RULES.filter((r) => r.test(password)).length;
  return (
    <div className="mt-3 space-y-2.5">
      <div className="flex items-center gap-2">
        <div className="flex gap-1 flex-1">
          {[1, 2, 3, 4].map((i) => (
            <div key={i}
              className={`h-1.5 flex-1 rounded-full transition-all duration-400 ${i <= score ? BAR_COLORS[score] : 'bg-gray-100'}`} />
          ))}
        </div>
        <span className={`text-xs font-bold ${score === 4 ? 'text-emerald-600' : score >= 2 ? 'text-yellow-600' : 'text-red-500'}`}>
          {SCORE_LABEL[score]}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        {RULES.map((r) => {
          const ok = r.test(password);
          return (
            <div key={r.label} className={`flex items-center gap-1.5 text-xs transition ${ok ? 'text-emerald-600' : 'text-gray-500'}`}>
              {ok ? <Check className="w-3 h-3 text-emerald-500 flex-shrink-0" />
                  : <X className="w-3 h-3 text-gray-400 flex-shrink-0" />}
              {r.label}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AccountPage() {
  const [user,    setUser]    = useState<AdminUser | null>(null);
  const [current, setCurrent] = useState('');
  const [newPwd,  setNewPwd]  = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  // Lecture localStorage côté client uniquement
  useEffect(() => { setUser(getStoredUser()); }, []);

  const score    = RULES.filter((r) => r.test(newPwd)).length;
  const isMatch  = newPwd === confirm && confirm !== '';
  const canSubmit = Boolean(current && score >= 3 && isMatch && !loading);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    try {
      await changePassword(current, newPwd);
      toast.success('Mot de passe modifié avec succès');
      setCurrent(''); setNewPwd(''); setConfirm('');
    } catch (err: any) {
      toast.error(err.message ?? 'Mot de passe actuel incorrect');
    } finally { setLoading(false); }
  };

  return (
    <div className="max-w-3xl mx-auto px-6 md:px-8 py-8 space-y-6">

      {/* Header */}
      <div className="animate-fade-in">
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Mon compte</h1>
        <p className="text-sm text-gray-500 mt-1">Informations et sécurité du compte administrateur</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Profil */}
        <div className="space-y-4 animate-fade-in-up anim-delay-1">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">

            {/* Avatar */}
            <div className="flex items-center gap-4 mb-6 pb-6 border-b border-gray-50">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center text-white text-2xl font-bold flex-shrink-0 shadow-lg shadow-brand-200/50 select-none">
                {user?.firstName?.[0]?.toUpperCase() ?? '?'}
              </div>
              <div className="min-w-0">
                <p className="text-[17px] font-bold text-gray-900 leading-tight">
                  {user ? `${user.firstName} ${user.lastName}` : '…'}
                </p>
                <div className="flex items-center gap-1.5 mt-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-brand-500" />
                  <span className="text-xs font-semibold text-brand-600">Super Admin</span>
                </div>
              </div>
            </div>

            {/* Infos */}
            <div className="space-y-4">
              {[
                { icon: User, label: 'Prénom', value: user?.firstName },
                { icon: User, label: 'Nom',    value: user?.lastName  },
                { icon: Mail, label: 'E-mail', value: user?.email     },
              ].map(({ icon: Icon, label, value }) => (
                <div key={label} className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Icon className="w-3.5 h-3.5 text-gray-400" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">{label}</p>
                    <p className="text-sm font-semibold text-gray-900 mt-0.5 break-all">{value ?? '—'}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Conseils sécurité */}
          <div className="bg-amber-50 border border-amber-100 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <ShieldCheck className="w-4 h-4 text-amber-600" />
              <p className="text-sm font-semibold text-amber-900">Bonnes pratiques</p>
            </div>
            <ul className="space-y-1.5">
              {[
                'Mot de passe de 12+ caractères',
                'Ne jamais partager vos accès Super Admin',
                'Changer de mot de passe tous les 90 jours',
                'Se déconnecter sur tout poste partagé',
              ].map((tip) => (
                <li key={tip} className="flex items-start gap-2 text-sm text-amber-700">
                  <span className="text-amber-400 mt-0.5 flex-shrink-0">•</span>{tip}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Changer le mot de passe */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 animate-fade-in-up anim-delay-2">
          <div className="flex items-center gap-2.5 mb-6 pb-5 border-b border-gray-50">
            <div className="w-8 h-8 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center flex-shrink-0">
              <Lock className="w-3.5 h-3.5 text-gray-400" />
            </div>
            <h2 className="text-base font-semibold text-gray-900">Changer le mot de passe</h2>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <PasswordField id="current" label="Mot de passe actuel" value={current} onChange={setCurrent} />

            <div>
              <PasswordField id="new" label="Nouveau mot de passe" value={newPwd} onChange={setNewPwd} />
              <StrengthMeter password={newPwd} />
            </div>

            <div>
              <PasswordField id="confirm" label="Confirmer le mot de passe" value={confirm} onChange={setConfirm} />
              {confirm && (
                <p className={`mt-2 text-sm flex items-center gap-1.5 font-medium ${isMatch ? 'text-emerald-600' : 'text-red-500'}`}>
                  {isMatch
                    ? <><Check className="w-3.5 h-3.5" />Les mots de passe correspondent</>
                    : <><X className="w-3.5 h-3.5" />Ne correspondent pas</>
                  }
                </p>
              )}
            </div>

            <button type="submit" disabled={!canSubmit}
              className="w-full bg-brand-600 hover:bg-brand-700 active:bg-brand-800 text-white text-sm font-semibold py-3 rounded-xl transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed mt-2 shadow-sm shadow-brand-200">
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/50 border-t-white rounded-full animate-spin" />
                  Modification en cours…
                </span>
              ) : 'Modifier le mot de passe'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
