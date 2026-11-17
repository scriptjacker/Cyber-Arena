import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { Role, type Role as RoleType } from '@chetna/core';
import { prisma } from '@chetna/db';
import { can, type Capability } from './rbac';

/**
 * Session handling.
 *
 * A signed, httpOnly cookie carrying nothing but a user id, a role and an
 * expiry. No session state in the database, no third-party auth library, and
 * nothing in the cookie that is useful to an attacker who steals it after it
 * expires.
 *
 * SSO is a documented roadmap item rather than a pretence: OIDC/SAML plugs in
 * behind `getSession()` without any caller changing, because every consumer in
 * this app goes through the guards below.
 */

const COOKIE = 'chetna_session';
const TTL_MS = 8 * 60 * 60 * 1000;

interface Payload {
  userId: string;
  role: RoleType;
  exp: number;
}

function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (!value || value.startsWith('dev-only')) {
    // Loud rather than silent: a predictable signing key means forgeable
    // sessions, and this is exactly the warning that gets ignored when it is
    // written only in a README.
    console.warn(
      '[chetna] SESSION_SECRET is unset or still the placeholder. Run `npm run chetna -- keys init`.',
    );
  }
  return value ?? 'insecure-development-secret';
}

function sign(body: string): string {
  return createHmac('sha256', secret()).update(body).digest('base64url');
}

function serialise(payload: Payload): string {
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${body}.${sign(body)}`;
}

function deserialise(token: string | undefined): Payload | null {
  if (!token) return null;
  const [body, mac] = token.split('.');
  if (!body || !mac) return null;

  const expected = Buffer.from(sign(body), 'utf8');
  const actual = Buffer.from(mac, 'utf8');
  // Constant-time compare: a timing oracle on session verification is a real
  // finding, not a theoretical one.
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Payload;
    if (typeof payload.exp !== 'number' || payload.exp < Date.now()) return null;
    if (!Object.values(Role).includes(payload.role)) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function startSession(userId: string, role: RoleType): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE, serialise({ userId, role, exp: Date.now() + TTL_MS }), {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: Math.floor(TTL_MS / 1000),
  });
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export interface SessionUser {
  id: string;
  email: string;
  displayName: string;
  role: RoleType;
  orgId: string;
}

export async function getSession(): Promise<SessionUser | null> {
  const jar = await cookies();
  const payload = deserialise(jar.get(COOKIE)?.value);
  if (!payload) return null;

  const user = await prisma.staffUser.findUnique({
    where: { id: payload.userId },
    select: { id: true, email: true, displayName: true, role: true, orgId: true },
  });
  if (!user) return null;

  // The role is re-read from the database on every request, so revoking
  // someone's access takes effect immediately rather than when their cookie
  // happens to expire.
  return { ...user, role: user.role as RoleType };
}

export async function requireSession(): Promise<SessionUser> {
  const user = await getSession();
  if (!user) redirect('/login');
  return user;
}

// ---------------------------------------------------------------------------
// RBAC
// ---------------------------------------------------------------------------

/**
 * The capability matrix lives in `./rbac`, which imports nothing from Next and
 * touches no database — so the separations are unit-testable without a running
 * server. `tests/abuse/rbac.test.ts` asserts each one.
 */
export {
  CAPABILITIES,
  can,
  ROLE_LABEL,
  WRITE_CAPABILITIES,
  type Capability,
} from './rbac';

export class Forbidden extends Error {
  constructor(public readonly capability: Capability) {
    super(`This role may not perform "${capability}".`);
    this.name = 'Forbidden';
  }
}

/**
 * The single guard every server action and page goes through. One function, so
 * an authorisation bug is a bug in one place rather than forty.
 */
export async function requireCapability(capability: Capability): Promise<SessionUser> {
  const user = await requireSession();
  if (!can(user.role, capability)) throw new Forbidden(capability);
  return user;
}


/**
 * Capability guard for PAGES.
 *
 * Pages redirect to an explanation rather than throwing, because a refusal
 * rendered as a 500 looks like a broken product instead of a working control —
 * and these separations are something we want people to see working.
 *
 * Server actions keep using `requireCapability`, which throws: an action that
 * is not permitted must fail closed and return nothing at all.
 */
export async function pageCapability(capability: Capability): Promise<SessionUser> {
  const user = await requireSession();
  if (!can(user.role, capability)) {
    redirect(`/denied?c=${encodeURIComponent(capability)}`);
  }
  return user;
}
