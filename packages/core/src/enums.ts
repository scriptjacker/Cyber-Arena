/**
 * All enumerations live here, as const objects plus derived union types.
 *
 * Why not Prisma enums? The offline demo runs on SQLite, which Prisma does not
 * support native enums or scalar lists for. These are therefore stored as TEXT
 * and validated in application code against the values below. In Postgres mode
 * they map 1:1 onto native enums (see docs/01-ARCHITECTURE.md §12).
 */

export const Role = {
  OWNER: 'OWNER',
  SECURITY_ADMIN: 'SECURITY_ADMIN',
  HR_APPROVER: 'HR_APPROVER',
  ANALYST: 'ANALYST',
  AUDITOR: 'AUDITOR',
} as const;
export type Role = (typeof Role)[keyof typeof Role];

/** Roles that may sign an AuthorizationGrant, and the slot they fill. */
export const ApproverSlot = {
  SECURITY: 'SECURITY',
  PEOPLE: 'PEOPLE',
} as const;
export type ApproverSlot = (typeof ApproverSlot)[keyof typeof ApproverSlot];

export const ROLE_TO_SLOT: Partial<Record<Role, ApproverSlot>> = {
  OWNER: ApproverSlot.SECURITY,
  SECURITY_ADMIN: ApproverSlot.SECURITY,
  HR_APPROVER: ApproverSlot.PEOPLE,
};

export const ConsentState = {
  NOTIFIED_PROGRAMME: 'NOTIFIED_PROGRAMME',
  OPTED_OUT: 'OPTED_OUT',
  EXCLUDED_BY_HR: 'EXCLUDED_BY_HR',
} as const;
export type ConsentState = (typeof ConsentState)[keyof typeof ConsentState];

export const DomainKind = {
  SENDER: 'SENDER',
  LANDING: 'LANDING',
  RECIPIENT: 'RECIPIENT',
} as const;
export type DomainKind = (typeof DomainKind)[keyof typeof DomainKind];

export const SuppressionScope = {
  EMAIL: 'EMAIL',
  DEPARTMENT: 'DEPARTMENT',
  ROLE_ARCHETYPE: 'ROLE_ARCHETYPE',
} as const;
export type SuppressionScope = (typeof SuppressionScope)[keyof typeof SuppressionScope];

export const Channel = {
  EMAIL: 'EMAIL',
  QR: 'QR',
  SMS_SIM: 'SMS_SIM',
  VOICE_TABLETOP: 'VOICE_TABLETOP',
} as const;
export type Channel = (typeof Channel)[keyof typeof Channel];

/** Detection difficulty FOR THE RECIPIENT. VERY_HIGH = hardest to spot. */
export const Difficulty = {
  VERY_LOW: 'VERY_LOW',
  LOW: 'LOW',
  MODERATE: 'MODERATE',
  HIGH: 'HIGH',
  VERY_HIGH: 'VERY_HIGH',
} as const;
export type Difficulty = (typeof Difficulty)[keyof typeof Difficulty];

export const LintStatus = { PASS: 'PASS', FAIL: 'FAIL' } as const;
export type LintStatus = (typeof LintStatus)[keyof typeof LintStatus];

export const EthicsStatus = {
  CLEAR: 'CLEAR',
  FLAGGED: 'FLAGGED',
  BLOCKED: 'BLOCKED',
  OVERRIDDEN: 'OVERRIDDEN',
} as const;
export type EthicsStatus = (typeof EthicsStatus)[keyof typeof EthicsStatus];

export const CampaignStatus = {
  DRAFT: 'DRAFT',
  PENDING_AUTH: 'PENDING_AUTH',
  AUTHORIZED: 'AUTHORIZED',
  RUNNING: 'RUNNING',
  PAUSED: 'PAUSED',
  COMPLETE: 'COMPLETE',
  PURGED: 'PURGED',
  REJECTED: 'REJECTED',
} as const;
export type CampaignStatus = (typeof CampaignStatus)[keyof typeof CampaignStatus];

export const Arm = { TREATMENT: 'TREATMENT', HOLDOUT: 'HOLDOUT' } as const;
export type Arm = (typeof Arm)[keyof typeof Arm];

export const AssignmentState = {
  QUEUED: 'QUEUED',
  CLAIMED: 'CLAIMED',
  SENT: 'SENT',
  FAILED: 'FAILED',
  BLOCKED: 'BLOCKED',
  SKIPPED: 'SKIPPED',
} as const;
export type AssignmentState = (typeof AssignmentState)[keyof typeof AssignmentState];

