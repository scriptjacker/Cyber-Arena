# Chetna · चेतना

**Authorized Phishing Simulation & Security Awareness Platform**
*PS-28 — AI & Emerging Technology Security*

> **Measure the sensor, not the victim.**

---

> **STATUS: PIPELINE + SIMULATION SURFACE WORKING · ADMIN CONSOLE NOT YET BUILT.**
>
> **Working and verified today.** `npm test` runs **179 tests, all passing**; `npm run typecheck` is
> clean across all three TypeScript projects; `npm audit --omit=dev` reports **0 vulnerabilities**;
> the attestation reports **ATTESTED**.
>
> | Verified by running it | Result |
> |---|---|
> | `npm run demo` | 240 participants, 12 templates (2 blocked by the ethics screen), 7 learning modules, 2 completed campaigns with telemetry, 1 authorized campaign queued |
> | `npm run chetna -- preflight cmp_q2_courier --email attacker@gmail.com` | 227 would send, 13 refused at gate 4; the external address refused by G2 + G3 + G7 at once |
> | `npm run chetna -- send` | Real SMTP → loopback sink. 140 sent, 140 captured, 10 refused with reason codes, every message carrying its simulation headers |
> | `npm run chetna -- metrics cmp_q0_pilot` | **"No significant effect detected"** — 95% CI −6.6% to +14.8% includes zero |
> | `npm run chetna -- metrics cmp_q1_baseline` | A real effect: −11.4%, 95% CI 1.5% to 25.1%. Report rate rose 12% → 24% between the two |
> | `npm run chetna -- audit verify` | Chain intact, Merkle root printed |
> | `npm run chetna -- purge` | 416 raw-telemetry fields past the 30-day cutoff; AUDIT correctly excluded |
> | `npm run verify:safety` | 12 templates × 10 rules, 17 source files scanned, 0 violations, canary rejected by all 10 → **ATTESTED** |
> | `GET /t/<token>` on the live app | 200, and the delivered HTML contains **0** `<input>`, **0** `<form>` and **0** `type=password` |
> | `POST /t/<token>/intent` with `{"password":"hunter2",…}` | **400 — rejected outright.** A search of all 2,699 rows across 7 tables finds `hunter2` nowhere |
> | Response headers | Nonce-based CSP with `form-action 'none'`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY` |
>
> **Not built yet:** the admin console (template studio, campaign wizard and preflight panel,
> dual-signature authorization UI, participant webmail, SOC triage, dashboards) and the
> awareness-report PDF. Abuse case A20 (RBAC) lands with it. See
> [docs/06-WORKPLAN-48H.md](docs/06-WORKPLAN-48H.md).
>
> Nothing in this README claims a capability that does not exist. Until `apps/sim` existed, the
> attestation reported INCOMPLETE rather than passing on a check it could not run — that is
> deliberate, and it is the same standard the product holds itself to.

---

## Why this exists

Three studies covering ~34,000 employees say the phishing-awareness industry is optimising the wrong
number:

- **UCSD / IEEE S&P 2025** (19,500 staff) — annual training shows no measurable effect; embedded
  "you-clicked" training reduces clicking by roughly **2 percentage points**; **75% of people spend under
  a minute on it**.
- **ETH Zurich / IEEE S&P 2022** (14,733 staff, 15 months) — embedded training can make employees
  **more** susceptible, *but* employee reporting works, scales and sustains.
- **UK NCSC** — blaming users does not work, click-rate culture suppresses reporting, simulations carry
  legal risk, and HR must be involved before you run one.

So Chetna optimises **reporting speed and accuracy**, not click rate. It treats the participant as a
**sensor**, not a suspect. And it makes authorization, non-collection and privacy **properties of the
code**, not promises in a policy document.

Full evidence base with citations: [docs/05-RESEARCH-EVIDENCE.md](docs/05-RESEARCH-EVIDENCE.md)

## What makes it different

| | Chetna |
|---|---|
| **Harmful lures** | An ethics engine blocks compensation, bereavement, redundancy, medical and immigration lures at authorship time, **cites the real-world incident** (West Midlands Trains, 2021), and requires an HR-signed, justified override |
| **Credential collection** | **Architecturally impossible** — no input element, no endpoint, no column — and machine-verified by a 10-rule linter, a canary test and a signed public attestation |
| **Authorization** | Two Ed25519 signatures from two distinct roles over a hash of the entire campaign scope, plus 7 pre-send gates re-evaluated per message, in a tamper-evident hash-chained log |
| **Measurement** | NIST Phish Scale difficulty adjustment, machine-filtered opens shown openly, and a randomised holdout with confidence intervals that **reports "no significant effect" when that is the truth** |
| **Privacy** | k-anonymity enforced in the query layer with a return type the compiler forces you to handle; no endpoint anywhere returns a named individual to a manager |

## Deliverables and where to find them

| # | Deliverable | Location |
|---|---|---|
| 1 | Working awareness and simulation platform | `apps/`, `packages/`, `services/` — run with `npm run demo` |
| 2 | Demonstration campaign in a controlled test environment | `cli/` seed + `services/mailsink` (SMTP bound to `127.0.0.1`, `.test` domains only) |
| 3 | Participant learning workflow and reporting dashboard | `apps/console/app/(learn)`, `(mail)`, SOC triage console |
| 4 | Campaign analytics and sample awareness report | `apps/console/app/(analytics)`, `deck/sample-awareness-report.pdf` |
| 5 | Authorization, privacy, retention and non-credential-collection safeguards | [docs/03-SAFEGUARDS.md](docs/03-SAFEGUARDS.md), `packages/{policy,privacy,audit,safety-lint,ethics}`, `tests/abuse`, `/attest` |

## Quick start *(target — see status note above)*

```bash
npm install
npm run db:push       # create the SQLite database
npm run demo          # seed the controlled test environment + sign the safety attestation
```

Then exercise the pipeline from the CLI (all of this works today):

```bash
npm run chetna -- preflight cmp_q2_courier --email attacker@gmail.com
```

```bash
npm run chetna -- send
```

```bash
npm run chetna -- metrics cmp_q0_pilot
```

```bash
npm run chetna -- audit verify
```

For the live demo, run the sink and the worker in two terminals instead of `send`:

```bash
npm run mailsink
```

```bash
npm run worker
```

Then open:

| URL | What |
|---|---|
| http://localhost:4000 | Console — templates, campaigns, authorization, triage, analytics |
| http://localhost:4000/inbox | Participant webmail (the controlled test environment) |
| http://localhost:4001 | Simulation surface — landing pages, isolated origin |
| http://localhost:4001/attest | Public non-collection attestation |

Verification commands:

```bash
npm test                 # unit + E2E, including the 24-case abuse suite
npm run verify:safety        # lints every template, runs the credential canary, writes a signed attestation
npm run chetna -- audit verify  # walks the hash chain, verifies every signature, prints the Merkle root
```

**Runs fully offline.** SQLite, a local SMTP sink bound to loopback, a deterministic AI provider and
vendored assets — no network, no Docker, no API key.

## Safety

This is a simulation platform, not an attack tool. In `CHETNA_MODE=offline` the policy engine refuses any
non-loopback mail transport and any recipient domain outside the reserved test TLDs — and the mode is part
of the cryptographically signed campaign scope, so it cannot be flipped mid-campaign. See
[POLICY.md](POLICY.md) for acceptable use and [docs/03-SAFEGUARDS.md](docs/03-SAFEGUARDS.md) §7 for the
threat model.

## Documentation

| Document | Contents |
|---|---|
| [00-MASTER-PLAN.md](docs/00-MASTER-PLAN.md) | Thesis, five pillars, twelve differentiators, scope ladder, team split, timeline, risks |
| [01-ARCHITECTURE.md](docs/01-ARCHITECTURE.md) | Tech decisions, repo layout, data model, the 7 gates, telemetry, API contracts, package specs |
| [02-JUDGING-ALIGNMENT.md](docs/02-JUDGING-ALIGNMENT.md) | Objective → feature → demo beat → artefact traceability, rubric strategy |
| [03-SAFEGUARDS.md](docs/03-SAFEGUARDS.md) | Authorization, non-collection, privacy, retention, lawful basis, DPIA, AUP, STRIDE |
| [04-DEMO-SCRIPT.md](docs/04-DEMO-SCRIPT.md) | Timed 5-minute demo, deck outline, 20 hard questions with answers |
| [05-RESEARCH-EVIDENCE.md](docs/05-RESEARCH-EVIDENCE.md) | The literature, with citations and confidence flags |
| [06-WORKPLAN-48H.md](docs/06-WORKPLAN-48H.md) | Hour-by-hour backlog with owners, estimates and acceptance criteria |

## Licence

AGPL-3.0, plus the acceptable-use policy in `POLICY.md`. A licence cannot prevent misuse — the technical
controls do. The licence states intent; the architecture enforces it.
