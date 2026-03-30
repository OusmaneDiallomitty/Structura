"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: string[];
}

export function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
  const { user, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isLoading) {
      // 1. Non authentifié → login
      if (!isAuthenticated) {
        // Ne pas sauvegarder l'URL si c'est une déconnexion manuelle
        // (sinon ProtectedRoute re-sauvegarde l'URL juste après clearAuth)
        const isManualLogout = sessionStorage.getItem("structura_manual_logout") === "true";
        if (!isManualLogout) {
          sessionStorage.setItem("redirectAfterLogin", pathname);
        }
        router.push("/login");
        return;
      }

      // 2. Authentifié mais email non vérifié → check-email
      if (user && user.emailVerified === false) {
        router.push("/check-email");
        return;
      }

      // 3. Rôle insuffisant → dashboard
      if (requiredRole && user && !requiredRole.includes(user.role)) {
        router.push("/dashboard");
      }
    }
  }, [isAuthenticated, isLoading, user, requiredRole, router, pathname]);

  // Loader pendant la vérification initiale
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground">Chargement...</p>
        </div>
      </div>
    );
  }

  // Non authentifié (redirection en cours)
  if (!isAuthenticated) {
    return null;
  }

  // Email non vérifié (redirection en cours)
  if (user && user.emailVerified === false) {
    return null;
  }

  // Rôle insuffisant (redirection en cours)
  if (requiredRole && user && !requiredRole.includes(user.role)) {
    return null;
  }

  return <>{children}</>;
}
