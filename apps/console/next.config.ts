import { loadRootEnv } from './load-root-env';
import type { NextConfig } from 'next';

/**
 * THE ADMIN CONSOLE — port 4000.
 *
 * Holds every authenticated route. Kept on a different origin from the
 * simulation surface, so no session cookie or CSRF token is reachable from the
 * pages a phishing link opens.
 */
// Must run before anything reads process.env — notably the Prisma client,
// which resolves DATABASE_URL at construction time.
loadRootEnv();

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ["@chetna/core","@chetna/db","@chetna/policy","@chetna/audit","@chetna/safety-lint","@chetna/ethics","@chetna/phishscale","@chetna/scoring","@chetna/privacy","@chetna/content"],
  serverExternalPackages: ['@prisma/client', '.prisma/client'],
  // NOTE: Content-Security-Policy is set in middleware.ts with a per-request
  // nonce. It must NOT also be set here — two CSP headers are intersected by
  // the browser, which would strip the nonce and break hydration.
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
