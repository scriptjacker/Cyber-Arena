import nodemailer, { type Transporter } from 'nodemailer';
import {
  ActorClass,
  AssignmentState,
  BRAND,
  CampaignStatus,
  EventType,
  newId,
  renderSubject,
  renderTemplate,
  simulationHeaders,
  tokenUrls,
  type PolicyDecision,
} from '@chetna/core';
import { auditRepo, buildSendContext, eventsRepo, prisma, readJson, runtimeConfig } from '@chetna/db';
import { evaluate, explain } from '@chetna/policy';

/**
 * The send worker.
 *
 * The important line in this file is the call to `evaluate()`: the seven gates
 * are re-run IMMEDIATELY BEFORE EVERY SINGLE MESSAGE, not once per campaign.
 * That is what makes a revoked grant, an engaged kill switch, a fresh opt-out
 * or an edited roster take effect on the very next message rather than the next
 * campaign.
 *
 * A refusal is not a silent skip. It writes an event, a reason code and an
 * audit entry, because "nothing happened" and "we refused to do it" are
 * different facts and only one of them is evidence.
 *
 * Claim-then-check: a row is claimed with a conditional update, so two workers
 * can never send the same message twice. No Redis, no broker — the database is
 * the queue, which is what keeps the whole thing runnable offline.
 */

const BATCH = 25;
const TICK_MS = 1000;

function isLoopbackHost(host: string): boolean {
  const h = host.trim().toLowerCase().replace(/^::ffff:/, '');
  return h === '127.0.0.1' || h === '::1' || h === 'localhost' || h.startsWith('127.');
}

/**
 * Mail transport.
 *
 * Two distinct configurations, and deliberately no middle ground:
 *
 *  - loopback (the offline sink): plain SMTP with TLS skipped, because there is
 *    no TLS to verify on a connection that never leaves the machine.
 *  - anything else (a real relay): TLS is REQUIRED and certificates are
 *    verified normally.
 *
 * Certificate verification is never disabled. An earlier version carried
 * `rejectUnauthorized: false`, which is harmless against a loopback sink and a
 * silent man-in-the-middle hole the moment someone points SMTP_HOST at a real
 * relay — exactly the kind of dev-convenience setting that ships to production.
 */
function transport(): Transporter {
  const cfg = runtimeConfig();
  if (isLoopbackHost(cfg.smtpHost)) {
    return nodemailer.createTransport({
      host: cfg.smtpHost,
      port: cfg.smtpPort,
      secure: false,
      ignoreTLS: true,
    });
  }
  return nodemailer.createTransport({
    host: cfg.smtpHost,
    port: cfg.smtpPort,
    secure: cfg.smtpPort === 465,
    requireTLS: true,
    auth:
      process.env.SMTP_USER && process.env.SMTP_PASS
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
  });
}

export interface TickResult {
  claimed: number;
  sent: number;
  blocked: number;
  failed: number;
}

