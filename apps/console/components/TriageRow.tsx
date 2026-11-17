'use client';

import { useState, useTransition } from 'react';
import { setVerdict } from '@/lib/actions/triage';

const OPTIONS = [
  { value: 'SIMULATION', label: 'Simulation', tone: 'text-slate-300' },
  { value: 'REAL_THREAT', label: 'Real threat', tone: 'text-accent-bad' },
  { value: 'BENIGN', label: 'Benign', tone: 'text-accent-good' },
] as const;

export default function TriageControls({
  reportId,
  current,
  canWrite,
}: {
  reportId: string;
  current: string;
  canWrite: boolean;
}) {
  const [verdict, setLocal] = useState(current);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!canWrite) {
    return <span className="text-xs text-slate-500">{verdict}</span>;
  }

  const choose = (value: string) => {
    setError(null);
    setLocal(value);
    start(async () => {
      const result = await setVerdict(reportId, value);
      if (!result.ok) {
        setError(result.error ?? 'Could not save.');
        setLocal(current);
      }
    });
  };

  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            disabled={pending}
            onClick={() => choose(o.value)}
            className={`rounded border px-2 py-1 text-[11px] transition disabled:opacity-50 ${
              verdict === o.value
                ? 'border-accent bg-accent/15 text-accent'
                : `border-ink-line ${o.tone} hover:border-accent/50`
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
      {error && <p className="mt-1 text-[11px] text-accent-bad">{error}</p>}
    </div>
  );
}
