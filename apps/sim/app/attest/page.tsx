import { BRAND } from '@chetna/core';
import { prisma } from '@chetna/db';
import type { AttestationDocument } from '@chetna/safety-lint';

export const dynamic = 'force-dynamic';

/**
 * The public Non-Collection Attestation.
 *
 * "We do not collect credentials" is an unfalsifiable sentence in a policy
 * document. This page is the falsifiable version: the rules that ran, the
 * templates they ran against, the hostile canary that was rejected, a scan of
 * this very application's source for credential sinks, the hash of the database
 * schema, and a signature over the lot.
 *
 * It is deliberately readable by someone who is not an engineer, and
 * deliberately shows a FAILED or INCOMPLETE verdict just as prominently as a
 * pass. An attestation that can only say yes is marketing.
 */
const VERDICT_STYLE: Record<string, { label: string; cls: string; blurb: string }> = {
  ATTESTED: {
    label: 'Attested',
    cls: 'border-accent-good/40 bg-accent-good/10 text-accent-good',
    blurb: 'Every check ran and every check passed.',
  },
  INCOMPLETE: {
    label: 'Incomplete',
    cls: 'border-accent-warm/40 bg-accent-warm/10 text-accent-warm',
    blurb:
      'Every check that could run passed, but something could not be checked. An unproven claim is not reported as a pass.',
  },
  FAILED: {
    label: 'Failed',
    cls: 'border-accent-bad/40 bg-accent-bad/10 text-accent-bad',
    blurb: 'A check failed. The non-collection claim does not currently hold.',
  },
};

