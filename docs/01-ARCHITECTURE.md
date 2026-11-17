# 01 — Architecture

Target: **48 hours, 4–6 engineers, TypeScript, fully offline demo.** Every choice below is justified
against those constraints. Where a "proper enterprise" answer differs from the 48-hour answer, both are
stated — that is the Feasibility story, and we tell it deliberately.

---

## 1. Tech decisions and why (say these out loud if asked)

| Decision | Choice | Rationale | Production swap |
|---|---|---|---|
| Package manager | **npm workspaces** | pnpm is not installed on the build machine and Docker is not available, so the toolchain had to be whatever ships with Node 22. npm workspaces symlinks local packages identically and needs no global install — one less thing for five people to get wrong at hour zero. | pnpm or Bun, unchanged layout |
| Internal packages | **No build step** — each `package.json` points `main` at `src/index.ts` | Next.js transpiles workspace packages and Vitest resolves TypeScript directly, so there is no `tsc -b` graph to break at 3am. `tsc --noEmit` at the root typechecks everything at once. | Add `tsup` per package if a package is ever published |
| Language | **TypeScript, strict** | One language across console, delivery, worker and CLI. Shared zod schemas = one source of truth for validation. | — |
| Framework | **Next.js 15 App Router** × 2 apps | Server Actions remove most API boilerplate (huge in 48h); RSC gives fast dashboards; one build tool. | — |
| DB | **SQLite + Prisma** | Zero install, zero daemon, zero Docker — the offline requirement. Prisma gives migrations + typed client. | `datasource` → Postgres; one-line change, documented |
| Queue | **DB-backed tick worker** (`services/worker`, 1s poll, `SELECT … WHERE sendAt <= now AND state='QUEUED'` with a claim update) | BullMQ needs Redis; Redis needs Docker; Docker is not installed and the demo must work offline. A claimed-row worker is ~120 lines and survives restarts. | BullMQ/Redis or pg-boss; the `JobRunner` interface is already abstracted |
| Mail transport | **Nodemailer → our own SMTP sink** (`smtp-server`, pure JS, bound to `127.0.0.1:1025`) | Real SMTP wire protocol (not a fake), captured locally, rendered in our own webmail. Judges can watch `netstat` and see nothing can leave the box. Better demo than Mailpit *and* one fewer dependency. | Any real SMTP relay behind `MailTransport`; domain verification gate already enforced |
| Auth | **Credentials + argon2id + signed httpOnly cookie sessions**, optional TOTP | Auth.js/SSO eats hours and isn't a scoring item. RBAC is. | OIDC/SAML behind the same `Session` interface (P2) |
| UI | Tailwind + **shadcn/ui** + Recharts | Fastest route to a console that *looks* like a product. Presentation is 25%. | — |
| Crypto | **Ed25519 via Node `crypto`** (no deps), SHA-256 hash chain | Signatures and tamper-evident logs with zero supply chain risk. | HSM/KMS-backed keys (P2) |
| Tests | **Vitest** (unit) + **Playwright** (E2E + PDF rendering) | Playwright does double duty: E2E *and* `page.pdf()` for the awareness report, so no PDF library. | — |
| AI | Provider interface: `offline` (deterministic, default) \| `anthropic` | Demo must never depend on a key or a network. Offline provider is template-driven + seeded RNG. | Any provider; output still must pass safety-lint + ethics |

**Two Next.js apps, not one — this is a security decision, not a style one.** The landing pages that a
"clicked" link opens must be a **different origin** from the console, so that no console session, cookie,
CSRF token or admin route is reachable from the attack-surface app. `apps/sim` has no admin routes, no
session cookie, no secret other than the HMAC token key, and (in Postgres mode) a DB role that can only
`INSERT` into `Event`.

---

## 2. Repository layout

