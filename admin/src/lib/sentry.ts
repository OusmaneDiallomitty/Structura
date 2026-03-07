/**
 * Utilitaire Sentry pour le panel admin Next.js
 *
 * ─── Pour activer Sentry ─────────────────────────────────────────────────────
 * 1. Installer : npm install @sentry/nextjs
 * 2. Créer .env.local : NEXT_PUBLIC_SENTRY_DSN=https://votre-dsn@sentry.io/xxx
 * 3. Le reste est automatique.
 *
 * ─── Sans Sentry installé ────────────────────────────────────────────────────
 * Ce fichier fonctionne sans @sentry/nextjs (désactivé silencieusement).
 * Aucun import forcé — fallback console.error.
 */

type SentryLike = {
  captureException: (err: unknown, ctx?: object) => void;
  captureMessage: (msg: string, level?: string) => void;
};

let sentry: SentryLike | null = null;

function getSentry(): SentryLike | null {
  if (sentry !== null) return sentry;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const S = require('@sentry/nextjs');
    const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
    if (!dsn) return null;
    S.init({
      dsn,
      environment: process.env.NODE_ENV ?? 'development',
      tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 0,
    });
    sentry = S;
    return sentry;
  } catch {
    return null;
  }
}

/** Capture une exception et l'envoie à Sentry (ou console.error si désactivé). */
export function captureError(error: unknown, context?: object) {
  const s = getSentry();
  if (s) {
    s.captureException(error, context);
  } else {
    console.error('[Sentry désactivé]', error, context);
  }
}

/** Capture un message informatif. */
export function captureMessage(msg: string) {
  const s = getSentry();
  if (s) s.captureMessage(msg, 'info');
}
