"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  Save, Building2, Bell, Globe, Loader2,
  Mail, Phone, MapPin, AlertCircle,
  Download, Shield, CheckCircle2,
  Upload, Trash2, ImageIcon, CalendarDays,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { getSchoolInfo, updateSchoolInfo, uploadSchoolLogo, deleteSchoolLogo, type SchoolInfo } from "@/lib/api/auth.service";
import { getStudents } from "@/lib/api/students.service";
import { getPayments } from "@/lib/api/payments.service";
import { exportToCSV } from "@/lib/csv-handler";
import { getFeesConfig, updateFeesConfig, type SchoolDays, migrateSchoolDays } from "@/lib/api/fees.service";
import { useAuth } from "@/contexts/AuthContext";
import { COUNTRIES, getCountryData } from "@/lib/constants";
import * as storage from "@/lib/storage";

const TOKEN_KEY = "structura_token";
const PREFS_KEY = "structura_regional_prefs"; // localStorage uniquement (préférences UI)

// Devises dérivées de COUNTRIES — pas de liste codée en dur, toujours cohérente avec les pays disponibles
const CURRENCY_OPTIONS = Array.from(
  new Map(
    COUNTRIES
      .map((c) => [c.currency, c.currency])
  ).keys()
).map((code) => ({
  code,
  label: ({
    GNF: "Franc Guinéen (GNF)",
    XOF: "Franc CFA Ouest-Africain (XOF)",
    XAF: "Franc CFA Afrique Centrale (XAF)",
    MRU: "Ouguiya Mauritanien (MRU)",
  } as Record<string, string>)[code] ?? code,
}));

interface RegionalPrefs {
  language: string;
  currency: string;
}

function loadRegionalPrefs(): RegionalPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) return JSON.parse(raw) as RegionalPrefs;
  } catch {}
  return { language: "fr", currency: "GNF" };
}

