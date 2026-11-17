# 06 — 48-Hour Workplan

Task-level backlog. Every task has an **owner workstream**, an **hour estimate**, a **priority** and an
**acceptance criterion**. Total P0 estimate: **~96 engineer-hours**, which is 4 people × 24 productive
hours out of 48 elapsed. That is tight but real **only if the interface freeze at H2 holds**.

Priorities: **P0** = demo spine, no submission without it · **P1** = strongly wanted · **P2** = roadmap.

Workstreams: **A** Safety Core · **B** Console & Campaign UX · **C** Delivery & Telemetry ·
**D** Learning & Content · **E** Analytics, Report, Docs & Pitch · **F** QA & Demo Master.

---

## H0–H2 · Kickoff and interface freeze (whole team, nothing parallel yet)

| # | Task | WS | Hrs | Pri | Acceptance |
|---|---|---|---|---|---|
| K1 | `git init`, npm workspaces, TS strict base config, ESLint/Prettier, `.env.example`, Vitest + Playwright wired | A | 1.0 | P0 | `npm run typecheck` and `npm test` succeed on an empty suite |
| K2 | Scaffold `apps/console`, `apps/sim`, all 11 `packages/*`, `services/*`, `cli/` with index stubs and correct deps | A | 0.5 | P0 | Every workspace resolves and builds |
| K3 | **Write `packages/core/src/types.ts`** — all enums, `PolicyDecision`, `ReasonCode`, `KGuarded<T>`, zod schemas, `brand.ts` | A | 1.0 | P0 | Imported by every other package; **frozen** |
| K4 | **Write `prisma/schema.prisma`** in full (§3 of `01-ARCHITECTURE.md`), `db:push`, generate client | A | 1.0 | P0 | SQLite file created, client typed; **frozen** |
| K5 | Read-through of `docs/01` §7 API contracts; each WS claims tasks and confirms what it will mock | all | 0.5 | P0 | Every WS states aloud what it is building in H2–H10 |
| K6 | Git conventions: branch per WS, hourly commits, pre-push `npm run typecheck`, no direct main pushes | F/A | 0.5 | P0 | Hook installed |

> **Freeze rule:** after H2, `types.ts`, the Prisma schema and the API contracts change **only** via WS-A
> with a message to the whole team. Everyone else mocks.

---

## H2–H10 · Parallel build I

### WS-A — Safety Core
| # | Task | Hrs | Pri | Acceptance |
|---|---|---|---|---|
| A1 | `@chetna/audit`: Ed25519 keygen/sign/verify, canonical JSON, SHA-256 hash chain, append-only repo | 2.0 | P0 | Unit: chain verifies; a mutated row fails loudly (A17) |
| A2 | `@chetna/policy`: all 7 gates as one pure `evaluate()` with full reason-code coverage | 3.0 | P0 | 24 unit cases; every `ReasonCode` reachable |
| A3 | `@chetna/safety-lint`: SL001–SL010 over a parsed DOM, findings with ids and explanations | 2.0 | P0 | Abuse A01–A03, A21 pass; `npm run verify:safety` writes a signed attestation |
| A4 | `cli/`: `seed`, `demo`, `audit verify`, `safety attest`, `purge --dry-run`, `keys init` | 1.5 | P0 | `npm run demo` seeds and prints the login details |
| A5 | Seed data: org, 5 staff users, 240 participants (Faker, `.test` domains, realistic department mix), suppressions, approved domains, **one completed prior campaign with events** | 1.5 | P0 | Dashboards have history on first open |

### WS-B — Console & Campaign UX
| # | Task | Hrs | Pri | Acceptance |
|---|---|---|---|---|
| B1 | App shell: auth (argon2id + cookie session), `requireRole()` guard, nav, layout, dark theme | 2.5 | P0 | Login works; a wrong role gets 403 |
| B2 | Template Studio: editor, live preview in a sandboxed iframe, lint findings panel, Phish Scale panel | 3.0 | P0 | Pasting a password input blocks the save with a readable reason |
| B3 | Campaign wizard: name, window, templates, roster, holdout %, rate limit | 2.0 | P0 | Creates a `DRAFT` campaign |
| B4 | Roster import: CSV upload, validation, rejected-row report, attestation note, `rosterHash` | 1.5 | P0 | 240 rows import; `rosterHash` stable and reproducible |

### WS-C — Delivery & Telemetry
| # | Task | Hrs | Pri | Acceptance |
|---|---|---|---|---|
| C1 | `services/mailsink`: `smtp-server` on `127.0.0.1:1025`, parse to `Message` rows | 2.0 | P0 | `netstat` shows loopback only; a sent mail appears as a row |
| C2 | Participant webmail in `apps/console/(mail)`: list, read, images on/off, **Report button** | 2.5 | P0 | Email renders; report fires `REPORTED` |
| C3 | `services/worker`: tick loop, row claiming, `policy.evaluate()` **per message**, send, retry, state machine | 3.0 | P0 | Blocked sends write `BLOCKED` + an audit entry with the reason code |
| C4 | Token service: 128-bit tokens, `/p` pixel, `/t` landing stub, `/q`, `/r` routes in `apps/sim` with CSP headers | 2.0 | P0 | No PII in any URL; CSP present; pixel returns a GIF |

