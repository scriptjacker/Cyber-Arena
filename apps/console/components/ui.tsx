import type { ReactNode } from 'react';

/**
 * The console's primitives. Hand-rolled rather than pulled from a component
 * library, for three reasons: the whole app ships offline with no CDN, the set
 * needed here is small, and a chart library would be a larger dependency than
 * the charts themselves.
 */

type Tone = 'neutral' | 'good' | 'warn' | 'bad' | 'info';

const TONE_RING: Record<Tone, string> = {
  neutral: 'border-ink-line',
  good: 'border-accent-good/40',
  warn: 'border-accent-warm/40',
  bad: 'border-accent-bad/40',
  info: 'border-accent/40',
};

const TONE_TEXT: Record<Tone, string> = {
  neutral: 'text-slate-300',
  good: 'text-accent-good',
  warn: 'text-accent-warm',
  bad: 'text-accent-bad',
  info: 'text-accent',
};

const TONE_BG: Record<Tone, string> = {
  neutral: 'bg-ink-soft',
  good: 'bg-accent-good/10',
  warn: 'bg-accent-warm/10',
  bad: 'bg-accent-bad/10',
  info: 'bg-accent/10',
};

export function Card({
  children,
  tone = 'neutral',
  className = '',
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border ${TONE_RING[tone]} ${TONE_BG[tone]} p-5 ${className}`}>
      {children}
    </div>
  );
}

export function SectionTitle({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">{children}</h2>
      {hint && <span className="text-xs text-slate-500">{hint}</span>}
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone = 'neutral',
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: Tone;
}) {
  return (
    <div className={`rounded-lg border ${TONE_RING[tone]} ${TONE_BG[tone]} px-4 py-3`}>
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-xl font-semibold ${TONE_TEXT[tone]}`}>{value}</div>
      {hint && <div className="mt-1 text-xs leading-relaxed text-slate-500">{hint}</div>}
    </div>
  );
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: Tone }) {
  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${TONE_BG[tone]} ${TONE_TEXT[tone]} ring-1 ring-current/30`}
    >
      {children}
    </span>
  );
}

export function Note({ children, tone = 'neutral' }: { children: ReactNode; tone?: Tone }) {
  return (
    <p className={`mt-2 text-xs leading-relaxed ${tone === 'neutral' ? 'text-slate-500' : TONE_TEXT[tone]}`}>
      {children}
    </p>
  );
}

export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-ink-line">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-ink-soft">
            {head.map((h) => (
              <th
                key={h}
                className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-line">{children}</tbody>
      </table>
    </div>
  );
}

export function Td({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <td className={`px-4 py-2.5 align-top text-slate-300 ${className}`}>{children}</td>;
}

/** Horizontal bar, drawn as a div. No chart library, no hydration cost. */
export function Bar({
  value,
  max,
  tone = 'info',
  label,
}: {
  value: number;
  max: number;
  tone?: Tone;
  label?: string;
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const fill: Record<Tone, string> = {
    neutral: 'bg-slate-600',
    good: 'bg-accent-good',
    warn: 'bg-accent-warm',
    bad: 'bg-accent-bad',
    info: 'bg-accent',
  };
  return (
    <div>
      {label && <div className="mb-1 flex justify-between text-xs text-slate-400">
        <span>{label}</span>
        <span className="text-slate-500">{value}</span>
      </div>}
      <div className="h-2 overflow-hidden rounded-full bg-ink-line">
        <div className={`h-full rounded-full ${fill[tone]}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/**
 * A confidence interval, drawn to scale with zero marked.
 *
 * This is the most important graphic in the product: an interval that straddles
 * the zero line is a result nobody may describe as an improvement, and seeing
 * it straddle is far more convincing than reading that it does.
 */
export function IntervalBar({
  lower,
  upper,
  point,
  domain = 0.3,
}: {
  lower: number;
  upper: number;
  point: number;
  domain?: number;
}) {
  const span = Math.max(domain, Math.abs(lower) * 1.2, Math.abs(upper) * 1.2);
  const toPct = (v: number) => ((v + span) / (2 * span)) * 100;
  const crossesZero = lower <= 0 && upper >= 0;

  return (
    <div className="mt-2">
      <div className="relative h-9 rounded-lg bg-ink-line/60">
        {/* the zero line */}
        <div
          className="absolute top-0 h-full w-px bg-slate-500"
          style={{ left: `${toPct(0)}%` }}
          aria-hidden
        />
        {/* the interval */}
        <div
          className={`absolute top-1/2 h-2.5 -translate-y-1/2 rounded-full ${
            crossesZero ? 'bg-accent-warm/60' : 'bg-accent-good/70'
          }`}
          style={{ left: `${toPct(lower)}%`, width: `${toPct(upper) - toPct(lower)}%` }}
        />
        {/* the point estimate */}
        <div
          className="absolute top-1/2 h-4 w-1 -translate-x-1/2 -translate-y-1/2 rounded bg-white"
          style={{ left: `${toPct(point)}%` }}
          aria-hidden
        />
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-slate-500">
        <span>{(lower * 100).toFixed(1)}%</span>
        <span className="text-slate-600">0 — no effect</span>
        <span>{(upper * 100).toFixed(1)}%</span>
      </div>
    </div>
  );
}

export function pct(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits)}%`;
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-ink-line px-5 py-8 text-center text-sm text-slate-500">
      {children}
    </div>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-accent-bad/40 bg-accent-bad/10 px-4 py-3 text-sm text-accent-bad">
      {children}
    </div>
  );
}
