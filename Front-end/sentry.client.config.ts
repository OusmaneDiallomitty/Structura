import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV ?? 'development',
  release: process.env.NEXT_PUBLIC_APP_VERSION ?? 'structura@1.0.0',
  // 10% des transactions en production — suffisant pour détecter les problèmes
  tracesSampleRate: 0.1,

  // Replay des sessions — 1% en prod, 100% sur erreur
  replaysSessionSampleRate: process.env.NODE_ENV === 'production' ? 0.01 : 0,
  replaysOnErrorSampleRate: 1.0,

  integrations: [
    Sentry.replayIntegration({
      // Masquer les inputs sensibles (mots de passe, etc.)
      maskAllInputs: true,
      blockAllMedia: false,
    }),
  ],

  // Ne pas reporter les erreurs réseau bénignes
  ignoreErrors: [
    'ResizeObserver loop limit exceeded',
    'Network request failed',
    /^401$/,
    /^403$/,
  ],
});
