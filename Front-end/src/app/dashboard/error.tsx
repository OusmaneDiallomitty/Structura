"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { WifiOff, RefreshCw, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOnline } from "@/hooks/use-online";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const isOnline = useOnline();
  const router = useRouter();

  useEffect(() => {
    // Quand la connexion revient, réessayer automatiquement
    if (isOnline) reset();
  }, [isOnline, reset]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-4">
      <div className="text-center space-y-6 max-w-md">
        <div className="flex justify-center">
          <div className="bg-orange-100 rounded-full p-5">
            <WifiOff className="h-10 w-10 text-orange-500" />
          </div>
        </div>

        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-gray-800">
            {isOnline ? "Une erreur s'est produite" : "Vous êtes hors ligne"}
          </h2>
          <p className="text-gray-500 text-sm">
            {isOnline
              ? "Une erreur inattendue s'est produite. Veuillez réessayer."
              : "Pas de connexion internet. Les données disponibles en cache restent accessibles depuis les autres pages."}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button onClick={reset} variant="default" className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Réessayer
          </Button>
          <Button
            onClick={() => router.push("/dashboard")}
            variant="outline"
            className="gap-2"
          >
            <Home className="h-4 w-4" />
            Tableau de bord
          </Button>
        </div>

        {!isOnline && (
          <p className="text-xs text-gray-400">
            La page se rechargera automatiquement au retour de la connexion.
          </p>
        )}
      </div>
    </div>
  );
}
