'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Lock, Eye, EyeOff, Loader2, CheckCircle2,
  AlertTriangle, UserCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { acceptInvite } from '@/lib/api/auth.service';
import * as storage from '@/lib/storage';

// ─── Clés de stockage (mêmes que dans AuthContext) ────────────────────────────
const TOKEN_KEY = 'structura_token';
const REFRESH_TOKEN_KEY = 'structura_refresh_token';
const USER_KEY = 'structura_user';

// ─── Contenu principal ────────────────────────────────────────────────────────

function SetupAccountContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const { user, isLoading: authLoading } = useAuth();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState('');

  // ── Rediriger si pas de token dans l'URL ────────────────────────────────────
  useEffect(() => {
    if (!token) {
      router.replace('/login');
    }
  }, [token, router]);

  // ── Soumission du formulaire ─────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!token) {
      setError("Token d'invitation manquant");
      return;
    }

    if (password.length < 8) {
      setError('Le mot de passe doit contenir au moins 8 caractères');
      return;
    }

    if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password)) {
      setError('Le mot de passe doit contenir au moins une majuscule, une minuscule et un chiffre');
      return;
    }

    if (password !== confirmPassword) {
      setError('Les mots de passe ne correspondent pas');
      return;
    }

    setIsLoading(true);

    try {
      const response = await acceptInvite(token, password);

      // Stocker les tokens et l'utilisateur (comme lors d'un login normal)
      storage.setItem(TOKEN_KEY, response.token);
      storage.setItem(REFRESH_TOKEN_KEY, response.refreshToken);
      storage.setItem(USER_KEY, JSON.stringify(response.user));

      setIsSuccess(true);

      // Redirection vers le dashboard après un court délai
      setTimeout(() => {
        window.location.href = '/dashboard';
      }, 2000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue");
    } finally {
      setIsLoading(false);
    }
  };

  // ── Chargement auth ──────────────────────────────────────────────────────────
  if (authLoading || !token) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // ── Utilisateur déjà connecté avec un autre compte ───────────────────────────
  if (user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <AlertTriangle className="h-14 w-14 text-amber-500" />
            </div>
            <CardTitle className="text-xl">Vous êtes déjà connecté(e)</CardTitle>
            <CardDescription className="text-base mt-2">
              Vous êtes actuellement connecté(e) en tant que{' '}
              <strong>{user.firstName} {user.lastName}</strong>.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground text-center">
              Ce lien d&apos;invitation est destiné à un autre compte.
              Déconnectez-vous pour accéder à la page d&apos;activation.
            </p>
            <Button
              variant="outline"
              className="w-full gap-2"
              onClick={() => {
                // Vider le storage manuellement puis recharger la page
                // (évite la race condition logout → router.push)
                storage.removeItem('structura_token');
                storage.removeItem('structura_refresh_token');
                storage.removeItem('structura_user');
                window.location.href = `/setup-account?token=${token}`;
              }}
            >
              Se déconnecter et activer ce compte
            </Button>
            <div className="text-center">
              <Link
                href="/dashboard"
                className="text-sm text-blue-600 hover:text-blue-700 hover:underline"
              >
                Rester connecté sur mon compte
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Succès ───────────────────────────────────────────────────────────────────
  if (isSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <CheckCircle2 className="h-16 w-16 text-emerald-600" />
            </div>
            <CardTitle className="text-2xl">Compte activé !</CardTitle>
            <CardDescription className="text-base mt-2">
              Votre mot de passe a été défini. Vous êtes maintenant connecté(e).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Redirection vers votre tableau de bord…
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Formulaire de configuration ──────────────────────────────────────────────
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-3">
            <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
              <UserCheck className="h-6 w-6 text-blue-600" />
            </div>
          </div>
          <CardTitle className="text-2xl">Configurer votre compte</CardTitle>
          <CardDescription className="text-base mt-1">
            Choisissez un mot de passe pour accéder à Structura
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">

            {/* Mot de passe */}
            <div className="space-y-2">
              <Label htmlFor="password">Mot de passe</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 pr-10"
                  required
                  disabled={isLoading}
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                Minimum 8 caractères, avec majuscule, minuscule et chiffre
              </p>
            </div>

            {/* Confirmer le mot de passe */}
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirmer le mot de passe</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                <Input
                  id="confirmPassword"
                  type={showConfirm ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="pl-10 pr-10"
                  required
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
                  tabIndex={-1}
                >
                  {showConfirm ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            {/* Erreur */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-sm text-red-800">{error}</p>
                {error.toLowerCase().includes('expiré') && (
                  <p className="text-xs text-red-600 mt-1">
                    Demandez au directeur de vous renvoyer une invitation.
                  </p>
                )}
              </div>
            )}

            {/* Bouton soumettre */}
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Activation en cours…
                </>
              ) : (
                'Activer mon compte'
              )}
            </Button>

          </form>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Export (Suspense requis par Next.js pour useSearchParams) ────────────────

export default function SetupAccountPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    }>
      <SetupAccountContent />
    </Suspense>
  );
}
