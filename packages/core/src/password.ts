import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

/**
 * Password hashing with scrypt from Node's own crypto.
 *
 * argon2id would be the textbook choice, but every Node argon2 binding needs a
 * native build, which on a Windows machine with no toolchain is a thirty-minute
 * detour at hour two of a hackathon. scrypt is memory-hard, is in the standard
 * library, needs no compiler, and is a perfectly defensible choice — the
 * parameters below exceed the commonly cited interactive-login baseline.
 *
 * Swapping to argon2id later changes only this file: the stored format is
 * self-describing and `verifyPassword` dispatches on the algorithm prefix.
 */
const N = 16384; // CPU/memory cost
const r = 8; // block size
const p = 1; // parallelisation
const KEY_LEN = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const key = scryptSync(password.normalize('NFKC'), salt, KEY_LEN, { N, r, p });
  return ['scrypt', N, r, p, salt.toString('base64'), key.toString('base64')].join('$');
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [algo, nStr, rStr, pStr, saltB64, keyB64] = stored.split('$');
    if (algo !== 'scrypt') return false;
    const salt = Buffer.from(saltB64, 'base64');
    const expected = Buffer.from(keyB64, 'base64');
    const actual = scryptSync(password.normalize('NFKC'), salt, expected.length, {
      N: Number(nStr),
      r: Number(rStr),
      p: Number(pStr),
    });
    // Constant-time comparison: a timing oracle on a login endpoint is a real
    // finding, and this is the one line that prevents it.
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
