'use server';

import { revalidatePath } from 'next/cache';
import type { ChainVerification, DsarKind } from '@chetna/core';
import { auditRepo, retentionRepo } from '@chetna/db';
import { requireCapability } from '../session';

export async function verifyAuditChain(): Promise<ChainVerification> {
  await requireCapability('governance:read');
  return auditRepo.verify();
}

export async function runRetentionPurge(
  apply: boolean,
): Promise<{ ok: boolean; lines?: retentionRepo.PurgeLine[]; error?: string }> {
  const user = await requireCapability('retention:run');
  const lines = await retentionRepo.executePurge({
    orgId: user.orgId,
    apply,
    actorId: user.id,
    actorRole: user.role,
  });
  revalidatePath('/governance');
  return { ok: true, lines };
}

export async function runDsar(
  pid: string,
  kind: string,
): Promise<{ ok: boolean; result?: retentionRepo.DsarOutcome; error?: string }> {
  const user = await requireCapability('dsar:run');

  if (kind !== 'ACCESS' && kind !== 'ERASURE') {
    return { ok: false, error: 'Unknown request type.' };
  }
  if (!pid.trim()) return { ok: false, error: 'Enter a participant id.' };

  const result = await retentionRepo.executeDsar({
    orgId: user.orgId,
    pid: pid.trim(),
    kind: kind as DsarKind,
    actorId: user.id,
    actorRole: user.role,
  });

  revalidatePath('/governance');
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, result };
}
