import { BRAND, hashCanonical, LintStatus, type LintResult } from '@chetna/core';
import { ALL_RULES } from './rules';
import type { CanaryResult } from './canary';

/**
 * The Non-Collection Attestation.
 *
 * A promise in a policy document is unfalsifiable. This is the falsifiable
 * version: the rules that ran, the templates they ran against, the hostile
 * canary that was rejected, and a scan of the simulation app's own source for
 * credential sinks — all hashed and signed, and rendered publicly at /attest.
 */
export interface SourceScanResult {
  filesScanned: number;
  /** Which trees were actually scanned. Zero paths means the claim is unproven. */
  scannedPaths: string[];
  /** Trees that were expected but absent — reported, never silently ignored. */
  skippedPaths: string[];
  /** Any credential-shaped pattern found in the simulation surface's source. */
  violations: { file: string; line: number; pattern: string; snippet: string }[];
}

export interface AttestationDocument {
  product: string;
  version: string;
  createdAt: string;
  claim: string;
  rules: { id: string; severity: string; title: string; rationale: string }[];
  templates: { id: string; name: string; status: string; failures: number }[];
  canary: CanaryResult;
  sourceScan: SourceScanResult;
  schemaHash: string;
  summary: {
    templatesRun: number;
    rulesRun: number;
    templateFailures: number;
    canaryPassed: boolean;
    sourceViolations: number;
    /**
     * ATTESTED   — every check ran and passed.
     * INCOMPLETE — the checks that ran passed, but something could not be
     *              checked (typically: the simulation app does not exist yet).
     *              Deliberately NOT reported as a pass; an unproven claim is
     *              not a claim.
     * FAILED     — a check failed.
     */
    verdict: 'ATTESTED' | 'INCOMPLETE' | 'FAILED';
  };
  documentHash: string;
}

export interface AttestationInput {
  version: string;
  templates: { id: string; name: string; lint: LintResult }[];
  canary: CanaryResult;
  sourceScan: SourceScanResult;
  /** Hash of prisma/schema.prisma, so the claim is tied to a specific schema. */
  schemaHash: string;
  now?: Date;
}

export function buildAttestation(input: AttestationInput): AttestationDocument {
  const templates = input.templates.map((t) => ({
    id: t.id,
    name: t.name,
    status: t.lint.status,
    failures: t.lint.findings.filter((f) => f.severity === 'FAIL').length,
  }));
  const templateFailures = templates.filter((t) => t.status === LintStatus.FAIL).length;
  const checksPassed =
    templateFailures === 0 && input.canary.passed && input.sourceScan.violations.length === 0;
  const everythingWasChecked =
    templates.length > 0 && input.sourceScan.scannedPaths.length > 0;
  const verdict: 'ATTESTED' | 'INCOMPLETE' | 'FAILED' = !checksPassed
    ? 'FAILED'
    : everythingWasChecked
      ? 'ATTESTED'
      : 'INCOMPLETE';

  const doc: Omit<AttestationDocument, 'documentHash'> = {
    product: BRAND.name,
    version: input.version,
    createdAt: (input.now ?? new Date()).toISOString(),
    claim:
      'No template in this deployment can collect a credential, and the simulation surface contains no endpoint, field or column capable of receiving one.',
    rules: ALL_RULES.map((r) => ({
      id: r.id,
      severity: r.severity,
      title: r.title,
      rationale: r.rationale,
    })),
    templates,
    canary: input.canary,
    sourceScan: input.sourceScan,
    schemaHash: input.schemaHash,
    summary: {
      templatesRun: templates.length,
      rulesRun: ALL_RULES.length,
      templateFailures,
      canaryPassed: input.canary.passed,
      sourceViolations: input.sourceScan.violations.length,
      verdict,
    },
  };

  return { ...doc, documentHash: hashCanonical(doc) };
}

/**
 * Patterns that must not appear in the simulation surface's source. Checked by
 * the CLI against apps/sim, because a safe template served by an unsafe app
 * would still be unsafe.
 */
export const FORBIDDEN_SOURCE_PATTERNS: { pattern: RegExp; label: string }[] = [
  // Quoted, unquoted and JSX-expression forms, since all three are valid ways
  // to write it and only one of them is the obvious one.
  { pattern: /type\s*=\s*\{?\s*["']?password["']?\s*\}?/i, label: 'password input' },
  { pattern: /autocomplete\s*=\s*["'][^"']*password[^"']*["']/i, label: 'password autofill hint' },
  { pattern: /<input[^>]+\bname\s*=/i, label: 'named input' },
  { pattern: /<form[^>]+\baction\s*=/i, label: 'form with an action' },
  { pattern: /\bformData\s*\.\s*get\s*\(/i, label: 'form value read' },
  { pattern: /\breq(uest)?\s*\.\s*body\s*\.\s*(password|pass|pwd|secret|token)\b/i, label: 'credential read from a request body' },
];
