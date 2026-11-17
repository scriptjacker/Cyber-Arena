# 05 — Research & Evidence Base

> This file is the **spine of the pitch**. Every design decision in Chetna traces to a line here.
> A jury in an "AI & Emerging Technology Security" track rewards teams who can say *why* their product is
> shaped the way it is. Most teams will build "Gophish with a nicer UI". We build the platform the
> published evidence actually calls for.

---

## 1. The three uncomfortable findings

### F1 — Conventional phishing training barely changes behaviour

**"Understanding the Efficacy of Phishing Training in Practice"** — Mirian et al., UC San Diego / UCSD
Health, IEEE Symposium on Security & Privacy (Oakland) 2025. ~**19,500 employees**, Jan–Oct 2023.

- No significant difference in failure rate between employees who had recently completed **annual mandated
  training** and those who had not.
- **Embedded training** (the "you clicked, here's a lesson" page) reduced click likelihood by roughly
  **1.7–2 percentage points** across 10 lure types over 8 months.
- **75% of users engaged with the training material for 1 minute or less. One-third closed it immediately.**
- Authors' conclusion: training in its *commonly deployed* form is "unlikely to offer significant practical
  value in reducing phishing risks".
- **But:** users who *fully completed* an interactive session failed later exercises less often. Static
  content did not show this.
- Paper: https://sysnet.ucsd.edu/~voelker/pubs/phishtrain-oakland25.pdf
- Summary: https://today.ucsd.edu/story/cybersecurity-training-programs-dont-prevent-employees-from-falling-for-phishing-scams

**Design consequence:** the teachable moment is engineered for a **45-second attention budget** and is
**interactive and completion-tracked**, not a wall of text. Completion — not delivery — is the metric.

### F2 — Embedded training during simulations can *backfire*

**"Phishing in Organizations: Findings from a Large-Scale and Long-Term Study"** — Lain, Kostiainen,
Capkun, ETH Zurich, IEEE S&P 2022. **14,733 employees**, 15 months (Jul 2019 – Oct 2020).

- Embedded training during simulated exercises did **not** make employees more resilient and had
  "unexpected side effects that can make employees even **more** susceptible".
- Warnings on suspicious email were **effective**.
- Headline positive finding: **crowd-sourced reporting works.** Employees as a collective detection sensor
  is practical at scale — fast detection of new campaigns, acceptable operational load, sustained
  participation over long periods. A minority of highly active reporters produced very accurate reports
  with few false positives.
- Paper: https://arxiv.org/abs/2112.07498

**Design consequence:** the product's primary optimisation target is **reporting** (rate, speed, accuracy),
not click reduction. The participant is a **sensor**, not a suspect. Embedded feedback is deliberately
short, non-punitive and A/B-measurable so a backfire can be *detected* rather than assumed away.

### F3 — Click rate is a harmful metric, and simulations carry real legal / trust risk

**UK NCSC, "Phishing attacks: defending your organisation"** (official guidance):

- "Blaming users for clicking on links doesn't work. People click for a range of reasons."
- Phishing simulations "can **erode trust** between employees and security" and "can also create
  **legal risk**". "Employees who are afraid for their jobs will not report mistakes."
- "You should **always check with your HR department** before undertaking any phishing simulations."
- https://www.ncsc.gov.uk/guidance/phishing

**UCL, "What phishing click rates don't show"** — framing performance around click rates "encourages blame,
erodes trust, and obscures deeper organisational and systemic risk factors".
https://sassefest.cs.ucl.ac.uk/papers/what_phishing_click_rates_don%E2%80%99t_show.pdf

**CREST**: 88% of organisations measure click rate; some have adopted blame-oriented approaches.
https://www.crestresearch.ac.uk/resources/phishing-your-staff/

**Design consequence:** HR approval is a **hard gate in code** (dual-control signature), not a checklist
item. Manager-facing dashboards are **architecturally incapable** of naming an individual. Click rate is
never shown alone — always difficulty-adjusted and always paired with report rate.

---

## 2. Real-world harm: simulations that became news stories

These are surfaced **inside the product UI** when the ethics screen blocks a lure. They turn an abstract
safeguard into a visceral demo moment.

| Incident | What happened | Outcome |
|---|---|---|
| **West Midlands Trains**, UK, Apr 2021 | ~2,500 staff emailed by "the managing director" offering a one-off payment for their pandemic work. It was a phishing test. | Union TSSA called it "crass and reprehensible" — staff had been ill with COVID and one had died. National press. https://www.infosecurity-magazine.com/news/staff-bonus-was-crass-phishing/ |
| **GoDaddy**, Dec 2020 | Fake $650 holiday bonus email, months after widespread layoffs. | Employees called it "tone-deaf" at a town hall; those who fell for it had to retake training. |
| **Tribune Publishing / Orlando Sentinel**, Sep 2020 | Fake $10,000 bonus lure. | Sentinel Guild: "a slap in the face and tone-deaf." |

