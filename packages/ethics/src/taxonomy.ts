/**
 * The harmful-lure taxonomy.
 *
 * PS-28 requires simulations that run "without exposing participants to harmful
 * campaigns". That clause is usually treated as a matter of taste. Here it is a
 * control: these themes block a template at authorship time, and only a
 * people/HR approver can override, in writing, with a signature.
 *
 * The themes are not arbitrary. Each one is a lure category that has produced
 * documented, public harm, or that touches something a person cannot shrug off
 * at the end of the working day.
 */

export type ThemeSeverity = 'BLOCK' | 'CAUTION';

export interface Precedent {
  title: string;
  summary: string;
  source: string;
}

export interface Theme {
  id: string;
  label: string;
  severity: ThemeSeverity;
  /** Why this theme causes harm, shown verbatim in the Studio when it fires. */
  rationale: string;
  /** A single match is enough to fire the theme. */
  strong: string[];
  /** Two or more matches are needed to fire the theme. */
  weak: string[];
  precedent?: Precedent;
}

const WMT: Precedent = {
  title: 'West Midlands Trains, April 2021',
  summary:
    'About 2,500 staff were emailed by "the managing director" offering a one-off payment for their work during the pandemic. It was a phishing test. The TSSA union called it "crass and reprehensible" — many staff had been ill with COVID-19 and one colleague had died. It made national news.',
  source: 'https://www.infosecurity-magazine.com/news/staff-bonus-was-crass-phishing/',
};

const GODADDY: Precedent = {
  title: 'GoDaddy, December 2020',
  summary:
    'A fake $650 holiday bonus email was sent months after widespread layoffs. Employees called the exercise "tone-deaf" at a town hall, and those who fell for it were made to retake training.',
  source: 'https://www.infosecurity-magazine.com/news/staff-bonus-was-crass-phishing/',
};

const TRIBUNE: Precedent = {
  title: 'Tribune Publishing / Orlando Sentinel, September 2020',
  summary:
    'A simulated phishing email offered a $10,000 bonus. The Sentinel Guild, a union of employees, called it "a slap in the face and tone-deaf".',
  source: 'https://www.infosecurity-magazine.com/news/staff-bonus-was-crass-phishing/',
};

const NCSC: Precedent = {
  title: 'UK NCSC guidance on phishing simulations',
  summary:
    'The NCSC warns that phishing simulations "erode trust between employees and security" and "can also create legal risk", that blaming users does not work, and that you should always check with HR before running one.',
  source: 'https://www.ncsc.gov.uk/guidance/phishing',
};

