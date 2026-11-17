import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { heading, info, kv, ok, warn } from '../lib/out';
import { keyDir, loadOrCreateKeyPair } from '../lib/keys';

const STAFF = ['usr_owner', 'usr_security', 'usr_hr', 'usr_analyst', 'usr_auditor', 'platform'];

/**
 * Generate the signing keys and session secrets a fresh checkout needs.
 *
 * Idempotent: existing keys are left alone, so running it twice never
 * invalidates a signature that is already recorded against a grant.
 */
export function keysInit(root = process.cwd()): void {
  heading('Key material');

  for (const id of STAFF) {
    const existed = existsSync(join(keyDir(root), `${id}.key.pem`));
    loadOrCreateKeyPair(id, root);
    kv(id, existed ? 'already present (left untouched)' : 'generated');
  }

  const envPath = join(root, '.env');
  if (!existsSync(envPath)) {
    const example = join(root, '.env.example');
    if (existsSync(example)) {
      writeFileSync(envPath, readFileSync(example, 'utf8'));
      info('.env created from .env.example');
    } else {
      warn('.env.example not found; create .env manually');
      return;
    }
  }

  let env = readFileSync(envPath, 'utf8');
  let changed = false;
  for (const key of ['SESSION_SECRET', 'TOKEN_HMAC_KEY']) {
    const re = new RegExp(`^${key}=.*$`, 'm');
    const current = re.exec(env)?.[0] ?? '';
    const value = current.split('=')[1]?.trim() ?? '';
    const isPlaceholder = value === '' || value.startsWith('dev-only');
    if (isPlaceholder) {
      const secret = randomBytes(32).toString('base64url');
      env = re.test(env) ? env.replace(re, `${key}=${secret}`) : `${env}\n${key}=${secret}\n`;
      changed = true;
      kv(key, 'generated');
    } else {
      kv(key, 'already set (left untouched)');
    }
  }
  if (changed) writeFileSync(envPath, env);

  ok(`keys are in ${keyDir(root)} — this directory is gitignored and must never be committed`);
  info(
    'In production, approver private keys live in a hardware token or a KMS and never reach the server. The local keys exist so the signing flow can be demonstrated offline.',
  );
}
