"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { checkApproval } from "@/lib/api/auth.service";
import * as storage from "@/lib/storage";

// Clés de stockage (identiques à AuthContext)
const TOKEN_KEY         = "structura_token";
const REFRESH_TOKEN_KEY = "structura_refresh_token";
const USER_KEY          = "structura_user";

type Phase = "waiting" | "approved" | "denied" | "expired";

export default function PendingApprovalPage() {
  const router   = useRouter();
  const [phase, setPhase]       = useState<Phase>("waiting");
  const [seconds, setSeconds]   = useState(600); // TTL 10 min
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingToken = useRef<string>("");

  useEffect(() => {
    // Lire le token depuis l'URL (window.location au lieu de useSearchParams → pas besoin de Suspense)
    const params = new URLSearchParams(window.location.search);
    const token  = params.get("token") || "";
    pendingToken.current = token;

    if (!token) {
      setPhase("expired");
      return;
    }

    // Compte à rebours 10 min
    intervalRef.current = setInterval(() => {
      setSeconds((s) => {
        if (s <= 1) {
          clearInterval(intervalRef.current!);
          setPhase("expired");
          return 0;
        }
        return s - 1;
      });
    }, 1000);

    // Poll backend toutes les 3 secondes
    pollRef.current = setInterval(async () => {
      try {
        const result = await checkApproval(pendingToken.current);

        if (result.status === "approved" && result.token && result.user) {
          clearInterval(pollRef.current!);
          clearInterval(intervalRef.current!);

          // Récupérer la préférence rememberMe sauvegardée avant la redirection
          const rememberMe = sessionStorage.getItem("structura_pending_remember") === "true";
          sessionStorage.removeItem("structura_pending_remember");

          // Stocker les tokens et l'utilisateur
          storage.setAuthItem(TOKEN_KEY, result.token, rememberMe);
          storage.setAuthItem(REFRESH_TOKEN_KEY, result.refreshToken ?? "", rememberMe);
          storage.setAuthItem(USER_KEY, JSON.stringify(result.user), rememberMe);
          if (rememberMe) {
            localStorage.setItem("structura_remember_me", "true");
          } else {
            localStorage.removeItem("structura_remember_me");
          }

          setPhase("approved");
          // Laisser l'écran "Approuvé" visible 1,5s puis rediriger
          setTimeout(() => router.push("/dashboard"), 1500);

        } else if (result.status === "denied") {
          clearInterval(pollRef.current!);
          clearInterval(intervalRef.current!);
          setPhase("denied");

        } else if (result.status === "expired") {
          clearInterval(pollRef.current!);
          clearInterval(intervalRef.current!);
          setPhase("expired");
        }
      } catch {
        // Silencieux — réseau indisponible, réessayer au prochain tick
      }
    }, 3000);

    return () => {
      clearInterval(intervalRef.current!);
      clearInterval(pollRef.current!);
    };
  }, [router]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60).toString().padStart(2, "0");
    const sec = (s % 60).toString().padStart(2, "0");
    return `${m}:${sec}`;
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8 text-center">

        {phase === "waiting" && (
          <>
            {/* Spinner */}
            <div className="flex justify-center mb-6">
              <div className="w-16 h-16 rounded-full border-4 border-amber-200 border-t-amber-500 animate-spin" />
            </div>
            <h1 className="text-xl font-bold text-gray-900 mb-3">
              Approbation requise
            </h1>
            <p className="text-gray-600 mb-2 leading-relaxed">
              Un email a été envoyé à votre adresse. Ouvrez-le et cliquez sur
              <strong className="text-gray-800"> Autoriser la connexion</strong> pour accéder au compte.
            </p>
            <p className="text-sm text-gray-400 mb-6">
              Cette page vérifie automatiquement toutes les 3 secondes.
            </p>
            <div className="inline-flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-700 rounded-full px-4 py-2 text-sm font-medium">
              <span>Expire dans</span>
              <span className="font-mono font-bold">{formatTime(seconds)}</span>
            </div>
            <div className="mt-6 pt-6 border-t border-gray-100">
              <button
                onClick={() => router.push("/login")}
                className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
              >
                Annuler et retourner à la connexion
              </button>
            </div>
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
            <p className="text-gray-500 text-sm">Redirection vers le tableau de bord…</p>
          </>
        )}

        {phase === "denied" && (
          <>
            <div className="flex justify-center mb-6">
              <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
                <svg className="w-8 h-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
            </div>
            <h1 className="text-xl font-bold text-gray-900 mb-3">Connexion refusée</h1>
            <p className="text-gray-600 mb-6 leading-relaxed">
              Le titulaire du compte a refusé cette demande de connexion.
            </p>
            <button
              onClick={() => router.push("/login")}
              className="w-full bg-gray-900 hover:bg-gray-800 text-white font-medium py-3 px-4 rounded-lg transition-colors"
            >
              Retour à la connexion
            </button>
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
            <h1 className="text-xl font-bold text-gray-900 mb-3">Demande expirée</h1>
            <p className="text-gray-600 mb-6 leading-relaxed">
              La demande de connexion a expiré (10 minutes). Veuillez réessayer.
            </p>
            <button
              onClick={() => router.push("/login")}
              className="w-full bg-gray-900 hover:bg-gray-800 text-white font-medium py-3 px-4 rounded-lg transition-colors"
            >
              Retour à la connexion
            </button>
          </>
        )}

      </div>
    </div>
  );
}
