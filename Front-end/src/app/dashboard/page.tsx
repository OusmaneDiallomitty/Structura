"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Users,
  GraduationCap,
  DollarSign,
  UserCheck,
  UserX,
  AlertCircle,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { PaymentsChart } from "@/components/charts/PaymentsChart";
import { AttendanceChart } from "@/components/charts/AttendanceChart";
import { StudentsDistributionChart } from "@/components/charts/StudentsDistributionChart";
import { WelcomeBanner } from "@/components/dashboard/WelcomeBanner";
import OnboardingModal from "@/components/onboarding/OnboardingModal";
import { useAuth } from "@/contexts/AuthContext";
import { useOnboarding } from "@/hooks/use-onboarding";
import * as storage from "@/lib/storage";
import { offlineDB } from "@/lib/offline-db";
import { useOnline } from "@/hooks/use-online";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import {
  getDashboardStats,
  getRecentActivities,
  getPaymentsChartData,
  getAttendanceChartData,
  getStudentsDistribution,
} from "@/lib/api/dashboard.service";
import { getCurrentAcademicYear, createAcademicYear } from "@/lib/api/academic-years.service";
import { updateFeesConfig } from "@/lib/api/fees.service";

/** Calcule le nom de l'année scolaire courante selon la date du jour.
 *  En Guinée l'année commence en Septembre.
 *  Si on est en sept. ou plus → "2025-2026", sinon → "2024-2025".
 */
function guessCurrentSchoolYearName(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // 1-12
  return month >= 9 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
}

/**
 * Formate un montant en GNF de façon lisible.
 * - 300 000 GNF  → "300 000 GNF"   (plus lisible que "0.3M GNF")
 * - 1 500 000 GNF → "1,5 M GNF"
 * - 12 500 000 GNF → "12,5 M GNF"
 */
function formatMoney(amount: number, currency: string): string {
  if (!amount || amount === 0) return `0 ${currency}`;
  if (amount >= 1_000_000) {
    const millions = amount / 1_000_000;
    const formatted = millions % 1 === 0
      ? `${millions} M`
      : `${millions.toFixed(1).replace('.', ',')} M`;
    return `${formatted} ${currency}`;
  }
  // Séparateur de milliers français (espace)
  return `${amount.toLocaleString('fr-FR')} ${currency}`;
}

/**
 * Formate le taux de présence.
 * - 0 ou pas de données → "—"
 * - 87.5 → "88 %"
 */
function formatAttendanceRate(rate: string | number | undefined | null): string {
  const n = parseFloat(String(rate ?? 0));
  if (!rate || isNaN(n) || n === 0) return "—";
  return `${Math.round(n)} %`;
}

// Helper pour formater le temps relatif
function getRelativeTime(date: Date | string): string {
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "À l'instant";
  if (diffMins < 60) return `Il y a ${diffMins} minute${diffMins > 1 ? 's' : ''}`;
  if (diffHours < 24) return `Il y a ${diffHours} heure${diffHours > 1 ? 's' : ''}`;
  return `Il y a ${diffDays} jour${diffDays > 1 ? 's' : ''}`;
}

