"use client";

import { useEffect } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api";
const PING_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Ping le backend toutes les 10 minutes pour éviter le cold start sur Render (plan Starter).
 * Ce composant ne rend rien — il s'inclut une seule fois dans le layout racine.
 */
export function BackendKeepAlive() {
  useEffect(() => {
    const ping = () => {
      fetch(`${API_BASE}/health`, { method: "GET", cache: "no-store" }).catch(() => {});
    };

    // Premier ping au chargement de l'app
    ping();

    const id = setInterval(ping, PING_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  return null;
}
