import { describe, expect, it } from 'vitest';
import { Channel, Difficulty, Scenario, type TemplateMeta } from '@chetna/core';
import {
  cueCountBand,
  detectCues,
  DETECTOR_COUNT,
  DIFFICULTY_WEIGHT,
  premiseBand,
  scoreFromCues,
  scoreTemplate,
} from '@chetna/phishscale';

const meta = (over: Partial<TemplateMeta> = {}): TemplateMeta => ({
  name: 't',
  channel: Channel.EMAIL,
  scenario: Scenario.SPEARPHISHING_LINK,
  subject: 'Subject',
  fromName: 'Nimbus Courier Updates',
  fromAddress: 'updates@nimbus-courier.test',
  watermarkId: 'chetna-sim-aabbccddeeff',
  hasSimulationHeaders: true,
  ...over,
});

/** A careful, low-cue lure: the kind that actually catches people. */
const SUBTLE = `
<div>
  <img src="data:image/png;base64,iVBOR" alt="Nimbus Courier" />
  <p>Hello Priya,</p>
  <p>Shipment NC-4471-PQ addressed to you is held at the Bengaluru hub pending a
     customs charge of INR 240. You can review the shipment details below.</p>
  <p><a href="{{clickUrl}}">Review shipment NC-4471-PQ</a></p>
  <p>Regards,<br/>Nimbus Courier Updates</p>
  <p><a href="{{reportUrl}}">Report this message</a></p>
</div>`;

/** A sloppy lure: lots of cues, easy to spot. */
const OBVIOUS = `
<div>
  <p>Dear User,</p>
  <p>URGENT!! Your acount will be suspended within 24 hours. You must verify your password immediatly!!</p>
  <p>Visit http://192.168.44.9/login or <a href="{{clickUrl}}">click here</a></p>
  <p>Also reply to <a href="mailto:helpdesk@other-domain.test">helpdesk</a> on WhatsApp.</p>
  <p><a href="{{reportUrl}}">Report</a></p>
</div>`;

describe('cue detection', () => {
  it('finds fewer cues in a careful lure than a sloppy one', () => {
    const subtle = detectCues({ subject: 'Shipment NC-4471-PQ held at hub', html: SUBTLE, meta: meta() });
    const obvious = detectCues({
      subject: 'URGENT!! acount suspended',
      html: OBVIOUS,
      meta: meta({ fromName: 'IT Service Desk', fromAddress: 'noreply@random-mailer.test' }),
    });
    expect(subtle.length).toBeLessThan(obvious.length);
  });

  it('attaches an anchor so the teachable moment can highlight the cue in situ', () => {
    const cues = detectCues({
      subject: 'URGENT!! verify your password immediatly',
      html: OBVIOUS,
      meta: meta(),
    });
    const urgency = cues.find((c) => c.id === 'LANG_URGENCY');
    expect(urgency?.anchor?.text).toBeTruthy();
    const greeting = cues.find((c) => c.id === 'LANG_GENERIC_GREETING');
    expect(greeting?.anchor?.text?.toLowerCase()).toBe('dear user');
  });

  it('every cue carries an explanation a non-specialist can act on', () => {
    for (const c of detectCues({ subject: 'x', html: OBVIOUS, meta: meta() })) {
      expect(c.explanation.length).toBeGreaterThan(40);
      expect(c.label.length).toBeGreaterThan(5);
    }
  });

  it('detects a lookalike sender domain against the org domain', () => {
    const cues = detectCues({
      subject: 'Payroll update',
      html: '<p>Hello</p><a href="{{reportUrl}}">r</a>',
      meta: meta({ fromAddress: 'payroll@nimbus-hr-portal.test', fromName: 'Nimbus Payroll' }),
      orgDomain: 'nimbus.test',
    });
    expect(cues.map((c) => c.id)).toContain('TECH_LOOKALIKE_DOMAIN');
  });

  it('flags a QR lure and an MFA lure', () => {
    const qr = detectCues({
      subject: 'Scan the QR code to confirm parking',
      html: '<p>Scan this code</p><a href="{{reportUrl}}">r</a>',
      meta: meta({ channel: Channel.QR }),
    });
    expect(qr.map((c) => c.id)).toContain('TACT_QR');

    const mfa = detectCues({
      subject: 'Approve the request on your authenticator',
      html: '<p>Please approve the request we just sent.</p><a href="{{reportUrl}}">r</a>',
      meta: meta(),
    });
    expect(mfa.map((c) => c.id)).toContain('TACT_MFA');
  });

  it('flags unnaturally polished AI-style prose', () => {
    const polished = `
      <p>Following the completion of the scheduled infrastructure migration that was
         announced earlier this quarter, all colleagues are now required to confirm
         their continued access to the finance reporting environment before the end
         of the current reporting period.</p>
      <p>The confirmation process has been designed to take no more than two minutes
         and will not require any additional information beyond what is already held
         within the corporate directory system.</p>
      <p><a href="{{reportUrl}}">Report</a></p>`;
    const cues = detectCues({ subject: 'Access confirmation required', html: polished, meta: meta() });
    expect(cues.map((c) => c.id)).toContain('LANG_AI_POLISH');
  });

  it('exposes how many detectors exist, so the band thresholds can be read in context', () => {
    expect(DETECTOR_COUNT).toBeGreaterThanOrEqual(20);
  });
});