export default function DashboardPage() {
  const { user, hasPermission, logout } = useAuth();
  const router = useRouter();
  const isOnline = useOnline();
  const [showWelcome, setShowWelcome] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const { shouldShowOnboarding, isLoading: onboardingLoading } = useOnboarding();
  const [showOnboardingModal, setShowOnboardingModal] = useState(true); // Contrôle local du modal

  // États pour les données
  const [stats, setStats] = useState<any>(null);
  const [hasActiveYear, setHasActiveYear] = useState<boolean | null>(null);
  const [activities, setActivities] = useState<any[]>([]);
  const [paymentsData, setPaymentsData] = useState<any[]>([]);
  const [attendanceData, setAttendanceData] = useState<any[]>([]);
  const [studentsDistribution, setStudentsDistribution] = useState<any[]>([]);

  // Guard anti-stale : annule les setState d'un appel dépassé si un plus récent a démarré
  const loadIdRef = useRef(0);

  // Handlers pour l'onboarding
  const handleOnboardingComplete = async (yearConfig?: { startMonth: string; durationMonths: number; schoolType: string }) => {
    setShowOnboardingModal(false);
    // Auto-créer l'année scolaire avec la config choisie par l'utilisateur
    try {
      const token = storage.getAuthItem('structura_token');
      if (token) {
        const existing = await getCurrentAcademicYear(token).catch(() => null);
        if (!existing) {
          const startMonth     = yearConfig?.startMonth     ?? 'Septembre';
          const durationMonths = yearConfig?.durationMonths ?? 9;
          const yearName       = guessCurrentSchoolYearName();
          await createAcademicYear(token, {
            name: yearName,
            startMonth,
            durationMonths,
            isCurrent: true,
          });
          // Persist school type and school calendar from onboarding
          await updateFeesConfig(token, {
            schoolType: yearConfig?.schoolType ?? 'private',
            schoolCalendar: { startMonth, durationMonths },
          }).catch(() => {/* non-blocking */});
          toast.success(`Année scolaire ${yearName} créée`, {
            description: `Rentrée en ${startMonth} · ${durationMonths} mois de cours`,
          });
        } else {
          toast.success('C\'est parti ! Créez vos classes pour commencer.');
        }
      }
    } catch {
      toast.info('Pensez à créer votre année scolaire dans les paramètres.');
    } finally {
      // Recharger le dashboard pour refléter la nouvelle année scolaire sans actualiser
      loadDashboardData();
    }
  };

  const handleOnboardingSkip = () => {
    setShowOnboardingModal(false);
    toast.info('Vous pourrez configurer votre école plus tard');
    loadDashboardData();
  };

  // Charger toutes les données du dashboard
  const loadDashboardData = useCallback(async () => {
    const loadId = ++loadIdRef.current; // ID unique pour cet appel
    setIsLoading(true);
    const token = storage.getAuthItem('structura_token');

    if (!token) {
      logout();
      return;
    }

    if (!isOnline) {
      toast.info('Vous êtes hors ligne — certaines données peuvent ne pas être à jour.');
      setIsLoading(false);
      return;
    }

    try {
      // Charger toutes les données en parallèle
      const [
        statsData,
        activitiesData,
        paymentsChart,
        attendanceChart,
        distributionData,
        activeYear,
      ] = await Promise.all([
        getDashboardStats(token),
        getRecentActivities(token, 4),
        getPaymentsChartData(token),
        getAttendanceChartData(token),
        getStudentsDistribution(token),
        getCurrentAcademicYear(token).catch(() => null),
      ]);

      // Ignorer si un appel plus récent a déjà démarré (évite les setState sur état périmé)
      if (loadId !== loadIdRef.current) return;

      setStats(statsData.stats);
      setHasActiveYear(!!activeYear);
      setActivities(activitiesData);
      setPaymentsData(paymentsChart);
      setAttendanceData(attendanceChart);
      setStudentsDistribution(distributionData);
    } catch (error: any) {
      if (loadId !== loadIdRef.current) return;
      console.error('Erreur chargement dashboard:', error);

      if (error.message.includes('Unauthorized') || error.message.includes('401')) {
        toast.error('Votre session a expiré — veuillez vous reconnecter.');
        await offlineDB.clearAll().catch(() => {}); // Purger le cache local (confidentialité)
        logout();
        return;
      }

      if (navigator.onLine) {
        toast.error(error.message || 'Erreur lors du chargement du dashboard');
      }
    } finally {
      if (loadId === loadIdRef.current) setIsLoading(false);
    }
  }, [isOnline, logout]);

  // Détecter un plan en attente depuis /tarifs (flow: tarifs → register → check-email → dashboard → billing)
  useEffect(() => {
    try {
      const pendingPlan = localStorage.getItem('structura_pending_plan');
      if (pendingPlan === 'PRO' || pendingPlan === 'PRO_PLUS') {
        localStorage.removeItem('structura_pending_plan');
        router.push('/dashboard/billing');
      }
    } catch { /* quota ou SSR */ }
  }, [router]);

  useEffect(() => {
    loadDashboardData();

    // Vérifier si c'est la première visite
    const hasSeenWelcome = storage.getItem("dashboard_welcome_seen");
    if (!hasSeenWelcome) {
      setShowWelcome(true);
    }

    // Recharger automatiquement au retour de connexion
    const handleOnline = () => loadDashboardData();
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [loadDashboardData]);

  const handleDismissWelcome = () => {
    storage.setItem("dashboard_welcome_seen", "true");
    setShowWelcome(false);
  };

  const organizationName = storage.getItem("onboarding_org_name") || "votre école";

  // Devise active pour les montants affichés
  const activeCurrency = storage.getActiveCurrency();

  // Rôles autorisés à voir les montants financiers (confidentialité)
  const canViewFinancials = user?.role === 'director' || user?.role === 'accountant';

  // Configuration des cartes de stats
  const statsCards = stats ? [
    {
      title: "Total Élèves",
      value: stats.totalStudents.toString(),
      change: stats.studentsChange > 0 ? `+${stats.studentsChange}` : stats.studentsChange.toString(),
      changeType: stats.studentsChange >= 0 ? "increase" as const : "decrease" as const,
      icon: Users,
      href: "/dashboard/students",
      gradient: "from-blue-500/10 to-blue-500/5",
      iconBg: "bg-blue-500/10",
      iconColor: "text-blue-600",
      borderColor: "hover:border-blue-500/50",
      ringColor: "hover:ring-blue-500/20",
    },
    {
      title: "Classes Actives",
      value: stats.totalClasses.toString(),
      change: stats.classesChange > 0 ? `+${stats.classesChange}` : stats.classesChange.toString(),
      changeType: stats.classesChange >= 0 ? "increase" as const : "decrease" as const,
      icon: GraduationCap,
      href: "/dashboard/classes",
      gradient: "from-violet-500/10 to-violet-500/5",
      iconBg: "bg-violet-500/10",
      iconColor: "text-violet-600",
      borderColor: "hover:border-violet-500/50",
      ringColor: "hover:ring-violet-500/20",
    },
    {
      title: "Paiements du Mois",
      // Montant masqué si rôle non autorisé (confidentialité financière)
      value: canViewFinancials
        ? formatMoney(stats.monthRevenue, activeCurrency)
        : "— accès restreint",
      change: canViewFinancials ? stats.revenueChange : "",
      changeType: parseFloat(stats.revenueChange) >= 0 ? "increase" as const : "decrease" as const,
      icon: DollarSign,
      href: "/dashboard/payments",
      gradient: "from-emerald-500/10 to-emerald-500/5",
      iconBg: "bg-emerald-500/10",
      iconColor: "text-emerald-600",
      borderColor: "hover:border-emerald-500/50",
      ringColor: "hover:ring-emerald-500/20",
      restricted: !canViewFinancials,
    },
    {
      title: "Taux de Présence",
      // Formaté clairement : "88 %" ou "—" si aucune donnée
      value: formatAttendanceRate(stats.attendanceRate),
      change: stats.attendanceRateChange,
      changeType: parseFloat(stats.attendanceRateChange) >= 0 ? "increase" as const : "decrease" as const,
      icon: UserCheck,
      href: "/dashboard/attendance",
      gradient: "from-amber-500/10 to-amber-500/5",
      iconBg: "bg-amber-500/10",
      iconColor: "text-amber-600",
      borderColor: "hover:border-amber-500/50",
      ringColor: "hover:ring-amber-500/20",
    },
  ] : [];

  // Mapper les icônes des activités
  const iconMap: any = {
    Users,
    DollarSign,
    UserX,
    AlertCircle,
  };

  const getActivityIcon = (iconName: string) => {
    return iconMap[iconName] || AlertCircle;
  };

  const getActivityStyle = (type: string) => {
    const styles: any = {
      student: {
        iconBg: "bg-blue-500/10",
        iconColor: "text-blue-600",
      },
      payment: {
        iconBg: "bg-emerald-500/10",
        iconColor: "text-emerald-600",
      },
      absence: {
        iconBg: "bg-amber-500/10",
        iconColor: "text-amber-600",
      },
      alert: {
        iconBg: "bg-red-500/10",
        iconColor: "text-red-600",
      },
    };
    return styles[type] || styles.alert;
  };


  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="text-muted-foreground">Chargement du dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Onboarding Modal - Directeur uniquement, affiché seulement si pas complété */}
      {user?.role === 'director' && shouldShowOnboarding && !onboardingLoading && showOnboardingModal && (
        <OnboardingModal
          onComplete={handleOnboardingComplete}
          onSkip={handleOnboardingSkip}
        />
      )}

      {/* Welcome Banner - Directeur uniquement */}
      {user?.role === 'director' && showWelcome && (
        <WelcomeBanner
          organizationName={organizationName}
          onDismiss={handleDismissWelcome}
        />
      )}

      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
          {user?.role === 'teacher'
            ? `Bonjour, ${user.firstName} !`
            : 'Tableau de bord'}
        </h1>
        <p className="text-sm sm:text-base text-muted-foreground">
          {user?.role === 'teacher'
            ? 'Accédez à vos classes, présences et notes'
            : "Vue d'ensemble de votre école"}
        </p>
      </div>

      {/* Stats Grid - Masquer paiements pour le prof */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statsCards
          .filter((stat) => {
            // La carte paiements est visible uniquement par directeur et comptable
            if (stat.title === 'Paiements du Mois') return canViewFinancials;
            return true;
          })
          .map((stat, index) => (
          <Link
            key={stat.title}
            href={stat.href}
            className="group"
            style={{
              animationDelay: `${index * 100}ms`,
            }}
          >
            <Card className={`relative overflow-hidden transition-all duration-300 hover:shadow-xl hover:-translate-y-1 ${stat.borderColor} ${stat.ringColor} hover:ring-2 animate-in fade-in slide-in-from-bottom-4 bg-gradient-to-br ${stat.gradient}`}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground truncate pr-2 min-w-0 flex-1">
                  {stat.title}
                </CardTitle>
                <div
                  className={`p-2 sm:p-2.5 rounded-xl ${stat.iconBg} transition-all duration-300 group-hover:scale-110 group-hover:rotate-3 flex-shrink-0`}
                >
                  <stat.icon className={`h-4 w-4 ${stat.iconColor}`} />
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-1">
                  <div className="text-xl sm:text-2xl font-bold tracking-tight truncate">
                    {stat.value}
                  </div>
                  <div className="flex items-center gap-1 sm:gap-2 flex-wrap">
                    <div
                      className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${
                        stat.changeType === "increase"
                          ? "bg-emerald-500/10 text-emerald-700"
                          : "bg-red-500/10 text-red-700"
                      }`}
                    >
                      {stat.changeType === "increase" ? (
                        <ArrowUpRight className="h-3 w-3" />
                      ) : (
                        <ArrowDownRight className="h-3 w-3" />
                      )}
                      {stat.change}
                    </div>
                    <span className="text-xs text-muted-foreground hidden sm:inline">
                      vs mois dernier
                    </span>
                    <span className="text-xs text-muted-foreground sm:hidden">
                      vs mois
                    </span>
                  </div>
                </div>
              </CardContent>

              {/* Subtle gradient overlay on hover */}
              <div className="absolute inset-0 bg-gradient-to-br from-white/0 to-white/50 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
            </Card>
          </Link>
        ))}
      </div>

      {/* Alertes contextuelles — directeur uniquement */}
      {user?.role === 'director' && stats && (() => {
        const now = new Date();
        const dayOfMonth = now.getDate();
        const month = now.getMonth() + 1;
        // Fin de trimestre approximative (mois 12, 3, 6 en calendrier scolaire guinéen)
        const isEndOfTerm = [12, 3, 6].includes(month) && dayOfMonth >= 20;

        const alerts: { type: 'warning' | 'info' | 'error'; message: string; description: string; href?: string }[] = [];

        if (hasActiveYear === false) {
          alerts.push({ type: 'error', message: 'Aucune année scolaire active', description: 'Créez une année scolaire pour commencer à gérer votre école.', href: '/dashboard/settings' });
        }
        if (stats.totalClasses === 0) {
          alerts.push({ type: 'warning', message: 'Aucune classe créée', description: 'Ajoutez vos classes pour pouvoir inscrire des élèves.', href: '/dashboard/classes' });
        }
        if (stats.totalStudents === 0 && stats.totalClasses > 0) {
          alerts.push({ type: 'info', message: 'Aucun élève inscrit', description: 'Commencez à inscrire vos élèves dans vos classes.', href: '/dashboard/students/add' });
        }
        const attendanceNum = parseFloat(String(stats.attendanceRate ?? 0));
        if (attendanceNum > 0 && attendanceNum < 75) {
          alerts.push({ type: 'warning', message: `Taux de présence faible : ${Math.round(attendanceNum)} %`, description: 'Le taux de présence est en dessous de 75 %. Vérifiez les absences récentes.', href: '/dashboard/attendance' });
        }
        if (isEndOfTerm) {
          alerts.push({ type: 'info', message: 'Fin de trimestre approche', description: 'Pensez à vérouiller les notes du trimestre en cours avant la clôture.', href: '/dashboard/grades' });
        }

        if (alerts.length === 0) return null;

        const colorMap = {
          error:   { bg: 'bg-red-50',    border: 'border-red-200',    dot: 'bg-red-500',    text: 'text-red-800',    sub: 'text-red-600' },
          warning: { bg: 'bg-amber-50',  border: 'border-amber-200',  dot: 'bg-amber-500',  text: 'text-amber-800',  sub: 'text-amber-600' },
          info:    { bg: 'bg-blue-50',   border: 'border-blue-200',   dot: 'bg-blue-500',   text: 'text-blue-800',   sub: 'text-blue-600' },
        };

        return (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Points d'attention</p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {alerts.map((alert, i) => {
                const c = colorMap[alert.type];
                const content = (
                  <div key={i} className={`flex items-start gap-3 p-3 rounded-lg border ${c.bg} ${c.border} ${alert.href ? 'cursor-pointer hover:brightness-95 transition-all' : ''}`}>
                    <span className={`mt-1 h-2 w-2 rounded-full shrink-0 ${c.dot}`} />
                    <div className="min-w-0">
                      <p className={`text-sm font-semibold ${c.text}`}>{alert.message}</p>
                      <p className={`text-xs mt-0.5 ${c.sub}`}>{alert.description}</p>
                    </div>
                  </div>
                );
                return alert.href ? <Link key={i} href={alert.href}>{content}</Link> : content;
              })}
            </div>
          </div>
        );
      })()}

      {/* Content Grid */}
      <div className="grid gap-6">
        {/* Recent Activities */}
        <Card className="animate-in fade-in slide-in-from-left-4 duration-700 border-l-4 border-l-blue-500/20 overflow-hidden">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse flex-shrink-0" />
              <span className="truncate">Activités Récentes</span>
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm truncate">
              Les dernières actions dans votre école
            </CardDescription>
          </CardHeader>
          <CardContent>
            {activities.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>Aucune activité récente</p>
              </div>
            ) : (
              <div className="space-y-3">
                {activities.map((activity, index) => {
                  const ActivityIcon = getActivityIcon(activity.icon);
                  const style = getActivityStyle(activity.type);

                  return (
                    <Link
                      key={index}
                      href={activity.link ?? '#'}
                      className="flex items-start gap-3 p-3 rounded-xl hover:bg-muted/50 transition-all duration-200 cursor-pointer group border border-transparent hover:border-border"
                    >
                      <div
                        className={`p-2 rounded-lg ${style.iconBg} transition-transform duration-300 group-hover:scale-110 flex-shrink-0`}
                      >
                        <ActivityIcon className={`h-4 w-4 ${style.iconColor}`} />
                      </div>
                      <div className="flex-1 space-y-1 min-w-0 w-0">
                        <p className="text-sm font-medium truncate">
                          {activity.message}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {getRelativeTime(activity.time)}
                        </p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
            <Button
              variant="ghost"
              className="w-full mt-4 transition-all duration-200 hover:bg-blue-500/5"
              asChild
            >
              <Link href="/dashboard/students">Voir toutes les activités</Link>
            </Button>
          </CardContent>
        </Card>

      </div>

      {/* Charts Section */}
      <div className="space-y-6">
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight">Statistiques</h2>

        {/* Graphique paiements — directeur et comptable uniquement */}
        {canViewFinancials && paymentsData.length > 0 && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
            <PaymentsChart data={paymentsData} />
          </div>
        )}

        {/* Attendance & Distribution Charts */}
        <div className="grid gap-6 lg:grid-cols-2">
          {attendanceData.length > 0 && (
            <div className="animate-in fade-in slide-in-from-left-4 duration-700">
              <AttendanceChart data={attendanceData} />
            </div>
          )}
          {studentsDistribution.length > 0 && (
            <div className="animate-in fade-in slide-in-from-right-4 duration-700">
              <StudentsDistributionChart data={studentsDistribution} />
            </div>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <Card className="animate-in fade-in slide-in-from-bottom-4 duration-1000 border-l-4 border-l-emerald-500/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse flex-shrink-0" />
            <span className="truncate">Actions Rapides</span>
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm truncate">
            Accédez rapidement aux fonctionnalités principales
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {hasPermission('students', 'create') && (
              <Button
                variant="outline"
                className="h-auto flex-col gap-2 sm:gap-3 p-4 sm:p-6 transition-all duration-300 hover:scale-105 hover:border-blue-500/50 hover:bg-blue-500/5 hover:shadow-lg group"
                asChild
              >
                <Link href="/dashboard/students/add">
                  <div className="p-2 sm:p-3 rounded-xl bg-blue-500/10 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3">
                    <Users className="h-5 w-5 sm:h-6 sm:w-6 text-blue-600" />
                  </div>
                  <span className="text-xs sm:text-sm font-medium text-center">Ajouter un élève</span>
                </Link>
              </Button>
            )}
            {hasPermission('attendance', 'create') && (
              <Button
                variant="outline"
                className="h-auto flex-col gap-2 sm:gap-3 p-4 sm:p-6 transition-all duration-300 hover:scale-105 hover:border-amber-500/50 hover:bg-amber-500/5 hover:shadow-lg group"
                asChild
              >
                <Link href="/dashboard/attendance">
                  <div className="p-2 sm:p-3 rounded-xl bg-amber-500/10 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3">
                    <UserCheck className="h-5 w-5 sm:h-6 sm:w-6 text-amber-600" />
                  </div>
                  <span className="text-xs sm:text-sm font-medium text-center">Prendre présences</span>
                </Link>
              </Button>
            )}
            {hasPermission('payments', 'create') && (
              <Button
                variant="outline"
                className="h-auto flex-col gap-2 sm:gap-3 p-4 sm:p-6 transition-all duration-300 hover:scale-105 hover:border-emerald-500/50 hover:bg-emerald-500/5 hover:shadow-lg group"
                asChild
              >
                <Link href="/dashboard/payments">
                  <div className="p-2 sm:p-3 rounded-xl bg-emerald-500/10 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3">
                    <DollarSign className="h-5 w-5 sm:h-6 sm:w-6 text-emerald-600" />
                  </div>
                  <span className="text-xs sm:text-sm font-medium text-center">
                    Enregistrer paiement
                  </span>
                </Link>
              </Button>
            )}
            {hasPermission('classes', 'view') && (
              <Button
                variant="outline"
                className="h-auto flex-col gap-2 sm:gap-3 p-4 sm:p-6 transition-all duration-300 hover:scale-105 hover:border-violet-500/50 hover:bg-violet-500/5 hover:shadow-lg group"
                asChild
              >
                <Link href="/dashboard/classes">
                  <div className="p-2 sm:p-3 rounded-xl bg-violet-500/10 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3">
                    <GraduationCap className="h-5 w-5 sm:h-6 sm:w-6 text-violet-600" />
                  </div>
                  <span className="text-xs sm:text-sm font-medium text-center">Voir les classes</span>
                </Link>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
