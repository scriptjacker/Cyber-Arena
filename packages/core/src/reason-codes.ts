/**
 * Every refusal in this platform has a code, and every code has a sentence a
 * human can read. The preflight panel, the audit log and the abuse suite all
 * speak this vocabulary.
 */
export const ReasonCode = {
  ALLOW: 'ALLOW',

  // G1 — authorization
  G1_NO_GRANT: 'G1_NO_GRANT',
  G1_GRANT_EXPIRED: 'G1_GRANT_EXPIRED',
  G1_GRANT_REVOKED: 'G1_GRANT_REVOKED',
  G1_INSUFFICIENT_APPROVALS: 'G1_INSUFFICIENT_APPROVALS',
  G1_APPROVERS_NOT_DISTINCT: 'G1_APPROVERS_NOT_DISTINCT',
  G1_APPROVER_SLOTS_NOT_DISTINCT: 'G1_APPROVER_SLOTS_NOT_DISTINCT',
  G1_SIGNATURE_INVALID: 'G1_SIGNATURE_INVALID',
  G1_SCOPE_DRIFT: 'G1_SCOPE_DRIFT',
  G1_CAMPAIGN_NOT_AUTHORIZED: 'G1_CAMPAIGN_NOT_AUTHORIZED',

  // G2 — roster
  G2_NOT_ON_ROSTER: 'G2_NOT_ON_ROSTER',
  G2_ROSTER_HASH_MISMATCH: 'G2_ROSTER_HASH_MISMATCH',

  // G3 — domains
  G3_RECIPIENT_DOMAIN_NOT_APPROVED: 'G3_RECIPIENT_DOMAIN_NOT_APPROVED',
  G3_SENDER_DOMAIN_UNVERIFIED: 'G3_SENDER_DOMAIN_UNVERIFIED',
  G3_LANDING_DOMAIN_UNVERIFIED: 'G3_LANDING_DOMAIN_UNVERIFIED',
  G3_MALFORMED_RECIPIENT: 'G3_MALFORMED_RECIPIENT',

  // G4 — suppression & fairness to the individual
  G4_SUPPRESSED_OPT_OUT: 'G4_SUPPRESSED_OPT_OUT',
  G4_SUPPRESSED_HR: 'G4_SUPPRESSED_HR',
  G4_SUPPRESSED_LIST: 'G4_SUPPRESSED_LIST',
  G4_COOLDOWN_ACTIVE: 'G4_COOLDOWN_ACTIVE',
  G4_NEW_JOINER_GRACE: 'G4_NEW_JOINER_GRACE',

  // G5 — content safety
  G5_TEMPLATE_LINT_FAIL: 'G5_TEMPLATE_LINT_FAIL',
  G5_ETHICS_BLOCKED: 'G5_ETHICS_BLOCKED',
  G5_WATERMARK_MISSING: 'G5_WATERMARK_MISSING',
  G5_TEMPLATE_NOT_IN_SCOPE: 'G5_TEMPLATE_NOT_IN_SCOPE',
  G5_TEMPLATE_HASH_MISMATCH: 'G5_TEMPLATE_HASH_MISMATCH',

  // G6 — operations
  G6_OUTSIDE_WINDOW: 'G6_OUTSIDE_WINDOW',
  G6_RATE_LIMIT: 'G6_RATE_LIMIT',
  G6_KILL_SWITCH: 'G6_KILL_SWITCH',

  // G7 — environment
  G7_OFFLINE_MODE_NON_LOCAL_TRANSPORT: 'G7_OFFLINE_MODE_NON_LOCAL_TRANSPORT',
  G7_OFFLINE_MODE_NON_TEST_DOMAIN: 'G7_OFFLINE_MODE_NON_TEST_DOMAIN',
  G7_MODE_MISMATCH: 'G7_MODE_MISMATCH',
} as const;
export type ReasonCode = (typeof ReasonCode)[keyof typeof ReasonCode];

