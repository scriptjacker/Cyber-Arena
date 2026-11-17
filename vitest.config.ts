import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const pkg = (name: string) =>
  fileURLToPath(new URL(`./packages/${name}/src/index.ts`, import.meta.url));
const svc = (name: string) =>
  fileURLToPath(new URL(`./services/${name}/src/index.ts`, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@chetna/core': pkg('core'),
      '@chetna/audit': pkg('audit'),
      '@chetna/policy': pkg('policy'),
      '@chetna/safety-lint': pkg('safety-lint'),
      '@chetna/ethics': pkg('ethics'),
      '@chetna/phishscale': pkg('phishscale'),
      '@chetna/scoring': pkg('scoring'),
      '@chetna/privacy': pkg('privacy'),
      '@chetna/ai': pkg('ai'),
      '@chetna/db': pkg('db'),
      '@chetna/content': fileURLToPath(new URL('./content/index.ts', import.meta.url)),
      '@chetna/mailsink': svc('mailsink'),
      '@chetna/worker': svc('worker'),
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    reporters: ['default'],
    globals: false,
  },
});
