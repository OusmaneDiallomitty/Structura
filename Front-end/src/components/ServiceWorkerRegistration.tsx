"use client";

import { useEffect } from "react";

/**
 * Enregistre le service worker Structura pour le support offline.
 * Doit être inclus dans le RootLayout (côté client uniquement).
 */
export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((reg) => {
        console.log("[SW] Enregistré :", reg.scope);
      })
      .catch((err) => {
        console.warn("[SW] Échec enregistrement :", err);
      });
  }, []);

  return null;
}
