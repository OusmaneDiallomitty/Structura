/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === 'production';

const nextConfig = {

  // ── Fix cache webpack ──────────────────────────────────────────────────────
  // Désactive le cache filesystem en dev pour éviter les erreurs
  // "Cannot find module ./590.js" et les styles qui disparaissent au refresh.
  // Cause : npm run build et npm run dev utilisent des formats de cache
  // incompatibles. Sans ce fix, le serveur retourne 500 sur le CSS → styles perdus.
  webpack: (config, { dev }) => {
    if (dev) {
      config.cache = false;
    }
    return config;
  },

  // ── Headers de sécurité (production uniquement) ────────────────────────────
  ...(isProd && {
    async headers() {
      const csp = [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "connect-src 'self' https:",
        "font-src 'self'",
        "frame-ancestors 'none'",
      ].join('; ');

      return [
        {
          source: '/(.*)',
          headers: [
            { key: 'X-Frame-Options',        value: 'DENY' },
            { key: 'X-Content-Type-Options',  value: 'nosniff' },
            { key: 'X-XSS-Protection',        value: '1; mode=block' },
            { key: 'Referrer-Policy',         value: 'strict-origin-when-cross-origin' },
            { key: 'Permissions-Policy',      value: 'camera=(), microphone=(), geolocation=()' },
            { key: 'Content-Security-Policy', value: csp },
          ],
        },
      ];
    },
  }),
};

export default nextConfig;
