"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { checkApproval, exchangeCode } from "@/lib/api/auth.service";
import * as storage from "@/lib/storage";

// Clés de stockage (identiques à AuthContext)
const TOKEN_KEY         = "structura_token";
const REFRESH_TOKEN_KEY = "structura_refresh_token";
const USER_KEY          = "structura_user";

type Phase = "waiting" | "exchanging" | "approved" | "denied" | "expired" | "error";

export default function PendingApprovalPage() {
  const router   = useRouter();
  const [phase, setPhase]         = useState<Phase>("waiting");
  const [seconds, setSeconds]     = useState(600); // TTL 10 min
  const [canRetry, setCanRetry]   = useState(false); // bouton "Vérifier" visible après retour connexion
  const [isChecking, setIsChecking] = useState(false); // feedback bouton

  const intervalRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef        = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingToken   = useRef<string>("");
  const exchanging     = useRef(false); // guard — un seul échange en cours
  const phaseRef       = useRef<Phase>("waiting"); // version ref pour les callbacks async
  const [errorMsg, setErrorMsg] = useState<string>("");

  // ── Échange du code → session ────────────────────────────────────────────────
  const doExchange = useCallback(async (code: string) => {
    if (exchanging.current) return;
    exchanging.current = true;
    setPhase("exchanging");
    phaseRef.current = "exchanging";

    try {
      const rememberMe = sessionStorage.getItem("structura_pending_remember") === "true";
      sessionStorage.removeItem("structura_pending_remember");

      const deviceId = localStorage.getItem("structura_device_id") || undefined;
      const session  = await exchangeCode(code, deviceId);

      storage.setAuthItem(TOKEN_KEY, session.token, rememberMe);
      storage.setAuthItem(REFRESH_TOKEN_KEY, session.refreshToken, rememberMe);
      storage.setAuthItem(USER_KEY, JSON.stringify(session.user), rememberMe);
      if (rememberMe) {
        localStorage.setItem("structura_remember_me", "true");
      } else {
        localStorage.removeItem("structura_remember_me");
      }

      setPhase("approved");
      phaseRef.current = "approved";
      setTimeout(() => { window.location.href = "/dashboard"; }, 1500);
    } catch (err) {
      exchanging.current = false;
      setErrorMsg(err instanceof Error ? err.message : "Erreur lors de la connexion");
      setPhase("error");
      phaseRef.current = "error";
    }
  }, []);

  // ── Un seul poll (mutualisé : polling régulier + vérification manuelle) ──────
  const pollOnce = useCallback(async () => {
    if (exchanging.current) return;
    if (phaseRef.current !== "waiting") return;

    try {
      const result = await checkApproval(pendingToken.current);

      if (result.status === "approved" && result.code) {
        clearInterval(pollRef.current!);
        clearInterval(intervalRef.current!);
        await doExchange(result.code);

      } else if (result.status === "denied") {
        clearInterval(pollRef.current!);
        clearInterval(intervalRef.current!);
        setPhase("denied");
        phaseRef.current = "denied";

      } else if (result.status === "expired") {
        clearInterval(pollRef.current!);
        clearInterval(intervalRef.current!);
        setPhase("expired");
        phaseRef.current = "expired";
      }
      // status === "pending" → rien, continuer à attendre
    } catch {
      // Silencieux — réseau indisponible, réessayer au prochain tick
    }
  }, [doExchange]);

  useEffect(() => {
    // ── 1. Si déjà connecté, aller directement au dashboard ─────────────────
    const existingToken = storage.getAuthItem(TOKEN_KEY);
    if (existingToken) {
      window.location.href = "/dashboard";
      return;
    }

    // ── 2. Lire le token depuis l'URL ────────────────────────────────────────
    const params = new URLSearchParams(window.location.search);
    const token  = params.get("token") || "";
    pendingToken.current = token;

    if (!token) {
      setPhase("expired");
      phaseRef.current = "expired";
      return;
    }

    // ── 3. Poll immédiat au montage — évite d'attendre 3s si déjà approuvé ──
    pollOnce();

    // ── 4. Compte à rebours 10 min ───────────────────────────────────────────
    intervalRef.current = setInterval(() => {
      setSeconds((s) => {
        if (s <= 1) {
          clearInterval(intervalRef.current!);
          if (phaseRef.current === "waiting") {
            setPhase("expired");
            phaseRef.current = "expired";
          }
          return 0;
        }
        return s - 1;
      });
    }, 1000);

    // ── 5. Poll toutes les 3 secondes ────────────────────────────────────────
    pollRef.current = setInterval(pollOnce, 3000);

    // ── 6. Poll immédiat au retour de connexion ──────────────────────────────
    const handleNetworkOnline = () => {
      if (phaseRef.current !== "waiting") return;
      setCanRetry(false); // on lance directement
      pollOnce();
    };
    const handleNetworkOffline = () => {
      // Connexion perdue : proposer le bouton "Vérifier" dès que ça revient
      if (phaseRef.current === "waiting") setCanRetry(true);
    };

    window.addEventListener("network:online",  handleNetworkOnline);
    window.addEventListener("network:offline", handleNetworkOffline);

    return () => {
      clearInterval(intervalRef.current!);
      clearInterval(pollRef.current!);
      window.removeEventListener("network:online",  handleNetworkOnline);
      window.removeEventListener("network:offline", handleNetworkOffline);
    };
  }, [pollOnce]);

  // ── Vérification manuelle (bouton) ───────────────────────────────────────────
  const handleManualCheck = async () => {
    setIsChecking(true);
    setCanRetry(false);
    await pollOnce();
    setIsChecking(false);
    // Si toujours en attente après vérif, ré-afficher le bouton après 5s
    if (phaseRef.current === "waiting") {
      setTimeout(() => setCanRetry(true), 5000);
    }
  };

  const formatTime = (s: number) => {
    const m   = Math.floor(s / 60).toString().padStart(2, "0");
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

            {/* Bouton "Vérifier maintenant" — visible si connexion revenue ou problème réseau */}
            {canRetry && (
              <div className="mt-4">
                <button
                  onClick={handleManualCheck}
                  disabled={isChecking}
                  className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-medium py-2 px-5 rounded-lg transition-colors text-sm"
                >
                  {isChecking ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                      Vérification…
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      Vérifier maintenant
                    </>
                  )}
                </button>
              </div>
            )}

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

        {phase === "exchanging" && (
          <>
            <div className="flex justify-center mb-6">
              <div className="w-16 h-16 rounded-full border-4 border-indigo-200 border-t-indigo-500 animate-spin" />
            </div>
            <h1 className="text-xl font-bold text-gray-900 mb-2">Connexion en cours…</h1>
            <p className="text-gray-500 text-sm">Finalisation de la session sécurisée.</p>
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

        {phase === "error" && (
          <>
            <div className="flex justify-center mb-6">
              <div className="w-16 h-16 rounded-full bg-orange-100 flex items-center justify-center">
                <svg className="w-8 h-8 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
              </div>
            </div>
            <h1 className="text-xl font-bold text-gray-900 mb-2">Échec de la connexion</h1>
            <p className="text-gray-500 text-sm mb-6">{errorMsg || "Une erreur inattendue s'est produite. Veuillez réessayer."}</p>
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
