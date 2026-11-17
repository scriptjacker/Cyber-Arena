import {
  ApproverSlot,
  Arm,
  AssignmentState,
  CampaignStatus,
  ConsentState,
  DataClass,
  DomainKind,
  EthicsStatus,
  hashPassword,
  LintStatus,
  newId,
  newPid,
  newToken,
  newWatermarkId,
  Role,
  RunMode,
  SuppressionScope,
  type Channel,
  type Difficulty,
  type TemplateMeta,
} from '@chetna/core';
import { approvalPayload, scopeHash, signScope } from '@chetna/audit';
import { prisma, auditRepo, buildLiveScope, runtimeConfig, writeJson } from '@chetna/db';
import { runLint } from '@chetna/safety-lint';
import { screenTemplate } from '@chetna/ethics';
import { scoreTemplate } from '@chetna/phishscale';
import { DEFAULT_RETENTION_DAYS } from '@chetna/privacy';
import { SEED_TEMPLATES, type SeedTemplate } from '@chetna/content';
import { SEED_MODULES } from '@chetna/content';
import { DEPARTMENTS, FIRST_NAMES, LAST_NAMES, Rng } from '../lib/rng';
import {
  COMPLETED_CAMPAIGNS,
  generateCompletedCampaign,
  type CampaignHistoryResult,
} from '../lib/history';
import { loadOrCreateKeyPair } from '../lib/keys';

const ORG_ID = 'org_nimbus';
const ORG_NAME = 'Nimbus Logistics';
const ORG_DOMAIN = 'nimbus.test';
const DEMO_PASSWORD = 'chetna-demo-2026';
const DAY = 86_400_000;

export interface SeedSummary {
  participants: number;
  templates: number;
  blockedTemplates: number;
  modules: number;
  priorCampaignId: string;
  liveCampaignId: string;
  completedCampaigns: string[];
  failureRatePrior: number;
  reportRatePrior: number;
  staff: { email: string; role: string }[];
}

/** Wipe every table in dependency order. Only ever called by the CLI. */
async function reset(): Promise<void> {
  await prisma.$transaction([
    prisma.event.deleteMany(),
    prisma.message.deleteMany(),
    prisma.reportTriage.deleteMany(),
    prisma.assignment.deleteMany(),
    prisma.approval.deleteMany(),
    prisma.authorizationGrant.deleteMany(),
    prisma.campaign.deleteMany(),
    prisma.rosterMember.deleteMany(),
    prisma.rosterImport.deleteMany(),
    prisma.progress.deleteMany(),
    prisma.spacedItem.deleteMany(),
    prisma.module.deleteMany(),
    prisma.ethicsOverride.deleteMany(),
    prisma.template.deleteMany(),
    prisma.seededThreat.deleteMany(),
    prisma.suppression.deleteMany(),
    prisma.approvedDomain.deleteMany(),
    prisma.purgeReceipt.deleteMany(),
    prisma.dsarRequest.deleteMany(),
    prisma.retentionRule.deleteMany(),
    prisma.safetyAttestation.deleteMany(),
    prisma.participant.deleteMany(),
    prisma.staffUser.deleteMany(),
    prisma.auditEntry.deleteMany(),
    prisma.org.deleteMany(),
  ]);
}

function makeTemplateRow(t: SeedTemplate, now: Date) {
  const watermarkId = newWatermarkId();
  const meta: TemplateMeta = {
    name: t.name,
    channel: t.channel,
    scenario: t.scenario,
    subject: t.subject,
    fromName: t.fromName,
    fromAddress: t.fromAddress,
    watermarkId,
    hasSimulationHeaders: true,
    ...(t.attachments ? { attachments: t.attachments } : {}),
  };

  const lint = runLint(t.html, meta, t.text);
  const ethics = screenTemplate(t.subject, t.html, t.text);
  const scale = scoreTemplate(
    { subject: t.subject, html: t.html, text: t.text, meta, orgDomain: ORG_DOMAIN },
    { premiseAlignment: t.premiseAlignment },
  );

  return {
    row: {
      id: `tpl_${t.key}`,
      orgId: ORG_ID,
      name: t.name,
      channel: t.channel,
      scenario: t.scenario,
      subject: t.subject,
      fromName: t.fromName,
      fromAddress: t.fromAddress,
      html: t.html,
      text: t.text ?? null,
      attachmentsJson: writeJson(t.attachments ?? []),
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
      aiGenerated: false,
      createdById: 'usr_security',
      createdAt: new Date(now.getTime() - 30 * DAY),
    },
    lint,
    ethics,
    scale,
  };
}

