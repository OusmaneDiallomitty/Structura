'use client';

import { useState }    from 'react';
import { useRouter }   from 'next/navigation';
import { ArrowLeft, Building2, Mail, CheckCircle } from 'lucide-react';
import { toast }       from 'sonner';
import { createTenantAdmin } from '@/lib/api';

const TYPES = [
  { value: 'school',      label: 'École (maternelle, primaire, secondaire, lycée)' },
  { value: 'university',  label: 'Université / Institut' },
  { value: 'training',    label: 'Centre de formation / École technique' },
  { value: 'other',       label: 'Autre établissement' },
];

const COUNTRIES = [
  { value: 'GN',    label: '🇬🇳 Guinée' },
  { value: 'SN',    label: '🇸🇳 Sénégal' },
  { value: 'CI',    label: '🇨🇮 Côte d\'Ivoire' },
  { value: 'ML',    label: '🇲🇱 Mali' },
  { value: 'BF',    label: '🇧🇫 Burkina Faso' },
  { value: 'BJ',    label: '🇧🇯 Bénin' },
  { value: 'NE',    label: '🇳🇪 Niger' },
  { value: 'TG',    label: '🇹🇬 Togo' },
  { value: 'CM',    label: '🇨🇲 Cameroun' },
  { value: 'MR',    label: '🇲🇷 Mauritanie' },
  { value: 'OTHER', label: '🌍 Autre pays' },
];

export default function NewTenantPage() {
  const router = useRouter();
  const [busy,    setBusy]    = useState(false);
  const [success, setSuccess] = useState<{ id: string; name: string; email: string } | null>(null);

  const [form, setForm] = useState({
    name:               '',
    type:               TYPES[0].value,
    country:            'GN',
    city:               'Conakry',
    directorEmail:      '',
    directorFirstName:  '',
    directorLastName:   '',
    trialDays:          14,
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: name === 'trialDays' ? Number(value) : value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.directorEmail.trim() || !form.directorFirstName.trim() || !form.directorLastName.trim()) {
      toast.error('Tous les champs obligatoires (*) doivent être remplis');
      return;
    }
    setBusy(true);
    try {
      const res = await createTenantAdmin(form);
      setSuccess({ id: res.tenant.id, name: res.tenant.name, email: res.director.email });
      toast.success(res.message);
    } catch (e: any) {
      toast.error(e.message ?? 'Erreur lors de la création');
    } finally {
      setBusy(false);
    }
  };

  // ─── Succès ────────────────────────────────────────────────────────────────

  if (success) {
    return (
      <div className="max-w-xl mx-auto px-6 py-16 text-center space-y-6">
        <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto">
          <CheckCircle className="w-8 h-8 text-emerald-500" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-gray-900">École créée !</h2>
          <p className="text-sm text-gray-500 mt-2">
            <strong>{success.name}</strong> a été créée avec succès.<br />
            Une invitation a été envoyée à <strong>{success.email}</strong>.
          </p>
        </div>
        <div className="flex gap-3 justify-center">
          <button
            onClick={() => router.push(`/dashboard/tenants/${success.id}`)}
            className="px-5 py-2.5 bg-brand-600 text-white font-medium text-sm rounded-xl hover:bg-brand-700 transition"
          >
            Voir l'école
          </button>
          <button
            onClick={() => { setSuccess(null); setForm({ name: '', type: TYPES[0].value, country: 'GN', city: 'Conakry', directorEmail: '', directorFirstName: '', directorLastName: '', trialDays: 14 }); }}
            className="px-5 py-2.5 border border-gray-200 text-gray-600 font-medium text-sm rounded-xl hover:bg-gray-50 transition"
          >
            Créer une autre école
          </button>
        </div>
      </div>
    );
  }

  // ─── Formulaire ────────────────────────────────────────────────────────────

  return (
    <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">

      {/* Retour */}
      <button
        onClick={() => router.back()}
        className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Retour
      </button>

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center">
          <Building2 className="w-5 h-5 text-brand-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Nouvelle école</h1>
          <p className="text-sm text-gray-400 mt-0.5">Créer un compte manuellement depuis le panneau admin</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">

        {/* ─── Infos école ──────────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Établissement</h2>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Nom de l'école <span className="text-red-400">*</span>
            </label>
            <input
              name="name" value={form.name} onChange={handleChange} required
              placeholder="ex : École Primaire Les Étoiles"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm
                         focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Type d'établissement</label>
              <select
                name="type" value={form.type} onChange={handleChange}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm
                           focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Pays <span className="text-red-400">*</span>
              </label>
              <select
                name="country" value={form.country} onChange={(e) => {
                  const val = e.target.value;
                  const capitals: Record<string, string> = { GN: 'Conakry', SN: 'Dakar', CI: 'Abidjan', ML: 'Bamako', BF: 'Ouagadougou', BJ: 'Cotonou', NE: 'Niamey', TG: 'Lomé', CM: 'Yaoundé', MR: 'Nouakchott' };
                  setForm((f) => ({ ...f, country: val, city: capitals[val] ?? f.city }));
                }}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm
                           focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                {COUNTRIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Ville</label>
              <input
                name="city" value={form.city} onChange={handleChange}
                placeholder="ex : Conakry"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm
                           focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Jours d'essai offerts</label>
              <input
                type="number" name="trialDays" value={form.trialDays} onChange={handleChange}
                min={1} max={365}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm
                           focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>
        </div>

        {/* ─── Directeur ────────────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Mail className="w-4 h-4 text-gray-400" />
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Directeur</h2>
          </div>
          <p className="text-xs text-gray-400">
            Une invitation sera envoyée à cette adresse pour configurer son mot de passe.
          </p>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Email <span className="text-red-400">*</span>
            </label>
            <input
              type="email" name="directorEmail" value={form.directorEmail} onChange={handleChange} required
              placeholder="directeur@ecole.com"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm
                         focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Prénom <span className="text-red-400">*</span>
              </label>
              <input
                name="directorFirstName" value={form.directorFirstName} onChange={handleChange} required
                placeholder="ex : Mamadou"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm
                           focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Nom <span className="text-red-400">*</span>
              </label>
              <input
                name="directorLastName" value={form.directorLastName} onChange={handleChange} required
                placeholder="ex : Diallo"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm
                           focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>
        </div>

        {/* ─── Submit ───────────────────────────────────────────────────────── */}
        <div className="flex gap-3">
          <button
            type="submit" disabled={busy}
            className="flex-1 py-3 bg-brand-600 text-white font-semibold text-sm rounded-xl
                       hover:bg-brand-700 transition disabled:opacity-50"
          >
            {busy ? 'Création en cours…' : 'Créer l\'école'}
          </button>
          <button
            type="button" onClick={() => router.back()}
            className="px-6 py-3 border border-gray-200 text-gray-600 font-medium text-sm
                       rounded-xl hover:bg-gray-50 transition"
          >
            Annuler
          </button>
        </div>
      </form>
    </div>
  );
}
