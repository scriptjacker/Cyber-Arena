import {
  ActorClass,
  CampaignStatus,
  EventType,
  type CohortRow,
  type Difficulty,
} from '@chetna/core';
import { computeMetrics, holdoutEffect, isFailure, type AssignmentOutcome } from '@chetna/scoring';
import { prisma } from '../client';
import { campaignOutcomes } from './events';

/**
 * Every analytics query lives here, so the CLI and the console cannot drift
 * into reporting different numbers for the same campaign. That has happened to
 * enough products to be worth one module.
 */

export type CohortDimension = 'department' | 'roleArchetype' | 'locale' | 'difficulty';

const DIMENSION_LABEL: Record<CohortDimension, string> = {
  department: 'Department',
  roleArchetype: 'Role',
  locale: 'Locale',
  difficulty: 'Lure difficulty',
};

export function dimensionLabel(d: CohortDimension): string {
  return DIMENSION_LABEL[d];
}

/**
 * Per-cohort aggregates, ready for the k-anonymity guard.
 *
 * Note what this does NOT return: a participant id, a name, or anything that
 * could be joined back to one. The guard that follows refuses small cohorts,
 * but the query itself already cannot produce an individual.
 */
export async function cohortRows(
  campaignId: string,
  dimension: CohortDimension = 'department',
): Promise<CohortRow[]> {
  const assignments = await prisma.assignment.findMany({
    where: { campaignId },
    include: {
      participant: { select: { department: true, roleArchetype: true, locale: true } },
      events: { select: { type: true, actorClass: true } },
      template: { select: { difficulty: true } },
    },
  });

  const keyOf = (a: (typeof assignments)[number]): string => {
    switch (dimension) {
      case 'department':
        return a.participant.department;
      case 'roleArchetype':
        return a.participant.roleArchetype;
      case 'locale':
        return a.participant.locale;
      case 'difficulty':
        return a.template.difficulty;
      default:
        return 'unknown';
    }
  };

  const byKey = new Map<string, CohortRow>();
  for (const a of assignments) {
    const label = keyOf(a);
    const row =
      byKey.get(label) ??
      ({
        key: label.toLowerCase().replace(/\s+/g, '-'),
        label,
        cohortSize: 0,
        delivered: 0,
        failures: 0,
        reports: 0,
        machineFiltered: 0,
      } satisfies CohortRow);

    const types = new Set(a.events.map((e) => e.type));
    row.cohortSize += 1;
    if (a.state === 'SENT') row.delivered += 1;
    if (
      types.has(EventType.CLICK_CONFIRMED) ||
      types.has(EventType.SUBMIT_INTENT) ||
      types.has(EventType.QR_SCAN)
    ) {
      row.failures += 1;
    }
    if (types.has(EventType.REPORTED)) row.reports += 1;
    row.machineFiltered += a.events.filter(
      (e) => e.type === EventType.PROBABLE_OPEN && e.actorClass === ActorClass.MACHINE,
    ).length;

    byKey.set(label, row);
  }

  return [...byKey.values()].sort((a, b) => b.cohortSize - a.cohortSize);
}

export interface CampaignReport {
  id: string;
  name: string;
  status: string;
  windowStart: string;
  windowEnd: string;
  approvals: number;
  killSwitch: boolean;
  templateCount: number;
  participantCount: number;
  metrics: ReturnType<typeof computeMetrics>;
  holdout: ReturnType<typeof holdoutEffect>;
}

export async function campaignReport(campaignId: string): Promise<CampaignReport | null> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: { grant: { include: { approvals: true } } },
  });
  if (!campaign) return null;

  const outcomes = await campaignOutcomes(campaignId);
  const participantCount = await prisma.assignment.count({ where: { campaignId } });

  return {
    id: campaign.id,
    name: campaign.name,
    status: campaign.status,
    windowStart: campaign.windowStart.toISOString(),
    windowEnd: campaign.windowEnd.toISOString(),
    approvals: campaign.grant?.approvals.length ?? 0,
    killSwitch: campaign.killSwitch,
    templateCount: JSON.parse(campaign.templateIdsJson || '[]').length,
    participantCount,
    metrics: computeMetrics(outcomes),
    holdout: holdoutEffect(outcomes),
  };
}

