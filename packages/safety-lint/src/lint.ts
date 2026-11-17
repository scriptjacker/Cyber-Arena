import {
  hashCanonical,
  LintStatus,
  type LintResult,
  type TemplateMeta,
} from '@chetna/core';
import { ALL_RULES, parseHtml, type RuleContext } from './rules';

/**
 * Canonical content hash for a template. Frozen into the signed campaign scope,
 * so editing a template after approval trips G5_TEMPLATE_HASH_MISMATCH.
 */
export function templateContentHash(meta: TemplateMeta, html: string, text?: string): string {
  return hashCanonical({
    subject: meta.subject,
    fromName: meta.fromName,
    fromAddress: meta.fromAddress,
    channel: meta.channel,
    scenario: meta.scenario,
    html,
    text: text ?? '',
    attachments: (meta.attachments ?? []).map((a) => ({
      filename: a.filename,
      contentType: a.contentType,
    })),
  });
}

/**
 * Run every rule. A single FAIL finding fails the template; WARN findings are
 * reported but do not block. Nothing in this function touches the network, the
 * filesystem or the database — it is a pure predicate over content, which is
 * what lets it run in the editor, in the policy engine and in CI alike.
 */
export function runLint(html: string, meta: TemplateMeta, text?: string): LintResult {
  const ctx: RuleContext = { html, text, meta, root: parseHtml(html) };
  const findings = ALL_RULES.flatMap((rule) => {
    try {
      return rule.run(ctx);
    } catch (err) {
      // A rule that throws must never be treated as a pass.
      return [
        {
          ruleId: rule.id,
          severity: 'FAIL' as const,
          message: `Rule ${rule.id} could not be evaluated: ${(err as Error).message}`,
          remedy: 'Simplify the template markup so it can be parsed.',
        },
      ];
    }
  });

  const failed = findings.some((f) => f.severity === 'FAIL');
  return {
    status: failed ? LintStatus.FAIL : LintStatus.PASS,
    findings,
    rulesRun: ALL_RULES.map((r) => r.id),
    contentHash: templateContentHash(meta, html, text),
  };
}

export function isPass(result: LintResult): boolean {
  return result.status === LintStatus.PASS;
}

export function failuresOnly(result: LintResult) {
  return result.findings.filter((f) => f.severity === 'FAIL');
}
