# 03 — Safeguards: Authorization, Privacy, Retention, Non-Collection

This is **Deliverable 5**, and it is both a specification and a governance pack. Every control here is
enforced by code in `packages/{policy,privacy,audit,safety-lint,ethics}` and attacked by a test in
`tests/abuse`. Where a control is organisational rather than technical, it says so.

> **Operating principle:** a safeguard that lives only in a document is a wish. Every safeguard in this
> file names the module that enforces it and the test that tries to defeat it.

---

## 1. Authorization model

### 1.1 Principles
1. **No campaign sends without a cryptographic grant.** Authorization is a signed object, not a status field.
2. **Dual control, separated duties.** Two distinct people in two distinct roles — Security *and*
   HR/People. The person who built the campaign cannot be the only approver, and no one can approve twice.
3. **The signature covers the whole scope.** Change anything after approval and the grant is void.
4. **Time-boxed.** Every grant expires; expiry is inside the signed scope.
5. **Revocable instantly.** Revocation and the kill switch take effect at the next message, because the
   gates re-run per message.
6. **Everything is logged, tamper-evidently.** Including refusals.

### 1.2 The signed scope
Canonical JSON (sorted keys, UTF-8, no whitespace), SHA-256 → `scopeHash`:

```json
{
  "campaignId": "...", "orgId": "...", "mode": "offline|live",
  "rosterHash": "sha256 of sorted participant pids + the roster import id",
  "participantCount": 240,
  "senderDomain": "mail.nimbus.test", "landingDomain": "sso.nimbus-portal.test",
  "recipientDomains": ["nimbus.test"],
  "templateIds": ["..."], "templateHashes": ["..."],
  "windowStart": "...", "windowEnd": "...", "timezone": "Asia/Kolkata",
  "holdoutPct": 20, "rateLimitPerHour": 500,
  "ethicsOverrides": [{"templateId": "...", "themes": ["..."], "overrideId": "..."}],
  "expiresAt": "..."
}
```

Each approver signs `scopeHash` with Ed25519. `Approval` stores the public key, the signature and a note.
**G1 re-derives `scopeHash` from the live campaign at send time** and compares. Any divergence →
`G1_SCOPE_DRIFT`, send blocked. This defeats the classic insider move: get approval for 20 people, then
quietly add 2,000.

Note `mode` is part of the scope. Flipping `CHETNA_MODE` from `offline` to `live` invalidates every
existing grant — you cannot escalate a demo campaign into a live one.

### 1.3 Roles (RBAC)

| Role | Can | Cannot |
|---|---|---|
| `OWNER` | Everything except being the second approver on its own campaign | Approve twice; bypass ethics |
| `SECURITY_ADMIN` | Build templates and campaigns, request authorization, sign as the security approver, operate the kill switch | **Override an ethics block**; see an individual's results |
| `HR_APPROVER` | Sign as the people approver, **sign ethics overrides**, manage suppressions and exclusions | Build or send campaigns |
| `ANALYST` | Read k-guarded aggregates, export reports | See individuals; see raw contact data |
| `AUDITOR` | Read the audit chain, grants, attestations, purge receipts | See participant contact data or results |
| participant (portal) | See **only their own** results; opt out; complete training; report | See anyone else |

Enforced by a single `requireRole()` guard used by every server action; `tests/abuse` A05 and A20 attack it.

### 1.4 Human process around the technical control (organisational)
- **Programme-level prior notification** to all staff: simulations happen, here is why, here is the
  opt-out, here is what is measured, here is who can see it, nothing is used for discipline. Not
  campaign-level notice — that would destroy validity — but programme-level, which is what makes
  legitimate interests defensible and is what NCSC's "check with HR first" guidance implies.
- **Written rules of engagement** per campaign, auto-generated from the signed scope (the authorization
  dossier) and countersigned.
- **A no-discipline commitment** in writing. This is the single highest-leverage non-technical control:
  the ETH and NCSC evidence says fear destroys the reporting signal that actually protects you.
- **Escalation route** for any participant who is distressed by a simulation, with a 24-hour SLA, and an
  automatic suppression of that participant pending review.

---

