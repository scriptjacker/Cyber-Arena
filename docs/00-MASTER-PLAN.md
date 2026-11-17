# Chetna — Master Plan

**PS-28 · AI & Emerging Technology Security**
**Cybersecurity Awareness and Authorized Phishing Simulation Platform**

> **चेतना (Chetna)** — *awareness, consciousness.*
> Tagline: **"Measure the sensor, not the victim."**
> Sub-tagline for the landing page: *A drill, not a trap.*

Locked constraints for this build: **~48 hours**, **4–6 people**, **TypeScript monorepo**,
**fully offline / local demo**. Everything below is scoped to those four facts.

> **Naming:** the product name appears in exactly one place in code (`packages/core/src/brand.ts`).
> Renaming to `PhishDojo`, `Prahari`, `Abhyas` or anything else is a one-line change. Recommendation:
> keep **Chetna** — it is short, memorable, means precisely what the product does, and reads well to an
> Indian jury with the English subtitle *"Authorized Phishing Simulation & Awareness Platform"*.

---

## 1. One concern, stated once, before we build

You asked for a project with "no room for improvement". In 48 hours that is not literally achievable for
any team, and claiming it is would be the fastest way to lose the Technical and Feasibility marks — judges
probe for exactly that. What **is** achievable, and what this plan delivers, is stronger:

- **Every one of the 5 objectives has a working, demonstrable, non-mocked implementation.**
- **Every one of the 5 deliverables ships as an artefact a judge can open.**
- The things we do *not* build are listed in a **deliberate roadmap with reasons**, not discovered by a
  judge as gaps. A team that says *"we chose not to build SAML in 48 hours; here is the interface it plugs
  into"* scores higher on Feasibility than a team that mumbles.
- **Three or four capabilities that no competing submission will have**, each demonstrable in under 30
  seconds on stage.

That is what "final state" means under a 48-hour clock, and the plan is built to it. Nothing below is
padding; if you cut a line, something in the rubric gets weaker.

---

## 2. The thesis (this is the pitch, memorise it)

Three studies covering **~34,000 employees** say the industry is optimising the wrong thing:

1. **UCSD / IEEE S&P 2025** (19,500 staff): annual training shows no measurable effect; embedded
   "you-clicked" training cuts clicking by about **2 percentage points**; **75% of people spend under a
   minute on it** and a third close it instantly.
2. **ETH Zurich / IEEE S&P 2022** (14,733 staff, 15 months): embedded training during simulations can make
   employees **more** susceptible — but **employee reporting works**, scales, and sustains.
3. **UK NCSC**: blaming users does not work, click-rate culture destroys reporting, simulations carry legal
   risk, and you must involve HR before you run one.

So the standard product — blast a lure, count clicks, shame the clickers, mail a PDF to the manager — is
measuring a number that encourages the one behaviour (hiding mistakes) that actually gets companies
breached.

**Chetna inverts it:**

| Industry default | Chetna |
|---|---|
| Optimise click rate | Optimise **report rate, report speed, report accuracy** |
| Employee = suspect | Employee = **sensor** |
| Raw percentages | **Difficulty-adjusted** (NIST Phish Scale) |
| "Training works, trust us" | **Randomised holdout + confidence intervals** that can say *no effect* |
| Credential capture optional | Credential capture **impossible**, and proven so by tests |
| Authorization = a PDF in a drawer | Authorization = **two Ed25519 signatures and 7 pre-send gates** |
| Harmful lures = a judgement call | Harmful lures = **blocked by a classifier that cites the precedent** |
| Privacy = a policy page | Privacy = **a query layer that refuses to identify a person** |

**Closing line of the pitch:** *"Every other platform asks 'how many of your people failed?'. Chetna asks
'how fast does your organisation notice an attack?' — and it is the only one that will tell you when the
answer hasn't improved."*

---

## 3. Product shape — five pillars, one per objective

| # | Objective (verbatim from PS-28) | Pillar | Hard proof we show the judges |
|---|---|---|---|
| 1 | Create configurable, clearly controlled phishing simulation templates | **Template Studio** | Visual builder + 10 seeded templates + `safety-lint` rejecting an unsafe template live, with CI output |
| 2 | Run campaigns only for authorized participants and approved domains | **Scope Guard** | 7-gate preflight panel; dual-signature grant; a deliberate out-of-scope send blocked on stage; `chetna audit verify` |
| 3 | Track safe interaction metrics: opens, simulated clicks, user reports | **Safe Telemetry** | Event timeline with machine-filtered opens shown separately; zero credential fields anywhere; attestation page |
| 4 | Provide immediate educational feedback and targeted awareness content | **Teachable Moment** | Cue-annotated replay of the exact email + 45-second interactive drill + spaced follow-up, completion-tracked |
| 5 | Generate privacy-conscious team and campaign analytics | **Privacy Analytics** | Dashboards, holdout effect with CI, and the k-anonymity guard **refusing** a 3-person cohort live |