```
chetna/
├─ apps/
│  ├─ console/                 # :3000  admin + participant portal + analytics (auth required)
│  │  ├─ app/(admin)/          #   WS-B: templates, campaigns, authorization, roster, triage
│  │  ├─ app/(analytics)/      #   WS-E: exec, cohort, campaign, report export
│  │  ├─ app/(learn)/          #   WS-D: modules, drills, my-results, opt-out
│  │  └─ app/(mail)/inbox/     #   WS-C: participant webmail (demo environment)
│  └─ sim/                     # :3001  SIMULATION SURFACE — isolated origin, no admin, no session
│     ├─ app/t/[token]/        #   click landing → teachable moment
│     ├─ app/p/[token]/        #   open pixel (1x1 gif)
│     ├─ app/q/[token]/        #   QR scan landing
│     ├─ app/r/[token]/        #   one-click report-from-email link
│     └─ app/attest/           #   public Non-Collection Attestation page
├─ packages/
│  ├─ core/                    # types, zod schemas, canonical JSON, ids, tokens, brand, reason codes
│  ├─ db/                      # prisma schema + client + repositories (append-only Event repo)
│  ├─ policy/                  # the 7 gates + PolicyDecision + suppression + rate limits
│  ├─ safety-lint/             # template linter: zero-credential, watermark, headers, kill-switch
│  ├─ ethics/                  # banned-theme taxonomy, harm classifier, override workflow
│  ├─ phishscale/              # NIST cue detection (5 categories) + premise alignment + difficulty
│  ├─ scoring/                 # resilience rating, difficulty-adjusted metrics, Wilson CI, holdout
│  ├─ privacy/                 # kAnonGuard, retention clocks, purge, DSAR, pseudonymisation
│  ├─ audit/                   # Ed25519 sign/verify, hash-chained log, dossier builder
│  ├─ ai/                      # provider interface, offline provider, prompts, output schemas
│  └─ ui/                      # shared shadcn components, charts, cue-overlay renderer
├─ services/
│  ├─ mailsink/                # SMTP server on 127.0.0.1:1025 → Message rows
│  └─ worker/                  # tick loop: send, retention purge, spaced-repetition, digests
├─ cli/                        # chetna: seed | demo | audit verify | safety attest | purge | dsar
├─ content/                    # 10 templates, 6 micro-modules (MDX), scenario taxonomy, seeded threats
├─ tests/
│  ├─ unit/                    # vitest
│  ├─ e2e/                     # playwright
│  └─ abuse/                   # THE ABUSE SUITE — every gate has a test that tries to defeat it
├─ docs/                       # this pack
└─ deck/                       # pitch deck + screenshots + backup video
```

---

## 3. Data model (Prisma, frozen at H2)

Only the fields that matter are shown; `id`, `createdAt`, `updatedAt` are implied everywhere.

