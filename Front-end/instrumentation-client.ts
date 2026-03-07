import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV ?? 'development',
  release: process.env.NEXT_PUBLIC_APP_VERSION ?? 'structura@1.0.0',
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 0,

  replaysSessionSampleRate: process.env.NODE_ENV === 'production' ? 0.01 : 0,
  replaysOnErrorSampleRate: 1.0,

  integrations: [
    Sentry.replayIntegration({
      maskAllInputs: true,
      blockAllMedia: false,
    }),
  ],

  ignoreErrors: [
    'ResizeObserver loop limit exceeded',
    'Network request failed',
    /^401$/,
    /^403$/,
  ],
});