export async function seed(options: { reset?: boolean } = {}): Promise<SeedSummary> {
  const rng = new Rng(20260317);
  const now = new Date();
  const priorSentAt = new Date(now.getTime() - 45 * DAY);

  if (options.reset !== false) await reset();

  // ---------------------------------------------------------------- org
  await prisma.org.create({
    data: {
      id: ORG_ID,
      name: ORG_NAME,
      slug: 'nimbus',
      settingsJson: writeJson({ kAnon: 5, cooldownDays: 30, newJoinerGraceDays: 30 }),
    },
  });

  await prisma.retentionRule.createMany({
    data: (Object.keys(DEFAULT_RETENTION_DAYS) as DataClass[]).map((dataClass) => ({
      id: newId('ret'),
      orgId: ORG_ID,
      dataClass,
      retainDays: DEFAULT_RETENTION_DAYS[dataClass],
    })),
  });

  await auditRepo.append({
    orgId: ORG_ID,
    action: 'org.created',
    payload: { name: ORG_NAME, domain: ORG_DOMAIN, retention: DEFAULT_RETENTION_DAYS },
  });

  // -------------------------------------------------------------- staff
  const staffSpec = [
    { id: 'usr_owner', email: `owner@${ORG_DOMAIN}`, name: 'Anita Deshpande', role: Role.OWNER },
    { id: 'usr_security', email: `security@${ORG_DOMAIN}`, name: 'Vikram Rao', role: Role.SECURITY_ADMIN },
    { id: 'usr_hr', email: `people@${ORG_DOMAIN}`, name: 'Meera Nair', role: Role.HR_APPROVER },
    { id: 'usr_analyst', email: `analyst@${ORG_DOMAIN}`, name: 'Rahul Iyer', role: Role.ANALYST },
    { id: 'usr_auditor', email: `auditor@${ORG_DOMAIN}`, name: 'Fatima Qureshi', role: Role.AUDITOR },
  ];

  const passwordHash = hashPassword(DEMO_PASSWORD);
  const keys = new Map<string, { publicKeyPem: string; privateKeyPem: string }>();
  for (const s of staffSpec) {
    const pair = loadOrCreateKeyPair(s.id);
    keys.set(s.id, pair);
    await prisma.staffUser.create({
      data: {
        id: s.id,
        orgId: ORG_ID,
        email: s.email,
        displayName: s.name,
        passwordHash,
        role: s.role,
        publicKeyPem: pair.publicKeyPem,
      },
    });
  }

  // ------------------------------------------------------------ domains
  const domains = [
    { domain: ORG_DOMAIN, kind: DomainKind.RECIPIENT },
    { domain: 'mail.nimbus.test', kind: DomainKind.SENDER },
    { domain: 'nimbus-courier.test', kind: DomainKind.SENDER },
    { domain: 'sso.nimbus-portal.test', kind: DomainKind.LANDING },
  ];
  for (const d of domains) {
    await prisma.approvedDomain.create({
      data: {
        id: newId('dom'),
        orgId: ORG_ID,
        domain: d.domain,
        kind: d.kind,
        verifyToken: `chetna-verify=${newToken()}`,
        // Offline mode records a stub verification against reserved test
        // domains. Live mode performs a DNS TXT lookup (roadmap item) — the
        // record shape is identical either way.
        verifiedAt: new Date(now.getTime() - 20 * DAY),
        verifiedById: 'usr_security',
        method: 'stub-offline',
      },
    });
    await auditRepo.append({
      orgId: ORG_ID,
      actorId: 'usr_security',
      actorRole: Role.SECURITY_ADMIN,
      action: 'domain.verified',
      payload: { domain: d.domain, kind: d.kind, method: 'stub-offline' },
    });
  }

  // ------------------------------------------------------- participants
  interface Person {
    id: string;
    pid: string;
    email: string;
    displayName: string;
    department: string;
    roleArchetype: string;
    joinedAt: Date;
    optedOutAt: Date | null;
    excludedByHr: boolean;
  }

  const people: Person[] = [];
  const usedEmails = new Set<string>();
  let index = 0;

  for (const dept of DEPARTMENTS) {
    for (let i = 0; i < dept.size; i++) {
      const first = rng.pick(FIRST_NAMES);
      const last = rng.pick(LAST_NAMES);
      let local = `${first}.${last}`.toLowerCase();
      if (usedEmails.has(local)) local = `${local}${index}`;
      usedEmails.add(local);

      // Four people joined ten days ago, so the new-joiner grace period has
      // something real to protect on stage.
      const isNewJoiner = index % 61 === 7;
      const joinedAt = isNewJoiner
        ? new Date(now.getTime() - 10 * DAY)
        : new Date(now.getTime() - rng.int(120, 2200) * DAY);

      people.push({
        id: newId('par'),
        pid: newPid(),
        email: `${local}@${ORG_DOMAIN}`,
        displayName: `${first} ${last}`,
        department: dept.name,
        roleArchetype: rng.pick(dept.roles),
        joinedAt,
        optedOutAt: index % 83 === 11 ? new Date(now.getTime() - 5 * DAY) : null,
        excludedByHr: index % 97 === 23,
      });
      index++;
    }
  }

  for (const p of people) {
    await prisma.participant.create({
      data: {
        id: p.id,
        orgId: ORG_ID,
        pid: p.pid,
        email: p.email,
        displayName: p.displayName,
        department: p.department,
        roleArchetype: p.roleArchetype,
        locale: 'en-IN',
        consentState: p.optedOutAt ? ConsentState.OPTED_OUT : ConsentState.NOTIFIED_PROGRAMME,
        optedOutAt: p.optedOutAt,
        excludedByHr: p.excludedByHr,
        joinedAt: p.joinedAt,
        resilienceRating: 1200,
        lastSimulatedAt: priorSentAt,
      },
    });
  }

  const rosterImportId = newId('ros');
  await prisma.rosterImport.create({
    data: {
      id: rosterImportId,
      orgId: ORG_ID,
      filename: 'nimbus-roster-2026-q1.csv',
      rowCount: people.length,
      rejectedCount: 0,
      rosterHash: 'computed-below',
      importedById: 'usr_security',
      attestationNote:
        'All rows are current employees of Nimbus Logistics who received the programme notice on 2026-01-08. Contractors and fixed-term staff on probation are excluded.',
      createdAt: new Date(now.getTime() - 25 * DAY),
    },
  });
  await prisma.rosterMember.createMany({
    data: people.map((p) => ({ rosterImportId, participantId: p.id })),
  });

  await auditRepo.append({
    orgId: ORG_ID,
    actorId: 'usr_security',
    actorRole: Role.SECURITY_ADMIN,
    action: 'roster.imported',
    payload: { rosterImportId, rows: people.length, filename: 'nimbus-roster-2026-q1.csv' },
  });

  // --------------------------------------------------------- suppression
  const bereaved = people[42];
  const auditDept = people.find((p) => p.department === 'Internal Audit');
  await prisma.suppression.createMany({
    data: [
      {
        id: newId('sup'),
        orgId: ORG_ID,
        scope: SuppressionScope.EMAIL,
        value: bereaved.email,
        reason: 'HR request: compassionate leave. Review on return.',
        expiresAt: new Date(now.getTime() + 30 * DAY),
      },
      {
        id: newId('sup'),
        orgId: ORG_ID,
        scope: SuppressionScope.ROLE_ARCHETYPE,
        value: auditDept?.roleArchetype ?? 'Audit Manager',
        reason: 'Excluded during the external audit window at the auditor’s request.',
        expiresAt: new Date(now.getTime() + 60 * DAY),
      },
    ],
  });

  // ---------------------------------------------------------- templates
  const templateRows = SEED_TEMPLATES.map((t) => makeTemplateRow(t, now));
  for (const { row, lint, ethics, scale } of templateRows) {
    await prisma.template.create({ data: row });
    await auditRepo.append({
      orgId: ORG_ID,
      actorId: 'usr_security',
      actorRole: Role.SECURITY_ADMIN,
      action: 'template.created',
      payload: {
        templateId: row.id,
        lintStatus: lint.status,
        ethicsStatus: ethics.status,
        difficulty: scale.difficulty,
        cueCount: scale.cueCount,
        blockedThemes: ethics.findings.filter((f) => f.severity === 'BLOCK').map((f) => f.themeId),
      },
    });
  }

  // Integrity checks on our own seed data: if these ever fail, the demo is
  // telling a story the code does not support.
  const lintFailures = templateRows.filter(
    (t) => !t.row.name.startsWith('[BLOCKED]') && t.lint.status !== LintStatus.PASS,
  );
  if (lintFailures.length > 0) {
    throw new Error(
      `Seed integrity: ${lintFailures.length} sendable template(s) failed safety-lint: ` +
        lintFailures
          .map((t) => `${t.row.id} (${t.lint.findings.map((f) => f.ruleId).join(', ')})`)
          .join('; '),
    );
  }
  const notBlocked = templateRows.filter(
    (t) => t.row.name.startsWith('[BLOCKED]') && t.ethics.status !== EthicsStatus.BLOCKED,
  );
  if (notBlocked.length > 0) {
    throw new Error(
      `Seed integrity: template(s) expected to be blocked by the ethics screen were not: ${notBlocked
        .map((t) => t.row.id)
        .join(', ')}`,
    );
  }

  // ------------------------------------------------------------ modules
  for (const m of SEED_MODULES) {
    await prisma.module.create({
      data: {
        id: `mod_${m.slug}`,
        slug: m.slug,
        title: m.title,
        summary: m.summary,
        cueTagsJson: writeJson(m.cueTags),
        channelTagsJson: writeJson(m.channelTags),
        minutes: m.minutes,
        mdxPath: `content/modules/index.ts#${m.slug}`,
      },
    });
  }

  // ------------------------------------------------------ seeded threats
  await prisma.seededThreat.createMany({
    data: [
      {
        id: newId('thr'),
        orgId: ORG_ID,
        label: 'Real credential-harvesting campaign (Jan 2026)',
        subject: 'Mailbox storage exceeded — action required',
        html: '<p>Your mailbox is full. Verify your account to continue receiving mail.</p>',
      },
      {
        id: newId('thr'),
        orgId: ORG_ID,
        label: 'Real invoice-fraud attempt (Feb 2026)',
        subject: 'RE: outstanding payment NC-7731',
        html: '<p>Please remit the attached invoice to our updated account.</p>',
      },
    ],
  });

  // ----------------------------------------- completed campaign history
  const history: CampaignHistoryResult[] = [];
  for (const spec of COMPLETED_CAMPAIGNS) {
    history.push(
      await generateCompletedCampaign({
        orgId: ORG_ID,
        spec,
        people,
        rosterImportId,
        now,
        signCampaign: (campaignId, signedAt) => signCampaign(campaignId, keys, signedAt),
      }),
    );
  }
  const latest = history[history.length - 1];

  // -------------------------------------------------- the live campaign
  const liveCampaignId = 'cmp_q2_courier';
  const windowStart = new Date(now.getTime() - 30 * 60_000);
  const windowEnd = new Date(now.getTime() + 8 * 3_600_000);
  await prisma.campaign.create({
    data: {
      id: liveCampaignId,
      orgId: ORG_ID,
      name: 'Q2 — courier customs charge',
      status: CampaignStatus.DRAFT,
      mode: runtimeConfig().mode,
      windowStart,
      windowEnd,
      timezone: 'Asia/Kolkata',
      senderDomain: 'nimbus-courier.test',
      landingDomain: 'sso.nimbus-portal.test',
      recipientDomainsJson: writeJson([ORG_DOMAIN]),
      templateIdsJson: writeJson(['tpl_courier-customs']),
      rosterImportId,
      holdoutPct: 20,
      randomSeed: 'q2-courier-seed',
      rateLimitPerHour: 500,
      killSwitch: false,
      createdById: 'usr_security',
    },
  });
  await auditRepo.append({
    orgId: ORG_ID,
    actorId: 'usr_security',
    actorRole: Role.SECURITY_ADMIN,
    action: 'campaign.created',
    payload: { campaignId: liveCampaignId, templateIds: ['tpl_courier-customs'] },
  });

  await createAssignments({
    campaignId: liveCampaignId,
    templateIds: ['tpl_courier-customs'],
    people,
    rng,
    windowStart,
    holdoutPct: 20,
    seed: 'q2-courier-seed',
  });

  await signCampaign(liveCampaignId, keys, now);
  await prisma.campaign.update({
    where: { id: liveCampaignId },
    data: { status: CampaignStatus.AUTHORIZED },
  });

  // Fix the roster hash now that membership is final.
  const liveScope = await buildLiveScope(liveCampaignId);
  await prisma.rosterImport.update({
    where: { id: rosterImportId },
    data: { rosterHash: liveScope?.rosterHash ?? 'unknown' },
  });

  return {
    participants: people.length,
    templates: templateRows.length,
    blockedTemplates: templateRows.filter((t) => t.ethics.status === EthicsStatus.BLOCKED).length,
    modules: SEED_MODULES.length,
    priorCampaignId: latest.campaignId,
    liveCampaignId,
    failureRatePrior: latest.failures / latest.delivered,
    reportRatePrior: latest.reports / latest.delivered,
    completedCampaigns: history.map((h) => h.campaignId),
    staff: staffSpec.map((s) => ({ email: s.email, role: s.role })),
  };
}

