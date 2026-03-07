'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gray-50 p-8 text-center">
        <h2 className="text-2xl font-bold text-gray-800">Une erreur inattendue s&apos;est produite</h2>
        <p className="max-w-md text-gray-500">
          Notre équipe a été notifiée automatiquement. Veuillez réessayer.
        </p>
        <button
          onClick={reset}
          className="rounded-md bg-blue-600 px-6 py-2 text-white hover:bg-blue-700 transition-colors"
        >
          Réessayer
        </button>
      </body>
    </html>
  );
}
