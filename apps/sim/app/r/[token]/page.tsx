import { notFound } from 'next/navigation';
import { formatDuration } from '@chetna/scoring';
import { recordReport } from '@/lib/telemetry';

export const dynamic = 'force-dynamic';

/**
 * The report thank-you page.
 *
 * This is the behaviour the entire programme is built to increase, so the page
 * does three things and nothing else: thank the person without qualification,
 * tell them something true about the effect they just had, and get out of the
 * way.
 *
 * No "but you also clicked", no score, no streak-shaming. The ETH Zurich study
 * showed employees sustain reporting over long periods when it is treated as
 * useful work; NCSC guidance is explicit that blame destroys it.
 */
export default async function ReportPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const result = await recordReport(token);
  if (!result) notFound();

  const { timeToReportMs, rank } = result;
  // Reported DBIR median time-to-report is about 28 minutes. Beating it is
  // worth saying out loud; missing it is never mentioned.
  const beatBenchmark = timeToReportMs !== null && timeToReportMs < 28 * 60_000;

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-4 py-12">
      <div className="rounded-xl border border-accent-good/40 bg-accent-good/10 p-7">
        <div className="flex items-center gap-2.5">
          <span className="rounded bg-accent-good/25 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-accent-good">
            Reported
          </span>
          <span className="text-xs text-slate-400">Thank you — that was exactly right.</span>
        </div>

        <h1 className="mt-4 text-xl font-semibold text-white">
          You spotted an authorized phishing simulation.
        </h1>

        <p className="mt-3 text-sm leading-relaxed text-slate-300">
          Reporting is the single most useful thing anyone can do with a suspicious message. It is
          also the one intervention with strong evidence behind it: a 15-month study of 14,733
          employees found that staff reporting suspicious mail works as a practical, sustainable
          detection system for an organisation — faster than most tooling.
        </p>

        <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-ink-line pt-5 text-sm">
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">You reported it in</dt>
            <dd className="mt-1 text-lg font-semibold text-white">
              {formatDuration(timeToReportMs)}
            </dd>
            {beatBenchmark && (
              <dd className="mt-0.5 text-xs text-accent-good">
                Faster than the reported 28-minute industry median.
              </dd>
            )}
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">Reports of this one</dt>
            <dd className="mt-1 text-lg font-semibold text-white">{rank}</dd>
            <dd className="mt-0.5 text-xs text-slate-500">
              {rank === 1
                ? 'You were the first. The security team now knows about it.'
                : 'Every report makes the next one faster to triage.'}
            </dd>
          </div>
        </dl>
      </div>

      <p className="mt-6 text-xs leading-relaxed text-slate-500">
        If this had been a real attack, your report would have reached the security team with the
        full message, and everyone else who received it could have been warned before opening it.
        Nothing about this is recorded against you, and no individual result is shared with your
        manager.
      </p>
    </main>
  );
}

export const metadata = {
  title: 'Reported — thank you',
  robots: { index: false, follow: false },
};