// ---------------------------------------------------------------------------
// Authorization
// ---------------------------------------------------------------------------

/**
 * Sign a campaign with two distinct approvers in two distinct roles, exactly as
 * the console will. The scope is re-derived from live data, so the signature
 * covers the campaign as it actually is — not as it was when someone typed it.
 */
async function signCampaign(
  campaignId: string,
  keys: Map<string, { publicKeyPem: string; privateKeyPem: string }>,
  signedAt: Date,
): Promise<void> {
  const scope = await buildLiveScope(campaignId);
  if (!scope) throw new Error(`cannot sign ${campaignId}: scope could not be derived`);

  const grantId = newId('grant');
  await prisma.authorizationGrant.create({
    data: {
      id: grantId,
      campaignId,
      scopeHash: scopeHash(scope),
      scopeSnapshotJson: writeJson(scope),
      expiresAt: new Date(scope.expiresAt),
    },
  });

  const approvers = [
    {
      id: 'usr_security',
      role: Role.SECURITY_ADMIN,
      slot: ApproverSlot.SECURITY,
      note: 'Scope reviewed: roster, domains, window and templates match the approved programme plan.',
    },
    {
      id: 'usr_hr',
      role: Role.HR_APPROVER,
      slot: ApproverSlot.PEOPLE,
      note: 'No live appraisal, redundancy or restructuring process this period. Suppression list checked against compassionate-leave records.',
    },
  ];

  for (const a of approvers) {
    const pair = keys.get(a.id);
    if (!pair) throw new Error(`no signing key for ${a.id}`);
    await prisma.approval.create({
      data: {
        id: newId('appr'),
        grantId,
        approverId: a.id,
        approverRole: a.role,
        approverSlot: a.slot,
        publicKeyPem: pair.publicKeyPem,
        signatureB64: signScope(scope, pair.privateKeyPem),
        note: a.note,
        signedAt,
      },
    });
    await auditRepo.append({
      orgId: ORG_ID,
      actorId: a.id,
      actorRole: a.role,
      action: 'authorization.signed',
      payload: {
        campaignId,
        slot: a.slot,
        scopeHash: scopeHash(scope),
        payloadSigned: approvalPayload(scope),
      },
    });
  }

  await auditRepo.append({
    orgId: ORG_ID,
    actorId: 'usr_owner',
    actorRole: Role.OWNER,
    action: 'campaign.authorized',
    payload: { campaignId, approvals: approvers.length, scopeHash: scopeHash(scope) },
  });
}

