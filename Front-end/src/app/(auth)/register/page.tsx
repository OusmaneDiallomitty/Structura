"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import {
  Eye,
  EyeOff,
  Loader2,
  Building2,
  User,
  Briefcase,
  ArrowRight,
  Sparkles,
  GraduationCap,
  ShoppingCart,
  Check,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { registerSchema, type RegisterFormData } from "@/lib/validations";
import { ROUTES, APP_NAME, COUNTRIES, getCountryData } from "@/lib/constants";
import { Logo } from "@/components/ui/Logo";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import * as storage from "@/lib/storage";
import { getUserFriendlyErrorMessage, getErrorDetails } from "@/lib/error-messages";

function RegisterContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Plan pré-sélectionné depuis /tarifs (ex: ?plan=PRO ou ?plan=PRO_PLUS)
  const planFromUrl = searchParams.get("plan");
  const { register: registerFromContext } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Ping le backend dès l'ouverture de la page d'inscription pour réveiller
  // Render avant que l'utilisateur clique sur "Commencer" (cold start ~30s)
  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api";
    fetch(`${apiUrl}/health`, { method: "GET", cache: "no-store" }).catch(() => {});
  }, []);

  // Type de module sélectionné — détermine le flux d'inscription
  const [moduleType, setModuleType] = useState<'SCHOOL' | 'COMMERCE' | null>(null);

  const handleModuleTypeSelect = (type: 'SCHOOL' | 'COMMERCE') => {
    setModuleType(type);
    // Pour commerce, pré-remplir organizationType pour passer la validation Zod
    if (type === 'COMMERCE') {
      setValue('organizationType', 'business' as any, { shouldValidate: false });
    } else {
      setValue('organizationType', undefined as any, { shouldValidate: false });
    }
  };

  // Sélection de pays → dérive le placeholder de ville
  const [selectedCountryCode, setSelectedCountryCode] = useState<string>("");
  // Guinée uniquement — préfixe +224 fixe
  const [phoneCountryCode] = useState<string>("GN");
  const [localPhone, setLocalPhone] = useState<string>("");
  const [countryOpen, setCountryOpen] = useState(false);

  // Fermer le sélecteur de pays quand l'utilisateur fait défiler la page
  useEffect(() => {
    if (!countryOpen) return;
    const close = () => setCountryOpen(false);
    window.addEventListener("scroll", close, { passive: true });
    return () => window.removeEventListener("scroll", close);
  }, [countryOpen]);

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      fullName: "",
      email: "",
      phone: "",
      password: "",
      confirmPassword: "",
      organizationName: "",
      organizationType: "school" as any,
      country: "",
      city: "",
      acceptTerms: false,
      acceptPrivacy: false,
    },
  });

  const password = watch("password");
  const acceptTerms = watch("acceptTerms");
  const acceptPrivacy = watch("acceptPrivacy");

  // Données du pays sélectionné (devise, ville par défaut)
  const activeCountry   = getCountryData(selectedCountryCode);
  const cityPlaceholder = activeCountry?.defaultCity ?? "Votre ville";

  /** Quand le pays de l'école change : auto-remplit la ville + synchronise le préfixe tél si pas encore défini */
  const handleCountryChange = (value: string) => {
    setValue("country", value, { shouldValidate: true });
    setSelectedCountryCode(value);
    setLocalPhone("");
    setValue("phone", "", { shouldValidate: false });
    // Auto-remplir la ville avec la capitale du pays (modifiable par l'utilisateur)
    const countryInfo = getCountryData(value);
    if (countryInfo?.defaultCity) {
      setValue("city", countryInfo.defaultCity, { shouldValidate: false });
    }
  };

  /** Quand les chiffres du téléphone changent : combine +224 + 9 chiffres max */
  const handleLocalPhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/\D/g, "").replace(/^0+/, "").slice(0, 9);
    setLocalPhone(digits);
    setValue("phone", "+224" + digits, { shouldValidate: digits.length > 0 });
  };

  // Calcul de la force du mot de passe
  const getPasswordStrength = (pwd: string): number => {
    let strength = 0;
    if (pwd.length >= 8) strength++;
    if (/[A-Z]/.test(pwd)) strength++;
    if (/[a-z]/.test(pwd)) strength++;
    if (/[0-9]/.test(pwd)) strength++;
    if (/[^A-Za-z0-9]/.test(pwd)) strength++;
    return strength;
  };

  const passwordStrength = getPasswordStrength(password || "");
  const strengthColors = ["bg-red-500", "bg-orange-500", "bg-yellow-500", "bg-lime-500", "bg-green-500"];
  const strengthLabels = ["Très faible", "Faible", "Moyen", "Fort", "Très fort"];

  const onSubmit = async (data: RegisterFormData) => {
    setIsLoading(true);
    setError(null);

    try {
      // Préparer les données pour l'API
      const registerPayload = {
        fullName: data.fullName,
        email: data.email,
        phone: data.phone,
        password: data.password,
        organizationName: data.organizationName,
        // Pour commerce : forcer organizationType à 'business'
        organizationType: moduleType === 'COMMERCE' ? 'business' : data.organizationType,
        country: data.country,
        city: data.city,
        moduleType: moduleType ?? 'SCHOOL',
      };

      // Appel à l'API via AuthContext (connexion automatique)
      await registerFromContext(registerPayload);

      // Stocker le type d'organisation pour l'onboarding
      storage.setItem("onboarding_org_type", data.organizationType);
      storage.setItem("onboarding_org_name", data.organizationName);
      storage.setItem("onboarding_country", data.country);

      // Initialiser les préférences régionales selon le pays choisi
      const countryInfo = getCountryData(data.country);
      localStorage.setItem("structura_regional_prefs", JSON.stringify({
        language: "fr",
        currency: countryInfo?.currency ?? "XOF",
      }));

      // Toast de succès
      toast.success("Compte créé avec succès !", {
        description: "Un email de vérification a été envoyé à votre adresse.",
      });

      // Redirection vers la page de vérification email (obligatoire)
      // Si l'utilisateur venait de /tarifs avec un plan, on le transmet pour
      // rediriger vers /dashboard/billing après vérification de l'email
      const checkEmailUrl = planFromUrl
        ? `/check-email?plan=${encodeURIComponent(planFromUrl)}`
        : "/check-email";
      router.push(checkEmailUrl);
    } catch (err: any) {
      // Logger les détails techniques pour le debugging
      const errorDetails = getErrorDetails(err);
      console.error("Registration error:", errorDetails);

      // Afficher un message user-friendly
      const userMessage = getUserFriendlyErrorMessage(err);
      setError(userMessage);

      toast.error("Impossible de créer votre compte", {
        description: userMessage,
        duration: 5000,
      });
    } finally {
      setIsLoading(false);
    }
  };


  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-indigo-50/30 to-violet-50/20 flex items-center justify-center p-4 sm:p-6 lg:p-8 relative overflow-hidden">
      {/* Decorative elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-gradient-to-br from-indigo-400/20 to-violet-400/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-gradient-to-tr from-blue-400/20 to-indigo-400/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-to-r from-violet-400/10 to-fuchsia-400/10 rounded-full blur-3xl"></div>
      </div>

      <div className="w-full max-w-2xl relative z-10">
        {/* Logo et titre */}
        <div className="text-center mb-5 animate-in fade-in slide-in-from-top-4 duration-700">
          <Link
            href={ROUTES.HOME}
            className="inline-flex items-center gap-2 group mb-4 hover:scale-105 transition-transform duration-300"
          >
            <img src="/logo.png" alt="Structura" className="h-16 w-auto rounded-xl shadow-md" />
          </Link>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
            {moduleType === null ? "Quel type d'espace voulez-vous créer ?" : "Créez votre espace de travail"}
          </h1>
          {moduleType !== null && (
            <button
              type="button"
              onClick={() => setModuleType(null)}
              className="mt-2 text-sm text-indigo-600 hover:text-indigo-700 hover:underline underline-offset-4 transition-colors"
            >
              ← Changer de type
            </button>
          )}
        </div>

        {/* ── Étape 0 : choix École / Commerce ─────────────────────────── */}
        {moduleType === null && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* École */}
            <button
              type="button"
              onClick={() => handleModuleTypeSelect('SCHOOL')}
              className="group flex flex-col items-center gap-4 p-8 rounded-2xl border-2 border-blue-200 bg-white/90 hover:border-blue-500 hover:shadow-xl transition-all duration-300 active:scale-95 text-left"
            >
              <div className="h-16 w-16 rounded-2xl bg-blue-600 flex items-center justify-center group-hover:scale-110 transition-transform duration-300 shadow-lg">
                <GraduationCap className="h-8 w-8 text-white" />
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-gray-900">École</p>
                <p className="text-sm text-gray-500 mt-1">
                  Maternelle, Primaire, Secondaire, Lycée
                </p>
                <ul className="mt-3 space-y-1 text-xs text-gray-400 text-left">
                  {["Gestion des élèves & classes", "Présences & notes", "Paiements scolaires", "Bulletins PDF"].map((f) => (
                    <li key={f} className="flex items-center gap-1.5">
                      <Check className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
              <span className="mt-auto w-full py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold text-center group-hover:bg-blue-700 transition-colors">
                Créer un espace École
              </span>
            </button>

            {/* Commerce */}
            <button
              type="button"
              onClick={() => handleModuleTypeSelect('COMMERCE')}
              className="group flex flex-col items-center gap-4 p-8 rounded-2xl border-2 border-orange-200 bg-white/90 hover:border-orange-500 hover:shadow-xl transition-all duration-300 active:scale-95 text-left"
            >
              <div className="h-16 w-16 rounded-2xl bg-orange-500 flex items-center justify-center group-hover:scale-110 transition-transform duration-300 shadow-lg">
                <ShoppingCart className="h-8 w-8 text-white" />
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-gray-900">Commerce</p>
                <p className="text-sm text-gray-500 mt-1">
                  Boutique, Magasin, Pharmacie, Restaurant
                </p>
                <ul className="mt-3 space-y-1 text-xs text-gray-400 text-left">
                  {["Caisse enregistreuse (POS)", "Gestion des stocks", "Clients & fournisseurs", "Tableau de bord ventes"].map((f) => (
                    <li key={f} className="flex items-center gap-1.5">
                      <Check className="h-3.5 w-3.5 text-orange-500 shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
              <span className="mt-auto w-full py-2.5 rounded-xl bg-orange-500 text-white text-sm font-semibold text-center group-hover:bg-orange-600 transition-colors">
                Créer un espace Commerce
              </span>
            </button>
          </div>
        )}

        {/* Forme Card — visible uniquement après sélection du type */}
        {moduleType !== null && <Card className="border-0 shadow-2xl bg-white/90 backdrop-blur-xl animate-in fade-in slide-in-from-bottom-4 duration-700 ring-1 ring-gray-200/50">
          <CardContent className="p-5 sm:p-8">
            <form onSubmit={handleSubmit(onSubmit, (validationErrors) => {
                // Sur mobile : scroller vers la première erreur visible
                const firstErrorKey = Object.keys(validationErrors)[0];
                const el = document.getElementById(firstErrorKey) ?? document.querySelector(`[name="${firstErrorKey}"]`);
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                // Toast pour informer l'utilisateur
                toast.error("Veuillez corriger les erreurs dans le formulaire");
              })} className="space-y-4">
              {/* Message d'erreur */}
              {error && (
                <Alert
                  variant="destructive"
                  role="alert"
                  className="animate-in-300"
                >
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {/* Section 1: Informations personnelles */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm font-bold text-indigo-700 uppercase tracking-wide">
                  <div className="h-8 w-8 rounded-lg bg-indigo-100 flex items-center justify-center">
                    <User className="h-4 w-4 text-indigo-600" />
                  </div>
                  <span>Vos informations</span>
                </div>

                {/* Nom complet */}
                <div className="space-y-2">
                  <Label htmlFor="fullName" className="text-sm font-semibold text-gray-800">Nom complet</Label>
                  <Input
                    id="fullName"
                    type="text"
                    placeholder="Jean Dupont"
                    autoComplete="name"
                    autoFocus
                    disabled={isLoading}
                    className="h-10 border-gray-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all duration-200 bg-white hover:border-indigo-400"
                    aria-invalid={errors.fullName ? "true" : "false"}
                    aria-describedby={errors.fullName ? "fullName-error" : undefined}
                    {...register("fullName")}
                  />
                  {errors.fullName && (
                    <p id="fullName-error" className="text-sm text-red-600" role="alert">
                      {errors.fullName.message}
                    </p>
                  )}
                </div>

                {/* Pays — doit être choisi avant le téléphone (détermine le préfixe) */}
                <div className="space-y-2">
                  <Label htmlFor="country" className="text-sm font-semibold text-gray-800">Pays</Label>
                  <Select
                    open={countryOpen}
                    onOpenChange={setCountryOpen}
                    onValueChange={handleCountryChange}
                    disabled={isLoading}
                  >
                    <SelectTrigger
                      id="country"
                      className="h-10 border-gray-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 bg-white hover:border-indigo-400"
                      aria-invalid={errors.country ? "true" : "false"}
                    >
                      <SelectValue placeholder="Sélectionnez votre pays" />
                    </SelectTrigger>
                    <SelectContent>
                      {COUNTRIES.map((country) => (
                        <SelectItem key={country.value} value={country.value}>
                          <span className="flex items-center gap-2">
                            <span>{country.label}</span>
                            <span className="text-xs text-gray-400">{country.phonePrefix}</span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.country && (
                    <p id="country-error" className="text-sm text-red-600" role="alert">
                      {errors.country.message}
                    </p>
                  )}
                  {activeCountry && (
                    <p className="text-xs text-gray-500">
                      Devise de votre pays :{" "}
                      <span className="font-medium text-indigo-600">{activeCountry.currency}</span>
                    </p>
                  )}
                </div>

                {/* Email et Téléphone */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {/* Email */}
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-sm font-semibold text-gray-800">Adresse email</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="nom@exemple.com"
                      autoComplete="email"
                      disabled={isLoading}
                      className="h-10 border-gray-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all duration-200 bg-white hover:border-indigo-400"
                      aria-invalid={errors.email ? "true" : "false"}
                      aria-describedby={errors.email ? "email-error" : undefined}
                      {...register("email")}
                    />
                    {errors.email && (
                      <p
                        id="email-error"
                        className="text-sm text-red-600"
                        role="alert"
                      >
                        {errors.email.message}
                      </p>
                    )}
                  </div>

                  {/* Téléphone — préfixe +224 fixe (Guinée) */}
                  <div className="space-y-2">
                    <Label htmlFor="phone" className="text-sm font-semibold text-gray-800">Numéro de téléphone</Label>
                    <div
                      className={`flex h-10 rounded-md border transition-all duration-200 bg-white overflow-hidden ${
                        errors.phone
                          ? "border-red-400 focus-within:ring-2 focus-within:ring-red-400/20"
                          : "border-gray-300 hover:border-indigo-400 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20"
                      }`}
                    >
                      {/* Préfixe Guinée — statique */}
                      <span className="h-full px-3 flex items-center bg-gray-50 border-r border-gray-200 text-sm font-semibold text-gray-700 shrink-0 select-none">
                        +224
                      </span>
                      {/* Saisie — 9 chiffres max */}
                      <input
                        id="phone"
                        type="tel"
                        inputMode="numeric"
                        autoComplete="tel"
                        disabled={isLoading}
                        placeholder="6XX XXX XXX"
                        maxLength={9}
                        value={localPhone}
                        onChange={handleLocalPhoneChange}
                        aria-invalid={errors.phone ? "true" : "false"}
                        aria-describedby={errors.phone ? "phone-error" : undefined}
                        className="flex-1 px-3 bg-transparent outline-none text-sm placeholder:text-gray-400 disabled:cursor-not-allowed"
                      />
                    </div>
                    <p className="text-xs text-gray-400">9 chiffres sans le zéro initial (ex : 620 000 000)</p>
                    {errors.phone && (
                      <p
                        id="phone-error"
                        className="text-sm text-red-600"
                        role="alert"
                      >
                        {errors.phone.message}
                      </p>
                    )}
                  </div>
                </div>

                {/* Mot de passe et Confirmation */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {/* Mot de passe */}
                  <div className="space-y-2">
                    <Label htmlFor="password" className="text-sm font-semibold text-gray-800">Mot de passe</Label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        placeholder="••••••••"
                        autoComplete="new-password"
                        disabled={isLoading}
                        className="h-10 pr-10 border-gray-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all duration-200 bg-white hover:border-indigo-400"
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
                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
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
                    {errors.password && !password && (
                      <p
                        id="password-error"
                        className="text-sm text-red-600"
                        role="alert"
                      >
                        {errors.password.message}
                      </p>
                    )}
                    {/* Règles du mot de passe + indicateur de force */}
                    {password && password.length > 0 ? (
                      <div className="space-y-2">
                        {/* Barre de force */}
                        <div className="flex gap-1">
                          {[...Array(5)].map((_, i) => (
                            <div
                              key={i}
                              className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                                i < passwordStrength
                                  ? strengthColors[passwordStrength - 1]
                                  : "bg-gray-200"
                              }`}
                            />
                          ))}
                        </div>
                        <p className="text-xs text-gray-500">
                          Force : <span className={`font-medium ${passwordStrength >= 4 ? "text-green-600" : passwordStrength >= 3 ? "text-yellow-600" : "text-red-500"}`}>{strengthLabels[passwordStrength - 1] || "Aucune"}</span>
                        </p>
                        {/* Checklist des règles */}
                        <ul className="space-y-1">
                          {[
                            { ok: password.length >= 8,           label: "8 caractères minimum" },
                            { ok: /[A-Z]/.test(password),         label: "Une lettre majuscule (A–Z)" },
                            { ok: /[a-z]/.test(password),         label: "Une lettre minuscule (a–z)" },
                            { ok: /[0-9]/.test(password),         label: "Un chiffre (0–9)" },
                            { ok: /[^A-Za-z0-9]/.test(password),  label: "Un caractère spécial (!@#$…)" },
                          ].map(({ ok, label }) => (
                            <li key={label} className={`flex items-center gap-1.5 text-xs transition-colors duration-200 ${ok ? "text-green-600" : "text-gray-400"}`}>
                              {ok ? (
                                <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                              ) : (
                                <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <circle cx="12" cy="12" r="9" />
                                </svg>
                              )}
                              {label}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : (
                      <p className="text-xs text-gray-400">
                        8 car. min · majuscule · minuscule · chiffre · caractère spécial
                      </p>
                    )}
                  </div>

                  {/* Confirmation mot de passe */}
                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword" className="text-sm font-semibold text-gray-800">
                      Confirmer le mot de passe
                    </Label>
                    <div className="relative">
                      <Input
                        id="confirmPassword"
                        type={showConfirmPassword ? "text" : "password"}
                        placeholder="••••••••"
                        autoComplete="new-password"
                        disabled={isLoading}
                        className="h-10 pr-10 border-gray-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all duration-200 bg-white hover:border-indigo-400"
                        aria-invalid={errors.confirmPassword ? "true" : "false"}
                        aria-describedby={
                          errors.confirmPassword
                            ? "confirmPassword-error"
                            : undefined
                        }
                        {...register("confirmPassword")}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                        onClick={() =>
                          setShowConfirmPassword(!showConfirmPassword)
                        }
                        disabled={isLoading}
                        aria-label={
                          showConfirmPassword
                            ? "Masquer le mot de passe"
                            : "Afficher le mot de passe"
                        }
                      >
                        {showConfirmPassword ? (
                          <EyeOff className="h-4 w-4 text-gray-500" />
                        ) : (
                          <Eye className="h-4 w-4 text-gray-500" />
                        )}
                      </Button>
                    </div>
                    {errors.confirmPassword && (
                      <p
                        id="confirmPassword-error"
                        className="text-sm text-red-600"
                        role="alert"
                      >
                        {errors.confirmPassword.message}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <Separator className="bg-gray-200" />

              {/* Section 2: Informations de l'organisation */}
              <div className="space-y-4">
                <div className={`flex items-center gap-2 text-sm font-bold uppercase tracking-wide ${moduleType === 'COMMERCE' ? 'text-orange-700' : 'text-indigo-700'}`}>
                  <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${moduleType === 'COMMERCE' ? 'bg-orange-100' : 'bg-indigo-100'}`}>
                    {moduleType === 'COMMERCE'
                      ? <ShoppingCart className="h-4 w-4 text-orange-600" />
                      : <Briefcase className="h-4 w-4 text-indigo-600" />}
                  </div>
                  <span>{moduleType === 'COMMERCE' ? 'Votre commerce' : 'Votre organisation'}</span>
                </div>

                {/* Nom de l'organisation */}
                <div className="space-y-2">
                  <Label htmlFor="organizationName" className="text-sm font-semibold text-gray-800">
                    {moduleType === 'COMMERCE' ? 'Nom de votre commerce' : "Nom de l'organisation"}
                  </Label>
                  <Input
                    id="organizationName"
                    type="text"
                    placeholder={moduleType === 'COMMERCE' ? "Ex : Boutique Al-Amine, Pharmacie Centrale…" : "Ex : École Primaire Al-Nour, Lycée Moderne…"}
                    disabled={isLoading}
                    className="h-10 border-gray-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all duration-200 bg-white hover:border-indigo-400"
                    aria-invalid={errors.organizationName ? "true" : "false"}
                    aria-describedby={
                      errors.organizationName
                        ? "organizationName-error"
                        : undefined
                    }
                    {...register("organizationName")}
                  />
                  {errors.organizationName && (
                    <p
                      id="organizationName-error"
                      className="text-sm text-red-600"
                      role="alert"
                    >
                      {errors.organizationName.message}
                    </p>
                  )}
                </div>

                {/* Type d'organisation — toujours "school" pour le module École, champ masqué */}

                {/* Ville de l'organisation — auto-remplie selon le pays, modifiable */}
                <div className="space-y-2">
                  <Label htmlFor="city" className="text-sm font-semibold text-gray-800">Ville</Label>
                  <Input
                    id="city"
                    type="text"
                    placeholder={cityPlaceholder || "Ville de votre établissement"}
                    disabled={isLoading}
                    className="h-10 border-gray-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all duration-200 bg-white hover:border-indigo-400"
                    aria-invalid={errors.city ? "true" : "false"}
                    aria-describedby={errors.city ? "city-error" : undefined}
                    {...register("city")}
                  />
                  {errors.city && (
                    <p id="city-error" className="text-sm text-red-600" role="alert">
                      {errors.city.message}
                    </p>
                  )}
                  <p className="text-xs text-gray-400">
                    Pré-remplie selon votre pays — modifiez si votre école est dans une autre ville.
                  </p>
                </div>
              </div>

              <Separator className="bg-gray-200" />

              {/* Section  Acceptation légale */}
              <div className="space-y-4">
                {/* Conditions d'utilisation */}
                <div className="flex items-start space-x-3">
                  <Checkbox
                    id="acceptTerms"
                    checked={acceptTerms}
                    onCheckedChange={(checked) =>
                      setValue("acceptTerms", checked as boolean, { shouldValidate: true })
                    }
                    disabled={isLoading}
                    className="mt-1 h-5 w-5"
                  />
                  <div className="space-y-1">
                    <Label
                      htmlFor="acceptTerms"
                      className="text-sm font-normal cursor-pointer leading-relaxed text-gray-700"
                    >
                      J'accepte les{" "}
                      <Link
                        href="/terms"
                        className="text-indigo-600 font-medium hover:text-indigo-700 underline-offset-4 transition-colors duration-200"
                        target="_blank"
                      >
                        conditions d'utilisation
                      </Link>
                    </Label>
                    {errors.acceptTerms && (
                      <p className="text-sm text-red-600" role="alert">
                        {errors.acceptTerms.message}
                      </p>
                    )}
                  </div>
                </div>

                {/* Politique de confidentialité */}
                <div className="flex items-start space-x-3">
                  <Checkbox
                    id="acceptPrivacy"
                    checked={acceptPrivacy}
                    onCheckedChange={(checked) =>
                      setValue("acceptPrivacy", checked as boolean, { shouldValidate: true })
                    }
                    disabled={isLoading}
                    className="mt-1 h-5 w-5"
                  />
                  <div className="space-y-1">
                    <Label
                      htmlFor="acceptPrivacy"
                      className="text-sm font-normal cursor-pointer leading-relaxed text-gray-700"
                    >
                      J'accepte la{" "}
                      <Link
                        href="/privacy"
                        className="text-indigo-600 font-medium hover:text-indigo-700 underline-offset-4 transition-colors duration-200"
                        target="_blank"
                      >
                        politique de confidentialité
                      </Link>
                    </Label>
                    {errors.acceptPrivacy && (
                      <p className="text-sm text-red-600" role="alert">
                        {errors.acceptPrivacy.message}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Bouton d'inscription */}
              <Button
                type="submit"
                className="w-full h-11 bg-gradient-to-r from-indigo-600 via-indigo-700 to-violet-700 hover:from-indigo-700 hover:via-indigo-800 hover:to-violet-800 text-white font-bold text-base shadow-xl hover:shadow-2xl hover:shadow-indigo-500/50 transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98]"
                size="lg"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Création en cours...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-5 w-5" />
                    Commencer gratuitement
                    <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </Button>

              {/* Lien connexion */}
              <div className="text-center text-sm text-gray-600">
                Déjà un compte ?{" "}
                <Link
                  href={ROUTES.LOGIN}
                  className="text-indigo-600 font-bold hover:text-indigo-700 underline underline-offset-4 decoration-2 hover:decoration-indigo-700 transition-all duration-200"
                >
                  Se connecter
                </Link>
              </div>

            </form>
          </CardContent>
        </Card>}
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterContent />
    </Suspense>
  );
}
