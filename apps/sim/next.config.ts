import { loadRootEnv } from './load-root-env';
import type { NextConfig } from 'next';

/**
 * THE SIMULATION SURFACE — port 4001.
 *
 * This app is a SEPARATE ORIGIN from the console, and that is a security
 * decision rather than a stylistic one. It holds no admin route, sets no
 * session cookie, and its Content-Security-Policy sets form-action to 'none'
 * so there is nowhere for a value to be submitted even if a field existed.
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
