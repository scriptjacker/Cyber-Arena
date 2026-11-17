import { notFound } from 'next/navigation';
import {
  renderTemplate,
  SCENARIO_LABEL,
  type DetectedCue,
  type EthicsResult,
  type LintResult,
  type Scenario,
} from '@chetna/core';
import { prisma, readJson } from '@chetna/db';
import { actionsForCues, annotateCues, DIFFICULTY_LABEL } from '@chetna/phishscale';
import { sanitizeEmailHtml } from '@chetna/safety-lint';
import { can, requireSession, ROLE_LABEL } from '@/lib/session';
import { Badge, Card, Note, SectionTitle, Stat } from '@/components/ui';
import OverrideForm from '@/components/OverrideForm';

export const dynamic = 'force-dynamic';

export default async function TemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireSession();

  const template = await prisma.template.findUnique({
    where: { id },
    include: { override: true },
  });
  if (!template || template.orgId !== user.orgId) notFound();

  const cues = readJson<DetectedCue[]>(template.cuesJson, []);
  const lintFindings = readJson<LintResult['findings']>(template.lintFindingsJson, []);
  const ethicsFindings = readJson<EthicsResult['findings']>(template.ethicsFindingsJson, []);
  const blockedThemes = ethicsFindings.filter((f) => f.severity === 'BLOCK');

  // Preview exactly what a recipient sees, sanitised and cue-annotated. The
  // same pipeline the teachable moment uses, so the author sees the real thing.
  const rendered = renderTemplate(template.html, {
    firstName: 'Priya',
    displayName: 'Priya Reddy',
    department: 'Finance',
    orgName: 'Nimbus Logistics',
    clickUrl: '#',
    pixelUrl: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
    qrUrl: '#',
    reportUrl: '#',
    watermarkId: template.watermarkId,
  });
  const annotated = annotateCues(sanitizeEmailHtml(rendered).html, cues);

  const canOverride =
    template.ethicsStatus === 'BLOCKED' && can(user.role, 'ethics:override');

  return (
    <>
      <div className="mb-6">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold text-white">{template.name}</h1>
          <Badge tone={template.lintStatus === 'PASS' ? 'good' : 'bad'}>
            lint {template.lintStatus}
          </Badge>
          <Badge
            tone={
              template.ethicsStatus === 'BLOCKED'
                ? 'bad'
                : template.ethicsStatus === 'FLAGGED'
                  ? 'warn'
                  : template.ethicsStatus === 'OVERRIDDEN'
                    ? 'info'
                    : 'good'
            }
          >
            {template.ethicsStatus}
          </Badge>
        </div>
        <p className="mt-1 font-mono text-xs text-slate-600">
          {template.id} · content hash {template.contentHash.slice(0, 16)}… · watermark{' '}
          {template.watermarkId}
        </p>
      </div>

      {/* ------------------------------------------------- blocked / override */}
      {template.ethicsStatus === 'BLOCKED' && (
        <div className="mb-6 space-y-4">
          <Card tone="bad">
            <h2 className="text-sm font-semibold text-accent-bad">
              Blocked — this lure cannot be sent
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">
              Gate G5 refuses every send of this template. The themes below have produced
              documented, public harm when used in real awareness programmes.
            </p>
            {blockedThemes.map((f) => (
              <div key={f.themeId} className="mt-4 border-t border-ink-line pt-4">
                <p className="text-sm font-medium text-white">{f.label}</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-400">{f.rationale}</p>
                <p className="mt-1.5 text-[11px] text-slate-500">
                  Matched: <span className="font-mono">{f.matched.join(', ')}</span>
                </p>
                {f.precedent && (
                  <div className="mt-2.5 rounded-lg border border-ink-line bg-ink/50 p-3">
                    <p className="text-xs font-semibold text-accent-warm">{f.precedent.title}</p>
                    <p className="mt-1 text-xs leading-relaxed text-slate-400">
                      {f.precedent.summary}
                    </p>
                    <a
                      href={f.precedent.source}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="mt-1.5 inline-block text-xs text-accent underline decoration-dotted"
                    >
                      Source
                    </a>
                  </div>
                )}
              </div>
            ))}
          </Card>

          {canOverride ? (
            <OverrideForm
              templateId={template.id}
              themes={blockedThemes.map((f) => f.label)}
              approverName={user.displayName}
            />
          ) : (
            <Card tone="warn">
              <p className="text-sm text-slate-300">
                Only a <strong className="text-white">People / HR</strong> approver can override
                this. You are signed in as {ROLE_LABEL[user.role]}.
              </p>
              <Note>
                The person who wants to send the lure must not be the person who can permit it.
                That separation is what makes this screen a control rather than a suggestion — and
                it holds for the owner too.
              </Note>
            </Card>
          )}
        </div>
      )}

      {template.override && (
        <Card tone="info" className="mb-6">
          <h2 className="text-sm font-semibold text-accent">Override on file</h2>
          <p className="mt-2 text-xs text-slate-400">
            Signed by {template.override.approvedByHrId} on{' '}
            {new Date(template.override.signedAt).toLocaleString()} · themes{' '}
            {readJson<string[]>(template.override.themesJson, []).join(', ')}
          </p>
          <blockquote className="mt-3 border-l-2 border-accent/40 pl-3 text-sm leading-relaxed text-slate-300">
            {template.override.justification}
          </blockquote>
          <p className="mt-3 break-all font-mono text-[10px] text-slate-600">
            signature {template.override.signatureB64}
          </p>
        </Card>
      )}

      {/* ------------------------------------------------------------ metrics */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Detection difficulty"
          value={DIFFICULTY_LABEL[template.difficulty as keyof typeof DIFFICULTY_LABEL]}
          hint={`${template.cueCount} cues · premise ${template.premiseAlignment}/5`}
        />
        <Stat label="Channel" value={template.channel} />
        <Stat
          label="Technique"
          value={template.scenario}
          hint={SCENARIO_LABEL[template.scenario as Scenario] ?? ''}
        />
        <Stat label="Sender" value={template.fromName} hint={template.fromAddress} />
      </section>

      {/* ------------------------------------------------------------ preview */}
      <section className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div>
          <SectionTitle hint="exactly what a recipient sees, with cues highlighted">
            Preview
          </SectionTitle>
          <div className="overflow-hidden rounded-xl border border-ink-line bg-white">
            <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-[13px]">
              <div className="font-semibold text-slate-900">{template.subject}</div>
              <div className="mt-0.5 text-slate-500">
                {template.fromName} &lt;{template.fromAddress}&gt;
              </div>
            </div>
            <div
              className="px-4 py-4 text-slate-800 [&_a]:pointer-events-none [&_a]:text-blue-700 [&_a]:underline"
              dangerouslySetInnerHTML={{ __html: annotated.html }}
            />
          </div>
          <Note>
            Rendered through the same allowlist sanitiser the teachable moment uses, so the preview
            cannot execute anything the live page would not.
          </Note>
        </div>

        <aside className="space-y-4">
          <div className="rounded-xl border border-ink-line bg-ink-soft p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Detected cues
            </h3>
            <ul className="mt-3 space-y-2.5">
              {cues.map((c) => (
                <li key={c.id}>
                  <p className="text-xs font-medium text-slate-200">{c.label}</p>
                  {c.anchor && (
                    <p className="font-mono text-[11px] text-accent-warm">“{c.anchor.text}”</p>
                  )}
                  <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
                    {c.explanation}
                  </p>
                </li>
              ))}
              {cues.length === 0 && (
                <li className="text-xs text-slate-500">No cues detected.</li>
              )}
            </ul>
          </div>

          {actionsForCues(cues).length > 0 && (
            <div className="rounded-xl border border-ink-line bg-ink-soft p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Taught on failure
              </h3>
              <ol className="mt-3 space-y-2">
                {actionsForCues(cues).map((a, i) => (
                  <li key={i} className="text-xs leading-relaxed text-slate-300">
                    {i + 1}. {a}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {lintFindings.length > 0 && (
            <div className="rounded-xl border border-ink-line bg-ink-soft p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Lint findings
              </h3>
              <ul className="mt-3 space-y-2">
                {lintFindings.map((f, i) => (
                  <li key={i} className="text-[11px]">
                    <span className="font-mono text-slate-400">{f.ruleId}</span>{' '}
                    <span className={f.severity === 'FAIL' ? 'text-accent-bad' : 'text-accent-warm'}>
                      {f.severity}
                    </span>
                    <p className="text-slate-400">{f.message}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </section>
    </>
  );
}