Cross-cutting: **Safety Core** (the anti-weaponisation engine) and **Trust Report** (one-click awareness
report + authorization dossier).

---

## 4. The twelve differentiators

Ranked by *demo impact per hour of build*. P0 = in the demo spine, P1 = should land, P2 = roadmap if time dies.

| # | Differentiator | Why it scores | Pri |
|---|---|---|---|
| 1 | **Zero-Credential Architecture, machine-verified.** No template may contain a password field, named input or form action. `@chetna/safety-lint` enforces it; a CI test fails the build; the landing app has no credential sink; a live **Non-Collection Attestation** page shows the rules, the passing tests and the schema that has nowhere to put a secret. | Answers the "non-credential-collection safeguards" deliverable with *proof*, not prose. Technical + Innovation. | **P0** |
| 2 | **Authorization-as-code with cryptographic dual control.** A campaign cannot leave `PENDING_AUTH` without an `AuthorizationGrant` signed by **two distinct approvers** (Security + HR/People) over a canonical scope hash, chained into a tamper-evident hash-chain audit log, verifiable from the CLI. | Objective 2, and the single most "enterprise-real" thing in the room. | **P0** |
| 3 | **Harm & ethics screening of lures.** Banned-theme taxonomy (compensation/bonus, bereavement, redundancy, medical, immigration, children, legal threat, disciplinary) blocks a lure at authorship, **cites the real incident** (West Midlands Trains 2021), and demands a signed, justified HR override. | The clause everyone else ignores: "without exposing participants to harmful campaigns". Biggest *gasp* moment in the demo. | **P0** |
| 4 | **7-gate send policy engine.** Grant validity → roster membership → domain ownership + approved recipient domains → suppression list → template safety + ethics → window/rate/kill-switch → environment guard. Every decision is a structured reason code written to the audit log. | Objective 2 with teeth; also the Feasibility story. | **P0** |
| 5 | **NIST Phish Scale difficulty engine.** Automatic cue detection across the 5 NIST categories + premise-alignment rating → difficulty band on every template, used for fair metrics, progression and the feedback overlay. | Standards-grounded innovation; impossible to dismiss as hand-waving. | **P0** |
| 6 | **Honest telemetry.** Opens are `probable_open` with a machine-likelihood score; scanner / prefetch / Apple-MPP traffic is classified `MACHINE`, excluded from human metrics and **shown as a separate number**. Clicks need an interaction beacon to be `CONFIRMED`. | Objective 3 done properly. Judges with ops experience will notice immediately. | **P0** |
| 7 | **Report-first workflow + SOC triage console.** One-click report from the simulated inbox; reports feed a triage queue that clusters reported threats and surfaces **time-to-first-report** and sensor coverage. | Operationalises the one intervention the ETH study proved works. | **P0** |
| 8 | **Privacy by architecture.** Opaque 128-bit tokens (no PII in any URL, ever); individual results visible only to the individual; every cohort query passes `kAnonGuard` (k=5, hard floor 3, complementary-cell suppression) which **refuses** rather than degrades; retention clocks per data class with automated purge receipts; self-service DSAR export/erase. | Objective 5 + the privacy deliverable. | **P0** |
| 9 | **Randomised holdout measurement.** Stratified randomisation into TREATMENT/HOLDOUT, effect size with Wilson confidence intervals, and a UI that says **"no significant effect yet"** when that is the truth. | Nobody else will have a control arm. Pure Innovation points. | **P1** |
| 10 | **AI, used safely, three places.** Lure Composer (schema-validated, PII-free, output must pass safety-lint + ethics before it can be saved), Coach (60-second personalised feedback on the exact cues missed), AI-threat curriculum (AI lures, deepfake voice, quishing, MFA fatigue). Deterministic **offline provider** so the demo needs no key and no network. Prompt-injection containment documented. | It is an **AI security** track. We both *use* AI and *secure* our use of it. | **P1** |
| 11 | **Multichannel, lean.** Email + **QR / quishing** + simulated SMS card + a scripted vishing tabletop — all delivered inside the platform, same gates, no telecom. | "Emerging technology" coverage for ~3 hours of work. | **P1** |
| 12 | **One-click Awareness Report.** HTML + PDF: difficulty mix, resilience metrics, holdout result with CI, learning gaps, recommended modules, control mapping (ISO 27001 A.6.3, PCI DSS 12.6.3.1, NIS2 Art. 20, DPDP §7(i)) and the authorization dossier as an appendix. | Deliverable 4 + 5 in a single button. | **P0** |

