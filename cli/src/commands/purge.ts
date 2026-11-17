import { DataClass, newId, type RetentionRuleView } from '@chetna/core';
import { auditRepo, prisma } from '@chetna/db';
import { planPurge, RETENTION_RATIONALE } from '@chetna/privacy';
import { heading, info, kv, ok, warn } from '../lib/out';

/**
 * Retention enforcement.
 *
 * Deletion writes a receipt AND an audit entry, because what an auditor or a
 * data-protection officer actually wants is *evidence that deletion happened* —
 * not a policy document promising that it will.
 *
 * TELEMETRY_RAW is a field-level purge rather than a row delete: the event
 * (someone clicked) is retained for its full period, while the forensic detail
 * about their device and network is erased after thirty days. The metric
 * survives; the surveillance potential does not.
 */
export async function purge(options: { apply?: boolean } = {}): Promise<void> {
  const dryRun = options.apply !== true;
  heading(dryRun ? 'Retention purge — DRY RUN' : 'Retention purge — APPLYING');

  const org = await prisma.org.findFirst();
  if (!org) {
    warn('no organisation found; nothing to purge');
    return;
  }

  const rules: RetentionRuleView[] = (
    await prisma.retentionRule.findMany({ where: { orgId: org.id } })
  ).map((r) => ({ dataClass: r.dataClass as DataClass, retainDays: r.retainDays }));

  const plans = planPurge(rules);
  let totalAffected = 0;

  for (const plan of plans) {
    const cutoff = new Date(plan.cutoffAt);

    if (!plan.purgeable) {
      info(`${plan.dataClass.padEnd(14, ' ')} retained ${plan.retainDays}d — never auto-purged`);
      info(`${' '.repeat(16)}${RETENTION_RATIONALE[plan.dataClass]}`);
      continue;
    }

    let affected = 0;

    switch (plan.dataClass) {
      case DataClass.TELEMETRY_RAW: {
        const where = {
          at: { lt: cutoff },
          OR: [{ uaFamily: { not: null } }, { ipClass: { not: null } }],
        };
        affected = await prisma.event.count({ where });
        if (!dryRun && affected > 0) {
          await prisma.event.updateMany({
            where,
            data: { uaFamily: null, ipClass: null, machineScore: 0 },
          });
        }
        break;
      }
      case DataClass.EVENT: {
        affected = await prisma.event.count({ where: { at: { lt: cutoff } } });
        if (!dryRun && affected > 0) {
          await prisma.event.deleteMany({ where: { at: { lt: cutoff } } });
        }
        break;
      }
      case DataClass.CONTACT: {
        const where = { createdAt: { lt: cutoff }, email: { not: null } };
        affected = await prisma.participant.count({ where });
        if (!dryRun && affected > 0) {
          await prisma.participant.updateMany({
            where,
            data: { email: null, displayName: null },
          });
        }
        break;
      }
      case DataClass.LEARNING: {
        affected = await prisma.progress.count({ where: { startedAt: { lt: cutoff } } });
        if (!dryRun && affected > 0) {
          await prisma.progress.deleteMany({ where: { startedAt: { lt: cutoff } } });
        }
        break;
      }
      case DataClass.REPORT: {
        // Generated report files land on disk in a later phase; nothing to purge yet.
        affected = 0;
        break;
      }
      default:
        break;
    }

    totalAffected += affected;
    const verb = plan.dataClass === DataClass.TELEMETRY_RAW ? 'fields cleared' : 'rows removed';
    kv(
      `${plan.dataClass} (${plan.retainDays}d)`,
      `${affected} ${verb}${dryRun ? ' (would be)' : ''}`,
    );

    const receipt = await prisma.purgeReceipt.create({
      data: {
        id: newId('pur'),
        orgId: org.id,
        dataClass: plan.dataClass,
        cutoffAt: cutoff,
        rowsDeleted: affected,
        dryRun,
      },
    });
    const entry = await auditRepo.append({
      orgId: org.id,
      action: dryRun ? 'retention.purge_planned' : 'retention.purged',
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
  }

  console.log('');
  if (dryRun) {
    info(`${totalAffected} record(s) are past their retention cutoff. Re-run with --apply to erase.`);
  } else {
    ok(`${totalAffected} record(s) erased. A receipt and an audit entry were written for each class.`);
  }
}
