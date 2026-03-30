"use client";

import { Search, LayoutDashboard, Users, GraduationCap, UserCheck, DollarSign, FileText, UsersRound, Settings, CreditCard, UserCircle, ShoppingCart, Package, Receipt, Truck, UserRound, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAuth } from "@/contexts/AuthContext";
import { isDirectorLevel } from "@/lib/is-director";
import { ROLE_LABELS } from "@/types/permissions";
import { NotificationCenter } from "./NotificationCenter";
import { GlobalSearch } from "./GlobalSearch";
import { CurrentYearBadge } from "@/components/academic-year/CurrentYearBadge";
import { useState } from "react";
import { usePathname } from "next/navigation";

const PAGE_INFO: { pattern: string; title: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  // School pages
  { pattern: "/dashboard/students/add",      title: "Ajouter un élève",    Icon: Users },
  { pattern: "/dashboard/students/",         title: "Fiche élève",         Icon: Users },
  { pattern: "/dashboard/grades/bulletins",  title: "Bulletins scolaires", Icon: FileText },
  { pattern: "/dashboard/students",          title: "Élèves",              Icon: Users },
  { pattern: "/dashboard/classes",           title: "Classes",             Icon: GraduationCap },
  { pattern: "/dashboard/attendance",        title: "Présences",           Icon: UserCheck },
  { pattern: "/dashboard/payments",          title: "Paiements",           Icon: DollarSign },
  { pattern: "/dashboard/grades",            title: "Notes",               Icon: FileText },
  // Commerce pages
  { pattern: "/dashboard/commerce/pos",       title: "Caisse",              Icon: ShoppingCart },
  { pattern: "/dashboard/commerce/products",  title: "Produits",            Icon: Package },
  { pattern: "/dashboard/commerce/sales",     title: "Ventes",              Icon: Receipt },
  { pattern: "/dashboard/commerce/customers", title: "Clients",             Icon: UserRound },
  { pattern: "/dashboard/commerce/suppliers", title: "Fournisseurs",        Icon: Truck },
  { pattern: "/dashboard/commerce",           title: "Tableau de bord",     Icon: Store },
  // Shared pages
  { pattern: "/dashboard/team",              title: "Équipe",              Icon: UsersRound },
  { pattern: "/dashboard/billing",           title: "Abonnement",          Icon: CreditCard },
  { pattern: "/dashboard/settings",          title: "Paramètres",          Icon: Settings },
  { pattern: "/dashboard/profile",           title: "Mon profil",          Icon: UserCircle },
  { pattern: "/dashboard",                   title: "Tableau de bord",     Icon: LayoutDashboard },
];

function useCurrentPage() {
  const pathname = usePathname();
  if (!pathname) return null;
  return PAGE_INFO.find((p) =>
    p.pattern === "/dashboard"
      ? pathname === "/dashboard"
      : pathname === p.pattern || pathname.startsWith(p.pattern)
  ) ?? null;
}

export function Header() {
  const { user } = useAuth();
  const [searchOpen, setSearchOpen] = useState(false);
  const currentPage = useCurrentPage();

  // Keyboard shortcut for search (Ctrl+K or Cmd+K)
  useState(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  return (
    <>
      <header className="sticky top-0 z-30 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex h-16 items-center gap-2 sm:gap-4 px-4 lg:px-8">
          {/* Spacer for mobile menu button */}
          <div className="w-12 lg:hidden flex-shrink-0" />

          {/* Page indicator — desktop only */}
          {currentPage && (
            <div className={`hidden lg:flex items-center gap-2.5 shrink-0 border-l-[3px] pl-3 mr-2 ${user?.moduleType === 'COMMERCE' ? 'border-orange-600' : 'border-blue-600'}`}>
              <currentPage.Icon className={`h-4 w-4 shrink-0 ${user?.moduleType === 'COMMERCE' ? 'text-orange-600' : 'text-blue-600'}`} />
              <span className="font-semibold text-sm text-foreground whitespace-nowrap">
                {currentPage.title}
              </span>
            </div>
          )}

          {/* Search Button */}
          <div className="flex-1 max-w-md min-w-0">
            <Button
              variant="outline"
              className="relative h-9 sm:h-10 w-full justify-start text-sm text-muted-foreground"
              onClick={() => setSearchOpen(true)}
            >
              <Search className="mr-2 h-4 w-4 flex-shrink-0" />
              <span className="truncate">Rechercher...</span>
              <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 hidden h-6 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex">
                <span className="text-xs">⌘</span>K
              </kbd>
            </Button>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            {/* Academic Year Badge — masqué pour les tenants commerce */}
            {user?.moduleType !== 'COMMERCE' && <CurrentYearBadge />}

            {/* Notification Center */}
            <NotificationCenter />

            {/* Profile */}
            <Button
              variant="ghost"
              className="gap-2 transition-all duration-200 hover:scale-105 hidden sm:flex"
            >
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-primary text-primary-foreground text-sm font-semibold">
                  {user?.firstName?.charAt(0)}{user?.lastName?.charAt(0)}
                </AvatarFallback>
              </Avatar>
              <div className="hidden md:block text-left">
                <p className="text-sm font-medium">
                  {user?.firstName} {user?.lastName}
                </p>
                <p className="text-xs text-muted-foreground">
                  {isDirectorLevel(user) ? (user?.role === "director" ? "Directeur" : "Co-directeur") : (ROLE_LABELS[user?.role as keyof typeof ROLE_LABELS] ?? user?.role)}
                </p>
              </div>
            </Button>
            
            {/* Profile mobile */}
            <Button
              variant="ghost"
              size="icon"
              className="sm:hidden transition-all duration-200 hover:scale-110"
            >
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-primary text-primary-foreground text-sm font-semibold">
                  {user?.firstName?.charAt(0)}{user?.lastName?.charAt(0)}
                </AvatarFallback>
              </Avatar>
            </Button>
          </div>
        </div>
      </header>

      {/* Global Search Dialog */}
      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
    </>
  );
}
