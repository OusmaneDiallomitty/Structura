"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { User } from "@/types/index";
import { UserPermissions, DEFAULT_PERMISSIONS, RoleType } from "@/types/permissions";
import {
  registerUser,
  loginUser,
  logoutUser,
  refreshToken as apiRefreshToken,
  RegisterPayload,
  PendingApprovalResponse,
} from "@/lib/api/auth.service";
import { toast } from "sonner";
import { updateProfile, getMyProfile } from "@/lib/api/users.service";
import * as storage from "@/lib/storage";
import { offlineDB } from "@/lib/offline-db";
import { prefetchOfflineData, resetPrefetchCooldown } from "@/lib/offline-prefetch";

/** Clés localStorage liées à un tenant spécifique — à purger si le tenant change */
const TENANT_SCOPED_KEYS = [
  "structura_payment_frequency",
  "structura_class_fees_v2",
  "structura_school_calendar_v1",
  "structura_school_type",
];

/** Purge les données du tenant précédent si l'utilisateur connecté est dans un autre tenant */
function clearStaleTenanData(newTenantId: string) {
  try {
    const last = localStorage.getItem("structura_last_tenant_id");
    if (last && last !== newTenantId) {
      TENANT_SCOPED_KEYS.forEach((k) => localStorage.removeItem(k));
      offlineDB.clearAll().catch(() => {});
      // Forcer un re-fetch complet pour le nouveau tenant (bypass cooldown)
      resetPrefetchCooldown();
    }
    localStorage.setItem("structura_last_tenant_id", newTenantId);
  } catch { /* quota ou SSR */ }
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string, rememberMe?: boolean, tenantId?: string) => Promise<void | { status: 'SELECT_TENANT'; tenants: { tenantId: string; tenantName: string; moduleType: 'SCHOOL' | 'COMMERCE'; role: string; emailVerified: boolean }[] }>;
  register: (data: RegisterPayload) => Promise<{ needsOnboarding: boolean; organizationType: string }>;
  logout: () => void;
  updateUser: (data: Partial<User>) => Promise<void>;
  patchUserLocally: (data: Partial<User>) => void;
  refreshEmailVerified: () => void;
  /**
   * Recharge le profil depuis le backend et met à jour classAssignments en local.
   * Appelé par les pages présences et notes au montage pour que les
   * affectations de classes/matières soient toujours à jour sans reconnexion.
   */
  refreshUserProfile: () => Promise<void>;
  hasPermission: (resource: string, action: string) => boolean;
  getValidToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Clés de stockage
const TOKEN_KEY = "structura_token";
const REFRESH_TOKEN_KEY = "structura_refresh_token";
const USER_KEY = "structura_user";

