import { PrismaClient } from '../generated/client/index';

/**
 * One Prisma client for the process.
 *
 * SQLite is a single-writer database, which for this workload is a feature
 * rather than a limitation: the send worker claims rows one at a time and the
 * audit chain must be appended serially anyway. The Postgres migration is a
 * datasource change (docs/01-ARCHITECTURE.md §12).
 */
const globalForPrisma = globalThis as unknown as { chetnaPrisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.chetnaPrisma ??
  new PrismaClient({
    log: process.env.CHETNA_SQL_LOG === '1' ? ['query', 'warn', 'error'] : ['warn', 'error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.chetnaPrisma = prisma;

export type Db = PrismaClient;

export async function disconnect(): Promise<void> {
  await prisma.$disconnect();
}

/** Runtime configuration, read once and validated. */
export function runtimeConfig() {
  const mode = process.env.CHETNA_MODE === 'live' ? 'live' : 'offline';
  return {
    mode,
    smtpHost: process.env.SMTP_HOST ?? '127.0.0.1',
    smtpPort: Number(process.env.SMTP_PORT ?? 1025),
    consoleUrl: process.env.CONSOLE_URL ?? 'http://localhost:3000',
    simUrl: process.env.SIM_URL ?? 'http://localhost:3001',
    kAnon: Number(process.env.KANON_K ?? 5),
    cooldownDays: Number(process.env.COOLDOWN_DAYS ?? 30),
    newJoinerGraceDays: Number(process.env.NEW_JOINER_GRACE_DAYS ?? 30),
  } as const;
}
