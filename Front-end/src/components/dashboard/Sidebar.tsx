"use client";

import { useState, useEffect, useCallback } from "react";
import { syncQueue } from "@/lib/sync-queue";
import { useOnline } from "@/hooks/use-online";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  GraduationCap,
  UserCheck,
  DollarSign,
  Wallet,
  FileText,
  UsersRound,
  Settings,
  HandCoins,
  Menu,
  X,
  ChevronDown,
  LogOut,
  Wifi,
  WifiOff,
  ShoppingCart,
  Package,
  Receipt,
  Truck,
  UserRound,
  Store,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ui/Logo";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { canViewAccounting } from "@/types/permissions";

function getRoleLabel(user: { role?: string; permissions?: { isCoDirector?: boolean } | null } | null | undefined): string {
  if (!user) return "—";
  if (user.role === "director") return "Fondateur";
  if ((user.permissions as any)?.isCoDirector === true) return "Directeur";
  const labels: Record<string, string> = {
    teacher: "Enseignant",
    secretary: "Secrétaire",
    accountant: "Comptable",
    supervisor: "Surveillant",
  };
  return labels[user.role ?? ""] ?? user.role ?? "—";
}
import { isDirectorLevel, isFounder } from "@/lib/is-director";
import { toast } from "sonner";

interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  /** Ressource et action requises pour voir cet item (via hasPermission) */
  permission?: { resource: string; action: string };
  /** Réservé aux directeurs de niveau director ET co-director */
  directorOnly?: boolean;
  /** Réservé exclusivement au fondateur (role === "director") */
  founderOnly?: boolean;
  /** Visible si fondateur OU directeur avec accounting.view */
  accountingAccess?: boolean;
  children?: {
    title: string;
    href: string;
    directorOnly?: boolean;
    founderOnly?: boolean;
  }[];
}

// Navigation module Commerce
const commerceNavigation: NavItem[] = [
  {
    title: "Tableau de bord",
    href: "/dashboard/commerce",
    icon: LayoutDashboard,
  },
  {
    title: "Caisse",
    href: "/dashboard/commerce/pos",
    icon: Store,
  },
  {
    title: "Produits",
    href: "/dashboard/commerce/products",
    icon: Package,
  },
  {
    title: "Bons de Réception",
    href: "/dashboard/commerce/stock-receipts",
    icon: FileText,
    directorOnly: true,
  },
  {
    title: "Ventes",
    href: "/dashboard/commerce/sales",
    icon: Receipt,
  },
  {
    title: "Clients",
    href: "/dashboard/commerce/customers",
    icon: UserRound,
  },
  {
    title: "Dettes",
    href: "/dashboard/commerce/debts",
    icon: AlertTriangle,
  },
  {
    title: "Fournisseurs",
    href: "/dashboard/commerce/suppliers",
    icon: Truck,
    directorOnly: true,
  },
  {
    title: "Équipe",
    href: "/dashboard/team",
    icon: UsersRound,
    directorOnly: true,
  },
  {
    title: "Paramètres",
    href: "/dashboard/settings",
    icon: Settings,
    founderOnly: true,
  },
];