```prisma
// ---------- Tenancy & people ----------
Org            { name, slug, settings Json, retentionPolicyId }
StaffUser      { orgId, email, passwordHash, role Role, totpSecret?, lastLoginAt }
enum Role      { OWNER SECURITY_ADMIN HR_APPROVER ANALYST AUDITOR }

Participant    { orgId, pid @unique      // opaque public id, never the email
                 email                    // PII class: CONTACT, retention-governed
                 displayName, department, roleArchetype, locale
                 consentState ConsentState, optedOutAt?
                 resilienceRating Float @default(1200)   // Elo-lite, private to the participant
                 suppressedUntil?, suppressionReason? }
enum ConsentState { NOTIFIED_PROGRAMME OPTED_OUT EXCLUDED_BY_HR }

RosterImport   { orgId, filename, rowCount, rosterHash, importedBy, attestedBy, attestationNote }

// ---------- Scope: what may be touched ----------
ApprovedDomain { orgId, domain, kind DomainKind, verifyToken, verifiedAt?, verifiedBy? }
enum DomainKind{ SENDER LANDING RECIPIENT }

Suppression    { orgId, scope SuppressionScope, value, reason, expiresAt? }  // email | dept | role
                 // e.g. new joiners < 30 days, on leave, bereavement flag, prior complaint

// ---------- Templates ----------
Template       { orgId, name, channel Channel, scenario String   // MITRE T1566.001/.002/.003/.004, T1598
                 subject, fromName, fromAddress, html, text
                 cues Json          // detected NIST cues, per category
                 cueCount Int, premiseAlignment Int   // 1..5
                 difficulty Difficulty               // derived, not hand-set
                 watermarkId String                  // mandatory, embedded + logged
                 lintStatus LintStatus, lintFindings Json
                 ethicsStatus EthicsStatus, ethicsFindings Json
                 ethicsOverrideId? }
enum Channel   { EMAIL QR SMS_SIM VOICE_TABLETOP }
enum Difficulty{ VERY_LOW LOW MODERATE HIGH VERY_HIGH }
enum LintStatus{ PASS FAIL }
enum EthicsStatus { CLEAR FLAGGED BLOCKED OVERRIDDEN }

EthicsOverride { templateId, themes String[], justification, approvedByHrId, signature, signedAt }

// ---------- Campaigns & authorization ----------
Campaign       { orgId, name, status CampaignStatus
                 windowStart, windowEnd, timezone
                 senderDomain, landingDomain
                 rosterImportId, templateIds String[]
                 holdoutPct Int @default(20), randomSeed
                 rateLimitPerHour Int, killSwitch Boolean @default(false) }
enum CampaignStatus { DRAFT PENDING_AUTH AUTHORIZED RUNNING PAUSED COMPLETE PURGED REJECTED }

AuthorizationGrant {
  campaignId @unique
  scopeHash          // SHA-256 over canonical JSON of the FULL scope (see §5)
  scopeSnapshot Json // frozen copy: roster hash, domains, window, templates, limits
  approvals Approval[]   // exactly 2 required, distinct users, distinct roles
  expiresAt, revokedAt?, revokedReason?
}
Approval       { grantId, approverId, approverRole, publicKey, signature, signedAt, note }

// ---------- Assignments & events ----------
Assignment     { campaignId, participantId, templateId
                 arm Arm, stratum String       // randomisation
                 token @unique                 // 128-bit opaque, the ONLY thing in a URL
                 sendAt, state AssignmentState, claimedAt?, messageId? }
enum Arm       { TREATMENT HOLDOUT }
enum AssignmentState { QUEUED CLAIMED SENT FAILED BLOCKED SKIPPED }

Event          { assignmentId, type EventType, at DateTime
                 actorClass ActorClass          // HUMAN | MACHINE | UNKNOWN
                 machineScore Float             // 0..1, see §6
                 uaFamily String?, ipClass String?   // CLASS ONLY, never the raw IP
                 meta Json }                    // never any user-entered value
enum EventType { QUEUED SENT DELIVERED PROBABLE_OPEN CLICK_UNCONFIRMED CLICK_CONFIRMED
                 QR_SCAN DECOY_VIEW SUBMIT_INTENT REPORTED TRAINING_START TRAINING_COMPLETE
                 DRILL_PASS DRILL_FAIL OPT_OUT BLOCKED_BY_POLICY }
enum ActorClass{ HUMAN MACHINE UNKNOWN }

// ---------- Learning ----------
Module         { slug, title, channelTags String[], cueTags String[], minutes Int, mdxPath }
Progress       { participantId, moduleId, startedAt, completedAt?, dwellMs, drillScore? }
SpacedItem     { participantId, cueTag, box Int, dueAt }   // Leitner

// ---------- Reporting / SOC ----------
ReportTriage   { orgId, reportedBy participantId, assignmentId?, seededThreatId?
                 verdict Verdict, firstReportAt, clusterKey, analystId? }
enum Verdict   { SIMULATION REAL_THREAT BENIGN UNREVIEWED }
SeededThreat   { orgId, label, html }   // non-simulation "real" phish for triage realism

// ---------- Governance ----------
AuditEntry     { orgId, seq Int, prevHash, hash, actorId?, actorRole?, action, reasonCode?,
                 payloadHash, payload Json, signature? }
RetentionRule  { orgId, dataClass DataClass, retainDays Int }
enum DataClass { CONTACT EVENT TELEMETRY_RAW LEARNING AUDIT REPORT }
PurgeReceipt   { orgId, dataClass, cutoffAt, rowsDeleted, runAt, auditSeq }
DsarRequest    { orgId, participantId, kind DsarKind, status, fulfilledAt, exportPath? }
enum DsarKind  { ACCESS ERASURE }
```

**Three schema-level safety properties we point at on stage:**

1. **There is no column anywhere that can hold a submitted credential.** `Event.meta` is validated by a
   zod schema that permits only enumerated keys (`cueId`, `moduleSlug`, `dwellMs`, `drillScore`, …). The
   abuse suite asserts this.
2. **No URL ever carries PII** — `Assignment.token` is a 128-bit random value; `Participant.pid` is opaque.
3. **Raw IPs and full user agents are never stored** — only `ipClass` (`private|scanner|other`) and
   `uaFamily`. Nothing re-identifies a person from telemetry.

---

## 4. Component flow

