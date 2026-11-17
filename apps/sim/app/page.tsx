import Link from 'next/link';
import { BRAND } from '@chetna/core';

export const dynamic = 'force-dynamic';

/**
 * The root of the simulation surface.
 *
 * Anyone who lands here directly — a curious participant, a security team
 * investigating a reported link, an auditor — gets a plain explanation and a
 * route to the evidence, rather than a blank page or a redirect.
 */
export default function Home() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-16">
      <p className="text-xs font-semibold uppercase tracking-wider text-accent-warm">
        Simulation surface
      </p>
      <h1 className="mt-2 text-2xl font-semibold text-white">
        {BRAND.name} — {BRAND.nameLocal}
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-slate-300">
        This site serves the landing pages for an <strong className="text-white">authorized</strong>{' '}
        security awareness programme. If you arrived here from a message that looked like phishing,
        that message was a simulation run with the prior approval of your organisation&apos;s
        security and people teams.
      </p>

      <h2 className="mt-9 text-sm font-semibold uppercase tracking-wide text-slate-400">
        What this site does not do
      </h2>
      <ul className="mt-3 space-y-2 text-sm text-slate-300">
        <li className="flex gap-2.5">
          <span className="text-accent-good">✓</span> It never asks for a password. There is no
          password field anywhere on it.
        </li>
        <li className="flex gap-2.5">
          <span className="text-accent-good">✓</span> It has no endpoint that accepts a typed value,
          and its security policy forbids any form from submitting at all.
        </li>
        <li className="flex gap-2.5">
          <span className="text-accent-good">✓</span> It stores no IP address and no full browser
          fingerprint — only a coarse class, erased after 30 days.
        </li>
        <li className="flex gap-2.5">
          <span className="text-accent-good">✓</span> It tells nobody who clicked. Individual
          results are visible only to the individual.
        </li>
      </ul>

      <div className="mt-9 rounded-xl border border-ink-line bg-ink-soft p-5">
        <h2 className="text-sm font-semibold text-white">Do not take our word for it</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          The non-collection claim is machine-checked on every build and published with a signature.
        </p>
        <Link
          href="/attest"
          className="mt-3 inline-block text-sm font-medium text-accent underline decoration-dotted hover:text-accent/80"
        >
          Read the attestation →
        </Link>
      </div>

      <p className="mt-9 text-xs leading-relaxed text-slate-600">
        {BRAND.tagline} · If a simulation caused you distress, tell your people team: the programme
        commits to acknowledging that within 24 hours and excluding you from further exercises while
        it is reviewed.
      </p>
    </main>
  );
}