### WS-D — Learning & Content
| # | Task | Hrs | Pri | Acceptance |
|---|---|---|---|---|
| D1 | `@chetna/phishscale`: cue detectors for the 5 NIST categories with DOM anchors, cue count bands, premise alignment → difficulty | 3.0 | P0 | Unit: the 10 seeded templates land on sensible, hand-checked bands |
| D2 | 4 of 10 templates authored (courier/customs, IT password expiry, DocuSign-style share, QR parking fine) with cue annotations | 2.0 | P0 | All pass lint; all have a difficulty band |
| D3 | `@chetna/ui` cue-overlay renderer: annotate the original HTML from anchors, hover explanations | 2.5 | P0 | Renders over a real template without breaking the layout |

### WS-E — Analytics, Report, Docs & Pitch
| # | Task | Hrs | Pri | Acceptance |
|---|---|---|---|---|
| E1 | `@chetna/scoring`: metric definitions (§6 of `01-ARCHITECTURE.md`), difficulty weights, Wilson CI, Elo-lite | 2.5 | P0 | Unit-tested against hand-computed fixtures |
| E2 | `@chetna/privacy`: `kGuard` with complementary suppression, retention rules, purge, DSAR | 2.5 | P0 | Abuse A18, A19, A23, A24 pass |
| E3 | Analytics queries over the seed DB (exec summary, cohort, funnel) returning `KGuarded` | 2.0 | P0 | Returns real numbers from the seeded prior campaign |
| E4 | Deck skeleton (10 slides) + demo-script draft | 1.0 | P1 | Slides exist with placeholder screenshots |

---

## H10–H16 · Vertical slice — integration only

**Nothing new is started in this window.** The only goal is one unbroken path:

> create campaign → preflight → two signatures → worker sends → webmail receives → click → landing →
> teachable moment → events in the DB → visible on the dashboard

| # | Task | WS | Hrs | Pri | Acceptance |
|---|---|---|---|---|---|
| V1 | Wire `preflight()` into the wizard with a per-gate green/red panel | A+B | 1.5 | P0 | All 7 gates render with live reason codes |
| V2 | Authorization UI: canonical payload shown, sign as Security, sign as HR, grant created + audited | A+B | 2.0 | P0 | Two signatures create a grant; one does not |
| V3 | Worker → mailsink → webmail end to end | C | 1.5 | P0 | A real email lands in Priya's inbox |
| V4 | `/t/:token` landing with the cue overlay + interaction beacon | C+D | 2.0 | P0 | `CLICK_UNCONFIRMED` then `CLICK_CONFIRMED` recorded |
| V5 | Event timeline view in the console | B+E | 1.0 | P0 | The whole journey visible in order |
| V6 | **Rehearse the spine once, end to end, as a team** | all | 0.5 | P0 | It works twice in a row |

> **H16 go/no-go.** If the spine is not working at H16, cut P1 entirely and everyone converges on it.

---

## H16–H20 · Rotate / sleep
Half the team sleeps. The other half: seed realism, written bug triage, no new features. Deliverable: a
prioritised bug list in `docs/BUGS.md`.

---

## H20–H30 · Parallel build II

| # | Task | WS | Hrs | Pri | Acceptance |
|---|---|---|---|---|---|
| G1 | `@chetna/ethics`: banned + caution taxonomy, scored detection, precedent cards with citations | A | 3.0 | P0 | The COVID-bonus lure is BLOCKED with the West Midlands citation (A04) |
| G2 | Ethics override flow: HR-only, ≥120-char justification, Ed25519 signature, audit entry | A+B | 2.0 | P0 | A security admin attempting it gets 403 (A05) |
| G3 | SOC triage console: queue, clustering, verdicts, time-to-first-report | B | 2.5 | P0 | Reports from the demo appear and cluster |
| G4 | Machine filtering: scanner/MPP/prefetch scoring, `MACHINE` classification, the filtered-volume tile | C | 2.0 | P0 | Seeded scanner traffic is excluded and shown separately |
| G5 | 45-second interactive drill + `Progress` dwell tracking + completion gating | D | 2.5 | P0 | `DRILL_PASS`/`FAIL` recorded; dwell measured |
| G6 | Remaining 6 templates + 6 micro-modules (incl. AI phishing, deepfake voice, quishing, MFA fatigue) | D | 3.0 | P0 | All lint-pass, all cue-tagged to modules |
| G7 | Exec + cohort + campaign dashboards with suppression states rendered | E | 3.0 | P0 | A 3-person cohort renders the suppressed state (A18) |
| G8 | Awareness report: HTML template + `page.pdf()` export + control mapping + dossier appendix | E | 2.5 | P0 | A PDF is produced in one click and committed as the sample |
| G9 | Retention purge + DSAR access/erasure UI and receipts | A+E | 1.5 | P0 | Receipt written, audit entry written (A23, A24) |
| G10 | Holdout stratified randomisation + effect panel with CI and the "no significant effect" state | E | 2.0 | P1 | Renders the null state honestly on seed data |
| G11 | `@chetna/ai`: provider interface + deterministic offline provider + Composer and Coach surfaces | A+D | 3.0 | P1 | Generated template must pass lint + ethics before saving (A22) |
| G12 | QR / quishing channel: QR render in the email, `/q/:token` landing | C+D | 1.5 | P1 | Scanning with a phone camera on the same LAN works, or a simulated scan does |
| G13 | Participant self-service portal: my results, my rating band, opt-out | B+D | 1.5 | P1 | Opt-out immediately blocks future sends (A12) |
| G14 | Spaced-repetition scheduler (Leitner) in the worker | D | 1.0 | P1 | D+7 item created on a drill failure |

