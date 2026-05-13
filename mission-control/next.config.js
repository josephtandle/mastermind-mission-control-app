const path = require('path');
const repoRoot = path.join(__dirname, '..');

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: false,
  serverExternalPackages: ['better-sqlite3'],
  outputFileTracingRoot: repoRoot,
  turbopack: {
    root: repoRoot,
  },
  // Skip ESLint and type-checking during builds — IDE handles these
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },

  // Phase 5 — standalone app rewrites.
  // Each extracted app runs on its own port. MC proxies these routes transparently
  // so agents and browsers always hit port 3000 — no URL changes needed anywhere.
  async rewrites() {
    return [
      // Stripe Dashboard (port 3010)
      { source: '/app/stripe/:path*', destination: 'http://localhost:3010/stripe/:path*' },

      // SEO Hub (port 3011)
      { source: '/app/seo/:path*', destination: 'http://localhost:3011/seo/:path*' },

      // Masterminds Portal (port 3012) — UI routes + API routes
      { source: '/app/masterminds-hq/:path*', destination: 'http://localhost:3012/masterminds-hq/:path*' },
      { source: '/api/masterminds-hq/:path*', destination: 'http://localhost:3012/api/masterminds-hq/:path*' },
    ];
  },
};

module.exports = nextConfig;