// Décode le payload JWT (base64url) sans bibliothèque externe
// Retourne true si le token est expiré ou invalide
function isTokenExpired(token: string): boolean {
  try {
    const base64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(base64));
    return payload.exp * 1000 < Date.now();
  } catch {
    return true;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    // Charger depuis le localStorage d'abord (affichage immédiat)
    // puis rafraîchir depuis le serveur pour avoir les permissions à jour
    loadUser().then(() => {
      refreshUserProfile();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Rafraîchir les permissions dès que l'onglet reprend le focus (alt+tab, retour sur l'app)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshUserProfile();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Déconnexion automatique si une autre session prend la place (détectée par fetchWithTimeout)
  useEffect(() => {
    const handleSessionInvalidated = () => {
      // Tenter de nettoyer currentSessionId en BDD (fire-and-forget, ignoré si token invalide)
      const staleToken = storage.getAuthItem(TOKEN_KEY);
      if (staleToken) logoutUser(staleToken).catch(() => {});
      clearAuth();
      toast.info('Votre session a été fermée. Veuillez vous reconnecter.', {
        duration: 6000,
      });
      router.push('/login');
    };
    window.addEventListener('auth:session-invalidated', handleSessionInvalidated);
    return () => window.removeEventListener('auth:session-invalidated', handleSessionInvalidated);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Heartbeat toutes les 5 minutes : refresh token si expiré + sync permissions depuis le serveur.
  // Le sync permissions garantit que les changements faits par le fondateur prennent effet
  // sans forcer la déconnexion/reconnexion du directeur.
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(() => {
      const token = storage.getAuthItem(TOKEN_KEY);
      if (!token) return;
      if (isTokenExpired(token)) {
        tryRefreshToken();
      } else {
        // Rafraîchir le profil (permissions incluses) silencieusement
        refreshUserProfile();
      }
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const clearAuth = () => {
    // Nettoyer les deux storages + la préférence rememberMe
    storage.removeAuthItem(TOKEN_KEY);
    storage.removeAuthItem(REFRESH_TOKEN_KEY);
    storage.removeAuthItem(USER_KEY);
    localStorage.removeItem("structura_remember_me");
    setUser(null);
  };

  const tryRefreshToken = async (): Promise<boolean> => {
    const refreshTokenValue = storage.getAuthItem(REFRESH_TOKEN_KEY);
    if (!refreshTokenValue) return false;
    try {
      const res = await apiRefreshToken(refreshTokenValue);
      storage.setAuthItem(TOKEN_KEY, res.token, storage.isPersistent());
      storage.setAuthItem(REFRESH_TOKEN_KEY, res.refreshToken, storage.isPersistent());
      return true;
    } catch (err: any) {
      // Session révoquée par une connexion sur un autre appareil
      if (err?.message === 'SESSION_INVALIDATED') {
        clearAuth();
        toast.error('Vous avez été déconnecté — une nouvelle connexion a été détectée sur un autre appareil.', {
          duration: 8000,
        });
        router.push('/login');
      }
      return false;
    }
  };

  // Retourne un token valide (refresh automatique si expiré) ou null si session expirée
  const getValidToken = async (): Promise<string | null> => {
    const token = storage.getAuthItem(TOKEN_KEY);
    if (!token) return null;

    if (!isTokenExpired(token)) return token;

    // Offline + token expiré → retourner le token périmé pour permettre le travail hors ligne
    if (!navigator.onLine) return token;

    // Token expiré + en ligne → tenter un refresh
    const refreshed = await tryRefreshToken();
    if (!refreshed) {
      clearAuth();
      return null;
    }
    return storage.getAuthItem(TOKEN_KEY);
  };

  const loadUser = async () => {
    try {
      const token = storage.getAuthItem(TOKEN_KEY);
      const userData = storage.getAuthItem(USER_KEY);

      if (token && userData) {
        if (isTokenExpired(token)) {
          // Token expiré → tenter un refresh silencieux seulement si en ligne
          if (navigator.onLine) {
            const refreshed = await tryRefreshToken();
            if (!refreshed) {
              // Ne pas déconnecter sur erreur réseau (ex : Render cold start ~30s)
              // SESSION_INVALIDATED est déjà géré dans tryRefreshToken (logout + redirect login).
              // On laisse l'app charger — un 401 sur un appel API provoquera un logout propre.
            }
          }
          // Offline + token expiré : on garde la session active (travail hors ligne)
        }
        // Lire les données utilisateur (inchangées après refresh)
        const freshUserData = storage.getAuthItem(USER_KEY);
        if (freshUserData) {
          setUser(JSON.parse(freshUserData));
          // Pre-fetch silencieux au chargement de l'app si le cooldown est écoulé.
          // Assure que les données IndexedDB sont fraîches même après une longue absence.
          const currentToken = storage.getAuthItem(TOKEN_KEY);
          if (currentToken) {
            const parsedUser = JSON.parse(freshUserData);
            prefetchOfflineData(currentToken, {
              moduleType: parsedUser?.moduleType,
              tenantId: parsedUser?.tenantId,
            }).catch(() => {});
          }
        }
      }
    } catch {
      clearAuth();
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (email: string, password: string, rememberMe: boolean = false, tenantId?: string) => {
    try {
      // Si un utilisateur différent est déjà connecté sur ce navigateur, fermer
      // proprement sa session en BDD avant de procéder. Sans ça, son currentSessionId
      // resterait actif → l'ancien utilisateur se ferait bloquer par l'approbation
      // s'il essaie de se reconnecter sur le même appareil.
      // Toujours invalider l'ancienne session avant une nouvelle connexion.
      // Même email : le compte peut avoir été recréé (tenant supprimé/recréé) →
      // l'ancien token pointerait vers un utilisateur supprimé → SESSION_INVALIDATED.
      const existingToken = storage.getAuthItem(TOKEN_KEY);
      if (existingToken) {
        await logoutUser(existingToken).catch(() => {});
        clearAuth();
      }

      // Récupérer ou créer un identifiant d'appareil persistant (localStorage — survit à la fermeture du navigateur).
      // Permet de sauter l'approbation quand l'utilisateur ferme Chrome puis revient sur le même appareil.
      let deviceId = localStorage.getItem('structura_device_id');
      if (!deviceId) {
        deviceId = crypto.randomUUID();
        localStorage.setItem('structura_device_id', deviceId);
      }

      const response = await loginUser({ email, password, deviceId, tenantId });

      // Plusieurs espaces trouvés → le frontend doit afficher un sélecteur
      if ('status' in response && response.status === 'SELECT_TENANT') {
        return response as { status: 'SELECT_TENANT'; tenants: { tenantId: string; tenantName: string; moduleType: 'SCHOOL' | 'COMMERCE'; role: string; emailVerified: boolean }[] };
      }

      // Approbation requise — une session active existait sur un autre appareil
      if ('status' in response && response.status === 'PENDING_APPROVAL') {
        const { pendingToken } = response as PendingApprovalResponse;
        // Mémoriser la préférence rememberMe pour après l'approbation
        sessionStorage.setItem('structura_pending_remember', rememberMe ? 'true' : 'false');
        router.push(`/pending-approval?token=${encodeURIComponent(pendingToken)}`);
        return;
      }

      // Connexion directe (pas de session active précédente)
      const authResponse = response as import("@/lib/api/auth.service").AuthResponse;

      // persist=true → localStorage (7 jours) | persist=false → sessionStorage (fermeture navigateur)
      storage.setAuthItem(TOKEN_KEY, authResponse.token, rememberMe);
      storage.setAuthItem(REFRESH_TOKEN_KEY, authResponse.refreshToken, rememberMe);
      storage.setAuthItem(USER_KEY, JSON.stringify(authResponse.user), rememberMe);

      // Mémoriser la préférence pour les écritures futures (refreshEmailVerified, updateUser…)
      if (rememberMe) {
        localStorage.setItem("structura_remember_me", "true");
      } else {
        localStorage.removeItem("structura_remember_me");
      }

      // Purger les données stale si changement de tenant (ex: connexion avec un autre compte)
      if (authResponse.user.tenantId) clearStaleTenanData(authResponse.user.tenantId);

      setUser(authResponse.user);

      // Pre-fetch en arrière-plan : charge élèves, classes, paiements dans IndexedDB
      // pour que toutes les pages soient disponibles hors ligne sans visite préalable.
      // Force=true : on vient de se connecter → données fraîches garanties.
      prefetchOfflineData(authResponse.token, {
        force: true,
        moduleType: authResponse.user.moduleType,
        tenantId: authResponse.user.tenantId,
      }).catch(() => {});

      if (!authResponse.user.emailVerified) {
        router.push("/check-email");
      } else if (authResponse.user.moduleType === 'COMMERCE') {
        router.push("/dashboard/commerce");
      } else {
        router.push("/dashboard");
      }
    } catch (error) {
      throw error;
    }
  };

  const register = async (data: RegisterPayload) => {
    try {
      const response = await registerUser(data);

      // Stocker les données d'authentification en localStorage (connexion automatique).
      // On force persist=true pour que les refreshs de token (heartbeat) gardent les
      // tokens en localStorage et non sessionStorage — évite la déconnexion au F5.
      storage.setAuthItem(TOKEN_KEY, response.token, true);
      storage.setAuthItem(REFRESH_TOKEN_KEY, response.refreshToken, true);
      storage.setAuthItem(USER_KEY, JSON.stringify(response.user), true);
      localStorage.setItem("structura_remember_me", "true");

      // Purger les données stale d'un tenant précédent (même navigateur, nouveau compte)
      if (response.user.tenantId) clearStaleTenanData(response.user.tenantId);

      setUser(response.user);

      // Retourner les infos pour la redirection
      return {
        needsOnboarding: true,
        organizationType: data.organizationType,
      };
    } catch (error) {
      throw error;
    }
  };

  const logout = () => {
    // Invalider la session côté serveur (fire-and-forget)
    const token = storage.getAuthItem(TOKEN_KEY);
    if (token) logoutUser(token).catch(() => {});
    clearAuth();
    router.push("/login");
  };

  const refreshEmailVerified = () => {
    try {
      const userData = storage.getAuthItem(USER_KEY);
      if (userData) {
        const updatedUser: User = { ...JSON.parse(userData), emailVerified: true };
        // Réécrire dans le même storage (localStorage ou sessionStorage)
        storage.setAuthItem(USER_KEY, JSON.stringify(updatedUser), storage.isPersistent());
        setUser(updatedUser);
      }
    } catch {
      // Silencieux
    }
  };

  const updateUser = async (data: Partial<User>) => {
    const token = storage.getAuthItem(TOKEN_KEY);
    if (!token) throw new Error("Session expirée");

    const updated = await updateProfile(token, {
      firstName: data.firstName,
      lastName:  data.lastName,
      phone:     data.phone ?? undefined,
    });

    if (user) {
      const updatedUser: User = {
        ...user,
        firstName: updated.firstName,
        lastName:  updated.lastName,
        phone:     updated.phone ?? undefined,
      };
      storage.setAuthItem(USER_KEY, JSON.stringify(updatedUser), storage.isPersistent());
      setUser(updatedUser);
    }
  };

  /**
   * Recharge les données du profil depuis le backend (GET /users/me).
   * Met à jour classAssignments en mémoire + localStorage/sessionStorage.
   * Les pages présences et notes écoutent user.classAssignments → elles
   * se re-filtrent automatiquement sans rechargement.
   */
  const refreshUserProfile = async (): Promise<void> => {
    const token = storage.getAuthItem(TOKEN_KEY);
    if (!token || !user) return;
    try {
      const profile = await getMyProfile(token);
      if (!profile) return;
      const updatedUser: User = {
        ...user,
        classAssignments: (profile.classAssignments ?? []) as User["classAssignments"],
        permissions: profile.permissions ?? user.permissions ?? null,
      };
      storage.setAuthItem(USER_KEY, JSON.stringify(updatedUser), storage.isPersistent());
      setUser(updatedUser);
    } catch {
      // Silencieux — ne pas bloquer si offline ou token expiré
    }
  };

  // Met à jour le state local + localStorage sans appel API
  // Utilisé pour propager des changements venant d'autres endpoints (ex: nom de l'école)
  const patchUserLocally = (data: Partial<User>) => {
    if (!user) return;
    const updatedUser: User = { ...user, ...data };
    storage.setItem(USER_KEY, JSON.stringify(updatedUser));
    setUser(updatedUser);
  };

  const hasPermission = (resource: string, action: string): boolean => {
    if (!user) return false;

    // Le fondateur a toutes les permissions sans exception
    if (user.role === "director") return true;

    // Le directeur délégué (isCoDirector) a accès à tout sauf :
    // - payments.create / edit / delete / configure → contrôlés individuellement par le fondateur
    // - expenses.create / edit / delete              → idem
    if ((user.permissions as any)?.isCoDirector === true) {
      const directorControlled =
        (resource === "payments" && ["create", "edit", "delete", "configure"].includes(action)) ||
        (resource === "expenses" && ["create", "edit", "delete"].includes(action));

      if (!directorControlled) return true;

      // Pour ces actions spécifiques, vérifier les permissions réelles stockées en BDD
      const res = user.permissions as unknown as Record<string, Record<string, boolean>>;
      return res[resource]?.[action] === true;
    }

    // Permissions custom persistées en BDD (prioritaires sur les défauts du rôle)
    if (user.permissions) {
      const res = user.permissions as unknown as Record<string, Record<string, boolean>>;
      return res[resource]?.[action] === true;
    }

    // Permissions par défaut du rôle
    const rolePerms = DEFAULT_PERMISSIONS[user.role as RoleType];
    if (!rolePerms) return false;
    const resPerms = rolePerms[resource as keyof UserPermissions] as Record<string, boolean> | undefined;
    return resPerms?.[action] === true;
  };

  const value = {
    user,
    isAuthenticated: !!user,
    isLoading,
    login,
    register,
    logout,
    updateUser,
    patchUserLocally,
    refreshEmailVerified,
    refreshUserProfile,
    hasPermission,
    getValidToken,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

// Hook pour vérifier les permissions
export function usePermission(resource: string, action: string) {
  const { hasPermission } = useAuth();
  return hasPermission(resource, action);
}

// Hook pour obtenir le token
export function useToken() {
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    setToken(storage.getItem(TOKEN_KEY));
  }, []);

  return token;
}