// Navigation module École (existant)
const navigation: NavItem[] = [
  {
    title: "Tableau de bord",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    title: "Élèves",
    href: "/dashboard/students",
    icon: Users,
    permission: { resource: "students", action: "view" },
    children: [
      { title: "Liste des élèves", href: "/dashboard/students" },
      { title: "Ajouter un élève", href: "/dashboard/students/add" },
    ],
  },
  {
    title: "Classes",
    href: "/dashboard/classes",
    icon: GraduationCap,
    permission: { resource: "classes", action: "view" },
  },
  {
    title: "Présences",
    href: "/dashboard/attendance",
    icon: UserCheck,
    permission: { resource: "attendance", action: "view" },
  },
  {
    title: "Paiements",
    href: "/dashboard/payments",
    icon: DollarSign,
    permission: { resource: "payments", action: "view" },
  },
  {
    title: "Dépenses",
    href: "/dashboard/expenses",
    icon: Wallet,
    permission: { resource: "expenses", action: "view" },
  },
  {
    title: "Notes",
    href: "/dashboard/grades",
    icon: FileText,
    permission: { resource: "grades", action: "view" },
    children: [
      { title: "Saisie des notes", href: "/dashboard/grades" },
      { title: "Bulletins scolaires", href: "/dashboard/grades/bulletins", directorOnly: true },
    ],
  },
  {
    title: "Paie",
    href: "/dashboard/payroll",
    icon: HandCoins,
    accountingAccess: true,
  },
  {
    title: "Équipe",
    href: "/dashboard/team",
    icon: UsersRound,
    directorOnly: true,
  },
  // Abonnement masqué en phase bêta — à réactiver quand Djomy est en production
  // {
  //   title: "Abonnement",
  //   href: "/dashboard/billing",
  //   icon: CreditCard,
  //   founderOnly: true,
  // },
  {
    title: "Paramètres",
    href: "/dashboard/settings",
    icon: Settings,
    founderOnly: true,
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout, hasPermission } = useAuth();
  const isOnline = useOnline();
  const isCommerce = user?.moduleType === 'COMMERCE';
  const isPublicSchool = !isCommerce && typeof window !== 'undefined' && localStorage.getItem('structura_school_type') === 'public';
  const activeNav = isCommerce ? commerceNavigation : navigation;
  const activeColor = isCommerce ? 'bg-orange-600' : 'bg-blue-600';
  const activeChildColor = isCommerce ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700';
  const [isOpen, setIsOpen] = useState(false);
  const [expandedItems, setExpandedItems] = useState<string[]>([]);
  const [pendingSync, setPendingSync] = useState(0);

  // Compteur d'actions en attente de synchronisation
  const refreshPendingCount = useCallback(async () => {
    try {
      const count = await syncQueue.getPendingCount();
      setPendingSync(count);
    } catch {
      // IndexedDB peut être en fermeture lors d'une navigation — ignorer silencieusement
    }
  }, []);

  useEffect(() => {
    refreshPendingCount();
    const id = setInterval(refreshPendingCount, 8000);
    return () => clearInterval(id);
  }, [isOnline, refreshPendingCount]);

  // Ouvrir automatiquement les sous-menus de la route active
  useEffect(() => {
    if (!pathname) return;
    const toExpand = navigation
      .filter(
        (item) =>
          item.children &&
          item.children.some(() => pathname.startsWith(item.href))
      )
      .map((item) => item.title);
    setExpandedItems((prev) => {
      const merged = Array.from(new Set([...prev, ...toExpand]));
      return merged;
    });
  }, [pathname]);

  const toggleExpand = (title: string) => {
    setExpandedItems((prev) =>
      prev.includes(title)
        ? prev.filter((item) => item !== title)
        : [...prev, title]
    );
  };

  const closeSidebar = () => setIsOpen(false);

  const handleLogout = () => {
    logout();
    toast.success("Déconnexion réussie", {
      description: "À bientôt!",
    });
  };

  return (
    <>
      {/* Mobile Menu Button - Only show when sidebar is closed */}
      {!isOpen && (
        <div className="fixed top-3 left-3 z-50 lg:hidden">
          <Button
            variant="ghost"
            size="icon"
            className="relative transition-all duration-200 hover:scale-110 bg-background border shadow-lg"
            onClick={() => setIsOpen(true)}
            aria-label="Ouvrir le menu"
          >
            <Menu className="h-5 w-5" />
            {pendingSync > 0 && (
              <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center">
                {pendingSync > 9 ? "9+" : pendingSync}
              </span>
            )}
          </Button>
        </div>
      )}

      {/* Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden animate-in fade-in duration-200"
          onClick={closeSidebar}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed top-0 left-0 z-40 h-screen w-72 bg-white dark:bg-gray-950 border-r shadow-xl transition-transform duration-300 ease-in-out lg:translate-x-0",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center gap-3 p-6 border-b">
            {/* Close button on mobile (inside sidebar) */}
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden -ml-2 transition-all duration-200 hover:scale-110"
              onClick={closeSidebar}
            >
              <X className="h-5 w-5" />
            </Button>
            
            <Logo variant="dark" size="sm" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground truncate font-medium" title={user?.schoolName ?? undefined}>
                {user?.schoolName || ''}
              </p>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto p-4 space-y-1">
            {isCommerce && (
              <div className="flex items-center gap-2 px-3 py-1.5 mb-2 rounded-md bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800">
                <ShoppingCart className="h-3.5 w-3.5 text-orange-600" />
                <span className="text-xs font-semibold text-orange-600 uppercase tracking-wide">Commerce</span>
              </div>
            )}
            {activeNav.filter((item) => {
              if (item.founderOnly) return isFounder(user);
              if (item.accountingAccess) {
                // Masquer "Paie" pour les écoles publiques (les profs sont payés par l'État)
                if (isPublicSchool && item.href === '/dashboard/payroll') return false;
                return canViewAccounting(user);
              }
              if (item.directorOnly) return isDirectorLevel(user);
              if (item.permission) return hasPermission(item.permission.resource, item.permission.action);
              return true;
            }).map((item) => {
              // Vérifier si la page actuelle correspond à cet élément
              const isActive = pathname
                ? item.href === '/dashboard' || item.href === '/dashboard/commerce'
                  ? pathname === item.href
                  : pathname.startsWith(item.href)
                : false;
              const isExpanded = expandedItems.includes(item.title);
              const hasChildren = item.children && item.children.length > 0;

              return (
                <div key={item.title}>
                  {hasChildren ? (
                    <button
                      onClick={() => toggleExpand(item.title)}
                      className={cn(
                        "group w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 active:scale-[0.97]",
                        isActive
                          ? `${activeColor} text-white shadow-md`
                          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                      )}
                    >
                      <item.icon className="h-5 w-5 flex-shrink-0" />
                      <span className="flex-1 text-left">{item.title}</span>
                      {item.badge && (
                        <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-destructive text-destructive-foreground">
                          {item.badge}
                        </span>
                      )}
                      <ChevronDown
                        className={cn(
                          "h-4 w-4 transition-transform duration-200",
                          isExpanded && "rotate-180"
                        )}
                      />
                    </button>
                  ) : (
                    <Link
                      href={item.href}
                      onClick={closeSidebar}
                      className={cn(
                        "group flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 active:scale-[0.97]",
                        isActive
                          ? `${activeColor} text-white shadow-md`
                          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                      )}
                    >
                      <item.icon className="h-5 w-5 flex-shrink-0" />
                      <span className="flex-1">{item.title}</span>
                      {item.badge && (
                        <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-destructive text-destructive-foreground">
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  )}

                  {/* Submenu */}
                  {hasChildren && isExpanded && (
                    <div className="ml-8 mt-1 space-y-1 animate-in slide-in-from-top-2 fade-in duration-200">
                      {item.children?.filter((child) => {
                        if (child.founderOnly) return isFounder(user);
                        if (child.directorOnly) return isDirectorLevel(user);
                        return true;
                      }).map((child) => {
                        const isChildActive = pathname === child.href;
                        return (
                          <Link
                            key={child.href}
                            href={child.href}
                            onClick={closeSidebar}
                            className={cn(
                              "block px-3 py-2 rounded-lg text-sm transition-all duration-200 active:scale-[0.97]",
                              isChildActive
                                ? `${activeChildColor} font-medium shadow-sm`
                                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                            )}
                          >
                            {child.title}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>

          {/* Footer */}
          <div className="p-4 border-t space-y-2">
            {/* Indicateur sync offline */}
            {pendingSync > 0 && (
              <div className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium",
                isOnline ? "bg-blue-50 text-blue-700" : "bg-amber-50 text-amber-700"
              )}>
                <span className={cn(
                  "h-2 w-2 rounded-full shrink-0",
                  isOnline ? "bg-blue-500 animate-pulse" : "bg-amber-500"
                )} />
                {isOnline
                  ? `${pendingSync} action${pendingSync > 1 ? "s" : ""} en attente de sync`
                  : `${pendingSync} action${pendingSync > 1 ? "s" : ""} hors ligne`
                }
              </div>
            )}
            {/* Indicateur online/offline */}
            <div className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium",
              isOnline ? "text-emerald-600" : "text-gray-400"
            )}>
              {isOnline
                ? <Wifi className="h-3.5 w-3.5 shrink-0" />
                : <WifiOff className="h-3.5 w-3.5 shrink-0" />
              }
              {isOnline ? "En ligne" : "Hors ligne"}
            </div>

            <Link
              href="/dashboard/profile"
              onClick={closeSidebar}
              className="flex items-center gap-3 px-3 py-2 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
            >
              {user?.avatar ? (
                <img
                  src={user.avatar}
                  alt={`${user.firstName} ${user.lastName}`}
                  className="h-8 w-8 rounded-full object-cover shrink-0"
                />
              ) : (
                <div className={cn(
                  "h-8 w-8 rounded-full flex items-center justify-center text-white text-sm font-semibold shrink-0",
                  isDirectorLevel(user)       ? "bg-blue-600"   :
                  user?.role === "teacher"   ? "bg-emerald-600" :
                  user?.role === "secretary" ? "bg-violet-600" :
                  "bg-gray-500"
                )}>
                  {user?.firstName?.charAt(0)}{user?.lastName?.charAt(0)}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p
                  className="text-sm font-medium truncate"
                  title={`${user?.firstName ?? ""} ${user?.lastName ?? ""}`.trim()}
                >
                  {user?.firstName} {user?.lastName}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {getRoleLabel(user)}
                </p>
              </div>
            </Link>
            <Button
              variant="ghost"
              className="w-full justify-start gap-3 text-muted-foreground hover:text-destructive transition-all duration-200 hover:scale-[1.02]"
              size="sm"
              onClick={handleLogout}
            >
              <LogOut className="h-4 w-4" />
              Déconnexion
            </Button>
          </div>
        </div>
      </aside>
    </>
  );
}