## 2. Non-credential-collection (the hard guarantee)

**Claim:** Chetna cannot collect a credential. Four independent layers, each individually checkable.

| Layer | Mechanism | Verify it yourself |
|---|---|---|
| **L1 — No input exists** | Landing pages render a look-alike panel with **no `<input type="password">`, no named inputs, and no form action**. The "Sign in" control is `<button type="button">` that swaps in the teachable moment. *Rationale: a real password field makes password managers autofill genuine credentials, which the page could then read. We delete the risk class rather than promise restraint.* | View source on `/t/:token` |
| **L2 — No sink exists** | `apps/sim` has no handler that accepts user-entered values. `POST /t/:token/intent` takes **no body fields** — its zod schema is `z.object({}).strict()`, so extra keys are rejected. CSP: `form-action 'none'; connect-src 'self'` | `tests/abuse` A16 |
| **L3 — No column exists** | No table has a field for submitted data. `Event.meta` is validated against an enumerated-key schema (`cueId`, `moduleSlug`, `dwellMs`, `drillScore`, `clusterKey`). Raw IPs and user agents are never stored — only `ipClass` and `uaFamily` | `prisma/schema.prisma`, A16 |
| **L4 — Machine-verified** | `@chetna/safety-lint` rules SL001–SL010 fail the build on any credential-capture pattern; `npm run verify:safety` runs the linter over every template plus a password-canary and emits a **signed attestation JSON** rendered at `/attest`; CI blocks the merge | `npm run verify:safety`, `/attest` |

**What we record instead:** `DECOY_VIEW` (saw the fake sign-in) and `SUBMIT_INTENT` (pressed the button).
That is the behavioural measure — "this person would have submitted" — with no secret in the system.
It is strictly more useful for learning and strictly less dangerous to hold.

**Attachments:** inert allowlisted types only (`.pdf`, `.png`, `.txt`, `.ics`). No macros, archives,
executables or scripts (`SL009`). A "malicious" attachment opens a teachable moment, not a payload.

---

## 3. Privacy by architecture

### 3.1 Data minimisation
| We collect | We deliberately do not collect |
|---|---|
| Email (to send), display name, department, role archetype, locale | Job title, manager chain, salary band, demographics, device identifiers |
| Event type, timestamp, actor class, machine score | Raw IP, full user agent, geolocation, keystrokes, screen content, mouse paths |
| Dwell time, drill score, module completion | Anything typed into a page, ever |

### 3.2 Pseudonymisation and identifier hygiene
- `Participant.pid` is an opaque public id. `Assignment.token` is 128 bits of randomness.
- **No URL ever contains PII** — enforced by `SL010` and tested by A21. No email, name or department in a
  query string, so nothing leaks via referrers, proxy logs, browser history or shoulder-surfing.
- `Referrer-Policy: no-referrer` on `apps/sim`; tokens appear in the path and are single-purpose.

### 3.3 Who can see what

```
participant  →  own results, in full, including their resilience band and every event about them
HR_APPROVER  →  suppression and exclusion lists; NO results
ANALYST      →  k-guarded aggregates only
manager      →  cohort aggregates only, and only via a cohort they are entitled to, k ≥ 5
               ** there is no endpoint, anywhere, that returns a named individual's result to a manager **
AUDITOR      →  governance objects; no contact data, no results
```

### 3.4 k-anonymity guard
```ts
kGuard(rows, k = 5): { ok: true, data } | { ok: false, suppressed: true, k, cohortSize }
```
- Default **k = 5**, aligned with Microsoft Viva Insights' hard floor; configurable upward, **hard floor
  of 3**, and any change to `k` is itself an audited event.
- **Complementary suppression:** if suppressing one cell would let it be derived by subtraction from the
  total, the neighbouring cell is suppressed too.
- Re-evaluated **per attribute combination** — cross-tabs are the classic re-identification route.
- The return type is a discriminated union, so the compiler forces every caller to render the suppressed
  state. Privacy failures become build failures.

### 3.5 Honest aggregation
Small-sample results are labelled low-confidence; the holdout effect is reported with a 95% CI and renders
**"no significant effect detected"** when the interval contains zero. We would rather show a judge an
honest null than a flattering number.

