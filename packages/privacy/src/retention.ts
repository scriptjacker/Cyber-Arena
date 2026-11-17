import { DataClass, type PurgePlan, type RetentionRuleView } from '@chetna/core';

/**
 * Retention defaults.
 *
 * Deliberately short. The DPDP Act requires erasure once the purpose is served,
 * and GDPR storage limitation says the same thing differently. A platform that
 * keeps five years of per-person click history "for trend analysis" has quietly
 * built a disciplinary dataset.
 *
 * AUDIT is the exception: it is append-only accountability evidence and is never
 * purged by the automated job.
 */
export const DEFAULT_RETENTION_DAYS: Record<DataClass, number> = {
  [DataClass.TELEMETRY_RAW]: 30, // machine scores, ua family, ip class
  [DataClass.EVENT]: 180, // opens, clicks, reports, training
  [DataClass.CONTACT]: 365, // email, display name
  [DataClass.LEARNING]: 365, // progress, drill scores
  [DataClass.REPORT]: 730, // generated awareness reports (audit evidence)
  [DataClass.AUDIT]: 2555, // 7 years, append-only, never auto-purged
};

export const NEVER_AUTO_PURGED: DataClass[] = [DataClass.AUDIT];

export const RETENTION_RATIONALE: Record<DataClass, string> = {
  [DataClass.TELEMETRY_RAW]:
    'Needed only long enough to compute metrics and filter machine traffic. Nothing downstream depends on it after a month.',
  [DataClass.EVENT]:
    'Two quarters, which is enough for a trend and for a programme review, and not enough to build a behavioural file on anyone.',
  [DataClass.CONTACT]:
    'The minimum needed to run the programme. Erased sooner when employment ends or on a DSAR erasure request.',
  [DataClass.LEARNING]:
    'Supports spaced repetition and curriculum planning for one cycle.',
  [DataClass.REPORT]:
    'Generated reports are compliance evidence for ISO 27001 and PCI DSS audit cycles.',
  [DataClass.AUDIT]:
    'Accountability evidence. Append-only and never purged by the job — if it could be deleted on a schedule it would not be evidence.',
};

export function planPurge(
  rules: readonly RetentionRuleView[],
  now: Date = new Date(),
): PurgePlan[] {
  const byClass = new Map<DataClass, number>();
  for (const r of rules) byClass.set(r.dataClass, r.retainDays);

  return (Object.keys(DEFAULT_RETENTION_DAYS) as DataClass[]).map((dataClass) => {
    const retainDays = byClass.get(dataClass) ?? DEFAULT_RETENTION_DAYS[dataClass];
    const purgeable = !NEVER_AUTO_PURGED.includes(dataClass);
    const cutoff = new Date(now.getTime() - retainDays * 86_400_000);
    return {
      dataClass,
      retainDays,
      cutoffAt: cutoff.toISOString(),
      purgeable,
      ...(purgeable ? {} : { note: RETENTION_RATIONALE[dataClass] }),
    };
  });
}

/**
 * DSAR erasure.
 *
 * Contact fields are nulled and the participant is tombstoned, while aggregate
 * counts survive. That is the lawful outcome and the honest one at the same
 * time: the person is gone from the system, and last quarter's campaign
 * analytics do not silently change after the fact.
 */
export const ERASURE_NULLED_FIELDS = ['email', 'displayName'] as const;
export const ERASURE_PRESERVED = [
  'aggregate event counts (no longer linked to an identity)',
  'campaign-level metrics already computed',
  'audit entries recording that the erasure happened',
] as const;

export interface ErasurePatch {
  email: null;
  displayName: null;
  consentState: 'OPTED_OUT';
  erasedAt: string;
}

export function buildErasurePatch(now: Date = new Date()): ErasurePatch {
  return {
    email: null,
    displayName: null,
    consentState: 'OPTED_OUT',
    erasedAt: now.toISOString(),
  };
}

/** The fields a DSAR ACCESS export contains. Everything we hold, nothing more. */
export const DSAR_EXPORT_SECTIONS = [
  'identity (pid, department, role archetype, locale, consent state)',
  'contact data held (email, display name)',
  'every simulation assigned, with template difficulty and arm',
  'every event recorded, with its actor classification and machine score',
  'training progress and drill scores',
  'resilience rating and band',
  'reports submitted',
  'retention clocks that apply, and the date each class is due for deletion',
] as const;
