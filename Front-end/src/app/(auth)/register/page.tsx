"use client";

import { useState, useEffect } from "react";
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
import { ROUTES, APP_NAME, ORGANIZATION_TYPES, COUNTRIES, getCountryData } from "@/lib/constants";
import { Logo } from "@/components/ui/Logo";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import * as storage from "@/lib/storage";
import { getUserFriendlyErrorMessage, getErrorDetails } from "@/lib/error-messages";

export default function RegisterPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Plan pré-sélectionné depuis /tarifs (ex: ?plan=PRO ou ?plan=PRO_PLUS)
  const planFromUrl = searchParams.get("plan");
  const { register: registerFromContext } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Sélection de pays → dérive le placeholder de ville
  const [selectedCountryCode, setSelectedCountryCode] = useState<string>("");
  // Préfixe téléphonique — indépendant du pays de l'école (synchro auto, mais modifiable)
  const [phoneCountryCode, setPhoneCountryCode] = useState<string>("");
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
      organizationType: undefined,
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
  // Préfixe effectif — basé sur le pays du téléphone (indépendant)
  const effectivePhonePrefix = getCountryData(phoneCountryCode)?.phonePrefix ?? "+";

  /** Quand le pays de l'école change : auto-remplit la ville + synchronise le préfixe tél si pas encore défini */
  const handleCountryChange = (value: string) => {
    setValue("country", value, { shouldValidate: true });
    setSelectedCountryCode(value);
    // Synchronise le préfixe téléphonique seulement si l'utilisateur ne l'a pas changé manuellement
    if (!phoneCountryCode) {
      setPhoneCountryCode(value);
    }
    setLocalPhone("");
    setValue("phone", "", { shouldValidate: false });
    // Auto-remplir la ville avec la capitale du pays (modifiable par l'utilisateur)
    const countryInfo = getCountryData(value);
    if (countryInfo?.defaultCity) {
      setValue("city", countryInfo.defaultCity, { shouldValidate: false });
    }
  };

  /** Quand le pays du numéro de téléphone change indépendamment */
  const handlePhoneCountryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newCode = e.target.value;
    setPhoneCountryCode(newCode);
    const prefix = getCountryData(newCode)?.phonePrefix ?? "+";
    setValue("phone", prefix + localPhone, { shouldValidate: localPhone.length > 0 });
  };

  /** Quand les chiffres du téléphone changent : combine préfixe + chiffres */
  const handleLocalPhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Garder uniquement les chiffres, supprimer les zéros en tête
    const digits = e.target.value.replace(/\D/g, "").replace(/^0+/, "");
    setLocalPhone(digits);
    setValue("phone", effectivePhonePrefix + digits, { shouldValidate: digits.length > 0 });
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
        organizationType: data.organizationType,
        country: data.country,
        city: data.city,
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
            Créez votre espace de travail
          </h1>
        </div>

        {/* Forme Card */}
        <Card className="border-0 shadow-2xl bg-white/90 backdrop-blur-xl animate-in fade-in slide-in-from-bottom-4 duration-700 ring-1 ring-gray-200/50">
          <CardContent className="p-5 sm:p-8">
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
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
                            {country.value !== "OTHER" && (
                              <span className="text-xs text-gray-400">{country.phonePrefix}</span>
                            )}
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
                  {activeCountry && activeCountry.value !== "OTHER" && (
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

                  {/* Téléphone avec préfixe pays */}
                  <div className="space-y-2">
                    <Label htmlFor="phone" className="text-sm font-semibold text-gray-800">Numéro de téléphone</Label>
                    <div
                      className={`flex h-10 rounded-md border transition-all duration-200 bg-white overflow-hidden ${
                        errors.phone
                          ? "border-red-400 focus-within:ring-2 focus-within:ring-red-400/20"
                          : "border-gray-300 hover:border-indigo-400 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20"
                      }`}
                    >
                      {/* Sélecteur de préfixe pays (indépendant du pays de l'école) */}
                      <select
                        value={phoneCountryCode}
                        onChange={handlePhoneCountryChange}
                        disabled={isLoading}
                        title="Indicatif pays du téléphone"
                        className="h-full px-2 bg-gray-50 border-r border-gray-200 text-sm font-semibold text-gray-700 shrink-0 outline-none cursor-pointer hover:bg-gray-100 transition-colors"
                      >
                        <option value="" disabled>+</option>
                        {COUNTRIES.map((c) => (
                          <option key={c.value} value={c.value}>
                            {c.phonePrefix} {c.value !== "OTHER" ? `(${c.label})` : ""}
                          </option>
                        ))}
                      </select>
                      {/* Saisie des chiffres */}
                      <input
                        id="phone"
                        type="tel"
                        inputMode="numeric"
                        autoComplete="tel"
                        disabled={isLoading || !phoneCountryCode}
                        placeholder={phoneCountryCode ? "XXXXXXXXX" : "Choisissez l'indicatif →"}
                        value={localPhone}
                        onChange={handleLocalPhoneChange}
                        aria-invalid={errors.phone ? "true" : "false"}
                        aria-describedby={errors.phone ? "phone-error" : undefined}
                        className="flex-1 px-3 bg-transparent outline-none text-sm placeholder:text-gray-400 disabled:cursor-not-allowed"
                      />
                    </div>
                    <p className="text-xs text-gray-400">
                      Indicatif différent de votre pays d'école ? Changez-le ici.
                    </p>
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
                    {errors.password && (
                      <p
                        id="password-error"
                        className="text-sm text-red-600"
                        role="alert"
                      >
                        {errors.password.message}
                      </p>
                    )}
                    {/* Indicateur de force */}
                    {password && password.length > 0 && (
                      <div className="space-y-1">
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
                        <p className="text-xs text-gray-600">
                          Force : {strengthLabels[passwordStrength - 1] || "Aucune"}
                        </p>
                      </div>
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
                <div className="flex items-center gap-2 text-sm font-bold text-indigo-700 uppercase tracking-wide">
                  <div className="h-8 w-8 rounded-lg bg-indigo-100 flex items-center justify-center">
                    <Briefcase className="h-4 w-4 text-indigo-600" />
                  </div>
                  <span>Votre organisation</span>
                </div>

                {/* Nom de l'organisation */}
                <div className="space-y-2">
                  <Label htmlFor="organizationName" className="text-sm font-semibold text-gray-800">
                    Nom de l'organisation
                  </Label>
                  <Input
                    id="organizationName"
                    type="text"
                    placeholder="Ex : École Primaire Al-Nour, Lycée Moderne…"
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

                {/* Type d'organisation */}
                <div className="space-y-2">
                  <Label htmlFor="organizationType" className="text-sm font-semibold text-gray-800">Type d'organisation</Label>
                  <Select
                    onValueChange={(value) =>
                      setValue("organizationType", value as any)
                    }
                    disabled={isLoading}
                  >
                    <SelectTrigger
                      id="organizationType"
                      className="h-10 border-gray-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 bg-white hover:border-indigo-400"
                      aria-invalid={errors.organizationType ? "true" : "false"}
                    >
                      <SelectValue placeholder="Sélectionnez un type" />
                    </SelectTrigger>
                    <SelectContent>
                      {ORGANIZATION_TYPES.map((type) => (
                        <SelectItem
                          key={type.value}
                          value={type.value}
                          disabled={type.comingSoon}
                        >
                          <div className="flex flex-col">
                            <span className="flex items-center gap-2 font-medium">
                              {type.label}
                              {type.comingSoon && (
                                <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium leading-none">
                                  En cours
                                </span>
                              )}
                            </span>
                            <span className="text-xs text-gray-500">{type.description}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.organizationType && (
                    <p
                      id="organizationType-error"
                      className="text-sm text-red-600"
                      role="alert"
                    >
                      {errors.organizationType.message}
                    </p>
                  )}
                </div>

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
                      setValue("acceptTerms", checked as boolean)
                    }
                    disabled={isLoading}
                    className="mt-1"
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
                      setValue("acceptPrivacy", checked as boolean)
                    }
                    disabled={isLoading}
                    className="mt-1"
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
        </Card>
      </div>
    </div>
  );
}
