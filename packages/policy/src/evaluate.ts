import {
  gateOf,
  hashCanonical,
  ReasonCode,
  reasonText,
  type PolicyDecision,
  type SendContext,
} from '@chetna/core';
import { GATES } from './gates';

/**
 * The send decision. A pure function: no database, no network, no clock of its
 * own — `ctx.now` is supplied. That is what makes every one of the twenty-four
 * abuse cases a plain unit test.
 *
 * It runs EVERY gate and collects EVERY failure rather than short-circuiting,
 * because an operator fixing a campaign needs the whole list, not the first
 * problem. The worker calls this again per message at send time, so a grant
 * revoked thirty seconds ago stops the next message.
 */
export function evaluate(ctx: SendContext): PolicyDecision {
  const reasons: ReasonCode[] = [];
  for (const gate of GATES) {
    reasons.push(...gate.run(ctx));
  }

  const unique = [...new Set(reasons)];
  const gates = unique.map((r) => gateOf(r)).filter((g): g is 1 | 2 | 3 | 4 | 5 | 6 | 7 => g !== null);
  const firstGate = gates.length > 0 ? (Math.min(...gates) as 1 | 2 | 3 | 4 | 5 | 6 | 7) : null;

  return {
    allow: unique.length === 0,
    reasons: unique.length === 0 ? [ReasonCode.ALLOW] : unique,
    gate: firstGate,
    evaluatedAt: ctx.now,
    inputsHash: inputsHash(ctx),
  };
}

/**
 * Hash of exactly what was judged, so an audit entry can be replayed and shown
 * to have produced the recorded decision. Deliberately excludes the email
 * address — the audit log records decisions, not contact data.
 */
export function inputsHash(ctx: SendContext): string {
  return hashCanonical({
    now: ctx.now,
    mode: ctx.mode,
    campaign: ctx.campaign,
    liveScopeHash: hashCanonical(ctx.liveScope),
    grantScopeHash: ctx.grant?.scopeHash ?? null,
    grantRevoked: Boolean(ctx.grant?.revokedAt),
    approvals: (ctx.grant?.approvals ?? []).map((a) => ({
      approverId: a.approverId,
      slot: a.approverSlot,
    })),
    participant: {
      pid: ctx.participant.pid,
      onRoster: ctx.participant.onRoster,
      optedOut: Boolean(ctx.participant.optedOutAt),
      excludedByHr: Boolean(ctx.participant.excludedByHr),
      matchesSuppression: Boolean(ctx.participant.matchesSuppression),
      lastSimulatedAt: ctx.participant.lastSimulatedAt ?? null,
      joinedAt: ctx.participant.joinedAt ?? null,
    },
    template: ctx.template,
    domains: ctx.domains,
    transportHost: ctx.transport.host,
    limits: ctx.limits,
  });
}

export interface PreflightSummary {
  total: number;
  allowed: number;
  blocked: number;
  byReason: { code: ReasonCode; count: number; text: string; gate: number | null }[];
  gatesFailing: number[];
}

/** Aggregate many per-participant decisions into the preflight panel's view. */
export function summarise(decisions: readonly PolicyDecision[]): PreflightSummary {
  const counts = new Map<ReasonCode, number>();
  for (const d of decisions) {
    if (d.allow) continue;
    for (const r of d.reasons) counts.set(r, (counts.get(r) ?? 0) + 1);
  }
  const byReason = [...counts.entries()]
    .map(([code, count]) => ({ code, count, text: reasonText(code), gate: gateOf(code) }))
    .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));

  const allowed = decisions.filter((d) => d.allow).length;
  return {
    total: decisions.length,
    allowed,
    blocked: decisions.length - allowed,
    byReason,
    gatesFailing: [
      ...new Set(
        byReason
          .map((r) => r.gate)
          .filter((g): g is 1 | 2 | 3 | 4 | 5 | 6 | 7 => g !== null),
      ),
    ].sort((a, b) => a - b),
  };
}

/** Human-readable explanation of a decision, for the UI and the audit log. */
export function explain(decision: PolicyDecision): string[] {
  return decision.reasons.map((r) => `${r}: ${reasonText(r)}`);
}
