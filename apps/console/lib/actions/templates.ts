'use server';

import { revalidatePath } from 'next/cache';
import {
  Channel,
  EthicsStatus,
  LintStatus,
  newId,
  newWatermarkId,
  Scenario,
  TemplateInputSchema,
  type EthicsResult,
  type LintResult,
  type PhishScaleResult,
  type TemplateMeta,
} from '@chetna/core';
import { signMessage } from '@chetna/audit';
import { auditRepo, prisma, writeJson } from '@chetna/db';
import { runLint } from '@chetna/safety-lint';
import { screenTemplate } from '@chetna/ethics';
import { scoreTemplate } from '@chetna/phishscale';
import { requireCapability } from '../session';
import { loadApproverKeys } from '../signing';

const ORG_DOMAIN = 'nimbus.test';

export interface ScreenResult {
  lint: LintResult;
  ethics: EthicsResult;
  scale: PhishScaleResult;
  canSave: boolean;
  blockedThemes: string[];
}

function metaFor(input: {
  name: string;
  channel: string;
  scenario: string;
  subject: string;
  fromName: string;
  fromAddress: string;
}): TemplateMeta {
  return {
    name: input.name || 'Untitled',
    channel: (input.channel as TemplateMeta['channel']) || Channel.EMAIL,
    scenario: (input.scenario as TemplateMeta['scenario']) || Scenario.SPEARPHISHING_LINK,
    subject: input.subject,
    fromName: input.fromName,
    fromAddress: input.fromAddress,
    // A provisional watermark, so SL006 evaluates realistically while drafting.
    watermarkId: `chetna-sim-draft00000000`,
    hasSimulationHeaders: true,
  };
}

/**
 * Live screening as the author types.
 *
 * Runs the three independent checks: the 10 safety-lint rules, the harmful-lure
 * ethics taxonomy, and the NIST Phish Scale difficulty rating. Nothing is
 * written, so this is safe to call on every keystroke.
 *
 * `canSave` is false whenever linting fails. A template that fails linting is
 * never persisted at all — that is the hard half of the non-collection
 * guarantee. An ethics BLOCK, by contrast, may be saved: the override workflow
 * needs something to attach an override to, and gate G5 still refuses to send
 * it.
 */
export async function screenDraft(input: {
  name: string;
  channel: string;
  scenario: string;
  subject: string;
  fromName: string;
  fromAddress: string;
  html: string;
  premiseAlignment: number;
}): Promise<ScreenResult> {
  await requireCapability('template:write');

  const meta = metaFor(input);
  const lint = runLint(input.html, meta);
  const ethics = screenTemplate(input.subject, input.html);
  const scale = scoreTemplate(
    { subject: input.subject, html: input.html, meta, orgDomain: ORG_DOMAIN },
    { premiseAlignment: input.premiseAlignment },
  );

  return {
    lint,
    ethics,
    scale,
    canSave: lint.status === LintStatus.PASS,
    blockedThemes: ethics.findings.filter((f) => f.severity === 'BLOCK').map((f) => f.themeId),
  };
}

export interface SaveResult {
  ok: boolean;
  templateId?: string;
  error?: string;
  lintFindings?: LintResult['findings'];
}

