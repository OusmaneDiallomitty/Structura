"use client";

import { useEffect } from "react";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { Header } from "@/components/dashboard/Header";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { OfflineBanner } from "@/components/shared/OfflineBanner";
import ImpersonationBanner from "@/components/shared/ImpersonationBanner";
import { preloadOfflineData } from "@/lib/offline-preloader";
import * as storage from "@/lib/storage";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Précharge toutes les données dans IndexedDB en arrière-plan.
  // Se déclenche au montage ET à chaque retour de connexion.
  useEffect(() => {
    const runPreload = () => {
      const token = storage.getAuthItem("structura_token");
      if (token && navigator.onLine) {
        preloadOfflineData(token);
      }
    };

    runPreload(); // Au montage
    window.addEventListener("online", runPreload); // Au retour online
    return () => window.removeEventListener("online", runPreload);
  }, []);

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-background">
        {/* Bannière session d'impersonation Super Admin */}
        <ImpersonationBanner />
        {/* Banner de statut offline/sync */}
        <OfflineBanner />
        
        {/* Sidebar */}
        <Sidebar />

        {/* Main Content */}
        <div className="lg:pl-72 min-h-screen flex flex-col">
          {/* Header */}
          <Header />

          {/* Page Content */}
          <main className="flex-1 p-4 lg:p-8 pb-24 animate-in fade-in slide-in-from-bottom-4 duration-500 overflow-x-hidden">
            {children}
          </main>
        </div>
      </div>
    </ProtectedRoute>
  );
}