---

## 5. Scope ladder — what ships, what doesn't

### P0 — the demo spine (if this is not done, we have no submission)
Monorepo + schema + seed · Template Studio with safety-lint · ethics screen · 7-gate policy engine ·
dual-signature authorization + hash-chain audit + CLI verify · SMTP sink + participant webmail ·
send worker · token/landing/telemetry with machine filtering · report button + SOC triage ·
teachable moment with cue overlay + 45s drill · exec + cohort dashboards with kAnonGuard ·
retention purge + DSAR · awareness report (HTML + PDF) · abuse test suite · demo seed data.

### P1 — strongly wanted
Holdout + Wilson CI · AI Composer & Coach (offline provider) · QR/quishing channel · spaced repetition
follow-up · participant self-service portal · resilience rating (Elo-lite) · Playwright E2E ·
deployment guide + DPIA + works-council note · pitch deck + rehearsed demo + backup video.

### P2 — explicit, documented roadmap (we say this out loud)
SSO/SAML/OIDC + SCIM provisioning · true multi-tenancy with row-level security · live DNS TXT domain
verification (we ship the logic behind a stubbed resolver) · real SMS/voice gateways · Slack/Teams
channels · Outlook/Gmail report add-in (documented integration path, not built) · i18n beyond en/hi
strings · differential-privacy noise (we ship k-anonymity now) · load testing beyond 10k assignments ·
Postgres row-level grants for the ingest role.

> **Say this on stage:** *"Those are 4 of the 11 roadmap items, each with the interface it plugs into
> already defined. We spent our 48 hours on the safety core, because that is what makes the rest
> deployable at all."*

---

## 6. Team split — 5 workstreams, hard interfaces, no collisions

The single biggest risk with 4–6 people in 48 hours is **merge pain**. We eliminate it by freezing the
contracts in the first two hours, then letting each stream own disjoint directories.

| WS | Owner role | Owns (directories) | P0 output |
|---|---|---|---|
| **A — Safety Core** | Strongest engineer / tech lead | `packages/core`, `policy`, `safety-lint`, `ethics`, `audit`, `phishscale`, `cli`, `packages/db` | The 7 gates, signatures, hash chain, linter, ethics classifier, Phish Scale, seed + CLI |
| **B — Console & Campaign UX** | Frontend-strong | `apps/console/(admin)` | Template Studio, campaign wizard + preflight panel, authorization signing UI, roster import, SOC triage |
| **C — Delivery & Telemetry** | Backend/infra-minded | `apps/sim`, `services/mailsink`, `services/worker` | SMTP sink + webmail, send worker, token service, landing pages, event ingest, machine filtering |
| **D — Learning & Content** | Content + frontend | `apps/console/(learn)`, `content/`, `packages/ui` | Teachable moment with cue overlay, 45s drill, 6 micro-modules, 10 templates, spaced follow-up |
| **E — Analytics, Report, Docs & Pitch** | Analytical + writer | `packages/scoring`, `privacy`, `apps/console/(analytics)`, `docs/`, `deck/` | Dashboards, kAnonGuard, Wilson CI, PDF report, DPIA, deployment guide, deck, demo script |
| **F — QA & Demo Master** *(if 6th person)* | Detail-obsessed | `tests/`, `scripts/demo` | Abuse suite, Playwright E2E, seed realism, 3 rehearsals, backup video, judge handout |

With 4 people: fold F into E, and D's content work into B after hour 30.

**Interface freeze (hour 2) is non-negotiable.** `packages/core/src/types.ts`, the Prisma schema, and
`docs/01-ARCHITECTURE.md` §7 (API contracts) are frozen and changed only by WS-A with an announcement.
Everyone else codes against them and mocks what doesn't exist yet.

---

## 7. 48-hour timeline

