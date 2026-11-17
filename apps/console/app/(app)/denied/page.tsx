import Link from 'next/link';
import { requireSession, ROLE_LABEL, CAPABILITIES, type Capability } from '@/lib/session';
import { Card, Note } from '@/components/ui';

export const dynamic = 'force-dynamic';

/**
 * A refusal, explained.
 *
 * Not an error page. These separations are deliberate design — the person who
 * wants to send a harmful lure must not be the one who can permit it, and an
 * analyst must not be able to reach an individual's results — so when the
 * console refuses, it says which separation is doing the work and who holds the
 * capability instead.
 */
const WHY: Partial<Record<Capability, string>> = {
  'ethics:override':
    'Only People/HR can permit a harmful lure. If the security team could override its own ethics block, the block would be advisory rather than a control.',
  'authorize:people':
    'The people/HR signature on an authorization grant must come from People/HR. Dual control requires two different people on two different sides of the business.',
  'authorize:security':
    'The security signature on an authorization grant must come from the security side.',
  'governance:read':
    'The audit chain and retention controls are limited to the owner, security and the auditor.',
  'retention:run': 'Running the retention job erases data, so it is limited to the owner and security.',
  'dsar:run': 'Data-subject requests are handled by the owner or People/HR.',
  'campaign:send': 'An approver is never the operator. Sending is limited to the owner and security.',
  'triage:write': 'Setting a triage verdict is limited to the owner and security.',
};

export default async function DeniedPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const user = await requireSession();
  const sp = await searchParams;
  const capability = (sp.c ?? '') as Capability;
  const holders = CAPABILITIES[capability] as readonly string[] | undefined;

  return (
    <div className="mx-auto max-w-xl">
      <Card tone="warn">
        <h1 className="text-lg font-semibold text-white">Not permitted — by design</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-300">
          You are signed in as <strong className="text-white">{ROLE_LABEL[user.role]}</strong>, and
          that role does not hold{' '}
          <code className="rounded bg-ink-line px-1.5 py-0.5 font-mono text-xs">
            {capability || 'this capability'}
          </code>
          .
        </p>

        {WHY[capability] && (
          <p className="mt-3 text-sm leading-relaxed text-slate-400">{WHY[capability]}</p>
        )}

        {holders && (
          <p className="mt-3 text-xs text-slate-500">
            Held by:{' '}
            {holders
              .map((r) => ROLE_LABEL[r as keyof typeof ROLE_LABEL] ?? r)
              .join(', ')}
            .
          </p>
        )}

        <Note>
          Sign in as a different seeded role to see the other side of the separation. The demo
          accounts are listed on the sign-in page.
        </Note>

        <div className="mt-5 flex gap-3">
          <Link
            href="/"
            className="rounded-lg border border-ink-line px-4 py-2 text-sm text-slate-200 transition hover:border-accent"
          >
            Back to the overview
          </Link>
        </div>
      </Card>
    </div>
  );
}