export async function createTemplate(formData: FormData): Promise<SaveResult> {
  const user = await requireCapability('template:write');

  const raw = {
    name: String(formData.get('name') ?? ''),
    channel: String(formData.get('channel') ?? Channel.EMAIL),
    scenario: String(formData.get('scenario') ?? Scenario.SPEARPHISHING_LINK),
    subject: String(formData.get('subject') ?? ''),
    fromName: String(formData.get('fromName') ?? ''),
    fromAddress: String(formData.get('fromAddress') ?? ''),
    html: String(formData.get('html') ?? ''),
    premiseAlignment: Number(formData.get('premiseAlignment') ?? 3),
  };

  const parsed = TemplateInputSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => i.message).join('; ') };
  }

  const watermarkId = newWatermarkId();
  const meta: TemplateMeta = { ...metaFor(raw), watermarkId };
  const lint = runLint(raw.html, meta);

  // The hard gate. A template that fails linting is never written to the
  // database — not as a draft, not as disabled, not at all.
  if (lint.status === LintStatus.FAIL) {
    await auditRepo.append({
      orgId: user.orgId,
      actorId: user.id,
      actorRole: user.role,
      action: 'template.rejected',
      payload: {
        name: raw.name,
        rules: lint.findings.filter((f) => f.severity === 'FAIL').map((f) => f.ruleId),
      },
    });
    return {
      ok: false,
      error: 'This template cannot be saved: it failed safety linting.',
      lintFindings: lint.findings.filter((f) => f.severity === 'FAIL'),
    };
  }

  const ethics = screenTemplate(raw.subject, raw.html);
  const scale = scoreTemplate(
    { subject: raw.subject, html: raw.html, meta, orgDomain: ORG_DOMAIN },
    { premiseAlignment: raw.premiseAlignment },
  );

  const id = newId('tpl');
  await prisma.template.create({
    data: {
      id,
      orgId: user.orgId,
      name: raw.name,
      channel: raw.channel,
      scenario: raw.scenario,
      subject: raw.subject,
      fromName: raw.fromName,
      fromAddress: raw.fromAddress,
      html: raw.html,
      attachmentsJson: '[]',
      contentHash: lint.contentHash,
      watermarkId,
      cuesJson: writeJson(scale.cues),
      cueCount: scale.cueCount,
      premiseAlignment: scale.premiseAlignment,
      difficulty: scale.difficulty,
      lintStatus: lint.status,
      lintFindingsJson: writeJson(lint.findings),
      ethicsStatus: ethics.status,
      ethicsFindingsJson: writeJson(ethics.findings),
      createdById: user.id,
    },
  });

  await auditRepo.append({
    orgId: user.orgId,
    actorId: user.id,
    actorRole: user.role,
    action: 'template.created',
    payload: {
      templateId: id,
      lintStatus: lint.status,
      ethicsStatus: ethics.status,
      difficulty: scale.difficulty,
      cueCount: scale.cueCount,
      blockedThemes: ethics.findings.filter((f) => f.severity === 'BLOCK').map((f) => f.themeId),
    },
  });

  revalidatePath('/templates');
  return { ok: true, templateId: id };
}

export interface OverrideResult {
  ok: boolean;
  error?: string;
}

/**
 * Sign an ethics override.
 *
 * Requires the `ethics:override` capability, which is held by People/HR ALONE —
 * not by the owner, and not by the security admin who authored the lure. The
 * person who wants to send a harmful message must not be the person who can
 * permit it. That separation is what makes the ethics screen a control rather
 * than a suggestion.
 *
 * tests/abuse A05 attacks exactly this.
 */
export async function signEthicsOverride(formData: FormData): Promise<OverrideResult> {
  const user = await requireCapability('ethics:override');

  const templateId = String(formData.get('templateId') ?? '');
  const justification = String(formData.get('justification') ?? '').trim();

  if (justification.length < 120) {
    return {
      ok: false,
      error: `A justification of at least 120 characters is required. This one is ${justification.length}. It is recorded permanently and will be read by whoever reviews the complaint.`,
    };
  }

  const template = await prisma.template.findUnique({ where: { id: templateId } });
  if (!template || template.orgId !== user.orgId) return { ok: false, error: 'Unknown template.' };
  if (template.ethicsStatus !== EthicsStatus.BLOCKED) {
    return { ok: false, error: 'This template is not blocked, so there is nothing to override.' };
  }

  const findings = JSON.parse(template.ethicsFindingsJson || '[]') as EthicsResult['findings'];
  const themes = findings.filter((f) => f.severity === 'BLOCK').map((f) => f.themeId);

  let keys;
  try {
    keys = loadApproverKeys(user.id);
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }

  // The signature covers the template, the themes being permitted and the
  // justification — so none of the three can be altered afterwards without
  // invalidating it.
  const payload = [
    'CHETNA ETHICS OVERRIDE',
    `template=${template.id}`,
    `contentHash=${template.contentHash}`,
    `themes=${[...themes].sort().join(',')}`,
    `approver=${user.id}`,
    `justification=${justification}`,
  ].join('\n');

  await prisma.ethicsOverride.create({
    data: {
      id: newId('ovr'),
      templateId: template.id,
      themesJson: writeJson(themes),
      justification,
      approvedByHrId: user.id,
      publicKeyPem: keys.publicKeyPem,
      signatureB64: signMessage(payload, keys.privateKeyPem),
    },
  });

  await prisma.template.update({
    where: { id: template.id },
    data: { ethicsStatus: EthicsStatus.OVERRIDDEN },
  });

  await auditRepo.append({
    orgId: user.orgId,
    actorId: user.id,
    actorRole: user.role,
    action: 'ethics.overridden',
    payload: {
      templateId: template.id,
      themes,
      justificationLength: justification.length,
      justification,
    },
  });

  revalidatePath(`/templates/${template.id}`);
  revalidatePath('/templates');
  return { ok: true };
}
