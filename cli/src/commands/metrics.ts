
import { analyticsRepo, eventsRepo, prisma, runtimeConfig } from '@chetna/db';
import { computeMetrics, formatDuration, holdoutEffect } from '@chetna/scoring';
import { guardCohorts } from '@chetna/privacy';
import { bold, dim, fail, heading, info, kv, ok, pct, warn } from '../lib/out';

/**
 * Campaign analytics from the command line.
 *
 * The three things this prints that other platforms do not: machine-filtered
 * opens as a separate number, a difficulty-adjusted failure rate, and a holdout
 * effect that is allowed to say "no significant effect detected".
 */
export async function metrics(campaignId?: string): Promise<void> {
  const campaign = campaignId
    ? await prisma.campaign.findUnique({ where: { id: campaignId } })
    : await prisma.campaign.findFirst({ where: { status: 'COMPLETE' }, orderBy: { createdAt: 'desc' } });

  if (!campaign) {
    fail('no campaign found');
    return;
  }

  heading(`Campaign analytics — ${campaign.name}`);

  const outcomes = await eventsRepo.campaignOutcomes(campaign.id);
  const m = computeMetrics(outcomes);

  kv('delivered', m.delivered);
  kv('reported', `${m.reports} (${pct(m.reportRate)})`);
  kv('failed (human)', `${m.failures} (${pct(m.failureRate)})`);
  kv('difficulty-adjusted failure', pct(m.difficultyAdjustedFailureRate));
  kv('resilience ratio', m.resilienceRatio.toFixed(2));
  kv('median time to report', formatDuration(m.medianTimeToReportMs));
  console.log('');
  kv('pixel loads (probable opens)', m.probableOpens);
  kv('— attributed to machines', m.machineFiltered);
  kv('— human opens', m.humanOpens);
  info(
    'Machine traffic is gateways and Apple Mail Privacy Protection prefetching the pixel. It is excluded from every human metric above, and shown here rather than hidden.',
  );
  console.log('');
  kv('clicks confirmed by interaction', m.clicksConfirmed);
  kv('clicks unconfirmed', m.clicksUnconfirmed);
  kv('would-have-submitted', m.submitIntents);
  info(
    'No credential was collected to produce that last number: the decoy panel has no input field at all. Intent is the behaviour; the secret is never in the system.',
  );

  // ------------------------------------------------------- holdout effect
  heading('Randomised holdout');
  const h = holdoutEffect(outcomes);
  kv('treatment arm', `${h.treatment.x}/${h.treatment.n} failed (${pct(h.treatment.p)})`);
  kv('holdout arm', `${h.holdout.x}/${h.holdout.n} failed (${pct(h.holdout.p)})`);
  kv(
    'difference (holdout − treated)',
    `${pct(h.difference)}  95% CI ${pct(h.differenceCi95.lower)} to ${pct(h.differenceCi95.upper)}`,
  );
  if (h.significant) ok(h.verdict);
  else warn(h.verdict);

  // --------------------------------------------------- cohort breakdown
  const k = runtimeConfig().kAnon;
  heading(`Cohort breakdown by department (k-anonymity, k=${k})`);

  const rows = await analyticsRepo.cohortRows(campaign.id);
  const guarded = guardCohorts(rows, k);

  if (!guarded.ok) {
    warn(guarded.reason);
    return;
  }

  console.log(
    `  ${bold('Department'.padEnd(20))}${bold('People'.padEnd(8))}${bold('Reports'.padEnd(9))}${bold('Failed'.padEnd(8))}${bold('Machine')}`,
  );
  for (const row of guarded.data.rows) {
    console.log(
      `  ${row.label.padEnd(20)}${String(row.cohortSize).padEnd(8)}${String(row.reports).padEnd(9)}${String(row.failures).padEnd(8)}${row.machineFiltered}`,
    );
  }
  if (guarded.data.hidden.aggregate) {
    const a = guarded.data.hidden.aggregate;
    console.log(
      `  ${dim(a.label.padEnd(20))}${String(a.cohortSize).padEnd(8)}${String(a.reports).padEnd(9)}${String(a.failures).padEnd(8)}${a.machineFiltered}`,
    );
  }
  if (guarded.data.hidden.count > 0) {
    console.log('');
    warn(guarded.data.hidden.reason);
    info(
      'Hidden cohorts are never named, because naming a withheld group can identify it. There is no endpoint in this platform that returns a named individual to a manager.',
    );
  }
}
