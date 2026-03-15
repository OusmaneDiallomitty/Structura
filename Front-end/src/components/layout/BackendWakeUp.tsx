"use client";

import { useEffect } from "react";

/**
 * Ping silencieux le backend Render au chargement de l'app.
 * Render free tier met le backend en veille après 15 min d'inactivité.
 * Ce ping le réveille en arrière-plan avant que l'utilisateur fasse la
 * première action, évitant le délai de 30-60s sur les dialogs.
 */
export function BackendWakeUp() {
  useEffect(() => {
    const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api";
    fetch(`${API}/health`, { method: "GET", cache: "no-store" }).catch(() => {
      // Silencieux — le backend finira par se réveiller de toute façon
    });
  }, []);

  return null;
}
