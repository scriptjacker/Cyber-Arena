import { describe, expect, it } from 'vitest';
import {
  CampaignStatus,
  EthicsStatus,
  IntentBodySchema,
  LintStatus,
  ReasonCode,
  RunMode,
  type AuditEntryRecord,
  type CohortRow,
} from '@chetna/core';
import { buildEntry, GENESIS_HASH, verifyChain } from '@chetna/audit';
import { evaluate } from '@chetna/policy';
import { runCredentialCanary, runLint } from '@chetna/safety-lint';
import { screenTemplate, applyOverride } from '@chetna/ethics';
import { guardCohorts } from '@chetna/privacy';
import {
  makeContext,
  makeScope,
  makeGrant,
  resign,
  SAFE_TEMPLATE_HTML,
  TEMPLATE_META,
  TEMPLATE_HASH,
} from './_fixture';

/**
 * THE ABUSE SUITE
 *
 * This suite does not check that features work. It checks that abuses FAIL.
 * Each case takes a working configuration and attempts exactly one hostile act,
 * then asserts the specific safeguard that must stop it.
 *
 * Cases A20, A22, A23 and A24 require the console, the AI package and the
 * database layer, and land with those (see docs/06-WORKPLAN-48H.md H1).
 */

const expectBlocked = (ctx: ReturnType<typeof makeContext>, code: ReasonCode) => {
  const d = evaluate(ctx);
  expect(d.allow, `expected a refusal carrying ${code}`).toBe(false);
  expect(d.reasons).toContain(code);
  return d;
};

describe('baseline — a correctly authorized send must pass all seven gates', () => {
  it('allows the fixture', () => {
    const decision = evaluate(makeContext());
    expect(decision.reasons).toEqual([ReasonCode.ALLOW]);
    expect(decision.allow).toBe(true);
    expect(decision.gate).toBeNull();
    expect(decision.inputsHash).toMatch(/^[0-9a-f]{64}$/);
  });
});

// ---------------------------------------------------------------------------
// Content safety
// ---------------------------------------------------------------------------

describe('A01–A03 · template content cannot collect anything', () => {
  it('A01 rejects a password input', () => {
    const html = SAFE_TEMPLATE_HTML.replace(
      '<p>Regards',
      '<input type="password" name="pw" /><p>Regards',
    );
    const r = runLint(html, TEMPLATE_META);
    expect(r.status).toBe(LintStatus.FAIL);
    expect(r.findings.map((f) => f.ruleId)).toContain('SL001_NO_PASSWORD_INPUT');
  });

  it('A02 rejects any named input, even without a password type', () => {
    const html = SAFE_TEMPLATE_HTML.replace('<p>Regards', '<input type="text" name="user" /><p>Regards');
    const r = runLint(html, TEMPLATE_META);
    expect(r.status).toBe(LintStatus.FAIL);
    expect(r.findings.map((f) => f.ruleId)).toContain('SL002_NO_NAMED_INPUT');
  });

  it('A03 rejects a form with an external action, a POST method, and inline script', () => {
    const html = `${SAFE_TEMPLATE_HTML}
      <form action="https://collector.example.com/x" method="post"><button>Go</button></form>
      <script>fetch('https://collector.example.com')</script>`;
    const r = runLint(html, TEMPLATE_META);
    const ids = r.findings.map((f) => f.ruleId);
    expect(r.status).toBe(LintStatus.FAIL);
    expect(ids).toContain('SL003_NO_FORM_ACTION');
    expect(ids).toContain('SL004_NO_EXTERNAL_POST');
    expect(ids).toContain('SL005_NO_SCRIPT');
  });

  it('the safe reference template passes, so the linter is not simply refusing everything', () => {
    const r = runLint(SAFE_TEMPLATE_HTML, TEMPLATE_META);
    expect(r.findings.filter((f) => f.severity === 'FAIL')).toEqual([]);
    expect(r.status).toBe(LintStatus.PASS);
  });

  it('the credential canary is rejected by every rule it should trip', () => {
    const canary = runCredentialCanary();
    expect(canary.missed).toEqual([]);
    expect(canary.passed).toBe(true);
  });
});

