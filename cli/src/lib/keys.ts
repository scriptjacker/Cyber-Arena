import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateApproverKeyPair, type KeyPairPem } from '@chetna/audit';

/**
 * Approver signing keys.
 *
 * In a real deployment a private key never leaves its holder — it lives in a
 * hardware token or a KMS, and the console only ever receives a signature. For
 * a self-contained offline demo the keys live in a gitignored `keys/` directory
 * so the signing flow can actually be shown end to end.
 *
 * This is the one place where the demo is weaker than the design, so it is
 * stated plainly rather than hidden: see docs/01-ARCHITECTURE.md §1 (Crypto),
 * where HSM/KMS-backed keys are a named roadmap item.
 */
const KEY_DIR = 'keys';

export function keyDir(root = process.cwd()): string {
  return join(root, KEY_DIR);
}

export function loadOrCreateKeyPair(userId: string, root = process.cwd()): KeyPairPem {
  const dir = keyDir(root);
  mkdirSync(dir, { recursive: true });
  const privPath = join(dir, `${userId}.key.pem`);
  const pubPath = join(dir, `${userId}.pub.pem`);

  if (existsSync(privPath) && existsSync(pubPath)) {
    return {
      privateKeyPem: readFileSync(privPath, 'utf8'),
      publicKeyPem: readFileSync(pubPath, 'utf8'),
    };
  }

  const pair = generateApproverKeyPair();
  writeFileSync(privPath, pair.privateKeyPem, { mode: 0o600 });
  writeFileSync(pubPath, pair.publicKeyPem);
  return pair;
}

export function hasKeyPair(userId: string, root = process.cwd()): boolean {
  return existsSync(join(keyDir(root), `${userId}.key.pem`));
}
