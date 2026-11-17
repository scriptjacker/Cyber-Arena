import { auditRepo } from '@chetna/db';
import { fail, heading, info, kv, ok } from '../lib/out';

/**
 * Walk the audit chain from genesis, re-computing every payload hash, every
 * entry hash and every link. Run this on stage: it is the fastest way to show
 * that the record of what happened cannot be quietly edited.
 */
export async function verifyAudit(): Promise<{ ok: boolean }> {
  heading('Audit chain verification');

  const result = await auditRepo.verify();
  kv('entries checked', result.entriesChecked);

  if (result.ok) {
    kv('merkle root', result.merkleRoot ? `${result.merkleRoot.slice(0, 32)}…` : '(empty chain)');
    ok('chain intact — every hash and every link re-computed and matched');
    info('No entry can be altered or removed without changing every hash after it.');
    return { ok: true };
  }

  fail(`chain BROKEN at sequence ${result.firstBadSeq}`);
  if (result.problem) info(result.problem);
  info('Freeze campaigns and preserve the database. The sequence number above is where to look.');
  return { ok: false };
}

/** Show the tail of the log, for the demo and for debugging. */
export async function showAudit(limit: number): Promise<void> {
  heading(`Audit log — last ${limit} entries`);
  const entries = await auditRepo.list(limit);
  for (const e of [...entries].reverse()) {
    const actor = e.actorId ? `${e.actorId}` : 'system';
    const reason = e.reasonCode ? ` [${e.reasonCode}]` : '';
    console.log(
      `  ${String(e.seq).padStart(4, ' ')}  ${e.at}  ${actor.padEnd(14, ' ')} ${e.action}${reason}`,
    );
  }
  info(`${await auditRepo.count()} entries in total.`);
}