export const REASON_TEXT: Record<ReasonCode, string> = {
  ALLOW: 'All seven gates passed.',

  G1_NO_GRANT: 'This campaign has no authorization grant. Two approvers must sign before it can send.',
  G1_GRANT_EXPIRED: 'The authorization grant has expired. Re-request approval.',
  G1_GRANT_REVOKED: 'The authorization grant was revoked.',
  G1_INSUFFICIENT_APPROVALS: 'Fewer than two approvals are recorded on the grant.',
  G1_APPROVERS_NOT_DISTINCT: 'The same person signed twice. Dual control requires two different people.',
  G1_APPROVER_SLOTS_NOT_DISTINCT:
    'Both approvals came from the same side of the business. One security approver and one people/HR approver are required.',
  G1_SIGNATURE_INVALID: 'An approval signature failed Ed25519 verification.',
  G1_SCOPE_DRIFT:
    'The campaign has changed since it was approved. The approvers signed a different scope, so this send is blocked.',
  G1_CAMPAIGN_NOT_AUTHORIZED: 'The campaign is not in an authorized or running state.',

  G2_NOT_ON_ROSTER: 'This recipient is not on the roster the approvers signed.',
  G2_ROSTER_HASH_MISMATCH: 'The roster has been modified since approval.',

  G3_RECIPIENT_DOMAIN_NOT_APPROVED: "The recipient's domain is not on the approved recipient list.",
  G3_SENDER_DOMAIN_UNVERIFIED: 'The sending domain has not passed ownership verification.',
  G3_LANDING_DOMAIN_UNVERIFIED: 'The landing domain has not passed ownership verification.',
  G3_MALFORMED_RECIPIENT: 'The recipient address is not a valid email address.',

  G4_SUPPRESSED_OPT_OUT: 'This participant has opted out of simulations.',
  G4_SUPPRESSED_HR: 'This participant is excluded by HR.',
  G4_SUPPRESSED_LIST: 'This participant matches an active suppression rule.',
  G4_COOLDOWN_ACTIVE: 'This participant was simulated too recently. Over-testing is a harm in itself.',
  G4_NEW_JOINER_GRACE: 'This participant is inside the new-joiner grace period.',

  G5_TEMPLATE_LINT_FAIL: 'The template failed safety linting and cannot be sent.',
  G5_ETHICS_BLOCKED:
    'The template was blocked by the harmful-lure screen and has no signed HR override.',
  G5_WATERMARK_MISSING: 'The template has no simulation watermark.',
  G5_TEMPLATE_NOT_IN_SCOPE: 'This template was not part of the approved scope.',
  G5_TEMPLATE_HASH_MISMATCH: 'The template content changed after approval.',

  G6_OUTSIDE_WINDOW: 'The current time is outside the authorized send window.',
  G6_RATE_LIMIT: 'The campaign has hit its hourly send limit.',
  G6_KILL_SWITCH: 'The kill switch is engaged for this campaign.',

  G7_OFFLINE_MODE_NON_LOCAL_TRANSPORT:
    'Offline mode permits loopback mail transport only. This transport is not local.',
  G7_OFFLINE_MODE_NON_TEST_DOMAIN:
    'Offline mode permits reserved test domains only (.test, .example, .invalid, localhost). A real inbox cannot be reached.',
  G7_MODE_MISMATCH:
    'The run mode differs from the mode the approvers signed. A demo campaign cannot be escalated to a live one.',
};

export function reasonText(code: ReasonCode): string {
  return REASON_TEXT[code] ?? code;
}

/** Which gate a code belongs to, for the preflight UI. */
export function gateOf(code: ReasonCode): 1 | 2 | 3 | 4 | 5 | 6 | 7 | null {
  if (code === ReasonCode.ALLOW) return null;
  const n = Number(code.charAt(1));
  return n >= 1 && n <= 7 ? (n as 1 | 2 | 3 | 4 | 5 | 6 | 7) : null;
}
