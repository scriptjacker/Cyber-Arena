# 04 — Demo Script, Deck Outline & FAQ

Presentation is **25%** — the same weight as the entire technical implementation. Treat this file as
engineering work, not an afterthought. Rehearse it three times.

**The one idea the judges must be able to repeat afterwards:**
> **"Measure the sensor, not the victim."**

**The structural trick:** most teams demo things *working*. We demo things being **refused**. Three
blocked attempts are the dramatic spine, and refusal is what proves a safety claim. A demo where the
product says *no* three times is far more memorable than one where everything turns green.

---

## 1. The 5-minute live demo (timed beats)

Pre-staged before you walk up: `npm run demo` already run, two browser windows (console as
`security@nimbus.test`, webmail as `priya.r@nimbus.test`), one terminal, network adapter **disabled**,
backup video on the desktop.

| Time | Beat | What you do | What you say (compressed) |
|---|---|---|---|
| **0:00** | Hook | Title slide only | "Three studies, 34,000 employees: annual training shows no effect, embedded training moves clicking by two points, and one study found it can make people *worse*. But the same study found something that works — employees reporting. Everyone optimises clicks. We rebuilt the discipline around reporting." |
| **0:30** | The lure that got blocked | Template Studio → type the subject *"COVID-19 recognition bonus — confirm your bank details"* | "In 2021, West Midlands Trains sent 2,500 staff a fake pandemic bonus. Their union called it crass and reprehensible; one colleague had died of COVID. GoDaddy and Tribune Publishing did the same thing." |
| **0:50** | **BLOCK #1** | Ethics screen fires: theme `COMPENSATION` + `MEDICAL`, status **BLOCKED**, precedent card with citation | "Our ethics engine blocks it and shows you the news story. Only HR can override — with a written justification and a cryptographic signature. PS-28 asks for simulations 'without exposing participants to harmful campaigns'. **This is that clause, implemented.**" |
| **1:10** | A legitimate template | Switch to the shipped *"Courier redelivery — customs fee"* template. Phish Scale panel: 6 cues → "Few", premise alignment 4 → **difficulty HIGH** | "NIST's Phish Scale, automated: six detectable cues and a premise that fits her job, so this is genuinely hard. Every metric we report is adjusted for this — you cannot flatter your numbers by sending easy phish." |
| **1:30** | **BLOCK #2** | Paste `<input type="password" name="pw">` into the body → save | "Ten linter rules. It fails the build too." *(flip to terminal)* `npm run verify:safety` → PASS with a signed attestation, then the canary test. "There is no field to type a secret into, no endpoint that accepts one, and no column that could hold one. Four layers, all checkable right now at `/attest`." |
| **2:00** | Authorization | Campaign wizard → preflight panel: 7 gates, 240 participants, 20% holdout. Two approvers sign (Security, then HR) | "A campaign can't send on a status field. It needs two Ed25519 signatures from two different people in two different roles, over a hash of the *entire* scope — roster, domains, window, templates." |
| **2:20** | **BLOCK #3** | Add one participant to the roster → re-run preflight → `G1_SCOPE_DRIFT`. Then add `attacker@gmail.com` → `G3_RECIPIENT_DOMAIN_NOT_APPROVED` + `G7_OFFLINE_MODE_NON_TEST_DOMAIN` | "Approval covered 240 people, so the 241st is blocked and the attempt is logged. And a real inbox is structurally unreachable: in offline mode the engine refuses any non-loopback transport and any non-`.test` domain — and the mode is *inside* the signed scope, so it can't be flipped." |
| **2:40** | Send, offline | Revert, authorize, launch. Terminal: `netstat -ano \| findstr 1025` | "Our own SMTP server, bound to 127.0.0.1. Real SMTP, nowhere to go." |
| **2:50** | Participant: click | Webmail as Priya → open the email → click the link | "Twenty-one seconds is the reported median time-to-click. Here it is." |
| **3:00** | Teachable moment | Landing page: banner, then the cue-annotated replay of **her exact email** with the six cues highlighted; hover one | "Not a generic lesson — *her* email, with the cues she missed, highlighted where they were. Seventy-five percent of people give embedded training under a minute, so the whole lesson fits in forty-five seconds, it's interactive, and we track completion rather than delivery — because completion is the only thing the UCSD study found correlated with improvement." |
| **3:15** | 45-second drill | Complete the 4-email sort → `DRILL_PASS`, spaced follow-up scheduled for D+7 | "One module, chosen by the gap she actually showed. No blanket course." |
| **3:25** | Report + SOC | Second window, Rahul → Report button → thank-you + streak. Console → triage queue, time-to-first-report 00:04:12, cluster of 3 | "This is the metric we actually optimise. Reported median time-to-report is twenty-eight minutes against twenty-one seconds to click — the gap is the whole problem. ETH Zurich proved 14,000 employees can work as a detection sensor network. Here's the console that treats them as one." |
| **3:45** | Analytics | Exec dashboard: resilience ratio, difficulty-adjusted susceptibility, time-to-report, **machine-filtered: 37** | "Thirty-seven of those opens were Apple Mail Privacy Protection and the security gateway, not people. Everyone else counts those as engagement. We exclude them and show you the number." |
| **3:55** | The honest number | Holdout panel: effect −1.8 pp, 95% CI [−4.9, +1.3] → **"no significant effect detected"** | "Every campaign has a randomised control arm. Right now the interval crosses zero, so we refuse to claim the training worked. **We are the only awareness platform that will tell you that.**" |
| **4:10** | **BLOCK #4** (privacy) | Cohort drill-down → "Legal (3 people)" → *suppressed, k=5* | "k-anonymity in the query layer, not the policy PDF. The return type is a union, so the compiler forces every screen to handle suppression. And there is no endpoint anywhere that returns a named individual to a manager." |
| **4:20** | Governance | `chetna audit verify` → chain intact, Merkle root. Then purge receipt + a DSAR erasure | "Hash-chained audit including every refusal. Retention clocks per data class, and deletion writes its own receipt — because an auditor wants evidence of deletion, not a promise." |
| **4:35** | Report | One click → Awareness Report PDF: metrics, gaps, ISO 27001 A.6.3 / PCI DSS 12.6.3.1 / DPDP §7(i) mapping, authorization dossier appendix | "One button, and the compliance evidence is done." |
| **4:50** | Close | Back to the title slide | "Gophish captures passwords in plaintext and lets anyone target anyone. Chetna can't capture a credential, can't send without two signatures, can't produce a harmful lure, and can't identify a person to their manager. **Measure the sensor, not the victim.**" |

