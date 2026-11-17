import { SuppressionScope, type SuppressionScope as Scope } from '@chetna/core';

export interface SuppressionRule {
  scope: Scope;
  value: string;
  reason: string;
  expiresAt?: Date | string | null;
}

export interface SuppressionSubject {
  email?: string | null;
  department: string;
  roleArchetype: string;
}

const eq = (a: string | null | undefined, b: string) =>
  (a ?? '').trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Does any active suppression rule cover this person?
 *
 * Pure, so gate G4's behaviour is testable without a database. Expired rules
 * are ignored, which lets HR suppress someone for a defined period — "Priya is
 * on bereavement leave until the 30th" — without anyone having to remember to
 * remove the entry afterwards.
 */
export function matchesSuppression(
  subject: SuppressionSubject,
  rules: readonly SuppressionRule[],
  now: Date = new Date(),
): SuppressionRule | null {
  for (const rule of rules) {
    if (rule.expiresAt && new Date(rule.expiresAt).getTime() <= now.getTime()) continue;
    switch (rule.scope) {
      case SuppressionScope.EMAIL:
        if (eq(subject.email, rule.value)) return rule;
        break;
      case SuppressionScope.DEPARTMENT:
        if (eq(subject.department, rule.value)) return rule;
        break;
      case SuppressionScope.ROLE_ARCHETYPE:
        if (eq(subject.roleArchetype, rule.value)) return rule;
        break;
      default:
        break;
    }
  }
  return null;
}
