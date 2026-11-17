import type { DataClass } from '@chetna/core';
import { prisma, retentionRepo } from '@chetna/db';
import { RETENTION_RATIONALE } from '@chetna/privacy';
import { heading, info, kv, ok, warn } from '../lib/out';

/**
 * Retention enforcement.
 *
 * The work happens in `@chetna/db` so the CLI and the console cannot disagree
 * about what deletion means. This file is presentation only.
 */
export async function purge(options: { apply?: boolean } = {}): Promise<void> {
  const apply = options.apply === true;
  heading(apply ? 'Retention purge — APPLYING' : 'Retention purge — DRY RUN');

  const org = await prisma.org.findFirst();
  if (!org) {
    warn('no organisation found; nothing to purge');
    return;
  }

  const lines = await retentionRepo.executePurge({ orgId: org.id, apply });
  let total = 0;

  for (const line of lines) {
    if (!line.purgeable) {
      info(`${line.dataClass.padEnd(14, ' ')} retained ${line.retainDays}d — never auto-purged`);
      info(`${' '.repeat(16)}${RETENTION_RATIONALE[line.dataClass as DataClass]}`);
      continue;
    }
    total += line.affected;
    const verb = line.mode === 'fields-cleared' ? 'fields cleared' : 'rows removed';
    kv(
      `${line.dataClass} (${line.retainDays}d)`,
      `${line.affected} ${verb}${apply ? '' : ' (would be)'}`,
    );
  }

  console.log('');
  if (apply) {
    ok(`${total} record(s) erased. A receipt and an audit entry were written for each class.`);
  } else {
    info(`${total} record(s) are past their retention cutoff. Re-run with --apply to erase.`);
  }
}
