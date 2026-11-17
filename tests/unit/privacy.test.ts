import { describe, expect, it } from 'vitest';
import { DataClass, type CohortRow } from '@chetna/core';
import {
  buildErasurePatch,
  DEFAULT_K,
  DEFAULT_RETENTION_DAYS,
  DSAR_EXPORT_SECTIONS,
  ERASURE_NULLED_FIELDS,
  guardCohorts,
  isSuppressed,
  K_HARD_FLOOR,
  kGuardScalar,
  NEVER_AUTO_PURGED,
  normaliseK,
  planPurge,
  RETENTION_RATIONALE,
} from '@chetna/privacy';

const row = (label: string, size: number): CohortRow => ({
  key: label.toLowerCase(),
  label,
  cohortSize: size,
  delivered: size,
  failures: Math.floor(size / 10),
  reports: Math.floor(size / 4),
  machineFiltered: 1,
});

describe('k configuration', () => {
  it('defaults to 5, matching the floor commercial people-analytics tools enforce', () => {
    expect(DEFAULT_K).toBe(5);
    expect(normaliseK(undefined)).toBe(5);
  });

  it('can be raised but never lowered past the hard floor', () => {
    expect(normaliseK(10)).toBe(10);
    expect(normaliseK(1)).toBe(K_HARD_FLOOR);
    expect(normaliseK(0)).toBe(K_HARD_FLOOR);
    expect(normaliseK(-99)).toBe(K_HARD_FLOOR);
  });
});

describe('scalar guard', () => {
  it('returns data for a large enough cohort', () => {
    const g = kGuardScalar({ failureRate: 0.1 }, 40);
    expect(g.ok).toBe(true);
    if (g.ok) expect(g.data.failureRate).toBe(0.1);
  });

  it('refuses rather than degrades for a small cohort', () => {
    const g = kGuardScalar({ failureRate: 1 }, 2);
    expect(isSuppressed(g)).toBe(true);
    if (!g.ok) {
      expect(g.k).toBe(5);
      expect(g.cohortSize).toBe(2);
      expect(g.reason).toMatch(/visible only to the individual/);
    }
  });

  it('forces the caller to handle suppression — this is a compile-time property', () => {
    const g = kGuardScalar({ x: 1 }, 1);
    // @ts-expect-error data is not available without narrowing on ok
    const _bad = g.data;
    expect(g.ok).toBe(false);
  });
});

describe('cohort guard', () => {
  it('publishes cohorts at or above k', () => {
    const g = guardCohorts([row('Engineering', 60), row('Finance', 24), row('Support', 12)], 5);
    expect(g.ok).toBe(true);
    if (!g.ok) return;
    expect(g.data.rows.map((r) => r.label)).toEqual(['Engineering', 'Finance', 'Support']);
    expect(g.data.hidden.count).toBe(0);
  });

  it('rolls several hidden cohorts into an aggregate when the roll-up itself clears k', () => {
    const g = guardCohorts(
      [row('Engineering', 60), row('Legal', 3), row('Audit', 2), row('Risk', 4)],
      5,
    );
    expect(g.ok).toBe(true);
    if (!g.ok) return;
    expect(g.data.hidden.count).toBe(3);
    expect(g.data.hidden.totalPeople).toBe(9);
    expect(g.data.hidden.aggregate?.cohortSize).toBe(9);
    expect(g.data.hidden.aggregate?.label).toMatch(/Other/);
  });

  it('never names a hidden cohort', () => {
    const g = guardCohorts([row('Engineering', 60), row('Legal', 3), row('Audit', 2)], 5);
    expect(g.ok).toBe(true);
    if (!g.ok) return;
    const rendered = JSON.stringify(g.data);
    expect(rendered).not.toMatch(/Legal/);
    expect(rendered).not.toMatch(/Audit/);
  });

  it('explains what it withheld and why', () => {
    const g = guardCohorts([row('Engineering', 60), row('Legal', 3), row('Audit', 2)], 5);
    if (!g.ok) return;
    expect(g.data.hidden.reason).toMatch(/5-person threshold/);
  });

  it('raising k hides more', () => {
    const rows = [row('Engineering', 60), row('Finance', 24), row('Support', 12)];
    const at5 = guardCohorts(rows, 5);
    const at30 = guardCohorts(rows, 30);
    if (!at5.ok || !at30.ok) return;
    expect(at30.data.rows.length).toBeLessThan(at5.data.rows.length);
  });
});

describe('retention', () => {
  it('keeps raw telemetry for the shortest time of any class', () => {
    const shortest = Math.min(...Object.values(DEFAULT_RETENTION_DAYS));
    expect(DEFAULT_RETENTION_DAYS[DataClass.TELEMETRY_RAW]).toBe(shortest);
    expect(DEFAULT_RETENTION_DAYS[DataClass.TELEMETRY_RAW]).toBe(30);
  });

  it('never auto-purges the audit chain', () => {
    expect(NEVER_AUTO_PURGED).toContain(DataClass.AUDIT);
    const plans = planPurge([], new Date('2026-03-10T00:00:00Z'));
    const audit = plans.find((p) => p.dataClass === DataClass.AUDIT);
    expect(audit?.purgeable).toBe(false);
    expect(audit?.note).toMatch(/would not be evidence/);
  });

  it('computes a cutoff per class from the retention days', () => {
    const now = new Date('2026-03-10T00:00:00Z');
    const plans = planPurge([], now);
    const events = plans.find((p) => p.dataClass === DataClass.EVENT);
    expect(events?.retainDays).toBe(180);
    const expected = new Date(now.getTime() - 180 * 86_400_000).toISOString();
    expect(events?.cutoffAt).toBe(expected);
  });

  it('lets an organisation override a retention period', () => {
    const plans = planPurge([{ dataClass: DataClass.EVENT, retainDays: 45 }]);
    expect(plans.find((p) => p.dataClass === DataClass.EVENT)?.retainDays).toBe(45);
  });

  it('documents a rationale for every data class', () => {
    for (const cls of Object.values(DataClass)) {
      expect(RETENTION_RATIONALE[cls]?.length ?? 0).toBeGreaterThan(40);
    }
  });
});

describe('DSAR', () => {
  it('erasure nulls contact fields, tombstones the person and opts them out', () => {
    const patch = buildErasurePatch(new Date('2026-03-10T00:00:00Z'));
    expect(patch.email).toBeNull();
    expect(patch.displayName).toBeNull();
    expect(patch.consentState).toBe('OPTED_OUT');
    expect(patch.erasedAt).toBe('2026-03-10T00:00:00.000Z');
    for (const field of ERASURE_NULLED_FIELDS) {
      expect(Object.keys(patch)).toContain(field);
    }
  });

  it('an access export covers everything held about a person', () => {
    expect(DSAR_EXPORT_SECTIONS.length).toBeGreaterThanOrEqual(6);
    expect(DSAR_EXPORT_SECTIONS.join(' ')).toMatch(/retention clocks/);
  });
});