```
                 ┌──────────────── apps/console :3000 (authenticated) ────────────────┐
                 │ Template Studio ─ safety-lint ─ ethics ─ phishscale                 │
                 │ Campaign Wizard ─ Preflight (7 gates, dry-run)                      │
                 │ Authorization (2 × Ed25519 sign) ─► AuthorizationGrant + audit      │
                 │ SOC Triage · Analytics (kAnonGuard) · Report export · DSAR · Purge   │
                 └───────────────┬────────────────────────────────────┬────────────────┘
                                 │ writes Campaign/Grant               │ reads (guarded)
                                 ▼                                     ▼
                        ┌──────────────┐    claim rows        ┌──────────────────┐
                        │  SQLite/PG   │◄─────────────────────│ services/worker  │
                        └──────┬───────┘                      │ tick 1s          │
                               │                              │ • policy.evaluate│  ← 7 gates run again
                               │                              │   PER MESSAGE    │     at the last mile
                               │                              │ • send via SMTP  │
                               │                              │ • retention purge│
                               │                              │ • spaced items   │
                               │                              └────────┬─────────┘
                               │                                       │ nodemailer
                               │                              ┌────────▼─────────┐
                               │                              │ services/mailsink│ 127.0.0.1:1025
                               │                              │ SMTP → Message   │
                               │                              └────────┬─────────┘
                               │                                       │
                               │   participant webmail (console/(mail))◄┘
                               │          │ clicks link / scans QR / reports
                               ▼          ▼
                        ┌─────────────────────────────────────┐
                        │ apps/sim :3001  (isolated origin)   │
                        │ /t /p /q /r  → Event (append-only)  │
                        │ teachable moment + 45s drill        │
                        │ /attest  public attestation page    │
                        └─────────────────────────────────────┘
```

**The policy engine runs twice**: once in the UI as a *dry-run preflight* (so the operator sees green/red
before asking for approval), and again **per message at send time** inside the worker. A grant revoked
between authorization and send stops the next message — that is the demo beat.

---

## 5. The 7 gates (`packages/policy`)

```ts
type ReasonCode =
  | 'G1_NO_GRANT' | 'G1_GRANT_EXPIRED' | 'G1_GRANT_REVOKED' | 'G1_SIGNATURE_INVALID'
  | 'G1_SCOPE_DRIFT' | 'G1_APPROVERS_NOT_DISTINCT'
  | 'G2_NOT_ON_ROSTER' | 'G2_ROSTER_HASH_MISMATCH'
  | 'G3_RECIPIENT_DOMAIN_NOT_APPROVED' | 'G3_SENDER_DOMAIN_UNVERIFIED'
  | 'G3_LANDING_DOMAIN_UNVERIFIED'
  | 'G4_SUPPRESSED_OPT_OUT' | 'G4_SUPPRESSED_HR' | 'G4_COOLDOWN_ACTIVE' | 'G4_NEW_JOINER_GRACE'
  | 'G5_TEMPLATE_LINT_FAIL' | 'G5_ETHICS_BLOCKED' | 'G5_WATERMARK_MISSING'
  | 'G6_OUTSIDE_WINDOW' | 'G6_RATE_LIMIT' | 'G6_KILL_SWITCH'
  | 'G7_OFFLINE_MODE_NON_LOCAL_TRANSPORT' | 'G7_OFFLINE_MODE_NON_TEST_DOMAIN'
  | 'ALLOW';

interface PolicyDecision {
  allow: boolean;
  reasons: ReasonCode[];      // all failures, not just the first — the preflight panel shows every one
  gate: 1|2|3|4|5|6|7|null;
  evaluatedAt: string;
  inputsHash: string;         // what we judged, so the audit entry is reproducible
}

evaluate(ctx: SendContext): PolicyDecision   // pure function, no I/O — fully unit-testable
```

| Gate | Question | Blocks |
|---|---|---|
| **G1 Authorization** | Is there an unexpired, unrevoked grant whose `scopeHash` still matches the live campaign, signed by **two distinct approvers in distinct roles** with verifying Ed25519 signatures? | Unauthorized campaigns, silent scope edits after approval ("scope drift"), self-approval |
| **G2 Roster** | Is this participant in the exact roster snapshot the approvers signed (`rosterHash` match)? | Adding people after approval |
| **G3 Domains** | Recipient domain on the approved `RECIPIENT` list; sender and landing domains **verified-owned**? | Targeting outsiders; spoofing a domain you don't control |
| **G4 Suppression** | Opted out, HR-excluded, within a 30-day cooldown, or inside the new-joiner grace period? | Harm to individuals; over-testing |
| **G5 Content** | `lintStatus=PASS`, `ethicsStatus ∈ {CLEAR, OVERRIDDEN}`, watermark present? | Credential capture; harmful lures |
| **G6 Operations** | Inside the window, under the rate limit, kill switch off? | Runaway sends |
| **G7 Environment** | In `CHETNA_MODE=offline`: transport resolves to loopback **and** every recipient domain is in a reserved test TLD (`.test`, `.example`, `.invalid`, `localhost`) | **A real inbox being hit during a demo — structurally impossible** |

