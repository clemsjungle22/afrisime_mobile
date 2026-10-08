import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@afrisime/shared'],
  poweredByHeader: false,
  // Développement : sans cela, ouvert par 127.0.0.1 ou l'adresse Wi-Fi du PC (au lieu de localhost),
  // la page s'affiche mais ses scripts sont bloqués et aucun bouton ne réagit.
  allowedDevOrigins: ['127.0.0.1', '192.168.*.*', '10.*.*.*', '172.*.*.*'],
  experimental: {
    // Photos du catalogue : 5 Mo maximum, plus l'enveloppe du formulaire multipart.
    serverActions: { bodySizeLimit: '6mb' },
  },
  // Back-office interne : jamais indexé, jamais affiché dans un cadre d'un autre site.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'same-origin' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
        ],
      },
    ];
  },
};

export default nextConfig;
