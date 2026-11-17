import { AssignmentState, EventType } from '@chetna/core';
import { prisma } from '@chetna/db';
import { createSink } from '@chetna/mailsink';
import { runOnce } from '@chetna/worker';
import { fail, heading, info, kv, ok, warn } from '../lib/out';

/**
 * One self-contained send cycle: start the loopback sink, run a single worker
 * tick through the seven gates, report what was sent and what was refused, then
 * stop.
 *
 * For the live demo you would run `npm run mailsink` and `npm run worker` in
 * two terminals so the stream is visible. This exists so the whole path can be
 * exercised in one command — by a person, or by CI.
 */
export async function sendOnce(): Promise<void> {
  heading('Send cycle — sink + one worker tick');

  const before = await prisma.message.count();
  const sink = createSink({ quiet: true });
  await sink.start();

  try {
    const result = await runOnce();
    const after = await prisma.message.count();

    kv('claimed', result.claimed);
    kv('sent', result.sent);
    kv('blocked by policy', result.blocked);
    kv('failed', result.failed);
    kv('messages captured by the sink', after - before);

    if (result.sent > 0 && after - before !== result.sent) {
      warn(
        `${result.sent} messages were sent but ${after - before} were captured. The sink and the worker disagree.`,
      );
    }

    const blocked = await prisma.assignment.findMany({
      where: { state: AssignmentState.BLOCKED },
      include: { participant: { select: { pid: true, department: true } } },
      take: 10,
    });
    if (blocked.length > 0) {
      console.log('');
      info('Refused, with the gate that refused them:');
      for (const b of blocked) {
        console.log(`       ${b.participant.pid}  ${(b.blockedReason ?? '').split(',')[0]}`);
      }
    }

    // Every captured message must carry the simulation headers. A simulated
    // message that cannot be identified as one afterwards is just phishing.
    const sample = await prisma.message.findFirst({ orderBy: { receivedAt: 'desc' } });
    if (sample) {
      const headers = JSON.parse(sample.headersJson) as Record<string, string>;
      const hasWatermark = Boolean(headers['x-chetna-simulation']);
      const hasAssignment = Boolean(headers['x-chetna-assignment']);
      console.log('');
      kv('most recent capture', `${sample.toAddress} — ${sample.subject}`);
      if (hasWatermark && hasAssignment) {
        ok('carries the simulation headers and is traceable to one assignment');
      } else {
        fail('missing simulation headers — this must never happen');
      }
      const bodyHasPassword = /type\s*=\s*["']password["']/i.test(sample.html);
      if (bodyHasPassword) fail('the captured body contains a password field');
      else ok('no credential field anywhere in the captured body');
    }

    const sentEvents = await prisma.event.count({ where: { type: EventType.SENT } });
    const blockEvents = await prisma.event.count({
      where: { type: EventType.BLOCKED_BY_POLICY },
    });
    console.log('');
    kv('SENT events recorded', sentEvents);
    kv('BLOCKED_BY_POLICY events', blockEvents);
    info('A refusal is recorded, not silently skipped. Every one has an audit entry.');
  } finally {
    await sink.stop();
  }
}
