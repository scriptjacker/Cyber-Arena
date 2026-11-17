import { redirect } from 'next/navigation';
import { BRAND } from '@chetna/core';
import { prisma } from '@chetna/db';
import { getSession } from '@/lib/session';
import { ROLE_LABEL } from '@/lib/session';
import LoginForm from '@/components/LoginForm';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  if (await getSession()) redirect('/');

  // The demo accounts are listed because this is a self-contained offline
  // environment with seeded, non-secret credentials. A real deployment has SSO
  // and no such list — see docs/01-ARCHITECTURE.md §1.
  const staff = await prisma.staffUser.findMany({
    orderBy: { email: 'asc' },
    select: { email: true, role: true, displayName: true },
  });

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <div className="mb-7">
        <h1 className="text-2xl font-semibold text-white">
          {BRAND.name} <span className="text-slate-500">{BRAND.nameLocal}</span>
        </h1>
        <p className="mt-1 text-sm text-slate-400">{BRAND.productLine}</p>
        <p className="mt-0.5 text-xs italic text-slate-600">{BRAND.tagline}</p>
      </div>

      <LoginForm />

      {staff.length > 0 && (
        <div className="mt-7 rounded-xl border border-ink-line bg-ink-soft p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Seeded demo accounts
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Password <code className="rounded bg-ink-line px-1.5 py-0.5 font-mono">chetna-demo-2026</code>.
            Each role sees a different console — the separations are the point.
          </p>
          <ul className="mt-3 space-y-1 text-xs">
            {staff.map((s) => (
              <li key={s.email} className="flex justify-between gap-3">
                <span className="font-mono text-slate-400">{s.email}</span>
                <span className="text-slate-500">{ROLE_LABEL[s.role as keyof typeof ROLE_LABEL]}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </main>
  );
}
