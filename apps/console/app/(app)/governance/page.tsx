import { auditRepo, prisma, runtimeConfig } from '@chetna/db';
import { DEFAULT_RETENTION_DAYS, RETENTION_RATIONALE } from '@chetna/privacy';
import type { DataClass } from '@chetna/core';
import { can, pageCapability } from '@/lib/session';
import { Badge, Card, Note, SectionTitle, Stat, Table, Td } from '@/components/ui';
import { ChainVerifier, DsarTool, PurgeTool } from '@/components/GovernanceTools';

export const dynamic = 'force-dynamic';

export default async function GovernancePage() {
  const user = await pageCapability('governance:read');
  const cfg = runtimeConfig();

  const [entries, total, attestation, receipts, dsars, rules] = await Promise.all([
    auditRepo.list(40, user.orgId),
    auditRepo.count(),
    prisma.safetyAttestation.findFirst({ orderBy: { createdAt: 'desc' } }),
    prisma.purgeReceipt.findMany({ orderBy: { runAt: 'desc' }, take: 8 }),
    prisma.dsarRequest.findMany({ orderBy: { requestedAt: 'desc' }, take: 8 }),
    prisma.retentionRule.findMany({ where: { orgId: user.orgId } }),
  ]);

  let verdict: string | null = null;
  if (attestation) {
    try {
      verdict = (JSON.parse(attestation.documentJson) as { summary: { verdict: string } }).summary
        .verdict;
    } catch {
      verdict = null;
    }
  }

  const refusals = entries.filter((e) => e.action === 'send.blocked').length;

  return (
    <>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-white">Governance</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-400">
          The accountability surface: a tamper-evident record of everything that happened —
          including everything that was refused — plus the retention job and data-subject requests.
        </p>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Audit entries" value={total} hint="Append-only, hash-chained" />
        <Stat
          label="Refusals recorded"
          value={refusals}
          hint="In the last 40 entries. A refusal is evidence, not an absence."
        />
        <Stat
          label="Attestation"
          value={verdict ?? 'not run'}
          tone={verdict === 'ATTESTED' ? 'good' : verdict === 'FAILED' ? 'bad' : 'warn'}
          hint={attestation ? new Date(attestation.createdAt).toLocaleString() : undefined}
        />
        <Stat
          label="Mode"
          value={cfg.mode}
          tone={cfg.mode === 'offline' ? 'good' : 'bad'}
          hint="Part of the signed campaign scope — gate G7"
        />
      </section>

      {/* ------------------------------------------------------- chain verify */}
      <section className="mt-8">
        <SectionTitle hint="run it; do not take our word for it">Audit chain</SectionTitle>
        <Card>
          <ChainVerifier />
        </Card>
      </section>

      {/* ------------------------------------------------------------- log */}
      <section className="mt-8">
        <SectionTitle hint="most recent first">Recent activity</SectionTitle>
        <Table head={['Seq', 'When', 'Actor', 'Action', 'Reason']}>
          {entries.map((e) => (
            <tr key={e.seq}>
              <Td className="font-mono text-xs text-slate-500">{e.seq}</Td>
              <Td className="text-xs text-slate-500">{new Date(e.at).toLocaleString()}</Td>
              <Td className="text-xs">
                {e.actorId ?? <span className="text-slate-600">system</span>}
                {e.actorRole && <div className="text-slate-600">{e.actorRole}</div>}
              </Td>
              <Td className="text-xs">
                <span
                  className={
                    e.action.includes('blocked') || e.action.includes('rejected')
                      ? 'text-accent-warm'
                      : e.action.includes('revoked') || e.action.includes('failed')
                        ? 'text-accent-bad'
                        : 'text-slate-300'
                  }
                >
                  {e.action}
                </span>
              </Td>
              <Td className="font-mono text-[11px] text-slate-500">{e.reasonCode ?? '—'}</Td>
            </tr>
          ))}
        </Table>
      </section>

      {/* --------------------------------------------------------- retention */}
      <section className="mt-8">
        <SectionTitle hint="deletion writes its own evidence">Retention</SectionTitle>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <h3 className="text-sm font-semibold text-white">Schedule</h3>
            <ul className="mt-3 space-y-2.5">
              {(Object.keys(DEFAULT_RETENTION_DAYS) as DataClass[]).map((cls) => {
                const rule = rules.find((r) => r.dataClass === cls);
                return (
                  <li key={cls} className="text-xs">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-mono text-slate-300">{cls}</span>
                      <span className="text-slate-400">
                        {rule?.retainDays ?? DEFAULT_RETENTION_DAYS[cls]} days
                        {cls === 'AUDIT' && (
                          <span className="ml-1.5 text-accent-good">never auto-purged</span>
                        )}
                      </span>
                    </div>
                    <p className="mt-0.5 leading-relaxed text-slate-600">
                      {RETENTION_RATIONALE[cls]}
                    </p>
                  </li>
                );
              })}
            </ul>
          </Card>

          <div className="space-y-4">
            <Card>
              <h3 className="text-sm font-semibold text-white">Run the job</h3>
              <div className="mt-3">
                <PurgeTool canRun={can(user.role, 'retention:run')} />
              </div>
            </Card>

            {receipts.length > 0 && (
              <Card>
                <h3 className="text-sm font-semibold text-white">Purge receipts</h3>
                <ul className="mt-3 space-y-1.5 text-xs">
                  {receipts.map((r) => (
                    <li key={r.id} className="flex items-baseline justify-between gap-2">
                      <span className="font-mono text-slate-400">{r.dataClass}</span>
                      <span className="text-slate-500">
                        {r.rowsDeleted} {r.dryRun ? '(dry run)' : 'erased'} ·{' '}
                        {new Date(r.runAt).toLocaleDateString()}
                        {r.auditSeq && (
                          <span className="ml-1.5 text-slate-600">audit #{r.auditSeq}</span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------------- DSAR */}
      <section className="mt-8">
        <SectionTitle hint="access and erasure">Data-subject requests</SectionTitle>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <DsarTool canRun={can(user.role, 'dsar:run')} />
          </Card>
          <Card>
            <h3 className="text-sm font-semibold text-white">Recent requests</h3>
            {dsars.length === 0 ? (
              <Note>No requests yet.</Note>
            ) : (
              <ul className="mt-3 space-y-1.5 text-xs">
                {dsars.map((d) => (
                  <li key={d.id} className="flex items-baseline justify-between gap-2">
                    <span className="font-mono text-slate-400">{d.kind}</span>
                    <span className="text-slate-500">
                      {d.status} · {new Date(d.requestedAt).toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <Note>
              An erasure nulls the contact fields and tombstones the participant while retaining
              aggregate counts. That is the lawful outcome and the honest one at once: the person is
              gone, and historical analytics do not silently change.
            </Note>
          </Card>
        </div>
      </section>

      {/* ------------------------------------------------------- attestation */}
      {attestation && (
        <section className="mt-8">
          <SectionTitle>Non-collection attestation</SectionTitle>
          <Card tone={verdict === 'ATTESTED' ? 'good' : 'warn'}>
            <div className="flex flex-wrap items-center gap-3">
              <Badge tone={verdict === 'ATTESTED' ? 'good' : 'warn'}>{verdict}</Badge>
              <span className="text-xs text-slate-400">
                {attestation.templatesRun} templates × {attestation.rulesRun} rules ·{' '}
                {attestation.failures} failing · canary{' '}
                {attestation.canaryPassed ? 'rejected as required' : 'NOT REJECTED'}
              </span>
            </div>
            <p className="mt-3 text-xs text-slate-500">
              The full signed document, including the source scan of the simulation surface, is
              published at{' '}
              <a
                href={`${cfg.simUrl}/attest`}
                target="_blank"
                rel="noreferrer noopener"
                className="text-accent underline decoration-dotted"
              >
                {cfg.simUrl}/attest
              </a>
              .
            </p>
          </Card>
        </section>
      )}
    </>
  );
}