**Design consequence:** the `@chetna/ethics` package. A banned-theme taxonomy (compensation, bereavement,
redundancy, medical, immigration, children, legal threat, disciplinary action) blocks the template at
authorship time, cites the precedent, and requires a signed, justified HR override to proceed.

> Objective 2 says campaigns must run "without … exposing participants to harmful campaigns". This is the
> only mechanism we have found in *any* open-source phishing platform that actually implements that clause.

---

## 3. Measurement is broken — three specific, fixable defects

### D1 — Difficulty is unaccounted for

**The NIST Phish Scale** (Steves, Greene, Theofanos; NIST). Rates how hard an email is for a *specific
audience* to detect, so click rates can be read fairly.

- **Cue count** across 5 categories: errors; technical indicators; visual presentation; language & content;
  common tactics. Bands: **1–8 cues = "Few" (hardest to detect)**, 9–14 = "Some", **15+ = "Many" (easiest)**.
- **Premise alignment**: how well the lure matches the target's actual work context. Strong alignment makes
  detection much harder.
- Combined into an overall detection-difficulty rating. NIST published an implementation user guide in
  **Nov 2023**; the research applied the scale to 7 real exercises and to org-wide exercises of ~5,000
  employees.
- https://csrc.nist.gov/pubs/journal/2020/09/categorizing-human-phishing-detection-difficulty-a/final
- https://csrc.nist.gov/csrc/media/Projects/human-centered-cybersecurity/documents/The%20NIST%20Phish%20Scale--A%20method%20for%20rating%20human%20phishing%20detection%20difficulty%E2%80%8B%5EFINAL.pdf

**→ `@chetna/phishscale`**: automatic cue detection plus a premise-alignment input gives every template a
difficulty band, and every susceptibility metric is difficulty-adjusted. *You cannot make your numbers look
good by sending easier phish* — the platform detects that and says so.

### D2 — Opens and clicks are polluted by machines

- Apple **Mail Privacy Protection** pre-fetches tracking pixels through a proxy, logging an "open" for
  people who never read the message. Vendor estimates of inflation range 15–50 points (directional only).
- Enterprise **security scanners and secure email gateways** visit links, producing click events no human
  generated. Gateways can also rewrite the source IP, which breaks IP-based allowlisting.
- Errors run both ways: blocked images cause **false negatives**.
- https://postmarkapp.com/support/article/1257-open-tracking-and-apple-mail
- https://www.bigmailer.io/blog/about-bots-and-email-tracking/

**→ Chetna** records an `OPEN` as **`probable_open` carrying a machine-likelihood score**, classifies
scanner / prefetch / MPP traffic as `MACHINE`, **excludes it from human metrics and reports the filtered
volume openly on the dashboard**. A simulated click is only promoted to `CLICK_CONFIRMED` with a
human-interaction beacon. Honest instrumentation is a technical-credibility win, and nobody else in the
room will do it.

### D3 — Nobody runs a control group, so no claim is falsifiable

Secondary summaries of the **Verizon DBIR 2025** give: median **21 seconds** from delivery to click versus
median **28 minutes** to report; median simulation click rate ~**1.5%**; people trained in the previous 30
days reported at ~**21%** versus ~**5%** untrained (about 4x). *Secondary sources — cite as "reported" and
verify against the primary DBIR before putting a number on a slide.*

Industry metric practice (vendor consensus, no standard): report rate, time-to-report, repeat
susceptibility, and **resilience score = report rate ÷ failure rate**. One vendor's own warning is the
important one: *"if report rate is flat while click rate falls, you may just be sending easier simulations."*

**→ Chetna** ships a **stratified randomised holdout arm** in every campaign, computes the treatment effect
with **Wilson / two-proportion confidence intervals**, and **refuses to claim an effect when the interval
crosses zero**.

> Slide line: *"We are the only awareness platform that will tell you your training isn't working."*

---

## 4. The AI dimension (this is an AI & Emerging Technology Security track)

- **"Evaluating Large Language Models' Capability to Launch Fully Automated Spear Phishing Campaigns"**
  (ICML 2025, 101 participants): control lures **12%** click-through; **human experts 54%**; **fully
  AI-automated 54%**; AI with a human in the loop **56%**. AI matched expert humans at a small fraction of
  the cost. The same paper found Claude 3.5 Sonnet detected phishing well above 90% with low false
  positives, catching some lures humans missed. https://icml.cc/virtual/2025/50888
- A separate field study of ~71,000 emails (Weinz et al., 2025, arXiv:2505.12104) reports LLM-written lures
  exceeding a 30% open-to-click rate at one organisation; expertly hand-crafted "V-Triad" messages still
  beat GPT-4 output in another study (69–79%).
- Coverage of AI-supported spear phishing fooling >50% of targets:
  https://www.malwarebytes.com/blog/news/2025/01/ai-supported-spear-phishing-fools-more-than-50-of-targets

**→ Chetna's three AI surfaces, all offline-capable and all guarded:**

