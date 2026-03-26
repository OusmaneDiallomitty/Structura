"use client";

import { useEffect, useState } from "react";
import { WifiOff, Wifi, RefreshCw } from "lucide-react";
import { useOnline } from "@/hooks/use-online";
import { syncQueue } from "@/lib/sync-queue";
import { cn } from "@/lib/utils";

/**
 * Banner qui affiche l'état de la connexion et le statut de synchronisation
 */
export function OfflineBanner() {
  const isOnline = useOnline();
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);

  // Mettre à jour le compteur d'actions en attente
  useEffect(() => {
    const updatePendingCount = async () => {
      const count = await syncQueue.getPendingCount();
      setPendingCount(count);
    };

    updatePendingCount();

    // Mettre à jour toutes les 5 secondes
    const interval = setInterval(updatePendingCount, 5000);

    return () => clearInterval(interval);
  }, [isOnline]);

  // Gérer la synchronisation manuelle
  const handleSync = async () => {
    setIsSyncing(true);
    await syncQueue.process();
    setIsSyncing(false);
    const count = await syncQueue.getPendingCount();
    setPendingCount(count);
  };

  // Vider la queue (cas bloqué)
  const handleClear = async () => {
    await syncQueue.clear();
    setPendingCount(0);
  };

  // Ne rien afficher si en ligne et rien à synchroniser
  if (isOnline && pendingCount === 0) {
    return null;
  }

  return (
    <div
      className={cn(
        "fixed top-0 left-0 right-0 z-50 px-4 py-2 text-sm font-medium text-white transition-all duration-300",
        isOnline
          ? "bg-blue-600"
          : "bg-amber-600"
      )}
    >
      <div className="container mx-auto flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isOnline ? (
            <>
              <Wifi className="h-4 w-4" />
              <span>Connexion rétablie</span>
            </>
          ) : (
            <>
              <WifiOff className="h-4 w-4" />
              <span>Vous êtes hors ligne</span>
            </>
          )}
          
          {pendingCount > 0 && (
            <span className="ml-2 px-2 py-0.5 bg-white/20 rounded-full text-xs">
              {pendingCount} action{pendingCount > 1 ? "s" : ""} en attente
            </span>
          )}
        </div>

        {isOnline && pendingCount > 0 && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleSync}
              disabled={isSyncing}
              className="flex items-center gap-1 px-3 py-1 bg-white/20 hover:bg-white/30 rounded-md transition-colors disabled:opacity-50"
            >
              <RefreshCw className={cn("h-3 w-3", isSyncing && "animate-spin")} />
              <span className="text-xs">
                {isSyncing ? "Synchronisation..." : "Synchroniser"}
              </span>
            </button>
            <button
              onClick={handleClear}
              disabled={isSyncing}
              className="flex items-center gap-1 px-3 py-1 bg-white/10 hover:bg-white/20 rounded-md transition-colors disabled:opacity-50 text-white/70 hover:text-white"
              title="Vider la file d'attente"
            >
              <span className="text-xs">Vider</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
