import {
  AssignmentState,
  type CampaignStatus,
  type EthicsStatus,
  type LintStatus,
  type PolicyParticipantView,
  type PolicyTemplateView,
  type RunMode,
  type SendContext,
  type SuppressionScope,
} from '@chetna/core';
import { matchesSuppression, type SuppressionRule } from '@chetna/policy';
import { prisma, runtimeConfig } from './client';
import { readJson } from './json';
import { buildLiveScope, loadDomains, loadGrant } from './scope';

interface OrgSettings {
  kAnon?: number;
  cooldownDays?: number;
  newJoinerGraceDays?: number;
}

async function limitsFor(orgId: string) {
  const cfg = runtimeConfig();
  const org = await prisma.org.findUnique({ where: { id: orgId }, select: { settingsJson: true } });
  const settings = readJson<OrgSettings>(org?.settingsJson, {});
  return {
    cooldownDays: settings.cooldownDays ?? cfg.cooldownDays,
    newJoinerGraceDays: settings.newJoinerGraceDays ?? cfg.newJoinerGraceDays,
  };
}

async function suppressionRules(orgId: string): Promise<SuppressionRule[]> {
  const rows = await prisma.suppression.findMany({ where: { orgId } });
  return rows.map((r) => ({
    scope: r.scope as SuppressionScope,
    value: r.value,
    reason: r.reason,
    expiresAt: r.expiresAt,
  }));
}

async function sentInLastHour(campaignId: string, now: Date): Promise<number> {
  return prisma.assignment.count({
    where: {
      campaignId,
      state: AssignmentState.SENT,
      sentAt: { gte: new Date(now.getTime() - 3_600_000) },
    },
  });
}

/**
 * Assemble everything gate evaluation needs for ONE message.
 *
 * The worker calls this immediately before every single send — not once per
 * campaign — which is what makes a revoked grant, a flipped kill switch or a
 * fresh opt-out take effect on the very next message rather than the next run.
 */
export async function buildSendContext(
  assignmentId: string,
  now: Date = new Date(),
): Promise<SendContext | null> {
  const assignment = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    include: {
      participant: true,
      template: true,
      campaign: true,
    },
  });
  if (!assignment) return null;

  const { campaign, participant, template } = assignment;
  const liveScope = await buildLiveScope(campaign.id);
  if (!liveScope) return null;

  const [grant, domains, limits, rules, sentRecently, rosterMember] = await Promise.all([
    loadGrant(campaign.id),
    loadDomains(campaign.orgId, campaign.senderDomain, campaign.landingDomain),
    limitsFor(campaign.orgId),
    suppressionRules(campaign.orgId),
    sentInLastHour(campaign.id, now),
    prisma.rosterMember.findUnique({
      where: {
        rosterImportId_participantId: {
          rosterImportId: campaign.rosterImportId,
          participantId: participant.id,
        },
      },
      select: { participantId: true },
    }),
  ]);

  const suppressed = matchesSuppression(
    {
      email: participant.email,
      department: participant.department,
      roleArchetype: participant.roleArchetype,
    },
    rules,
    now,
  );

  const participantView: PolicyParticipantView = {
    pid: participant.pid,
    email: participant.email ?? '',
    onRoster: Boolean(rosterMember),
    optedOutAt: participant.optedOutAt ? participant.optedOutAt.toISOString() : null,
    excludedByHr: participant.excludedByHr,
    matchesSuppression: Boolean(suppressed),
    lastSimulatedAt: participant.lastSimulatedAt
      ? participant.lastSimulatedAt.toISOString()
      : null,
    joinedAt: participant.joinedAt ? participant.joinedAt.toISOString() : null,
  };

  const templateView: PolicyTemplateView = {
    id: template.id,
    contentHash: template.contentHash,
    lintStatus: template.lintStatus as LintStatus,
    ethicsStatus: template.ethicsStatus as EthicsStatus,
    watermarkId: template.watermarkId,
  };

  const cfg = runtimeConfig();
  return {
    now: now.toISOString(),
    mode: cfg.mode as RunMode,
    campaign: {
      id: campaign.id,
      orgId: campaign.orgId,
      status: campaign.status as CampaignStatus,
      killSwitch: campaign.killSwitch,
      rateLimitPerHour: campaign.rateLimitPerHour,
      sentInLastHour: sentRecently,
    },
    liveScope,
    grant,
    participant: participantView,
    template: templateView,
    domains,
    transport: { host: cfg.smtpHost },
    limits,
  };
}

