import { describe, expect, it } from 'vitest';
import { ActorClass, Arm, Difficulty, IpClass } from '@chetna/core';
import {
  assessMachine,
  assignArms,
  bandOf,
  classifyIp,
  computeMetrics,
  crossesZero,
  differenceInterval,
  DIFFICULTY_WEIGHT as SCORING_WEIGHTS,
  formatDuration,
  holdoutEffect,
  isFailure,
  median,
  TEMPLATE_RATING,
  updateRating,
  wilson,
  type AssignmentOutcome,
} from '@chetna/scoring';
import { DIFFICULTY_WEIGHT as SCALE_WEIGHTS } from '@chetna/phishscale';

const outcome = (over: Partial<AssignmentOutcome> = {}): AssignmentOutcome => ({
  assignmentId: 'a',
  arm: Arm.TREATMENT,
  difficulty: Difficulty.MODERATE,
  delivered: true,
  probableOpen: false,
  machineFiltered: false,
  clickUnconfirmed: false,
  clickConfirmed: false,
  submitIntent: false,
  qrScan: false,
  reported: false,
  timeToReportMs: null,
  trainingCompleted: false,
  ...over,
});

describe('the two difficulty-weight tables agree', () => {
  it('scoring and phishscale cannot drift apart', () => {
    expect(SCORING_WEIGHTS).toEqual(SCALE_WEIGHTS);
  });
});

describe('Wilson intervals', () => {
  it('behaves at the boundaries where the normal approximation breaks', () => {
    const zero = wilson(0, 10);
    expect(zero.p).toBe(0);
    expect(zero.ci95.lower).toBe(0);
    expect(zero.ci95.upper).toBeGreaterThan(0);
    expect(zero.ci95.upper).toBeLessThan(0.4);

    const all = wilson(10, 10);
    expect(all.ci95.upper).toBe(1);
    expect(all.ci95.lower).toBeGreaterThan(0.6);
  });

  it('brackets the point estimate and narrows as n grows', () => {
    const small = wilson(5, 10);
    const large = wilson(500, 1000);
    expect(small.ci95.lower).toBeLessThan(0.5);
    expect(small.ci95.upper).toBeGreaterThan(0.5);
    const width = (e: typeof small) => e.ci95.upper - e.ci95.lower;
    expect(width(large)).toBeLessThan(width(small));
  });

  it('returns a defined result for an empty sample', () => {
    expect(wilson(0, 0)).toEqual({ n: 0, x: 0, p: 0, ci95: { lower: 0, upper: 0 } });
  });
});

describe('difference intervals', () => {
  it('crosses zero when the two arms are identical', () => {
    const ci = differenceInterval(wilson(10, 100), wilson(10, 100));
    expect(crossesZero(ci)).toBe(true);
    expect(ci.lower).toBeLessThan(0);
    expect(ci.upper).toBeGreaterThan(0);
  });

  it('excludes zero when the difference is large and the samples are big', () => {
    const ci = differenceInterval(wilson(300, 1000), wilson(60, 1000));
    expect(crossesZero(ci)).toBe(false);
    expect(ci.lower).toBeGreaterThan(0);
  });
});

