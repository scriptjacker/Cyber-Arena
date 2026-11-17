import {
  CampaignStatus,
  domainOf,
  EthicsStatus,
  LintStatus,
  ReasonCode,
  RunMode,
  type SendContext,
} from '@chetna/core';
import { checkGrant } from '@chetna/audit';

/**
 * Reserved TLDs that cannot resolve to a real mailbox (RFC 2606 / RFC 6761).
 * In offline mode these are the ONLY recipient domains permitted, which is what
 * makes hitting a real inbox during a demo structurally impossible rather than
 * merely unlikely.
 */
export const RESERVED_TEST_SUFFIXES = ['.test', '.example', '.invalid', '.localhost'] as const;
export const RESERVED_TEST_EXACT = ['localhost'] as const;

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost', '[::1]', '0:0:0:0:0:0:0:1']);

export function isReservedTestDomain(domain: string): boolean {
  const d = domain.trim().toLowerCase();
  if (!d) return false;
  if ((RESERVED_TEST_EXACT as readonly string[]).includes(d)) return true;
  return RESERVED_TEST_SUFFIXES.some((s) => d.endsWith(s));
}

export function isLoopbackHost(host: string): boolean {
  return LOOPBACK_HOSTS.has(host.trim().toLowerCase());
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const daysBetween = (a: Date, b: Date) => Math.abs(a.getTime() - b.getTime()) / 86_400_000;

// ---------------------------------------------------------------------------
// Gate 1 — Authorization
// ---------------------------------------------------------------------------
export function gate1(ctx: SendContext): ReasonCode[] {
  const reasons: ReasonCode[] = [];
  const status = ctx.campaign.status;
  if (status !== CampaignStatus.AUTHORIZED && status !== CampaignStatus.RUNNING) {
    reasons.push(ReasonCode.G1_CAMPAIGN_NOT_AUTHORIZED);
  }
  reasons.push(...checkGrant(ctx.grant, ctx.liveScope, new Date(ctx.now)).reasons);
  return reasons;
}

// ---------------------------------------------------------------------------
// Gate 2 — Roster membership
// ---------------------------------------------------------------------------
export function gate2(ctx: SendContext): ReasonCode[] {
  const reasons: ReasonCode[] = [];
  if (!ctx.participant.onRoster) reasons.push(ReasonCode.G2_NOT_ON_ROSTER);
  if (ctx.grant && ctx.grant.scopeSnapshot.rosterHash !== ctx.liveScope.rosterHash) {
    reasons.push(ReasonCode.G2_ROSTER_HASH_MISMATCH);
  }
  return reasons;
}

// ---------------------------------------------------------------------------
// Gate 3 — Domains
// ---------------------------------------------------------------------------
export function gate3(ctx: SendContext): ReasonCode[] {
  const reasons: ReasonCode[] = [];
  const email = ctx.participant.email ?? '';
  if (!EMAIL_RE.test(email)) {
    reasons.push(ReasonCode.G3_MALFORMED_RECIPIENT);
    return reasons;
  }
  const rd = domainOf(email);
  const approvedInScope = ctx.liveScope.recipientDomains.map((d) => d.toLowerCase());
  const approvedInOrg = ctx.domains.approvedRecipientDomains.map((d) => d.toLowerCase());
  // Must be approved in BOTH the signed scope and the org's verified list.
  if (!approvedInScope.includes(rd) || !approvedInOrg.includes(rd)) {
    reasons.push(ReasonCode.G3_RECIPIENT_DOMAIN_NOT_APPROVED);
  }
  if (!ctx.domains.senderDomainVerified) reasons.push(ReasonCode.G3_SENDER_DOMAIN_UNVERIFIED);
  if (!ctx.domains.landingDomainVerified) reasons.push(ReasonCode.G3_LANDING_DOMAIN_UNVERIFIED);
  return reasons;
}

// ---------------------------------------------------------------------------
// Gate 4 — Suppression and fairness to the individual
// ---------------------------------------------------------------------------
export function gate4(ctx: SendContext): ReasonCode[] {
  const reasons: ReasonCode[] = [];
  const now = new Date(ctx.now);
  const p = ctx.participant;

  if (p.optedOutAt) reasons.push(ReasonCode.G4_SUPPRESSED_OPT_OUT);
  if (p.excludedByHr) reasons.push(ReasonCode.G4_SUPPRESSED_HR);
  if (p.matchesSuppression) reasons.push(ReasonCode.G4_SUPPRESSED_LIST);

  if (p.lastSimulatedAt) {
    const since = daysBetween(now, new Date(p.lastSimulatedAt));
    if (since < ctx.limits.cooldownDays) reasons.push(ReasonCode.G4_COOLDOWN_ACTIVE);
  }
  if (p.joinedAt) {
    const tenure = daysBetween(now, new Date(p.joinedAt));
    if (tenure < ctx.limits.newJoinerGraceDays) reasons.push(ReasonCode.G4_NEW_JOINER_GRACE);
  }
  return reasons;
}

// ---------------------------------------------------------------------------
// Gate 5 — Content safety
// ---------------------------------------------------------------------------
export function gate5(ctx: SendContext): ReasonCode[] {
  const reasons: ReasonCode[] = [];
  const t = ctx.template;
  if (t.lintStatus !== LintStatus.PASS) reasons.push(ReasonCode.G5_TEMPLATE_LINT_FAIL);
  if (t.ethicsStatus === EthicsStatus.BLOCKED) reasons.push(ReasonCode.G5_ETHICS_BLOCKED);
  if (!t.watermarkId) reasons.push(ReasonCode.G5_WATERMARK_MISSING);
  if (!ctx.liveScope.templateIds.includes(t.id)) reasons.push(ReasonCode.G5_TEMPLATE_NOT_IN_SCOPE);
  if (!ctx.liveScope.templateHashes.includes(t.contentHash)) {
    reasons.push(ReasonCode.G5_TEMPLATE_HASH_MISMATCH);
  }
  return reasons;
}

// ---------------------------------------------------------------------------
// Gate 6 — Operations
// ---------------------------------------------------------------------------
export function gate6(ctx: SendContext): ReasonCode[] {
  const reasons: ReasonCode[] = [];
  const now = new Date(ctx.now).getTime();
  if (
    now < new Date(ctx.liveScope.windowStart).getTime() ||
    now > new Date(ctx.liveScope.windowEnd).getTime()
  ) {
    reasons.push(ReasonCode.G6_OUTSIDE_WINDOW);
  }
  if (ctx.campaign.sentInLastHour >= ctx.campaign.rateLimitPerHour) {
    reasons.push(ReasonCode.G6_RATE_LIMIT);
  }
  if (ctx.campaign.killSwitch) reasons.push(ReasonCode.G6_KILL_SWITCH);
  return reasons;
}

// ---------------------------------------------------------------------------
// Gate 7 — Environment
// ---------------------------------------------------------------------------
export function gate7(ctx: SendContext): ReasonCode[] {
  const reasons: ReasonCode[] = [];

  // The mode is inside the signed scope, so a demo campaign cannot be promoted
  // to a live one by changing an environment variable.
  if (ctx.liveScope.mode !== ctx.mode) reasons.push(ReasonCode.G7_MODE_MISMATCH);
  if (ctx.grant && ctx.grant.scopeSnapshot.mode !== ctx.mode) {
    reasons.push(ReasonCode.G7_MODE_MISMATCH);
  }

  if (ctx.mode === RunMode.OFFLINE) {
    if (!isLoopbackHost(ctx.transport.host)) {
      reasons.push(ReasonCode.G7_OFFLINE_MODE_NON_LOCAL_TRANSPORT);
    }
    const rd = domainOf(ctx.participant.email ?? '');
    if (!rd || !isReservedTestDomain(rd)) {
      reasons.push(ReasonCode.G7_OFFLINE_MODE_NON_TEST_DOMAIN);
    }
    for (const d of ctx.liveScope.recipientDomains) {
      if (!isReservedTestDomain(d)) {
        reasons.push(ReasonCode.G7_OFFLINE_MODE_NON_TEST_DOMAIN);
        break;
      }
    }
  }
  return reasons;
}

export const GATES = [
  { n: 1 as const, name: 'Authorization', run: gate1 },
  { n: 2 as const, name: 'Roster', run: gate2 },
  { n: 3 as const, name: 'Domains', run: gate3 },
  { n: 4 as const, name: 'Suppression', run: gate4 },
  { n: 5 as const, name: 'Content', run: gate5 },
  { n: 6 as const, name: 'Operations', run: gate6 },
  { n: 7 as const, name: 'Environment', run: gate7 },
];
