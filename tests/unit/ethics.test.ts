import { describe, expect, it } from 'vitest';
import { EthicsStatus } from '@chetna/core';
import {
  BLOCK_THEMES,
  CAUTION_THEMES,
  blockHeadline,
  screenTemplate,
  THEMES,
  themeById,
  toHaystack,
} from '@chetna/ethics';

describe('the taxonomy is complete and justified', () => {
  it('covers the harm categories the literature and the news record', () => {
    const ids = THEMES.map((t) => t.id);
    for (const required of [
      'COMPENSATION',
      'REDUNDANCY',
      'BEREAVEMENT',
      'MEDICAL',
      'IMMIGRATION',
      'CHILDREN',
      'LEGAL_THREAT',
      'DISCIPLINARY',
    ]) {
      expect(ids).toContain(required);
    }
    expect(BLOCK_THEMES.length).toBeGreaterThanOrEqual(8);
    expect(CAUTION_THEMES.length).toBeGreaterThanOrEqual(3);
  });

  it('gives every theme a rationale an operator can argue with', () => {
    for (const t of THEMES) {
      expect(t.rationale.length).toBeGreaterThan(60);
      expect(t.strong.length).toBeGreaterThan(0);
    }
  });

  it('cites a real, sourced precedent wherever one exists', () => {
    const withPrecedent = THEMES.filter((t) => t.precedent);
    expect(withPrecedent.length).toBeGreaterThanOrEqual(3);
    for (const t of withPrecedent) {
      expect(t.precedent!.source).toMatch(/^https:\/\//);
      expect(t.precedent!.summary.length).toBeGreaterThan(80);
    }
  });
});

describe('text extraction', () => {
  it('sees through markup used to split a word', () => {
    const hay = toHaystack('x', '<p>b<span>on</span>us payment approved</p>');
    expect(hay).toContain('bonus payment');
  });

  it('decodes entities and strips styles and scripts', () => {
    const hay = toHaystack('x', '<style>p{}</style><p>pay&nbsp;rise</p><script>1</script>');
    expect(hay).toContain('pay rise');
    expect(hay).not.toContain('p{}');
  });
});

describe('blocking', () => {
  const cases: { label: string; subject: string; body: string; theme: string }[] = [
    {
      label: 'pandemic bonus',
      subject: 'COVID-19 recognition bonus',
      body: 'A one-off payment has been approved for your work during the pandemic.',
      theme: 'COMPENSATION',
    },
    {
      label: 'redundancy',
      subject: 'Confidential: your position',
      body: 'Following the restructuring announcement your role has been identified for redundancy.',
      theme: 'REDUNDANCY',
    },
    {
      label: 'bereavement',
      subject: 'Sad news about a colleague',
      body: 'We are sorry to share that our colleague has died. Details of the funeral follow.',
      theme: 'BEREAVEMENT',
    },
    {
      label: 'medical results',
      subject: 'Your test results are ready',
      body: 'Please sign in to view your medical report from the company health screening.',
      theme: 'MEDICAL',
    },
    {
      label: 'visa',
      subject: 'Action needed on your visa status',
      body: 'Your work permit requires immediate re-verification by the immigration authority.',
      theme: 'IMMIGRATION',
    },
    {
      label: 'child emergency',
      subject: 'Urgent — about your child',
      body: 'There has been an accident at school. Please collect your child immediately.',
      theme: 'CHILDREN',
    },
    {
      label: 'legal threat',
      subject: 'Court summons issued',
      body: 'Legal action has been initiated against you. Review the enforcement notice.',
      theme: 'LEGAL_THREAT',
    },
    {
      label: 'disciplinary',
      subject: 'Disciplinary hearing scheduled',
      body: 'An investigation into your conduct has been opened. A formal warning may follow.',
      theme: 'DISCIPLINARY',
    },
  ];

  for (const c of cases) {
    it(`blocks the ${c.label} lure and names the theme`, () => {
      const r = screenTemplate(c.subject, `<p>${c.body}</p>`);
      expect(r.status).toBe(EthicsStatus.BLOCKED);
      expect(r.findings.map((f) => f.themeId)).toContain(c.theme);
      expect(blockHeadline(r)).toMatch(/^Blocked: this lure uses the/);
    });
  }

  it('finds the harm even when it is only in the subject line', () => {
    const r = screenTemplate('Your bonus payment is ready', '<p>Please see the portal.</p>');
    expect(r.status).toBe(EthicsStatus.BLOCKED);
  });
});

describe('flagging, not blocking', () => {
  it('flags a payroll document lure as a caution', () => {
    const r = screenTemplate(
      'Your payslip for March is available',
      '<p>Your payslip is available on the payroll portal.</p>',
    );
    expect(r.status).toBe(EthicsStatus.FLAGGED);
    expect(r.findings.every((f) => f.severity === 'CAUTION')).toBe(true);
  });

  it('flags an appraisal lure so a human checks the calendar', () => {
    const r = screenTemplate(
      'Performance review: self-assessment form due',
      '<p>Please complete your self-assessment form.</p>',
    );
    expect(r.status).toBe(EthicsStatus.FLAGGED);
  });
});

describe('the engine must be usable, not merely safe', () => {
  const benign = [
    ['Your parcel is held pending a customs charge', 'A parcel addressed to you is held at the hub.'],
    ['Action required: password expires today', 'Your network password expires today. Please update it.'],
    ['Document shared with you', 'A document has been shared with you for review.'],
    ['Scan to confirm your parking permit', 'Scan the QR code to confirm your parking permit.'],
    ['Approve the sign-in request', 'We sent a push notification to your authenticator.'],
    ['Invoice NC-8841 attached', 'Please find the attached invoice for last month.'],
  ];

  for (const [subject, body] of benign) {
    it(`does not block a legitimate work lure: "${subject}"`, () => {
      const r = screenTemplate(subject, `<p>${body}</p>`);
      expect(r.status).not.toBe(EthicsStatus.BLOCKED);
    });
  }

  it('does not fire on a single incidental weak word', () => {
    const r = screenTemplate(
      'Team offsite agenda',
      '<p>Bonus session on Friday afternoon, entirely optional.</p>',
    );
    expect(r.status).not.toBe(EthicsStatus.BLOCKED);
  });

  it('can have a theme disabled deliberately, which is then an auditable choice', () => {
    const subject = 'Your bonus payment is ready';
    expect(screenTemplate(subject, '<p>x</p>').status).toBe(EthicsStatus.BLOCKED);
    const relaxed = screenTemplate(subject, '<p>x</p>', undefined, {
      disabledThemeIds: ['COMPENSATION'],
    });
    expect(relaxed.status).not.toBe(EthicsStatus.BLOCKED);
  });

  it('looks up a theme by id', () => {
    expect(themeById('COMPENSATION')?.severity).toBe('BLOCK');
    expect(themeById('NOPE')).toBeUndefined();
  });
});