describe('campaign metrics', () => {
  it('excludes machine traffic from human opens and reports it separately', () => {
    const m = computeMetrics([
      outcome({ probableOpen: true, machineFiltered: true }),
      outcome({ probableOpen: true, machineFiltered: true }),
      outcome({ probableOpen: true }),
    ]);
    expect(m.probableOpens).toBe(3);
    expect(m.machineFiltered).toBe(2);
    expect(m.humanOpens).toBe(1);
  });

  it('counts a confirmed click, a submit intent and a QR scan as failures', () => {
    expect(isFailure(outcome({ clickConfirmed: true }))).toBe(true);
    expect(isFailure(outcome({ submitIntent: true }))).toBe(true);
    expect(isFailure(outcome({ qrScan: true }))).toBe(true);
  });

  it('does NOT count an unconfirmed click as a failure', () => {
    expect(isFailure(outcome({ clickUnconfirmed: true }))).toBe(false);
    const m = computeMetrics([outcome({ clickUnconfirmed: true })]);
    expect(m.failures).toBe(0);
    expect(m.clicksUnconfirmed).toBe(1);
  });

  it('computes the resilience ratio from reports against failures', () => {
    const m = computeMetrics([
      outcome({ reported: true, timeToReportMs: 60_000 }),
      outcome({ reported: true, timeToReportMs: 180_000 }),
      outcome({ reported: true, timeToReportMs: 300_000 }),
      outcome({ clickConfirmed: true }),
    ]);
    expect(m.reports).toBe(3);
    expect(m.failures).toBe(1);
    expect(m.resilienceRatio).toBeCloseTo(0.75, 5);
    expect(m.medianTimeToReportMs).toBe(180_000);
  });

  it('penalises failing an obvious lure more than failing a very hard one', () => {
    const easy = computeMetrics([
      outcome({ difficulty: Difficulty.VERY_LOW, clickConfirmed: true }),
      outcome({ difficulty: Difficulty.VERY_LOW }),
    ]);
    const hard = computeMetrics([
      outcome({ difficulty: Difficulty.VERY_HIGH, clickConfirmed: true }),
      outcome({ difficulty: Difficulty.VERY_HIGH }),
    ]);
    // Raw rates are identical; the adjusted rates are not.
    expect(easy.failureRate).toBe(hard.failureRate);
    expect(easy.difficultyAdjustedFailureRate).toBe(hard.difficultyAdjustedFailureRate);

    // Mixed difficulty is where the adjustment bites: the same number of
    // failures concentrated on easy lures reads worse.
    const concentratedOnEasy = computeMetrics([
      outcome({ difficulty: Difficulty.VERY_LOW, clickConfirmed: true }),
      outcome({ difficulty: Difficulty.VERY_HIGH }),
    ]);
    const concentratedOnHard = computeMetrics([
      outcome({ difficulty: Difficulty.VERY_LOW }),
      outcome({ difficulty: Difficulty.VERY_HIGH, clickConfirmed: true }),
    ]);
    expect(concentratedOnEasy.difficultyAdjustedFailureRate).toBeGreaterThan(
      concentratedOnHard.difficultyAdjustedFailureRate,
    );
  });

  it('ignores undelivered assignments', () => {
    const m = computeMetrics([outcome({ delivered: false, clickConfirmed: true })]);
    expect(m.delivered).toBe(0);
    expect(m.failures).toBe(0);
    expect(m.failureRate).toBe(0);
  });
});

describe('the holdout arm is allowed to report no effect', () => {
  const arm = (a: Arm, failures: number, total: number) =>
    Array.from({ length: total }, (_, i) =>
      outcome({ arm: a, clickConfirmed: i < failures }),
    );

  it('refuses to claim an effect when the interval includes zero', () => {
    const r = holdoutEffect([...arm(Arm.TREATMENT, 9, 100), ...arm(Arm.HOLDOUT, 11, 100)]);
    expect(r.significant).toBe(false);
    expect(r.verdict).toMatch(/No significant effect detected/);
    expect(crossesZero(r.differenceCi95)).toBe(true);
  });

  it('reports an effect when the data genuinely support one', () => {
    const r = holdoutEffect([...arm(Arm.TREATMENT, 30, 1000), ...arm(Arm.HOLDOUT, 200, 1000)]);
    expect(r.significant).toBe(true);
    expect(r.difference).toBeGreaterThan(0);
    expect(r.verdict).toMatch(/failed .* less often/);
  });

  it('names the backfire effect when the trained group does worse', () => {
    const r = holdoutEffect([...arm(Arm.TREATMENT, 250, 1000), ...arm(Arm.HOLDOUT, 50, 1000)]);
    expect(r.difference).toBeLessThan(0);
    expect(r.verdict).toMatch(/MORE often/);
    expect(r.verdict).toMatch(/S&P 2022/);
  });

  it('says so plainly when there is no holdout at all', () => {
    const r = holdoutEffect(arm(Arm.TREATMENT, 5, 50));
    expect(r.significant).toBe(false);
    expect(r.verdict).toMatch(/No holdout arm/);
  });
});

describe('stratified randomisation', () => {
  const people = Array.from({ length: 100 }, (_, i) => ({
    pid: `p_${i}`,
    stratum: i % 4 === 0 ? 'Finance' : 'Engineering',
  }));

  it('is deterministic for a given seed, so an assignment can be audited', () => {
    const a = assignArms(people, 20, 'seed-1');
    const b = assignArms(people, 20, 'seed-1');
    expect(a.map((x) => `${x.participant.pid}:${x.arm}`)).toEqual(
      b.map((x) => `${x.participant.pid}:${x.arm}`),
    );
  });

  it('holds the holdout proportion within every stratum, not just overall', () => {
    const assigned = assignArms(people, 20, 'seed-1');
    for (const stratum of ['Finance', 'Engineering']) {
      const inStratum = assigned.filter((a) => a.stratum === stratum);
      const holdout = inStratum.filter((a) => a.arm === Arm.HOLDOUT).length;
      expect(holdout).toBe(Math.round(0.2 * inStratum.length));
    }
  });

  it('produces a different split for a different seed', () => {
    const a = assignArms(people, 20, 'seed-1').filter((x) => x.arm === Arm.HOLDOUT);
    const b = assignArms(people, 20, 'seed-2').filter((x) => x.arm === Arm.HOLDOUT);
    expect(a.map((x) => x.participant.pid)).not.toEqual(b.map((x) => x.participant.pid));
  });

  it('assigns nobody to the holdout when the percentage is zero', () => {
    expect(assignArms(people, 0, 's').every((a) => a.arm === Arm.TREATMENT)).toBe(true);
  });
});

