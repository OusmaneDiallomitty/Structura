"use client";

import { useEffect, useState } from "react";

type Phase = "loading" | "approved" | "expired" | "error";

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
      .then((res) => {
        if (res.ok) setPhase("approved");
        else setPhase("expired");
      })
      .catch(() => setPhase("error"));
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8 text-center">

        {phase === "loading" && (
          <>
            <div className="flex justify-center mb-6">
              <div className="w-16 h-16 rounded-full border-4 border-indigo-200 border-t-indigo-500 animate-spin" />
            </div>
            <h1 className="text-xl font-bold text-gray-900">Validation en cours…</h1>
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