---

## H30–H36 · Harden

| # | Task | WS | Hrs | Pri | Acceptance |
|---|---|---|---|---|---|
| H1 | **Abuse suite A01–A24** complete and green | F+A | 4.0 | P0 | `npm run test:abuse` green; each case names its gate |
| H2 | Playwright E2E for the spine and the three blocks | F | 2.5 | P0 | CI-runnable, headless |
| H3 | `/attest` public attestation page reading the signed artefact | A | 1.0 | P0 | Renders rules, results, schema hash, signature |
| H4 | Logger redaction (email/token/IP), security headers audit on both apps | C | 1.0 | P0 | A test asserts no email or token appears in logs |
| H5 | Empty / error / loading states, keyboard nav, contrast pass, mobile width on the landing page | B+D | 2.5 | P0 | No blank screens anywhere in the demo path |
| H6 | `README.md` with the 5 deliverables and their paths; `POLICY.md`; `LICENSE` (AGPL-3.0) | E | 1.5 | P0 | A judge can find every artefact from the README |
| H7 | **Offline verification: disable the network adapter and run the whole demo** | F | 1.0 | P0 | Zero failures, zero outbound attempts |
| H8 | Deployment guide, DPIA, works-council note finalised into `docs/03` + `docs/07-DEPLOYMENT.md` | E | 2.0 | P1 | Reviewed by the tech lead |
| H9 | SBOM (CycloneDX), `npm audit`, dependency pin review | F | 1.0 | P1 | Clean or documented exceptions |

---

## H36–H42 · Pitch

| # | Task | WS | Hrs | Pri | Acceptance |
|---|---|---|---|---|---|
| P1 | Deck finalised with real screenshots | E | 2.0 | P0 | 10 slides, no paragraphs, every stat tagged |
| P2 | Demo script timed, roles assigned, pre-stage checklist written | E+F | 1.5 | P0 | Under 5 minutes on the clock |
| P3 | **Three timed rehearsals** with deliberate failure injection | all | 2.5 | P0 | Two clean runs in a row |
| P4 | Backup video (screen recording of the full demo) + screenshot pack | F | 1.5 | P0 | Plays from the desktop with no network |
| P5 | One-page judge handout: thesis, 4 differentiators, 5 deliverable paths, the comparison table | E | 1.0 | P0 | Printed |
| P6 | FAQ drill: the closer answers all 20 questions out loud | all | 1.0 | P0 | No hesitation on 7, 11, 14, 18 |

---

## H42–H46 · Buffer — feature freeze
Bug fixes and demo-data polish only. Tag `v1.0.0-demo`. **The demo runs from the tag, never from main.**

## H46–H48 · Submit
Final rehearsal. Submission package: repo (or zip) · `docs/` · deck · backup video ·
`sample-awareness-report.pdf` · one-page handout. Verify every link in the README resolves.

---

## Reduced-team adjustments

**4 people:** drop WS-F; QA tasks H1/H2 move to WS-A and WS-C; WS-D's content tasks (G6) move to WS-B
after H30; cut G11–G14 (the AI Composer, QR, portal and spaced repetition) to P2 **unless** the spine
landed by H14. Keep every P0.

**5 people:** as written, with WS-E absorbing QA.

**6 people:** as written. The sixth person is the Demo Master and owns rehearsals from H30 — this is the
highest-return role nobody ever assigns, and Presentation is 25%.

---

## Standing rules

1. **Hourly commits.** A branch that hasn't been pushed in an hour is a merge conflict in waiting.
2. **The spine beats everything.** Any task that doesn't serve the H16 slice waits until H20.
3. **No new dependency without the tech lead.** Every package added is supply-chain surface and a possible
   offline-mode failure.
4. **A feature isn't done until it has a test and a demo beat.** If you cannot show it in the demo,
   it does not score.
5. **Write the reason code before the happy path.** Every refusal a judge sees is worth more than a
   feature they do not.
6. **Mock loudly.** A mock must render the word "MOCK" on screen, so nothing fake reaches the stage by
   accident.
7. **Feature freeze at H42 is absolute.** Every hackathon loss in history is a feature merged at hour 47.
