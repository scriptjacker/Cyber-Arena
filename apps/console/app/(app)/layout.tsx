import Link from 'next/link';
import { BRAND } from '@chetna/core';
import { runtimeConfig } from '@chetna/db';
import { can, requireSession, ROLE_LABEL, type Capability } from '@/lib/session';
import { logout } from '@/lib/actions/auth';

export const dynamic = 'force-dynamic';

const NAV: { href: string; label: string; capability?: Capability }[] = [
  { href: '/', label: 'Overview' },
  { href: '/templates', label: 'Templates' },
  { href: '/campaigns', label: 'Campaigns' },
  { href: '/triage', label: 'Reports', capability: 'triage:read' },
  { href: '/analytics', label: 'Analytics', capability: 'analytics:read' },
  { href: '/governance', label: 'Governance', capability: 'governance:read' },
  { href: '/inbox', label: 'Inbox (demo)', capability: 'inbox:demo' },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireSession();
  const cfg = runtimeConfig();
  // Links are filtered by capability rather than rendered and then refused.
  // A navigation item that 403s teaches people to distrust the navigation.
  const items = NAV.filter((n) => !n.capability || can(user.role, n.capability));

  return (
    <div className="min-h-screen">
      <header className="border-b border-ink-line bg-ink-soft/60">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
          <Link href="/" className="shrink-0">
            <span className="text-sm font-semibold text-white">{BRAND.name}</span>
            <span className="ml-1.5 text-xs text-slate-600">{BRAND.nameLocal}</span>
          </Link>

          <nav className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {items.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className="text-slate-400 transition hover:text-white"
              >
                {n.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-3 text-xs">
            {cfg.mode === 'offline' ? (
              <span
                className="rounded bg-accent-good/15 px-2 py-1 font-semibold uppercase tracking-wide text-accent-good ring-1 ring-accent-good/30"
                title="Gate G7 refuses any non-loopback mail transport and any recipient domain outside the reserved test TLDs. The mode is part of the signed campaign scope, so it cannot be changed mid-campaign."
              >
                offline
              </span>
            ) : (
              <span className="rounded bg-accent-bad/15 px-2 py-1 font-semibold uppercase tracking-wide text-accent-bad ring-1 ring-accent-bad/30">
                live — real inboxes reachable
              </span>
            )}
            <span className="hidden text-slate-500 sm:inline">
              {user.displayName} · {ROLE_LABEL[user.role]}
            </span>
            <form action={logout}>
              <button
                type="submit"
                className="text-slate-500 underline decoration-dotted transition hover:text-slate-300"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>

      <footer className="mx-auto max-w-6xl px-4 pb-10 pt-4 text-xs leading-relaxed text-slate-600">
        {BRAND.tagline} — individual results are visible only to the individual. No endpoint in
        this console returns a named person&apos;s result to anyone else, and cohort analytics are
        suppressed below the k-anonymity threshold.
      </footer>
    </div>
  );
}
