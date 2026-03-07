import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Headers de sécurité HTTP — identiques au frontend SaaS
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options',  value: 'nosniff' },
          { key: 'X-Frame-Options',          value: 'DENY' },
          { key: 'X-XSS-Protection',         value: '1; mode=block' },
          { key: 'Referrer-Policy',           value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy',        value: 'camera=(), microphone=(), geolocation=()' },
          // Bloquer les moteurs de recherche — le panel admin ne doit pas être indexé
          { key: 'X-Robots-Tag',             value: 'noindex, nofollow' },
        ],
      },
    ];
  },
};

export default nextConfig;
