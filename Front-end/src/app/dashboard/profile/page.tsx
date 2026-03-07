"use client";

import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { User, Lock, Mail, Phone, Save, Loader2, Eye, EyeOff, ShieldCheck } from "lucide-react";
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { changePassword } from "@/lib/api/auth.service";
import * as storage from "@/lib/storage";

const TOKEN_KEY = "structura_token";

function getInitials(first?: string, last?: string) {
  return `${first?.charAt(0) ?? ""}${last?.charAt(0) ?? ""}`.toUpperCase();
}

function roleLabel(role?: string) {
  switch (role) {
    case "director":    return "Directeur";
    case "teacher":     return "Professeur";
    case "accountant":  return "Comptable";
    default:            return role ?? "—";
  }
}

export default function ProfilePage() {
  const { user, updateUser } = useAuth();

  // ── Profil ──────────────────────────────────────────────────────────────
  const [profileData, setProfileData] = useState({
    firstName: user?.firstName ?? "",
    lastName:  user?.lastName  ?? "",
    phone:     user?.phone     ?? "",
  });
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  const handleUpdateProfile = async () => {
    const token = storage.getItem(TOKEN_KEY);
    if (!token) { toast.error("Session expirée"); return; }

    setIsSavingProfile(true);
    try {
      await updateUser({
        firstName: profileData.firstName.trim(),
        lastName:  profileData.lastName.trim(),
        phone:     profileData.phone.trim() || undefined,
      });
      toast.success("Profil mis à jour", {
        description: "Vos informations ont été sauvegardées.",
      });
    } catch (error: any) {
      toast.error("Erreur de sauvegarde", {
        description: error.message || "Impossible de mettre à jour le profil.",
      });
    } finally {
      setIsSavingProfile(false);
    }
  };

  // Détecte si le profil a changé (évite une sauvegarde inutile)
  const profileDirty =
    profileData.firstName.trim() !== (user?.firstName ?? "") ||
    profileData.lastName.trim()  !== (user?.lastName  ?? "") ||
    (profileData.phone.trim() || undefined) !== (user?.phone ?? undefined);

  // ── Changement de mot de passe ──────────────────────────────────────────
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
  const [isSavingPassword, setIsSavingPassword]         = useState(false);
  const [showCurrent,  setShowCurrent]  = useState(false);
  const [showNew,      setShowNew]      = useState(false);
  const [showConfirm,  setShowConfirm]  = useState(false);

  const [passwordData, setPasswordData] = useState({
    currentPassword: "",
    newPassword:     "",
    confirmPassword: "",
  });

  const passwordStrength = (pwd: string): { level: number; label: string; color: string } => {
    if (!pwd) return { level: 0, label: "", color: "" };
    let score = 0;
    if (pwd.length >= 8)  score++;
    if (/[A-Z]/.test(pwd)) score++;
    if (/[0-9]/.test(pwd)) score++;
    if (/[^A-Za-z0-9]/.test(pwd)) score++;
    if (score <= 1) return { level: score, label: "Faible",    color: "bg-red-500"    };
    if (score === 2) return { level: score, label: "Moyen",    color: "bg-amber-500"  };
    if (score === 3) return { level: score, label: "Bon",      color: "bg-blue-500"   };
    return              { level: score, label: "Excellent",    color: "bg-emerald-500" };
  };

  const strength = passwordStrength(passwordData.newPassword);
  const passwordsMatch =
    passwordData.newPassword &&
    passwordData.newPassword === passwordData.confirmPassword;

  const handleChangePassword = async () => {
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast.error("Les mots de passe ne correspondent pas");
      return;
    }
    if (passwordData.newPassword.length < 8) {
      toast.error("Le nouveau mot de passe doit contenir au moins 8 caractères");
      return;
    }

    const token = storage.getItem(TOKEN_KEY);
    if (!token) { toast.error("Session expirée"); return; }

    setIsSavingPassword(true);
    try {
      await changePassword(token, passwordData.currentPassword, passwordData.newPassword);
      toast.success("Mot de passe modifié", {
        description: "Votre mot de passe a été mis à jour avec succès.",
      });
      setIsPasswordDialogOpen(false);
      setPasswordData({ currentPassword: "", newPassword: "", confirmPassword: "" });
    } catch (error: any) {
      toast.error("Erreur", {
        description: error.message || "Impossible de changer le mot de passe.",
      });
    } finally {
      setIsSavingPassword(false);
    }
  };

  const closePasswordDialog = () => {
    if (isSavingPassword) return;
    setIsPasswordDialogOpen(false);
    setPasswordData({ currentPassword: "", newPassword: "", confirmPassword: "" });
    setShowCurrent(false); setShowNew(false); setShowConfirm(false);
  };

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 max-w-2xl">

      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Mon Profil</h1>
        <p className="text-muted-foreground mt-1">
          Gérez vos informations personnelles et la sécurité de votre compte.
        </p>
      </div>

      {/* Carte identité */}
      <Card className="border shadow-sm">
        <CardContent className="pt-6 pb-5">
          <div className="flex items-center gap-5">
            <Avatar className="h-16 w-16 shrink-0">
              <AvatarFallback className="bg-primary text-primary-foreground text-xl font-bold">
                {getInitials(user?.firstName, user?.lastName)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="font-bold text-lg truncate">
                {user?.firstName} {user?.lastName}
              </p>
              <div className="flex items-center gap-2 flex-wrap mt-1">
                <Badge variant="secondary" className="text-xs">
                  {roleLabel(user?.role)}
                </Badge>
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Mail className="h-3 w-3" />
                  {user?.email}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Informations personnelles */}
      <Card className="border shadow-sm">
        <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b rounded-t-xl pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <User className="h-4 w-4 text-primary" />
            Informations personnelles
          </CardTitle>
          <CardDescription>
            Prénom, nom et numéro de téléphone
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="firstName">Prénom</Label>
              <Input
                id="firstName"
                value={profileData.firstName}
                onChange={(e) => setProfileData({ ...profileData, firstName: e.target.value })}
                placeholder="Prénom"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lastName">Nom</Label>
              <Input
                id="lastName"
                value={profileData.lastName}
                onChange={(e) => setProfileData({ ...profileData, lastName: e.target.value })}
                placeholder="Nom de famille"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="email"
                type="email"
                value={user?.email ?? ""}
                disabled
                className="pl-9 bg-muted/40 text-muted-foreground cursor-not-allowed"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              L'adresse email ne peut pas être modifiée.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="phone">Téléphone</Label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="phone"
                type="tel"
                value={profileData.phone}
                onChange={(e) => setProfileData({ ...profileData, phone: e.target.value })}
                placeholder="+224 621 000 000"
                className="pl-9"
              />
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button
              onClick={handleUpdateProfile}
              disabled={isSavingProfile || !profileDirty}
              className="gap-2"
            >
              {isSavingProfile ? (
                <><Loader2 className="h-4 w-4 animate-spin" />Enregistrement...</>
              ) : (
                <><Save className="h-4 w-4" />Enregistrer</>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Sécurité */}
      <Card className="border shadow-sm">
        <CardHeader className="bg-gradient-to-r from-amber-50 to-orange-50 border-b rounded-t-xl pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <Lock className="h-4 w-4 text-primary" />
            Sécurité
          </CardTitle>
          <CardDescription>
            Gérez la sécurité de votre compte
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">Mot de passe</p>
              <p className="text-sm text-muted-foreground mt-0.5">
                Utilisez un mot de passe fort et unique.
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => setIsPasswordDialogOpen(true)}
              className="gap-2 shrink-0"
            >
              <Lock className="h-4 w-4" />
              Changer
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Dialog changement de mot de passe */}
      <Dialog open={isPasswordDialogOpen} onOpenChange={closePasswordDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Changer le mot de passe
            </DialogTitle>
            <DialogDescription>
              Entrez votre mot de passe actuel puis choisissez un nouveau.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Mot de passe actuel */}
            <div className="space-y-1.5">
              <Label htmlFor="currentPassword">Mot de passe actuel</Label>
              <div className="relative">
                <Input
                  id="currentPassword"
                  type={showCurrent ? "text" : "password"}
                  value={passwordData.currentPassword}
                  onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
                  placeholder="••••••••"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent(!showCurrent)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Separator />

            {/* Nouveau mot de passe */}
            <div className="space-y-1.5">
              <Label htmlFor="newPassword">Nouveau mot de passe</Label>
              <div className="relative">
                <Input
                  id="newPassword"
                  type={showNew ? "text" : "password"}
                  value={passwordData.newPassword}
                  onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                  placeholder="••••••••"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowNew(!showNew)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>

              {/* Indicateur de force */}
              {passwordData.newPassword && (
                <div className="space-y-1">
                  <div className="flex gap-1 h-1.5">
                    {[1, 2, 3, 4].map((i) => (
                      <div
                        key={i}
                        className={`flex-1 rounded-full transition-colors ${
                          i <= strength.level ? strength.color : "bg-muted"
                        }`}
                      />
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Force : <span className="font-medium">{strength.label}</span>
                    {" · "}Min. 8 caractères, une majuscule, un chiffre
                  </p>
                </div>
              )}
            </div>

            {/* Confirmation */}
            <div className="space-y-1.5">
              <Label htmlFor="confirmPassword">Confirmer le mot de passe</Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirm ? "text" : "password"}
                  value={passwordData.confirmPassword}
                  onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                  placeholder="••••••••"
                  className={`pr-10 ${
                    passwordData.confirmPassword && !passwordsMatch
                      ? "border-red-400 focus-visible:ring-red-400"
                      : ""
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {passwordData.confirmPassword && !passwordsMatch && (
                <p className="text-xs text-red-500">Les mots de passe ne correspondent pas.</p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={closePasswordDialog}
              disabled={isSavingPassword}
            >
              Annuler
            </Button>
            <Button
              onClick={handleChangePassword}
              disabled={
                isSavingPassword ||
                !passwordData.currentPassword ||
                !passwordData.newPassword ||
                !passwordsMatch ||
                strength.level < 2
              }
              className="gap-2"
            >
              {isSavingPassword ? (
                <><Loader2 className="h-4 w-4 animate-spin" />Modification...</>
              ) : (
                "Changer le mot de passe"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