async function dueAssignmentIds(now: Date): Promise<string[]> {
  const rows = await prisma.assignment.findMany({
    where: {
      state: AssignmentState.QUEUED,
      sendAt: { lte: now },
      campaign: {
        status: { in: [CampaignStatus.AUTHORIZED, CampaignStatus.RUNNING] },
      },
    },
    orderBy: { sendAt: 'asc' },
    take: BATCH,
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

/** Conditional claim. Returns false if another worker got there first. */
async function claim(assignmentId: string): Promise<boolean> {
  const result = await prisma.assignment.updateMany({
    where: { id: assignmentId, state: AssignmentState.QUEUED },
    data: { state: AssignmentState.CLAIMED, claimedAt: new Date() },
  });
  return result.count === 1;
}

async function recordBlock(
  assignmentId: string,
  orgId: string,
  decision: PolicyDecision,
  campaignId: string,
  pid: string,
): Promise<void> {
  const primary = decision.reasons[0];
  await prisma.assignment.update({
    where: { id: assignmentId },
    data: { state: AssignmentState.BLOCKED, blockedReason: decision.reasons.join(',') },
  });
  await eventsRepo.append({
    assignmentId,
    type: EventType.BLOCKED_BY_POLICY,
    at: decision.evaluatedAt,
    actorClass: ActorClass.UNKNOWN,
    machineScore: 0,
    meta: { reasonCode: primary },
  });
  await auditRepo.append({
    orgId,
    action: 'send.blocked',
    reasonCode: primary,
    payload: {
      campaignId,
      assignmentId,
      participantPid: pid,
      gate: decision.gate,
      reasons: decision.reasons,
      inputsHash: decision.inputsHash,
    },
  });
}

export async function tick(tx: Transporter, now = new Date()): Promise<TickResult> {
  const cfg = runtimeConfig();
  const result: TickResult = { claimed: 0, sent: 0, blocked: 0, failed: 0 };

  for (const assignmentId of await dueAssignmentIds(now)) {
    if (!(await claim(assignmentId))) continue;
    result.claimed++;

    const ctx = await buildSendContext(assignmentId, now);
    if (!ctx) {
      await prisma.assignment.update({
        where: { id: assignmentId },
        data: { state: AssignmentState.FAILED, blockedReason: 'context could not be built' },
      });
      result.failed++;
      continue;
    }

    // ------------------------------------------------------- THE GATES
    const decision = evaluate(ctx);
    if (!decision.allow) {
      await recordBlock(
        assignmentId,
        ctx.campaign.orgId,
        decision,
        ctx.campaign.id,
        ctx.participant.pid,
      );
      result.blocked++;
      console.log(`  ✗ ${ctx.participant.pid} blocked at gate ${decision.gate}: ${decision.reasons.join(', ')}`);
      continue;
    }

    // ------------------------------------------------------------ send
    const assignment = await prisma.assignment.findUnique({
      where: { id: assignmentId },
      include: { template: true, participant: true, campaign: true },
    });
    if (!assignment) {
      result.failed++;
      continue;
    }

    const { template, participant, campaign } = assignment;
    const urls = tokenUrls(cfg.simUrl, assignment.token);
    const vars = {
      firstName: (participant.displayName ?? 'there').split(' ')[0],
      displayName: participant.displayName ?? 'there',
      department: participant.department,
      orgName: 'Nimbus Logistics',
      watermarkId: template.watermarkId,
      ...urls,
    };

    try {
      const info = await tx.sendMail({
        from: { name: template.fromName, address: template.fromAddress },
        to: participant.email ?? undefined,
        subject: renderSubject(template.subject, vars),
        html: renderTemplate(template.html, vars),
        text: template.text ? renderTemplate(template.text, vars) : undefined,
        headers: {
          ...simulationHeaders(template.watermarkId, campaign.id),
          'X-Chetna-Assignment': assignment.id,
        },
        attachments: readJson<{ filename: string; contentType: string }[]>(
          template.attachmentsJson,
          [],
        ).map((a) => ({
          filename: a.filename,
          contentType: a.contentType,
          // An inert placeholder. safety-lint SL009 already restricts the type;
          // this guarantees the bytes are harmless regardless.
          content: Buffer.from(
            `This file is part of an authorized security awareness simulation.\n` +
              `Simulation id: ${template.watermarkId}\n` +
              `If you were not expecting it, reporting it was the right thing to do.\n`,
            'utf8',
          ),
        })),
      });

      const sentAt = new Date();
      await prisma.assignment.update({
        where: { id: assignmentId },
        data: { state: AssignmentState.SENT, sentAt, messageId: info.messageId },
      });
      await eventsRepo.append({
        assignmentId,
        type: EventType.SENT,
        at: sentAt.toISOString(),
        actorClass: ActorClass.UNKNOWN,
        machineScore: 0,
      });
      await prisma.participant.update({
        where: { id: participant.id },
        data: { lastSimulatedAt: sentAt },
      });
      await auditRepo.append({
        orgId: campaign.orgId,
        action: 'send.sent',
        payload: {
          campaignId: campaign.id,
          assignmentId,
          participantPid: participant.pid,
          templateId: template.id,
          watermarkId: template.watermarkId,
          inputsHash: decision.inputsHash,
        },
      });

      if (campaign.status === CampaignStatus.AUTHORIZED) {
        await prisma.campaign.update({
          where: { id: campaign.id },
          data: { status: CampaignStatus.RUNNING },
        });
      }

      result.sent++;
      console.log(`  → sent to ${participant.pid} (${template.id})`);
    } catch (err) {
      await prisma.assignment.update({
        where: { id: assignmentId },
        data: {
          state: AssignmentState.FAILED,
          blockedReason: err instanceof Error ? err.message.slice(0, 200) : 'send failed',
        },
      });
      await auditRepo.append({
        orgId: campaign.orgId,
        action: 'send.failed',
        payload: {
          campaignId: campaign.id,
          assignmentId,
          error: err instanceof Error ? err.message.slice(0, 300) : String(err),
        },
      });
      result.failed++;
      console.log(`  ! send failed for ${participant.pid}: ${(err as Error).message}`);
    }
  }

  await completeFinishedCampaigns(now);
  return result;
}

/** A campaign whose window has closed and has nothing left queued is complete. */
async function completeFinishedCampaigns(now: Date): Promise<void> {
  const running = await prisma.campaign.findMany({
    where: { status: CampaignStatus.RUNNING, windowEnd: { lt: now } },
    select: { id: true, orgId: true },
  });
  for (const c of running) {
    const remaining = await prisma.assignment.count({
      where: { campaignId: c.id, state: { in: [AssignmentState.QUEUED, AssignmentState.CLAIMED] } },
    });
    if (remaining > 0) continue;
    await prisma.campaign.update({
      where: { id: c.id },
      data: { status: CampaignStatus.COMPLETE },
    });
    await auditRepo.append({
      orgId: c.orgId,
      action: 'campaign.completed',
      payload: { campaignId: c.id, reason: 'send window closed with no messages outstanding' },
    });
  }
}

export async function runOnce(): Promise<TickResult> {
  const tx = transport();
  const result = await tick(tx);
  tx.close();
  return result;
}

export async function runForever(): Promise<void> {
  const cfg = runtimeConfig();
  const tx = transport();
  console.log(`\n${BRAND.name} worker started`);
  console.log(`  mode ${cfg.mode} · transport ${cfg.smtpHost}:${cfg.smtpPort} · tick ${TICK_MS}ms`);
  console.log('  the seven gates are re-evaluated before every message\n');

  let stopping = false;
  const stop = async () => {
    stopping = true;
    console.log('\nstopping worker');
    tx.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);

  let idleTicks = 0;
  while (!stopping) {
    try {
      const r = await tick(tx);
      if (r.claimed > 0) {
        idleTicks = 0;
        console.log(
          `  tick: ${r.sent} sent, ${r.blocked} blocked, ${r.failed} failed (${r.claimed} claimed)`,
        );
      } else if (++idleTicks % 60 === 0) {
        console.log(`  ${new Date().toISOString()} · idle, nothing due`);
      }
    } catch (err) {
      console.error(`  ! tick error: ${(err as Error).message}`);
    }
    await new Promise((r) => setTimeout(r, TICK_MS));
  }
}

const isEntry = process.argv[1]?.replace(/\\/g, '/').includes('services/worker');
if (isEntry) {
  if (process.argv.includes('--once')) {
    const r = await runOnce();
    console.log(`\n${r.sent} sent · ${r.blocked} blocked · ${r.failed} failed`);
    await prisma.$disconnect();
    process.exit(0);
  } else {
    await runForever();
  }
}

export { explain, newId };
