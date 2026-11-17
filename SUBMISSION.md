# Submission — PS-28 · AI & Emerging Technology Security

Everything the submission form asks for, ready to paste. Replace the two
bracketed links once you have created them.

---

## Title

**Chetna — Authorized Phishing Simulation & Security Awareness Platform**

*चेतना — "awareness". Tagline: **Measure the sensor, not the victim.***

---

## Problem statement

Employees are the most targeted part of any organisation, and the standard
response — blast a fake phishing email, count who clicked, send the clickers a
training video — does not work. Three large studies say so plainly:

- **UC San Diego Health, IEEE S&P 2025** (19,500 employees): annual mandated
  training showed **no significant effect** on susceptibility. Embedded
  "you-clicked" training reduced clicking by roughly **2 percentage points**.
  **75% of people spent under a minute on it**; a third closed it immediately.
- **ETH Zurich, IEEE S&P 2022** (14,733 employees, 15 months): embedded training
  during simulations did not build resilience and **can make employees more
  susceptible**. The same study found what *does* work — employees reporting
  suspicious mail, as a fast, sustainable, organisation-wide detection system.
- **UK NCSC** (official guidance): "Blaming users for clicking on links doesn't
  work." Phishing simulations "erode trust" and "can also create legal risk",
  and you should always involve HR before running one.

So organisations spend real money optimising **click rate** — a metric that
drives blame, which suppresses the reporting that actually protects them. Worse,
the tooling itself is hazardous: the dominant open-source platform ships a
"Capture Passwords" option and stores credentials in plaintext, and real
programmes have caused documented public harm (West Midlands Trains' fake
pandemic bonus, 2021; GoDaddy's fake $650 bonus, 2020; Tribune Publishing's fake
$10,000 bonus, 2020).

The brief asks for measurable awareness **without collecting real credentials**
and **without exposing participants to harmful campaigns**. Almost no existing
tool enforces either clause.

---

## Solution description

Chetna is a self-hosted platform that inverts the discipline. It optimises
**reporting speed and accuracy** rather than click rate, treats the participant
as a **sensor** rather than a suspect, and makes authorization, non-collection
and privacy **properties of the code** rather than promises in a policy
document.

Four things it does that we could not find in any other platform, open-source or
commercial:

1. **It refuses to build a harmful lure.** A 13-theme taxonomy (compensation,
   redundancy, bereavement, medical, immigration, children, legal threats,
   disciplinary action and more) blocks the template as you type and shows the
   real incident that makes it a rule. Only People/HR can override — never the
   security team that wrote it — with a 120-character written justification and
   an Ed25519 signature.
2. **It cannot collect a credential, and proves it.** Four independent layers:
   no input element exists, no endpoint accepts a value, no database column
   could hold one, and a 10-rule linter plus a hostile "canary" template fails
   the build if any of that changes. The result is signed and published on a
   public attestation page — which reports INCOMPLETE or FAILED just as
   prominently as a pass.
3. **It adjusts for difficulty using the NIST Phish Scale.** 24 automated cue
   detectors across NIST's five categories, combined with premise alignment,
   rate every template. All susceptibility metrics are difficulty-weighted, so
   a programme cannot flatter its numbers by sending easier phish.
4. **It runs a randomised control arm and will tell you the training didn't
   work.** Every campaign randomises a stratified holdout. Effects are reported
   with 95% Newcombe confidence intervals, and when the interval crosses zero
   the platform says **"no significant effect detected"** instead of reporting
   the point estimate as a win.

Plus: a 7-gate send policy engine re-evaluated before every single message,
dual-control cryptographic authorization over a hash of the entire campaign
scope, a tamper-evident hash-chained audit log that records refusals as well as
actions, honest telemetry that filters and publishes machine traffic separately,
k-anonymity enforced in the query layer, and a retention engine where deletion
writes its own receipt.

---

## Key features

**Objective 1 — configurable, clearly controlled templates**
- Template Studio with three live checks: 10 safety-lint rules, harmful-lure
  screen, NIST Phish Scale difficulty
- A template that fails linting is **never written to the database at all**
- 12 seeded templates across email, QR (quishing), simulated SMS and voice
  tabletop, each mapped to a MITRE ATT&CK technique (T1566.001–.004, T1598)
- Mandatory simulation watermark, simulation headers and a one-click report link

**Objective 2 — only authorized participants and approved domains**
- **7 pre-send gates**, re-evaluated immediately before every message:
  authorization → roster → domains → suppression → content → operations →
  environment
- Dual-control `AuthorizationGrant`: two Ed25519 signatures from two distinct
  people in two distinct roles, over a SHA-256 hash of the entire scope
