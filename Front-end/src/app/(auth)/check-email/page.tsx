'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Mail, RefreshCw, LogIn, CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

function CheckEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, logout } = useAuth();
  const [isResending, setIsResending] = useState(false);

  // Si l'utilisateur vient de /tarifs avec un plan, on le sauvegarde
  // pour le retrouver après vérification email et rediriger vers billing
  useEffect(() => {
    const plan = searchParams.get('plan');
    if (plan === 'PRO' || plan === 'PRO_PLUS') {
      try {
        localStorage.setItem('structura_pending_plan', plan);
      } catch { /* quota */ }
    }
  }, [searchParams]);
  const [resendSuccess, setResendSuccess] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const handleResend = async () => {
    if (!user?.email || cooldown > 0) return;

    setIsResending(true);
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/auth/resend-verification`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: user.email }),
        }
      );

      await response.json();

      if (response.ok) {
        setResendSuccess(true);
        toast.success('Email envoyé !', {
          description: `Si votre adresse est valide et non vérifiée, un email vous a été envoyé.`,
        });

        // Cooldown de 60 secondes pour éviter le spam
        let remaining = 60;
        setCooldown(remaining);
        const interval = setInterval(() => {
          remaining -= 1;
          setCooldown(remaining);
          if (remaining <= 0) clearInterval(interval);
        }, 1000);
      } else {
        toast.error('Échec du renvoi', {
          description: 'Veuillez réessayer dans quelques instants.',
        });
      }
    } catch {
      toast.error('Erreur de connexion', {
        description: 'Impossible de contacter le serveur. Vérifiez votre connexion.',
      });
    } finally {
      setIsResending(false);
    }
  };

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-indigo-50 p-4">
      <Card className="w-full max-w-md shadow-xl border-0 ring-1 ring-gray-200/50">
        <CardHeader className="text-center pb-2">
          <div className="flex justify-center mb-4">
            <div className="h-20 w-20 rounded-full bg-indigo-100 flex items-center justify-center">
              {resendSuccess ? (
                <CheckCircle2 className="h-10 w-10 text-green-600" />
              ) : (
                <Mail className="h-10 w-10 text-indigo-600" />
              )}
            </div>
          </div>
          <CardTitle className="text-2xl font-bold text-gray-900">
            Vérifiez votre email
          </CardTitle>
          <CardDescription className="text-base mt-2 text-gray-600">
            {user?.email ? (
              <>
                Un email de vérification a été envoyé à{' '}
                <span className="font-semibold text-indigo-600">{user.email}</span>
              </>
            ) : (
              'Un email de vérification a été envoyé à votre adresse.'
            )}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-5 pt-4">
          {/* Instructions */}
          <div className="bg-indigo-50 rounded-lg p-4 space-y-2 text-sm text-gray-700">
            <p className="font-semibold text-indigo-800">Comment procéder :</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>Ouvrez votre boite de réception</li>
              <li>Cherchez un email de <span className="font-medium">Structura</span></li>
              <li>Cliquez sur le bouton <span className="font-medium">"Vérifier mon email"</span></li>
            </ol>
          </div>

          <p className="text-xs text-gray-500 text-center">
            Le lien expire dans 24 heures. Vérifiez aussi votre dossier spam.
          </p>

          {/* Bouton renvoi */}
          <Button
            onClick={handleResend}
            variant="outline"
            className="w-full"
            disabled={isResending || cooldown > 0}
          >
            {isResending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Envoi en cours...
              </>
            ) : cooldown > 0 ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                Renvoyer dans {cooldown}s
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                Renvoyer l&apos;email
              </>
            )}
          </Button>

          {/* Changer de compte */}
          <Button
            onClick={handleLogout}
            variant="ghost"
            className="w-full text-gray-500"
          >
            <LogIn className="mr-2 h-4 w-4" />
            Utiliser un autre compte
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default function CheckEmailPage() {
  return (
    <Suspense>
      <CheckEmailContent />
    </Suspense>
  );
}
