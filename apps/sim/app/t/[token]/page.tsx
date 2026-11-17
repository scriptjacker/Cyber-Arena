import { notFound } from 'next/navigation';
import { EventType, renderSubject, renderTemplate, type DetectedCue } from '@chetna/core';
import { prisma, readJson } from '@chetna/db';
import { actionsForCues, annotateCues, DIFFICULTY_LABEL } from '@chetna/phishscale';
import { sanitizeEmailHtml } from '@chetna/safety-lint';
import { SEED_MODULES, moduleForCueTag, moduleBySlug } from '@chetna/content';
import TeachableMoment, { type CueView, type ModuleView } from '@/components/TeachableMoment';
import { recordClick, recordDecoyView } from '@/lib/telemetry';

export const dynamic = 'force-dynamic';

/**
 * The clicked-link landing page.
 *
 * Order of operations matters here:
 *   1. record the click (unconfirmed — a gateway may have fetched this)
 *   2. re-render the exact message this person received
 *   3. SANITISE it through an allowlist, because a template is
 *      operator-authored and the authoring linter is a denylist
 *   4. annotate the cues they missed, in place
 *   5. choose the ONE module that matches the gap they actually showed
 */
export default async function LandingPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // The click is recorded before anything is rendered, so a person who closes
  // the tab immediately is still counted.
  const assignment = await recordClick(token, new Request('http://local/t'));
  if (!assignment) notFound();

  const { template, participant } = assignment;
  const firstName = (participant.displayName ?? 'there').split(' ')[0];

  // Replay the message with inert links: this is a post-mortem, not a retry.
  const rendered = renderTemplate(template.html, {
    firstName,
    displayName: participant.displayName ?? 'there',
    department: participant.department,
    orgName: 'Nimbus Logistics',
    clickUrl: '#',
    pixelUrl:
      'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
    qrUrl: '#',
    reportUrl: '#',
    watermarkId: template.watermarkId,
  });

  const safe = sanitizeEmailHtml(rendered);
  const cues = readJson<DetectedCue[]>(template.cuesJson, []);
  const annotated = annotateCues(safe.html, cues);

  const cueViews: CueView[] = cues.map((c) => ({
    id: c.id,
    label: c.label,
    explanation: c.explanation,
    category: c.category,
    anchored: annotated.anchored.includes(c.id),
  }));

  // One module, chosen by the first cue that maps to one. Never a blanket
  // course: the whole point is that the lesson matches the gap.
  const matched =
    cues.map((c) => moduleForCueTag(c.tag)).find((m) => m !== undefined) ??
    moduleBySlug('read-the-domain') ??
    SEED_MODULES[0];

  const moduleView: ModuleView = {
    slug: matched.slug,
    title: matched.title,
    summary: matched.summary,
    body: matched.body,
    action: matched.action,
    minutes: matched.minutes,
    drill: matched.drill,
  };

  const reportedAlready =
    (await prisma.event.count({
      where: { assignmentId: assignment.id, type: EventType.REPORTED },
    })) > 0;

  // The decoy panel is shown only to someone who has not already reported the
  // message. Having spotted it, they have earned the lesson directly.
  const showDecoy = !reportedAlready;
  if (showDecoy) await recordDecoyView(token);

  return (
    <TeachableMoment
      token={token}
      emailHtml={annotated.html}
      subject={renderSubject(template.subject, {
        firstName,
        displayName: participant.displayName ?? 'there',
        department: participant.department,
        orgName: 'Nimbus Logistics',
        clickUrl: '#',
        pixelUrl: '#',
        qrUrl: '#',
        reportUrl: '#',
        watermarkId: template.watermarkId,
      })}
      fromName={template.fromName}
      fromAddress={template.fromAddress}
      firstName={firstName}
      orgName="Nimbus Logistics"
      cues={cueViews}
      actions={actionsForCues(cues)}
      module={moduleView}
      difficultyLabel={DIFFICULTY_LABEL[template.difficulty as keyof typeof DIFFICULTY_LABEL]}
      cueCount={template.cueCount}
      reportedAlready={reportedAlready}
      showDecoy={showDecoy}
    />
  );
}

export const metadata = {
  title: 'Sign in',
  robots: { index: false, follow: false },
};