**Fallbacks:** if a block doesn't fire, say *"that's the safety net doing the opposite of what I want on
stage — here it is in the test suite"* and run `npm run test:abuse`. If the whole app dies, the backup
video plays and you narrate it. Never debug on stage.

---

## 2. Deck outline (10 slides)

| # | Slide | Content |
|---|---|---|
| 1 | **Chetna — Measure the sensor, not the victim** | Name, one-line definition, team, PS-28 |
| 2 | **The problem is not that people click** | DBIR-reported 21 s to click vs 28 min to report. The gap is the attack window. |
| 3 | **The industry is optimising the wrong number** | Three citations: UCSD 19,500 (≈2 pp, 75% under a minute) · ETH 14,733 (can backfire; reporting works) · NCSC (blame fails, legal risk, involve HR) |
| 4 | **So we inverted it** | The inversion table from `00-MASTER-PLAN.md` §2 |
| 5 | **Architecture** | The component diagram: console / isolated simulation surface / worker / SMTP sink; the 7 gates in the middle |
| 6 | **Four things nothing else does** | Ethics engine with precedent · verifiable non-collection · Phish Scale difficulty adjustment · randomised holdout that can say "no effect" |
| 7 | **Live demo** | Map of the four blocks the judges are about to watch |
| 8 | **Safety is the product** | 7 gates · dual Ed25519 · hash-chain audit · k-anonymity in the type system · 24-case abuse suite screenshot |
| 9 | **Deployable on Monday** | One command, no Docker, no network → then Postgres/BullMQ/real SMTP/Defender advanced delivery/OIDC; control mapping; cost vs per-seat licensing; 90-day pilot playbook |
| 10 | **Roadmap, honestly** | The 11 deliberate omissions with their interfaces, and the measurement research agenda |