describe('machine-traffic classification', () => {
  it('classifies a known secure email gateway as a machine', () => {
    const a = assessMachine({ userAgent: 'Mozilla/5.0 (compatible; Proofpoint-URL-Defense)' });
    expect(a.actorClass).toBe(ActorClass.MACHINE);
    expect(a.uaFamily).toBe('gateway-proofpoint');
  });

  it('classifies an Apple Mail Privacy Protection prefetch as a machine, not an open', () => {
    const a = assessMachine({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X) Mail/16.0',
      msSinceSent: 800,
      hadLaterInteraction: false,
      secFetchMode: 'no-cors',
    });
    expect(a.actorClass).toBe(ActorClass.MACHINE);
    expect(a.signals.join(' ')).toMatch(/Apple Mail Privacy Protection/);
  });

  it('treats a plausible human read as human', () => {
    const a = assessMachine({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36',
      msSinceSent: 240_000,
      hadLaterInteraction: true,
    });
    expect(a.actorClass).toBe(ActorClass.HUMAN);
    expect(a.score).toBe(0);
  });

  it('flags a script client and a headless browser', () => {
    expect(assessMachine({ userAgent: 'python-requests/2.32' }).actorClass).toBe(ActorClass.MACHINE);
    expect(assessMachine({ userAgent: 'HeadlessChrome/131' }).actorClass).toBe(ActorClass.MACHINE);
  });

  it('never exceeds a score of 1', () => {
    const a = assessMachine({
      userAgent: 'curl/8.0 bot',
      msSinceSent: 10,
      ipClass: IpClass.SCANNER,
      hadLaterInteraction: false,
      secFetchMode: 'no-cors',
    });
    expect(a.score).toBeLessThanOrEqual(1);
  });

  it('classifies addresses coarsely and never stores the address itself', () => {
    expect(classifyIp('127.0.0.1')).toBe(IpClass.LOOPBACK);
    expect(classifyIp('10.4.5.6')).toBe(IpClass.PRIVATE);
    expect(classifyIp('172.20.1.1')).toBe(IpClass.PRIVATE);
    expect(classifyIp('8.8.8.8')).toBe(IpClass.OTHER);
    expect(classifyIp(undefined)).toBe(IpClass.OTHER);
  });
});

describe('resilience rating', () => {
  it('rewards reporting a hard lure more than reporting an easy one', () => {
    const hard = updateRating(1200, Difficulty.VERY_HIGH, 'REPORTED');
    const easy = updateRating(1200, Difficulty.VERY_LOW, 'REPORTED');
    expect(hard).toBeGreaterThan(easy);
    expect(hard).toBeGreaterThan(1200);
  });

  it('penalises failing an easy lure more than failing a hard one', () => {
    const failedEasy = updateRating(1200, Difficulty.VERY_LOW, 'FAILED');
    const failedHard = updateRating(1200, Difficulty.VERY_HIGH, 'FAILED');
    expect(failedEasy).toBeLessThan(failedHard);
    expect(failedEasy).toBeLessThan(1200);
  });

  it('treats ignoring as better than failing and worse than reporting', () => {
    const r = Difficulty.MODERATE;
    expect(updateRating(1200, r, 'FAILED')).toBeLessThan(updateRating(1200, r, 'IGNORED'));
    expect(updateRating(1200, r, 'IGNORED')).toBeLessThan(updateRating(1200, r, 'REPORTED'));
  });

  it('orders template ratings by difficulty', () => {
    expect(TEMPLATE_RATING[Difficulty.VERY_LOW]).toBeLessThan(TEMPLATE_RATING[Difficulty.VERY_HIGH]);
  });

  it('reports a band rather than a number, so nobody can be ranked', () => {
    expect(bandOf(1100)).toBe('DEVELOPING');
    expect(bandOf(1200)).toBe('CAPABLE');
    expect(bandOf(1400)).toBe('STRONG');
  });
});

describe('small helpers', () => {
  it('medians evenly and oddly sized samples', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBeNull();
  });

  it('formats durations for the dashboard', () => {
    expect(formatDuration(null)).toBe('—');
    expect(formatDuration(45_000)).toBe('45s');
    expect(formatDuration(1_680_000)).toBe('28m 0s');
  });
});
