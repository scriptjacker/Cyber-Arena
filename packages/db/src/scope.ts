import {
  DomainKind,
  hashRoster,
  type ApprovalRecord,
  type ApproverSlot,
  type CampaignScope,
  type GrantRecord,
  type PolicyDomainView,
  type Role,
  type RunMode,
} from '@chetna/core';
import { prisma } from './client';
import { readJson, readStringArray } from './json';

/**
 * Re-derive the campaign scope from live data.
 *
 * This function is the counterpart to the approvers' signatures: gate G1 hashes
 * what this returns and compares it to what was signed. Anything an operator
 * could change after approval MUST be reflected here, or the change would go
 * undetected. Adding a field to CampaignScope means adding it here too.
 */
export async function buildLiveScope(campaignId: string): Promise<CampaignScope | null> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: { rosterImport: true },
  });
  if (!campaign) return null;

  const pids = await rosterPids(campaign.rosterImportId);
  const templateIds = readStringArray(campaign.templateIdsJson);

  // Hashes are ordered to match templateIds, so the pair is deterministic.
  const templates = await prisma.template.findMany({
    where: { id: { in: templateIds } },
    select: { id: true, contentHash: true },
  });
  const hashById = new Map(templates.map((t) => [t.id, t.contentHash]));
  const templateHashes = templateIds.map((id) => hashById.get(id) ?? 'MISSING');

  return {
    campaignId: campaign.id,
    orgId: campaign.orgId,
    mode: campaign.mode as RunMode,
    rosterImportId: campaign.rosterImportId,
    rosterHash: hashRoster(pids, campaign.rosterImportId),
    participantCount: pids.length,
    senderDomain: campaign.senderDomain,
    landingDomain: campaign.landingDomain,
    recipientDomains: readStringArray(campaign.recipientDomainsJson),
    templateIds,
    templateHashes,
    windowStart: campaign.windowStart.toISOString(),
    windowEnd: campaign.windowEnd.toISOString(),
    timezone: campaign.timezone,
    holdoutPct: campaign.holdoutPct,
    rateLimitPerHour: campaign.rateLimitPerHour,
    ethicsOverrideIds: await ethicsOverrideIds(templateIds),
    // Authorization never outlives the approved send window. One fewer dial to
    // get wrong, and it means a grant cannot be quietly stretched by extending
    // an expiry without also extending the window — which is itself scope drift.
    expiresAt: campaign.windowEnd.toISOString(),
  };
}

export async function rosterPids(rosterImportId: string): Promise<string[]> {
  const members = await prisma.rosterMember.findMany({
    where: { rosterImportId },
    select: { participant: { select: { pid: true } } },
  });
  return members.map((m) => m.participant.pid);
}

async function ethicsOverrideIds(templateIds: readonly string[]): Promise<string[]> {
  if (templateIds.length === 0) return [];
  const overrides = await prisma.ethicsOverride.findMany({
    where: { templateId: { in: [...templateIds] } },
    select: { id: true },
    orderBy: { id: 'asc' },
  });
  return overrides.map((o) => o.id);
}

/** Load the grant, including the frozen snapshot the approvers actually signed. */
export async function loadGrant(campaignId: string): Promise<GrantRecord | null> {
  const grant = await prisma.authorizationGrant.findUnique({
    where: { campaignId },
    include: { approvals: { orderBy: { signedAt: 'asc' } } },
  });
  if (!grant) return null;

  const snapshot = readJson<CampaignScope | null>(grant.scopeSnapshotJson, null);
  if (!snapshot) return null;

  const approvals: ApprovalRecord[] = grant.approvals.map((a) => ({
    approverId: a.approverId,
    approverRole: a.approverRole as Role,
    approverSlot: a.approverSlot as ApproverSlot,
    publicKeyPem: a.publicKeyPem,
    signatureB64: a.signatureB64,
    signedAt: a.signedAt.toISOString(),
    ...(a.note ? { note: a.note } : {}),
  }));

  return {
    id: grant.id,
    campaignId: grant.campaignId,
    scopeHash: grant.scopeHash,
    scopeSnapshot: snapshot,
    approvals,
    expiresAt: grant.expiresAt.toISOString(),
    revokedAt: grant.revokedAt ? grant.revokedAt.toISOString() : null,
    revokedReason: grant.revokedReason,
  };
}

/**
 * Domain verification state.
 *
 * A domain counts as usable only when an ownership challenge has been recorded.
 * In offline mode the CLI records a `stub` verification against the reserved
 * test domains; in live mode this is a DNS TXT lookup (roadmap item, with the
 * record shape already in place).
 */
export async function loadDomains(
  orgId: string,
  senderDomain: string,
  landingDomain: string,
): Promise<PolicyDomainView> {
  const rows = await prisma.approvedDomain.findMany({ where: { orgId } });
  const verified = (domain: string, kind: string) =>
    rows.some(
      (r) => r.domain.toLowerCase() === domain.toLowerCase() && r.kind === kind && r.verifiedAt,
    );

  return {
    senderDomainVerified: verified(senderDomain, DomainKind.SENDER),
    landingDomainVerified: verified(landingDomain, DomainKind.LANDING),
    approvedRecipientDomains: rows
      .filter((r) => r.kind === DomainKind.RECIPIENT && r.verifiedAt)
      .map((r) => r.domain.toLowerCase()),
  };
}