G7 is the sentence that ends the "but could this be misused on stage?" question. Note it is a *mode*
guard, not a toggle an operator can flip mid-campaign: changing `CHETNA_MODE` invalidates every grant,
because the mode is part of the signed scope.

---

## 6. Telemetry, honestly (`apps/sim` + `packages/scoring`)

**Open** (`GET /p/[token]` → 1×1 GIF, `Cache-Control: no-store`): recorded as `PROBABLE_OPEN` with a
`machineScore` from additive signals:

| Signal | Weight |
|---|---|
| Request < 2 s after `SENT` | +0.4 |
| User agent in the known scanner/proxy list (incl. Apple MPP proxy ranges, Microsoft/Google fetchers) | +0.5 |
| `ipClass = scanner` or datacentre range | +0.3 |
| No subsequent interaction from the same token within 10 min | +0.1 |
| `Sec-Fetch-Mode: no-cors` image prefetch pattern | +0.2 |

`machineScore ≥ 0.5` → `actorClass = MACHINE`, **excluded from human metrics** and shown on the dashboard
as *"machine-filtered: N"*. This is a headline on the analytics page, not a footnote.

**Simulated click** (`GET /t/[token]`): immediately `CLICK_UNCONFIRMED`. The landing page posts a
beacon after real interaction (pointer movement, scroll, keypress, or ≥1.2 s focus) → `CLICK_CONFIRMED`.
Human metrics use confirmed clicks; both are shown.

**Decoy "sign-in"** — the critical design point:

- The landing page may render a **look-alike sign-in panel** so the lesson lands. It contains
  **no `<input type="password">`, no named inputs, and no `action`** — and the "Sign in" button is a
  `<button type="button">` that immediately swaps in the teachable moment.
- Why no password field at all, not merely an ignored one: a real `type="password"` field triggers
  **password managers to autofill genuine credentials**, which a page can then read. Removing the field
  removes the risk class, rather than promising not to look.
- We record `DECOY_VIEW` and `SUBMIT_INTENT` (the person *would* have submitted) — the behavioural signal
  without the secret. CSP on `apps/sim`: `form-action 'none'; connect-src 'self'; default-src 'self'`.

**Report** (`GET /r/[token]` from the email, or the Report button in the webmail): `REPORTED`, with
`timeToReport = at − SENT`. Reporters get thanks and a streak, never a score.

**Metrics defined precisely** (so the dashboard can be defended):

```
failure            = CLICK_CONFIRMED ∨ SUBMIT_INTENT ∨ QR_SCAN (human only)
reportRate         = reporters / delivered(human-reachable)
resilienceRatio    = reports / (reports + failures)
timeToReport       = median(REPORTED − SENT)            # benchmark: DBIR-reported 28 min
difficultyAdjusted = Σ(outcome × w(difficulty)) / Σ w(difficulty)
                     w = {VERY_LOW .6, LOW .8, MODERATE 1.0, HIGH 1.3, VERY_HIGH 1.6}
holdoutEffect      = p_holdout − p_treatment, with 95% Wilson CI on each proportion
                     and a two-proportion interval on the difference;
                     if the difference CI contains 0 → UI renders "no significant effect detected"
resilienceRating   = Elo-lite: R' = R + K(S − E),  E = 1/(1+10^((D−R)/400)),  K = 24
                     D = template difficulty rating, S = 1 for report, 0.5 for ignore, 0 for failure
```

Participant ratings are **private to the participant**. Cohort views show **bands** (Developing /
Capable / Strong), never numbers that could be reverse-engineered to an individual.

---

## 7. API contracts (frozen at H2 — everyone codes against these)

Server Actions in `apps/console` (typed, zod-validated at the boundary):

