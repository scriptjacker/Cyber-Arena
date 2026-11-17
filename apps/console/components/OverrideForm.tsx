'use client';

import { useState, useTransition } from 'react';
import { signEthicsOverride } from '@/lib/actions/templates';

/**
 * The ethics override.
 *
 * The friction here is the control, not an accident of design: a named
 * People/HR approver, a justification long enough to require an actual
 * argument, a live character count so nobody can pretend they did not notice,
 * and an Ed25519 signature over the template hash, the themes and the
 * justification together.
 *
 * Only the `ethics:override` capability reaches this component, and that
 * capability is held by People/HR alone — not by the security admin who wrote
 * the lure, and not by the owner.
 */
export default function OverrideForm({
  templateId,
  themes,
  approverName,
}: {
  templateId: string;
  themes: string[];
  approverName: string;
}) {
  const [justification, setJustification] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();

  const MIN = 120;
  const remaining = Math.max(0, MIN - justification.trim().length);

  const submit = () => {
    setError(null);
    start(async () => {
      const form = new FormData();
      form.set('templateId', templateId);
      form.set('justification', justification);
      const result = await signEthicsOverride(form);
      if (result.ok) setDone(true);
      else setError(result.error ?? 'Could not record the override.');
    });
  };

  if (done) {
    return (
      <div className="rounded-lg border border-accent/40 bg-accent/10 px-4 py-3 text-sm text-accent">
        Override signed and recorded. The template may now be sent, and the justification is
        permanently attached to it in the audit log.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-accent-warm/40 bg-accent-warm/10 p-5">
      <h3 className="text-sm font-semibold text-white">Override as People/HR</h3>
      <p className="mt-1.5 text-xs leading-relaxed text-slate-300">
        You are about to permit a lure that uses{' '}
        <strong className="text-accent-warm">{themes.join(', ')}</strong>. Your name, the text below
        and a cryptographic signature are recorded permanently against this template.
      </p>

      <label className="mt-4 block text-[11px] font-medium uppercase tracking-wide text-slate-500">
        Justification — why is this appropriate for this audience, right now?
        <textarea
          value={justification}
          onChange={(e) => setJustification(e.target.value)}
          className="mt-1.5 h-28 w-full rounded-lg border border-ink-line bg-ink px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-100 outline-none focus:border-accent"
          placeholder="For example: no redundancy or restructuring process is live this quarter, the compensation cycle closed in March, and the campaign excludes the 11 people currently on compassionate leave."
        />
      </label>

      <p className="mt-1.5 text-xs text-slate-500">
        {remaining > 0 ? (
          <span className="text-accent-warm">{remaining} more characters required</span>
        ) : (
          <span className="text-accent-good">
            {justification.trim().length} characters — signing as {approverName}
          </span>
        )}
      </p>

      {error && (
        <p className="mt-3 rounded-lg border border-accent-bad/40 bg-accent-bad/10 px-3 py-2 text-xs text-accent-bad">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={pending || remaining > 0}
        className="mt-4 rounded-lg bg-accent-warm px-4 py-2.5 text-sm font-semibold text-ink transition hover:bg-accent-warm/85 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {pending ? 'Signing…' : 'Sign the override'}
      </button>
    </div>
  );
}
