import type { NextConfig } from 'next';

const config: NextConfig = {
  // Packages du monorepo publiés en TypeScript source : Next les compile.
  transpilePackages: ['@afrisime/shared', '@afrisime/fixtures'],
  // API uniquement : pas d'en-tête révélant la technologie.
  poweredByHeader: false,
  // Le pilote PostgreSQL et PGlite restent côté serveur, non bundlés.
  serverExternalPackages: ['pg', '@electric-sql/pglite'],
};

export default config;