Design: dark slides, one idea each, no paragraphs, every statistic tagged **primary** or **reported**.

---

## 3. Role assignment for the pitch

| Role | Who | Job |
|---|---|---|
| **Narrator** | Best speaker | Slides 1–4 and 9–10, the thesis, the close. Never touches the keyboard. |
| **Driver** | Built the console | Drives the demo in silence, pre-warmed and pre-logged-in |
| **Second driver** | Built delivery | Owns the webmail window: click and report, so there is no window-switching fumble |
| **Closer** | Tech lead | Takes every hard question; knows which file to open for any answer |

Everyone memorises: the three studies, the four differentiators, and the one-sentence Gophish comparison.

---

## 4. FAQ — 20 hard questions

**On novelty**

1. **"Isn't this Gophish with a nicer UI?"** — Gophish has a "Capture Passwords" checkbox and stores
   credentials in plaintext; it has no authorization model, no ethics screening, no difficulty
   calibration, no privacy guard. We cannot capture a credential, cannot send without two cryptographic
   signatures, and cannot save a harmful lure. Different category: Gophish is an attack tool pointed
   inward; this is a measurement instrument.
2. **"KnowBe4 and Hoxhunt already do adaptive simulations."** — They do, as closed per-seat SaaS with
   proprietary scoring and no control arm. Our difficulty model is NIST's and inspectable, our effect
   claims come with confidence intervals, and our privacy guarantees are in the type system rather than a
   DPA. Also: no commercial platform blocks a lure for being harmful and cites the news story.
3. **"What's genuinely new?"** — Four things: harmful-lure prevention as an engineering control;
   machine-verified non-collection with a signed attestation; difficulty-adjusted metrics from the NIST
   Phish Scale; and a randomised holdout with intervals that can report no effect.

**On the evidence**

4. **"If training doesn't work, why build this?"** — Because the studies say *conventional* training
   doesn't, and the same studies say reporting does. We optimise the thing that works and we measure the
   thing that doesn't, so an organisation stops paying for theatre.
5. **"Your citations say simulations can backfire. Isn't your product harmful?"** — That risk is why the
   ethics engine, the cooldown, the opt-out, the no-discipline commitment and the holdout exist. Our
   holdout is also how you would *detect* a backfire, which no commercial tool can do.
6. **"Where did the 21 seconds / 28 minutes come from?"** — Secondary summaries of the Verizon DBIR 2025;
   we label it "reported". Our primary citations are NIST, ETH Zurich S&P 2022, UCSD S&P 2025, NCSC and
   the ICML 2025 LLM paper.

**On the technology**

7. **"Prove you don't store credentials."** — Four layers: no input element, no endpoint that accepts a
   value, no column in the schema, and a linter plus canary test that fails the build. `/attest` renders
   a signed attestation. Open the schema and `grep`.
8. **"Can I defeat your linter with obfuscated HTML?"** — The linter parses the DOM rather than
   regexing strings, and it is a *defence in depth* layer: even a template that smuggled a field past it
   would have nowhere to send the value, because the simulation app has no sink and its CSP sets
   `form-action 'none'`. Breaking one layer is not enough.
9. **"SQLite in production?"** — No, and we say so on slide 9. SQLite is the offline-demo choice; Prisma
   makes Postgres a datasource change, and the migration is in the deployment guide.
