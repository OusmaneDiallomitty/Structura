"use client";

import { Sidebar } from "@/components/dashboard/Sidebar";
import { Header } from "@/components/dashboard/Header";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { OfflineBanner } from "@/components/shared/OfflineBanner";
import ImpersonationBanner from "@/components/shared/ImpersonationBanner";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
