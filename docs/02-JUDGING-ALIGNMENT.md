# 02 — Judging Alignment

The jury scores **Innovation 25 · Technical 25 · Feasibility 25 · Presentation 25**. This file is the
traceability matrix: every objective and deliverable maps to a feature, a demo beat, and an artefact a
judge can open. Use it as the pre-submission checklist.

---

## 1. Objectives → implementation → proof

### Objective 1 — "Create configurable, clearly controlled phishing simulation templates"

| Requirement word | How we satisfy it | Demo beat | Artefact |
|---|---|---|---|
| **Configurable** | Template Studio: channel (email / QR / SMS-sim / voice tabletop), scenario from a MITRE ATT&CK taxonomy (T1566.001/.002/.003/.004, T1598), sender identity, subject, HTML/text body, merge variables, premise-alignment rating, difficulty recomputed live | 1:00 | 10 seeded templates + the Studio |
| **Clearly controlled** | Every template must pass **10 safety-lint rules** before it can be saved; mandatory watermark + `X-Chetna-Simulation` / `X-Simulated-Phish` headers; mandatory one-click report link; no scripts, no named inputs, no form actions, inert attachments only | 1:30 — add a password field, watch the save fail | `packages/safety-lint`, CI output, `/attest` |
| **(implicit) not harmful** | `packages/ethics` banned-theme screen with precedent citations and HR-signed override | 1:00 — the COVID-bonus block | `packages/ethics` + `EthicsOverride` records |
| **(implicit) calibrated** | NIST Phish Scale cue detection + premise alignment → difficulty band, and cue anchors reused in the feedback overlay | 1:15 | `packages/phishscale` |

> **The line to say:** *"A template in Chetna is not a free-text email box. It is a controlled object that
> cannot be saved until it proves it is safe, and it carries its own difficulty rating."*

### Objective 2 — "Run campaigns only for authorized participants and approved domains"

| Requirement word | How we satisfy it | Demo beat | Artefact |
|---|---|---|---|
| **only** | The 7-gate policy engine runs as a dry-run preflight **and again per message at send time**; any failure blocks the send and writes a reason code to the audit log | 2:00 | `packages/policy`, preflight panel |
| **authorized** | `AuthorizationGrant`: canonical scope hash, **two Ed25519 signatures from two distinct users in distinct roles** (Security + HR), expiry, revocation; scope drift after approval invalidates the grant | 2:00 — two people sign; then edit the roster and watch G1_SCOPE_DRIFT fire | Grant + `Approval` rows, `chetna audit verify` |
| **participants** | Roster import with an attestation note and a `rosterHash` frozen into the signed scope; suppression list (opt-out, HR exclusion, 30-day cooldown, new-joiner grace) | 2:15 | `RosterImport`, `Suppression` |
| **approved domains** | `ApprovedDomain` with `SENDER` / `LANDING` / `RECIPIENT` kinds, ownership challenge before use, and a recipient-domain allowlist | 2:15 — send to `gmail.com`, blocked | `ApprovedDomain` + G3/G7 reason codes |
| **(implicit) auditable** | Hash-chained append-only audit log, Ed25519-signed approvals, CLI verifier with a Merkle root | 2:30 | `chetna audit verify` on stage |

> **The line to say:** *"In Gophish, authorization is a PDF in a drawer. Here it is two cryptographic
> signatures, and the campaign physically cannot send without them."*

### Objective 3 — "Track safe interaction metrics such as opens, simulated clicks and user reports"

| Requirement word | How we satisfy it | Demo beat | Artefact |
|---|---|---|---|
| **opens** | `PROBABLE_OPEN` with a machine-likelihood score; Apple MPP / scanner / prefetch traffic classified `MACHINE`, excluded from human metrics and **reported separately on the dashboard** | 3:40 | Event timeline + "machine-filtered: N" tile |
| **simulated clicks** | `CLICK_UNCONFIRMED` on landing, promoted to `CLICK_CONFIRMED` only by a human-interaction beacon | 2:50 | Event timeline |
| **user reports** | One-click report from the email and from the webmail ribbon; `timeToReport`; SOC triage queue with clustering and time-to-first-report | 3:15 | Triage console |
| **safe** | No credential field exists anywhere; `SUBMIT_INTENT` captures the behaviour without the secret; opaque 128-bit tokens — **no PII in any URL**; only `ipClass` and `uaFamily` stored, never raw IP or UA; `Event.meta` restricted to an enumerated key schema | 1:30 + 4:10 | `/attest`, abuse suite A16/A21, schema |

> **The line to say:** *"We do not record whether you typed your password. We record that you were about
> to — and then we teach you. There is no field in this product that could hold a secret, and we can prove
> that in one command."*

### Objective 4 — "Provide immediate educational feedback and targeted awareness content"

