"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  GraduationCap,
  UserCheck,
  DollarSign,
  FileText,
  UsersRound,
  Settings,
  Menu,
  X,
  ChevronDown,
  LogOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ui/Logo";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { ROLE_LABELS } from "@/types/permissions";
import { toast } from "sonner";

interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  /** Ressource et action requises pour voir cet item (via hasPermission) */
  permission?: { resource: string; action: string };
  /** Réservé exclusivement au directeur */
  directorOnly?: boolean;
  children?: {
    title: string;
    href: string;
    /** Sous-item réservé exclusivement au directeur */
    directorOnly?: boolean;
  }[];
}

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
  //   directorOnly: true,
  // },
  {
    title: "Paramètres",
    href: "/dashboard/settings",
    icon: Settings,
    directorOnly: true,
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout, hasPermission } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [expandedItems, setExpandedItems] = useState<string[]>([]);

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
        <Button
          variant="ghost"
          size="icon"
          className="fixed top-3 left-3 z-50 lg:hidden transition-all duration-200 hover:scale-110 bg-background border shadow-lg"
          onClick={() => setIsOpen(true)}
          aria-label="Ouvrir le menu"
        >
          <Menu className="h-5 w-5" />
        </Button>
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
            {navigation.filter((item) => {
              if (item.directorOnly) return user?.role === 'director';
              if (item.permission) return hasPermission(item.permission.resource, item.permission.action);
              return true;
            }).map((item) => {
              // Vérifier si la page actuelle correspond à cet élément
              const isActive = pathname
                ? item.href === '/dashboard'
                  ? pathname === '/dashboard' // Égalité stricte pour le dashboard
                  : pathname.startsWith(item.href) // Commence par pour les autres
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
                          ? "bg-blue-600 text-white shadow-md"
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
                          ? "bg-blue-600 text-white shadow-md"
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
                      {item.children?.filter((child) => !child.directorOnly || user?.role === 'director').map((child) => {
                        const isChildActive = pathname === child.href;
                        return (
                          <Link
                            key={child.href}
                            href={child.href}
                            onClick={closeSidebar}
                            className={cn(
                              "block px-3 py-2 rounded-lg text-sm transition-all duration-200 active:scale-[0.97]",
                              isChildActive
                                ? "bg-blue-100 text-blue-700 font-medium shadow-sm"
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
            <Link
              href="/dashboard/profile"
              onClick={closeSidebar}
              className="flex items-center gap-3 px-3 py-2 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
            >
              <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-sm font-semibold">
                {user?.firstName?.charAt(0)}{user?.lastName?.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {user?.firstName} {user?.lastName}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {ROLE_LABELS[user?.role as keyof typeof ROLE_LABELS] ?? user?.role}
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