/**
 * Dry-run contexts for the preflight panel: one per person on the roster,
 * evaluated against the campaign's first template, BEFORE any assignment
 * exists. The operator sees every gate for every participant and can fix the
 * campaign before asking two colleagues to sign anything.
 */
export async function buildPreflightContexts(
  campaignId: string,
  now: Date = new Date(),
): Promise<SendContext[]> {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) return [];
  const liveScope = await buildLiveScope(campaignId);
  if (!liveScope) return [];

  const [grant, domains, limits, rules, sentRecently, members, templates] = await Promise.all([
    loadGrant(campaignId),
    loadDomains(campaign.orgId, campaign.senderDomain, campaign.landingDomain),
    limitsFor(campaign.orgId),
    suppressionRules(campaign.orgId),
    sentInLastHour(campaignId, now),
    prisma.rosterMember.findMany({
      where: { rosterImportId: campaign.rosterImportId },
      include: { participant: true },
    }),
    prisma.template.findMany({ where: { id: { in: liveScope.templateIds } } }),
  ]);

  const cfg = runtimeConfig();
  const template = templates[0];
  const templateView: PolicyTemplateView = template
    ? {
        id: template.id,
        contentHash: template.contentHash,
        lintStatus: template.lintStatus as LintStatus,
        ethicsStatus: template.ethicsStatus as EthicsStatus,
        watermarkId: template.watermarkId,
      }
    : { id: 'none', contentHash: 'none', lintStatus: 'FAIL', ethicsStatus: 'BLOCKED', watermarkId: null };

  return members.map(({ participant }) => {
    const suppressed = matchesSuppression(
      {
        email: participant.email,
        department: participant.department,
        roleArchetype: participant.roleArchetype,
      },
      rules,
      now,
    );
    return {
      now: now.toISOString(),
      mode: cfg.mode as RunMode,
      campaign: {
        id: campaign.id,
        orgId: campaign.orgId,
        status: campaign.status as CampaignStatus,
        killSwitch: campaign.killSwitch,
        rateLimitPerHour: campaign.rateLimitPerHour,
        sentInLastHour: sentRecently,
      },
      liveScope,
      grant,
      participant: {
        pid: participant.pid,
        email: participant.email ?? '',
        onRoster: true,
        optedOutAt: participant.optedOutAt ? participant.optedOutAt.toISOString() : null,
        excludedByHr: participant.excludedByHr,
        matchesSuppression: Boolean(suppressed),
        lastSimulatedAt: participant.lastSimulatedAt
          ? participant.lastSimulatedAt.toISOString()
          : null,
        joinedAt: participant.joinedAt ? participant.joinedAt.toISOString() : null,
      },
      template: templateView,
      domains,
      transport: { host: cfg.smtpHost },
      limits,
    } satisfies SendContext;
  });
}

/**
 * Preflight for a participant who is NOT on the roster — used by the demo to
 * show gate G2 and G3 refusing an out-of-scope recipient without having to
 * create a real assignment for them first.
 */
export async function buildHypotheticalContext(
  campaignId: string,
  email: string,
  now: Date = new Date(),
): Promise<SendContext | null> {
  const contexts = await buildPreflightContexts(campaignId, now);
  const base = contexts[0];
  if (!base) return null;
  return {
    ...base,
    participant: {
      pid: 'p_hypothetical',
      email,
      onRoster: false,
      optedOutAt: null,
      excludedByHr: false,
      matchesSuppression: false,
      lastSimulatedAt: null,
      joinedAt: null,
    },
  };
}
