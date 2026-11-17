'use client';

import { useState, useTransition } from 'react';
import type { ChainVerification } from '@chetna/core';
import { runDsar, runRetentionPurge, verifyAuditChain } from '@/lib/actions/governance';

const btn =
  'rounded-lg border px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40';

/** Walk the hash chain and re-compute every hash and link. */
export function ChainVerifier() {
  const [result, setResult] = useState<ChainVerification | null>(null);
  const [pending, start] = useTransition();

  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={() => start(async () => setResult(await verifyAuditChain()))}
        className={`${btn} border-ink-line text-slate-200 hover:border-accent`}
      >
        {pending ? 'Verifying…' : 'Verify the chain'}
      </button>

      {result && (
        <div
          className={`mt-3 rounded-lg border p-4 ${
            result.ok
              ? 'border-accent-good/40 bg-accent-good/10'
              : 'border-accent-bad/40 bg-accent-bad/10'
          }`}
        >
          <p className={`text-sm font-semibold ${result.ok ? 'text-accent-good' : 'text-accent-bad'}`}>
            {result.ok
              ? `Chain intact — ${result.entriesChecked} entries re-computed and matched`
              : `Chain BROKEN at sequence ${result.firstBadSeq}`}
          </p>
          {result.problem && <p className="mt-1 text-xs text-slate-300">{result.problem}</p>}
          {result.merkleRoot && (
            <p className="mt-2 break-all font-mono text-[10px] text-slate-500">
              merkle root {result.merkleRoot}
            </p>
          )}
          <p className="mt-2 text-xs text-slate-500">
            Every payload hash, every entry hash and every link to the previous entry is
            re-calculated from scratch. No entry can be altered or removed without changing every
            hash after it.
          </p>
        </div>
      )}
    </div>
  );
}

/** Retention: dry run first, always. */
export function PurgeTool({ canRun }: { canRun: boolean }) {
  const [lines, setLines] = useState<Awaited<ReturnType<typeof runRetentionPurge>> | null>(null);
  const [applied, setApplied] = useState(false);
  const [pending, start] = useTransition();

  if (!canRun) {
    return <p className="text-sm text-slate-500">This role may not run the retention job.</p>;
  }

  const run = (apply: boolean) => {
    setApplied(apply);
    start(async () => setLines(await runRetentionPurge(apply)));
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => run(false)}
          className={`${btn} border-ink-line text-slate-200 hover:border-accent`}
        >
          {pending && !applied ? 'Checking…' : 'Dry run'}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => run(true)}
          className={`${btn} border-accent-bad/50 text-accent-bad hover:bg-accent-bad/10`}
        >
          {pending && applied ? 'Erasing…' : 'Apply — erase now'}
        </button>
      </div>

      {lines?.lines && (
        <div className="mt-4 overflow-x-auto rounded-lg border border-ink-line">
          <table className="w-full text-xs">
            <thead className="bg-ink-soft">
              <tr>
                {['Data class', 'Retain', 'Cutoff', applied ? 'Erased' : 'Would erase'].map((h) => (
                  <th key={h} className="px-3 py-2 text-left font-semibold uppercase text-slate-500">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-line">
              {lines.lines.map((l) => (
                <tr key={l.dataClass}>
                  <td className="px-3 py-2 text-slate-300">{l.dataClass}</td>
                  <td className="px-3 py-2 text-slate-400">{l.retainDays}d</td>
                  <td className="px-3 py-2 text-slate-500">
                    {l.purgeable ? new Date(l.cutoffAt).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-3 py-2">
                    {l.purgeable ? (
                      <span className="text-slate-200">
                        {l.affected}{' '}
                        <span className="text-slate-500">
                          {l.mode === 'fields-cleared' ? 'fields' : 'rows'}
                        </span>
                      </span>
                    ) : (
                      <span className="text-accent-good">never auto-purged</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {lines?.lines && (
        <p className="mt-3 text-xs leading-relaxed text-slate-500">
          Raw telemetry is a FIELD-level purge, not a row delete: the fact that someone clicked is
          kept for its full period, while the detail about their device and network is erased after
          thirty days. The metric survives; the surveillance potential does not. Each line wrote a
          receipt and an audit entry — deletion is itself evidence.
        </p>
      )}
    </div>
  );
}

/** Data-subject requests. */
export function DsarTool({ canRun }: { canRun: boolean }) {
  const [pid, setPid] = useState('');
  const [result, setResult] = useState<Awaited<ReturnType<typeof runDsar>> | null>(null);
  const [pending, start] = useTransition();

  if (!canRun) {
    return (
      <p className="text-sm text-slate-500">
        Data-subject requests are handled by the owner or People/HR.
      </p>
    );
  }

  const run = (kind: 'ACCESS' | 'ERASURE') => {
    setResult(null);
    start(async () => setResult(await runDsar(pid, kind)));
  };

  return (
    <div>
      <input
        value={pid}
        onChange={(e) => setPid(e.target.value)}
        placeholder="Participant id, for example p_AbC123…"
        className="w-full rounded-lg border border-ink-line bg-ink px-3 py-2 font-mono text-sm text-slate-100 outline-none focus:border-accent"
      />
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending || !pid.trim()}
          onClick={() => run('ACCESS')}
          className={`${btn} border-ink-line text-slate-200 hover:border-accent`}
        >
          Access — show everything held
        </button>
        <button
          type="button"
          disabled={pending || !pid.trim()}
          onClick={() => run('ERASURE')}
          className={`${btn} border-accent-bad/50 text-accent-bad hover:bg-accent-bad/10`}
        >
          Erasure
        </button>
      </div>

      {result?.error && (
        <p className="mt-3 rounded-lg border border-accent-bad/40 bg-accent-bad/10 px-3 py-2 text-sm text-accent-bad">
          {result.error}
        </p>
      )}

      {result?.ok && result.result?.kind === 'ERASURE' && (
        <div className="mt-3 rounded-lg border border-accent-good/40 bg-accent-good/10 p-4 text-sm text-accent-good">
          Erased. Contact fields are null, the participant is tombstoned and opted out, and
          aggregate counts are retained — so last quarter&apos;s analytics do not silently change.
        </div>
      )}

      {result?.ok && result.result?.export !== undefined && (
        <div className="mt-3">
          <p className="text-xs text-slate-500">
            Everything held about this person, including the retention clocks that apply.
          </p>
          <pre className="mt-2 max-h-80 overflow-auto rounded-lg border border-ink-line bg-ink p-3 font-mono text-[10px] leading-relaxed text-slate-400">
            {JSON.stringify(result.result.export, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
