import type { CohortRow, KGuarded } from '@chetna/core';

/**
 * k-anonymity for team analytics.
 *
 * Microsoft Viva Insights hard-floors its minimum group size at 5 and will not
 * allow lower; some consultancies recommend 10 to 20. We default to 5, allow it
 * to be raised, floor it at 3, and audit-log any change.
 *
 * Two things make this a real control rather than a gesture:
 *
 *  1. It REFUSES rather than degrades. A cohort below k produces no row at all,
 *     not a rounded or noised one.
 *  2. It applies COMPLEMENTARY SUPPRESSION. Hiding a single small cell while
 *     publishing the total lets anyone recover it by subtraction, so when only
 *     one cell is hidden we hide the next-smallest too.
 *
 * Thresholds must also be re-checked for every attribute combination, since
 * cross-tabulating shrinks cells — `guardCohorts` is therefore called on the
 * result of each breakdown, not once on the dataset.
 */

export const DEFAULT_K = 5;
export const K_HARD_FLOOR = 3;

export function normaliseK(k: number | undefined): number {
  const value = Math.floor(k ?? DEFAULT_K);
  return Number.isFinite(value) ? Math.max(K_HARD_FLOOR, value) : DEFAULT_K;
}

export interface GuardedCohorts {
  k: number;
  rows: CohortRow[];
  hidden: {
    count: number;
    /** Labels are withheld deliberately: naming a hidden cohort can identify it. */
    totalPeople: number;
    /** Hidden rows rolled up, but only when the roll-up is itself >= k. */
    aggregate: CohortRow | null;
    reason: string;
  };
}

/** Guard a single aggregate, e.g. one team's summary tile. */
export function kGuardScalar<T>(data: T, cohortSize: number, k = DEFAULT_K): KGuarded<T> {
  const kk = normaliseK(k);
  if (cohortSize < kk) {
    return {
      ok: false,
      suppressed: true,
      k: kk,
      cohortSize,
      reason: `This group has fewer than ${kk} people, so its results are not shown. Individual outcomes are visible only to the individual.`,
    };
  }
  return { ok: true, data };
}

/**
 * Guard a cohort breakdown. Returns `ok: false` only when nothing at all can be
 * shown; otherwise returns the publishable rows plus an honest account of what
 * was withheld.
 */
export function guardCohorts(
  rows: readonly CohortRow[],
  k = DEFAULT_K,
): KGuarded<GuardedCohorts> {
  const kk = normaliseK(k);
  const visible = rows.filter((r) => r.cohortSize >= kk).sort((a, b) => b.cohortSize - a.cohortSize);
  const hidden = rows.filter((r) => r.cohortSize < kk);

  if (visible.length === 0) {
    const total = rows.reduce((n, r) => n + r.cohortSize, 0);
    return {
      ok: false,
      suppressed: true,
      k: kk,
      cohortSize: total,
      reason: `No group in this breakdown has ${kk} or more people, so nothing can be shown without risking identification.`,
    };
  }

  const suppressed = [...hidden];

  // Complementary suppression: one hidden cell alongside a published total is
  // recoverable by subtraction, so withhold the smallest visible cell as well.
  if (hidden.length === 1 && visible.length > 0) {
    const smallest = visible.pop();
    if (smallest) suppressed.push(smallest);
  }

  const hiddenPeople = suppressed.reduce((n, r) => n + r.cohortSize, 0);
  const aggregate =
    suppressed.length > 1 && hiddenPeople >= kk
      ? suppressed.reduce<CohortRow>(
          (acc, r) => ({
            key: 'suppressed',
            label: `Other (${suppressed.length} small groups)`,
            cohortSize: acc.cohortSize + r.cohortSize,
            delivered: acc.delivered + r.delivered,
            failures: acc.failures + r.failures,
            reports: acc.reports + r.reports,
            machineFiltered: acc.machineFiltered + r.machineFiltered,
          }),
          {
            key: 'suppressed',
            label: '',
            cohortSize: 0,
            delivered: 0,
            failures: 0,
            reports: 0,
            machineFiltered: 0,
          },
        )
      : null;

  return {
    ok: true,
    data: {
      k: kk,
      rows: visible,
      hidden: {
        count: suppressed.length,
        totalPeople: hiddenPeople,
        aggregate,
        reason:
          suppressed.length === 0
            ? ''
            : `${suppressed.length} group(s) withheld: below the ${kk}-person threshold, or withheld to prevent a withheld group being recovered by subtraction.`,
      },
    },
  };
}

/** Narrowing helper so UI code reads cleanly. */
export function isSuppressed<T>(
  result: KGuarded<T>,
): result is { ok: false; suppressed: true; k: number; cohortSize: number; reason: string } {
  return result.ok === false;
}
