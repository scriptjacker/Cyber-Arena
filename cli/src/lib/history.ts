import {
  ActorClass,
  Arm,
  AssignmentState,
  CampaignStatus,
  EventType,
  IpClass,
  newId,
  newToken,
  Role,
  RunMode,
  Verdict,
} from '@chetna/core';
import { auditRepo, prisma, writeJson } from '@chetna/db';
import { Rng } from './rng';

const DAY = 86_400_000;

/**
 * Synthesise a COMPLETED campaign and its telemetry.
 *
 * Rates are realised as EXACT COUNTS rather than per-person coin flips, so the
 * dashboard shows the same numbers on every machine and every run. A rehearsed
 * demo whose figures drift between run-throughs is how teams end up narrating
 * numbers that are not on the screen.
 */
export interface CompletedCampaignSpec {
  id: string;
  name: string;
  daysAgo: number;
  templateIds: string[];
  /** Exact failure rate realised in each arm. */
  failureRateTreatment: number;
  failureRateHoldout: number;
  /** Share of recipients who report. */
  reportRate: number;
  /** Share whose pixel loads at all (humans). */
  humanOpenRate: number;
  /** Share whose pixel is fetched by a gateway or Apple MPP. */
  machineOpenRate: number;
  /** Share with a link visit that no human interaction ever confirmed. */
  unconfirmedClickRate: number;
  holdoutPct: number;
  seed: string;
  /** Create SOC triage rows for this campaign's reporters. */
  createTriage: boolean;
}

export interface CampaignHistoryResult {
  campaignId: string;
  delivered: number;
  failures: number;
  reports: number;
  treatmentFailures: number;
  treatmentN: number;
  holdoutFailures: number;
  holdoutN: number;
}

interface Person {
  id: string;
  department: string;
}

/**
 * Time-to-report distribution.
 *
 * Skewed, not uniform: most people who report do so within the first twenty
 * minutes, and a minority much later. A uniform draw produces a median around
 * 45 minutes, which is both unrealistic and conveniently flattering next to the
 * DBIR-reported 28-minute benchmark — so it is worth getting right.
 */
function reportDelayMs(rng: Rng): number {
  if (rng.chance(0.62)) return rng.int(90, 1_200) * 1000; // 1.5–20 min
  if (rng.chance(0.7)) return rng.int(1_200, 3_000) * 1000; // 20–50 min
  return rng.int(3_000, 14_400) * 1000; // up to 4 hours
}

