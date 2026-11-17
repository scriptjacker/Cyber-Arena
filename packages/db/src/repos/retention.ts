import { DataClass, newId, type DsarKind, type RetentionRuleView } from '@chetna/core';
import { buildErasurePatch, planPurge, RETENTION_RATIONALE } from '@chetna/privacy';
import { prisma } from '../client';
import * as auditRepo from './audit';

/**
 * Retention enforcement and DSAR fulfilment.
 *
 * Shared by the CLI and the console so there is exactly one implementation of
 * "what deletion means" — the kind of thing that must not differ depending on
 * which button was pressed.
 *
 * Deletion writes a receipt AND an audit entry, because what an auditor or a
 * data-protection officer actually wants is evidence that deletion happened,
 * not a policy promising it will.
 */

export interface PurgeLine {
  dataClass: DataClass;
  retainDays: number;
  cutoffAt: string;
  purgeable: boolean;
  affected: number;
  /** TELEMETRY_RAW clears fields; everything else removes rows. */
  mode: 'fields-cleared' | 'rows-removed' | 'not-purged';
  note?: string;
  receiptId?: string;
}

export async function executePurge(options: {
  orgId: string;
  apply: boolean;
  actorId?: string;
  actorRole?: string;
}): Promise<PurgeLine[]> {
  const { orgId, apply } = options;

  const rules: RetentionRuleView[] = (
    await prisma.retentionRule.findMany({ where: { orgId } })
  ).map((r) => ({ dataClass: r.dataClass as DataClass, retainDays: r.retainDays }));

  const out: PurgeLine[] = [];

  for (const plan of planPurge(rules)) {
    const cutoff = new Date(plan.cutoffAt);

    if (!plan.purgeable) {
      out.push({
        dataClass: plan.dataClass,
        retainDays: plan.retainDays,
        cutoffAt: plan.cutoffAt,
        purgeable: false,
        affected: 0,
        mode: 'not-purged',
        note: RETENTION_RATIONALE[plan.dataClass],
      });
      continue;
    }

    let affected = 0;
    let mode: PurgeLine['mode'] = 'rows-removed';

    switch (plan.dataClass) {
      case DataClass.TELEMETRY_RAW: {
        // A field-level purge, not a row delete: the fact that someone clicked
        // is retained for its full period, while the forensic detail about
        // their device and network is erased after thirty days. The metric
        // survives; the surveillance potential does not.
        mode = 'fields-cleared';
        const where = {
          at: { lt: cutoff },
          OR: [{ uaFamily: { not: null } }, { ipClass: { not: null } }],
        };
        affected = await prisma.event.count({ where });
        if (apply && affected > 0) {
          await prisma.event.updateMany({
            where,
            data: { uaFamily: null, ipClass: null, machineScore: 0 },
          });
        }
        break;
      }
      case DataClass.EVENT: {
        affected = await prisma.event.count({ where: { at: { lt: cutoff } } });
        if (apply && affected > 0) {
          await prisma.event.deleteMany({ where: { at: { lt: cutoff } } });
        }
        break;
      }
      case DataClass.CONTACT: {
        const where = { orgId, createdAt: { lt: cutoff }, email: { not: null } };
        affected = await prisma.participant.count({ where });
        if (apply && affected > 0) {
          await prisma.participant.updateMany({
            where,
            data: { email: null, displayName: null },
          });
        }
        break;
      }
      case DataClass.LEARNING: {
        affected = await prisma.progress.count({ where: { startedAt: { lt: cutoff } } });
        if (apply && affected > 0) {
          await prisma.progress.deleteMany({ where: { startedAt: { lt: cutoff } } });
        }
        break;
      }
      case DataClass.REPORT:
      default:
        affected = 0;
        break;
    }

    const receipt = await prisma.purgeReceipt.create({
      data: {
        id: newId('pur'),
        orgId,
        dataClass: plan.dataClass,
        cutoffAt: cutoff,
        rowsDeleted: affected,
        dryRun: !apply,
      },
    });
    const entry = await auditRepo.append({
      orgId,
      actorId: options.actorId ?? null,
      actorRole: (options.actorRole ?? null) as never,
      action: apply ? 'retention.purged' : 'retention.purge_planned',
      payload: {
        dataClass: plan.dataClass,
        cutoffAt: plan.cutoffAt,
        retainDays: plan.retainDays,
        rowsAffected: affected,
        receiptId: receipt.id,
      },
    });
    await prisma.purgeReceipt.update({
      where: { id: receipt.id },
      data: { auditSeq: entry.seq },
    });

    out.push({
      dataClass: plan.dataClass,
      retainDays: plan.retainDays,
      cutoffAt: plan.cutoffAt,
      purgeable: true,
      affected,
      mode,
      receiptId: receipt.id,
    });
  }

  return out;
}