```ts
// Templates (WS-B ↔ WS-A)
createTemplate(input: TemplateInput): { id, lint: LintResult, ethics: EthicsResult, scale: PhishScaleResult }
lintTemplate(html: string, meta: TemplateMeta): LintResult          // pure, no DB
scoreTemplate(html: string, audience: AudienceContext): PhishScaleResult
screenTemplate(subject: string, body: string): EthicsResult
requestEthicsOverride(templateId, themes, justification): { requiresRole: 'HR_APPROVER' }
signEthicsOverride(templateId, approverId, signature): EthicsOverride

// Campaign & authorization (WS-B ↔ WS-A)
createCampaign(input: CampaignInput): Campaign
preflight(campaignId): { decisions: PolicyDecision[], summary: PreflightSummary }  // dry run, per participant
requestAuthorization(campaignId): { scopeHash, scopeSnapshot, canonicalPayload }
signAuthorization(campaignId, approverId, signatureB64): { approvals: number, grant?: Grant }
revokeAuthorization(campaignId, reason): void
setKillSwitch(campaignId, on: boolean): void

// Roster & scope (WS-B ↔ WS-A)
importRoster(csv: string, attestationNote: string): { rosterHash, rows, rejected }
addApprovedDomain(domain, kind): { verifyToken, instructions }
verifyApprovedDomain(domainId): { verified: boolean, method: 'dns-txt' | 'stub' }
addSuppression(scope, value, reason, expiresAt?): Suppression

// Analytics (WS-E ↔ WS-A)
execSummary(campaignId?): ExecSummary                               // always k-safe
cohortBreakdown(dimension: 'department'|'roleArchetype'|'locale'|'difficulty')
  : KGuarded<CohortRow[]>                                           // may return { suppressed: true, k }
holdoutEffect(campaignId): HoldoutResult                            // includes CI + significance flag
exportAwarenessReport(campaignId): { htmlPath, pdfPath }

// Privacy (WS-E ↔ WS-A)
runRetentionPurge(dryRun: boolean): PurgeReceipt[]
dsar(participantPid, kind: 'ACCESS'|'ERASURE'): DsarRequest
optOut(participantPid): void

// Simulation surface — apps/sim route handlers (WS-C), no session, append-only
GET  /p/:token            → 1x1 gif    + Event(PROBABLE_OPEN)
GET  /t/:token            → landing    + Event(CLICK_UNCONFIRMED)
POST /t/:token/interact   → 204        + Event(CLICK_CONFIRMED)   // beacon
POST /t/:token/intent     → 204        + Event(SUBMIT_INTENT)     // no body fields accepted
GET  /q/:token            → landing    + Event(QR_SCAN)
GET  /r/:token            → thank-you  + Event(REPORTED)
POST /t/:token/training   → 204        + Event(TRAINING_COMPLETE|DRILL_PASS|DRILL_FAIL)
GET  /attest              → public attestation page (reads the latest signed attestation artefact)
```

`KGuarded<T> = { ok: true, data: T } | { ok: false, suppressed: true, k: number, cohortSize: number }`
— the **type system** forces every caller to handle suppression. That is privacy by construction, and it
is a 20-second explanation on stage.

---

## 8. Package specifications

### `packages/safety-lint` — the zero-credential enforcer
Rules (each with an id, severity and a one-line human explanation shown in the Studio):

| Rule | Severity | Checks |
|---|---|---|
| `SL001_NO_PASSWORD_INPUT` | **FAIL** | No `type="password"`, no `autocomplete="current-password"/"new-password"` |
| `SL002_NO_NAMED_INPUT` | **FAIL** | No `<input name=…>` / `<textarea name=…>` / `<select name=…>` in templates or landings |
| `SL003_NO_FORM_ACTION` | **FAIL** | No `<form action>`, no `formaction`, no `method="post"` |
| `SL004_NO_EXTERNAL_POST` | **FAIL** | No `fetch(`/`XMLHttpRequest`/`navigator.sendBeacon` to a non-`self` origin |
| `SL005_NO_SCRIPT` | **FAIL** | No `<script>`, no `on*=` handlers, no `javascript:` URLs in a template |
| `SL006_WATERMARK_PRESENT` | **FAIL** | Mandatory `X-Chetna-Simulation` + `X-Simulated-Phish` headers and an invisible watermark id in the body |
| `SL007_KILL_LINK_PRESENT` | **FAIL** | The one-click report link `/r/:token` is present |
| `SL008_NO_REAL_BRAND_ASSET` | WARN | Remote images / known brand logo hashes → inline placeholder instead |
| `SL009_NO_ATTACHMENT_PAYLOAD` | **FAIL** | Attachments limited to inert allowlisted types; no macro/archive/executable |
| `SL010_NO_PII_IN_URL` | **FAIL** | Every link is `/{p,t,q,r}/:token` — no query string, no email, no name |

