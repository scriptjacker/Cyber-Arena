import Link from 'next/link';
import { prisma } from '@chetna/db';
import { requireSession } from '@/lib/session';
import { Badge, Note, SectionTitle, Table, Td } from '@/components/ui';

export const dynamic = 'force-dynamic';

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

export default async function CampaignsPage() {
  const user = await requireSession();
  const campaigns = await prisma.campaign.findMany({
    where: { orgId: user.orgId },
    orderBy: { windowStart: 'desc' },
    include: {
      grant: { include: { approvals: true } },
      rosterImport: { select: { filename: true } },
      _count: { select: { assignments: true } },
    },
  });

  return (
    <>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-white">Campaigns</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-400">
          A campaign cannot send on the strength of a status field. It needs two cryptographic
          signatures over a hash of its entire scope — roster, domains, window and templates.
        </p>
      </div>

      <SectionTitle hint={`${campaigns.length} campaigns`}>All campaigns</SectionTitle>
      <Table head={['Campaign', 'Status', 'Authorization', 'Recipients', 'Window', 'Mode']}>
        {campaigns.map((c) => {
          const approvals = c.grant?.approvals.length ?? 0;
          return (
            <tr key={c.id}>
              <Td>
                <Link href={`/campaigns/${c.id}`} className="text-accent hover:underline">
                  {c.name}
                </Link>
                <div className="mt-0.5 text-xs text-slate-500">{c.rosterImport.filename}</div>
              </Td>
              <Td>
                <Badge tone={STATUS_TONE[c.status] ?? 'neutral'}>{c.status}</Badge>
                {c.killSwitch && (
                  <div className="mt-1">
                    <Badge tone="bad">kill switch</Badge>
                  </div>
                )}
              </Td>
              <Td className="text-xs">
                {!c.grant ? (
                  <span className="text-slate-600">no grant</span>
                ) : c.grant.revokedAt ? (
                  <span className="text-accent-bad">revoked</span>
                ) : (
                  <span className={approvals >= 2 ? 'text-accent-good' : 'text-accent-warm'}>
                    {approvals} of 2 signed
                  </span>
                )}
              </Td>
              <Td>{c._count.assignments}</Td>
              <Td className="text-xs text-slate-500">
                {new Date(c.windowStart).toLocaleDateString()} →{' '}
                {new Date(c.windowEnd).toLocaleDateString()}
              </Td>
              <Td>
                <Badge tone={c.mode === 'offline' ? 'good' : 'bad'}>{c.mode}</Badge>
              </Td>
            </tr>
          );
        })}
      </Table>

      <Note>
        Campaign creation is driven by the CLI in this build —{' '}
        <code className="font-mono">npm run demo</code> seeds a roster, a template set and an
        authorized campaign. The wizard is a roadmap item; the authorization, preflight and
        kill-switch controls on each campaign page are fully live.
      </Note>
    </>
  );
}