| Window | Everyone | Gate at the end |
|---|---|---|
| **H0–H2** Kickoff | WS-A scaffolds the monorepo and freezes types + Prisma schema + API contracts. Others read `docs/`, install, claim tasks. | `npm install && npm run db:push && npm run dev` runs for all five streams |
| **H2–H10** Parallel build I | A: policy gates + audit + safety-lint. B: template studio + campaign wizard shell. C: mailsink + webmail + worker skeleton. D: Phish Scale cue UI + 4 templates. E: schema-level analytics queries + docs skeleton. | Each stream has something running against the seed DB |
| **H10–H16** Vertical slice | **Integrate the spine end to end**: create → authorize → send → inbox → click → teachable moment → event in DB. Nothing else matters in this window. | **Spine demo works once, on one machine** |
| **H16–H20** Rotate / sleep | Half the team sleeps. The other half: seed realism, bug list triage. | Written bug list, prioritised |
| **H20–H30** Parallel build II | Ethics screen + override flow; SOC triage; dashboards + kAnonGuard; drill + modules; retention + DSAR; awareness report. | All five objectives demonstrable |
| **H30–H36** Harden | Abuse test suite (every gate has a test that *tries* to break it), Playwright E2E, attestation page, CLI verify, empty/error states, accessibility pass. | `npm test` green; `npm run verify:safety` green |
| **H36–H42** Pitch | Deck, demo script, 3 timed rehearsals, backup video + screenshots, judge handout, README polish, roadmap honesty pass. | Demo runs in **under 5 minutes** without a hiccup |
| **H42–H46** Buffer | Only bug fixes and demo-data polish. **Feature freeze.** | Tag `v1.0.0-demo` |
| **H46–H48** Final | Final rehearsal, submission package (repo + docs + deck + video + report PDF). | Submitted |

**Rules:** feature freeze at H42 is absolute. Nobody demos from `main` — the demo runs from the tag.
Every stream commits at least hourly. Any blocker older than 30 minutes goes to the tech lead.

---

## 8. Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Merge hell across 5 streams | High | Fatal | Interface freeze at H2; disjoint directory ownership; `npm run typecheck` in pre-push hook |
| Scope creep ("let's add SSO") | High | Fatal | Written P0/P1/P2 ladder; tech lead is the only person who may reclassify |
| Demo fails on venue Wi-Fi | Medium | Fatal | **Fully offline by design**: SQLite, local SMTP bound to 127.0.0.1, deterministic AI provider, zero network calls at runtime. Verified with the network card disabled. |
| Vertical slice not done by H16 | Medium | Severe | H10–H16 is an integration-only window; everything else stops |
| Judge asks "isn't this just Gophish?" | High | Severe | Comparison table in §6 of `05-RESEARCH-EVIDENCE.md`; the three live blocks answer it in 30 seconds |
| Judge asks "did you really not store the password?" | Medium | Severe | Attestation page + live `grep` of the schema + the canary test in the abuse suite |
| One teammate goes dark | Medium | Moderate | Each WS has a documented P0 that another stream can absorb; no stream owns two P0 items alone |
| Over-claiming in the pitch | Medium | Severe | `docs/04-DEMO-SCRIPT.md` §FAQ fixes the exact wording for every stat, flagged primary vs secondary |

---

## 9. Definition of done (check this at H42)

- [ ] `npm install && npm run demo` on a clean clone, network disabled, brings up a seeded org, 240
      participants, 10 templates and a completed campaign in under 3 minutes.
- [ ] All 5 objectives demonstrable from the UI without touching a terminal.
- [ ] All 5 deliverables exist as artefacts: running platform · controlled-environment demo campaign ·
      participant learning workflow + reporting dashboard · campaign analytics + sample awareness report
      PDF · safeguards documentation pack.
- [ ] `npm test` green, including the **abuse suite** (every gate has a test that tries to defeat it).
- [ ] `npm run verify:safety` emits a signed attestation: no credential sink, no PII in URLs, audit chain intact.
- [ ] Demo rehearsed 3 times, under 5 minutes, with a backup video and screenshots on a USB stick.
- [ ] Roadmap written as a deliberate choice, with interfaces named.
- [ ] Every statistic on every slide tagged primary or secondary, with the source to hand.

---

## 10. Document map

| File | What it is | Primary reader |
|---|---|---|
| `docs/00-MASTER-PLAN.md` | This file: thesis, scope, team, timeline, risk | Everyone, hour 0 |
| `docs/01-ARCHITECTURE.md` | Monorepo, data model, policy engine, telemetry, API contracts, tech decisions | Engineers |
| `docs/02-JUDGING-ALIGNMENT.md` | Objective → feature → demo beat → artefact matrix; rubric strategy for each 25% | Tech lead, pitcher |
| `docs/03-SAFEGUARDS.md` | Authorization, privacy, retention, non-collection spec + DPIA + works-council note + AUP | WS-A, WS-E, judges |
| `docs/04-DEMO-SCRIPT.md` | Minute-by-minute demo, deck outline, 20 hard questions with answers | Pitcher, demo master |
| `docs/05-RESEARCH-EVIDENCE.md` | The literature, with citations and confidence flags | Pitcher, everyone |
| `docs/06-WORKPLAN-48H.md` | Task-level backlog per workstream with hour estimates and acceptance criteria | Everyone, continuously |
