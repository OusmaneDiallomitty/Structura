'use client';

import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // En production, envoyer à un service de monitoring (ex: Sentry)
    console.error('[Admin Error]', error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <div className="p-4 bg-red-50 rounded-2xl">
        <AlertTriangle className="w-10 h-10 text-red-500" />
      </div>
      <h2 className="text-lg font-semibold text-gray-900">Une erreur est survenue</h2>
      <p className="text-sm text-gray-500 max-w-sm text-center">{error.message}</p>
      <button
        onClick={reset}
        className="px-5 py-2.5 bg-brand-600 text-white text-sm font-medium rounded-xl
                   hover:bg-brand-700 transition"
      >
        Réessayer
      </button>
    </div>
  );
}
