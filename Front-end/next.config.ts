import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";
import { withSentryConfig } from "@sentry/nextjs";

const withPWA = withPWAInit({
  dest: "public",
  register: true,
  disable: process.env.NODE_ENV === "development",
});

const nextConfig: NextConfig = {
  // Turbopack (Next.js 16+) — config vide pour silencer l'erreur de coexistence
  // avec le webpack config ci-dessous (utilisé par certains outils tiers)
  turbopack: {},
  // Webpack — fallbacks Node.js pour ExcelJS côté browser
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        stream: false,
        crypto: false,
        buffer: false,
        zlib: false,
      };
    }
    return config;
  },
  // Headers de sécurité HTTP
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

const sentryConfig = {
  org: 'cashsafe-gn',
  project: 'javascript-nextjs',
  // authToken seulement en CI/CD pour uploader les source maps
  authToken: process.env.SENTRY_AUTH_TOKEN,
  tunnelRoute: '/monitoring',
  silent: !process.env.CI,
  hideSourceMaps: true,
};

export default withSentryConfig(withPWA(nextConfig), sentryConfig);
