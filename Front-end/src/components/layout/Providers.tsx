"use client";

import { ReactNode, useState } from "react";
import { ParallaxProvider } from "react-scroll-parallax";
import { AuthProvider } from "@/contexts/AuthContext";
import { SmoothScrollProvider } from "./SmoothScrollProvider";
import { ScrollProgress } from "./ScrollProgress";
import { useNotifications } from "@/hooks/use-notifications";
import { BackendWakeUp } from "./BackendWakeUp";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

interface ProvidersProps {
  children: ReactNode;
}

function NotificationsInit() {
  useNotifications();
  return null;
}

/**
 * Wrapper client component pour tous les providers
 * Nécessaire car Next.js layout.tsx est Server Component par défaut
 */
export function Providers({ children }: ProvidersProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,        // données fraîches 30s — pas de re-fetch inutile
            gcTime: 5 * 60_000,       // cache gardé 5 min en mémoire
            retry: 1,                 // 1 retry max sur erreur réseau
            refetchOnWindowFocus: false, // géré manuellement via useRefreshOnFocus
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <SmoothScrollProvider>
        <ParallaxProvider>
          <ScrollProgress />
          <AuthProvider>
            <BackendWakeUp />
            <NotificationsInit />
            {children}
          </AuthProvider>
        </ParallaxProvider>
      </SmoothScrollProvider>
    </QueryClientProvider>
  );
}