describe('A04–A05 · harmful lures and overrides', () => {
  const covidBonus = {
    subject: 'COVID-19 recognition bonus — confirm your bank details',
    html: '<p>Dear colleague, a one-off payment has been approved for your work during the pandemic. Please update bank details to receive it.</p>',
  };

  it('A04 blocks the West Midlands Trains lure and cites the precedent', () => {
    const r = screenTemplate(covidBonus.subject, covidBonus.html);
    expect(r.status).toBe(EthicsStatus.BLOCKED);
    const themes = r.findings.map((f) => f.themeId);
    expect(themes).toContain('COMPENSATION');
    const compensation = r.findings.find((f) => f.themeId === 'COMPENSATION');
    expect(compensation?.precedent?.title).toContain('West Midlands Trains');
    expect(compensation?.precedent?.source).toMatch(/^https:\/\//);
  });

  it('A05 an override that does not name every blocked theme is insufficient', () => {
    const r = screenTemplate(covidBonus.subject, covidBonus.html);
    const blockedThemes = r.findings.filter((f) => f.severity === 'BLOCK').map((f) => f.themeId);
    expect(blockedThemes.length).toBeGreaterThan(0);

    const partial = applyOverride(r, {
      themes: ['COMPENSATION'],
      justification: 'x'.repeat(130),
      approvedByHrId: 'usr_hr',
      signatureB64: 'sig',
    });
    if (blockedThemes.length > 1) {
      expect(partial.overrideSufficient).toBe(false);
      expect(partial.status).toBe(EthicsStatus.BLOCKED);
    }

    const full = applyOverride(r, {
      themes: blockedThemes,
      justification: 'x'.repeat(130),
      approvedByHrId: 'usr_hr',
      signatureB64: 'sig',
    });
    expect(full.overrideSufficient).toBe(true);
    expect(full.status).toBe(EthicsStatus.OVERRIDDEN);
  });

  it('a blocked template still cannot send, override or no override, until status changes', () => {
    expectBlocked(
      makeContext((c) => {
        c.template.ethicsStatus = EthicsStatus.BLOCKED;
      }),
      ReasonCode.G5_ETHICS_BLOCKED,
    );
  });

  it('an ordinary work lure is not blocked — the engine must be usable', () => {
    const r = screenTemplate(
      'Your parcel is held pending a customs charge',
      '<p>A parcel addressed to you is held pending a customs charge of INR 240.</p>',
    );
    expect(r.status).not.toBe(EthicsStatus.BLOCKED);
  });
});

// ---------------------------------------------------------------------------
// Authorization
// ---------------------------------------------------------------------------

describe('A06–A09 · authorization cannot be faked or stretched', () => {
  it('A06 refuses to send with no grant at all', () => {
    expectBlocked(
      makeContext((c) => {
        c.grant = null;
      }),
      ReasonCode.G1_NO_GRANT,
    );
  });

  it('A07 detects scope drift when the roster changes after approval', () => {
    const d = expectBlocked(
      makeContext((c) => {
        c.liveScope = makeScope({ rosterHash: 'c'.repeat(64), participantCount: 241 });
      }),
      ReasonCode.G1_SCOPE_DRIFT,
    );
    expect(d.reasons).toContain(ReasonCode.G2_ROSTER_HASH_MISMATCH);
  });

  it('A07b detects scope drift when the window is quietly extended', () => {
    expectBlocked(
      makeContext((c) => {
        c.liveScope = makeScope({ windowEnd: '2026-04-30T18:00:00.000Z' });
      }),
      ReasonCode.G1_SCOPE_DRIFT,
    );
  });

  it('A08 rejects two approvals from the same person', () => {
    const d = expectBlocked(
      makeContext((c) => {
        const approvals = c.grant!.approvals;
        approvals[1] = { ...approvals[1], approverId: approvals[0].approverId };
      }),
      ReasonCode.G1_APPROVERS_NOT_DISTINCT,
    );
    expect(d.gate).toBe(1);
  });

  it('A08b rejects two approvals from the same side of the business', () => {
    expectBlocked(
      makeContext((c) => {
        const approvals = c.grant!.approvals;
        approvals[1] = { ...approvals[1], approverSlot: approvals[0].approverSlot };
      }),
      ReasonCode.G1_APPROVER_SLOTS_NOT_DISTINCT,
    );
  });

  it('A08c rejects a single approval', () => {
    expectBlocked(
      makeContext((c) => {
        c.grant!.approvals = [c.grant!.approvals[0]];
      }),
      ReasonCode.G1_INSUFFICIENT_APPROVALS,
    );
  });

  it('A09 rejects a tampered signature', () => {
    expectBlocked(
      makeContext((c) => {
        const sig = Buffer.from(c.grant!.approvals[0].signatureB64, 'base64');
        sig[4] ^= 0xff;
        c.grant!.approvals[0] = {
          ...c.grant!.approvals[0],
          signatureB64: sig.toString('base64'),
        };
      }),
      ReasonCode.G1_SIGNATURE_INVALID,
    );
  });

  it('A09b rejects a signature made by the wrong key', () => {
    expectBlocked(
      makeContext((c) => {
        c.grant!.approvals[0] = {
          ...c.grant!.approvals[0],
          publicKeyPem: c.grant!.approvals[1].publicKeyPem,
        };
      }),
      ReasonCode.G1_SIGNATURE_INVALID,
    );
  });

  it('A09c refuses a revoked grant, and an expired one', () => {
    expectBlocked(
      makeContext((c) => {
        c.grant = makeGrant(c.liveScope, {
          revokedAt: '2026-03-10T09:30:00.000Z',
          revokedReason: 'Complaint received',
        });
      }),
      ReasonCode.G1_GRANT_REVOKED,
    );
    expectBlocked(
      makeContext((c) => {
        c.now = '2026-03-25T10:00:00.000Z';
      }),
      ReasonCode.G1_GRANT_EXPIRED,
    );
  });

  it('A09d refuses a campaign that is not in an authorized state', () => {
    expectBlocked(
      makeContext((c) => {
        c.campaign.status = CampaignStatus.DRAFT;
      }),
      ReasonCode.G1_CAMPAIGN_NOT_AUTHORIZED,
    );
  });
});

// ---------------------------------------------------------------------------
// Scope: people and domains
// ---------------------------------------------------------------------------

describe('A10–A13 · only approved people, at approved domains', () => {
  it('A10 cannot reach a real inbox in offline mode', () => {
    const d = expectBlocked(
      makeContext((c) => {
        c.participant.email = 'attacker@gmail.com';
      }),
      ReasonCode.G7_OFFLINE_MODE_NON_TEST_DOMAIN,
    );
    expect(d.reasons).toContain(ReasonCode.G3_RECIPIENT_DOMAIN_NOT_APPROVED);
  });

  it('A10b cannot use a non-loopback mail transport in offline mode', () => {
    expectBlocked(
      makeContext((c) => {
        c.transport.host = 'smtp.sendgrid.net';
      }),
      ReasonCode.G7_OFFLINE_MODE_NON_LOCAL_TRANSPORT,
    );
  });

  it('A10c cannot promote an offline-approved campaign to live by changing the mode', () => {
    expectBlocked(
      makeContext((c) => {
        c.mode = RunMode.LIVE;
      }),
      ReasonCode.G7_MODE_MISMATCH,
    );
  });

  it('A11 refuses a recipient who is not on the signed roster', () => {
    expectBlocked(
      makeContext((c) => {
        c.participant.onRoster = false;
      }),
      ReasonCode.G2_NOT_ON_ROSTER,
    );
  });

  it('A11b refuses an unverified sender or landing domain', () => {
    expectBlocked(
      makeContext((c) => {
        c.domains.senderDomainVerified = false;
      }),
      ReasonCode.G3_SENDER_DOMAIN_UNVERIFIED,
    );
    expectBlocked(
      makeContext((c) => {
        c.domains.landingDomainVerified = false;
      }),
      ReasonCode.G3_LANDING_DOMAIN_UNVERIFIED,
    );
  });

  it('A12 honours an opt-out immediately', () => {
    expectBlocked(
      makeContext((c) => {
        c.participant.optedOutAt = '2026-03-09T00:00:00.000Z';
      }),
      ReasonCode.G4_SUPPRESSED_OPT_OUT,
    );
  });

  it('A12b honours an HR exclusion and the suppression list', () => {
    expectBlocked(
      makeContext((c) => {
        c.participant.excludedByHr = true;
      }),
      ReasonCode.G4_SUPPRESSED_HR,
    );
    expectBlocked(
      makeContext((c) => {
        c.participant.matchesSuppression = true;
      }),
      ReasonCode.G4_SUPPRESSED_LIST,
    );
  });

  it('A13 refuses to over-test someone simulated five days ago', () => {
    expectBlocked(
      makeContext((c) => {
        c.participant.lastSimulatedAt = '2026-03-05T10:00:00.000Z';
      }),
      ReasonCode.G4_COOLDOWN_ACTIVE,
    );
  });

  it('A13b protects a new joiner inside the grace period', () => {
    expectBlocked(
      makeContext((c) => {
        c.participant.joinedAt = '2026-03-01T00:00:00.000Z';
      }),
      ReasonCode.G4_NEW_JOINER_GRACE,
    );
  });
});

// ---------------------------------------------------------------------------
// Operational safety
// ---------------------------------------------------------------------------

describe('A14–A15 · operational limits', () => {
  it('A14 refuses a send outside the authorized window', () => {
    expectBlocked(
      makeContext((c) => {
        c.now = '2026-03-10T19:30:00.000Z';
      }),
      ReasonCode.G6_OUTSIDE_WINDOW,
    );
  });

  it('A15 stops everything when the kill switch is engaged', () => {
    expectBlocked(
      makeContext((c) => {
        c.campaign.killSwitch = true;
      }),
      ReasonCode.G6_KILL_SWITCH,
    );
  });

  it('A15b enforces the hourly rate limit', () => {
    expectBlocked(
      makeContext((c) => {
        c.campaign.sentInLastHour = 500;
      }),
      ReasonCode.G6_RATE_LIMIT,
    );
  });

  it('refuses a template that is not the one approved, or whose content changed', () => {
    expectBlocked(
      makeContext((c) => {
        c.template.id = 'tpl_sneaked_in';
      }),
      ReasonCode.G5_TEMPLATE_NOT_IN_SCOPE,
    );
    expectBlocked(
      makeContext((c) => {
        c.template.contentHash = 'f'.repeat(64);
      }),
      ReasonCode.G5_TEMPLATE_HASH_MISMATCH,
    );
    expectBlocked(
      makeContext((c) => {
        c.template.lintStatus = LintStatus.FAIL;
      }),
      ReasonCode.G5_TEMPLATE_LINT_FAIL,
    );
    expectBlocked(
      makeContext((c) => {
        c.template.watermarkId = null;
      }),
      ReasonCode.G5_WATERMARK_MISSING,
    );
  });
});

// ---------------------------------------------------------------------------
// Telemetry and governance
// ---------------------------------------------------------------------------

describe('A16 · the telemetry endpoint accepts no values', () => {
  it('rejects any field smuggled into the submit-intent body', () => {
    expect(IntentBodySchema.safeParse({}).success).toBe(true);
    for (const hostile of [
      { password: 'hunter2' },
      { username: 'priya.r' },
      { pw: 'x' },
      { notes: 'anything at all' },
      { __proto__: { polluted: true } },
    ]) {
      const parsed = IntentBodySchema.safeParse(hostile);
      // Either the extra key is rejected outright, or it is stripped — never kept.
      if (parsed.success) {
        expect(Object.keys(parsed.data as object)).toEqual([]);
      } else {
        expect(parsed.success).toBe(false);
      }
    }
  });
});

describe('A17 · the audit chain detects tampering', () => {
  const build = () => {
    const entries: AuditEntryRecord[] = [];
    let prev = GENESIS_HASH;
    const actions = [
      ['campaign.created', { campaignId: 'cmp_demo' }],
      ['authorization.signed', { approver: 'usr_security' }],
      ['authorization.signed', { approver: 'usr_hr' }],
      ['send.blocked', { reason: ReasonCode.G7_OFFLINE_MODE_NON_TEST_DOMAIN }],
      ['send.sent', { assignmentId: 'asg_1' }],
    ] as const;
    actions.forEach(([action, payload], i) => {
      const e = buildEntry(
        { orgId: 'org_nimbus', action, payload, at: `2026-03-10T10:0${i}:00.000Z` },
        i + 1,
        prev,
      );
      entries.push(e);
      prev = e.hash;
    });
    return entries;
  };

  it('verifies an untouched chain and produces a Merkle root', () => {
    const v = verifyChain(build());
    expect(v.ok).toBe(true);
    expect(v.entriesChecked).toBe(5);
    expect(v.merkleRoot).toMatch(/^[0-9a-f]{64}$/);
  });

  it('detects an edited payload', () => {
    const entries = build();
    entries[3] = { ...entries[3], payloadJson: '{"reason":"ALLOW"}' };
    const v = verifyChain(entries);
    expect(v.ok).toBe(false);
    expect(v.firstBadSeq).toBe(4);
    expect(v.problem).toMatch(/payload was modified/);
  });

  it('detects a removed entry', () => {
    const entries = build().filter((e) => e.seq !== 4);
    const v = verifyChain(entries);
    expect(v.ok).toBe(false);
    expect(v.firstBadSeq).toBe(5);
  });

  it('detects an edited field even when the payload is untouched', () => {
    const entries = build();
    entries[1] = { ...entries[1], action: 'authorization.auto_approved' };
    const v = verifyChain(entries);
    expect(v.ok).toBe(false);
    expect(v.firstBadSeq).toBe(2);
  });
});

describe('A18–A19 · analytics cannot identify a person', () => {
  const row = (label: string, size: number): CohortRow => ({
    key: label.toLowerCase(),
    label,
    cohortSize: size,
    delivered: size,
    failures: Math.floor(size / 10),
    reports: Math.floor(size / 4),
    machineFiltered: 1,
  });

  it('A18 suppresses a three-person team', () => {
    const guarded = guardCohorts([row('Engineering', 60), row('Finance', 24), row('Legal', 3)], 5);
    expect(guarded.ok).toBe(true);
    if (!guarded.ok) return;
    expect(guarded.data.rows.map((r) => r.label)).not.toContain('Legal');
    expect(guarded.data.hidden.count).toBeGreaterThanOrEqual(1);
  });

  it('A19 applies complementary suppression so a hidden cell cannot be derived', () => {
    // One cell below k: hiding only that cell would let it be recovered by
    // subtracting the visible rows from the published total.
    const guarded = guardCohorts([row('Engineering', 60), row('Finance', 24), row('Legal', 3)], 5);
    expect(guarded.ok).toBe(true);
    if (!guarded.ok) return;
    expect(guarded.data.hidden.count).toBe(2);
    expect(guarded.data.rows.map((r) => r.label)).toEqual(['Engineering']);
  });

  it('refuses the whole breakdown when no cohort reaches k', () => {
    const guarded = guardCohorts([row('A', 2), row('B', 4), row('C', 1)], 5);
    expect(guarded.ok).toBe(false);
    if (guarded.ok) return;
    expect(guarded.k).toBe(5);
    expect(guarded.reason).toMatch(/without risking identification/);
  });

  it('cannot be configured below the hard floor of 3', () => {
    const guarded = guardCohorts([row('Tiny', 1), row('Small', 2)], 1);
    expect(guarded.ok).toBe(false);
    if (guarded.ok) return;
    expect(guarded.k).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Regression guard on the fixture itself
// ---------------------------------------------------------------------------

describe('fixture integrity', () => {
  it('re-signing after a legitimate scope change restores a valid grant', () => {
    const ctx = makeContext((c) => {
      c.liveScope = makeScope({ participantCount: 239, rosterHash: 'd'.repeat(64) });
    });
    expect(evaluate(ctx).allow).toBe(false);
    resign(ctx);
    ctx.participant.onRoster = true;
    const after = evaluate(ctx);
    expect(after.reasons).toEqual([ReasonCode.ALLOW]);
  });

  it('the approved template hash is what the scope carries', () => {
    expect(makeScope().templateHashes).toContain(TEMPLATE_HASH);
  });
});