10. **"Why your own SMTP sink instead of Mailpit?"** — One fewer dependency, no Docker, and the captured
    mail renders inside our own webmail so the report button and the participant journey are part of the
    same product. It speaks real SMTP; it is bound to loopback.
11. **"How do you stop someone running a real campaign with this?"** — Domain ownership verification,
    dual-control grants, mandatory watermark and simulation headers, a tamper-evident log of every send,
    and the offline mode guard inside the signed scope. Plus the AUP. The technical controls, not the
    licence, are what matter.
12. **"What about the AI parts — could the model generate something harmful?"** — Generated templates are
    persisted only after passing safety-lint *and* the ethics screen; the model never sees participant
    PII; output is schema-validated; there is no tool access; and template content is never placed in an
    instruction position, so a lure containing "ignore previous instructions" is data, not a command.
    `tests/abuse` A22 attacks exactly this.
13. **"Does it work with Microsoft 365?"** — The deployment guide covers the Defender advanced-delivery
    entry (sending domain by P1/DKIM plus sending IP; body URLs auto-allowed since MC545900) and warns
    that gateways rewriting the source IP break IP matching. The Outlook report-button integration path
    is documented; `ReportTriage` already models the queue. We did not build the add-in in 48 hours.

**On privacy and law**

14. **"Is this legal in India?"** — DPDP Act 2023 §7(i) treats employment-purpose processing as a
    legitimate use, so separate consent is not required; the Act's erasure and retention duties are
    implemented as the retention engine, DSAR endpoints and processor-erasure note. Under GDPR we rely on
    legitimate interests with a shipped LIA and DPIA. Not legal advice — a deploying organisation has its
    counsel sign off, and we built the hooks that make that sign-off possible.
15. **"Could a manager use this to punish someone?"** — Architecturally no: there is no endpoint that
    returns a named individual's result to anyone but that individual, and cohort queries are suppressed
    below k=5 with complementary suppression. Organisationally, the no-discipline commitment is in the
    programme notice — and per NCSC, that commitment is what protects the reporting signal.
16. **"Why not consent instead of legitimate interests?"** — Consent must be freely given and specific; a
    test whose validity depends on surprise cannot meet that per campaign. Programme-level notice plus a
    real opt-out honoured in the send path is both more honest and more defensible.
17. **"k=5 — where's that from?"** — Microsoft Viva Insights hard-floors minimum group size at 5 and
    won't allow lower; some consultancies recommend 10–20. It's configurable upward, floored at 3, and a
    change is an audited event.

**On scope and delivery**

18. **"What did you cut?"** — Eleven items, deliberately: SSO/SAML/OIDC, SCIM, true multi-tenancy, live
    DNS verification (logic shipped, resolver stubbed), real SMS/voice gateways, Slack/Teams channels, the
    Outlook add-in, differential-privacy noise, i18n beyond en/hi, load testing past 10k assignments, and
    Postgres row-level grants. Each has its interface defined.
19. **"How long to production?"** — The spine is production-shaped. Realistically two to three weeks for
    Postgres, a real relay with DKIM/SPF, DNS verification, OIDC and a security review — the roadmap on
    slide 10 is sequenced that way.
20. **"What would you build next if you had a month?"** — Not features: validation. Run a real randomised
    programme in a partner organisation and publish whether difficulty-adjusted report rate improves. The
    product exists to answer that question, and nobody in the industry has answered it honestly.

---

## 5. Two things never to say

- **"It's fully secure"** / "there's nothing left to improve." Say instead: *"Here are the four layers,
  here's the test that attacks each one, and here's the residual risk we documented."* Confidence with
  receipts beats absolutes, and juries probe absolutes first.
- Any statistic without its tag. Every number is either **primary** (NIST, ETH, UCSD, NCSC, ICML) or
  **reported** (DBIR-derived, vendor figures). Saying "reported" out loud is a credibility *gain*.
