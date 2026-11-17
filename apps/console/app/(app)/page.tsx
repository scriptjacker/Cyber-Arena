import Link from 'next/link';
import { analyticsRepo, prisma } from '@chetna/db';
import { formatDuration } from '@chetna/scoring';
import { requireSession } from '@/lib/session';
import { Badge, Bar, Card, Empty, IntervalBar, Note, SectionTitle, Stat, Table, Td, pct } from '@/components/ui';

export const dynamic = 'force-dynamic';

/** Reported DBIR median time-to-report, used as the benchmark line. */
const BENCHMARK_TTR_MS = 28 * 60_000;

const STATUS_TONE: Record<string, 'neutral' | 'good' | 'warn' | 'bad' | 'info'> = {
  DRAFT: 'neutral',
  PENDING_AUTH: 'warn',
  AUTHORIZED: 'info',
  RUNNING: 'info',
  PAUSED: 'warn',
  COMPLETE: 'good',
  REJECTED: 'bad',
  PURGED: 'neutral',
};

export default async function Overview() {
  const user = await requireSession();
  const [posture, trend, campaigns] = await Promise.all([
    analyticsRepo.safetyPosture(user.orgId),
    analyticsRepo.programmeTrend(user.orgId),
    prisma.campaign.findMany({
      where: { orgId: user.orgId },
      orderBy: { windowStart: 'desc' },
      include: { grant: { include: { approvals: true } }, _count: { select: { assignments: true } } },
    }),
  ]);

  const latest = trend[trend.length - 1];
  const first = trend[0];
  const latestReport = latest ? await analyticsRepo.campaignReport(latest.campaignId) : null;

  return (
    <>
      <div className="mb-7">
        <h1 className="text-xl font-semibold text-white">Programme overview</h1>
        <p className="mt-1 text-sm text-slate-400">
          The headline figure here is <strong className="text-slate-200">report rate</strong>, not
          click rate. Reporting is the behaviour with evidence behind it, and the one that shortens
          an attacker&apos;s window.
        </p>
      </div>

      {/* --------------------------------------------------- headline metrics */}
      {latest ? (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="Report rate"
            value={pct(latest.reportRate)}
            tone="good"
            hint={
              first && first !== latest
                ? `${pct(first.reportRate, 0)} at programme start — the leading indicator`
                : 'Share of recipients who reported the message'
            }
          />
          <Stat
            label="Median time to report"
            value={formatDuration(latest.medianTimeToReportMs)}
            tone={
              latest.medianTimeToReportMs !== null && latest.medianTimeToReportMs < BENCHMARK_TTR_MS
                ? 'good'
                : 'warn'
            }
            hint="Against a reported industry median of 28 minutes"
          />
          <Stat
            label="Resilience ratio"
            value={latest.resilienceRatio.toFixed(2)}
            hint="Reports ÷ (reports + failures)"
          />
          <Stat
            label="Difficulty-adjusted failures"
            value={pct(latest.difficultyAdjustedFailureRate)}
            tone="neutral"
            hint={`Raw rate ${pct(latest.failureRate)} — adjusted using the NIST Phish Scale so easy lures cannot flatter the number`}
          />
        </section>
      ) : (
        <Empty>
          No completed campaign yet. Run <code className="font-mono">npm run demo</code> to seed the
          controlled test environment.
        </Empty>
      )}

      {/* ------------------------------------------------------ holdout result */}
      {latestReport && latestReport.holdout.treatment.n > 0 && (
        <section className="mt-8">
          <SectionTitle hint={latestReport.name}>Did the training work?</SectionTitle>
          <Card tone={latestReport.holdout.significant ? 'good' : 'warn'}>
            <div className="flex flex-wrap items-center gap-3">
              <Badge tone={latestReport.holdout.significant ? 'good' : 'warn'}>
                {latestReport.holdout.significant ? 'Effect detected' : 'No significant effect'}
              </Badge>
              <span className="text-xs text-slate-400">
                {latestReport.holdout.treatment.x}/{latestReport.holdout.treatment.n} trained failed
                · {latestReport.holdout.holdout.x}/{latestReport.holdout.holdout.n} holdout failed
              </span>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-slate-200">
              {latestReport.holdout.verdict}
            </p>
            <IntervalBar
              lower={latestReport.holdout.differenceCi95.lower}
              upper={latestReport.holdout.differenceCi95.upper}
              point={latestReport.holdout.difference}
            />
            <Note>
              Every campaign randomises a stratified holdout arm that receives no feedback. When the
              95% interval crosses zero, this platform says so rather than reporting the point
              estimate as an improvement.
            </Note>
          </Card>
        </section>
      )}

      {/* ---------------------------------------------------------- the trend */}
      {trend.length > 1 && (
        <section className="mt-8">
          <SectionTitle hint="completed campaigns, oldest first">Programme trend</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2">
            <Card>
              <p className="text-xs uppercase tracking-wide text-slate-500">Report rate</p>
              <div className="mt-3 space-y-3">
                {trend.map((t) => (
                  <Bar
                    key={t.campaignId}
                    value={Math.round(t.reportRate * 100)}
                    max={100}
                    tone="good"
                    label={t.name}
                  />
                ))}
              </div>
              <Note>Rising first is the expected pattern: people start reporting before they stop clicking.</Note>
            </Card>
            <Card>
              <p className="text-xs uppercase tracking-wide text-slate-500">
                Difficulty-adjusted failure rate
              </p>
              <div className="mt-3 space-y-3">
                {trend.map((t) => (
                  <Bar
                    key={t.campaignId}
                    value={Math.round(t.difficultyAdjustedFailureRate * 100)}
                    max={100}
                    tone="warn"
                    label={t.name}
                  />
                ))}
              </div>
              <Note>Adjusted, so sending easier lures cannot produce an improvement.</Note>
            </Card>
          </div>
        </section>
      )}

      {/* -------------------------------------------------------- safety posture */}
      <section className="mt-8">
        <SectionTitle hint="what stops this platform being misused">Safety posture</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="Non-collection attestation"
            value={posture.attestationVerdict ?? 'not run'}
            tone={
              posture.attestationVerdict === 'ATTESTED'
                ? 'good'
                : posture.attestationVerdict === 'FAILED'
                  ? 'bad'
                  : 'warn'
            }
            hint={
              posture.attestationAt
                ? `Signed ${new Date(posture.attestationAt).toLocaleString()}`
                : 'Run npm run verify:safety'
            }
          />
          <Stat
            label="Audit entries"
            value={posture.auditEntries}
            hint="Hash-chained and append-only, including every refusal"
          />
          <Stat
            label="Lures blocked on ethical grounds"
            value={`${posture.templatesBlocked} of ${posture.templatesTotal}`}
            tone={posture.templatesBlocked > 0 ? 'warn' : 'neutral'}
            hint="Blocked at authoring time, overridable only by People/HR"
          />
          <Stat
            label="Opt-outs honoured"
            value={`${posture.optedOut} of ${posture.participants}`}
            hint={`${posture.suppressions} suppression rules active · ${posture.domainsVerified} domains verified`}
          />
        </div>
        {posture.templatesFailingLint > 0 && (
          <Note tone="bad">
            {posture.templatesFailingLint} template(s) currently fail safety linting and cannot be
            sent by gate G5.
          </Note>
        )}
      </section>

      {/* ------------------------------------------------------------ campaigns */}
      <section className="mt-8">
        <SectionTitle>Campaigns</SectionTitle>
        <Table head={['Campaign', 'Status', 'Approvals', 'Recipients', 'Window']}>
          {campaigns.map((c) => (
            <tr key={c.id}>
              <Td>
                <Link href={`/campaigns/${c.id}`} className="text-accent hover:underline">
                  {c.name}
                </Link>
                <div className="mt-0.5 font-mono text-[11px] text-slate-600">{c.id}</div>
              </Td>
              <Td>
                <Badge tone={STATUS_TONE[c.status] ?? 'neutral'}>{c.status}</Badge>
                {c.killSwitch && (
                  <div className="mt-1">
                    <Badge tone="bad">kill switch on</Badge>
                  </div>
                )}
              </Td>
              <Td>
                {c.grant ? (
                  <span className={c.grant.approvals.length >= 2 ? 'text-accent-good' : 'text-accent-warm'}>
                    {c.grant.approvals.length} of 2
                  </span>
                ) : (
                  <span className="text-slate-600">none</span>
                )}
              </Td>
              <Td>{c._count.assignments}</Td>
              <Td className="text-xs text-slate-500">
                {new Date(c.windowStart).toLocaleDateString()} →{' '}
                {new Date(c.windowEnd).toLocaleDateString()}
              </Td>
            </tr>
          ))}
        </Table>
      </section>
    </>
  );
}
