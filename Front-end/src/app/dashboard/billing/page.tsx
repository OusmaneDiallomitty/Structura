'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import * as storage from '@/lib/storage';
import {
  getSubscriptionStatus,
  createCheckout,
  SubscriptionStatus,
} from '@/lib/api/subscriptions.service';
import { invalidateSubscriptionCache } from '@/hooks/use-subscription';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Check,
  Zap,
  Crown,
  AlertCircle,
  Calendar,
  CreditCard,
} from 'lucide-react';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatGNF(amount: number): string {
  return new Intl.NumberFormat('fr-GN', {
    style: 'currency',
    currency: 'GNF',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

// ─── Feature labels ───────────────────────────────────────────────────────────

const FEATURE_LABELS: Record<string, string> = {
  // FREE
  payments:            'Suivi des paiements (offline)',
  grades:              'Saisie et consultation des notes (offline)',
  offlineWrite:        'Mode offline complet',
  multiUser:           '2 utilisateurs (directeur + 1)',
  // PRO
  bulletins:           'Bulletins PDF + reçus PDF',
  exportCSV:           'Export CSV des données',
  importCSV:           'Import CSV élèves',
  multipleYears:       'Plusieurs années scolaires',
  // PRO+
  logoOnPdf:           'Logo école sur tous les PDF',
  bulkBulletins:       'Bulletins en masse (ZIP par classe)',
  advancedReports:     'Rapports financiers avancés',
  unlimitedUsers:      'Équipe illimitée',
  parentNotifications: 'Notifications email aux parents',
};

// Features affichées dans chaque carte plan
const FREE_FEATURES    = ['payments', 'grades', 'offlineWrite', 'multiUser'];
const PRO_FEATURES     = [...FREE_FEATURES, 'bulletins', 'exportCSV', 'importCSV', 'multipleYears'];
const PRO_PLUS_FEATURES = [...PRO_FEATURES, 'logoOnPdf', 'bulkBulletins', 'advancedReports', 'unlimitedUsers', 'parentNotifications'];

// ─── Composant principal ──────────────────────────────────────────────────────

export default function BillingPage() {
  const { user } = useAuth();
  const [status, setStatus] = useState<SubscriptionStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<'PRO' | 'PRO_PLUS'>('PRO');
  const [selectedPeriod, setSelectedPeriod] = useState<'monthly' | 'annual'>('monthly');
  const [payerNumber, setPayerNumber] = useState('');
  const [paying, setPaying] = useState(false);

  const loadStatus = useCallback(async () => {
    const token = storage.getAuthItem('structura_token');
    if (!token) return;
    try {
      const data = await getSubscriptionStatus(token);
      setStatus(data);
      // Invalider le cache du hook useSubscription pour que le reste de l'app
      // reflète immédiatement le nouveau plan après un paiement
      invalidateSubscriptionCache();
    } catch {
      toast.error('Impossible de charger les informations d\'abonnement');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();

    const url = new URL(window.location.href);
    if (url.searchParams.get('cancelled') === '1') {
      toast.info('Paiement annulé. Vous pouvez réessayer à tout moment.');
      url.searchParams.delete('cancelled');
      window.history.replaceState({}, '', url.toString());
    }
  }, [loadStatus]);

  const handleUpgrade = (plan: 'PRO' | 'PRO_PLUS') => {
    setSelectedPlan(plan);
    setShowUpgradeDialog(true);
  };

  const handlePay = async () => {
    if (!payerNumber.trim()) {
      toast.error('Veuillez entrer votre numéro de téléphone');
      return;
    }

    // Normaliser le numéro (ajouter 00224 si numéro local guinéen)
    let phone = payerNumber.trim().replace(/\s+/g, '');
    if (phone.startsWith('6') && phone.length === 9) phone = `00224${phone}`;
    else if (phone.startsWith('0') && phone.length === 9) phone = `00224${phone.substring(1)}`;
    else if (!phone.startsWith('00') && !phone.startsWith('+')) phone = `00224${phone}`;

    const token = storage.getAuthItem('structura_token');
    if (!token) { toast.error('Session expirée'); return; }

    setPaying(true);
    try {
      const result = await createCheckout(token, selectedPlan, selectedPeriod, phone);
      window.location.href = result.paymentUrl;
    } catch (err) {
      toast.error((err as Error).message || 'Erreur lors de la création du paiement');
      setPaying(false);
    }
  };

  const selectedPrice = status?.pricing
    ? status.pricing[selectedPlan][selectedPeriod]
    : 0;

  // ─── Skeleton ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="p-6 space-y-4 max-w-5xl mx-auto">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!status) return null;

  const isPlanFree    = status.plan.key === 'FREE';
  const isPlanPro     = status.plan.key === 'PRO';
  const isPlanProPlus = status.plan.key === 'PRO_PLUS';

  // ─── Rendu ─────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">

      {/* En-tête */}
      <div>
        <h1 className="text-2xl font-bold">Abonnement</h1>
        <p className="text-muted-foreground mt-1">
          Gérez votre plan et accédez à toutes les fonctionnalités de Structura
        </p>
      </div>

      {/* Plan actuel */}
      <div className="border rounded-xl p-6 space-y-4 bg-card">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">Plan actuel</h2>
              <Badge variant={isPlanFree ? 'secondary' : isPlanProPlus ? 'default' : 'outline'}>
                {status.plan.name}
              </Badge>
              <Badge
                variant={status.status === 'ACTIVE' ? 'default' : status.status === 'TRIALING' ? 'outline' : 'destructive'}
                className="text-xs"
              >
                {status.status === 'ACTIVE'   ? 'Actif'
                : status.status === 'TRIALING' ? 'Période d\'essai'
                : status.status === 'EXPIRED'  ? 'Expiré'
                : status.status}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">{status.plan.description}</p>
          </div>

          {!isPlanFree && status.period.end && (
            <div className="text-right text-sm">
              <p className="text-muted-foreground flex items-center gap-1 justify-end">
                <Calendar className="w-3 h-3" />
                Expire le
              </p>
              <p className="font-medium">{formatDate(status.period.end)}</p>
            </div>
          )}
        </div>

        {/* Usage */}
        <div className="grid grid-cols-3 gap-4 pt-4 border-t">
          <UsageStat label="Élèves"       current={status.usage.students.current} limit={status.usage.students.limit} />
          <UsageStat label="Classes"      current={status.usage.classes.current}  limit={status.usage.classes.limit} />
          <UsageStat label="Utilisateurs" current={status.usage.users.current}    limit={status.usage.users.limit} />
        </div>
      </div>

      {/* Alerte plan FREE */}
      {isPlanFree && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
          <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-amber-800">Passez au plan Pro pour débloquer plus de fonctionnalités</p>
            <p className="text-sm text-amber-700 mt-0.5">
              Bulletins PDF, reçus PDF, import/export CSV, plusieurs années scolaires et jusqu'à 5 membres.
            </p>
          </div>
        </div>
      )}

      {/* Plans disponibles */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Choisissez votre plan</h2>
        <div className="grid md:grid-cols-3 gap-4">

          {/* Plan FREE */}
          <PlanCard
            name="Gratuit"
            theme="gray"
            icon={null}
            monthlyPrice={0}
            annualPrice={0}
            isCurrent={isPlanFree}
            isLower={false}
            features={FREE_FEATURES}
            featureLabels={FEATURE_LABELS}
            note="2 utilisateurs max · 1 année scolaire"
            onUpgrade={() => {}}
            isFree
          />

          {/* Plan PRO */}
          <PlanCard
            name="Pro"
            theme="blue"
            icon={<Zap className="w-5 h-5 text-blue-500" />}
            monthlyPrice={status.pricing.PRO.monthly}
            annualPrice={status.pricing.PRO.annual}
            isCurrent={isPlanPro}
            isLower={isPlanProPlus}
            features={PRO_FEATURES}
            featureLabels={FEATURE_LABELS}
            note="5 utilisateurs max · Historique illimité"
            savingsLabel="2 mois offerts"
            onUpgrade={() => handleUpgrade('PRO')}
          />

          {/* Plan PRO+ */}
          <PlanCard
            name="Pro+"
            theme="purple"
            icon={<Crown className="w-5 h-5 text-purple-500" />}
            monthlyPrice={status.pricing.PRO_PLUS.monthly}
            annualPrice={status.pricing.PRO_PLUS.annual}
            isCurrent={isPlanProPlus}
            isLower={false}
            highlighted
            features={PRO_PLUS_FEATURES}
            featureLabels={FEATURE_LABELS}
            note="Équipe illimitée · Tout inclus"
            savingsLabel="3 mois offerts"
            onUpgrade={() => handleUpgrade('PRO_PLUS')}
          />

        </div>
      </div>

      {/* Historique des paiements (placeholder) */}
      <div className="border rounded-xl p-6">
        <h2 className="text-lg font-semibold mb-2">Historique des paiements</h2>
        <p className="text-sm text-muted-foreground">
          Les paiements effectués via Djomy apparaîtront ici.
        </p>
      </div>

      {/* Dialog paiement */}
      <Dialog open={showUpgradeDialog} onOpenChange={setShowUpgradeDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Passer au plan {selectedPlan === 'PRO' ? 'Pro' : 'Pro+'}
            </DialogTitle>
            <DialogDescription>
              Entrez votre numéro, choisissez la durée, puis sélectionnez votre moyen de paiement
              sur le portail Djomy (Orange Money, MTN MoMo ou carte bancaire).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            {/* Sélection de la période */}
            <div>
              <label className="text-sm font-medium mb-2 block">Durée</label>
              <div className="grid grid-cols-2 gap-2">
                <PeriodButton
                  label="Mensuel"
                  price={status?.pricing[selectedPlan].monthly ?? 0}
                  selected={selectedPeriod === 'monthly'}
                  onClick={() => setSelectedPeriod('monthly')}
                />
                <PeriodButton
                  label={
                    <span>
                      Annuel{' '}
                      <span className="text-green-600 font-semibold text-xs">
                        {selectedPlan === 'PRO' ? '2 mois offerts' : '3 mois offerts'}
                      </span>
                    </span>
                  }
                  price={status?.pricing[selectedPlan].annual ?? 0}
                  selected={selectedPeriod === 'annual'}
                  onClick={() => setSelectedPeriod('annual')}
                />
              </div>
            </div>

            {/* Numéro de téléphone */}
            <div>
              <label className="text-sm font-medium mb-2 block">Numéro de téléphone</label>
              <input
                type="tel"
                value={payerNumber}
                onChange={(e) => setPayerNumber(e.target.value)}
                placeholder="Ex : 622 00 00 00"
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Orange Money, MTN MoMo ou numéro lié à votre carte
              </p>
            </div>

            {/* Récapitulatif */}
            <div className="bg-muted rounded-lg p-3 flex items-center justify-between">
              <span className="text-sm">Total à payer</span>
              <span className="font-bold text-lg">{formatGNF(selectedPrice)}</span>
            </div>

            {/* Bouton payer */}
            <Button
              onClick={handlePay}
              disabled={paying}
              className="w-full"
              size="lg"
            >
              {paying ? (
                'Redirection vers Djomy...'
              ) : (
                <>
                  <CreditCard className="w-4 h-4 mr-2" />
                  Payer {formatGNF(selectedPrice)}
                </>
              )}
            </Button>

            <p className="text-xs text-center text-muted-foreground">
              Paiement sécurisé via Djomy · Orange Money · MTN MoMo · Carte bancaire
            </p>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}

// ─── Sous-composants ──────────────────────────────────────────────────────────

function UsageStat({ label, current, limit }: {
  label: string;
  current: number;
  limit: number | null;
}) {
  const percentage = limit ? Math.min((current / limit) * 100, 100) : 0;
  const isNearLimit = limit && current >= limit * 0.8;

  return (
    <div className="text-center">
      <p className={`text-2xl font-bold ${isNearLimit ? 'text-amber-600' : ''}`}>{current}</p>
      <p className="text-xs text-muted-foreground mt-0.5">
        {limit === null ? `${label} (illimité)` : `${label} / ${limit}`}
      </p>
      {limit && (
        <div className="mt-1.5 h-1 bg-muted rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${isNearLimit ? 'bg-amber-400' : 'bg-primary'}`}
            style={{ width: `${percentage}%` }}
          />
        </div>
      )}
    </div>
  );
}

function PlanCard({
  name, theme, icon, monthlyPrice, annualPrice, isCurrent, isLower,
  highlighted = false, isFree = false, features, featureLabels,
  note, savingsLabel, onUpgrade,
}: {
  name: string;
  theme: 'gray' | 'blue' | 'purple';
  icon: React.ReactNode;
  monthlyPrice: number;
  annualPrice: number;
  isCurrent: boolean;
  isLower: boolean;
  highlighted?: boolean;
  isFree?: boolean;
  features: string[];
  featureLabels: Record<string, string>;
  note?: string;
  savingsLabel?: string;
  onUpgrade: () => void;
}) {
  const themes = {
    gray: {
      card:   'border-gray-200 bg-gray-50/50',
      header: 'bg-gray-100 border-b border-gray-200',
      ring:   'ring-2 ring-gray-400',
      badge:  'bg-gray-200 text-gray-700',
      btn:    'bg-gray-200 hover:bg-gray-300 text-gray-700 cursor-default',
      btnActive: 'bg-gray-200 text-gray-500',
      check:  'text-gray-400',
    },
    blue: {
      card:   'border-blue-200 bg-blue-50/30',
      header: 'bg-blue-600 text-white',
      ring:   'ring-2 ring-blue-500',
      badge:  'bg-blue-100 text-blue-700',
      btn:    'bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-200',
      btnActive: 'bg-blue-100 text-blue-600',
      check:  'text-blue-500',
    },
    purple: {
      card:   'border-purple-300 bg-purple-50/30',
      header: 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white',
      ring:   'ring-2 ring-purple-500',
      badge:  'bg-purple-100 text-purple-700',
      btn:    'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white shadow-md shadow-purple-200',
      btnActive: 'bg-purple-100 text-purple-600',
      check:  'text-purple-500',
    },
  };

  const t = themes[theme];
  const isDisabled = isCurrent || isLower || isFree;

  return (
    <div className={`border rounded-xl flex flex-col overflow-hidden ${t.card} ${isCurrent ? t.ring : ''}`}>

      {/* Header coloré */}
      <div className={`px-5 py-4 ${t.header}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {theme !== 'gray' && icon}
            <span className="font-bold text-lg">{name}</span>
          </div>
          {isCurrent && (
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${theme === 'gray' ? 'bg-gray-300 text-gray-700' : 'bg-white/20 text-white'}`}>
              Plan actuel
            </span>
          )}
          {isLower && !isCurrent && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-white/20 text-white">Inclus</span>
          )}
          {highlighted && !isCurrent && !isLower && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-white/20 text-white">⭐ Populaire</span>
          )}
        </div>

        {isFree ? (
          <div className="mt-2">
            <span className="text-2xl font-bold">Gratuit</span>
            <p className="text-xs opacity-70 mt-0.5">Pour toujours</p>
          </div>
        ) : (
          <div className="mt-2">
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-bold">{formatGNF(monthlyPrice)}</span>
              <span className="text-sm opacity-80">/mois</span>
            </div>
            <p className="text-xs opacity-70">
              {formatGNF(annualPrice)}/an
              {savingsLabel && <span className="ml-1 font-semibold text-green-300">· {savingsLabel}</span>}
            </p>
          </div>
        )}
      </div>

      {/* Corps */}
      <div className="p-5 space-y-4 flex flex-col flex-1">
        {note && (
          <p className="text-xs text-muted-foreground">{note}</p>
        )}

        <ul className="space-y-1.5 flex-1">
          {features.map((f) => (
            <li key={f} className="flex items-start gap-2 text-sm">
              <Check className={`w-4 h-4 shrink-0 mt-0.5 ${t.check}`} />
              <span>{featureLabels[f]}</span>
            </li>
          ))}
        </ul>

        <button
          onClick={isDisabled ? undefined : onUpgrade}
          disabled={isDisabled}
          className={`w-full mt-auto py-2.5 px-4 rounded-lg text-sm font-semibold transition-all active:scale-95 ${
            isDisabled ? t.btnActive + ' cursor-default opacity-80' : t.btn + ' cursor-pointer'
          }`}
        >
          {isCurrent    ? '✓ Plan actuel'
          : isLower     ? '✓ Déjà inclus'
          : isFree      ? 'Votre plan gratuit'
          : `→ Passer au ${name}`}
        </button>
      </div>
    </div>
  );
}

function PeriodButton({ label, price, selected, onClick }: {
  label: React.ReactNode;
  price: number;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative border-2 rounded-lg p-3 text-left transition-all ${
        selected
          ? 'border-primary bg-primary/10 shadow-sm'
          : 'border-border hover:border-primary/50 hover:bg-muted/50'
      }`}
    >
      {selected && (
        <span className="absolute top-2 right-2 h-4 w-4 rounded-full bg-primary flex items-center justify-center">
          <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </span>
      )}
      <p className={`text-sm font-medium ${selected ? 'text-primary' : ''}`}>{label}</p>
      <p className={`text-lg font-bold mt-0.5 ${selected ? 'text-primary' : ''}`}>{formatGNF(price)}</p>
    </button>
  );
}