export default function SettingsPage() {
  const { patchUserLocally } = useAuth();

  // ── Infos école (depuis l'API) ──────────────────────────────────────────
  const [isLoading, setIsLoading]   = useState(true);
  const [isSaving,  setIsSaving]    = useState(false);
  const [loadError, setLoadError]   = useState<string | null>(null);

  const [school, setSchool] = useState<SchoolInfo | null>(null);
  const [schoolForm, setSchoolForm] = useState({
    name:               "",
    email:              "",
    phone:              "",
    address:            "",
    city:               "",
    notifMonthlyReport: true,
    notifOverdueAlert:  true,
  });

  // ── Préférences régionales (localStorage) ──────────────────────────────
  const [prefs, setPrefs] = useState<RegionalPrefs>({ language: "fr", currency: "GNF" });

  // ── Logo ────────────────────────────────────────────────────────────────
  const [logoPreview,    setLogoPreview]    = useState<string | null>(null);
  const [logoFile,       setLogoFile]       = useState<File | null>(null);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // ── Jours de cours ──────────────────────────────────────────────────────
  const [schoolDays, setSchoolDays] = useState<SchoolDays>({
    monday: true, tuesday: true, wednesday: true, thursday: true, friday: true, saturday: false,
  });
  const [isSavingSchoolDays, setIsSavingSchoolDays] = useState(false);

  // ── Export données ──────────────────────────────────────────────────────
  const [isExportingStudents, setIsExportingStudents] = useState(false);
  const [isExportingPayments, setIsExportingPayments] = useState(false);
  const [isExportingAll,      setIsExportingAll]      = useState(false);

  const slugDate = () => {
    const d = new Date();
    const ymd = d.toISOString().split("T")[0];
    return `${(schoolForm.name || "ecole").replace(/\s+/g, "-").toLowerCase()}-${ymd}`;
  };

  const METHOD_LABELS: Record<string, string> = {
    cash: "Espèces", mobile_money: "Mobile Money", bank_transfer: "Virement bancaire",
    check: "Chèque", card: "Carte bancaire",
  };
  const STATUS_LABELS: Record<string, string> = {
    paid: "Payé", partial: "Partiel", pending: "En attente", overdue: "En retard",
  };

  const handleExportStudents = async () => {
    const token = storage.getAuthItem(TOKEN_KEY);
    if (!token) { toast.error("Votre session a expiré — veuillez vous reconnecter."); return; }
    setIsExportingStudents(true);
    try {
      const students = await getStudents(token, { limit: 5000 }); // Export complet
      const HEADERS = [
        "Matricule", "Prénom", "Nom", "Classe", "Statut",
        "Date de naissance", "Genre",
        "Parent / Tuteur", "Téléphone parent", "Email parent", "Profession parent",
        "Adresse",
      ];
      exportToCSV({
        filename: `${slugDate()}-eleves`,
        headers: HEADERS,
        data: (Array.isArray(students) ? students : []).map((s: any) => ({
          "Matricule":          s.matricule ?? "",
          "Prénom":             s.firstName ?? "",
          "Nom":                s.lastName ?? "",
          "Classe":             s.class?.name ?? s.classId ?? "",
          "Statut":             s.status ?? "",
          "Date de naissance":  s.dateOfBirth ? new Date(s.dateOfBirth).toLocaleDateString("fr-FR") : "",
          "Genre":              s.gender === "M" ? "Masculin" : s.gender === "F" ? "Féminin" : "",
          "Parent / Tuteur":    s.parentName ?? "",
          "Téléphone parent":   s.parentPhone ?? "",
          "Email parent":       s.parentEmail ?? "",
          "Profession parent":  s.parentProfession ?? "",
          "Adresse":            s.address ?? "",
        })),
      });
    } catch (err: any) {
      toast.error(err.message || "Erreur lors de l'export élèves");
    } finally {
      setIsExportingStudents(false);
    }
  };

  const handleExportPayments = async () => {
    const token = storage.getAuthItem(TOKEN_KEY);
    if (!token) { toast.error("Votre session a expiré — veuillez vous reconnecter."); return; }
    setIsExportingPayments(true);
    try {
      const payments = await getPayments(token, { limit: 5000 }); // Export complet
      const list = Array.isArray(payments) ? payments : (payments as any).data ?? [];
      exportToCSV({
        filename: `${slugDate()}-paiements`,
        headers: [
          "N° Reçu", "Élève", "Montant", "Devise", "Méthode", "Statut",
          "Terme / Mois", "Année scolaire", "Description", "Date de paiement",
        ],
        data: list.map((p: any) => ({
          "N° Reçu":          p.receiptNumber ?? "",
          "Élève":            p.student ? `${p.student.firstName} ${p.student.lastName}` : (p.studentId ?? ""),
          "Montant":          p.amount != null ? String(p.amount) : "",
          "Devise":           p.currency ?? "GNF",
          "Méthode":          METHOD_LABELS[p.method] ?? p.method ?? "",
          "Statut":           STATUS_LABELS[p.status] ?? p.status ?? "",
          "Terme / Mois":     p.term ?? "",
          "Année scolaire":   p.academicYear ?? "",
          "Description":      p.description ?? "",
          "Date de paiement": p.paidDate
            ? new Date(p.paidDate).toLocaleString("fr-FR")
            : p.createdAt ? new Date(p.createdAt).toLocaleString("fr-FR") : "",
        })),
      });
    } catch (err: any) {
      toast.error(err.message || "Erreur lors de l'export paiements");
    } finally {
      setIsExportingPayments(false);
    }
  };

  const handleExportAll = async () => {
    setIsExportingAll(true);
    try {
      await handleExportStudents();
      await handleExportPayments();
    } finally {
      setIsExportingAll(false);
    }
  };

  // ── Chargement initial ─────────────────────────────────────────────────
  const loadSchool = useCallback(async () => {
    // Cherche dans localStorage ET sessionStorage (rememberMe)
    const token = storage.getAuthItem(TOKEN_KEY);
    if (!token) { setIsLoading(false); return; }

    setIsLoading(true);
    setLoadError(null);
    try {
      const [data, feesData] = await Promise.all([
        getSchoolInfo(token),
        getFeesConfig(token).catch(() => null),
      ]);
      setSchool(data);
      setSchoolForm({
        name:               data.name            ?? "",
        email:              data.email           ?? "",
        phone:              data.phone           ?? "",
        address:            data.address         ?? "",
        city:               data.city            ?? "",
        notifMonthlyReport: data.notifMonthlyReport,
        notifOverdueAlert:  data.notifOverdueAlert,
      });

      if (feesData?.schoolDays) {
        setSchoolDays(migrateSchoolDays(feesData.schoolDays));
      }

      // Auto-sélectionner la devise du pays de l'école si aucune préférence sauvegardée
      const savedPrefs = localStorage.getItem(PREFS_KEY);
      if (!savedPrefs && data.country) {
        const countryCurrency = getCountryData(data.country)?.currency;
        if (countryCurrency) {
          setPrefs((prev) => ({ ...prev, currency: countryCurrency }));
        }
      }
    } catch (err: any) {
      if (!navigator.onLine) {
        setLoadError("Paramètres non disponibles hors ligne. Reconnectez-vous pour accéder à cette page.");
      } else {
        setLoadError(err.message || "Impossible de charger les paramètres.");
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSchool();
    setPrefs(loadRegionalPrefs());
  }, [loadSchool]);

  // Détecte les changements non sauvegardés
  const schoolDirty = school && (
    schoolForm.name               !== (school.name    ?? "") ||
    schoolForm.email              !== (school.email   ?? "") ||
    schoolForm.phone              !== (school.phone   ?? "") ||
    schoolForm.address            !== (school.address ?? "") ||
    schoolForm.city               !== (school.city    ?? "") ||
    schoolForm.notifMonthlyReport !== school.notifMonthlyReport ||
    schoolForm.notifOverdueAlert  !== school.notifOverdueAlert
  );

  // ── Sauvegarde ─────────────────────────────────────────────────────────
  const handleSave = async () => {
    const token = storage.getAuthItem(TOKEN_KEY);
    if (!token) { toast.error("Votre session a expiré — veuillez vous reconnecter."); return; }

    setIsSaving(true);
    try {
      const updated = await updateSchoolInfo(token, {
        name:               schoolForm.name.trim()    || undefined,
        email:              schoolForm.email.trim()   || undefined,
        phone:              schoolForm.phone.trim()   || undefined,
        address:            schoolForm.address.trim() || undefined,
        city:               schoolForm.city.trim()    || undefined,
        notifMonthlyReport: schoolForm.notifMonthlyReport,
        notifOverdueAlert:  schoolForm.notifOverdueAlert,
      });

      setSchool(updated);

      // Si le nom de l'école a changé, on met à jour le contexte auth (sidebar, reçus PDF)
      if (updated.name !== school?.name) {
        patchUserLocally({ schoolName: updated.name });
      }

      // Sauvegarder les préférences régionales en localStorage
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));

      toast.success("Paramètres sauvegardés", {
        description: "Les informations de l'école ont été mises à jour.",
      });
    } catch (err: any) {
      toast.error("Erreur de sauvegarde", {
        description: err.message || "Impossible de sauvegarder les paramètres.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  // ── Sauvegarde jours de cours ──────────────────────────────────────────
  const handleSaveSchoolDays = async (updated: SchoolDays) => {
    const token = storage.getAuthItem(TOKEN_KEY);
    if (!token) { toast.error("Votre session a expiré — veuillez vous reconnecter."); return; }
    setIsSavingSchoolDays(true);
    try {
      await updateFeesConfig(token, { schoolDays: updated });
      setSchoolDays(updated);
      toast.success("Jours de cours mis à jour");
    } catch (err: any) {
      toast.error(err.message || "Erreur lors de la sauvegarde des jours de cours");
    } finally {
      setIsSavingSchoolDays(false);
    }
  };

  // ── Handlers logo ──────────────────────────────────────────────────────
  const handleLogoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Seules les images sont acceptées'); return; }
    if (file.size > 2 * 1024 * 1024)    { toast.error('Logo trop lourd (max 2 Mo)');         return; }
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  };

  const handleLogoUpload = async () => {
    if (!logoFile) return;
    const token = storage.getAuthItem(TOKEN_KEY);
    if (!token) { toast.error('Session expirée'); return; }
    setIsUploadingLogo(true);
    try {
      const { logo } = await uploadSchoolLogo(token, logoFile);
      setSchool((s) => s ? { ...s, logo } : s);
      patchUserLocally({ schoolLogo: logo });
      setLogoPreview(null);
      setLogoFile(null);
      if (logoInputRef.current) logoInputRef.current.value = '';
      toast.success('Logo mis à jour avec succès');
    } catch (err: any) {
      toast.error(err.message || 'Erreur lors de l\'upload');
    } finally {
      setIsUploadingLogo(false);
    }
  };

  const handleLogoDelete = async () => {
    const token = storage.getAuthItem(TOKEN_KEY);
    if (!token) { toast.error('Session expirée'); return; }
    setIsUploadingLogo(true);
    try {
      await deleteSchoolLogo(token);
      setSchool((s) => s ? { ...s, logo: null as any } : s);
      patchUserLocally({ schoolLogo: null });
      setLogoPreview(null);
      setLogoFile(null);
      toast.success('Logo supprimé');
    } catch (err: any) {
      toast.error(err.message || 'Erreur lors de la suppression');
    } finally {
      setIsUploadingLogo(false);
    }
  };

  // ── Squelette de chargement ────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="space-y-6 max-w-2xl">
        <div>
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-72" />
        </div>
        {[1, 2, 3].map((i) => (
          <Card key={i} className="border shadow-sm">
            <CardHeader className="border-b pb-4">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-60 mt-1" />
            </CardHeader>
            <CardContent className="pt-5 space-y-4">
              <Skeleton className="h-10 w-full" />
              <div className="grid sm:grid-cols-2 gap-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  // ── Erreur de chargement ───────────────────────────────────────────────
  if (loadError) {
    return (
      <div className="max-w-2xl">
        <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
          <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-red-700">Impossible de charger les paramètres</p>
            <p className="text-sm text-red-600 mt-1">{loadError}</p>
            <Button variant="outline" size="sm" onClick={loadSchool} className="mt-3">
              Réessayer
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Render principal ───────────────────────────────────────────────────
  return (
    <div className="space-y-6 max-w-2xl">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Paramètres</h1>
          <p className="text-muted-foreground mt-1">
            Gérez les informations et préférences de votre établissement.
          </p>
        </div>
        {schoolDirty && (
          <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-1 mt-1 shrink-0">
            Modifications non sauvegardées
          </span>
        )}
      </div>

      {/* ── Logo de l'école ─────────────────────────────────────────────── */}
      <Card className="border shadow-sm">
        <CardHeader className="bg-gradient-to-r from-violet-50 to-purple-50 border-b rounded-t-xl pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <ImageIcon className="h-4 w-4 text-violet-600" />
            Logo de l'établissement
          </CardTitle>
          <CardDescription>
            Apparaît sur les reçus de paiement et les bulletins. JPEG, PNG ou WebP — max 2 Mo.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-5">
          <div className="flex flex-col sm:flex-row items-start gap-5">

            {/* Aperçu */}
            <div className="flex-shrink-0">
              {(logoPreview || school?.logo) ? (
                <img
                  src={logoPreview ?? school?.logo ?? ''}
                  alt="Logo école"
                  className="w-24 h-24 rounded-xl object-contain border border-gray-200 bg-gray-50 p-1"
                />
              ) : (
                <div className="w-24 h-24 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 flex flex-col items-center justify-center gap-1">
                  <ImageIcon className="h-8 w-8 text-gray-300" />
                  <span className="text-xs text-gray-400">Aucun logo</span>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex-1 space-y-3">
              {/* Zone de sélection */}
              <input
                ref={logoInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/svg+xml"
                className="hidden"
                onChange={handleLogoFileChange}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => logoInputRef.current?.click()}
                disabled={isUploadingLogo}
                className="gap-2"
              >
                <Upload className="h-4 w-4" />
                {school?.logo ? 'Changer le logo' : 'Choisir un logo'}
              </Button>

              {/* Nom du fichier sélectionné + bouton confirmer */}
              {logoFile && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 truncate max-w-[180px]">{logoFile.name}</span>
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleLogoUpload}
                    disabled={isUploadingLogo}
                    className="gap-1.5 h-7 text-xs"
                  >
                    {isUploadingLogo ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                    Enregistrer
                  </Button>
                </div>
              )}

              {/* Supprimer le logo actuel */}
              {school?.logo && !logoFile && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleLogoDelete}
                  disabled={isUploadingLogo}
                  className="gap-2 text-red-500 hover:text-red-600 hover:bg-red-50 h-8 px-2"
                >
                  {isUploadingLogo ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                  Supprimer le logo
                </Button>
              )}

              <p className="text-xs text-gray-400">
                Fond transparent recommandé. Ratio 1:1 (carré) idéal.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Informations de l'école ─────────────────────────────────────── */}
      <Card className="border shadow-sm">
        <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b rounded-t-xl pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="h-4 w-4 text-primary" />
            Informations de l'établissement
          </CardTitle>
          <CardDescription>
            Ces informations apparaissent sur les reçus de paiement et documents officiels.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-5">

          <div className="space-y-1.5">
            <Label htmlFor="schoolName">Nom de l'établissement</Label>
            <Input
              id="schoolName"
              value={schoolForm.name}
              onChange={(e) => setSchoolForm({ ...schoolForm, name: e.target.value })}
              placeholder="Ex : École Primaire Al-Nour"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="email">
                <span className="flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5" /> Email de contact
                </span>
              </Label>
              <Input
                id="email"
                type="email"
                value={schoolForm.email}
                onChange={(e) => setSchoolForm({ ...schoolForm, email: e.target.value })}
                placeholder="contact@ecole.gn"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">
                <span className="flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5" /> Téléphone
                </span>
              </Label>
              <Input
                id="phone"
                type="tel"
                value={schoolForm.phone}
                onChange={(e) => setSchoolForm({ ...schoolForm, phone: e.target.value })}
                placeholder="+224 621 000 000"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="city">
                <span className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" /> Ville
                </span>
              </Label>
              <Input
                id="city"
                value={schoolForm.city}
                onChange={(e) => setSchoolForm({ ...schoolForm, city: e.target.value })}
                placeholder="Conakry"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="address">Adresse</Label>
              <Input
                id="address"
                value={schoolForm.address}
                onChange={(e) => setSchoolForm({ ...schoolForm, address: e.target.value })}
                placeholder="Quartier Madina, Rue KA-014"
              />
            </div>
          </div>

        </CardContent>
      </Card>

      {/* ── Paramètres régionaux (localStorage) ─────────────────────────── */}
      <Card className="border shadow-sm">
        <CardHeader className="bg-gradient-to-r from-violet-50 to-purple-50 border-b rounded-t-xl pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <Globe className="h-4 w-4 text-primary" />
            Préférences régionales
          </CardTitle>
          <CardDescription>
            Langue et devise utilisées dans l'interface.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 pt-5">
          <div className="space-y-1.5">
            <Label>Langue</Label>
            <Select
              value={prefs.language}
              onValueChange={(v) => setPrefs({ ...prefs, language: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fr">Français</SelectItem>
                <SelectItem value="en">English</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Devise</Label>
            <Select
              value={prefs.currency}
              onValueChange={(v) => setPrefs({ ...prefs, currency: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCY_OPTIONS.map((opt) => (
                  <SelectItem key={opt.code} value={opt.code}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* Devise recommandée selon le pays de l'établissement */}
            {school?.country && getCountryData(school.country) && (
              <p className="text-xs text-muted-foreground">
                Devise recommandée pour{" "}
                <span className="font-medium">{getCountryData(school.country)!.label}</span>{" "}
                :{" "}
                <button
                  type="button"
                  className="font-semibold text-primary hover:underline underline-offset-4 transition-colors"
                  onClick={() =>
                    setPrefs((p) => ({
                      ...p,
                      currency: getCountryData(school.country)!.currency,
                    }))
                  }
                >
                  {getCountryData(school.country)!.currency}
                </button>{" "}
                <span className="text-gray-400">(cliquez pour appliquer)</span>
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Notifications email ──────────────────────────────────────────── */}
      <Card className="border shadow-sm">
        <CardHeader className="bg-gradient-to-r from-emerald-50 to-teal-50 border-b rounded-t-xl pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <Bell className="h-4 w-4 text-primary" />
            Notifications par email
          </CardTitle>
          <CardDescription>
            Emails envoyés automatiquement au directeur via Resend.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-5 space-y-0">

          {/* Rapport mensuel */}
          <div className="flex items-start justify-between gap-4 py-4">
            <div className="space-y-0.5">
              <p className="font-medium text-sm">Rapport mensuel des paiements</p>
              <p className="text-sm text-muted-foreground">
                Résumé envoyé le 1er de chaque mois : nombre d'élèves à jour,
                montant collecté, élèves en attente.
              </p>
            </div>
            <Switch
              checked={schoolForm.notifMonthlyReport}
              onCheckedChange={(v) => setSchoolForm({ ...schoolForm, notifMonthlyReport: v })}
              className="shrink-0 mt-0.5"
            />
          </div>

          <Separator />

          {/* Alerte retards */}
          <div className="flex items-start justify-between gap-4 py-4">
            <div className="space-y-0.5">
              <p className="font-medium text-sm">Alerte élèves en retard de paiement</p>
              <p className="text-sm text-muted-foreground">
                Email d'alerte quand un élève est marqué <em>En retard</em> (statut overdue)
                depuis plus de 30 jours.
              </p>
            </div>
            <Switch
              checked={schoolForm.notifOverdueAlert}
              onCheckedChange={(v) => setSchoolForm({ ...schoolForm, notifOverdueAlert: v })}
              className="shrink-0 mt-0.5"
            />
          </div>

        </CardContent>
      </Card>

      {/* ── Jours de cours ───────────────────────────────────────────────── */}
      <Card className="border shadow-sm">
        <CardHeader className="bg-gradient-to-r from-amber-50 to-orange-50 border-b rounded-t-xl pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarDays className="h-4 w-4 text-amber-600" />
            Jours de cours
          </CardTitle>
          <CardDescription>
            Cochez les jours où l&apos;école est en session. Dimanche est toujours congé.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-5">
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {([
              { key: 'monday',    label: 'Lun' },
              { key: 'tuesday',   label: 'Mar' },
              { key: 'wednesday', label: 'Mer' },
              { key: 'thursday',  label: 'Jeu' },
              { key: 'friday',    label: 'Ven' },
              { key: 'saturday',  label: 'Sam' },
            ] as { key: keyof SchoolDays; label: string }[]).map(({ key, label }) => {
              const active = schoolDays[key];
              return (
                <button
                  key={key}
                  type="button"
                  disabled={isSavingSchoolDays}
                  onClick={() => handleSaveSchoolDays({ ...schoolDays, [key]: !active })}
                  className={`flex flex-col items-center gap-1 py-3 rounded-xl border-2 transition-colors font-medium text-sm ${
                    active
                      ? 'border-amber-500 bg-amber-50 text-amber-700'
                      : 'border-gray-200 bg-white text-gray-400 hover:bg-gray-50'
                  }`}
                >
                  {label}
                  <span className={`text-xs ${active ? 'text-amber-600' : 'text-gray-300'}`}>
                    {active ? 'Cours' : 'Congé'}
                  </span>
                </button>
              );
            })}
          </div>
          {/* Dimanche — toujours congé */}
          <div className="mt-2 flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 border border-gray-100">
            <span className="text-sm text-gray-400 font-medium">Dim</span>
            <span className="text-xs text-gray-300">— toujours congé</span>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Jours actifs :{' '}
            <span className="font-medium text-gray-700">
              {[
                schoolDays.monday    && 'Lundi',
                schoolDays.tuesday   && 'Mardi',
                schoolDays.wednesday && 'Mercredi',
                schoolDays.thursday  && 'Jeudi',
                schoolDays.friday    && 'Vendredi',
                schoolDays.saturday  && 'Samedi',
              ].filter(Boolean).join(', ') || 'Aucun'}
            </span>
          </p>
        </CardContent>
      </Card>

      {/* ── Vos données ──────────────────────────────────────────────────── */}
      <Card className="border shadow-sm">
        <CardHeader className="bg-gradient-to-r from-slate-50 to-gray-50 border-b rounded-t-xl pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="h-4 w-4 text-primary" />
            Vos données vous appartiennent
          </CardTitle>
          <CardDescription>
            Exportez toutes vos données en un clic. Les fichiers CSV s&apos;ouvrent
            dans Excel, Google Sheets ou LibreOffice.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-5 space-y-4">

          {/* Message rassurant */}
          <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
            <p className="text-sm text-emerald-800 leading-relaxed">
              Même si vous arrêtez d&apos;utiliser Structura, toutes vos données
              restent accessibles et exportables à tout moment. Aucune donnée
              ne peut être perdue ou bloquée.
            </p>
          </div>

          {/* Boutons export */}
          <div className="grid gap-3 sm:grid-cols-3">
            <Button
              variant="outline"
              onClick={handleExportStudents}
              disabled={isExportingStudents || isExportingAll}
              className="gap-2 justify-start"
            >
              {isExportingStudents
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Download className="h-4 w-4" />}
              Élèves (.csv)
            </Button>

            <Button
              variant="outline"
              onClick={handleExportPayments}
              disabled={isExportingPayments || isExportingAll}
              className="gap-2 justify-start"
            >
              {isExportingPayments
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Download className="h-4 w-4" />}
              Paiements (.csv)
            </Button>

            <Button
              variant="outline"
              onClick={handleExportAll}
              disabled={isExportingAll || isExportingStudents || isExportingPayments}
              className="gap-2 justify-start border-primary/40 text-primary hover:bg-primary/5"
            >
              {isExportingAll
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Download className="h-4 w-4" />}
              Tout exporter
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            Conseil : exportez une fois par mois pour conserver une copie locale de vos données.
          </p>

        </CardContent>
      </Card>

      {/* ── Bouton de sauvegarde global ──────────────────────────────────── */}
      <div className="flex justify-end pb-4">
        <Button
          onClick={handleSave}
          disabled={isSaving || (!schoolDirty)}
          size="lg"
          className="gap-2 min-w-[180px]"
        >
          {isSaving ? (
            <><Loader2 className="h-4 w-4 animate-spin" />Sauvegarde...</>
          ) : (
            <><Save className="h-4 w-4" />Enregistrer les modifications</>
          )}
        </Button>
      </div>

    </div>
  );
}