export async function generateCompletedCampaign(args: {
  orgId: string;
  spec: CompletedCampaignSpec;
  people: Person[];
  rosterImportId: string;
  now: Date;
  signCampaign: (campaignId: string, signedAt: Date) => Promise<void>;
}): Promise<CampaignHistoryResult> {
  const { orgId, spec, people, rosterImportId, now, signCampaign } = args;
  const rng = new Rng(hashSeed(spec.seed));
  const sentAt = new Date(now.getTime() - spec.daysAgo * DAY);

  await prisma.campaign.create({
    data: {
      id: spec.id,
      orgId,
      name: spec.name,
      status: CampaignStatus.AUTHORIZED,
      mode: RunMode.OFFLINE,
      windowStart: sentAt,
      windowEnd: new Date(sentAt.getTime() + 8 * 3_600_000),
      timezone: 'Asia/Kolkata',
      senderDomain: 'nimbus-courier.test',
      landingDomain: 'sso.nimbus-portal.test',
      recipientDomainsJson: writeJson(['nimbus.test']),
      templateIdsJson: writeJson(spec.templateIds),
      rosterImportId,
      holdoutPct: spec.holdoutPct,
      randomSeed: spec.seed,
      rateLimitPerHour: 500,
      killSwitch: false,
      createdById: 'usr_security',
      createdAt: new Date(sentAt.getTime() - 2 * DAY),
    },
  });

  await auditRepo.append({
    orgId,
    actorId: 'usr_security',
    actorRole: Role.SECURITY_ADMIN,
    action: 'campaign.created',
    payload: { campaignId: spec.id, templateIds: spec.templateIds },
  });

  // Sign BEFORE any assignment exists, exactly as the real flow does: the scope
  // covers the roster, not the assignments derived from it.
  await signCampaign(spec.id, new Date(sentAt.getTime() - DAY));

  // --------------------------------------------- stratified arm assignment
  const byDept = new Map<string, Person[]>();
  for (const p of people) {
    const list = byDept.get(p.department) ?? [];
    list.push(p);
    byDept.set(p.department, list);
  }

  interface Slot {
    person: Person;
    arm: string;
    stratum: string;
    templateId: string;
  }
  const slots: Slot[] = [];
  let i = 0;
  for (const [dept, members] of [...byDept.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const shuffled = rng.shuffle(members);
    const holdoutCount = Math.round((spec.holdoutPct / 100) * shuffled.length);
    shuffled.forEach((person, idx) => {
      slots.push({
        person,
        arm: idx < holdoutCount ? Arm.HOLDOUT : Arm.TREATMENT,
        stratum: dept,
        templateId: spec.templateIds[i % spec.templateIds.length],
      });
      i++;
    });
  }

  // --------------------------------------------- realise exact outcomes
  //
  // Failures are weighted towards HARDER templates, because that is what
  // happens in reality — and because uniformly distributed failures would make
  // the difficulty-adjusted rate identical to the raw rate, hiding the very
  // thing the adjustment exists to show.
  const templateRows = await prisma.template.findMany({
    where: { id: { in: spec.templateIds } },
    select: { id: true, difficulty: true },
  });
  const difficultyById = new Map(templateRows.map((t) => [t.id, t.difficulty]));
  const FAILURE_PROPENSITY: Record<string, number> = {
    VERY_HIGH: 3,
    HIGH: 2,
    MODERATE: 1,
    LOW: 0.6,
    VERY_LOW: 0.35,
  };
  const propensity = (slot: Slot) =>
    (FAILURE_PROPENSITY[difficultyById.get(slot.templateId) ?? 'MODERATE'] ?? 1) *
    (0.5 + rng.float());

  const byPropensity = (list: Slot[]) =>
    [...list].sort((a, b) => propensity(b) - propensity(a));

  const treatment = byPropensity(slots.filter((s) => s.arm === Arm.TREATMENT));
  const holdout = byPropensity(slots.filter((s) => s.arm === Arm.HOLDOUT));

  const failTreatment = Math.round(spec.failureRateTreatment * treatment.length);
  const failHoldout = Math.round(spec.failureRateHoldout * holdout.length);

  const failed = new Set<Slot>([
    ...treatment.slice(0, failTreatment),
    ...holdout.slice(0, failHoldout),
  ]);

  const nonFailed = rng.shuffle(slots.filter((s) => !failed.has(s)));
  const reportTarget = Math.round(spec.reportRate * slots.length);
  // Someone who clicked can still report afterwards, but most reporters are
  // people who spotted it — so reports are drawn mostly from the non-failures.
  const reporters = new Set<Slot>(nonFailed.slice(0, Math.max(0, reportTarget - 2)));
  for (const s of rng.shuffle([...failed]).slice(0, 2)) reporters.add(s);

  const openTarget = Math.round(spec.humanOpenRate * slots.length);
  const humanOpens = new Set<Slot>(failed); // a failure implies an open
  for (const s of nonFailed) {
    if (humanOpens.size >= openTarget) break;
    humanOpens.add(s);
  }

  const machineOpens = new Set<Slot>(
    rng.shuffle(slots).slice(0, Math.round(spec.machineOpenRate * slots.length)),
  );
  const unconfirmedOnly = new Set<Slot>(
    rng
      .shuffle(slots.filter((s) => !failed.has(s)))
      .slice(0, Math.round(spec.unconfirmedClickRate * slots.length)),
  );

  const SCANNER_UAS = ['gateway-proofpoint', 'apple-mail', 'ms-link-discovery', 'google-image-proxy'];
  const reporterRows: { participantId: string; at: Date; ms: number }[] = [];

  let slotIndex = 0;
  for (const slot of slots) {
    const assignmentId = newId('asg');
    const sent = new Date(sentAt.getTime() + slotIndex * 4_000);
    slotIndex++;

    await prisma.assignment.create({
      data: {
        id: assignmentId,
        campaignId: spec.id,
        participantId: slot.person.id,
        templateId: slot.templateId,
        arm: slot.arm,
        stratum: slot.stratum,
        token: newToken(),
        sendAt: sent,
        state: AssignmentState.SENT,
        sentAt: sent,
        messageId: `<${newId('msg')}@nimbus-courier.test>`,
      },
    });

    const events: {
      type: string;
      at: Date;
      actorClass: string;
      machineScore: number;
      uaFamily?: string;
      ipClass?: string;
      meta?: unknown;
    }[] = [{ type: EventType.SENT, at: sent, actorClass: ActorClass.UNKNOWN, machineScore: 0 }];

    if (machineOpens.has(slot)) {
      events.push({
        type: EventType.PROBABLE_OPEN,
        at: new Date(sent.getTime() + rng.int(200, 1800)),
        actorClass: ActorClass.MACHINE,
        machineScore: 0.9,
        uaFamily: rng.pick(SCANNER_UAS),
        ipClass: IpClass.OTHER,
      });
    }

    const openAt = new Date(sent.getTime() + rng.int(6, 180) * 60_000);
    if (humanOpens.has(slot)) {
      events.push({
        type: EventType.PROBABLE_OPEN,
        at: openAt,
        actorClass: ActorClass.HUMAN,
        machineScore: 0,
        uaFamily: rng.pick(['windows', 'ios', 'android', 'macos']),
        ipClass: IpClass.PRIVATE,
      });
    }

    // A link visit with no interaction beacon. Counted and displayed, but NOT
    // counted as a failure — this is the honest-telemetry point made visible.
    if (unconfirmedOnly.has(slot)) {
      events.push({
        type: EventType.CLICK_UNCONFIRMED,
        at: new Date(sent.getTime() + rng.int(2, 40) * 1000),
        actorClass: ActorClass.MACHINE,
        machineScore: 0.6,
        uaFamily: rng.pick(['gateway-mimecast', 'ms-link-discovery', 'script-client']),
        ipClass: IpClass.OTHER,
      });
    }

    if (failed.has(slot)) {
      const clickAt = new Date(openAt.getTime() + rng.int(3, 90) * 1000);
      events.push(
        {
          type: EventType.CLICK_UNCONFIRMED,
          at: clickAt,
          actorClass: ActorClass.UNKNOWN,
          machineScore: 0.1,
        },
        {
          type: EventType.CLICK_CONFIRMED,
          at: new Date(clickAt.getTime() + 1400),
          actorClass: ActorClass.HUMAN,
          machineScore: 0,
          uaFamily: 'windows',
          ipClass: IpClass.PRIVATE,
        },
        {
          type: EventType.DECOY_VIEW,
          at: new Date(clickAt.getTime() + 2600),
          actorClass: ActorClass.HUMAN,
          machineScore: 0,
        },
      );
      if (rng.chance(0.45)) {
        events.push({
          type: EventType.SUBMIT_INTENT,
          at: new Date(clickAt.getTime() + 9_000),
          actorClass: ActorClass.HUMAN,
          machineScore: 0,
        });
      }

      // Engagement modelled on the UCSD finding: three quarters of people give
      // embedded training under a minute, and only about half finish it.
      if (rng.chance(0.9)) {
        const trainAt = new Date(clickAt.getTime() + 12_000);
        const dwellMs = rng.chance(0.75) ? rng.int(4_000, 58_000) : rng.int(60_000, 240_000);
        events.push({
          type: EventType.TRAINING_START,
          at: trainAt,
          actorClass: ActorClass.HUMAN,
          machineScore: 0,
          meta: { moduleSlug: 'read-the-domain' },
        });
        if (rng.chance(0.56)) {
          events.push({
            type: EventType.TRAINING_COMPLETE,
            at: new Date(trainAt.getTime() + dwellMs),
            actorClass: ActorClass.HUMAN,
            machineScore: 0,
            meta: { moduleSlug: 'read-the-domain', dwellMs },
          });
          events.push({
            type: rng.chance(0.78) ? EventType.DRILL_PASS : EventType.DRILL_FAIL,
            at: new Date(trainAt.getTime() + dwellMs + 6_000),
            actorClass: ActorClass.HUMAN,
            machineScore: 0,
            meta: { moduleSlug: 'read-the-domain', drillScore: rng.int(60, 100) },
          });
        }
      }
    }

    if (reporters.has(slot)) {
      const ms = reportDelayMs(rng);
      const at = new Date(sent.getTime() + ms);
      events.push({ type: EventType.REPORTED, at, actorClass: ActorClass.HUMAN, machineScore: 0 });
      reporterRows.push({ participantId: slot.person.id, at, ms });
    }

    for (const e of events) {
      await prisma.event.create({
        data: {
          id: newId('ev'),
          assignmentId,
          type: e.type,
          at: e.at,
          actorClass: e.actorClass,
          machineScore: e.machineScore,
          uaFamily: e.uaFamily ?? null,
          ipClass: e.ipClass ?? null,
          metaJson: writeJson(e.meta ?? {}),
        },
      });
    }
  }

  // ------------------------------------------------------- SOC triage
  if (spec.createTriage) {
    const threats = await prisma.seededThreat.findMany({ where: { orgId } });
    for (const r of reporterRows.slice(0, 44)) {
      await prisma.reportTriage.create({
        data: {
          id: newId('rep'),
          orgId,
          reportedById: r.participantId,
          campaignId: spec.id,
          verdict: Verdict.SIMULATION,
          clusterKey: 'sim:courier-customs',
          firstReportAt: r.at,
          timeToReportMs: r.ms,
          analystId: 'usr_security',
          reviewedAt: new Date(r.at.getTime() + 20 * 60_000),
        },
      });
    }
    // Three reports of a GENUINE campaign, so the triage console demonstrates
    // the crowd-sourced-detection finding rather than only simulation traffic.
    if (threats[0]) {
      for (const r of reporterRows.slice(44, 47)) {
        await prisma.reportTriage.create({
          data: {
            id: newId('rep'),
            orgId,
            reportedById: r.participantId,
            seededThreatId: threats[0].id,
            verdict: Verdict.REAL_THREAT,
            clusterKey: 'real:mailbox-quota',
            firstReportAt: r.at,
            timeToReportMs: r.ms,
            analystId: 'usr_security',
            reviewedAt: new Date(r.at.getTime() + 11 * 60_000),
          },
        });
      }
    }
  }

  await prisma.campaign.update({
    where: { id: spec.id },
    data: { status: CampaignStatus.COMPLETE },
  });
  await auditRepo.append({
    orgId,
    actorId: 'usr_security',
    actorRole: Role.SECURITY_ADMIN,
    action: 'campaign.completed',
    payload: {
      campaignId: spec.id,
      delivered: slots.length,
      failures: failed.size,
      reports: reporters.size,
    },
  });

  return {
    campaignId: spec.id,
    delivered: slots.length,
    failures: failed.size,
    reports: reporters.size,
    treatmentFailures: failTreatment,
    treatmentN: treatment.length,
    holdoutFailures: failHoldout,
    holdoutN: holdout.length,
  };
}

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * The two completed campaigns the demo opens with.
 *
 * The pilot deliberately produces a result that is NOT statistically
 * significant, and Q1 produces one that is. Together they make the point that
 * the statistic is not rigged in either direction: the platform reports what
 * the data support, and the report rate climbing from 12% to 24% across the two
 * is the leading indicator the literature says to expect first.
 */
export const COMPLETED_CAMPAIGNS: CompletedCampaignSpec[] = [
  {
    id: 'cmp_q0_pilot',
    name: 'Pilot — first exercise (no measurable effect)',
    daysAgo: 96,
    templateIds: ['tpl_obvious-prize', 'tpl_password-expiry'],
    failureRateTreatment: 0.11,
    failureRateHoldout: 0.13,
    reportRate: 0.12,
    humanOpenRate: 0.52,
    machineOpenRate: 0.14,
    unconfirmedClickRate: 0.05,
    holdoutPct: 20,
    seed: 'pilot-2025-12',
    createTriage: false,
  },
  {
    id: 'cmp_q1_baseline',
    name: 'Q1 baseline — mixed difficulty',
    daysAgo: 45,
    templateIds: ['tpl_courier-customs', 'tpl_password-expiry', 'tpl_doc-share'],
    failureRateTreatment: 0.078,
    failureRateHoldout: 0.191,
    reportRate: 0.24,
    humanOpenRate: 0.58,
    machineOpenRate: 0.16,
    unconfirmedClickRate: 0.07,
    holdoutPct: 20,
    seed: 'q1-baseline-2026-02',
    createTriage: true,
  },
];
