"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import {
  Eye,
  EyeOff,
  Loader2,
  Building2,
  ArrowRight,
  AlertCircle,
  Lock,
  Mail,
  ShoppingCart,
  GraduationCap,
  ChevronRight,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { loginSchema, type LoginFormData } from "@/lib/validations";
import { ROUTES, APP_NAME } from "@/lib/constants";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { getUserFriendlyErrorMessage, getErrorDetails } from "@/lib/error-messages";
import { Logo } from "@/components/ui/Logo";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sélecteur d'espace multi-tenant
  const [tenantList, setTenantList] = useState<{ tenantId: string; tenantName: string; moduleType: 'SCHOOL' | 'COMMERCE'; role: string; emailVerified: boolean }[]>([]);
  const [pendingCredentials, setPendingCredentials] = useState<{ email: string; password: string; rememberMe: boolean } | null>(null);
  const [resendingFor, setResendingFor] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('revoked') === '1') {
      toast.success('Votre session a été révoquée avec succès. Reconnectez-vous.', { duration: 8000 });
    } else if (params.get('revoke_error') === '1') {
      toast.error('Lien de révocation invalide ou expiré.', { duration: 6000 });
    } else if (params.get('login_approved') === '1') {
      toast.success('Connexion autorisée. La session a été transférée vers le nouvel appareil.', { duration: 6000 });
    } else if (params.get('login_denied') === '1') {
      toast.info('Connexion refusée. Le nouvel appareil ne pourra pas accéder au compte.', { duration: 6000 });
    } else if (params.get('login_error') === '1') {
      toast.error('Lien expiré ou invalide. La demande n\'est plus active.', { duration: 6000 });
    }
  }, []);

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "", rememberMe: false },
  });

  const rememberMe = watch("rememberMe");

  const onSubmit = async (data: LoginFormData) => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await login(data.email, data.password, data.rememberMe ?? false);

      // Plusieurs espaces disponibles → afficher le sélecteur
      if (result && 'status' in result && result.status === 'SELECT_TENANT') {
        setPendingCredentials({ email: data.email, password: data.password, rememberMe: data.rememberMe ?? false });
        setTenantList(result.tenants);
        return;
      }

      toast.success("Connexion réussie !", { description: "Bienvenue sur Structura" });
    } catch (err: unknown) {
      const errorDetails = getErrorDetails(err);
      console.error("Login error:", errorDetails);

      const userMessage = getUserFriendlyErrorMessage(err);
      setError(userMessage);

      toast.error("Connexion impossible", {
        description: userMessage,
        duration: 5000,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectTenant = async (tenantId: string) => {
    if (!pendingCredentials) return;
    setIsLoading(true);
    setError(null);
    try {
      await login(pendingCredentials.email, pendingCredentials.password, pendingCredentials.rememberMe, tenantId);
      setTenantList([]);
      setPendingCredentials(null);
      toast.success("Connexion réussie !", { description: "Bienvenue sur Structura" });
    } catch (err: unknown) {
      const msg = (err as any)?.message ?? '';
      if (msg === 'EMAIL_NOT_VERIFIED') {
        // Ne pas fermer le dialog — afficher l'erreur inline
        toast.error("Email non vérifié", { description: "Vérifiez votre boîte mail ou renvoyez le lien." });
      } else {
        const userMessage = getUserFriendlyErrorMessage(err);
        setError(userMessage);
        setTenantList([]);
        setPendingCredentials(null);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendVerification = async (tenantId: string, email: string) => {
    setResendingFor(tenantId);
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/resend-verification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, tenantId }),
      });
      toast.success("Email envoyé !", { description: "Vérifiez votre boîte mail." });
    } catch {
      toast.error("Erreur lors de l'envoi");
    } finally {
      setResendingFor(null);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-indigo-50/30 to-violet-50/20 flex items-center justify-center p-4 sm:p-6 lg:p-8 relative overflow-hidden">
      {/* Éléments décoratifs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-gradient-to-br from-indigo-400/20 to-violet-400/20 rounded-full blur-3xl animate-pulse" />
        <div
          className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-gradient-to-tr from-blue-400/20 to-indigo-400/20 rounded-full blur-3xl animate-pulse"
          style={{ animationDelay: "1s" }}
        />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-to-r from-violet-400/10 to-fuchsia-400/10 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-md relative z-10 space-y-6">
        {/* Logo */}
        <div className="text-center animate-in fade-in slide-in-from-top-4 duration-700">
          <Link
            href={ROUTES.HOME}
            className="inline-flex flex-col items-center gap-3 group"
          >
            <img src="/logo.png" alt="Structura" className="h-24 w-auto rounded-2xl shadow-lg transition-transform duration-300 group-hover:scale-105" />
          </Link>
        </div>

        {/* Card principale */}
        <Card className="border-0 shadow-2xl bg-white/90 backdrop-blur-xl animate-in fade-in slide-in-from-bottom-4 duration-700 ring-1 ring-gray-200/50">
          <CardContent className="p-6 sm:p-8">
            <div className="mb-6">
              <h2 className="text-2xl font-extrabold text-gray-900">
                Bon retour !
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                Connectez-vous à votre espace de gestion
              </p>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
              {/* Alerte erreur globale */}
              {error && (
                <Alert
                  variant="destructive"
                  role="alert"
                  className="animate-in fade-in slide-in-from-top-2 duration-300 border-red-200 bg-red-50"
                >
                  <AlertCircle className="h-4 w-4 text-red-600" />
                  <AlertDescription className="text-red-700 font-medium">
                    {error}
                  </AlertDescription>
                </Alert>
              )}

              {/* Champ Email */}
              <div className="space-y-1.5">
                <Label
                  htmlFor="email"
                  className="text-sm font-semibold text-gray-800"
                >
                  Adresse email
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="nom@exemple.com"
                    autoComplete="email"
                    autoFocus
                    disabled={isLoading}
                    className={`h-11 pl-9 transition-all duration-200 bg-white ${
                      errors.email
                        ? "border-red-400 focus:border-red-500 focus:ring-2 focus:ring-red-500/20"
                        : "border-gray-300 hover:border-indigo-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                    }`}
                    aria-invalid={errors.email ? "true" : "false"}
                    aria-describedby={errors.email ? "email-error" : undefined}
                    {...register("email")}
                  />
                </div>
                {errors.email && (
                  <p
                    id="email-error"
                    className="text-xs text-red-600 flex items-center gap-1.5 mt-1"
                    role="alert"
                  >
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    {errors.email.message}
                  </p>
                )}
              </div>

              {/* Champ Mot de passe */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label
                    htmlFor="password"
                    className="text-sm font-semibold text-gray-800"
                  >
                    Mot de passe
                  </Label>
                  <Link
                    href="/forgot-password"
                    className="text-xs font-medium text-indigo-600 hover:text-indigo-700 hover:underline underline-offset-4 transition-colors duration-200"
                    tabIndex={isLoading ? -1 : 0}
                  >
                    Mot de passe oublié ?
                  </Link>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    disabled={isLoading}
                    className={`h-11 pl-9 pr-11 transition-all duration-200 bg-white ${
                      errors.password
                        ? "border-red-400 focus:border-red-500 focus:ring-2 focus:ring-red-500/20"
                        : "border-gray-300 hover:border-indigo-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                    }`}
                    aria-invalid={errors.password ? "true" : "false"}
                    aria-describedby={
                      errors.password ? "password-error" : undefined
                    }
                    {...register("password")}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                    onClick={() => setShowPassword(!showPassword)}
                    disabled={isLoading}
                    aria-label={
                      showPassword
                        ? "Masquer le mot de passe"
                        : "Afficher le mot de passe"
                    }
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4 text-gray-500" />
                    ) : (
                      <Eye className="h-4 w-4 text-gray-500" />
                    )}
                  </Button>
                </div>
                {errors.password && (
                  <p
                    id="password-error"
                    className="text-xs text-red-600 flex items-center gap-1.5 mt-1"
                    role="alert"
                  >
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    {errors.password.message}
                  </p>
                )}
              </div>

              {/* Se souvenir de moi — fonctionnel */}
              <div className="flex items-center gap-2.5">
                <Checkbox
                  id="rememberMe"
                  checked={rememberMe}
                  onCheckedChange={(checked) =>
                    setValue("rememberMe", checked as boolean)
                  }
                  disabled={isLoading}
                  className="data-[state=checked]:bg-indigo-600 data-[state=checked]:border-indigo-600"
                />
                <Label
                  htmlFor="rememberMe"
                  className="text-sm font-normal cursor-pointer text-gray-600 select-none"
                >
                  Se souvenir de moi{" "}
                  <span className="text-xs text-gray-400">
                    (reste connecté 7 jours)
                  </span>
                </Label>
              </div>

              {/* Bouton connexion */}
              <Button
                type="submit"
                className="w-full h-11 bg-gradient-to-r from-indigo-600 via-indigo-700 to-violet-700 hover:from-indigo-700 hover:via-indigo-800 hover:to-violet-800 text-white font-bold text-base shadow-xl hover:shadow-2xl hover:shadow-indigo-500/50 transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98]"
                size="lg"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Connexion en cours...
                  </>
                ) : (
                  <>
                    Se connecter
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </>
                )}
              </Button>

              {/* Séparateur */}
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-200" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-white px-3 text-gray-400 font-medium uppercase tracking-wide">
                    Pas encore de compte ?
                  </span>
                </div>
              </div>

              {/* Bouton inscription */}
              <Button
                type="button"
                variant="outline"
                className="w-full h-11 border-gray-300 hover:border-indigo-400 hover:bg-indigo-50/50 text-gray-700 font-semibold transition-all duration-200 hover:scale-[1.01] active:scale-[0.99]"
                size="lg"
                onClick={() => router.push(ROUTES.REGISTER)}
                disabled={isLoading}
              >
                Créer un compte gratuitement
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="space-y-3 animate-in fade-in duration-1000 px-2">
          {/* Mentions légales */}
          <div className="flex items-start gap-2 bg-white/60 backdrop-blur-sm rounded-xl px-4 py-3 ring-1 ring-gray-200/60">
            <span className="text-gray-300 text-base mt-0.5 shrink-0">🔒</span>
            <p className="text-xs text-gray-400 leading-relaxed">
              En vous connectant, vous acceptez nos{" "}
              <Link
                href="/terms"
                className="text-indigo-500 font-medium hover:text-indigo-600 underline underline-offset-4 decoration-indigo-300 hover:decoration-indigo-500 transition-colors duration-200"
                target="_blank"
              >
                conditions d&apos;utilisation
              </Link>{" "}
              et notre{" "}
              <Link
                href="/privacy"
                className="text-indigo-500 font-medium hover:text-indigo-600 underline underline-offset-4 decoration-indigo-300 hover:decoration-indigo-500 transition-colors duration-200"
                target="_blank"
              >
                politique de confidentialité
              </Link>
              .
            </p>
          </div>

          {/* Retour accueil */}
          <div className="text-center">
            <Link
              href={ROUTES.HOME}
              className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-indigo-600 transition-all duration-200 group bg-white/70 hover:bg-white px-4 py-2 rounded-lg ring-1 ring-gray-200 hover:ring-indigo-300 hover:shadow-sm"
            >
              <span className="transition-transform duration-200 group-hover:-translate-x-1">←</span>
              Retour à l&apos;accueil
            </Link>
          </div>
        </div>
      </div>

      {/* Dialog sélecteur d'espace — affiché quand le même email a plusieurs tenants */}
      <Dialog open={tenantList.length > 0} onOpenChange={() => { setTenantList([]); setPendingCredentials(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Choisissez votre espace</DialogTitle>
            <DialogDescription>
              Votre compte est associé à plusieurs espaces. Sélectionnez celui auquel vous souhaitez accéder.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            {tenantList.map((t) => {
              const verified = t.emailVerified;
              const isResending = resendingFor === t.tenantId;
              return (
                <div key={t.tenantId} className="space-y-1.5">
                  <button
                    onClick={() => verified && handleSelectTenant(t.tenantId)}
                    disabled={isLoading || !verified}
                    className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 text-left transition-all duration-200 ${
                      !verified
                        ? 'border-gray-200 bg-gray-50 opacity-70 cursor-not-allowed'
                        : t.moduleType === 'COMMERCE'
                          ? 'border-orange-200 hover:border-orange-400 bg-orange-50/50 hover:bg-orange-50 hover:shadow-md active:scale-[0.98]'
                          : 'border-blue-200 hover:border-blue-400 bg-blue-50/50 hover:bg-blue-50 hover:shadow-md active:scale-[0.98]'
                    }`}
                  >
                    <div className={`p-2.5 rounded-lg shrink-0 ${!verified ? 'bg-gray-400' : t.moduleType === 'COMMERCE' ? 'bg-orange-500' : 'bg-blue-600'}`}>
                      {t.moduleType === 'COMMERCE'
                        ? <ShoppingCart className="h-5 w-5 text-white" />
                        : <GraduationCap className="h-5 w-5 text-white" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-sm text-gray-900 truncate">{t.tenantName}</p>
                        {!verified && (
                          <span className="text-[10px] font-semibold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full shrink-0">
                            Email non vérifié
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {t.moduleType === 'COMMERCE' ? 'Espace Commerce' : 'Espace École'} · {t.role === 'director' ? 'Fondateur' : t.role}
                      </p>
                    </div>
                    {verified && <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />}
                  </button>
                  {!verified && pendingCredentials && (
                    <button
                      onClick={() => handleResendVerification(t.tenantId, pendingCredentials.email)}
                      disabled={isResending}
                      className="w-full text-xs text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg py-2 px-3 flex items-center justify-center gap-2 transition-colors"
                    >
                      {isResending
                        ? <><Loader2 className="h-3 w-3 animate-spin" /> Envoi en cours...</>
                        : <>Renvoyer le lien de vérification pour cet espace</>}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {isLoading && (
            <div className="flex items-center justify-center py-2">
              <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