describe('the NIST combination', () => {
  it('bands cue counts in the documented direction: fewer cues, harder to detect', () => {
    expect(cueCountBand(2)).toBe('FEW');
    expect(cueCountBand(3)).toBe('FEW');
    expect(cueCountBand(5)).toBe('SOME');
    expect(cueCountBand(7)).toBe('SOME');
    expect(cueCountBand(8)).toBe('MANY');
    expect(cueCountBand(18)).toBe('MANY');
  });

  it('spreads the seeded template library across bands rather than bunching it', () => {
    // Guards the calibration: if a detector change pushes everything into one
    // band again, difficulty stops ranking anything and this fails.
    const counts = [2, 3, 4, 4, 5, 3, 11, 6, 3, 4, 4];
    const bands = new Set(counts.map(cueCountBand));
    expect(bands.size).toBeGreaterThanOrEqual(3);
  });

  it('buckets premise alignment into three levels', () => {
    expect(premiseBand(1)).toBe('LOW');
    expect(premiseBand(3)).toBe('MEDIUM');
    expect(premiseBand(5)).toBe('HIGH');
  });

  it('few cues plus a premise that fits the job is the hardest email to detect', () => {
    const r = scoreFromCues(
      Array.from({ length: 2 }, (_, i) => ({
        id: `c${i}`,
        category: 'ERRORS',
        tag: 'URGENCY',
        label: 'l',
        explanation: 'e',
      })) as never,
      { premiseAlignment: 5 },
    );
    expect(r.difficulty).toBe(Difficulty.VERY_HIGH);
    expect(r.difficultyWeight).toBe(DIFFICULTY_WEIGHT[Difficulty.VERY_HIGH]);
    expect(r.difficultyWeight).toBeLessThan(1);
  });

  it('many cues plus an implausible premise is the easiest', () => {
    const r = scoreFromCues(
      Array.from({ length: 15 }, (_, i) => ({
        id: `c${i}`,
        category: 'ERRORS',
        tag: 'URGENCY',
        label: 'l',
        explanation: 'e',
      })) as never,
      { premiseAlignment: 1 },
    );
    expect(r.difficulty).toBe(Difficulty.VERY_LOW);
    expect(r.difficultyWeight).toBeGreaterThan(1);
  });

  it('clamps an out-of-range premise rather than trusting the caller', () => {
    expect(scoreFromCues([], { premiseAlignment: 99 }).premiseAlignment).toBe(5);
    expect(scoreFromCues([], { premiseAlignment: -4 }).premiseAlignment).toBe(1);
  });

  it('counts cues per NIST category', () => {
    const r = scoreTemplate(
      { subject: 'URGENT!! verify your password', html: OBVIOUS, meta: meta() },
      { premiseAlignment: 3 },
    );
    const total = Object.values(r.byCategory).reduce((a, b) => a + b, 0);
    expect(total).toBe(r.cueCount);
    expect(r.byCategory.LANGUAGE_AND_CONTENT).toBeGreaterThan(0);
  });

  it('a careful lure rates harder than a sloppy one at equal premise', () => {
    const subtle = scoreTemplate(
      { subject: 'Shipment NC-4471-PQ held at hub', html: SUBTLE, meta: meta() },
      { premiseAlignment: 4 },
    );
    const obvious = scoreTemplate(
      { subject: 'URGENT!! acount suspended', html: OBVIOUS, meta: meta() },
      { premiseAlignment: 4 },
    );
    const order = [
      Difficulty.VERY_LOW,
      Difficulty.LOW,
      Difficulty.MODERATE,
      Difficulty.HIGH,
      Difficulty.VERY_HIGH,
    ];
    expect(order.indexOf(subtle.difficulty)).toBeGreaterThan(order.indexOf(obvious.difficulty));
  });
});
