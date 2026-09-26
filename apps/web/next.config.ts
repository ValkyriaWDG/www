import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';
import { STATIC_SECURITY_HEADERS } from './src/lib/security-headers';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  output: 'standalone',
  // Separate build directories let parallel local checks avoid clobbering each other.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  poweredByHeader: false,
  // The repository's AGENTS.md/CLAUDE.md govern agents; do not generate app-level copies.
  agentRules: false,
  reactStrictMode: true,
  // Workspace package with TypeScript sources.
  transpilePackages: ['@valkyria/db'],
  // Native/server-only libraries stay external to the server bundle.
  serverExternalPackages: ['sharp', 'pg'],
  images: {
    // Editorial media is delivered by the publication-aware /api/media route, not the optimizer.
    unoptimized: true,
  },
  async headers() {
    return [{ source: '/:path*', headers: [...STATIC_SECURITY_HEADERS] }];
  },
};

export default withNextIntl(nextConfig);