export const EventType = {
  QUEUED: 'QUEUED',
  SENT: 'SENT',
  DELIVERED: 'DELIVERED',
  /** Never called "OPEN": pixel loads are unreliable. See docs/01 §6. */
  PROBABLE_OPEN: 'PROBABLE_OPEN',
  CLICK_UNCONFIRMED: 'CLICK_UNCONFIRMED',
  CLICK_CONFIRMED: 'CLICK_CONFIRMED',
  QR_SCAN: 'QR_SCAN',
  /** Saw the look-alike sign-in panel. No input fields exist on it. */
  DECOY_VIEW: 'DECOY_VIEW',
  /** Pressed the decoy "Sign in" button. Behaviour captured, no secret captured. */
  SUBMIT_INTENT: 'SUBMIT_INTENT',
  REPORTED: 'REPORTED',
  TRAINING_START: 'TRAINING_START',
  TRAINING_COMPLETE: 'TRAINING_COMPLETE',
  DRILL_PASS: 'DRILL_PASS',
  DRILL_FAIL: 'DRILL_FAIL',
  OPT_OUT: 'OPT_OUT',
  BLOCKED_BY_POLICY: 'BLOCKED_BY_POLICY',
} as const;
export type EventType = (typeof EventType)[keyof typeof EventType];

/** Outcomes that count as a human failure of the simulation. */
export const FAILURE_EVENTS: readonly EventType[] = [
  EventType.CLICK_CONFIRMED,
  EventType.SUBMIT_INTENT,
  EventType.QR_SCAN,
];

export const ActorClass = {
  HUMAN: 'HUMAN',
  MACHINE: 'MACHINE',
  UNKNOWN: 'UNKNOWN',
} as const;
export type ActorClass = (typeof ActorClass)[keyof typeof ActorClass];

export const IpClass = {
  LOOPBACK: 'LOOPBACK',
  PRIVATE: 'PRIVATE',
  SCANNER: 'SCANNER',
  OTHER: 'OTHER',
} as const;
export type IpClass = (typeof IpClass)[keyof typeof IpClass];

export const Verdict = {
  SIMULATION: 'SIMULATION',
  REAL_THREAT: 'REAL_THREAT',
  BENIGN: 'BENIGN',
  UNREVIEWED: 'UNREVIEWED',
} as const;
export type Verdict = (typeof Verdict)[keyof typeof Verdict];

export const DataClass = {
  CONTACT: 'CONTACT',
  EVENT: 'EVENT',
  TELEMETRY_RAW: 'TELEMETRY_RAW',
  LEARNING: 'LEARNING',
  AUDIT: 'AUDIT',
  REPORT: 'REPORT',
} as const;
export type DataClass = (typeof DataClass)[keyof typeof DataClass];

export const DsarKind = { ACCESS: 'ACCESS', ERASURE: 'ERASURE' } as const;
export type DsarKind = (typeof DsarKind)[keyof typeof DsarKind];

export const RunMode = { OFFLINE: 'offline', LIVE: 'live' } as const;
export type RunMode = (typeof RunMode)[keyof typeof RunMode];

/**
 * MITRE ATT&CK scenario taxonomy. Templates must declare one, so every lure
 * maps to a documented adversary technique rather than someone's imagination.
 */
export const Scenario = {
  SPEARPHISHING_ATTACHMENT: 'T1566.001',
  SPEARPHISHING_LINK: 'T1566.002',
  SPEARPHISHING_VIA_SERVICE: 'T1566.003',
  SPEARPHISHING_VOICE: 'T1566.004',
  PHISHING_FOR_INFORMATION: 'T1598',
} as const;
export type Scenario = (typeof Scenario)[keyof typeof Scenario];

export const SCENARIO_LABEL: Record<Scenario, string> = {
  'T1566.001': 'Spearphishing Attachment',
  'T1566.002': 'Spearphishing Link',
  'T1566.003': 'Spearphishing via Service',
  'T1566.004': 'Spearphishing Voice',
  T1598: 'Phishing for Information',
};

/**
 * Learning-gap taxonomy. A detected cue the participant missed maps to one of
 * these, and each maps to exactly one micro-module — so training is targeted at
 * the gap the person actually showed, never assigned as a blanket course.
 */
export const CueTag = {
  URGENCY: 'URGENCY',
  AUTHORITY: 'AUTHORITY',
  LOOKALIKE_DOMAIN: 'LOOKALIKE_DOMAIN',
  REPLY_TO_MISMATCH: 'REPLY_TO_MISMATCH',
  GENERIC_GREETING: 'GENERIC_GREETING',
  ATTACHMENT_LURE: 'ATTACHMENT_LURE',
  QR_LURE: 'QR_LURE',
  MFA_PUSH: 'MFA_PUSH',
  PAYMENT_CHANGE: 'PAYMENT_CHANGE',
  CREDENTIAL_PROMPT: 'CREDENTIAL_PROMPT',
  SPELLING_GRAMMAR: 'SPELLING_GRAMMAR',
  BRAND_IMPERSONATION: 'BRAND_IMPERSONATION',
  AI_GENERATED_POLISH: 'AI_GENERATED_POLISH',
} as const;
export type CueTag = (typeof CueTag)[keyof typeof CueTag];

/** The five NIST Phish Scale cue categories. */
export const CueCategory = {
  ERRORS: 'ERRORS',
  TECHNICAL_INDICATORS: 'TECHNICAL_INDICATORS',
  VISUAL_PRESENTATION: 'VISUAL_PRESENTATION',
  LANGUAGE_AND_CONTENT: 'LANGUAGE_AND_CONTENT',
  COMMON_TACTICS: 'COMMON_TACTICS',
} as const;
export type CueCategory = (typeof CueCategory)[keyof typeof CueCategory];
