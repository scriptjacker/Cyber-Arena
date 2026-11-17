import type { Interval, ProportionEstimate } from '@chetna/core';

/** 95% two-sided normal quantile. */
export const Z95 = 1.959963984540054;

/**
 * Wilson score interval for a binomial proportion.
 *
 * Chosen over the normal approximation because awareness campaigns routinely
 * produce small numerators — a 4-person department with one click — where the
 * normal approximation produces intervals that run below zero and make a team
 * look either perfect or doomed. Wilson behaves at the boundaries.
 */
export function wilson(x: number, n: number, z = Z95): ProportionEstimate {
  if (n <= 0) return { n: 0, x: 0, p: 0, ci95: { lower: 0, upper: 0 } };
  const p = x / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const margin = (z / denom) * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
  return {
    n,
    x,
    p,
    ci95: { lower: clamp01(center - margin), upper: clamp01(center + margin) },
  };
}

/**
 * Newcombe's hybrid-score interval for the difference between two independent
 * proportions (his "method 10"), built from the two Wilson intervals.
 *
 * This is the number that decides whether we are allowed to claim the training
 * worked. If the interval contains zero, we are not.
 */
export function differenceInterval(a: ProportionEstimate, b: ProportionEstimate): Interval {
  const d = a.p - b.p;
  const lower = d - Math.sqrt((a.p - a.ci95.lower) ** 2 + (b.ci95.upper - b.p) ** 2);
  const upper = d + Math.sqrt((a.ci95.upper - a.p) ** 2 + (b.p - b.ci95.lower) ** 2);
  return { lower: clampDiff(lower), upper: clampDiff(upper) };
}

export function crossesZero(ci: Interval): boolean {
  return ci.lower <= 0 && ci.upper >= 0;
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((x, y) => x - y);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function percentile(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((x, y) => x - y);
  const idx = Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1));
  return s[idx];
}

export function pct(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits)}%`;
}

export function formatDuration(ms: number | null): string {
  if (ms === null) return '—';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

/**
 * Clamp, and snap values that are within floating-point noise of a bound onto
 * it. The Wilson upper bound for x = n is exactly 1; without this, accumulated
 * error renders as "99.99999999%" on a dashboard, which reads as a bug to
 * anyone looking at it.
 */
const EPS = 1e-9;
const snap = (v: number, lo: number, hi: number) => {
  const clamped = Math.min(hi, Math.max(lo, v));
  if (Math.abs(clamped - hi) < EPS) return hi;
  if (Math.abs(clamped - lo) < EPS) return lo;
  return clamped;
};

const clamp01 = (v: number) => snap(v, 0, 1);
const clampDiff = (v: number) => snap(v, -1, 1);
