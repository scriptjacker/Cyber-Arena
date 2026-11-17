import {
  ActorClass,
  AssignmentState,
  EventType,
  InteractBodySchema,
  IntentBodySchema,
  isValidToken,
  TrainingBodySchema,
  type EventMeta,
  type IpClass,
} from '@chetna/core';
import { eventsRepo, prisma } from '@chetna/db';
import { assessMachine, classifyIp, uaFamily } from '@chetna/scoring';

/**
 * Telemetry for the simulation surface.
 *
 * Two rules govern everything in this file:
 *
 *  1. Nothing a person types is accepted, anywhere. The request schemas are
 *     allowlists and `.strict()`, and the intent endpoint's schema is an EMPTY
 *     strict object — it records THAT someone would have proceeded, never what
 *     they would have typed.
 *  2. No raw identifier is stored. The IP address is reduced to a class
 *     (loopback / private / scanner / other) and the user agent to a family
 *     ("windows", "gateway-proofpoint"). Neither can re-identify a person, and
 *     both are erased after 30 days by the retention job.
 */

export interface RequestFacts {
  userAgent: string | undefined;
  ipClass: IpClass;
  secFetchMode: string | undefined;
}

export function requestFacts(req: Request): RequestFacts {
  const h = req.headers;
  const forwarded = h.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0]?.trim() : undefined;
  return {
    userAgent: h.get('user-agent') ?? undefined,
    ipClass: classifyIp(ip),
    secFetchMode: h.get('sec-fetch-mode') ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

/**
 * Per-process fixed-window limiter. Sufficient for a single-node deployment and
 * for the offline demo; a multi-node deployment needs a shared counter, which
 * is a named roadmap item rather than a pretence.
 */
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 240;
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimited(key: string): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  bucket.count += 1;
  if (buckets.size > 10_000) {
    for (const [k, v] of buckets) if (v.resetAt < now) buckets.delete(k);
  }
  return bucket.count > MAX_PER_WINDOW;
}

export function rateKey(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
}

// ---------------------------------------------------------------------------
// Token resolution
// ---------------------------------------------------------------------------

export type Resolved = NonNullable<Awaited<ReturnType<typeof resolveToken>>>;

/**
 * Resolve an opaque token to its assignment.
 *
 * Only assignments that were actually SENT can be interacted with: a token for
 * a queued or blocked assignment resolves to nothing, so a leaked or guessed
 * token cannot manufacture telemetry for a message nobody received.
 */
export async function resolveToken(token: string) {
  if (!isValidToken(token)) return null;
  const assignment = await prisma.assignment.findUnique({
    where: { token },
    include: {
      template: true,
      participant: {
        select: {
          id: true,
          pid: true,
          displayName: true,
          department: true,
          optedOutAt: true,
        },
      },
      campaign: { select: { id: true, name: true, orgId: true, status: true } },
    },
  });
  if (!assignment) return null;
  if (assignment.state !== AssignmentState.SENT) return null;
  return assignment;
}

async function sentAt(assignmentId: string): Promise<Date | null> {
  const row = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    select: { sentAt: true },
  });
  return row?.sentAt ?? null;
}

async function hasEvent(assignmentId: string, type: EventType): Promise<boolean> {
  return (await prisma.event.count({ where: { assignmentId, type } })) > 0;
}

// ---------------------------------------------------------------------------
// Recording
// ---------------------------------------------------------------------------

/**
 * A pixel load. Recorded as PROBABLE_OPEN, never as "opened".
 *
 * Apple Mail Privacy Protection prefetches through a proxy and secure email
 * gateways fetch everything, so a pixel load is weak evidence on its own. We
 * score how machine-like the request was, classify it, and exclude machine
 * traffic from every human metric — while publishing the filtered count rather
 * than quietly dropping it.
 */