- Edit the campaign after approval and `G1_SCOPE_DRIFT` blocks every send, with
  a human-readable diff of exactly what changed
- Domain ownership verification; opt-outs, HR exclusions, a 30-day per-person
  cooldown and a new-joiner grace period
- **Offline mode** (gate G7) refuses any non-loopback mail transport and any
  recipient domain outside the reserved test TLDs — and the mode is *inside* the
  signed scope, so a demo campaign cannot be escalated to a live one

**Objective 3 — safe interaction metrics**
- Opens recorded as `PROBABLE_OPEN` with a machine-likelihood score; Apple Mail
  Privacy Protection, secure email gateways and link scanners are classified,
  excluded from human metrics, and **published as a separate number**
- A click counts as a failure only once a human-interaction beacon confirms it
- `SUBMIT_INTENT` captures the behaviour without the secret — the decoy panel
  contains no input of any kind
- Opaque 128-bit tokens: **no personal data in any URL, ever**. No raw IP and no
  full user agent is stored — only a coarse class and a UA family

**Objective 4 — immediate feedback and targeted content**
- The clicked link lands on a cue-annotated replay of **the exact email that
  person received**, with the cues they missed highlighted in place
- Built to a **45-second attention budget** because 75% of people give embedded
  training less than a minute, and completion-tracked because completion is
  what the evidence correlates with improvement
- 7 micro-modules, each remediating one specific gap — including AI-generated
  lures, deepfake voice, quishing and MFA fatigue — assigned by the cue the
  person actually missed, never as a blanket course
- Non-punitive throughout: reporters are thanked, nobody is named

**Objective 5 — privacy-conscious analytics**
- k-anonymity enforced in the query layer (k=5 default, hard floor 3) with
  **complementary suppression**, so a withheld cohort cannot be recovered by
  subtraction. Withheld cohorts are never even named
- `KGuarded<T>` is a discriminated union, so the compiler forces every screen to
  handle suppression — a privacy failure becomes a build failure
- **No endpoint exists that returns a named individual's result to anyone but
  that individual.** A manager cannot be granted what the architecture lacks
- Retention schedule per data class with automated purge, receipts and audit
  entries; self-service DSAR access and erasure
- Resilience shown as a band, never a number — a number invites ranking

**Safeguards (the fifth deliverable)**
- `docs/03-SAFEGUARDS.md`: authorization model, the non-collection guarantee,
  privacy architecture, retention schedule, lawful basis under GDPR and India's
  DPDP Act 2023 §7(i), a pre-filled DPIA, a works-council briefing note, an
  acceptable-use policy and a 15-row STRIDE threat model
- **75 abuse cases** that each attempt a real abuse and assert the safeguard
  holds — including credential capture, scope drift, self-approval, forged
  signatures, audit tampering, re-identification and privilege escalation

---

## Technology stack

| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript (strict) | One language across console, simulation surface, worker and CLI; shared zod schemas as a single source of validation |
| Monorepo | npm workspaces, 11 packages + 2 apps + 2 services + CLI | No global install needed; internal packages have no build step |
| Web | Next.js 16 (App Router), React 19, Tailwind CSS | Two **separate origins** — admin console and simulation surface — so no session or CSRF token is reachable from a page a phishing link opens |
| Database | Prisma + SQLite (offline demo) → Postgres (production, one datasource change) | Zero install, zero daemon, no Docker required |
| Queue | DB-backed claim-then-check tick worker | No Redis, so the whole platform runs offline on one laptop |
| Mail | Nodemailer → our own SMTP server (`smtp-server`) bound to `127.0.0.1` | Real SMTP wire protocol, captured locally, rendered in our own webmail |
| Cryptography | Ed25519 and SHA-256 from Node's built-in `crypto`; scrypt for passwords | Zero third-party dependency on the primitives the authorization model rests on |
| Statistics | Wilson score intervals, Newcombe difference intervals | Behave correctly at the small numerators awareness campaigns actually produce |
| Security | Nonce-based CSP (`form-action 'none'` on the simulation surface), allowlist HTML sanitiser, RBAC capability matrix, hash-chained audit log | |
| Testing | Vitest — **192 tests**, including 75 abuse cases, plus a live-console verification script (36 assertions across all five roles) | |
| AI | Provider interface with safety constraints defined; deterministic offline default | The demo never depends on a network or an API key |

**Verification anyone can reproduce:** `npm test` → 192 passing ·
`npm run typecheck` → clean · `npm audit --omit=dev` → **0 vulnerabilities** ·
`npm run verify:safety` → **ATTESTED** · `npm run verify:console` → **36/36**

---

## Links

- **GitHub repository:** https://github.com/scriptjacker/Cyber-Arena
- **Google Drive (demo video, deck, sample report):** `[PASTE SHARE LINK]`
- **Demo video:** `[PASTE LINK]` — 5 minutes, script in `docs/04-DEMO-SCRIPT.md`

