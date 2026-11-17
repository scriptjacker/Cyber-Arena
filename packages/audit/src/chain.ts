import {
  canonicalJson,
  sha256Hex,
  type AuditEntryInput,
  type AuditEntryRecord,
  type ChainVerification,
} from '@chetna/core';

/** The first entry's prevHash. A chain always starts somewhere nameable. */
export const GENESIS_HASH = sha256Hex('chetna:genesis:v1');

/**
 * Entry hash = SHA-256 over a canonical, field-delimited preimage.
 *
 * Every field that matters is inside the hash, so changing any of them —
 * including the sequence number or the previous hash — breaks the chain at that
 * point and every point after it. The NUL delimiter prevents the classic
 * concatenation ambiguity where ("ab","c") and ("a","bc") would hash alike.
 */
export function entryHash(parts: {
  seq: number;
  orgId: string;
  at: string;
  actorId: string | null;
  actorRole: string | null;
  action: string;
  reasonCode: string | null;
  payloadHash: string;
  prevHash: string;
}): string {
  const preimage = [
    String(parts.seq),
    parts.orgId,
    parts.at,
    parts.actorId ?? '',
    parts.actorRole ?? '',
    parts.action,
    parts.reasonCode ?? '',
    parts.payloadHash,
    parts.prevHash,
  ].join('\u0000');
  return sha256Hex(preimage);
}

/**
 * Build the next record in the chain. Pure: the caller persists it. There is
 * deliberately no update or delete counterpart anywhere in this package.
 */
export function buildEntry(
  input: AuditEntryInput,
  seq: number,
  prevHash: string,
): AuditEntryRecord {
  const at = input.at ?? new Date().toISOString();
  const payloadJson = canonicalJson(input.payload ?? null);
  const payloadHash = sha256Hex(payloadJson);
  const base = {
    seq,
    orgId: input.orgId,
    at,
    actorId: input.actorId ?? null,
    actorRole: input.actorRole ?? null,
    action: input.action,
    reasonCode: input.reasonCode ?? null,
    payloadHash,
    prevHash,
  };
  return { ...base, payloadJson, hash: entryHash(base) };
}

/**
 * Walk the chain and re-compute everything: each payload hash, each entry hash,
 * and each link to the previous entry. Reports the FIRST bad sequence number,
 * which is what a forensic reviewer needs.
 */
export function verifyChain(entries: readonly AuditEntryRecord[]): ChainVerification {
  if (entries.length === 0) {
    return { ok: true, entriesChecked: 0, merkleRoot: null, firstBadSeq: null, problem: null };
  }

  const sorted = [...entries].sort((a, b) => a.seq - b.seq);
  let prev = GENESIS_HASH;

  for (const e of sorted) {
    if (e.prevHash !== prev) {
      return {
        ok: false,
        entriesChecked: sorted.length,
        merkleRoot: null,
        firstBadSeq: e.seq,
        problem: `entry ${e.seq}: prevHash does not match the previous entry's hash (chain broken or an entry was removed)`,
      };
    }
    if (sha256Hex(e.payloadJson) !== e.payloadHash) {
      return {
        ok: false,
        entriesChecked: sorted.length,
        merkleRoot: null,
        firstBadSeq: e.seq,
        problem: `entry ${e.seq}: payload was modified after it was written`,
      };
    }
    const recomputed = entryHash({
      seq: e.seq,
      orgId: e.orgId,
      at: e.at,
      actorId: e.actorId,
      actorRole: e.actorRole,
      action: e.action,
      reasonCode: e.reasonCode,
      payloadHash: e.payloadHash,
      prevHash: e.prevHash,
    });
    if (recomputed !== e.hash) {
      return {
        ok: false,
        entriesChecked: sorted.length,
        merkleRoot: null,
        firstBadSeq: e.seq,
        problem: `entry ${e.seq}: one of its fields was modified after it was written`,
      };
    }
    prev = e.hash;
  }

  return {
    ok: true,
    entriesChecked: sorted.length,
    merkleRoot: merkleRoot(sorted.map((e) => e.hash)),
    firstBadSeq: null,
    problem: null,
  };
}

/**
 * Binary Merkle root over entry hashes. An odd node is promoted rather than
 * duplicated, which avoids the CVE-2012-2459 style duplicate-leaf ambiguity.
 */
export function merkleRoot(leaves: readonly string[]): string | null {
  if (leaves.length === 0) return null;
  let level = [...leaves];
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = i + 1 < level.length ? level[i + 1] : undefined;
      next.push(right === undefined ? left : sha256Hex(`${left}\u0000${right}`));
    }
    level = next;
  }
  return level[0];
}
