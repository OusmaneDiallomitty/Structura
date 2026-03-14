'use client';

import Link           from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState }   from 'react';
import {
  LayoutDashboard, Building2, Bell, Activity,
  User, LogOut, ShieldCheck, X, TrendingUp, PlusCircle, CreditCard,
} from 'lucide-react';
import { logout, getStoredUser, type AdminUser } from '@/lib/auth';
import { getAlertsCount }                        from '@/lib/api';
import { cn }                                    from '@/lib/utils';

interface SidebarProps {
  isOpen:  boolean;
  onClose: () => void;
}

const NAV_ITEMS = [
  { href: '/dashboard',              label: "Vue d'ensemble", icon: LayoutDashboard },
  { href: '/dashboard/alerts',       label: 'Alertes',        icon: Bell            },
  { href: '/dashboard/tenants',      label: 'Écoles',         icon: Building2       },
  { href: '/dashboard/finance',      label: 'Finance',        icon: TrendingUp      },
  { href: '/dashboard/payments',     label: 'Paiements',      icon: CreditCard      },
  { href: '/dashboard/activity',     label: 'Activité',       icon: Activity        },
];

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();
  const router   = useRouter();
  const [user,       setUser]       = useState<AdminUser | null>(null);
  const [alertCount, setAlertCount] = useState(0);

  // Lecture localStorage côté client uniquement
  useEffect(() => { setUser(getStoredUser()); }, []);

  // Compteur d'alertes — endpoint léger /alerts/count (3 COUNT au lieu de 7 findMany)
  useEffect(() => {
    const fetchCount = () =>
      getAlertsCount()
        .then((r) => setAlertCount(r.total))
        .catch(() => {});
    fetchCount();
    const id = setInterval(fetchCount, 2 * 60_000);

    // Refresh immédiat après action sur la page alertes (snooze, etc.)
    window.addEventListener('alerts:refresh', fetchCount);
    return () => {
      clearInterval(id);
      window.removeEventListener('alerts:refresh', fetchCount);
    };
  }, []);

  // Fermer le sidebar au changement de route (mobile)
  const handleLink = () => { if (window.innerWidth < 1024) onClose(); };

  const handleLogout = () => { logout(); router.push('/login'); };

  return (
    <>
      {/* ── Overlay mobile ──────────────────────────────────────────────────── */}
      <div
        className={cn(
          'fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-300 lg:hidden',
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
        )}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      <aside
        className={cn(
          // Mobile : drawer fixe depuis la gauche
          'fixed inset-y-0 left-0 z-50 w-64 flex flex-col',
          'transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
          isOpen ? 'translate-x-0' : '-translate-x-full',
          // Desktop : toujours visible, dans le flux
          'lg:static lg:translate-x-0 lg:flex-shrink-0',
          // Fond
          'bg-[#0d0f14] text-white',
        )}
      >
        {/* Marque */}
        <div className="flex items-center justify-between px-5 pt-6 pb-5 border-b border-white/[0.06]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-brand-600 flex items-center justify-center font-bold text-sm shadow-lg shadow-brand-900/40 flex-shrink-0">
              S
            </div>
            <div>
              <p className="text-[15px] font-semibold text-white leading-tight">Structura</p>
              <p className="text-[11px] text-slate-500 leading-tight">Admin Platform</p>
            </div>
          </div>
          {/* Bouton fermeture (mobile seulement) */}
          <button
            onClick={onClose}
            className="lg:hidden w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:text-white hover:bg-white/10 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active   = pathname === href || (href !== '/dashboard' && pathname.startsWith(href));
            const isAlerts = href === '/dashboard/alerts';
            return (
              <Link
                key={href}
                href={href}
                onClick={handleLink}
                className={cn(
                  'group flex items-center justify-between px-3.5 py-2.5 rounded-xl text-[13.5px] font-medium transition-all duration-150',
                  active
                    ? 'bg-brand-600 text-white shadow-lg shadow-brand-900/30'
                    : 'text-slate-400 hover:text-white hover:bg-white/[0.07]',
                )}
              >
                <span className="flex items-center gap-3">
                  <Icon className={cn(
                    'w-[18px] h-[18px] flex-shrink-0 transition-transform duration-150',
                    !active && 'group-hover:scale-110',
                  )} />
                  {label}
                </span>
                {isAlerts && alertCount > 0 && (
                  <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-[1px] rounded-full min-w-[18px] text-center leading-4">
                    {alertCount > 99 ? '99+' : alertCount}
                  </span>
                )}
              </Link>
            );
          })}

          {/* Séparateur + Action rapide */}
          <div className="pt-3 mt-2 border-t border-white/[0.06]">
            <Link
              href="/dashboard/tenants/new"
              onClick={handleLink}
              className={cn(
                'group flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-[13.5px] font-medium transition-all duration-150',
                pathname === '/dashboard/tenants/new'
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-500 hover:text-white hover:bg-white/[0.07]',
              )}
            >
              <PlusCircle className="w-[18px] h-[18px] flex-shrink-0 group-hover:scale-110 transition-transform duration-150" />
              Nouvelle école
            </Link>
          </div>
        </nav>

        {/* Profil + actions */}
        <div className="px-3 pb-4 pt-3 border-t border-white/[0.06] space-y-1">
          {/* Avatar card */}
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/[0.05] mb-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center text-xs font-bold flex-shrink-0 shadow">
              {user?.firstName?.[0]?.toUpperCase() ?? '?'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-white truncate leading-tight">
                {user ? `${user.firstName} ${user.lastName}` : '…'}
              </p>
              <p className="text-[11px] text-slate-500 truncate leading-tight">{user?.email ?? '…'}</p>
            </div>
            <ShieldCheck className="w-3.5 h-3.5 text-brand-400 flex-shrink-0" />
          </div>

          {/* Mon compte */}
          <Link
            href="/dashboard/account"
            onClick={handleLink}
            className={cn(
              'flex items-center gap-3 w-full px-3.5 py-2.5 rounded-xl text-[13.5px] font-medium transition-all',
              pathname === '/dashboard/account'
                ? 'bg-brand-600 text-white'
                : 'text-slate-400 hover:text-white hover:bg-white/[0.07]',
            )}
          >
            <User className="w-[18px] h-[18px]" />
            Mon compte
          </Link>

          {/* Déconnexion */}
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-3.5 py-2.5 rounded-xl text-[13.5px] font-medium text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all"
          >
            <LogOut className="w-[18px] h-[18px]" />
            Déconnexion
          </button>
        </div>
      </aside>
    </>
  );
}
