import Link from 'next/link';
import { prisma } from '@chetna/db';
import { DIFFICULTY_LABEL } from '@chetna/phishscale';
import { SCENARIO_LABEL, type Scenario } from '@chetna/core';
import { can, requireSession } from '@/lib/session';
import { Badge, SectionTitle, Table, Td } from '@/components/ui';

export const dynamic = 'force-dynamic';

const ETHICS_TONE = {
  CLEAR: 'good',
  FLAGGED: 'warn',
  BLOCKED: 'bad',
  OVERRIDDEN: 'info',
} as const;

const DIFFICULTY_TONE = {
  VERY_LOW: 'neutral',
  LOW: 'neutral',
  MODERATE: 'info',
  HIGH: 'warn',
  VERY_HIGH: 'bad',
} as const;

export default async function TemplatesPage() {
  const user = await requireSession();
  const templates = await prisma.template.findMany({
    where: { orgId: user.orgId },
    orderBy: [{ ethicsStatus: 'desc' }, { name: 'asc' }],
    include: { override: { select: { id: true } } },
  });

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white">Template library</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-400">
            A template is not a free-text email box. It cannot be saved until it passes ten safety
            rules, and it carries its own difficulty rating from the NIST Phish Scale.
          </p>
        </div>
        {can(user.role, 'template:write') && (
          <Link
            href="/templates/new"
            className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent/85"
          >
            New template
          </Link>
        )}
      </div>

      <SectionTitle hint={`${templates.length} templates`}>Library</SectionTitle>
      <Table head={['Template', 'Technique', 'Difficulty', 'Cues', 'Lint', 'Harmful-lure screen']}>
        {templates.map((t) => (
          <tr key={t.id}>
            <Td>
              <Link href={`/templates/${t.id}`} className="text-accent hover:underline">
                {t.name}
              </Link>
              <div className="mt-0.5 text-xs text-slate-500">{t.subject}</div>
            </Td>
            <Td className="text-xs">
              <span className="font-mono text-slate-500">{t.scenario}</span>
              <div className="mt-0.5 text-slate-500">
                {SCENARIO_LABEL[t.scenario as Scenario] ?? ''}
              </div>
            </Td>
            <Td>
              <Badge tone={DIFFICULTY_TONE[t.difficulty as keyof typeof DIFFICULTY_TONE] ?? 'neutral'}>
                {DIFFICULTY_LABEL[t.difficulty as keyof typeof DIFFICULTY_LABEL] ?? t.difficulty}
              </Badge>
            </Td>
            <Td className="text-xs text-slate-400">
              {t.cueCount}
              <span className="text-slate-600"> · premise {t.premiseAlignment}/5</span>
            </Td>
            <Td>
              <Badge tone={t.lintStatus === 'PASS' ? 'good' : 'bad'}>{t.lintStatus}</Badge>
            </Td>
            <Td>
              <Badge tone={ETHICS_TONE[t.ethicsStatus as keyof typeof ETHICS_TONE] ?? 'neutral'}>
                {t.ethicsStatus}
              </Badge>
              {t.ethicsStatus === 'BLOCKED' && (
                <div className="mt-1 text-[11px] text-accent-bad">cannot send — gate G5</div>
              )}
              {t.override && (
                <div className="mt-1 text-[11px] text-accent">HR override on file</div>
              )}
            </Td>
          </tr>
        ))}
      </Table>
    </>
  );
}
