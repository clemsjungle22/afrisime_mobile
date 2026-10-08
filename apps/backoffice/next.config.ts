import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@afrisime/shared'],
  poweredByHeader: false,
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
