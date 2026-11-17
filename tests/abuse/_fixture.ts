import {
  ApproverSlot,
  CampaignStatus,
  Channel,
  EthicsStatus,
  LintStatus,
  Role,
  RunMode,
  Scenario,
  type ApprovalRecord,
  type CampaignScope,
  type GrantRecord,
  type SendContext,
  type TemplateMeta,
} from '@chetna/core';
import { generateApproverKeyPair, scopeHash, signScope } from '@chetna/audit';

/**
 * A fixture that produces a send context which PASSES all seven gates.
 *
 * Every abuse case below changes exactly one thing and asserts that the policy
 * engine refuses with the right reason code. That is the discipline: if the
 * baseline did not pass, a test could "succeed" for the wrong reason.
 */

export const NOW = '2026-03-10T10:00:00.000Z';

export const securityKeys = generateApproverKeyPair();
export const hrKeys = generateApproverKeyPair();

export const TEMPLATE_HASH = 'a'.repeat(64);

export function makeScope(overrides: Partial<CampaignScope> = {}): CampaignScope {
  return {
    campaignId: 'cmp_demo',
    orgId: 'org_nimbus',
    mode: RunMode.OFFLINE,
    rosterImportId: 'ros_1',
    rosterHash: 'b'.repeat(64),
    participantCount: 240,
    senderDomain: 'mail.nimbus.test',
    landingDomain: 'sso.nimbus-portal.test',
    recipientDomains: ['nimbus.test'],
    templateIds: ['tpl_courier'],
    templateHashes: [TEMPLATE_HASH],
    windowStart: '2026-03-10T09:00:00.000Z',
    windowEnd: '2026-03-10T18:00:00.000Z',
    timezone: 'Asia/Kolkata',
    holdoutPct: 20,
    rateLimitPerHour: 500,
    ethicsOverrideIds: [],
    expiresAt: '2026-03-17T00:00:00.000Z',
    ...overrides,
  };
}

export function makeApprovals(scope: CampaignScope): ApprovalRecord[] {
  return [
    {
      approverId: 'usr_security',
      approverRole: Role.SECURITY_ADMIN,
      approverSlot: ApproverSlot.SECURITY,
      publicKeyPem: securityKeys.publicKeyPem,
      signatureB64: signScope(scope, securityKeys.privateKeyPem),
      signedAt: '2026-03-09T12:00:00.000Z',
      note: 'Scope reviewed against the programme plan.',
    },
    {
      approverId: 'usr_hr',
      approverRole: Role.HR_APPROVER,
      approverSlot: ApproverSlot.PEOPLE,
      publicKeyPem: hrKeys.publicKeyPem,
      signatureB64: signScope(scope, hrKeys.privateKeyPem),
      signedAt: '2026-03-09T14:30:00.000Z',
      note: 'No live appraisal or redundancy process this week.',
    },
  ];
}

export function makeGrant(scope: CampaignScope, overrides: Partial<GrantRecord> = {}): GrantRecord {
  return {
    id: 'grant_1',
    campaignId: scope.campaignId,
    scopeHash: scopeHash(scope),
    scopeSnapshot: scope,
    approvals: makeApprovals(scope),
    expiresAt: scope.expiresAt,
    revokedAt: null,
    revokedReason: null,
    ...overrides,
  };
}

export const TEMPLATE_META: TemplateMeta = {
  name: 'Courier redelivery — customs fee',
  channel: Channel.EMAIL,
  scenario: Scenario.SPEARPHISHING_LINK,
  subject: 'Your parcel is held pending a customs charge',
  fromName: 'Nimbus Courier Updates',
  fromAddress: 'updates@nimbus-courier.test',
  watermarkId: 'chetna-sim-0a1b2c3d4e5f',
  hasSimulationHeaders: true,
};

export function makeContext(mutate: (ctx: SendContext) => void = () => {}): SendContext {
  const scope = makeScope();
  const ctx: SendContext = {
    now: NOW,
    mode: RunMode.OFFLINE,
    campaign: {
      id: scope.campaignId,
      orgId: scope.orgId,
      status: CampaignStatus.AUTHORIZED,
      killSwitch: false,
      rateLimitPerHour: 500,
      sentInLastHour: 12,
    },
    liveScope: scope,
    grant: makeGrant(scope),
    participant: {
      pid: 'p_priya',
      email: 'priya.r@nimbus.test',
      onRoster: true,
      optedOutAt: null,
      excludedByHr: false,
      matchesSuppression: false,
      lastSimulatedAt: '2026-01-01T00:00:00.000Z',
      joinedAt: '2024-01-15T00:00:00.000Z',
    },
    template: {
      id: 'tpl_courier',
      contentHash: TEMPLATE_HASH,
      lintStatus: LintStatus.PASS,
      ethicsStatus: EthicsStatus.CLEAR,
      watermarkId: TEMPLATE_META.watermarkId,
    },
    domains: {
      senderDomainVerified: true,
      landingDomainVerified: true,
      approvedRecipientDomains: ['nimbus.test'],
    },
    transport: { host: '127.0.0.1' },
    limits: { cooldownDays: 30, newJoinerGraceDays: 30 },
  };
  mutate(ctx);
  return ctx;
}

/**
 * Re-sign the grant after a deliberate scope change, so a test can isolate
 * "the roster changed" from "the signature is now wrong".
 */
export function resign(ctx: SendContext): void {
  ctx.grant = makeGrant(ctx.liveScope);
}

/** A safe template a judge can compare the hostile ones against. */
export const SAFE_TEMPLATE_HTML = `
<div style="font-family:Arial,sans-serif">
  <img src="data:image/png;base64,iVBORw0KGgo=" alt="Nimbus Courier" width="120" />
  <p>Hello {{firstName}},</p>
  <p>A parcel addressed to you at {{department}} is held pending a customs charge of
     INR 240. You can review the shipment details below.</p>
  <p><a href="{{clickUrl}}">Review shipment NC-4471-PQ</a></p>
  <p>Regards,<br/>Nimbus Courier Updates</p>
  <p style="font-size:11px;color:#777">
    Not expecting this? <a href="{{reportUrl}}">Report this message</a>.
  </p>
  <img src="{{pixelUrl}}" width="1" height="1" alt="" />
  {{watermark}}
</div>`;
