import { BRAND } from '@chetna/core';
import { prisma, runtimeConfig } from '@chetna/db';
import { heading, info, kv, ok, warn } from '../lib/out';

export async function status(): Promise<void> {
  const cfg = runtimeConfig();
  heading(`${BRAND.name} — status`);

  kv('mode', cfg.mode);
  kv('mail transport', `${cfg.smtpHost}:${cfg.smtpPort}`);
  kv('simulation surface', cfg.simUrl);
  kv('k-anonymity threshold', cfg.kAnon);
  kv('simulation cooldown', `${cfg.cooldownDays} days`);
  kv('new-joiner grace', `${cfg.newJoinerGraceDays} days`);

  if (cfg.mode === 'offline') {
    ok('offline mode: gate G7 refuses any non-loopback transport and any non-test recipient domain');
  } else {
    warn('LIVE mode: real mailboxes are reachable. Every gate still applies.');
  }

  const org = await prisma.org.findFirst();
  if (!org) {
    heading('Database');
    warn('empty — run `npm run demo`');
    return;
  }

  heading('Database');
  const [
    participants,
    optedOut,
    excluded,
    templates,
    blocked,
    campaigns,
    assignments,
    sent,
    events,
    reports,
    modules,
    audits,
    attestations,
    suppressions,
  ] = await Promise.all([
    prisma.participant.count(),
    prisma.participant.count({ where: { optedOutAt: { not: null } } }),
    prisma.participant.count({ where: { excludedByHr: true } }),
    prisma.template.count(),
    prisma.template.count({ where: { ethicsStatus: 'BLOCKED' } }),
    prisma.campaign.count(),
    prisma.assignment.count(),
    prisma.assignment.count({ where: { state: 'SENT' } }),
    prisma.event.count(),
    prisma.reportTriage.count(),
    prisma.module.count(),
    prisma.auditEntry.count(),
    prisma.safetyAttestation.count(),
    prisma.suppression.count(),
  ]);

  kv('organisation', `${org.name} (${org.slug})`);
  kv('participants', `${participants} (${optedOut} opted out, ${excluded} HR-excluded)`);
  kv('suppression rules', suppressions);
  kv('templates', `${templates} (${blocked} blocked by the ethics screen)`);
  kv('learning modules', modules);
  kv('campaigns', campaigns);
  kv('assignments', `${assignments} (${sent} sent)`);
  kv('events', events);
  kv('reports triaged', reports);
  kv('audit entries', audits);
  kv('safety attestations', attestations);

  const campaignRows = await prisma.campaign.findMany({
    orderBy: { createdAt: 'asc' },
    include: { grant: { include: { approvals: true } } },
  });
  heading('Campaigns');
  for (const c of campaignRows) {
    const approvals = c.grant?.approvals.length ?? 0;
    kv(c.id, `${c.status} · ${approvals} approval(s) · ${c.name}`);
  }

  info('Commands: preflight <campaignId> · metrics [campaignId] · audit verify · safety attest · purge');
}