Exit path: `npm run verify:safety` runs the linter over **all** templates plus a canary ("try to submit a
password") and writes a **signed attestation JSON** that `/attest` renders. CI fails on any FAIL.

### `packages/ethics` — harmful-lure prevention
- **Banned themes** (BLOCK): compensation/bonus/salary, redundancy/layoff/termination, bereavement/death,
  medical results/illness, immigration/visa status, children/school emergency, legal threat/police,
  disciplinary action, religious or political targeting.
- **Caution themes** (FLAG): performance review, tax/payroll, benefits enrolment, travel disruption.
- Detection: curated multilingual lexicon + phrase patterns + negation handling, scored per theme;
  optional LLM second opinion (`packages/ai`) that can only *raise* severity, never lower it.
- A BLOCK renders the real-world precedent in the UI, with the citation. Override requires
  `HR_APPROVER`, a free-text justification of ≥ 120 characters, an Ed25519 signature, and an audit entry.
  A security admin cannot override alone. **This is the clause nobody else implements.**

### `packages/phishscale` — NIST Phish Scale
Cue detectors grouped into the five NIST categories (errors; technical indicators; visual presentation;
language & content; common tactics) → `cueCount` → band (1–8 Few / 9–14 Some / 15+ Many). Combined with
an operator-set `premiseAlignment` (1–5, with the NIST-derived prompts shown inline) to produce a
`Difficulty`. Each detected cue carries a DOM anchor so the teachable moment can **highlight it in the
exact email the person received** — that mapping is the whole reason the package exists.

### `packages/privacy` — kAnonGuard and retention
```ts
kGuard<T>(rows: CohortRow[], k = 5): KGuarded<T>   // suppress cells < k AND complementary cells
                                                    // k floor is 3; k is in Org.settings, audit-logged
```
Retention defaults (`RetentionRule`): `TELEMETRY_RAW` 30 d · `EVENT` 180 d · `CONTACT` 365 d ·
`LEARNING` 365 d · `REPORT` 730 d · `AUDIT` 2555 d (7 y, append-only, never purged by the job).
The worker purges on a tick and writes a `PurgeReceipt` **plus an audit entry** — deletion is itself
evidence. DSAR: `ACCESS` → JSON export of everything tied to a `pid`; `ERASURE` → tombstone the
`Participant`, null the contact fields, keep aggregate counts (lawful, and keeps analytics honest).

### `packages/audit` — tamper-evident log
`hash_n = SHA256(seq ‖ prevHash ‖ action ‖ payloadHash ‖ actorId ‖ at)`. Append-only repository; no update
or delete path exists in code. `chetna audit verify` walks the chain, re-computes every hash, verifies
every Ed25519 signature on grants and overrides, and prints a Merkle root. **Run it live on stage.**

### `packages/ai` — guarded AI
```ts
interface AiProvider { complete<T>(req: { promptId: string; vars: Record<string,string>;
                                          schema: ZodType<T>; maxTokens: number }): Promise<T> }
```
- `offline` provider (default): deterministic, seeded, template-driven — identical output every run, so the
  demo is reproducible and needs no key or network.
- `anthropic` provider: optional, behind `CHETNA_AI_PROVIDER=anthropic` + key.
- Hard rules, enforced in code: participant PII is never in `vars` (only `roleArchetype`, `department`,
  `cueTags`); every response is zod-parsed and rejected on mismatch; generated templates are **persisted
  only after** passing safety-lint and ethics; no tool/function calling; template content fetched from the
  DB is never concatenated into an instruction position (prompt-injection containment), and the prompts
  state that message content is untrusted data.

---

## 9. Security posture of the platform itself

A phishing simulator is itself a dangerous artefact. This section exists because judges will ask.

| Area | Control |
|---|---|
| **Anti-weaponisation** | Gates G1–G7; zero-credential architecture; mandatory watermark + simulation headers; offline mode; dual-control authorization; tamper-evident audit; kill switch; AUP in `docs/03-SAFEGUARDS.md` |
| AuthN/AuthZ | argon2id, httpOnly+SameSite=Strict cookies, server-side session store, optional TOTP, RBAC checked in a single `requireRole()` guard used by every action |
| Input | zod at every boundary; template HTML sanitised with DOMPurify for preview and rendered in a `sandbox` iframe |
| Output | Strict CSP on both apps (`sim`: `default-src 'self'; form-action 'none'; script-src 'self'`), `Referrer-Policy: no-referrer`, `X-Content-Type-Options`, HSTS in prod |
| Injection | Prisma parameterised queries only; no raw SQL outside one reviewed analytics file |
| SSRF | No server-side fetch of user-supplied URLs anywhere; remote template images are rejected by `SL008` |
| Rate limiting | Per-IP on `apps/sim`, per-org send limits, per-participant cooldown |
| Secrets | `.env` only, `.env.example` committed, key material generated by `chetna keys init`, never in the repo |
| Supply chain | Pinned versions, `npm audit` in CI, CycloneDX SBOM via `cyclonedx-npm`, lockfile committed |
| Logging | Structured; **the logger redacts email, token and IP by default** (a test asserts this) |
| Threat model | STRIDE table + abuse cases in `docs/03-SAFEGUARDS.md`, each row mapped to a test in `tests/abuse` |

---

## 10. The abuse suite (`tests/abuse`) — our best technical exhibit

Every safeguard has a test that **actively attempts the abuse**. The suite doubles as the live demo of
Technical quality: we run it on stage and show 20+ hostile attempts failing.

```
A01 template with <input type="password">            → lint FAIL, save rejected
A02 template with a form action to an external host  → lint FAIL
A03 template with inline <script>                    → lint FAIL
A04 "COVID-19 bonus payment" lure                    → ethics BLOCK + precedent cited
A05 ethics override attempted by SECURITY_ADMIN      → 403, requires HR_APPROVER
A06 send with no grant                               → BLOCKED G1_NO_GRANT
A07 roster edited after approval, then send          → BLOCKED G1_SCOPE_DRIFT
A08 both approvals from the same user                → rejected G1_APPROVERS_NOT_DISTINCT
A09 forged signature byte-flipped                    → rejected G1_SIGNATURE_INVALID
A10 recipient at gmail.com in an offline demo        → BLOCKED G7_OFFLINE_MODE_NON_TEST_DOMAIN
A11 recipient outside the approved roster            → BLOCKED G2_NOT_ON_ROSTER
A12 opted-out participant                            → BLOCKED G4_SUPPRESSED_OPT_OUT
A13 participant simulated 5 days ago                 → BLOCKED G4_COOLDOWN_ACTIVE
A14 send outside the authorized window               → BLOCKED G6_OUTSIDE_WINDOW
A15 kill switch on                                   → BLOCKED G6_KILL_SWITCH
A16 POST /t/:token/intent with a password field      → extra fields stripped; nothing persisted
A17 audit entry mutated in the DB                    → chain verification FAILS loudly
A18 cohort query for a 3-person department           → suppressed: true, k=5
A19 cross-tab query that shrinks a cell below k      → suppressed (complementary suppression)
A20 analyst requests an individual's results         → 403 by RBAC, and no such endpoint exists
A21 PII in a tracking URL                            → lint SL010 FAIL
A22 prompt-injection string inside a template body   → AI output still schema-valid; instruction ignored
A23 DSAR erasure                                     → contact fields null, aggregates intact, receipt written
A24 retention purge                                  → rows gone past cutoff, receipt + audit entry written
```

---

## 11. Offline guarantees (the demo cannot fail)

1. SQLite file — no DB daemon.
2. SMTP sink **bound to `127.0.0.1`** — show `netstat -ano | findstr 1025` on stage.
3. `CHETNA_MODE=offline` → G7 forbids non-loopback transport and non-test recipient domains, and the mode
   is part of the signed scope, so it cannot be flipped mid-campaign.
4. AI provider defaults to `offline` and deterministic.
5. No analytics, telemetry, font CDN or remote image at runtime — fonts and icons are vendored.
6. `npm run demo` seeds everything, including a **completed prior campaign** so dashboards have history on
   first open. (A dashboard with no data is how good demos die.)
7. Verified with the network adapter disabled as part of the H36–H42 rehearsal.

---

## 12. Production path (Feasibility — say this unprompted)

| Step | What changes |
|---|---|
| Database | Prisma `datasource` → Postgres; `prisma migrate deploy`; ingest role granted `INSERT` on `Event` only |
| Queue | `JobRunner` → BullMQ/pg-boss; worker scales horizontally; assignments are claimed rows, so it is already safe |
| Mail | `MailTransport` → SES/Postmark/on-prem relay; DKIM + SPF on the verified sender domain; **real DNS TXT** domain verification replaces the stub resolver |
| Deliverability | Microsoft Defender **advanced delivery** entry (sending domain P1/DKIM + sending IP; body URLs auto-allowed since MC545900 — note gateways that rewrite IPs break matching) and the Google Workspace equivalent; both scripted in the deployment guide |
| Reporting | Outlook / Gmail report add-in posts to `/r/:token`; `ReportTriage` already models the queue |
| Identity | OIDC/SAML behind the `Session` interface; SCIM for roster sync replacing CSV import |
| Scale | Measured on commodity hardware in the report; send throughput is rate-limit-bound by design, not CPU-bound |
| Observability | OpenTelemetry traces; the audit chain is already the compliance log |
| Cost | Self-hosted: one small VM + managed Postgres. Documented against per-seat commercial licensing |