export const THEMES: Theme[] = [
  {
    id: 'COMPENSATION',
    label: 'Pay, bonus or financial reward',
    severity: 'BLOCK',
    rationale:
      'Dangling money people have not been given, and then telling them it was a test, reads as mockery rather than training. It is the single most reliably damaging lure theme on record, and it has repeatedly reached national press.',
    strong: [
      'bonus payment',
      'one-off payment',
      'one off payment',
      'ex-gratia',
      'ex gratia',
      'salary increase',
      'salary revision',
      'pay rise',
      'pay raise',
      'incentive payout',
      'thank you payment',
      'recognition bonus',
      'holiday bonus',
      'performance bonus',
      'arrears payment',
      'बोनस',
      'वेतन वृद्धि',
    ],
    weak: ['bonus', 'reward', 'payout', 'increment', 'compensation', 'gratuity', 'appraisal letter'],
    precedent: WMT,
  },
  {
    id: 'REDUNDANCY',
    label: 'Redundancy, layoffs or job loss',
    severity: 'BLOCK',
    rationale:
      'A message that implies someone may lose their job causes real fear before any lesson can land, and in organisations that have had recent layoffs it is indistinguishable from cruelty.',
    strong: [
      'redundancy',
      'redundancies',
      'layoff',
      'lay-off',
      'laid off',
      'termination of employment',
      'notice period',
      'restructuring announcement',
      'position eliminated',
      'exit formalities',
      'छंटनी',
    ],
    weak: ['restructure', 'headcount', 'downsizing', 'severance', 'termination'],
    precedent: GODADDY,
  },
  {
    id: 'BEREAVEMENT',
    label: 'Death, bereavement or condolence',
    severity: 'BLOCK',
    rationale:
      'There is no version of this that is acceptable. A simulated death notice can reach someone who has just lost a colleague or a relative.',
    strong: [
      'passed away',
      'has died',
      'condolence',
      'bereavement',
      'funeral',
      'memorial service',
      'in loving memory',
      'death of our colleague',
      'शोक',
    ],
    weak: ['deceased', 'obituary', 'loss of our'],
  },
  {
    id: 'MEDICAL',
    label: 'Health, medical results or illness',
    severity: 'BLOCK',
    rationale:
      'Health information is special-category personal data in most jurisdictions, and a simulated test result or diagnosis can cause acute distress to someone who is genuinely waiting for one.',
    strong: [
      'test results',
      'medical report',
      'diagnosis',
      'biopsy',
      'screening result',
      'health insurance claim rejected',
      'hospital admission',
      'covid-19 positive',
      'covid positive',
      'mediclaim',
    ],
    weak: ['medical', 'clinic', 'health check', 'insurance claim', 'prescription', 'vaccination'],
    precedent: WMT,
  },
  {
    id: 'IMMIGRATION',
    label: 'Visa, immigration or right to work',
    severity: 'BLOCK',
    rationale:
      "A message that threatens someone's visa or right to remain targets precisely the people least able to absorb the shock, and may put them in contact with real anxiety about their family's status.",
    strong: [
      'visa status',
      'visa application',
      'work permit',
      'right to work',
      'immigration authority',
      'deportation',
      'residence permit',
      'green card',
      'h-1b',
      'h1b',
    ],
    weak: ['immigration', 'passport verification', 'sponsorship'],
  },
  {
    id: 'CHILDREN',
    label: "Children, schools or a family emergency",
    severity: 'BLOCK',
    rationale:
      "A simulated emergency involving someone's child is a cruelty dressed as a lesson, and it will be forwarded to a partner or a school before anyone reads the debrief.",
    strong: [
      'your child',
      'your son',
      'your daughter',
      'school emergency',
      'nursery',
      'child care emergency',
      'collect your child',
      'accident at school',
    ],
    weak: ['school', 'childcare', 'guardian', 'parent portal'],
  },
  {
    id: 'LEGAL_THREAT',
    label: 'Legal action, police or regulatory threat',
    severity: 'BLOCK',
    rationale:
      'Simulated legal jeopardy produces fear rather than learning, and recipients frequently escalate to real lawyers, real police or real regulators before the simulation is explained.',
    strong: [
      'legal action',
      'court summons',
      'police complaint',
      'first information report',
      'arrest warrant',
      'cease and desist',
      'criminal proceedings',
      'enforcement notice',
      'income tax notice',
      'tax evasion',
    ],
    weak: ['lawsuit', 'solicitor', 'attorney', 'subpoena', 'penalty notice'],
  },
  {
    id: 'DISCIPLINARY',
    label: 'Disciplinary action or misconduct allegation',
    severity: 'BLOCK',
    rationale:
      'An accusation of misconduct, even a simulated one, damages trust in HR and in the security team at the same time, and it is the fastest way to guarantee nobody reports a real phish again.',
    strong: [
      'disciplinary hearing',
      'disciplinary action',
      'misconduct',
      'formal warning',
      'investigation into your conduct',
      'show cause notice',
      'performance improvement plan',
      'grievance filed against you',
    ],
    weak: ['warning letter', 'conduct review', 'complaint against you'],
    precedent: NCSC,
  },
  {
    id: 'RELIGION_POLITICS',
    label: 'Religion, caste, ethnicity or political affiliation',
    severity: 'BLOCK',
    rationale:
      'Targeting or referencing protected characteristics is discriminatory regardless of intent, and it can constitute unlawful processing of special-category data.',
    strong: [
      'religious affiliation',
      'caste certificate',
      'political party',
      'temple donation',
      'church donation',
      'mosque donation',
      'ethnic origin',
    ],
    weak: ['religion', 'caste', 'community certificate'],
  },

  // ----------------------- CAUTION: allowed, flagged -----------------------
  {
    id: 'PERFORMANCE_REVIEW',
    label: 'Performance review or appraisal cycle',
    severity: 'CAUTION',
    rationale:
      'Plausible and work-relevant, which makes it a good lure — but it lands hard during an actual review cycle. Check the calendar before you send it.',
    strong: ['performance review', 'appraisal cycle', 'self-assessment form', 'review rating'],
    weak: ['appraisal', 'review form', 'goal setting'],
  },
  {
    id: 'TAX_PAYROLL',
    label: 'Payroll or tax documentation',
    severity: 'CAUTION',
    rationale:
      'A legitimate and very common real-world lure. Permitted, but keep it to documents rather than amounts, and never imply money is owed or withheld.',
    strong: ['payslip', 'form 16', 'p60', 'w-2', 'tax declaration', 'payroll portal'],
    weak: ['payroll', 'tax', 'salary slip', 'investment declaration'],
  },
  {
    id: 'BENEFITS',
    label: 'Benefits or insurance enrolment',
    severity: 'CAUTION',
    rationale:
      'Work-relevant and reasonable, but it sits next to the medical theme. Keep it administrative and avoid anything that reads as a claim decision.',
    strong: ['benefits enrolment', 'benefits enrollment', 'open enrolment', 'policy renewal'],
    weak: ['benefits', 'enrolment', 'premium', 'nominee'],
  },
  {
    id: 'CHARITY_DISASTER',
    label: 'Disaster relief or charitable appeal',
    severity: 'CAUTION',
    rationale:
      'Exploiting a live disaster is harmful; a generic charitable appeal is merely awkward. Flagged so a human decides which one this is.',
    strong: ['disaster relief fund', 'earthquake appeal', 'flood relief', 'emergency appeal'],
    weak: ['donation', 'charity', 'relief fund', 'fundraiser'],
  },
];

export const BLOCK_THEMES = THEMES.filter((t) => t.severity === 'BLOCK');
export const CAUTION_THEMES = THEMES.filter((t) => t.severity === 'CAUTION');

export function themeById(id: string): Theme | undefined {
  return THEMES.find((t) => t.id === id);
}