export async function recordOpen(token: string, req: Request): Promise<void> {
  const assignment = await resolveToken(token);
  if (!assignment) return;

  const facts = requestFacts(req);
  const sent = assignment.sentAt ?? (await sentAt(assignment.id));
  const msSinceSent = sent ? Date.now() - sent.getTime() : undefined;
  const hadLaterInteraction = await hasEvent(assignment.id, EventType.CLICK_CONFIRMED);

  const assessment = assessMachine({
    ...(msSinceSent !== undefined ? { msSinceSent } : {}),
    ...(facts.userAgent ? { userAgent: facts.userAgent } : {}),
    ipClass: facts.ipClass,
    ...(facts.secFetchMode ? { secFetchMode: facts.secFetchMode } : {}),
    hadLaterInteraction,
  });

  await eventsRepo.append({
    assignmentId: assignment.id,
    type: EventType.PROBABLE_OPEN,
    at: new Date().toISOString(),
    actorClass: assessment.actorClass,
    machineScore: assessment.score,
    uaFamily: assessment.uaFamily,
    ipClass: facts.ipClass,
  });
}

/** A link visit. Unconfirmed until a human-interaction beacon arrives. */
export async function recordClick(
  token: string,
  req: Request,
  type: EventType = EventType.CLICK_UNCONFIRMED,
): Promise<Resolved | null> {
  const assignment = await resolveToken(token);
  if (!assignment) return null;
  if (await hasEvent(assignment.id, type)) return assignment;

  const facts = requestFacts(req);
  const family = uaFamily(facts.userAgent);

  await eventsRepo.append({
    assignmentId: assignment.id,
    type,
    at: new Date().toISOString(),
    actorClass: ActorClass.UNKNOWN,
    machineScore: 0.1,
    uaFamily: family,
    ipClass: facts.ipClass,
  });
  return assignment;
}

/**
 * The interaction beacon. Promotes a click to CLICK_CONFIRMED, which is the
 * only click that counts as a human failure.
 */
export async function confirmClick(token: string, body: unknown, req: Request): Promise<boolean> {
  const parsed = InteractBodySchema.safeParse(body);
  if (!parsed.success) return false;
  const assignment = await resolveToken(token);
  if (!assignment) return false;
  if (await hasEvent(assignment.id, EventType.CLICK_CONFIRMED)) return true;

  const facts = requestFacts(req);
  await eventsRepo.append({
    assignmentId: assignment.id,
    type: EventType.CLICK_CONFIRMED,
    at: new Date().toISOString(),
    actorClass: ActorClass.HUMAN,
    machineScore: 0,
    uaFamily: uaFamily(facts.userAgent),
    ipClass: facts.ipClass,
    meta: { dwellMs: parsed.data.dwellMs },
  });
  await updateRating(assignment.id, 'FAILED');
  return true;
}

/**
 * The decoy sign-in was pressed.
 *
 * The panel contains NO input of any kind — no password field, no named input,
 * nothing to type into. So this records a willingness to proceed to a sign-in
 * page, not a submitted credential.
 *
 * Stated plainly because it matters for reading the numbers: because the panel
 * asks for nothing, an attentive person may stop here where a real attack
 * (which would show real fields) might have caught them. This measure therefore
 * UNDER-counts relative to a live attack. We would rather under-count than hold
 * a secret.
 */
export async function recordIntent(token: string, body: unknown): Promise<boolean> {
  // An empty strict schema: any field at all is rejected outright.
  if (!IntentBodySchema.safeParse(body ?? {}).success) return false;
  const assignment = await resolveToken(token);
  if (!assignment) return false;
  if (await hasEvent(assignment.id, EventType.SUBMIT_INTENT)) return true;

  await eventsRepo.append({
    assignmentId: assignment.id,
    type: EventType.SUBMIT_INTENT,
    at: new Date().toISOString(),
    actorClass: ActorClass.HUMAN,
    machineScore: 0,
  });
  return true;
}

export async function recordDecoyView(token: string): Promise<void> {
  const assignment = await resolveToken(token);
  if (!assignment) return;
  if (await hasEvent(assignment.id, EventType.DECOY_VIEW)) return;
  await eventsRepo.appendSimple(assignment.id, EventType.DECOY_VIEW);
}

export async function recordQrScan(token: string, req: Request): Promise<Resolved | null> {
  return recordClick(token, req, EventType.QR_SCAN);
}

