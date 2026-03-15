"use client";

import { ReactNode } from "react";
import { ParallaxProvider } from "react-scroll-parallax";
import { AuthProvider } from "@/contexts/AuthContext";
import { SmoothScrollProvider } from "./SmoothScrollProvider";
import { ScrollProgress } from "./ScrollProgress";
import { useNotifications } from "@/hooks/use-notifications";
import { BackendWakeUp } from "./BackendWakeUp";

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
  return (
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
  );
}
