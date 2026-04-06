"use client";

import { useEffect, useState } from "react";
import { checkApproval, exchangeCode } from "@/lib/api/auth.service";

const TOKEN_KEY         = "structura_token";
const REFRESH_TOKEN_KEY = "structura_refresh_token";
const USER_KEY          = "structura_user";

type Phase = "loading" | "approved" | "redirecting" | "expired" | "error";

export default function ApproveLoginPage() {
  const [phase, setPhase] = useState<Phase>("loading");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token  = params.get("token") || "";

    if (!token) {
      setPhase("expired");
      return;
    }

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api";

    fetch(`${apiUrl}/auth/approve-login?token=${token}`, { method: "GET" })
      .then(async (res) => {
        if (!res.ok) { setPhase("expired"); return; }

        // ── Cas même appareil (PWA) ──────────────────────────────────────────
        // L'approbateur ET le demandeur sont la même personne sur le même appareil.
        // On a sauvegardé le pendingToken dans localStorage au moment du login.
        // On peut donc immédiatement échanger le code et rediriger vers le dashboard.
        const pendingToken = localStorage.getItem("structura_pending_token");
        if (pendingToken) {
          setPhase("redirecting");
          localStorage.removeItem("structura_pending_token");
          try {
            // Petit délai pour laisser le backend propager l'approbation
            await new Promise((r) => setTimeout(r, 600));

            const result = await checkApproval(pendingToken);
            if (result.status === "approved" && result.code) {
              const deviceId = localStorage.getItem("structura_device_id") || undefined;
              const session  = await exchangeCode(result.code, deviceId);

              const rememberMe = sessionStorage.getItem("structura_pending_remember") === "true";
              sessionStorage.removeItem("structura_pending_remember");

              localStorage.setItem(TOKEN_KEY, session.token);
              localStorage.setItem(REFRESH_TOKEN_KEY, session.refreshToken);
              localStorage.setItem(USER_KEY, JSON.stringify(session.user));
              if (rememberMe) {
                localStorage.setItem("structura_remember_me", "true");
              } else {
                localStorage.removeItem("structura_remember_me");
              }

              window.location.href = "/dashboard";
              return;
            }
          } catch {
            // En cas d'erreur réseau : retomber sur l'affichage normal
          }
          // Si l'échange a échoué : afficher le message standard
          setPhase("approved");
          return;
        }

        // ── Cas appareil différent : afficher le message standard ────────────
        setPhase("approved");
      })
      .catch(() => setPhase("error"));
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8 text-center">

        {(phase === "loading" || phase === "redirecting") && (
          <>
            <div className="flex justify-center mb-6">
              <div className={`w-16 h-16 rounded-full border-4 animate-spin ${
                phase === "redirecting"
                  ? "border-green-200 border-t-green-500"
                  : "border-indigo-200 border-t-indigo-500"
              }`} />
            </div>
            <h1 className="text-xl font-bold text-gray-900">
              {phase === "redirecting" ? "Connexion en cours…" : "Validation en cours…"}
            </h1>
            {phase === "redirecting" && (
              <p className="text-gray-500 text-sm mt-2">Redirection vers le tableau de bord…</p>
            )}
          </>
        )}

        {phase === "approved" && (
          <>
            <div className="flex justify-center mb-6">
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
                <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
            </div>
            <h1 className="text-xl font-bold text-gray-900 mb-2">Connexion autorisée !</h1>
            <p className="text-gray-500 text-sm">
              L&apos;autre appareil va être redirigé vers le tableau de bord.<br />
              Vous pouvez fermer cette page.
            </p>
          </>
        )}

        {phase === "expired" && (
          <>
            <div className="flex justify-center mb-6">
              <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center">
                <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
            <h1 className="text-xl font-bold text-gray-900 mb-2">Lien expiré</h1>
            <p className="text-gray-500 text-sm">
              Ce lien d&apos;approbation est invalide ou a déjà été utilisé.
            </p>
          </>
        )}

        {phase === "error" && (
          <>
            <div className="flex justify-center mb-6">
              <div className="w-16 h-16 rounded-full bg-orange-100 flex items-center justify-center">
                <svg className="w-8 h-8 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
              </div>
            </div>
            <h1 className="text-xl font-bold text-gray-900 mb-2">Erreur réseau</h1>
            <p className="text-gray-500 text-sm">
              Impossible de contacter le serveur. Veuillez réessayer.
            </p>
          </>
        )}

      </div>
    </div>
  );
}
