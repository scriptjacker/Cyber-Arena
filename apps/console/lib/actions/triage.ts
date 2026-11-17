'use server';

import { revalidatePath } from 'next/cache';
import { Verdict } from '@chetna/core';
import { auditRepo, prisma } from '@chetna/db';
import { requireCapability } from '../session';

export async function setVerdict(
  reportId: string,
  verdict: string,
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireCapability('triage:write');

  if (!Object.values(Verdict).includes(verdict as never)) {
    return { ok: false, error: 'Unknown verdict.' };
  }

  const report = await prisma.reportTriage.findUnique({ where: { id: reportId } });
  if (!report || report.orgId !== user.orgId) return { ok: false, error: 'Unknown report.' };

  await prisma.reportTriage.update({
    where: { id: reportId },
    data: { verdict, analystId: user.id, reviewedAt: new Date() },
  });

  await auditRepo.append({
    orgId: user.orgId,
    actorId: user.id,
    actorRole: user.role,
    action: 'triage.reviewed',
    // The reporter's pid is deliberately absent: a triage decision is about the
    // message, not the person who reported it.
    payload: { reportId, verdict, clusterKey: report.clusterKey },
  });

  revalidatePath('/triage');
  return { ok: true };
}