*(Differential-privacy noise on aggregates is a documented P2 item. We ship k-anonymity now and say so,
rather than claiming DP we have not implemented.)*

---

## 4. Data retention

| Data class | Default | Rationale |
|---|---|---|
| `TELEMETRY_RAW` (machine scores, UA family, IP class) | **30 days** | Needed only to compute metrics and filter bots |
| `EVENT` (opens, clicks, reports, training) | **180 days** | Two quarters of trend; aligned with common log-retention expectations |
| `CONTACT` (email, display name) | **365 days** or employment end, whichever is sooner | Minimum needed to run the programme |
| `LEARNING` (progress, drill scores) | **365 days** | Spaced repetition and curriculum planning |
| `REPORT` (generated awareness reports) | **730 days** | Audit evidence for ISO/PCI cycles |
| `AUDIT` (chain, grants, attestations, purge receipts) | **2555 days (7 y)**, append-only | Accountability evidence; **never** purged by the job |

**Enforcement:** the worker evaluates `RetentionRule` on a tick, deletes past the cutoff, and writes a
`PurgeReceipt` **plus an audit entry**. Deletion is itself evidence, which is what an auditor actually
wants. `chetna purge --dry-run` previews. Tested by A24.

**On erasure vs analytics:** a DSAR erasure tombstones the `Participant`, nulls contact fields and detaches
events from the identity while retaining aggregate counts. This keeps historical campaign analytics valid
without retaining a person — the lawful and the honest outcome simultaneously.

---

## 5. Consent, lawful basis and jurisdiction

| Jurisdiction | Basis | What we ship |
|---|---|---|
| **EU/UK (GDPR)** | **Legitimate interests** (Art. 6(1)(f)). Consent is rejected as a basis: it must be freely given, and a test whose value depends on surprise cannot be freely consented to per campaign. | Pre-filled **LIA + DPIA** (§5.1), prior programme notification text, opt-out honoured by G4, DPO contact field |
| **Germany / co-determination** | Phishing simulation is technical means capable of monitoring conduct → **§87(1) no.6 BetrVG** works-council co-determination | Works-council briefing note (§5.2) with the exact data-field list and the no-discipline commitment |
| **India (DPDP Act 2023)** | **§7(i) legitimate use for employment purposes** — no separate consent needed for employment-purpose processing; erasure once the purpose is served, including by processors; a written retention schedule | Retention schedule (§4), DSAR endpoints, erasure receipts, processor-erasure note |
| **Any** | Prior **programme-level** notice, opt-out, no-discipline commitment, distress escalation with automatic suppression | Shipped as policy text in the repo |

> **Not legal advice.** These are the correct engineering hooks and a defensible default posture; a
> deploying organisation must have its own counsel sign off. Saying this to a jury is a strength, not a
> weakness — it shows we know where engineering ends.

### 5.1 DPIA (pre-filled skeleton, ships in the repo)
1. **Processing described** — simulated phishing messages to employees on an approved roster; recording
   open/click/report/training events; aggregate reporting; no credential collection.
2. **Necessity and proportionality** — phishing is the dominant initial-access vector; awareness is
   mandated by ISO 27001 A.6.3 and PCI DSS 12.6.3.1; no less intrusive alternative measures real
   detection behaviour. Proportionality controls: minimal fields, 30-day cooldown, k-anonymity, short
   retention, no discipline.
3. **Risks identified** — (a) employee distress from a harmful lure; (b) misuse for performance
   management; (c) re-identification from small cohorts; (d) accidental targeting of non-participants;
   (e) the platform itself being misused for real phishing; (f) over-testing.
4. **Mitigations mapped to code** — (a) `@chetna/ethics` + suppression + escalation SLA; (b) RBAC,
   no individual endpoint, no-discipline commitment; (c) `kAnonGuard` + complementary suppression;
   (d) gates G2/G3/G7; (e) gates G1–G7 + zero-credential + watermark + audit; (f) G4 cooldown + rate limits.
5. **Residual risk** — low; reviewed each quarter and after any incident.
6. **Consultation** — security, HR/People, works council or employee representatives, DPO.