/**
 * A report. This is the behaviour the whole platform exists to increase, so it
 * is recorded, timed, pushed into the triage queue, and rewarded with a thank
 * you rather than a score.
 */
export async function recordReport(
  token: string,
): Promise<{ assignment: Resolved; timeToReportMs: number | null; rank: number } | null> {
  const assignment = await resolveToken(token);
  if (!assignment) return null;

  const existing = await prisma.event.findFirst({
    where: { assignmentId: assignment.id, type: EventType.REPORTED },
  });
  const sent = assignment.sentAt ?? (await sentAt(assignment.id));
  const now = new Date();
  const timeToReportMs = sent ? now.getTime() - sent.getTime() : null;

  if (!existing) {
    await eventsRepo.appendSimple(assignment.id, EventType.REPORTED, undefined, now);
    await prisma.reportTriage.create({
      data: {
        id: `rep_${assignment.id}`,
        orgId: assignment.campaign.orgId,
        reportedById: assignment.participant.id,
        campaignId: assignment.campaign.id,
        assignmentId: assignment.id,
        verdict: 'UNREVIEWED',
        clusterKey: `sim:${assignment.template.id}`,
        firstReportAt: now,
        timeToReportMs,
      },
    });
    await prisma.message.updateMany({
      where: { assignmentId: assignment.id },
      data: { reportedAt: now },
    });
    await updateRating(assignment.id, 'REPORTED');
  }

  // "You are the Nth person to report this" — a true statement that makes the
  // reporter feel part of a sensor network rather than a test subject.
  const rank = await prisma.reportTriage.count({
    where: { clusterKey: `sim:${assignment.template.id}` },
  });

  return { assignment, timeToReportMs, rank };
}

export async function recordTraining(token: string, body: unknown): Promise<boolean> {
  const parsed = TrainingBodySchema.safeParse(body);
  if (!parsed.success) return false;
  const assignment = await resolveToken(token);
  if (!assignment) return false;

  const { event, moduleSlug, dwellMs, drillScore } = parsed.data;
  const meta: EventMeta = {
    moduleSlug,
    dwellMs,
    ...(drillScore !== undefined ? { drillScore } : {}),
  };
  await eventsRepo.appendSimple(assignment.id, event as EventType, meta);

  // Completion is what the evidence says correlates with improvement, so it is
  // tracked per module rather than inferred from a page view.
  const module = await prisma.module.findUnique({ where: { slug: moduleSlug } });
  if (module) {
    const completed = event === EventType.TRAINING_COMPLETE || event === EventType.DRILL_PASS;
    await prisma.progress.upsert({
      where: {
        participantId_moduleId: {
          participantId: assignment.participant.id,
          moduleId: module.id,
        },
      },
      create: {
        id: `prg_${assignment.participant.id}_${module.id}`.slice(0, 60),
        participantId: assignment.participant.id,
        moduleId: module.id,
        dwellMs,
        ...(completed ? { completedAt: new Date() } : {}),
        ...(drillScore !== undefined ? { drillScore } : {}),
      },
      update: {
        dwellMs,
        ...(completed ? { completedAt: new Date() } : {}),
        ...(drillScore !== undefined ? { drillScore } : {}),
      },
    });
  }
  return true;
}

/**
 * Update the participant's private resilience rating.
 *
 * Elo-style against the template's difficulty, so spotting a hard lure counts
 * for more than spotting an obvious one, and failing a near-undetectable lure
 * costs almost nothing. The number is never shown to anyone but the
 * participant.
 */
async function updateRating(assignmentId: string, outcome: 'REPORTED' | 'FAILED'): Promise<void> {
  const { updateRating: compute } = await import('@chetna/scoring');
  const assignment = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    include: {
      participant: { select: { id: true, resilienceRating: true } },
      template: { select: { difficulty: true } },
    },
  });
  if (!assignment) return;
  const next = compute(
    assignment.participant.resilienceRating,
    assignment.template.difficulty as never,
    outcome,
  );
  await prisma.participant.update({
    where: { id: assignment.participant.id },
    data: { resilienceRating: next },
  });
}

/** A 1×1 transparent GIF. The smallest honest tracking pixel there is. */
export const PIXEL = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64',
);
