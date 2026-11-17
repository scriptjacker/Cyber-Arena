import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Approver signing keys, read from the gitignored `keys/` directory.
 *
 * This is the one place where the offline demo is weaker than the design, so it
 * is stated plainly rather than buried: in a real deployment an approver's
 * private key never reaches the server. It lives in a hardware token or a KMS,
 * the browser or the token produces the signature, and the console only ever
 * receives the signature bytes. `AuthorizationGrant` and `Approval` already
 * store nothing but a public key and a signature, so that change touches this
 * file and nothing else.
 *
 * Keeping the keys on disk here is what lets the dual-control flow be
 * demonstrated end to end on a laptop with no hardware.
 */
export function repoRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    if (existsSync(resolve(dir, 'package-lock.json'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

export class MissingKey extends Error {
  constructor(userId: string) {
    super(
      `No signing key found for ${userId}. Run \`npm run chetna -- keys init\` to generate the demo key material.`,
    );
    this.name = 'MissingKey';
  }
}

export interface ApproverKeys {
  privateKeyPem: string;
  publicKeyPem: string;
}

export function loadApproverKeys(userId: string): ApproverKeys {
  const dir = resolve(repoRoot(), 'keys');
  const priv = resolve(dir, `${userId}.key.pem`);
  const pub = resolve(dir, `${userId}.pub.pem`);
  if (!existsSync(priv) || !existsSync(pub)) throw new MissingKey(userId);
  return {
    privateKeyPem: readFileSync(priv, 'utf8'),
    publicKeyPem: readFileSync(pub, 'utf8'),
  };
}
