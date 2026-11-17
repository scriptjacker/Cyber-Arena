'use server';

import { redirect } from 'next/navigation';
import { verifyPassword, type Role } from '@chetna/core';
import { auditRepo, prisma } from '@chetna/db';
import { endSession, getSession, startSession } from '../session';

export interface LoginState {
  error?: string;
}

/**
 * Sign in.
 *
 * Deliberate details:
 *   - the same message for an unknown email and a wrong password, so the form
 *     is not a user-enumeration oracle
 *   - the password comparison is constant-time (see core/password.ts)
 *   - a failed attempt is audit-logged with the email but never the password
 */
export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase();
  const password = String(formData.get('password') ?? '');

  if (!email || !password) return { error: 'Enter an email address and a password.' };

  const user = await prisma.staffUser.findFirst({
    where: { email },
    select: { id: true, orgId: true, role: true, passwordHash: true },
  });

  const GENERIC = 'Those credentials were not recognised.';

  if (!user || !verifyPassword(password, user.passwordHash)) {
    if (user) {
      await auditRepo.append({
        orgId: user.orgId,
        actorId: user.id,
        action: 'auth.failed',
        payload: { email },
      });
    }
    return { error: GENERIC };
  }

  await prisma.staffUser.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await auditRepo.append({
    orgId: user.orgId,
    actorId: user.id,
    actorRole: user.role as Role,
    action: 'auth.signed_in',
    payload: { email },
  });
  await startSession(user.id, user.role as Role);
  redirect('/');
}

export async function logout(): Promise<void> {
  const session = await getSession();
  if (session) {
    await auditRepo.append({
      orgId: session.orgId,
      actorId: session.id,
      actorRole: session.role,
      action: 'auth.signed_out',
      payload: {},
    });
  }
  await endSession();
  redirect('/login');
}
