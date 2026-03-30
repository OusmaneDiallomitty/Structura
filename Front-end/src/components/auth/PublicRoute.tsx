"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import * as storage from "@/lib/storage";

interface PublicRouteProps {
  children: React.ReactNode;
}

export function PublicRoute({ children }: PublicRouteProps) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  // Pages accessibles même quand connecté (flux email + activation de compte)
  const isEmailFlowPage =
    pathname?.startsWith("/verify-email") ||
    pathname?.startsWith("/check-email") ||
    pathname?.startsWith("/setup-account");

  useEffect(() => {
    if (!isLoading && isAuthenticated && user && !isEmailFlowPage) {
      // Utilisateur vérifié → rediriger vers dashboard
      if (user.emailVerified !== false) {
        // Nettoyer le flag de déconnexion manuelle
        sessionStorage.removeItem("structura_manual_logout");
        const redirectUrl = sessionStorage.getItem("redirectAfterLogin");
        sessionStorage.removeItem("redirectAfterLogin");

        const isCommerceUrl = redirectUrl?.startsWith("/dashboard/commerce");
        const isSchoolUrl   = redirectUrl?.startsWith("/dashboard") && !isCommerceUrl;
        const isCommerce    = user.moduleType === 'COMMERCE';

        // Sécurité : ne jamais rediriger un user ÉCOLE vers une URL COMMERCE et vice versa
        const moduleMatch = isCommerce ? !isSchoolUrl : !isCommerceUrl;

        const safeRedirect =
          redirectUrl?.startsWith("/") && !redirectUrl.startsWith("//") && moduleMatch
            ? redirectUrl
            : isCommerce ? "/dashboard/commerce" : "/dashboard";

        router.push(safeRedirect);
      }
    }
  }, [isAuthenticated, isLoading, router, pathname, user, isEmailFlowPage]);

  // Authentifié + email vérifié + pas sur page email-flow → ne rien afficher (redirection en cours)
  if (isAuthenticated && user?.emailVerified !== false && !isEmailFlowPage && !pathname?.startsWith("/onboarding")) {
    return null;
  }

  return <>{children}</>;
}
