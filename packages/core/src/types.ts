import type {
  ActorClass,
  ApproverSlot,
  Arm,
  CampaignStatus,
  Channel,
  CueCategory,
  CueTag,
  DataClass,
  Difficulty,
  EthicsStatus,
  EventType,
  IpClass,
  LintStatus,
  Role,
  RunMode,
  Scenario,
} from './enums';
import type { ReasonCode } from './reason-codes';

// ---------------------------------------------------------------------------
// Authorization scope — the object two people sign
// ---------------------------------------------------------------------------

/**
 * The complete, frozen description of what a campaign is permitted to do.
 * Its canonical SHA-256 is what approvers sign, and policy gate G1 re-derives
 * it from the live campaign at send time. Anything missing from this object is
 * something an operator could change after approval without detection — so
 * think hard before leaving a field out.
 */
export interface CampaignScope {
  campaignId: string;
  orgId: string;
  mode: RunMode;
  rosterImportId: string;
  rosterHash: string;
  participantCount: number;
  senderDomain: string;
  landingDomain: string;
  recipientDomains: string[];
  templateIds: string[];
  templateHashes: string[];
  windowStart: string; // ISO 8601
  windowEnd: string;
  timezone: string;
  holdoutPct: number;
  rateLimitPerHour: number;
  ethicsOverrideIds: string[];
  expiresAt: string;
}

export interface ApprovalRecord {
  approverId: string;
  approverRole: Role;
  approverSlot: ApproverSlot;
  publicKeyPem: string;
  signatureB64: string;
  signedAt: string;
  note?: string;
}

export interface GrantRecord {
  id: string;
  campaignId: string;
  scopeHash: string;
  scopeSnapshot: CampaignScope;
  approvals: ApprovalRecord[];
  expiresAt: string;
  revokedAt?: string | null;
  revokedReason?: string | null;
}

// ---------------------------------------------------------------------------
// Policy engine
// ---------------------------------------------------------------------------

export interface PolicyDecision {
  allow: boolean;
  /** EVERY failure, not just the first — the preflight panel shows all of them. */
  reasons: ReasonCode[];
  /** The lowest-numbered gate that failed. */
  gate: 1 | 2 | 3 | 4 | 5 | 6 | 7 | null;
  evaluatedAt: string;
  /** Hash of the inputs judged, so an audit entry is reproducible. */
  inputsHash: string;
}

export interface PolicyParticipantView {
  pid: string;
  email: string;
  onRoster: boolean;
  optedOutAt?: string | null;
  excludedByHr?: boolean;
  matchesSuppression?: boolean;
  /** Last time this person received ANY simulation, across campaigns. */
  lastSimulatedAt?: string | null;
  joinedAt?: string | null;
}

export interface PolicyTemplateView {
  id: string;
  contentHash: string;
  lintStatus: LintStatus;
  ethicsStatus: EthicsStatus;
  watermarkId?: string | null;
}

export interface PolicyCampaignView {
  id: string;
  orgId: string;
  status: CampaignStatus;
  killSwitch: boolean;
  rateLimitPerHour: number;
  sentInLastHour: number;
}

export interface PolicyDomainView {
  senderDomainVerified: boolean;
  landingDomainVerified: boolean;
  approvedRecipientDomains: string[];
}

export interface PolicyLimits {
  cooldownDays: number;
  newJoinerGraceDays: number;
}

/** Everything gate evaluation needs. No I/O happens inside the policy engine. */
export interface SendContext {
  now: string;
  mode: RunMode;
  campaign: PolicyCampaignView;
  /** Scope re-derived from live data at send time; compared against the grant. */
  liveScope: CampaignScope;
  grant: GrantRecord | null;
  participant: PolicyParticipantView;
  template: PolicyTemplateView;
  domains: PolicyDomainView;
  transport: { host: string };
  limits: PolicyLimits;
}

// ---------------------------------------------------------------------------
// Content safety results
// ---------------------------------------------------------------------------

export interface LintFinding {
  ruleId: string;
  severity: 'FAIL' | 'WARN';
  message: string;
  /** What the author should do about it, in one sentence. */
  remedy: string;
  snippet?: string;
}

export interface LintResult {
  status: LintStatus;
  findings: LintFinding[];
  rulesRun: string[];
  contentHash: string;
}

export interface EthicsFinding {
  themeId: string;
  label: string;
  severity: 'BLOCK' | 'CAUTION';
  matched: string[];
  rationale: string;
  /** A real incident where this lure theme caused documented harm. */
  precedent?: { title: string; summary: string; source: string };
}

export interface EthicsResult {
  status: EthicsStatus;
  findings: EthicsFinding[];
}

// ---------------------------------------------------------------------------
// NIST Phish Scale
// ---------------------------------------------------------------------------

