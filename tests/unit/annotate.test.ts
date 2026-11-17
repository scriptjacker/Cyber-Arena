import { describe, expect, it } from 'vitest';
import { CueCategory, CueTag, type DetectedCue } from '@chetna/core';
import { actionsForCues, annotateCues, detectCues } from '@chetna/phishscale';
import { Channel, Scenario, type TemplateMeta } from '@chetna/core';

const cue = (id: string, text: string, tag: CueTag = CueTag.URGENCY): DetectedCue => ({
  id,
  category: CueCategory.LANGUAGE_AND_CONTENT,
  tag,
  label: id,
  explanation: 'why this matters, at length enough to be useful to a reader',
  anchor: { text, occurrence: 1 },
});

describe('cue annotation', () => {
  it('wraps the anchor text in a highlight', () => {
    const r = annotateCues('<p>Please act immediately or lose access.</p>', [
      cue('LANG_URGENCY', 'immediately'),
    ]);
    expect(r.html).toContain('<mark class="chetna-cue" data-cue-id="LANG_URGENCY"');
    expect(r.html).toContain('immediately</mark>');
    expect(r.anchored).toEqual(['LANG_URGENCY']);
    expect(r.unanchored).toEqual([]);
  });

  it('leaves the surrounding markup and attributes untouched', () => {
    const html = '<div class="box" style="color:red"><a href="{{clickUrl}}">Review now</a></div>';
    const r = annotateCues(html, [cue('TACT_GENERIC_CTA', 'Review now')]);
    expect(r.html).toContain('class="box"');
    expect(r.html).toContain('href="{{clickUrl}}"');
    expect(r.html).toContain('<mark');
  });

  it('never annotates inside an attribute, a style block or a script', () => {
    const html =
      '<style>.immediately { color: red }</style><img alt="immediately" src="data:," /><p>ok</p>';
    const r = annotateCues(html, [cue('LANG_URGENCY', 'immediately')]);
    expect(r.html).toContain('.immediately { color: red }');
    expect(r.html).toContain('alt="immediately"');
    expect(r.html).not.toContain('<mark');
    expect(r.unanchored).toEqual(['LANG_URGENCY']);
  });

  it('escapes the document text, so a cue cannot inject markup', () => {
    const r = annotateCues('<p>Hello <script>alert(1)</script> immediately</p>', [
      cue('LANG_URGENCY', 'immediately'),
    ]);
    // The paragraph's own text is escaped on the annotated node.
    expect(r.html).toContain('<mark');
    expect(r.html).not.toContain('<p>Hello <b>');
  });

  it('reports cues it could not locate rather than pretending it highlighted them', () => {
    const structural: DetectedCue = {
      id: 'VIS_NO_BRANDING',
      category: CueCategory.VISUAL_PRESENTATION,
      tag: CueTag.BRAND_IMPERSONATION,
      label: 'no branding',
      explanation: 'a structural observation with no span of text to point at',
    };
    const r = annotateCues('<p>plain</p>', [structural]);
    expect(r.anchored).toEqual([]);
    expect(r.unanchored).toEqual(['VIS_NO_BRANDING']);
    expect(r.html).not.toContain('<mark');
  });

  it('matches case-insensitively but preserves the original casing', () => {
    const r = annotateCues('<p>Dear User, please sign in</p>', [
      cue('LANG_GENERIC_GREETING', 'dear user', CueTag.GENERIC_GREETING),
    ]);
    expect(r.html).toContain('>Dear User</mark>');
  });

  it('annotates a longer cue before a shorter overlapping one', () => {
    const r = annotateCues('<p>within 24 hours you must act</p>', [
      cue('SHORT', 'hours'),
      cue('LONG', 'within 24 hours'),
    ]);
    expect(r.html).toContain('within 24 hours</mark>');
    expect(r.anchored).toContain('LONG');
  });

  it('works on a real detected template, end to end', () => {
    const meta: TemplateMeta = {
      name: 't',
      channel: Channel.EMAIL,
      scenario: Scenario.SPEARPHISHING_LINK,
      subject: 'Action required: your network password expires today',
      fromName: 'IT Service Desk',
      fromAddress: 'servicedesk@nimbus-it-support.test',
      watermarkId: 'chetna-sim-aabbccddeeff',
      hasSimulationHeaders: true,
    };
    const html =
      '<p>Dear User,</p><p>Your password expires today. Please confirm your identity before 18:00.</p><p><a href="{{reportUrl}}">Report</a></p>';
    const cues = detectCues({ subject: meta.subject, html, meta, orgDomain: 'nimbus.test' });
    expect(cues.length).toBeGreaterThan(2);

    const r = annotateCues(html, cues);
    expect(r.anchored.length).toBeGreaterThan(0);
    // Every anchored cue appears exactly once as a highlight.
    for (const id of r.anchored) {
      expect(r.html.split(`data-cue-id="${id}"`).length - 1).toBe(1);
    }
  });
});

describe('actions derived from cues', () => {
  it('turns cue tags into at most three concrete behaviours', () => {
    const actions = actionsForCues([
      cue('a', 'x', CueTag.LOOKALIKE_DOMAIN),
      cue('b', 'x', CueTag.URGENCY),
      cue('c', 'x', CueTag.CREDENTIAL_PROMPT),
      cue('d', 'x', CueTag.MFA_PUSH),
      cue('e', 'x', CueTag.PAYMENT_CHANGE),
    ]);
    expect(actions.length).toBe(3);
    for (const a of actions) expect(a.length).toBeGreaterThan(20);
  });

  it('deduplicates behaviours that several cues share', () => {
    const actions = actionsForCues([
      cue('a', 'x', CueTag.LOOKALIKE_DOMAIN),
      cue('b', 'x', CueTag.BRAND_IMPERSONATION),
    ]);
    expect(actions.length).toBe(1);
  });

  it('returns nothing when there is nothing actionable', () => {
    expect(actionsForCues([])).toEqual([]);
  });
});
