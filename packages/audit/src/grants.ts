import {
  ApproverSlot,
  hashCanonical,
  ReasonCode,
  ROLE_TO_SLOT,
  type ApprovalRecord,
  type CampaignScope,
  type GrantRecord,
  type Role,
} from '@chetna/core';
import { signMessage, verifyMessage } from './keys';

/**
 * The scope hash is what approvers sign. It is derived from the canonical form
 * of the scope, so two structurally identical scopes always hash identically —
 * and any change at all produces a different hash, which is exactly how gate
 * G1 detects scope drift.
 */
export function scopeHash(scope: CampaignScope): string {
  return hashCanonical(scope);
}

/** What a human is actually asked to sign, shown verbatim in the approval UI. */
export function approvalPayload(scope: CampaignScope): string {
  return [
    'CHETNA AUTHORIZATION GRANT',
    `campaign=${scope.campaignId}`,
    `mode=${scope.mode}`,
    `participants=${scope.participantCount}`,
    `roster=${scope.rosterHash}`,
    `sender=${scope.senderDomain}`,
    `landing=${scope.landingDomain}`,
    `recipients=${[...scope.recipientDomains].sort().join(',')}`,
    `templates=${[...scope.templateHashes].sort().join(',')}`,
    `window=${scope.windowStart}/${scope.windowEnd}`,
    `expires=${scope.expiresAt}`,
    `scopeHash=${scopeHash(scope)}`,
  ].join('\n');
}

export function signScope(scope: CampaignScope, privateKeyPem: string): string {
  return signMessage(approvalPayload(scope), privateKeyPem);
}

export function slotForRole(role: Role): ApproverSlot | null {
  return ROLE_TO_SLOT[role] ?? null;
}

export interface GrantCheck {
  valid: boolean;
  reasons: ReasonCode[];
}

/**
 * Dual control, checked properly.
 *
 * Requires: a grant exists; it is unexpired and unrevoked; it carries at least
 * two approvals; those approvals come from two DIFFERENT people filling two
 * DIFFERENT slots (one security, one people/HR); every signature verifies
 * against the signed payload; and the hash the approvers signed still matches
 * the live scope.
 */
export function checkGrant(
  grant: GrantRecord | null,
  liveScope: CampaignScope,
  now: Date,
): GrantCheck {
  const reasons: ReasonCode[] = [];
  if (!grant) return { valid: false, reasons: [ReasonCode.G1_NO_GRANT] };

  if (grant.revokedAt) reasons.push(ReasonCode.G1_GRANT_REVOKED);
  if (new Date(grant.expiresAt).getTime() <= now.getTime()) {
    reasons.push(ReasonCode.G1_GRANT_EXPIRED);
  }

  const approvals = grant.approvals ?? [];
  if (approvals.length < 2) reasons.push(ReasonCode.G1_INSUFFICIENT_APPROVALS);

  const approverIds = new Set(approvals.map((a) => a.approverId));
  if (approvals.length >= 2 && approverIds.size < approvals.length) {
    reasons.push(ReasonCode.G1_APPROVERS_NOT_DISTINCT);
  }

  const slots = new Set(approvals.map((a) => a.approverSlot));
  if (!(slots.has(ApproverSlot.SECURITY) && slots.has(ApproverSlot.PEOPLE))) {
    reasons.push(ReasonCode.G1_APPROVER_SLOTS_NOT_DISTINCT);
  }

  // Signatures are verified against the payload for the scope the approvers
  // snapshotted, not the live one — otherwise scope drift would masquerade as a
  // forged signature and we would report the wrong reason.
  const signedPayload = approvalPayload(grant.scopeSnapshot);
  const allSignaturesValid = approvals.every((a: ApprovalRecord) =>
    verifyMessage(signedPayload, a.signatureB64, a.publicKeyPem),
  );
  if (!allSignaturesValid) reasons.push(ReasonCode.G1_SIGNATURE_INVALID);

  // The snapshot must itself be internally consistent...
  if (scopeHash(grant.scopeSnapshot) !== grant.scopeHash) {
    reasons.push(ReasonCode.G1_SIGNATURE_INVALID);
  }
  // ...and must still describe the campaign as it is right now.
  if (scopeHash(liveScope) !== grant.scopeHash) {
    reasons.push(ReasonCode.G1_SCOPE_DRIFT);
  }

  return { valid: reasons.length === 0, reasons };
}

/**
 * Human-readable diff of what changed since approval. The preflight panel shows
 * this so an operator can see precisely which edit invalidated the grant.
 */
export function scopeDiff(signed: CampaignScope, live: CampaignScope): string[] {
  const out: string[] = [];
  const keys = new Set([...Object.keys(signed), ...Object.keys(live)]) as Set<keyof CampaignScope>;
  for (const key of [...keys].sort()) {
    const a = JSON.stringify(signed[key]);
    const b = JSON.stringify(live[key]);
    if (a !== b) out.push(`${key}: approved ${a} → now ${b}`);
  }
  return out;
}