---

## Run it yourself

```bash
npm install
npm run db:push
npm run demo          # seeds 240 synthetic participants, offline, in seconds
npm run dev:console   # http://localhost:4000  — security@nimbus.test / chetna-demo-2026
npm run dev:sim       # http://localhost:4001
```

Fully offline: SQLite, a loopback SMTP sink, `.test` domains only, no API key,
no Docker, no network calls at runtime.

---

## The four moments to show a judge

1. **Type "COVID-19 recognition bonus" in the Studio** — it blocks, citing West
   Midlands Trains 2021. Then show that the security admin *cannot* override its
   own block; only People/HR can.
2. **`npm run chetna -- metrics cmp_q0_pilot`** — "No significant effect
   detected, 95% CI −6.6% to +14.8% includes zero." Then `cmp_q1_baseline`,
   where the interval clears zero. Honest in both directions.
3. **POST a password to the intent endpoint** — 400, and the string appears in
   none of the 2,699 rows across 7 tables.
4. **Open the 3-person Legal cohort in Analytics** — k-anonymity withholds it,
   *and* withholds a second cohort so the first cannot be recovered by
   subtraction.

---

## Licence — one decision outstanding

The repository was created with an **MIT** `LICENSE` file, while `README.md`,
`POLICY.md` and `package.json` all declare **AGPL-3.0**. Both are live on the
public repo, so pick one:

- **Keep MIT** — simplest, most permissive, and what the LICENSE file already
  says. But MIT lets anyone take this platform, strip the seven gates and the
  ethics screen, and ship it closed-source. For a tool whose entire argument is
  that the safety controls cannot be removed, that is worth thinking about.
- **Switch to AGPL-3.0** — matches what the documentation already claims, and
  means a hosted fork has to publish its modifications. This is what POLICY.md
  argues for.

Either way it is a two-minute fix, and it should be resolved before judging.

---

## How it was pushed

The two commits exist **only on this machine** — there is no remote, so nothing
has been published yet. `gh` is not installed here, so create the repository in
the browser, then run the three commands below.

1. Go to **https://github.com/new**
   - Owner: `scriptjacker`
   - Name: `chetna` (or whatever you prefer)
   - **Public** (judges need to open it)
   - **Do not** add a README, .gitignore or licence — this repo already has them,
     and an initialised repo causes a conflict on first push.

2. Then, in this folder:

```bash
git remote add origin https://github.com/scriptjacker/chetna.git
```

```bash
git push -u origin main
```

3. Confirm it worked:

```bash
git remote -v && git log --oneline origin/main
```

### Before you push — a 30-second check

```bash
git ls-files | grep -iE '\.pem$|^\.env$|\.db$|keys/'
```

That must print **nothing**. The signing keys in `keys/`, your `.env`, and the
SQLite database are all gitignored and were never committed — this just proves
it before the repo becomes public.

### What is already correct

- Branch is `main` (GitHub's default), not `master`
- Author is `Parth Narula <134507435+scriptjacker@users.noreply.github.com>` —
  your personal email address appears nowhere in the history
- Working tree is clean; 2 commits; 171 files tracked

---

## Google Drive folder

Create one folder and put four things in it, then set it to "Anyone with the
link can view":

1. **The demo video** — 5 minutes, following `docs/04-DEMO-SCRIPT.md`. Record
   with the Xbox Game Bar (`Win+G`) or OBS. Script and timings are in that file.
2. **The pitch deck** — export from the deck page (Share › Export) as PDF and
   PPTX.
3. **A sample awareness report** — until the PDF export is built, screenshot the
   Analytics page for the Q1 campaign and the Pilot campaign side by side. The
   contrast between them *is* the story.
4. **This file**, as the written submission.

## Recording the demo — the short version

```bash
npm run demo
```

Then two terminals:

```bash
npm run dev:console
```

```bash
npm run dev:sim
```

Open the console at `http://localhost:4000` and sign in as
`security@nimbus.test` / `chetna-demo-2026`. Keep a second browser window on
`http://localhost:4001/attest`.

Record these four beats, in this order — they are the ones that land:

| Time | Beat |
|---|---|
| 0:50 | Studio → type the COVID-bonus subject → **blocked**, West Midlands Trains cited |
| 1:30 | Paste a password field → **cannot be saved** |
| 2:20 | Campaign → two signatures → add a person → **G1_SCOPE_DRIFT** → test `attacker@gmail.com` → **refused by three gates** |
| 4:10 | Analytics → the Pilot campaign's **"no significant effect detected"** → the 3-person Legal cohort **withheld** |