1. **Lure Composer** — generates template variants from an approved scenario taxonomy. The model never
   receives participant PII (role archetypes only). Output is schema-validated, then **must** pass
   `safety-lint` and `ethics` before it can be persisted. This is the defensive answer to "attackers now
   have this capability for free".
2. **Coach** — 60-second personalised feedback keyed to the exact Phish Scale cues the person missed.
3. **AI-threat curriculum** — modules on AI-generated lures, deepfake voice (vishing), quishing and MFA
   fatigue, built on the numbers above.

Our own AI pipeline is treated as attack surface: no tool access, strict output schemas, template content
is never trusted as instructions (prompt-injection containment), and a deterministic offline provider so
the demo never depends on a network or an API key.

---

## 5. Compliance anchors (feasibility evidence)

| Framework | Hook | Use in Chetna |
|---|---|---|
| **ISO/IEC 27001:2022** Annex A **6.3** (+ Cl. 7.3) | Information security awareness, education and training; role-relevant | Report maps campaign and completion evidence to the control |
| **PCI DSS 4.0 — 12.6.3.1** (mandatory since 31 Mar 2025) | Awareness training **must** cover phishing and social engineering. PCI SSC states 5.4.1 (technical anti-phishing) and 12.6.3.1 (training) are **separate** — one does not satisfy the other | Evidence pack for an auditor |
| **NIS2 Art. 20** | Cybersecurity training for management plus regular training for all staff *(verify primary text before quoting)* | Management-level reporting view |
| **GDPR** | Lawful basis = **legitimate interests** (consent cannot be freely given for a test whose value depends on surprise); a **DPIA** is needed because it scores employee performance; German **§87(1) no.6 BetrVG** works-council co-determination applies to monitoring-capable technology | `docs/03-SAFEGUARDS.md` ships a pre-filled DPIA and works-council note |
| **India DPDP Act 2023** | §7(i) employment-purpose **legitimate use** (no separate consent for employment-purpose processing); erasure once the purpose is served, including by processors; written retention schedule | Retention engine, DSAR endpoints, erasure receipts |
| **Microsoft Defender for Office 365** | Advanced delivery policy: third-party phishing simulation entries take **sending domain (P1/DKIM) + sending IP**; since MC545900 body URLs are auto-allowed; gateways that rewrite IPs break matching | Deployment guide, step by step |
| **k-anonymity in people analytics** | Microsoft Viva Insights hard-floors minimum group size at **5**; consultancies suggest 10–20; thresholds must be re-checked for each attribute combination | `@chetna/privacy` `kAnonGuard`, k=5 default, hard floor 3, complementary suppression |

---

## 6. Competitive landscape — the gap we occupy

| | Gophish (OSS, MIT) | KnowBe4 / Hoxhunt / Proofpoint | **Chetna** |
|---|---|---|---|
| Credential capture | **Built in**, including "Capture Passwords". A university deployment guide warns credentials are stored **in plaintext**, and other text fields are captured even with passwords off | Usually optional, policy-controlled | **Architecturally impossible, and machine-verified** |
| Authorization control | None — anyone with console access can target anyone | Contractual / tenant-level | **Dual-control Ed25519 grant, 7 pre-send gates, tamper-evident log** |
| Harmful-lure prevention | None | Content guidance at best | **Ethics screen: banned-theme taxonomy, precedent citations, signed override** |
| Difficulty calibration | None | Proprietary, opaque | **NIST Phish Scale, open and inspectable** |
| Effect measurement | Click counts | Vendor-defined scores, no control arm | **Randomised holdout and confidence intervals that can say "no effect"** |
| Privacy posture | Plaintext PII, email in URLs | Policy and contract | **k-anonymity guard in the query layer, opaque tokens, retention engine, DSAR** |
| Cost | Free | Per-seat licence | Free, self-hosted |

Gophish: https://getgophish.com/ ·
https://udsecure.udayton.edu/cybersecurity/_resources/documents/gophish-install-instructions_final.pdf
Commercial landscape: https://expertinsights.com/security-awareness-training/top-human-risk-management-solutions

**One-sentence positioning:** *Gophish is an attack tool pointed at your own staff. Chetna is a
measurement-and-learning instrument that is physically incapable of becoming an attack tool.*

---

## 7. Source-confidence notes (say this if a judge pushes)

- **High confidence / primary:** NIST Phish Scale; ETH Zurich S&P 2022; UCSD S&P 2025; NCSC guidance;
  ICML 2025 LLM spear-phishing paper; Microsoft Learn advanced-delivery docs; ISO and PCI control text.
- **Secondary, quote as "reported":** Verizon DBIR 2025/2026 derived numbers (21 s, 28 min, 1.5%, 21% vs 5%),
  Apple MPP inflation percentages, MFA-fatigue statistics, vendor benchmark figures.
- **Deliberately not claimed:** that Chetna reduces real-world compromise. We measure what we can measure,
  and we say so. That restraint is the point of the product.
