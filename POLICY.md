# Acceptable Use Policy

Chetna is an **authorized** phishing simulation and security awareness platform. It is built to make
unauthorized use difficult by design, but policy and architecture work together. This document states
intent; `packages/policy`, `packages/safety-lint`, `packages/ethics` and `packages/audit` enforce it.

## Permitted use

Simulated phishing and awareness exercises directed at **members of your own organisation**, where all of
the following hold:

1. There is **documented, current authorization** for the specific campaign, approved by at least two
   people in two distinct roles — one accountable for security, one accountable for people/HR.
2. Participants are on an **explicitly approved roster**, and every sender, landing and recipient domain
   has passed ownership verification.
3. The organisation has given **programme-level prior notice** to all participants explaining that
   simulations occur, what is measured, who can see it, and how to opt out.
4. Results are used **only** for awareness, measurement and curriculum targeting — **never** for
   disciplinary action, performance management, or any decision about an individual's employment.

## Prohibited use

- Targeting anyone outside a verified, approved roster — including customers, suppliers, members of the
  public, or employees of another organisation.
- Collecting, transmitting, storing or inferring **any credential, secret, payment detail or government
  identifier** by any means. The platform is built so this is not possible; attempting to defeat that is a
  violation of this policy regardless of whether it succeeds.
- Removing, obscuring or forging the simulation watermark, the `X-Chetna-Simulation` /
  `X-Simulated-Phish` headers, or the one-click report link.
- Removing or weakening the policy gates, the audit chain, the ethics screen or the safety linter in a
  deployment used against real people.
- Using lures on the banned-theme list (compensation and bonuses, bereavement, redundancy, medical
  information, immigration status, children, legal threats, disciplinary action) without a recorded,
  justified and signed HR override — and never at all where the theme is live for the people targeted.
- Using the platform to obtain unauthorized access to any system, account or data.
- Using results to identify, rank, name or publicly expose individual participants.

## Participant rights

Every participant may, at any time and without needing a reason:

- **See everything** the platform holds about them, via the self-service portal or a DSAR access request.
- **Opt out** of simulations, which the send path honours immediately (gate G4).
- **Request erasure**, which nulls their contact data and detaches their identity while preserving
  aggregate counts.
- **Escalate** distress caused by a simulation, with a 24-hour acknowledgement and automatic suppression
  pending review.

## Responsible disclosure

If you find a way to make Chetna collect a credential, send outside an approved scope, mutate the audit
chain undetected, or re-identify an individual from aggregate output, please report it before disclosing
it publicly. That is precisely the class of bug this project exists to prevent.

## Note on licensing

Chetna is distributed under the **AGPL-3.0**. An open-source licence cannot lawfully restrict how software
is used, so this policy is not a licence condition — it is the stated intent of the project, the terms of
service for any hosted deployment, and the standard against which contributions are reviewed. The actual
prevention of misuse comes from the architecture: the seven pre-send gates, dual-control cryptographic
authorization, the zero-credential design, the mandatory watermark, the offline-mode guard bound into the
signed campaign scope, and the tamper-evident audit log.