export interface TrendPoint {
  campaignId: string;
  name: string;
  at: string;
  delivered: number;
  reportRate: number;
  failureRate: number;
  difficultyAdjustedFailureRate: number;
  resilienceRatio: number;
  medianTimeToReportMs: number | null;
  significant: boolean;
  verdict: string;
}

/**
 * The programme trend across completed campaigns.
 *
 * Report rate is listed before failure rate deliberately. It is the leading
 * indicator — the literature expects reporting to improve before susceptibility
 * moves — and putting it first is what stops a programme being managed on the
 * click number.
 */
export async function programmeTrend(orgId: string): Promise<TrendPoint[]> {
  const campaigns = await prisma.campaign.findMany({
    where: { orgId, status: CampaignStatus.COMPLETE },
    orderBy: { windowStart: 'asc' },
    select: { id: true, name: true, windowStart: true },
  });

  const out: TrendPoint[] = [];
  for (const c of campaigns) {
    const outcomes = await campaignOutcomes(c.id);
    const m = computeMetrics(outcomes);
    const h = holdoutEffect(outcomes);
    out.push({
      campaignId: c.id,
      name: c.name,
      at: c.windowStart.toISOString(),
      delivered: m.delivered,
      reportRate: m.reportRate,
      failureRate: m.failureRate,
      difficultyAdjustedFailureRate: m.difficultyAdjustedFailureRate,
      resilienceRatio: m.resilienceRatio,
      medianTimeToReportMs: m.medianTimeToReportMs,
      significant: h.significant,
      verdict: h.verdict,
    });
  }
  return out;
}

export interface SafetyPosture {
  attestationVerdict: string | null;
  attestationAt: string | null;
  templatesTotal: number;
  templatesBlocked: number;
  templatesFailingLint: number;
  auditEntries: number;
  domainsVerified: number;
  suppressions: number;
  optedOut: number;
  participants: number;
  mode: string;
}

export async function safetyPosture(orgId: string): Promise<SafetyPosture> {
  const [
    attestation,
    templatesTotal,
    templatesBlocked,
    templatesFailingLint,
    auditEntries,
    domainsVerified,
    suppressions,
    optedOut,
    participants,
  ] = await Promise.all([
    prisma.safetyAttestation.findFirst({ orderBy: { createdAt: 'desc' } }),
    prisma.template.count({ where: { orgId } }),
    prisma.template.count({ where: { orgId, ethicsStatus: 'BLOCKED' } }),
    prisma.template.count({ where: { orgId, lintStatus: 'FAIL' } }),
    prisma.auditEntry.count({ where: { orgId } }),
    prisma.approvedDomain.count({ where: { orgId, verifiedAt: { not: null } } }),
    prisma.suppression.count({ where: { orgId } }),
    prisma.participant.count({ where: { orgId, optedOutAt: { not: null } } }),
    prisma.participant.count({ where: { orgId } }),
  ]);

  let verdict: string | null = null;
  if (attestation) {
    try {
      verdict = (JSON.parse(attestation.documentJson) as { summary: { verdict: string } }).summary
        .verdict;
    } catch {
      verdict = null;
    }
  }

  return {
    attestationVerdict: verdict,
    attestationAt: attestation?.createdAt.toISOString() ?? null,
    templatesTotal,
    templatesBlocked,
    templatesFailingLint,
    auditEntries,
    domainsVerified,
    suppressions,
    optedOut,
    participants,
    mode: process.env.CHETNA_MODE === 'live' ? 'live' : 'offline',
  };
}

/** Difficulty mix across a campaign's templates, for the awareness report. */
export async function difficultyMix(campaignId: string): Promise<Record<string, number>> {
  const rows = await prisma.assignment.findMany({
    where: { campaignId },
    select: { template: { select: { difficulty: true } } },
  });
  const mix: Record<string, number> = {};
  for (const r of rows) {
    const d = r.template.difficulty as Difficulty;
    mix[d] = (mix[d] ?? 0) + 1;
  }
  return mix;
}

export type { AssignmentOutcome };
export { isFailure };
