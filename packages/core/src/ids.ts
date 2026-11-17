import { randomBytes, randomUUID } from 'node:crypto';
import { BRAND } from './brand';
import { sha256Hex } from './canonical';

/**
 * 128 bits of randomness, base64url, 22 characters.
 *
 * This is the ONLY identifier that ever appears in a simulation URL. It carries
 * no email, no name, no department and no org — so nothing leaks through
 * referrers, proxy logs, browser history or someone reading over a shoulder.
 * Enforced by safety-lint rule SL010 and attacked by tests/abuse A21.
 */
export function newToken(): string {
  return randomBytes(16).toString('base64url');
}

const TOKEN_RE = /^[A-Za-z0-9_-]{22}$/;
export function isValidToken(value: string): boolean {
  return TOKEN_RE.test(value);
}

/** Opaque public participant id. Never derived from the email address. */
export function newPid(): string {
  return `p_${randomBytes(9).toString('base64url')}`;
}

export function newId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
}

/** Per-template watermark, embedded invisibly and required by SL006. */
export function newWatermarkId(): string {
  return `${BRAND.watermarkPrefix}-${randomBytes(6).toString('hex')}`;
}

/**
 * Binds a roster to a signature. Order-independent over participant ids, and
 * tied to the specific import, so adding one person after approval changes the
 * hash and trips policy gate G1_SCOPE_DRIFT.
 */
export function hashRoster(pids: readonly string[], rosterImportId: string): string {
  const sorted = [...pids].sort();
  return sha256Hex(`${rosterImportId}\u0000${sorted.length}\u0000${sorted.join('\n')}`);
}

/** Normalises an email's domain part for domain-allowlist comparisons. */
export function domainOf(email: string): string {
  const at = email.lastIndexOf('@');
  if (at < 0) return '';
  return email.slice(at + 1).trim().toLowerCase();
}