export default async function AttestPage() {
  const row = await prisma.safetyAttestation.findFirst({ orderBy: { createdAt: 'desc' } });

  if (!row) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16">
        <h1 className="text-xl font-semibold text-white">No attestation has been produced yet</h1>
        <p className="mt-3 text-sm text-slate-400">
          Run <code className="rounded bg-ink-line px-1.5 py-0.5 font-mono">npm run verify:safety</code>{' '}
          to lint every template, run the credential canary, scan this application&apos;s source and
          sign the result.
        </p>
      </main>
    );
  }

  const doc = JSON.parse(row.documentJson) as AttestationDocument;
  const verdict = VERDICT_STYLE[doc.summary.verdict] ?? VERDICT_STYLE.FAILED;

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
        {BRAND.name} · public attestation
      </p>
      <h1 className="mt-2 text-2xl font-semibold text-white">Non-Collection Attestation</h1>

      <div className={`mt-6 rounded-xl border p-5 ${verdict.cls}`}>
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ring-1 ring-current">
            {verdict.label}
          </span>
          <span className="text-xs opacity-90">{verdict.blurb}</span>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-slate-200">{doc.claim}</p>
        <p className="mt-2 text-xs text-slate-400">
          Produced {new Date(doc.createdAt).toUTCString()} · version {doc.version}
        </p>
      </div>

      {/* ----------------------------------------------------------- summary */}
      <section className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {[
          ['Templates checked', String(doc.summary.templatesRun)],
          ['Rules per template', String(doc.summary.rulesRun)],
          ['Templates failing', String(doc.summary.templateFailures)],
          ['Credential canary', doc.summary.canaryPassed ? 'Rejected' : 'NOT REJECTED'],
          ['Source files scanned', String(doc.sourceScan.filesScanned)],
          ['Source violations', String(doc.summary.sourceViolations)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-ink-line bg-ink-soft px-4 py-3">
            <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
            <div className="mt-1 text-lg font-semibold text-white">{value}</div>
          </div>
        ))}
      </section>

      {/* ------------------------------------------------------------- canary */}
      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
          The credential canary
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-300">
          Every run builds the most hostile template we can think of — a password field, named
          inputs, a form posting to an external host, a <code className="font-mono">fetch()</code>{' '}
          call, a script, an email address in a URL, an executable attachment — and asserts that the
          linter refuses it. A safeguard nobody tests is a safeguard nobody has.
        </p>
        <p className="mt-3 text-sm text-slate-200">{doc.canary.detail}</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {doc.canary.blockedBy.map((rule) => (
            <span
              key={rule}
              className="rounded border border-ink-line bg-ink-soft px-2 py-1 font-mono text-[11px] text-slate-400"
            >
              {rule}
            </span>
          ))}
        </div>
        {doc.canary.missed.length > 0 && (
          <p className="mt-3 text-sm text-accent-bad">
            Rules that should have fired and did not: {doc.canary.missed.join(', ')}
          </p>
        )}
      </section>

      {/* -------------------------------------------------------------- rules */}
      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
          The rules, and why each one exists
        </h2>
        <ul className="mt-3 space-y-2.5">
          {doc.rules.map((r) => (
            <li key={r.id} className="rounded-lg border border-ink-line bg-ink-soft px-4 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-mono text-xs text-slate-400">{r.id}</span>
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                    r.severity === 'FAIL'
                      ? 'bg-accent-bad/20 text-accent-bad'
                      : 'bg-accent-warm/20 text-accent-warm'
                  }`}
                >
                  {r.severity}
                </span>
              </div>
              <div className="mt-1 text-sm font-medium text-white">{r.title}</div>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">{r.rationale}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* -------------------------------------------------------- source scan */}
      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
          Source scan of this application
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-300">
          A safe template served by an unsafe application is still unsafe, so the simulation
          surface&apos;s own source is scanned for credential-shaped patterns: password inputs,
          autofill hints, named inputs, forms with an action, and any read of a secret from a
          request body.
        </p>
        <div className="mt-3 text-sm text-slate-300">
          <p>
            Scanned:{' '}
            {doc.sourceScan.scannedPaths.length > 0 ? (
              <span className="font-mono text-xs">{doc.sourceScan.scannedPaths.join(', ')}</span>
            ) : (
              <span className="text-accent-warm">nothing</span>
            )}
          </p>
          {doc.sourceScan.skippedPaths.length > 0 && (
            <p className="mt-1 text-accent-warm">
              Could not be scanned:{' '}
              <span className="font-mono text-xs">{doc.sourceScan.skippedPaths.join(', ')}</span>
            </p>
          )}
        </div>
        {doc.sourceScan.violations.length > 0 ? (
          <ul className="mt-3 space-y-1.5">
            {doc.sourceScan.violations.map((v, i) => (
              <li key={i} className="rounded border border-accent-bad/40 bg-accent-bad/10 px-3 py-2">
                <span className="font-mono text-xs text-accent-bad">
                  {v.file}:{v.line}
                </span>
                <span className="ml-2 text-xs text-slate-300">{v.pattern}</span>
                <pre className="mt-1 overflow-x-auto font-mono text-[11px] text-slate-400">
                  {v.snippet}
                </pre>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-accent-good">No credential-shaped pattern found.</p>
        )}
      </section>

      {/* ------------------------------------------------------------ integrity */}
      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
          Integrity
        </h2>
        <dl className="mt-3 space-y-2 text-xs">
          {[
            ['Database schema hash', doc.schemaHash],
            ['Attestation document hash', doc.documentHash],
            ['Ed25519 signature', row.signatureB64],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border border-ink-line bg-ink-soft px-4 py-3">
              <dt className="text-[11px] uppercase tracking-wide text-slate-500">{label}</dt>
              <dd className="mt-1 break-all font-mono text-[11px] text-slate-300">{value}</dd>
            </div>
          ))}
        </dl>
        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-slate-500 hover:text-slate-300">
            Signing public key
          </summary>
          <pre className="mt-2 overflow-x-auto rounded-lg border border-ink-line bg-ink-soft p-3 font-mono text-[10px] leading-relaxed text-slate-400">
            {row.publicKeyPem.trim()}
          </pre>
        </details>
      </section>

      <footer className="mt-10 border-t border-ink-line pt-5 text-xs leading-relaxed text-slate-500">
        <p>
          Reproduce this yourself:{' '}
          <code className="rounded bg-ink-line px-1.5 py-0.5 font-mono">npm run verify:safety</code>{' '}
          regenerates and re-signs it;{' '}
          <code className="rounded bg-ink-line px-1.5 py-0.5 font-mono">npm run test:abuse</code>{' '}
          runs the suite that actively attempts each abuse this page claims to prevent.
        </p>
        <p className="mt-2">
          If you find a way to make {BRAND.name} collect a credential, send outside an approved
          scope, or re-identify an individual from aggregate output, please report it before
          disclosing it. That is the class of bug this project exists to prevent.
        </p>
      </footer>
    </main>
  );
}

export const metadata = {
  title: 'Non-Collection Attestation',
  robots: { index: false, follow: false },
};
