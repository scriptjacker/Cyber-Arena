import { notFound } from 'next/navigation';
import { runtimeConfig, prisma } from '@chetna/db';
import { sanitizeEmailHtml } from '@chetna/safety-lint';
import { bandOf, BAND_LABEL } from '@chetna/scoring';
import { pageCapability } from '@/lib/session';
import { Badge, Card, Note, SectionTitle, Stat } from '@/components/ui';

export const dynamic = 'force-dynamic';

/**
 * One participant's mailbox.
 *
 * Two things to notice:
 *
 *  - The captured message body is rendered through the same allowlist
 *    sanitiser the teachable moment uses. It arrived over SMTP from our own
 *    worker, but "we generated it" is not a security property, and a webmail
 *    client that trusts message HTML is how mail clients get exploited.
 *
 *  - The Report button is a plain link to the simulation surface's /r/<token>
 *    endpoint — the exact path a real Outlook or Gmail report add-in posts to.
 *    The demo and the production integration are the same code path.
 */
export default async function Mailbox({ params }: { params: Promise<{ pid: string }> }) {
  const { pid } = await params;
  await pageCapability('inbox:demo');
  const cfg = runtimeConfig();

  const participant = await prisma.participant.findUnique({
    where: { pid },
    select: {
      pid: true,
      email: true,
      displayName: true,
      department: true,
      roleArchetype: true,
      resilienceRating: true,
      optedOutAt: true,
      lastSimulatedAt: true,
    },
  });
  if (!participant?.email) notFound();

  const messages = await prisma.message.findMany({
    where: { toAddress: participant.email },
    orderBy: { receivedAt: 'desc' },
    take: 20,
    include: {
      assignment: {
        select: {
          token: true,
          template: { select: { name: true, difficulty: true } },
          events: { select: { type: true }, orderBy: { at: 'asc' } },
        },
      },
    },
  });

  const band = bandOf(participant.resilienceRating);

  return (
    <>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-white">{participant.displayName}</h1>
        <p className="mt-1 text-sm text-slate-400">
          {participant.roleArchetype} · {participant.department} ·{' '}
          <span className="font-mono text-xs">{participant.email}</span>
        </p>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Resilience band"
          value={BAND_LABEL[band]}
          hint="Shown as a band, never a number — a number invites ranking"
        />
        <Stat label="Messages captured" value={messages.length} />
        <Stat
          label="Last simulated"
          value={
            participant.lastSimulatedAt
              ? new Date(participant.lastSimulatedAt).toLocaleDateString()
              : 'never'
          }
          hint={`${cfg.cooldownDays}-day cooldown enforced by gate G4`}
        />
        <Stat
          label="Opted out"
          value={participant.optedOutAt ? 'yes' : 'no'}
          tone={participant.optedOutAt ? 'warn' : 'neutral'}
          hint={participant.optedOutAt ? 'All further sends refused at G4' : undefined}
        />
      </section>

      <SectionTitle hint="newest first">Inbox</SectionTitle>

      {messages.length === 0 && <Note>No mail captured for this participant yet.</Note>}

      <div className="space-y-5">
        {messages.map((m) => {
          const safe = sanitizeEmailHtml(m.html);
          const types = new Set(m.assignment?.events.map((e) => e.type) ?? []);
          const headers = JSON.parse(m.headersJson || '{}') as Record<string, string>;
          const token = m.assignment?.token;

          return (
            <Card key={m.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">{m.subject}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    from <span className="font-mono">{m.fromAddress}</span> ·{' '}
                    {new Date(m.receivedAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {m.reportedAt && <Badge tone="good">reported</Badge>}
                  {types.has('CLICK_CONFIRMED') && <Badge tone="bad">clicked</Badge>}
                  {types.has('SUBMIT_INTENT') && <Badge tone="bad">would have signed in</Badge>}
                  {types.has('PROBABLE_OPEN') && <Badge tone="neutral">opened</Badge>}
                  {m.assignment?.template && (
                    <Badge tone="info">{m.assignment.template.difficulty}</Badge>
                  )}
                </div>
              </div>

              {/* Captured message, sanitised. Links are live: they point at the
                  simulation surface, which is how the journey is demonstrated. */}
              <div className="mt-4 overflow-hidden rounded-lg border border-ink-line bg-white">
                <div
                  className="px-4 py-4 text-sm text-slate-800 [&_a]:text-blue-700 [&_a]:underline"
                  dangerouslySetInnerHTML={{ __html: safe.html }}
                />
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-3">
                {token && (
                  <>
                    <a
                      href={`${cfg.simUrl}/r/${token}`}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="rounded-lg border border-accent-good/50 px-3 py-1.5 text-xs font-semibold text-accent-good transition hover:bg-accent-good/10"
                    >
                      Report this message
                    </a>
                    <a
                      href={`${cfg.simUrl}/t/${token}`}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="rounded-lg border border-ink-line px-3 py-1.5 text-xs text-slate-400 transition hover:border-accent-bad hover:text-accent-bad"
                    >
                      Click the link (as the participant would)
                    </a>
                  </>
                )}
                <span className="text-[11px] text-slate-600">
                  {headers['x-chetna-simulation']
                    ? `watermark ${headers['x-chetna-simulation']}`
                    : 'no simulation header — this should never happen'}
                </span>
              </div>

              {safe.removed.tags.length + safe.removed.attributes.length > 0 && (
                <Note tone="warn">
                  Sanitiser removed: {[...safe.removed.tags, ...safe.removed.attributes].join(', ')}
                </Note>
              )}
            </Card>
          );
        })}
      </div>

      <Note>
        The Report button posts to the simulation surface&apos;s{' '}
        <code className="font-mono">/r/&lt;token&gt;</code> endpoint — the same path a real Outlook
        or Gmail report add-in uses, so the demo and the production integration share one code path.
      </Note>
    </>
  );
}
