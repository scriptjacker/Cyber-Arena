'use client';

import { useState, useTransition } from 'react';
import {
  requestAuthorization,
  revokeAuthorization,
  setKillSwitch,
  signAuthorization,
  testRecipient,
  type ActionResult,
} from '@/lib/actions/campaigns';

/**
 * Campaign controls, each one a named consequence rather than a generic button.
 *
 * The kill switch and revocation both take effect on the NEXT MESSAGE, because
 * the worker re-evaluates all seven gates immediately before every send. That
 * is worth stating on the button itself: an operator who believes a stop takes
 * effect "eventually" will hesitate to press it.
 */
export default function CampaignControls({
  campaignId,
  canRequest,
  canSign,
  signLabel,
  canKill,
  killSwitch,
  hasGrant,
}: {
  campaignId: string;
  canRequest: boolean;
  canSign: boolean;
  signLabel: string;
  canKill: boolean;
  killSwitch: boolean;
  hasGrant: boolean;
}) {
  const [result, setResult] = useState<ActionResult | null>(null);
  const [reason, setReason] = useState('');
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<ActionResult>) => {
    setResult(null);
    start(async () => setResult(await fn()));
  };

  const btn =
    'rounded-lg px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {canRequest && (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => requestAuthorization(campaignId))}
            className={`${btn} border border-ink-line text-slate-200 hover:border-accent`}
          >
            {hasGrant ? 'Re-request authorization' : 'Request authorization'}
          </button>
        )}

        {canSign && (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => signAuthorization(campaignId))}
            className={`${btn} bg-accent text-white hover:bg-accent/85`}
          >
            {signLabel}
          </button>
        )}

        {canKill && (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => setKillSwitch(campaignId, !killSwitch))}
            className={
              killSwitch
                ? `${btn} border border-accent-good/50 text-accent-good hover:bg-accent-good/10`
                : `${btn} border border-accent-bad/50 text-accent-bad hover:bg-accent-bad/10`
            }
          >
            {killSwitch ? 'Release the kill switch' : 'Engage the kill switch'}
          </button>
        )}
      </div>

      {canRequest && hasGrant && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason for revoking — recorded in the audit log"
            className="min-w-[260px] flex-1 rounded-lg border border-ink-line bg-ink px-3 py-2 text-sm text-slate-100 outline-none focus:border-accent"
          />
          <button
            type="button"
            disabled={pending || reason.trim().length < 5}
            onClick={() => run(() => revokeAuthorization(campaignId, reason))}
            className={`${btn} border border-accent-warm/50 text-accent-warm hover:bg-accent-warm/10`}
          >
            Revoke the grant
          </button>
        </div>
      )}

      {result && (
        <p
          className={`rounded-lg border px-4 py-3 text-sm ${
            result.ok
              ? 'border-accent-good/40 bg-accent-good/10 text-accent-good'
              : 'border-accent-bad/40 bg-accent-bad/10 text-accent-bad'
          }`}
        >
          {result.message ?? result.error}
        </p>
      )}
    </div>
  );
}

/**
 * The out-of-scope test.
 *
 * Type any address and watch the gates refuse it. On stage this is the fastest
 * demonstration that "authorized participants and approved domains" is enforced
 * rather than promised.
 */
export function RecipientTest({ campaignId }: { campaignId: string }) {
  const [email, setEmail] = useState('attacker@gmail.com');
  const [reasons, setReasons] = useState<string[] | null>(null);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [gate, setGate] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const test = () => {
    setError(null);
    setReasons(null);
    start(async () => {
      const result = await testRecipient(campaignId, email);
      if (!result.ok) {
        setError(result.error ?? 'Could not evaluate.');
        return;
      }
      setAllowed(result.decision?.allow ?? false);
      setGate(result.decision?.gate ?? null);
      setReasons(result.reasons ?? []);
    });
  };

  return (
    <div className="rounded-xl border border-ink-line bg-ink-soft p-5">
      <h3 className="text-sm font-semibold text-white">Test an address against the gates</h3>
      <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
        A dry run. Nothing is written and nothing is sent — this is the same pure function the
        worker calls immediately before every real message.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="min-w-[240px] flex-1 rounded-lg border border-ink-line bg-ink px-3 py-2 font-mono text-sm text-slate-100 outline-none focus:border-accent"
        />
        <button
          type="button"
          onClick={test}
          disabled={pending}
          className="rounded-lg border border-ink-line px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-accent disabled:opacity-40"
        >
          {pending ? 'Evaluating…' : 'Evaluate'}
        </button>
      </div>

      {error && <p className="mt-3 text-sm text-accent-bad">{error}</p>}

      {reasons && (
        <div
          className={`mt-4 rounded-lg border p-4 ${
            allowed
              ? 'border-accent-warm/40 bg-accent-warm/10'
              : 'border-accent-good/40 bg-accent-good/10'
          }`}
        >
          <p className={`text-sm font-semibold ${allowed ? 'text-accent-warm' : 'text-accent-good'}`}>
            {allowed
              ? 'ALLOWED — this address would receive a simulated message.'
              : `REFUSED at gate ${gate}.`}
          </p>
          <ul className="mt-2 space-y-1.5">
            {reasons.map((r) => {
              const [code, ...rest] = r.split(' — ');
              return (
                <li key={r} className="text-xs">
                  <span className="font-mono text-slate-300">{code}</span>
                  <p className="text-slate-400">{rest.join(' — ')}</p>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
