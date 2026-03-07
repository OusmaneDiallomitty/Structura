'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { Menu, X } from 'lucide-react';
import Sidebar from '@/components/Sidebar';
import { getValidToken, getStoredUser, isSuperAdmin, logout } from '@/lib/auth';
import { getRefreshToken, setToken, setRefreshToken } from '@/lib/api';

// ─── Helpers token ────────────────────────────────────────────────────────────

function getTokenExpiry(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch { return null; }
}

async function proactiveRefresh(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api'}/auth/refresh`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken }) },
    );
    if (!res.ok) return false;
    const data = await res.json();
    setToken(data.token);
    if (data.refreshToken) setRefreshToken(data.refreshToken);
    return true;
  } catch { return false; }
}

// ─── Bannière session expirée ─────────────────────────────────────────────────

function SessionExpiredBanner() {
  const params = useSearchParams();
  if (params.get('reason') !== 'session_expired') return null;
  return (
    <div className="bg-red-600 text-white text-sm font-medium text-center py-2.5 px-4 flex-shrink-0">
      Votre session a expiré — vous avez été déconnecté automatiquement.
    </div>
  );
}

// ─── Layout ───────────────────────────────────────────────────────────────────

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Vérification auth + refresh proactif
  useEffect(() => {
    const token = getValidToken();
    const user  = getStoredUser();
    if (!token || !user || !isSuperAdmin(user)) {
      logout(); router.replace('/login'); return;
    }

    const intervalId = setInterval(async () => {
      const current = getValidToken();
      if (!current) {
        const ok = await proactiveRefresh();
        if (!ok) { clearInterval(intervalId); logout(); router.replace('/login?reason=session_expired'); }
        return;
      }
      const expiry = getTokenExpiry(current);
      if (expiry && expiry - Date.now() < 3 * 60 * 1000) {
        const ok = await proactiveRefresh();
        if (!ok) { clearInterval(intervalId); logout(); router.replace('/login?reason=session_expired'); }
      }
    }, 60_000);

    return () => clearInterval(intervalId);
  }, [router]);

  // Fermer le sidebar au resize vers desktop
  useEffect(() => {
    const onResize = () => { if (window.innerWidth >= 1024) setSidebarOpen(false); };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return (
    <div className="flex h-screen bg-slate-50/70 overflow-hidden">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Zone de contenu principale */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* ── Top bar mobile ───────────────────────────────────────────────── */}
        <header className="flex lg:hidden items-center justify-between px-4 h-14 bg-white border-b border-gray-100 flex-shrink-0 shadow-sm">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen((o) => !o)}
              className="w-9 h-9 flex items-center justify-center rounded-xl text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition active:scale-95"
              aria-label="Menu"
            >
              {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-brand-600 flex items-center justify-center text-white text-xs font-bold">
                S
              </div>
              <span className="text-sm font-semibold text-gray-900">Structura Admin</span>
            </div>
          </div>
        </header>

        {/* Bannière session */}
        <Suspense fallback={null}>
          <SessionExpiredBanner />
        </Suspense>

        {/* Contenu scrollable */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
