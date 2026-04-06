"use client";

import { useEffect } from "react";

/**
 * Enregistre le service worker Structura pour le support offline.
 * Écoute le message SW_UPDATED : quand une nouvelle version s'active,
 * recharge silencieusement la page pour charger les nouveaux assets.
 */
export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    // ── Listener mise à jour automatique ──────────────────────────────────────
    // Le SW envoie SW_UPDATED après clients.claim() lors d'une nouvelle version.
    // On attend 500 ms pour laisser le SW finir de s'activer, puis on recharge.
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "SW_UPDATED") {
        setTimeout(() => window.location.reload(), 500);
      }
    };
    navigator.serviceWorker.addEventListener("message", handleMessage);

    // ── Enregistrement ────────────────────────────────────────────────────────
    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then((reg) => {
        // Vérifier une mise à jour immédiatement à l'ouverture de l'app
        reg.update().catch(() => {});
      })
      .catch((err) => {
        console.warn("[SW] Échec enregistrement :", err);
      });

    return () => {
      navigator.serviceWorker.removeEventListener("message", handleMessage);
    };
  }, []);

  return null;
}