| Requirement word | How we satisfy it | Demo beat | Artefact |
|---|---|---|---|
| **immediate** | The clicked link lands straight on the teachable moment — zero interstitials, visible "this was a simulation" banner, no dark patterns | 2:50 | `apps/sim/app/t/[token]` |
| **educational feedback** | Cue-annotated replay of **the exact email they received**, with the NIST cues they missed highlighted inline and explained on hover; the 3 checks that would have caught it | 3:00 | Cue overlay |
| **(evidence-driven)** | Engineered to a **45-second attention budget** because 75% of people give embedded training under a minute (UCSD 2025); the lesson is **interactive and completion-tracked** because only *completed* interactive training correlated with improvement | 3:05 | `Progress.dwellMs`, `DRILL_PASS` |
| **targeted** | Gap taxonomy (urgency, authority, lookalike domain, reply-to mismatch, attachment, QR, MFA push, payment change) → module mapping; only the relevant module is assigned, never a blanket course | 3:10 | `Module.cueTags`, assignment logic |
| **awareness content** | 6 micro-modules incl. **AI-generated phishing, deepfake voice, quishing, MFA fatigue**; Leitner-box spaced follow-up at D+7 | 3:10 | `content/` MDX |
| **non-punitive** | No shaming copy, no leaderboards of failure, reporters thanked and streaked — per NCSC guidance that blame suppresses reporting | 3:15 | UI copy review |

### Objective 5 — "Generate privacy-conscious team and campaign analytics"

| Requirement word | How we satisfy it | Demo beat | Artefact |
|---|---|---|---|
| **team analytics** | Exec dashboard: resilience ratio, difficulty-adjusted susceptibility, median time-to-report vs benchmark, sensor coverage, machine-filtered volume, trend over campaigns, cohort heatmap | 3:40 | Analytics pages |
| **campaign analytics** | Per-campaign funnel, difficulty mix, arm comparison, holdout effect with Wilson CI and an explicit "no significant effect detected" state | 3:50 | `holdoutEffect()` |
| **privacy-conscious** | `kAnonGuard` (k=5, hard floor 3, complementary-cell suppression) **refuses** rather than degrades; `KGuarded<T>` forces every caller to handle suppression; individual results visible only to the individual; no endpoint exists that returns a named individual to a manager | 4:10 — query a 3-person team, watch it refuse | `packages/privacy`, abuse suite A18–A20 |
| **(implicit) governed** | Retention clocks per data class, automated purge with receipts written into the audit log, self-service DSAR access/erasure | 4:20 | `PurgeReceipt`, `DsarRequest` |

---

## 2. Deliverables → artefact

| # | Deliverable | Artefact we hand over | Where |
|---|---|---|---|
| 1 | **Working awareness and simulation platform** | Monorepo; `npm install && npm run demo` boots the whole thing offline in under 3 minutes | repo root + `README.md` |
| 2 | **Demonstration campaign using a controlled test environment** | Seeded org "Nimbus Logistics", 240 synthetic participants on `.test` domains, 10 templates, 1 completed + 1 live campaign; local SMTP sink on `127.0.0.1:1025`; G7 makes a real-inbox send structurally impossible | `cli/` seed + `services/mailsink` |
| 3 | **Participant learning workflow and reporting dashboard** | Webmail → report button → thank-you + streak; click → teachable moment → 45 s drill → spaced follow-up; participant self-view; SOC triage dashboard | `apps/console/(learn)`, `(mail)`, triage |
| 4 | **Campaign analytics and sample awareness report** | Live dashboards + a one-click **HTML + PDF** awareness report with control mapping and the authorization dossier appendix; a pre-generated sample PDF committed to the repo | `/analytics`, `exportAwarenessReport()`, `deck/sample-awareness-report.pdf` |
| 5 | **Authorization, privacy, data retention and non-credential-collection safeguards** | `docs/03-SAFEGUARDS.md` (spec + DPIA + works-council note + AUP + STRIDE), enforced by `packages/{policy,privacy,audit,safety-lint,ethics}`, proven by `tests/abuse` and the signed `/attest` artefact | `docs/03`, `tests/abuse`, `/attest` |

Every deliverable is **both** a document and running code. A document without code loses Technical; code
without a document loses Feasibility and Presentation.

---

## 3. Rubric strategy — what earns each 25%

### Innovation (25%)
The claim is **not** "we built a phishing simulator". It is **"we rebuilt the discipline around what the
evidence says"**. Four things no other submission will have:

1. **An ethics engine that refuses to produce a harmful lure** and cites the news story — the only
   implementation of PS-28's "without exposing participants to harmful campaigns" clause we can find
   anywhere.
2. **A randomised holdout with confidence intervals that can report "no effect"** — a product honest
   enough to falsify its own value.
