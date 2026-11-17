import {
  ActorClass,
  EventType,
  newId,
  type Difficulty,
  type EventInput,
  type EventMeta,
} from '@chetna/core';
import type { AssignmentOutcome } from '@chetna/scoring';
import { prisma } from '../client';
import { writeEventMeta } from '../json';

/**
 * Telemetry writes.
 *
 * Append-only by design: no update, no delete. What is recorded is an event
 * type, a timestamp, a machine-likelihood classification, a user-agent FAMILY
 * and an IP CLASS. Never a raw address, never a full user agent, and never
 * anything a person typed.
 */
export async function append(input: EventInput): Promise<void> {
  await prisma.event.create({
    data: {
      id: newId('ev'),
      assignmentId: input.assignmentId,
      type: input.type,
      at: new Date(input.at),
      actorClass: input.actorClass,
      machineScore: input.machineScore,
      uaFamily: input.uaFamily ?? null,
      ipClass: input.ipClass ?? null,
      metaJson: writeEventMeta(input.meta),
    },
  });
}

export async function appendSimple(
  assignmentId: string,
  type: EventType,
  meta?: EventMeta,
  at: Date = new Date(),
): Promise<void> {
  await append({
    assignmentId,
    type,
    at: at.toISOString(),
    actorClass: ActorClass.HUMAN,
    machineScore: 0,
    ...(meta ? { meta } : {}),
  });
}

export async function has(assignmentId: string, type: EventType): Promise<boolean> {
  return (await prisma.event.count({ where: { assignmentId, type } })) > 0;
}

export async function firstOf(assignmentId: string, type: EventType) {
  return prisma.event.findFirst({ where: { assignmentId, type }, orderBy: { at: 'asc' } });
}

export async function timeline(assignmentId: string) {
  return prisma.event.findMany({ where: { assignmentId }, orderBy: { at: 'asc' } });
}

/**
 * Flatten every assignment in a campaign into the one row per person that the
 * scoring package consumes.
 *
 * The important line is `machineFiltered`: a PROBABLE_OPEN whose actorClass is
 * MACHINE never counts as a human open, and a click only counts as a failure
 * once a human-interaction beacon has confirmed it.
 */
export async function campaignOutcomes(campaignId: string): Promise<AssignmentOutcome[]> {
  const assignments = await prisma.assignment.findMany({
    where: { campaignId },
    include: {
      events: { orderBy: { at: 'asc' } },
      template: { select: { difficulty: true } },
    },
  });

  return assignments.map((a) => {
    const types = new Set(a.events.map((e) => e.type));
    const sentAt = a.sentAt ?? a.events.find((e) => e.type === EventType.SENT)?.at ?? null;
    const reported = a.events.find((e) => e.type === EventType.REPORTED);
    const opens = a.events.filter((e) => e.type === EventType.PROBABLE_OPEN);
    const humanOpen = opens.some((e) => e.actorClass !== ActorClass.MACHINE);

    return {
      assignmentId: a.id,
      arm: a.arm as AssignmentOutcome['arm'],
      difficulty: a.template.difficulty as Difficulty,
      delivered: a.state === 'SENT',
      probableOpen: opens.length > 0,
      machineFiltered: opens.length > 0 && !humanOpen,
      clickUnconfirmed: types.has(EventType.CLICK_UNCONFIRMED),
      clickConfirmed: types.has(EventType.CLICK_CONFIRMED),
      submitIntent: types.has(EventType.SUBMIT_INTENT),
      qrScan: types.has(EventType.QR_SCAN),
      reported: Boolean(reported),
      timeToReportMs:
        reported && sentAt ? reported.at.getTime() - new Date(sentAt).getTime() : null,
      trainingCompleted: types.has(EventType.TRAINING_COMPLETE),
    };
  });
}

/** Counts for the honest-telemetry tile on the dashboard. */
export async function machineFilteredCount(campaignId: string): Promise<number> {
  return prisma.event.count({
    where: {
      type: EventType.PROBABLE_OPEN,
      actorClass: ActorClass.MACHINE,
      assignment: { campaignId },
    },
  });
}