export interface DetectedCue {
  id: string;
  category: CueCategory;
  tag: CueTag;
  label: string;
  /** Why this is a cue, shown on hover in the teachable moment. */
  explanation: string;
  /** Where it is, so the overlay can highlight it in the original email. */
  anchor?: { text: string; occurrence: number };
}

export type CueCountBand = 'FEW' | 'SOME' | 'MANY';
export type PremiseBand = 'LOW' | 'MEDIUM' | 'HIGH';

export interface PhishScaleResult {
  cues: DetectedCue[];
  cueCount: number;
  cueCountBand: CueCountBand;
  /** Operator-set, 1..5. How well the lure fits the audience's real work. */
  premiseAlignment: number;
  premiseBand: PremiseBand;
  difficulty: Difficulty;
  /** Weight applied to outcomes on this template in difficulty-adjusted metrics. */
  difficultyWeight: number;
  byCategory: Record<CueCategory, number>;
}

// ---------------------------------------------------------------------------
// Privacy
// ---------------------------------------------------------------------------

/**
 * A discriminated union, deliberately. Every caller is forced by the compiler
 * to render the suppressed state, so a privacy failure becomes a build failure.
 */
export type KGuarded<T> =
  | { ok: true; data: T }
  | { ok: false; suppressed: true; k: number; cohortSize: number; reason: string };

export interface CohortRow {
  key: string;
  label: string;
  cohortSize: number;
  delivered: number;
  failures: number;
  reports: number;
  machineFiltered: number;
}

// ---------------------------------------------------------------------------
// Telemetry
// ---------------------------------------------------------------------------

export interface EventMeta {
  cueId?: string;
  moduleSlug?: string;
  dwellMs?: number;
  drillScore?: number;
  clusterKey?: string;
  reasonCode?: ReasonCode;
  channel?: Channel;
}

export interface EventInput {
  assignmentId: string;
  type: EventType;
  at: string;
  actorClass: ActorClass;
  machineScore: number;
  uaFamily?: string | null;
  ipClass?: IpClass | null;
  meta?: EventMeta;
}

export interface MachineSignals {
  msSinceSent?: number;
  userAgent?: string;
  ipClass?: IpClass;
  secFetchMode?: string;
  hadLaterInteraction?: boolean;
}

export interface MachineAssessment {
  score: number;
  actorClass: ActorClass;
  signals: string[];
  uaFamily: string;
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

export interface Interval {
  lower: number;
  upper: number;
}

export interface ProportionEstimate {
  n: number;
  x: number;
  p: number;
  ci95: Interval;
}

export interface HoldoutResult {
  treatment: ProportionEstimate;
  holdout: ProportionEstimate;
  /** holdout failure rate − treatment failure rate. Positive = training helped. */
  difference: number;
  differenceCi95: Interval;
  significant: boolean;
  verdict: string;
}

export interface CampaignMetrics {
  delivered: number;
  probableOpens: number;
  machineFiltered: number;
  humanOpens: number;
  clicksConfirmed: number;
  clicksUnconfirmed: number;
  submitIntents: number;
  failures: number;
  reports: number;
  reportRate: number;
  failureRate: number;
  resilienceRatio: number;
  medianTimeToReportMs: number | null;
  difficultyAdjustedFailureRate: number;
  trainingCompletionRate: number;
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

export interface AuditEntryInput {
  orgId: string;
  actorId?: string | null;
  actorRole?: Role | null;
  action: string;
  reasonCode?: ReasonCode | null;
  payload: unknown;
  at?: string;
}

export interface AuditEntryRecord {
  seq: number;
  orgId: string;
  at: string;
  actorId: string | null;
  actorRole: Role | null;
  action: string;
  reasonCode: ReasonCode | null;
  payloadHash: string;
  payloadJson: string;
  prevHash: string;
  hash: string;
}

export interface ChainVerification {
  ok: boolean;
  entriesChecked: number;
  merkleRoot: string | null;
  firstBadSeq: number | null;
  problem: string | null;
}

// ---------------------------------------------------------------------------
// Retention
// ---------------------------------------------------------------------------

export interface RetentionRuleView {
  dataClass: DataClass;
  retainDays: number;
}

export interface PurgePlan {
  dataClass: DataClass;
  cutoffAt: string;
  retainDays: number;
  purgeable: boolean;
  note?: string;
}

// ---------------------------------------------------------------------------
// Misc shared shapes
// ---------------------------------------------------------------------------

export interface AudienceContext {
  orgName: string;
  department?: string;
  roleArchetype?: string;
  /** Themes that genuinely occur in this audience's work; raises premise alignment. */
  plausibleThemes?: string[];
}

export interface TemplateMeta {
  name: string;
  channel: Channel;
  scenario: Scenario;
  subject: string;
  fromName: string;
  fromAddress: string;
  watermarkId: string;
  hasSimulationHeaders: boolean;
  attachments?: { filename: string; contentType: string }[];
}

export interface AssignmentView {
  id: string;
  arm: Arm;
  stratum: string;
  token: string;
}
