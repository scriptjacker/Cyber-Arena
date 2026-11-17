import Link from 'next/link';
import { CampaignStatus } from '@chetna/core';
import { analyticsRepo, prisma, runtimeConfig } from '@chetna/db';
import { formatDuration } from '@chetna/scoring';
import { guardCohorts } from '@chetna/privacy';
import { DIFFICULTY_LABEL } from '@chetna/phishscale';
import { pageCapability } from '@/lib/session';
import { Badge, Bar, Card, Empty, IntervalBar, Note, SectionTitle, Stat, Table, Td, pct } from '@/components/ui';

export const dynamic = 'force-dynamic';

const DIMENSIONS = ['department', 'roleArchetype', 'locale', 'difficulty'] as const;
type Dimension = (typeof DIMENSIONS)[number];

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ campaign?: string; by?: string }>;
}) {
  const user = await pageCapability('analytics:read');
  const sp = await searchParams;
  const cfg = runtimeConfig();

  const campaigns = await prisma.campaign.findMany({
    where: { orgId: user.orgId, status: { in: [CampaignStatus.COMPLETE, CampaignStatus.RUNNING] } },
    orderBy: { windowStart: 'desc' },
    select: { id: true, name: true, status: true },
  });

  const selectedId = sp.campaign ?? campaigns[0]?.id;
  const dimension: Dimension = DIMENSIONS.includes(sp.by as Dimension)
    ? (sp.by as Dimension)
    : 'department';

  if (!selectedId) {
    return (
      <Empty>
        No campaign has results yet. Run <code className="font-mono">npm run demo</code>.
      </Empty>
    );
  }

  const [report, rows, mix] = await Promise.all([
    analyticsRepo.campaignReport(selectedId),
    analyticsRepo.cohortRows(selectedId, dimension),
    analyticsRepo.difficultyMix(selectedId),
  ]);
  if (!report) return <Empty>That campaign could not be loaded.</Empty>;

  // THE guard. k=5 by default, floored at 3, with complementary suppression.
  const guarded = guardCohorts(rows, cfg.kAnon);
  const m = report.metrics;
  const maxCohort = Math.max(1, ...rows.map((r) => r.cohortSize));

  return (
    <>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-white">Analytics</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-400">
          Difficulty-adjusted, machine-filtered, and suppressed below{' '}
          <strong className="text-slate-200">k = {cfg.kAnon}</strong>. Individual results are
          visible only to the individual — there is no endpoint here that returns one.
        </p>
      </div>

      {/* --------------------------------------------------------- selectors */}
      <div className="mb-6 flex flex-wrap gap-2">
        {campaigns.map((c) => (
          <Link
            key={c.id}
            href={`/analytics?campaign=${c.id}&by=${dimension}`}
            className={`rounded-lg border px-3 py-1.5 text-xs transition ${
              c.id === selectedId
                ? 'border-accent bg-accent/15 text-accent'
                : 'border-ink-line text-slate-400 hover:border-accent/50'
            }`}
          >
            {c.name}
          </Link>
        ))}
      </div>

      {/* ----------------------------------------------------------- headline */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Delivered" value={m.delivered} />
        <Stat label="Reported" value={`${m.reports} · ${pct(m.reportRate)}`} tone="good" />
        <Stat
          label="Failed (human)"
          value={`${m.failures} · ${pct(m.failureRate)}`}
          hint={`Difficulty-adjusted: ${pct(m.difficultyAdjustedFailureRate)}`}
        />
        <Stat
          label="Resilience ratio"
          value={m.resilienceRatio.toFixed(2)}
          hint="Reports ÷ (reports + failures)"
        />
      </section>

      {/* ------------------------------------------------- honest telemetry */}
      <section className="mt-8">
        <SectionTitle hint="what other platforms count as engagement">
          Telemetry, honestly
        </SectionTitle>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Pixel loads" value={m.probableOpens} hint="Recorded as probable opens" />
          <Stat
            label="Attributed to machines"
            value={m.machineFiltered}
            tone="warn"
            hint="Secure email gateways and Apple Mail Privacy Protection"
          />
          <Stat label="Human opens" value={m.humanOpens} tone="good" />
          <Stat
            label="Unconfirmed clicks"
            value={m.clicksUnconfirmed}
            hint="Link visits with no human interaction — NOT counted as failures"
          />
        </div>
        <Note>
          Apple Mail Privacy Protection prefetches tracking pixels through a proxy and security
          gateways visit every link, so a raw open or click count is not a measure of people. These
          are excluded from every human metric above and published here rather than quietly
          dropped.
        </Note>
      </section>

      {/* --------------------------------------------------------- holdout */}
      {report.holdout.treatment.n > 0 && (
        <section className="mt-8">
          <SectionTitle hint="the question most platforms never ask">
            Did the training work?
          </SectionTitle>
          <Card tone={report.holdout.significant ? 'good' : 'warn'}>
            <div className="flex flex-wrap items-center gap-3">
              <Badge tone={report.holdout.significant ? 'good' : 'warn'}>
                {report.holdout.significant ? 'Effect detected' : 'No significant effect'}
              </Badge>
              <span className="text-xs text-slate-400">
                trained {report.holdout.treatment.x}/{report.holdout.treatment.n} · holdout{' '}
                {report.holdout.holdout.x}/{report.holdout.holdout.n}
              </span>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-slate-200">{report.holdout.verdict}</p>
            <IntervalBar
              lower={report.holdout.differenceCi95.lower}
              upper={report.holdout.differenceCi95.upper}
              point={report.holdout.difference}
            />
            <Note>
              A stratified holdout arm receives no feedback. The bar is the 95% Newcombe interval
              for the difference in failure rate; the white mark is the point estimate. When the
              interval covers zero, no improvement may be claimed from this campaign.
            </Note>
          </Card>
        </section>
      )}

      {/* ---------------------------------------------------- cohort breakdown */}
      <section className="mt-8">
        <SectionTitle hint={`k = ${cfg.kAnon}, hard floor 3`}>
          Cohorts — {analyticsRepo.dimensionLabel(dimension)}
        </SectionTitle>

        <div className="mb-4 flex flex-wrap gap-2">
          {DIMENSIONS.map((d) => (
            <Link
              key={d}
              href={`/analytics?campaign=${selectedId}&by=${d}`}
              className={`rounded-lg border px-3 py-1.5 text-xs transition ${
                d === dimension
                  ? 'border-accent bg-accent/15 text-accent'
                  : 'border-ink-line text-slate-400 hover:border-accent/50'
              }`}
            >
              {analyticsRepo.dimensionLabel(d)}
            </Link>
          ))}
        </div>

        {!guarded.ok ? (
          <Card tone="warn">
            <p className="text-sm font-semibold text-accent-warm">Suppressed entirely</p>
            <p className="mt-2 text-sm text-slate-300">{guarded.reason}</p>
          </Card>
        ) : (
          <>
            <Table head={['Cohort', 'People', 'Reported', 'Failed', 'Machine-filtered', 'Report rate']}>
              {guarded.data.rows.map((r) => (
                <tr key={r.key}>
                  <Td className="text-slate-200">
                    {dimension === 'difficulty'
                      ? (DIFFICULTY_LABEL[r.label as keyof typeof DIFFICULTY_LABEL] ?? r.label)
                      : r.label}
                  </Td>
                  <Td>{r.cohortSize}</Td>
                  <Td className="text-accent-good">{r.reports}</Td>
                  <Td>{r.failures}</Td>
                  <Td className="text-slate-500">{r.machineFiltered}</Td>
                  <Td>
                    <div className="w-32">
                      <Bar
                        value={Math.round((r.reports / Math.max(1, r.cohortSize)) * 100)}
                        max={100}
                        tone="good"
                      />
                    </div>
                  </Td>
                </tr>
              ))}
              {guarded.data.hidden.aggregate && (
                <tr className="opacity-60">
                  <Td className="italic text-slate-400">{guarded.data.hidden.aggregate.label}</Td>
                  <Td>{guarded.data.hidden.aggregate.cohortSize}</Td>
                  <Td>{guarded.data.hidden.aggregate.reports}</Td>
                  <Td>{guarded.data.hidden.aggregate.failures}</Td>
                  <Td className="text-slate-500">
                    {guarded.data.hidden.aggregate.machineFiltered}
                  </Td>
                  <Td>—</Td>
                </tr>
              )}
            </Table>

            {guarded.data.hidden.count > 0 && (
              <Card tone="warn" className="mt-4">
                <p className="text-sm font-semibold text-accent-warm">
                  {guarded.data.hidden.count} cohort(s) withheld
                </p>
                <p className="mt-2 text-sm leading-relaxed text-slate-300">
                  {guarded.data.hidden.reason}
                </p>
                <Note>
                  The withheld cohorts are not named, because naming a withheld group can identify
                  it. When only one group falls below the threshold, a second is withheld too —
                  otherwise the first could be recovered by subtracting the visible rows from the
                  published total.
                </Note>
              </Card>
            )}
          </>
        )}
      </section>

      {/* ---------------------------------------------------- difficulty mix */}
      <section className="mt-8">
        <SectionTitle hint="so the numbers above can be read in context">
          Difficulty mix
        </SectionTitle>
        <Card>
          <div className="space-y-3">
            {Object.entries(mix)
              .sort((a, b) => b[1] - a[1])
              .map(([difficulty, count]) => (
                <Bar
                  key={difficulty}
                  value={count}
                  max={maxCohort}
                  tone="info"
                  label={DIFFICULTY_LABEL[difficulty as keyof typeof DIFFICULTY_LABEL] ?? difficulty}
                />
              ))}
          </div>
          <Note>
            A programme that only sends easy lures produces a flattering failure rate. That is why
            the adjusted figure exists, and why this chart sits next to it.
          </Note>
        </Card>
      </section>

      <section className="mt-8">
        <SectionTitle>Timing</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat
            label="Median time to report"
            value={formatDuration(m.medianTimeToReportMs)}
            hint="Reported industry median: 28 minutes"
          />
          <Stat
            label="Training completion"
            value={pct(Math.min(1, m.trainingCompletionRate))}
            hint="Of those who failed. Completion, not delivery — that is what the evidence tracks."
          />
          <Stat label="Would-have-submitted" value={m.submitIntents} hint="No credential collected" />
        </div>
      </section>
    </>
  );
}
