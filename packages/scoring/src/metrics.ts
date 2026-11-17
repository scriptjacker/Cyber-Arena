import {
  Arm,
  Difficulty,
  type CampaignMetrics,
  type HoldoutResult,
} from '@chetna/core';
import { crossesZero, differenceInterval, median, pct, wilson } from './stats';

/**
 * Weights for difficulty adjustment. Duplicated from @chetna/phishscale rather
 * than imported, to keep the scoring package free of HTML-parsing dependencies;
 * a unit test asserts the two tables agree.
 */
export const DIFFICULTY_WEIGHT: Record<Difficulty, number> = {
  [Difficulty.VERY_LOW]: 1.6,
  [Difficulty.LOW]: 1.3,
  [Difficulty.MODERATE]: 1.0,
  [Difficulty.HIGH]: 0.8,
  [Difficulty.VERY_HIGH]: 0.6,
};

/** One row per assignment: the flattened outcome of a single simulation. */
export interface AssignmentOutcome {
  assignmentId: string;
  arm: Arm;
  difficulty: Difficulty;
  delivered: boolean;
  /** A pixel load happened. Says little on its own — see actorClass. */
  probableOpen: boolean;
  /** The pixel load was attributed to a machine, not a person. */
  machineFiltered: boolean;
  clickUnconfirmed: boolean;
  clickConfirmed: boolean;
  submitIntent: boolean;
  qrScan: boolean;
  reported: boolean;
  timeToReportMs: number | null;
  trainingCompleted: boolean;
}

/** A human failed the simulation. Machine traffic can never produce this. */
export function isFailure(o: AssignmentOutcome): boolean {
  return o.clickConfirmed || o.submitIntent || o.qrScan;
}

export function computeMetrics(outcomes: readonly AssignmentOutcome[]): CampaignMetrics {
  const delivered = outcomes.filter((o) => o.delivered);
  const n = delivered.length;

  const probableOpens = delivered.filter((o) => o.probableOpen).length;
  const machineFiltered = delivered.filter((o) => o.probableOpen && o.machineFiltered).length;
  const humanOpens = probableOpens - machineFiltered;

  const clicksConfirmed = delivered.filter((o) => o.clickConfirmed).length;
  const clicksUnconfirmed = delivered.filter((o) => o.clickUnconfirmed && !o.clickConfirmed).length;
  const submitIntents = delivered.filter((o) => o.submitIntent).length;
  const failures = delivered.filter(isFailure).length;
  const reports = delivered.filter((o) => o.reported).length;

  const reportTimes = delivered
    .map((o) => o.timeToReportMs)
    .filter((v): v is number => typeof v === 'number');

  // Difficulty adjustment: failing an obvious lure counts for more than failing
  // a very hard one, so a programme cannot improve its numbers by sending
  // easier phish.
  let weightSum = 0;
  let weightedFailures = 0;
  for (const o of delivered) {
    const w = DIFFICULTY_WEIGHT[o.difficulty] ?? 1;
    weightSum += w;
    if (isFailure(o)) weightedFailures += w;
  }

  const safeDiv = (a: number, b: number) => (b > 0 ? a / b : 0);

  return {
    delivered: n,
    probableOpens,
    machineFiltered,
    humanOpens,
    clicksConfirmed,
    clicksUnconfirmed,
    submitIntents,
    failures,
    reports,
    reportRate: safeDiv(reports, n),
    failureRate: safeDiv(failures, n),
    // The headline number: of the people who noticed something, how many did
    // the useful thing? Not "how many of your staff failed".
    resilienceRatio: safeDiv(reports, reports + failures),
    medianTimeToReportMs: median(reportTimes),
    difficultyAdjustedFailureRate: safeDiv(weightedFailures, weightSum),
    trainingCompletionRate: safeDiv(
      delivered.filter((o) => o.trainingCompleted).length,
      Math.max(1, failures),
    ),
  };
}

/**
 * The randomised-holdout treatment effect.
 *
 * Every campaign randomises participants into TREATMENT and HOLDOUT. This
 * computes the difference in failure rate with a Newcombe interval and, when
 * that interval contains zero, says so in plain words instead of reporting an
 * improvement nobody can stand behind.
 */
export function holdoutEffect(outcomes: readonly AssignmentOutcome[]): HoldoutResult {
  const delivered = outcomes.filter((o) => o.delivered);
  const t = delivered.filter((o) => o.arm === Arm.TREATMENT);
  const h = delivered.filter((o) => o.arm === Arm.HOLDOUT);

  const treatment = wilson(t.filter(isFailure).length, t.length);
  const holdout = wilson(h.filter(isFailure).length, h.length);

  // Positive difference = the holdout failed MORE = training appears to help.
  const difference = holdout.p - treatment.p;
  const differenceCi95 = differenceInterval(holdout, treatment);
  const inconclusive = crossesZero(differenceCi95);

  let verdict: string;
  if (t.length === 0 || h.length === 0) {
    verdict = 'No holdout arm in this campaign, so no causal claim can be made.';
  } else if (inconclusive) {
    verdict =
      `No significant effect detected. The 95% interval for the difference ` +
      `(${pct(differenceCi95.lower)} to ${pct(differenceCi95.upper)}) includes zero, ` +
      `so this campaign does not demonstrate that the training changed behaviour.`;
  } else if (difference > 0) {
    verdict =
      `The trained group failed ${pct(difference)} less often ` +
      `(95% CI ${pct(differenceCi95.lower)} to ${pct(differenceCi95.upper)}).`;
  } else {
    verdict =
      `The trained group failed ${pct(-difference)} MORE often ` +
      `(95% CI ${pct(differenceCi95.lower)} to ${pct(differenceCi95.upper)}). ` +
      `This is the backfire effect reported by Lain et al. (IEEE S&P 2022) and needs investigation before the next campaign.`;
  }

  return {
    treatment,
    holdout,
    difference,
    differenceCi95,
    significant: !inconclusive && t.length > 0 && h.length > 0,
    verdict,
  };
}

/**
 * Stratified randomisation into arms. Deterministic given the seed, so a
 * campaign's assignment is reproducible and auditable — a judge (or a works
 * council) can re-derive exactly who was in which arm and why.
 */
export function assignArms<T extends { pid: string; stratum: string }>(
  participants: readonly T[],
  holdoutPct: number,
  seed: string,
): { participant: T; arm: Arm; stratum: string }[] {
  const byStratum = new Map<string, T[]>();
  for (const p of participants) {
    const list = byStratum.get(p.stratum) ?? [];
    list.push(p);
    byStratum.set(p.stratum, list);
  }

  const out: { participant: T; arm: Arm; stratum: string }[] = [];
  for (const [stratum, members] of [...byStratum.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    // Deterministic shuffle: sort by a hash of (seed, pid).
    const ordered = [...members].sort((a, b) =>
      hash32(`${seed}:${a.pid}`) - hash32(`${seed}:${b.pid}`),
    );
    const holdoutCount = Math.round((holdoutPct / 100) * ordered.length);
    ordered.forEach((participant, i) => {
      out.push({ participant, stratum, arm: i < holdoutCount ? Arm.HOLDOUT : Arm.TREATMENT });
    });
  }
  return out;
}

function hash32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
