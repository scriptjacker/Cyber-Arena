'use server';

import { revalidatePath } from 'next/cache';
import {
  ApproverSlot,
  CampaignStatus,
  newId,
  reasonText,
  ROLE_TO_SLOT,
  type PolicyDecision,
  type Role,
} from '@chetna/core';
import { approvalPayload, scopeHash, signScope } from '@chetna/audit';
import {
  auditRepo,
  buildHypotheticalContext,
  buildLiveScope,
  loadGrant,
  prisma,
  writeJson,
} from '@chetna/db';
import { evaluate } from '@chetna/policy';
import { can, requireCapability, requireSession, type SessionUser } from '../session';
import { loadApproverKeys } from '../signing';

export interface ActionResult {
  ok: boolean;
  error?: string;
  message?: string;
}

/**
 * Put a campaign up for authorization.
 *
 * The grant is created empty and the scope is SNAPSHOTTED here, from live data.
 * Approvers then sign that snapshot. If anything about the campaign changes
 * afterwards, gate G1 re-derives the scope at send time, finds a different
 * hash, and refuses — which is `G1_SCOPE_DRIFT`.
 */
export async function requestAuthorization(campaignId: string): Promise<ActionResult> {
  const user = await requireCapability('campaign:write');

  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign || campaign.orgId !== user.orgId) return { ok: false, error: 'Unknown campaign.' };

  const scope = await buildLiveScope(campaignId);
  if (!scope) return { ok: false, error: 'The campaign scope could not be derived.' };

  // Re-requesting replaces any previous grant: a scope that has changed must be
  // signed again from scratch, never topped up with one stale approval.
  await prisma.approval.deleteMany({ where: { grant: { campaignId } } });
  await prisma.authorizationGrant.deleteMany({ where: { campaignId } });

  await prisma.authorizationGrant.create({
    data: {
      id: newId('grant'),
      campaignId,
      scopeHash: scopeHash(scope),
      scopeSnapshotJson: writeJson(scope),
      expiresAt: new Date(scope.expiresAt),
    },
  });
  await prisma.campaign.update({
    where: { id: campaignId },
    data: { status: CampaignStatus.PENDING_AUTH },
  });

  await auditRepo.append({
    orgId: user.orgId,
    actorId: user.id,
    actorRole: user.role,
    action: 'authorization.requested',
    payload: { campaignId, scopeHash: scopeHash(scope), participantCount: scope.participantCount },
  });

  revalidatePath(`/campaigns/${campaignId}`);
  return { ok: true, message: 'Authorization requested. Two approvers must now sign.' };
}

function slotFor(user: SessionUser): ApproverSlot | null {
  return ROLE_TO_SLOT[user.role as Role] ?? null;
}

/**
 * Sign an authorization grant.
 *
 * The checks here are the whole dual-control model:
 *   - the signer's role must map to a slot (security or people/HR)
 *   - that slot must still be empty, so one side cannot sign twice
 *   - the signer must not already have signed, so one person cannot fill both
 *   - the signature covers the frozen scope snapshot, not the live campaign
 *
 * The unique constraints on `(grantId, approverId)` and `(grantId,
 * approverSlot)` enforce the same two rules at the database level, so a race
 * cannot defeat them either.
 */
export async function signAuthorization(campaignId: string): Promise<ActionResult> {
  const user = await requireSession();

  // Which slot this person fills is determined by their ACTUAL role, and the
  // capability checked is the one for that slot. Deriving it the other way
  // round — picking a capability and then trusting it — is how dual control
  // quietly becomes single control.
  const slot = slotFor(user);
  if (!slot) {
    return {
      ok: false,
      error: `${user.role} cannot sign an authorization grant. A grant needs one security approver and one people/HR approver.`,
    };
  }

  const capability = slot === ApproverSlot.PEOPLE ? 'authorize:people' : 'authorize:security';
  if (!can(user.role, capability)) {
    return { ok: false, error: `This role may not perform "${capability}".` };
  }

  return signAs(user, campaignId);
}