// ---------------------------------------------------------------------------
// Assignments
// ---------------------------------------------------------------------------

async function createAssignments(args: {
  campaignId: string;
  templateIds: string[];
  people: { id: string; department: string }[];
  rng: Rng;
  windowStart: Date;
  holdoutPct: number;
  seed: string;
}): Promise<void> {
  const { campaignId, templateIds, people, windowStart, holdoutPct } = args;

  // Stratified by department so the holdout is balanced where it matters.
  const byDept = new Map<string, typeof people>();
  for (const p of people) {
    const list = byDept.get(p.department) ?? [];
    list.push(p);
    byDept.set(p.department, list);
  }

  const rows: {
    id: string;
    campaignId: string;
    participantId: string;
    templateId: string;
    arm: string;
    stratum: string;
    token: string;
    sendAt: Date;
    state: string;
  }[] = [];

  let i = 0;
  for (const [dept, members] of [...byDept.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const shuffled = args.rng.shuffle(members);
    const holdoutCount = Math.round((holdoutPct / 100) * shuffled.length);
    shuffled.forEach((p, idx) => {
      rows.push({
        id: newId('asg'),
        campaignId,
        participantId: p.id,
        templateId: templateIds[i % templateIds.length],
        arm: idx < holdoutCount ? Arm.HOLDOUT : Arm.TREATMENT,
        stratum: dept,
        token: newToken(),
        // Staggered so the demo sends a handful immediately and the rest trickle.
        sendAt: new Date(windowStart.getTime() + i * 5_000),
        state: AssignmentState.QUEUED,
      });
      i++;
    });
  }

  for (const row of rows) await prisma.assignment.create({ data: row });
}

export { DEMO_PASSWORD, ORG_ID, ORG_DOMAIN, ORG_NAME };