3. **NIST Phish Scale difficulty-adjusted metrics** — you cannot flatter your numbers with easy lures.
4. **Verifiable non-collection** — safety as a machine-checked property with a signed attestation, not a
   promise in a policy.

Plus: reporting-as-sensor with a SOC triage view (operationalising the ETH finding), machine-filtered
telemetry honesty, and AI used in three places with its own prompt-injection containment.

### Technical (25%)
Depth signals, in the order we show them: the pure-function 7-gate engine with reason codes · Ed25519
dual-control + SHA-256 hash-chained audit with a CLI verifier · the 10-rule linter with a CI gate · the
`KGuarded<T>` type forcing privacy handling at compile time · honest telemetry with machine scoring ·
Wilson intervals · the **24-case abuse suite run live** · origin isolation between console and simulation
surface with a `form-action 'none'` CSP · STRIDE threat model with each row mapped to a test.
Say: *"Our test suite does not check that features work. It checks that abuses fail."*

### Feasibility (25%)
One command, no Docker, no network, three minutes. Then the production path told **unprompted**: Postgres
swap, BullMQ, real SMTP with DKIM/SPF and DNS-TXT domain verification, Microsoft Defender advanced-delivery
and Google Workspace allowlisting steps, Outlook report-button integration path, OIDC/SCIM behind existing
interfaces, measured throughput, cost model versus per-seat licensing, a 90-day pilot rollout playbook with
comms templates and HR sign-off, control mapping to ISO 27001 A.6.3 / PCI DSS 12.6.3.1 / NIS2 Art. 20 /
DPDP Act §7(i), and an honest roadmap with named interfaces.
Say: *"We did not build SAML in 48 hours. Here is the interface it plugs into, and here is why the safety
core had to come first."*

### Presentation (25%)
A thesis a judge can repeat after hearing it once: **"Measure the sensor, not the victim."** Then a
five-minute demo with three *blocked* attempts as the dramatic beats — most teams demo success, which is
forgettable; we demo refusal, which is memorable. Backed by: a 10-slide deck, a rehearsed script with
timings, a backup video and screenshots, a one-page handout, and the 20-question FAQ in
`docs/04-DEMO-SCRIPT.md` so any team member can answer anything.

---

## 4. Anticipated jury challenges (short answers — long ones in `04-DEMO-SCRIPT.md` §FAQ)

| Challenge | One-breath answer |
|---|---|
| "Isn't this just Gophish with a UI?" | Gophish captures passwords in plaintext and lets anyone target anyone. We cannot capture a credential, cannot send without two signatures, and cannot produce a harmful lure. Different product category. |
| "How do we know you don't store credentials?" | There is no field to type one into, no column to hold one, a linter that fails the build, a canary test, and a signed attestation page. Four independent layers, all checkable right now. |
| "Phishing simulations are discredited — why build one?" | Agreed, in their current form. That is our starting premise, with three citations. We optimise reporting, not clicking, and we measure with a control arm so you can tell whether it worked. |
| "Could this be used for real phishing?" | G7 plus the signed-scope mode guard, domain ownership verification, mandatory watermark and simulation headers, dual control, and a tamper-evident log. The safety core is the product. |
| "Is this legal?" | Legitimate interests under GDPR with a DPIA (shipped), employment legitimate-use under DPDP Act §7(i), works-council note for co-determination jurisdictions, HR dual-control in code, programme-level prior notification, and opt-out honoured by the policy engine. |
| "Only 48 hours — what's missing?" | Eleven items, deliberately: SSO/SCIM, true multi-tenancy, live DNS verification, real SMS/voice, Slack/Teams, the Outlook add-in, DP noise, i18n, load testing past 10k. Each has its interface defined. |
| "Who would buy it?" | Anyone bound by PCI DSS 12.6.3.1 or ISO 27001 A.6.3 who cannot justify per-seat HRM licensing, plus regulated sectors needing an auditable authorization trail — and anyone whose works council has blocked a commercial tool on privacy grounds. |

---

## 5. Pre-submission checklist

- [ ] All 5 objectives demonstrated **from the UI**, no terminal required (except the two deliberate CLI moments)
- [ ] All 5 deliverables exist as openable artefacts, listed in `README.md` with paths
- [ ] `npm run demo` works on a clean clone **with the network disabled**
- [ ] `npm test` green including `tests/abuse` (24 cases)
- [ ] `npm run verify:safety` produces a signed attestation and `/attest` renders it
- [ ] `chetna audit verify` prints an intact chain and a Merkle root
- [ ] Sample awareness report PDF committed
- [ ] Deck, demo script, backup video, one-page handout in `deck/`
- [ ] Roadmap written as deliberate choices with named interfaces
- [ ] Every statistic on every slide tagged primary or secondary, source to hand
- [ ] Three timed rehearsals completed, demo under 5 minutes
