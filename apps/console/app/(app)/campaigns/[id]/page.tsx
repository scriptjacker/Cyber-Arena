import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ApproverSlot, gateOf, reasonText, ROLE_TO_SLOT, type Role } from '@chetna/core';
import { analyticsRepo, buildPreflightContexts, loadGrant, prisma } from '@chetna/db';
import { evaluate, GATES, summarise } from '@chetna/policy';
import { scopeDiff } from '@chetna/audit';
import { can, requireSession, ROLE_LABEL } from '@/lib/session';
import { Badge, Card, Note, SectionTitle, Stat, Table, Td } from '@/components/ui';
import CampaignControls, { RecipientTest } from '@/components/CampaignControls';

export const dynamic = 'force-dynamic';

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireSession();

  const campaign = await prisma.campaign.findUnique({
    where: { id },
    include: {
      rosterImport: true,
      grant: { include: { approvals: true } },
      _count: { select: { assignments: true } },
    },
  });
  if (!campaign || campaign.orgId !== user.orgId) notFound();

  const [grant, contexts, report] = await Promise.all([
    loadGrant(id),
    buildPreflightContexts(id),
    analyticsRepo.campaignReport(id),
  ]);

  const decisions = contexts.map((c) => evaluate(c));
  const summary = summarise(decisions);
  const first = contexts[0];

  const drift =
    grant && first ? scopeDiff(grant.scopeSnapshot, first.liveScope) : ([] as string[]);

  const mySlot = ROLE_TO_SLOT[user.role as Role] ?? null;
  const slotTaken = campaign.grant?.approvals.some((a) => a.approverSlot === mySlot) ?? false;
  const iSigned = campaign.grant?.approvals.some((a) => a.approverId === user.id) ?? false;

  const sendState = await prisma.assignment.groupBy({
    by: ['state'],
    where: { campaignId: id },
    _count: true,
  });

  return (
    <>
      <div className="mb-6">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold text-white">{campaign.name}</h1>
          <Badge tone={campaign.status === 'COMPLETE' ? 'good' : 'info'}>{campaign.status}</Badge>
          {campaign.killSwitch && <Badge tone="bad">kill switch engaged</Badge>}
          <Badge tone={campaign.mode === 'offline' ? 'good' : 'bad'}>{campaign.mode}</Badge>
        </div>
        <p className="mt-1 font-mono text-xs text-slate-600">{campaign.id}</p>
      </div>

      {/* ------------------------------------------------------------- scope */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Roster" value={first?.liveScope.participantCount ?? 0} hint={campaign.rosterImport.filename} />
        <Stat label="Would send now" value={summary.allowed} tone="good" hint={`${summary.blocked} refused`} />
        <Stat label="Holdout" value={`${campaign.holdoutPct}%`} hint="Stratified by department" />
        <Stat
          label="Window"
          value={new Date(campaign.windowStart).toLocaleDateString()}
          hint={`until ${new Date(campaign.windowEnd).toLocaleString()}`}
        />
      </section>

      {/* ------------------------------------------------------- authorization */}
      <section className="mt-8">
        <SectionTitle hint="two signatures, two different people, two different roles">
          Authorization
        </SectionTitle>

        {!campaign.grant ? (
          <Card tone="warn">
            <p className="text-sm text-slate-300">
              No grant exists. This campaign cannot send a single message: gate G1 refuses with{' '}
              <code className="font-mono text-xs">G1_NO_GRANT</code>.
            </p>
          </Card>
        ) : (
          <Card tone={campaign.grant.approvals.length >= 2 && !campaign.grant.revokedAt ? 'good' : 'warn'}>
            <div className="flex flex-wrap items-center gap-3">
              <Badge tone={campaign.grant.approvals.length >= 2 ? 'good' : 'warn'}>
                {campaign.grant.approvals.length} of 2 signatures
              </Badge>
              {campaign.grant.revokedAt && <Badge tone="bad">revoked</Badge>}
              <span className="font-mono text-[11px] text-slate-500">
                scope {campaign.grant.scopeHash.slice(0, 20)}…
              </span>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {[ApproverSlot.SECURITY, ApproverSlot.PEOPLE].map((slot) => {
                const approval = campaign.grant?.approvals.find((a) => a.approverSlot === slot);
                return (
                  <div
                    key={slot}
                    className={`rounded-lg border p-3 ${
                      approval ? 'border-accent-good/40 bg-accent-good/5' : 'border-dashed border-ink-line'
                    }`}
                  >
                    <p className="text-[11px] uppercase tracking-wide text-slate-500">
                      {slot === ApproverSlot.SECURITY ? 'Security approver' : 'People / HR approver'}
                    </p>
                    {approval ? (
                      <>
                        <p className="mt-1 text-sm text-slate-200">{approval.approverId}</p>
                        <p className="text-[11px] text-slate-500">
                          {new Date(approval.signedAt).toLocaleString()}
                        </p>
                        {approval.note && (
                          <p className="mt-1.5 text-[11px] italic leading-relaxed text-slate-400">
                            “{approval.note}”
                          </p>
                        )}
                        <p className="mt-1.5 break-all font-mono text-[9px] text-slate-600">
                          {approval.signatureB64.slice(0, 48)}…
                        </p>
                      </>
                    ) : (
                      <p className="mt-1 text-sm text-slate-500">Not yet signed</p>
                    )}
                  </div>
                );
              })}
            </div>

            {campaign.grant.revokedAt && (
              <Note tone="bad">
                Revoked {new Date(campaign.grant.revokedAt).toLocaleString()} —{' '}
                {campaign.grant.revokedReason}
              </Note>
            )}

            {drift.length > 0 && (
              <div className="mt-4 rounded-lg border border-accent-bad/40 bg-accent-bad/10 p-4">
                <p className="text-sm font-semibold text-accent-bad">
                  Scope drift — the campaign has changed since it was approved
                </p>
                <p className="mt-1 text-xs text-slate-300">
                  The approvers signed a different scope, so every send is refused with{' '}
                  <code className="font-mono">G1_SCOPE_DRIFT</code>. Authorization must be
                  requested again.
                </p>
                <ul className="mt-2 space-y-1">
                  {drift.map((d) => (
                    <li key={d} className="font-mono text-[11px] text-slate-400">
                      {d}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
        )}

        <div className="mt-4">
          <CampaignControls
            campaignId={campaign.id}
            canRequest={can(user.role, 'campaign:write')}
            canSign={Boolean(mySlot) && !slotTaken && !iSigned && Boolean(campaign.grant)}
            signLabel={
              mySlot === ApproverSlot.PEOPLE
                ? 'Sign as People / HR approver'
                : 'Sign as security approver'
            }
            canKill={can(user.role, 'campaign:killswitch')}
            killSwitch={campaign.killSwitch}
            hasGrant={Boolean(campaign.grant)}
          />
          {mySlot && (slotTaken || iSigned) && campaign.grant && (
            <Note>
              {iSigned
                ? `You have already signed this grant as ${ROLE_LABEL[user.role]}. Dual control requires a second person.`
                : 'That approval slot is already filled. The second signature must come from the other side of the business.'}
            </Note>
          )}
          {!mySlot && (
            <Note>
              {ROLE_LABEL[user.role]} cannot sign an authorization grant. A grant needs one
              security approver and one people/HR approver.
            </Note>
          )}
        </div>
      </section>

      {/* ---------------------------------------------------------- preflight */}
      <section className="mt-8">
        <SectionTitle hint={`${summary.total} participants evaluated, nothing sent`}>
          Preflight — the seven gates
        </SectionTitle>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {GATES.map((gate) => {
            const failing = decisions.filter((d) =>
              d.reasons.some((r) => gateOf(r) === gate.n),
            ).length;
            return (
              <div
                key={gate.n}
                className={`rounded-lg border px-4 py-3 ${
                  failing === 0
                    ? 'border-accent-good/40 bg-accent-good/5'
                    : 'border-accent-warm/40 bg-accent-warm/10'
                }`}
              >
                <p className="text-[11px] uppercase tracking-wide text-slate-500">
                  G{gate.n} · {gate.name}
                </p>
                <p
                  className={`mt-0.5 text-sm font-semibold ${
                    failing === 0 ? 'text-accent-good' : 'text-accent-warm'
                  }`}
                >
                  {failing === 0 ? 'pass' : `${failing} refused`}
                </p>
              </div>
            );
          })}
        </div>

        {summary.byReason.length > 0 ? (
          <div className="mt-4">
            <Table head={['Count', 'Reason code', 'What it means']}>
              {summary.byReason.map((r) => (
                <tr key={r.code}>
                  <Td className="font-semibold text-slate-200">{r.count}</Td>
                  <Td className="font-mono text-xs text-accent-warm">{r.code}</Td>
                  <Td className="text-xs">{r.text}</Td>
                </tr>
              ))}
            </Table>
            <Note>
              Every refusal is recorded as an event and an audit entry when the worker reaches it.
              &quot;Nothing happened&quot; and &quot;we refused to do it&quot; are different facts,
              and only one of them is evidence.
            </Note>
          </div>
        ) : (
          <Note tone="good">Every gate passes for every participant on the roster.</Note>
        )}
      </section>

      {/* ------------------------------------------------------ recipient test */}
      {can(user.role, 'campaign:write') && (
        <section className="mt-8">
          <RecipientTest campaignId={campaign.id} />
        </section>
      )}

      {/* ------------------------------------------------------------ delivery */}
      <section className="mt-8">
        <SectionTitle>Delivery</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {sendState.map((s) => (
            <Stat
              key={s.state}
              label={s.state}
              value={s._count}
              tone={s.state === 'BLOCKED' ? 'warn' : s.state === 'FAILED' ? 'bad' : 'neutral'}
            />
          ))}
          {sendState.length === 0 && <Note>No assignments yet.</Note>}
        </div>
      </section>

      {/* ------------------------------------------------------------- results */}
      {report && report.metrics.delivered > 0 && (
        <section className="mt-8">
          <SectionTitle>Results</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Reported" value={report.metrics.reports} tone="good" />
            <Stat label="Failed (human)" value={report.metrics.failures} />
            <Stat
              label="Machine-filtered opens"
              value={report.metrics.machineFiltered}
              hint="Gateways and Apple MPP, excluded from human metrics"
            />
            <Stat
              label="Unconfirmed clicks"
              value={report.metrics.clicksUnconfirmed}
              hint="Link visits with no human interaction — not counted as failures"
            />
          </div>
          <div className="mt-4">
            <Link href="/analytics" className="text-sm text-accent hover:underline">
              Full analytics →
            </Link>
          </div>
        </section>
      )}
    </>
  );
}