### 5.2 Works-council / employee-representative briefing (outline)
Purpose · exactly which fields are collected (the table in §3.1, verbatim) · who can see what (§3.3) ·
what is **never** done (no discipline, no individual naming to managers, no credential collection,
no covert monitoring outside declared campaigns) · retention (§4) · opt-out and escalation · the
k-anonymity threshold and who may change it · the audit trail available to representatives on request.

---

## 6. Acceptable Use Policy (ships as `POLICY.md`)

Chetna is licensed for **authorized security awareness testing of an organisation's own members, with
documented approval**. Prohibited: targeting anyone outside a verified, approved roster; collecting
credentials or any secret by any means; removing the watermark or simulation headers; using the platform
for unauthorized access; and using results for disciplinary action.

> **Honest licensing note, say it if asked:** an open-source licence cannot legally restrict use, so the
> AUP is a separate policy plus the terms of service for any hosted deployment — and critically, the
> *technical* controls (G1–G7, zero-credential, mandatory watermark, offline mode, audit) are what
> actually prevent misuse. The licence states intent; the architecture enforces it. Recommended licence:
> **AGPL-3.0** (hosted modifications must be published) plus `POLICY.md`.

---

## 7. STRIDE threat model (each row maps to a test)

| # | Threat | S/T/R/I/D/E | Control | Test |
|---|---|---|---|---|
| T1 | Insider targets people outside the approved roster | Elevation | G2 roster-hash binding | A11 |
| T2 | Insider edits the roster after approval | Tampering | G1 scope drift | A07 |
| T3 | Operator self-approves | Elevation | Distinct approvers in distinct roles | A08 |
| T4 | Forged or replayed grant | Spoofing | Ed25519 over canonical scope hash | A09 |
| T5 | Audit log edited to hide an action | Tampering / Repudiation | SHA-256 hash chain, append-only repo, CLI verify | A17 |
| T6 | Template exfiltrates typed data | Information disclosure | SL001–SL005, CSP `form-action 'none'`, no sink | A01–A03, A16 |
| T7 | Platform repurposed for real phishing | Elevation | G3 domain ownership, G7 mode guard in the signed scope, watermark + headers, audit | A10 |
| T8 | Manager re-identifies an individual from aggregates | Information disclosure | `kAnonGuard` + complementary suppression + no individual endpoint | A18–A20 |
| T9 | PII leaks through URLs, referrers or proxy logs | Information disclosure | Opaque tokens, SL010, `Referrer-Policy: no-referrer` | A21 |
| T10 | Harmful lure causes employee distress | (Human harm) | Ethics taxonomy, HR-signed override, escalation SLA, auto-suppression | A04, A05 |
| T11 | Runaway send floods the organisation | Denial of service | G6 window + rate limit + kill switch | A14, A15 |
| T12 | Scanner traffic inflates results and misdirects training | (Integrity of measurement) | Machine scoring, `MACHINE` exclusion, filtered volume disclosed | unit tests |
| T13 | Prompt injection via template content reaches the AI layer | Tampering | No tool access, strict output schemas, content never in an instruction position | A22 |
| T14 | Credential stuffing against the console | Spoofing | argon2id, rate limits, optional TOTP, no user enumeration | unit tests |
| T15 | Over-testing an individual | (Human harm) | G4 cooldown, new-joiner grace, per-participant limits | A13 |

---

## 8. Incident and complaint handling (runbook summary)

| Trigger | Immediate action | Follow-up |
|---|---|---|
| A participant is distressed | Auto-suppress that participant; acknowledge within 24 h | Review the lure against the ethics taxonomy; add a theme if needed |
| A lure reached an unintended recipient | Kill switch on; revoke the grant | Audit-log review to establish which gate should have caught it; add the abuse test |
| Suspected real phish reported via the report button | Triage queue flags `REAL_THREAT`; notify the SOC | Cluster, measure time-to-first-report, feed the curriculum |
| Audit chain verification fails | Freeze campaigns; preserve the DB | Forensic review; the chain identifies the first mutated sequence number |
| A judge, auditor or regulator asks for evidence | `chetna audit verify` + export the authorization dossier + the latest attestation | — |
