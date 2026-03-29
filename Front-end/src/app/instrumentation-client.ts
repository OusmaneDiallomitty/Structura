import * as Sentry from '@sentry/nextjs';

// Active le tracking des navigations (transitions de routes Next.js App Router)
// Requis par @sentry/nextjs pour instrumenter les page views côté client
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
