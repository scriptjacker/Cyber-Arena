import { prisma } from '@chetna/db';
import { formatDuration, median } from '@chetna/scoring';
import { can, pageCapability } from '@/lib/session';
import { Badge, Card, Note, SectionTitle, Stat, Table, Td } from '@/components/ui';
import TriageControls from '@/components/TriageRow';

export const dynamic = 'force-dynamic';

const BENCHMARK_TTR_MS = 28 * 60_000;

/**
 * The SOC triage queue — employees as a detection sensor network.
 *
 * This page exists because of the one strongly positive finding in the
 * literature: the ETH Zurich study of 14,733 employees over 15 months showed
 * that crowd-sourced reporting detects new campaigns quickly, carries an
 * acceptable operational load, and that people keep doing it for years.
 *
 * Reports are clustered, so twenty reports of the same lure are one piece of
 * work rather than twenty. Time-to-first-report is the number that matters:
 * it is the length of the window in which an attacker is operating unnoticed.
 */
export default async function TriagePage() {
  const user = await pageCapability('triage:read');

  const reports = await prisma.reportTriage.findMany({
    where: { orgId: user.orgId },
    orderBy: { firstReportAt: 'desc' },
    take: 200,
    include: {
      campaign: { select: { name: true } },
      seededThreat: { select: { label: true, subject: true } },
    },
  });

  // Cluster, so the queue shows campaigns rather than individual reports.
  const clusters = new Map<
    string,
    {
      key: string;
      label: string;
      kind: 'simulation' | 'real' | 'unknown';
      count: number;
      firstAt: Date;
      times: number[];
      unreviewed: number;
      sample: (typeof reports)[number];
    }
  >();

  for (const r of reports) {
    const existing = clusters.get(r.clusterKey);
    const label = r.seededThreat?.label ?? r.campaign?.name ?? r.clusterKey;
    const kind: 'simulation' | 'real' | 'unknown' = r.seededThreatId
      ? 'real'
      : r.campaignId
        ? 'simulation'
        : 'unknown';

    if (!existing) {
      clusters.set(r.clusterKey, {
        key: r.clusterKey,
        label,
        kind,
        count: 1,
        firstAt: r.firstReportAt,
        times: r.timeToReportMs !== null ? [r.timeToReportMs] : [],
        unreviewed: r.verdict === 'UNREVIEWED' ? 1 : 0,
        sample: r,
      });
    } else {
      existing.count += 1;
      if (r.timeToReportMs !== null) existing.times.push(r.timeToReportMs);
      if (r.verdict === 'UNREVIEWED') existing.unreviewed += 1;
      if (r.firstReportAt < existing.firstAt) existing.firstAt = r.firstReportAt;
    }
  }

  const list = [...clusters.values()].sort((a, b) => b.firstAt.getTime() - a.firstAt.getTime());
  const allTimes = reports.map((r) => r.timeToReportMs).filter((v): v is number => v !== null);
  const fastest = allTimes.length > 0 ? Math.min(...allTimes) : null;
  const realThreats = reports.filter((r) => r.verdict === 'REAL_THREAT').length;
  const unreviewed = reports.filter((r) => r.verdict === 'UNREVIEWED').length;

  return (
    <>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-white">Reports</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-400">
          Your people as a detection sensor network. This is the one intervention with strong
          evidence behind it, and the queue is built so twenty reports of the same lure are one
          piece of work rather than twenty.
        </p>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Reports received" value={reports.length} tone="good" />
        <Stat
          label="Median time to report"
          value={formatDuration(median(allTimes))}
          tone={
            median(allTimes) !== null && (median(allTimes) ?? 0) < BENCHMARK_TTR_MS
              ? 'good'
              : 'warn'
          }
          hint="Reported industry median is 28 minutes"
        />
        <Stat
          label="Fastest report"
          value={formatDuration(fastest)}
          hint="The start of the window in which an attacker is unnoticed"
        />
        <Stat
          label="Real threats found"
          value={realThreats}
          tone={realThreats > 0 ? 'bad' : 'neutral'}
          hint={`${unreviewed} awaiting review`}
        />
      </section>

      <SectionTitle hint={`${list.length} clusters`}>Queue</SectionTitle>

      {list.length === 0 ? (
        <Note>No reports yet.</Note>
      ) : (
        <div className="space-y-4">
          {list.map((c) => (
            <Card key={c.key} tone={c.kind === 'real' ? 'bad' : 'neutral'}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-white">{c.label}</p>
                    <Badge tone={c.kind === 'real' ? 'bad' : 'info'}>
                      {c.kind === 'real' ? 'genuine campaign' : 'simulation'}
                    </Badge>
                    {c.unreviewed > 0 && <Badge tone="warn">{c.unreviewed} unreviewed</Badge>}
                  </div>
                  <p className="mt-1 font-mono text-[11px] text-slate-600">{c.key}</p>
                  {c.sample.seededThreat && (
                    <p className="mt-1 text-xs text-slate-400">
                      Subject: {c.sample.seededThreat.subject}
                    </p>
                  )}
                </div>
                <div className="text-right text-xs">
                  <p className="text-slate-300">
                    <span className="text-lg font-semibold text-white">{c.count}</span> reports
                  </p>
                  <p className="mt-0.5 text-slate-500">
                    first at {new Date(c.firstAt).toLocaleString()}
                  </p>
                  <p className="text-slate-500">
                    median {formatDuration(median(c.times))}
                  </p>
                </div>
              </div>

              <div className="mt-4 border-t border-ink-line pt-3">
                <p className="text-[11px] uppercase tracking-wide text-slate-500">
                  Verdict for this cluster&apos;s most recent report
                </p>
                <div className="mt-2">
                  <TriageControls
                    reportId={c.sample.id}
                    current={c.sample.verdict}
                    canWrite={can(user.role, 'triage:write')}
                  />
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Note>
        Reporters are never named on this page. A report is information about a message, not a
        record about a person — and treating it otherwise is the fastest way to stop people
        reporting at all.
      </Note>
    </>
  );
}
