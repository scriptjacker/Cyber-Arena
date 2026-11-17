import Link from 'next/link';
import { prisma, runtimeConfig } from '@chetna/db';
import { pageCapability } from '@/lib/session';
import { Note, SectionTitle, Table, Td } from '@/components/ui';

export const dynamic = 'force-dynamic';

/**
 * The participant mailboxes of the controlled test environment.
 *
 * Mail is delivered over real SMTP to a sink bound to 127.0.0.1 and captured
 * here, so the whole journey — inbox, read, click, report — happens on one
 * machine with no possibility of reaching a real person.
 */
export default async function InboxIndex() {
  await pageCapability('inbox:demo');
  const cfg = runtimeConfig();

  const messages = await prisma.message.groupBy({
    by: ['toAddress'],
    _count: true,
    _max: { receivedAt: true },
    orderBy: { _max: { receivedAt: 'desc' } },
    take: 60,
  });

  const participants = await prisma.participant.findMany({
    where: { email: { in: messages.map((m) => m.toAddress) } },
    select: { pid: true, email: true, displayName: true, department: true },
  });
  const byEmail = new Map(participants.map((p) => [p.email ?? '', p]));

  return (
    <>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-white">Participant mailboxes</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-400">
          The controlled test environment. Messages arrive over real SMTP at{' '}
          <code className="font-mono text-xs">
            {cfg.smtpHost}:{cfg.smtpPort}
          </code>{' '}
          — a sink bound to loopback that relays nowhere.
        </p>
      </div>

      {messages.length === 0 ? (
        <Note>
          No mail captured yet. Run <code className="font-mono">npm run chetna -- send</code>, or
          start <code className="font-mono">npm run mailsink</code> and{' '}
          <code className="font-mono">npm run worker</code> together.
        </Note>
      ) : (
        <>
          <SectionTitle hint={`${messages.length} mailboxes with mail`}>Mailboxes</SectionTitle>
          <Table head={['Participant', 'Department', 'Messages', 'Latest']}>
            {messages.map((m) => {
              const p = byEmail.get(m.toAddress);
              return (
                <tr key={m.toAddress}>
                  <Td>
                    {p ? (
                      <Link href={`/inbox/${p.pid}`} className="text-accent hover:underline">
                        {p.displayName ?? p.pid}
                      </Link>
                    ) : (
                      <span className="text-slate-400">{m.toAddress}</span>
                    )}
                    <div className="mt-0.5 font-mono text-[11px] text-slate-600">{m.toAddress}</div>
                  </Td>
                  <Td className="text-xs text-slate-400">{p?.department ?? '—'}</Td>
                  <Td>{m._count}</Td>
                  <Td className="text-xs text-slate-500">
                    {m._max.receivedAt ? new Date(m._max.receivedAt).toLocaleString() : '—'}
                  </Td>
                </tr>
              );
            })}
          </Table>
        </>
      )}
    </>
  );
}