export interface DsarOutcome {
  ok: boolean;
  kind: DsarKind;
  pid: string;
  error?: string;
  /** For ACCESS: everything held about this person. */
  export?: unknown;
  requestId?: string;
}

/**
 * Fulfil a data-subject request.
 *
 * ACCESS returns everything held, including the retention clocks — because
 * "what do you have about me, and when does it go" is the actual question.
 *
 * ERASURE tombstones the participant and nulls the contact fields while
 * retaining aggregate counts. That is simultaneously the lawful outcome and the
 * honest one: the person is gone from the system, and last quarter's campaign
 * analytics do not silently change after the fact.
 */
export async function executeDsar(options: {
  orgId: string;
  pid: string;
  kind: DsarKind;
  actorId?: string;
  actorRole?: string;
}): Promise<DsarOutcome> {
  const { orgId, pid, kind } = options;

  const participant = await prisma.participant.findUnique({
    where: { pid },
    include: {
      assignments: {
        include: {
          template: { select: { name: true, difficulty: true } },
          events: { select: { type: true, at: true, actorClass: true, machineScore: true } },
        },
      },
      progress: { include: { module: { select: { slug: true, title: true } } } },
      spacedItems: true,
    },
  });

  if (!participant || participant.orgId !== orgId) {
    return { ok: false, kind, pid, error: 'No participant with that id.' };
  }

  const request = await prisma.dsarRequest.create({
    data: { id: newId('dsar'), orgId, participantId: participant.id, kind, status: 'PENDING' },
  });

  if (kind === 'ACCESS') {
    const rules = await prisma.retentionRule.findMany({ where: { orgId } });
    const payload = {
      identity: {
        pid: participant.pid,
        department: participant.department,
        roleArchetype: participant.roleArchetype,
        locale: participant.locale,
        consentState: participant.consentState,
        joinedAt: participant.joinedAt,
      },
      contactDataHeld: { email: participant.email, displayName: participant.displayName },
      resilience: { rating: participant.resilienceRating },
      simulations: participant.assignments.map((a) => ({
        campaignId: a.campaignId,
        template: a.template.name,
        difficulty: a.template.difficulty,
        arm: a.arm,
        state: a.state,
        sentAt: a.sentAt,
        events: a.events,
      })),
      learning: participant.progress.map((p) => ({
        module: p.module.slug,
        title: p.module.title,
        startedAt: p.startedAt,
        completedAt: p.completedAt,
        dwellMs: p.dwellMs,
        drillScore: p.drillScore,
      })),
      spacedRepetition: participant.spacedItems,
      retentionClocks: rules.map((r) => ({ dataClass: r.dataClass, retainDays: r.retainDays })),
    };

    await prisma.dsarRequest.update({
      where: { id: request.id },
      data: { status: 'FULFILLED', fulfilledAt: new Date() },
    });
    await auditRepo.append({
      orgId,
      actorId: options.actorId ?? null,
      actorRole: (options.actorRole ?? null) as never,
      action: 'dsar.access_fulfilled',
      payload: { pid, requestId: request.id, sections: Object.keys(payload).length },
    });

    return { ok: true, kind, pid, export: payload, requestId: request.id };
  }

  // ERASURE
  const patch = buildErasurePatch();
  await prisma.participant.update({
    where: { id: participant.id },
    data: {
      email: patch.email,
      displayName: patch.displayName,
      consentState: patch.consentState,
      optedOutAt: new Date(),
      erasedAt: new Date(patch.erasedAt),
    },
  });
  await prisma.dsarRequest.update({
    where: { id: request.id },
    data: { status: 'FULFILLED', fulfilledAt: new Date() },
  });
  await auditRepo.append({
    orgId,
    actorId: options.actorId ?? null,
    actorRole: (options.actorRole ?? null) as never,
    action: 'dsar.erasure_fulfilled',
    payload: {
      pid,
      requestId: request.id,
      fieldsNulled: ['email', 'displayName'],
      aggregatesRetained: true,
    },
  });

  return { ok: true, kind, pid, requestId: request.id };
}
