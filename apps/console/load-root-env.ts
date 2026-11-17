import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Load the repository-root `.env` into this process.
 *
 * Next loads `.env` from the APP directory, but this monorepo keeps a single
 * root `.env` so the CLI, the worker, the mail sink and both apps cannot drift
 * apart on DATABASE_URL, SMTP_HOST or SIM_URL. Duplicating the file per app is
 * how a demo ends up sending links that point at the wrong origin.
 *
 * Real environment variables always win, so a container or CI can still
 * override anything without editing a file.
 */
export function loadRootEnv(): string | null {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    const candidate = resolve(dir, '.env');
    if (existsSync(candidate) && existsSync(resolve(dir, 'package-lock.json'))) {
      apply(candidate);
      absolutiseSqlitePath(dir);
      return candidate;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/**
 * Turn a relative SQLite `file:` URL into an absolute one.
 *
 * Prisma's CLI resolves a relative `file:` path against the SCHEMA directory.
 * The Prisma Client normally does the same — but once a bundler has inlined the
 * client into `.next/server/chunks/`, that anchor is lost and the path resolves
 * against the chunk directory instead, producing "Error code 14: Unable to open
 * the database file".
 *
 * Resolving against the schema directory here keeps a single portable value in
 * `.env` that means exactly the same file to the CLI, the worker, the mail sink
 * and both apps.
 */
function absolutiseSqlitePath(repoRoot: string): void {
  const url = process.env.DATABASE_URL;
  if (!url?.startsWith('file:')) return;
  const raw = url.slice('file:'.length);
  if (/^[/\\]/.test(raw) || /^[A-Za-z]:/.test(raw)) return; // already absolute
  const schemaDir = resolve(repoRoot, 'packages/db/prisma');
  process.env.DATABASE_URL = `file:${resolve(schemaDir, raw)}`;
}

function apply(path: string): void {
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    const key = match[1];
    if (process.env[key] !== undefined) continue;
    process.env[key] = match[2].trim().replace(/^["']|["']$/g, '');
  }
}
