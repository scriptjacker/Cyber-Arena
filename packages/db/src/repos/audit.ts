import {
  type AuditEntryInput,
  type AuditEntryRecord,
  type ChainVerification,
  type ReasonCode,
  type Role,
} from '@chetna/core';
import { buildEntry, GENESIS_HASH, verifyChain } from '@chetna/audit';
import { prisma } from '../client';

/**
 * The audit log.
 *
 * There is deliberately NO update and NO delete function in this module. The
 * only way to change what the log says is to write another entry. That is the
 * difference between a log and evidence.
 */

function toRecord(row: {
  seq: number;
  orgId: string;
  at: Date;
  actorId: string | null;
  actorRole: string | null;
  action: string;
  reasonCode: string | null;
  payloadHash: string;
  payloadJson: string;
  prevHash: string;
  hash: string;
}): AuditEntryRecord {
  return {
    seq: row.seq,
    orgId: row.orgId,
    at: row.at.toISOString(),
    actorId: row.actorId,
    actorRole: row.actorRole as Role | null,
    action: row.action,
    reasonCode: row.reasonCode as ReasonCode | null,
    payloadHash: row.payloadHash,
    payloadJson: row.payloadJson,
    prevHash: row.prevHash,
    hash: row.hash,
  };
}

/**
 * Append one entry, chained to the current tip.
 *
 * Wrapped in a transaction so two concurrent writers cannot read the same tip
 * and fork the chain. On SQLite the single-writer lock makes this strict; on
 * Postgres the transaction plus the unique constraint on `hash` does the same
 * job.
 */
export async function append(input: AuditEntryInput): Promise<AuditEntryRecord> {
  return prisma.$transaction(async (tx) => {
    const last = await tx.auditEntry.findFirst({ orderBy: { seq: 'desc' } });
    const record = buildEntry(input, (last?.seq ?? 0) + 1, last?.hash ?? GENESIS_HASH);
    await tx.auditEntry.create({
      data: {
        seq: record.seq,
        orgId: record.orgId,
        at: new Date(record.at),
        actorId: record.actorId,
        actorRole: record.actorRole,
        action: record.action,
        reasonCode: record.reasonCode,
        payloadHash: record.payloadHash,
        payloadJson: record.payloadJson,
        prevHash: record.prevHash,
        hash: record.hash,
      },
    });
    return record;
  });
}

/** Append several entries in order, keeping the chain intact. */
export async function appendMany(inputs: readonly AuditEntryInput[]): Promise<AuditEntryRecord[]> {
  const out: AuditEntryRecord[] = [];
  for (const input of inputs) out.push(await append(input));
  return out;
}

export async function list(limit = 200, orgId?: string): Promise<AuditEntryRecord[]> {
  const rows = await prisma.auditEntry.findMany({
    where: orgId ? { orgId } : undefined,
    orderBy: { seq: 'desc' },
    take: limit,
  });
  return rows.map(toRecord);
}

export async function count(): Promise<number> {
  return prisma.auditEntry.count();
}

/**
 * Verify the whole chain from genesis. Loaded in pages so a long-running
 * deployment can still verify without holding everything in memory at once.
 */
export async function verify(): Promise<ChainVerification> {
  const all: AuditEntryRecord[] = [];
  const pageSize = 2000;
  for (let skip = 0; ; skip += pageSize) {
    const page = await prisma.auditEntry.findMany({
      orderBy: { seq: 'asc' },
      skip,
      take: pageSize,
    });
    if (page.length === 0) break;
    all.push(...page.map(toRecord));
    if (page.length < pageSize) break;
  }
  return verifyChain(all);
}

/** Entries relating to one campaign, for the authorization dossier. */
export async function forCampaign(campaignId: string): Promise<AuditEntryRecord[]> {
  const rows = await prisma.auditEntry.findMany({
    where: { payloadJson: { contains: campaignId } },
    orderBy: { seq: 'asc' },
  });
  return rows.map(toRecord);
}