async function signAs(user: SessionUser, campaignId: string): Promise<ActionResult> {
  const slot = slotFor(user);
  if (!slot) {
    return { ok: false, error: 'This role cannot sign an authorization grant.' };
  }

  const grant = await prisma.authorizationGrant.findUnique({
    where: { campaignId },
    include: { approvals: true },
  });
  if (!grant) return { ok: false, error: 'No grant exists. Request authorization first.' };

  if (grant.approvals.some((a) => a.approverId === user.id)) {
    return { ok: false, error: 'You have already signed this grant. Dual control needs two people.' };
  }
  if (grant.approvals.some((a) => a.approverSlot === slot)) {
    return {
      ok: false,
      error: `The ${slot === ApproverSlot.SECURITY ? 'security' : 'people/HR'} approval is already recorded. The second signature must come from the other side of the business.`,
    };
  }

  const snapshot = JSON.parse(grant.scopeSnapshotJson);
  let keys;
  try {
    keys = loadApproverKeys(user.id);
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }

  await prisma.approval.create({
    data: {
      id: newId('appr'),
      grantId: grant.id,
      approverId: user.id,
      approverRole: user.role,
      approverSlot: slot,
      publicKeyPem: keys.publicKeyPem,
      signatureB64: signScope(snapshot, keys.privateKeyPem),
    },
  });

  await auditRepo.append({
    orgId: user.orgId,
    actorId: user.id,
    actorRole: user.role,
    action: 'authorization.signed',
    payload: {
      campaignId,
      slot,
      scopeHash: grant.scopeHash,
      payloadSigned: approvalPayload(snapshot),
    },
  });

  const total = grant.approvals.length + 1;
  if (total >= 2) {
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: CampaignStatus.AUTHORIZED },
    });
    await auditRepo.append({
      orgId: user.orgId,
      actorId: user.id,
      actorRole: user.role,
      action: 'campaign.authorized',
      payload: { campaignId, approvals: total, scopeHash: grant.scopeHash },
    });
  }

  revalidatePath(`/campaigns/${campaignId}`);
  return {
    ok: true,
    message:
      total >= 2
        ? 'Both signatures recorded. The campaign is authorized and the worker may send.'
        : 'Your signature is recorded. One more is required, from the other side of the business.',
  };
}

export async function revokeAuthorization(
  campaignId: string,
  reason: string,
): Promise<ActionResult> {
  const user = await requireCapability('campaign:write');
  if (reason.trim().length < 5) return { ok: false, error: 'Give a reason for the revocation.' };

  const grant = await loadGrant(campaignId);
  if (!grant) return { ok: false, error: 'No grant to revoke.' };

  await prisma.authorizationGrant.update({
    where: { campaignId },
    data: { revokedAt: new Date(), revokedReason: reason.trim() },
  });
  await prisma.campaign.update({
    where: { id: campaignId },
    data: { status: CampaignStatus.PAUSED },
  });
  await auditRepo.append({
    orgId: user.orgId,
    actorId: user.id,
    actorRole: user.role,
    action: 'authorization.revoked',
    payload: { campaignId, reason: reason.trim() },
  });

  revalidatePath(`/campaigns/${campaignId}`);
  return {
    ok: true,
    message: 'Grant revoked. The next message the worker attempts will be refused at gate G1.',
  };
}

export async function setKillSwitch(campaignId: string, on: boolean): Promise<ActionResult> {
  const user = await requireCapability('campaign:killswitch');
  await prisma.campaign.update({ where: { id: campaignId }, data: { killSwitch: on } });
  await auditRepo.append({
    orgId: user.orgId,
    actorId: user.id,
    actorRole: user.role,
    action: on ? 'campaign.killswitch_engaged' : 'campaign.killswitch_released',
    payload: { campaignId },
  });
  revalidatePath(`/campaigns/${campaignId}`);
  return {
    ok: true,
    message: on
      ? 'Kill switch engaged. Every further send is refused at gate G6, starting with the next message.'
      : 'Kill switch released.',
  };
}

/**
 * Dry-run the seven gates against an arbitrary address.
 *
 * This is the "what if someone put the wrong address in" test, and it is the
 * fastest way to see the scope guard work: an external address is refused by
 * G2 (not on the signed roster), G3 (domain not approved) and G7 (offline mode
 * permits reserved test domains only) simultaneously.
 *
 * Nothing is written and nothing is sent.
 */
export async function testRecipient(
  campaignId: string,
  email: string,
): Promise<{ ok: boolean; decision?: PolicyDecision; reasons?: string[]; error?: string }> {
  await requireCapability('campaign:write');

  const trimmed = email.trim();
  if (!trimmed) return { ok: false, error: 'Enter an address to test.' };

  const ctx = await buildHypotheticalContext(campaignId, trimmed);
  if (!ctx) return { ok: false, error: 'This campaign has no roster to evaluate against.' };

  const decision = evaluate(ctx);
  return {
    ok: true,
    decision,
    reasons: decision.reasons.map((r) => `${r} — ${reasonText(r)}`),
  };
}
