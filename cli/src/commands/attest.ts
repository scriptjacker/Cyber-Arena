import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { BRAND, newId, sha256Hex, type LintStatus, type TemplateMeta } from '@chetna/core';
import { signMessage } from '@chetna/audit';
import { auditRepo, prisma, readJson } from '@chetna/db';
import {
  buildAttestation,
  FORBIDDEN_SOURCE_PATTERNS,
  runCredentialCanary,
  runLint,
  type SourceScanResult,
} from '@chetna/safety-lint';
import { fail, heading, info, kv, ok, warn } from '../lib/out';
import { loadOrCreateKeyPair } from '../lib/keys';

/**
 * ONLY the simulation surface is source-scanned.
 *
 * The admin console legitimately contains named inputs and forms — that is what
 * an admin form is. The claim being attested is narrower and sharper: the pages
 * a *simulated phishing link opens* contain no field, endpoint or form that
 * could receive a value. Scanning the console too would produce noise, and a
 * noisy check is one people learn to ignore.
 */
const SCAN_TARGETS = ['apps/sim'];
const SCAN_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.html'];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (SCAN_EXTENSIONS.some((e) => entry.endsWith(e))) out.push(full);
  }
  return out;
}

/**
 * Blank out comments while preserving line numbers and line lengths, so a
 * finding's reported line still points at the right place in the real file.
 *
 * The `(?<!:)` guard keeps `https://…` inside a string literal from being
 * treated as the start of a comment.
 */
export function stripComments(source: string): string {
  const blanked = source.replace(/\/\*[\s\S]*?\*\//g, (block) =>
    block.replace(/[^\n]/g, ' '),
  );
  return blanked
    .split('\n')
    .map((line) => line.replace(/(?<!:)\/\/.*$/, (tail) => ' '.repeat(tail.length)))
    .join('\n');
}

export function scanSources(root = process.cwd()): SourceScanResult {
  const scannedPaths: string[] = [];
  const skippedPaths: string[] = [];
  const violations: SourceScanResult['violations'] = [];
  let filesScanned = 0;

  for (const target of SCAN_TARGETS) {
    const dir = join(root, target);
    if (!existsSync(dir)) {
      skippedPaths.push(target);
      continue;
    }
    scannedPaths.push(target);
    for (const file of walk(dir)) {
      filesScanned++;
      const source = readFileSync(file, 'utf8');
      const rawLines = source.split(/\r?\n/);
      // Match against CODE, not prose. A comment explaining why a password
      // field is absent is not a password field, and a scanner that cannot
      // tell the difference is a scanner people learn to switch off.
      const codeLines = stripComments(source).split(/\r?\n/);

      codeLines.forEach((line, i) => {
        // Escape hatch for a genuine, reviewed exception.
        if (/chetna-attest-ignore/.test(rawLines[i] ?? '')) return;
        for (const { pattern, label } of FORBIDDEN_SOURCE_PATTERNS) {
          if (pattern.test(line)) {
            violations.push({
              file: relative(root, file).replace(/\\/g, '/'),
              line: i + 1,
              pattern: label,
              snippet: (rawLines[i] ?? line).trim().slice(0, 160),
            });
          }
        }
      });
    }
  }

  return { filesScanned, scannedPaths, skippedPaths, violations };
}

export async function attest(root = process.cwd()): Promise<{ verdict: string }> {
  heading(`${BRAND.name} — Non-Collection Attestation`);

  const templates = await prisma.template.findMany({ orderBy: { id: 'asc' } });
  const linted = templates.map((t) => {
    const meta: TemplateMeta = {
      name: t.name,
      channel: t.channel as TemplateMeta['channel'],
      scenario: t.scenario as TemplateMeta['scenario'],
      subject: t.subject,
      fromName: t.fromName,
      fromAddress: t.fromAddress,
      watermarkId: t.watermarkId,
      hasSimulationHeaders: true,
      attachments: readJson(t.attachmentsJson, [] as TemplateMeta['attachments']),
    };
    return { id: t.id, name: t.name, lint: runLint(t.html, meta, t.text ?? undefined) };
  });

  const canary = runCredentialCanary();
  const sourceScan = scanSources(root);

  const schemaPath = join(root, 'packages/db/prisma/schema.prisma');
  const schemaHash = existsSync(schemaPath)
    ? sha256Hex(readFileSync(schemaPath, 'utf8'))
    : 'schema-not-found';

  const doc = buildAttestation({
    version: '1.0.0-demo',
    templates: linted,
    canary,
    sourceScan,
    schemaHash,
  });

  // --------------------------------------------------------------- report
  kv('templates linted', doc.summary.templatesRun);
  kv('rules run per template', doc.summary.rulesRun);
  kv('templates failing lint', doc.summary.templateFailures);
  kv('credential canary', canary.passed ? 'rejected as required' : 'FAILED');
  kv('source files scanned', sourceScan.filesScanned);
  kv('source violations', sourceScan.violations.length);
  kv('schema hash', `${schemaHash.slice(0, 16)}…`);

  for (const t of linted) {
    const failures = t.lint.findings.filter((f) => f.severity === 'FAIL');
    if (failures.length === 0) continue;
    // A template deliberately seeded as harmful is still expected to LINT
    // clean; ethics blocks it, not the linter. So a lint failure here is real.
    fail(`${t.id}: ${failures.map((f) => f.ruleId).join(', ')}`);
  }

  for (const v of sourceScan.violations) {
    fail(`${v.file}:${v.line} — ${v.pattern}: ${v.snippet}`);
  }
  for (const skipped of sourceScan.skippedPaths) {
    warn(`${skipped} does not exist yet, so it could not be scanned`);
  }

  if (canary.passed) {
    ok(`hostile template rejected by ${canary.blockedBy.length} rules`);
  } else {
    fail(canary.detail);
  }

  // ------------------------------------------------------------ persist
  const platformKeys = loadOrCreateKeyPair('platform', root);
  const signatureB64 = signMessage(doc.documentHash, platformKeys.privateKeyPem);

  await prisma.safetyAttestation.create({
    data: {
      id: newId('att'),
      templatesRun: doc.summary.templatesRun,
      rulesRun: doc.summary.rulesRun,
      failures: doc.summary.templateFailures,
      canaryPassed: doc.summary.canaryPassed,
      schemaHash,
      documentJson: JSON.stringify(doc),
      signatureB64,
      publicKeyPem: platformKeys.publicKeyPem,
    },
  });

  const org = await prisma.org.findFirst();
  if (org) {
    await auditRepo.append({
      orgId: org.id,
      action: 'safety.attested',
      payload: {
        verdict: doc.summary.verdict,
        documentHash: doc.documentHash,
        templatesRun: doc.summary.templatesRun,
        canaryPassed: doc.summary.canaryPassed,
        sourceViolations: doc.summary.sourceViolations,
        scannedPaths: sourceScan.scannedPaths,
        skippedPaths: sourceScan.skippedPaths,
      },
    });
  }

  console.log('');
  if (doc.summary.verdict === 'ATTESTED') {
    ok(`ATTESTED · document ${doc.documentHash.slice(0, 16)}… signed`);
  } else if (doc.summary.verdict === 'INCOMPLETE') {
    warn(
      `INCOMPLETE · every check that could run passed, but ${sourceScan.skippedPaths.join(', ') || 'some targets'} could not be checked. An unproven claim is not reported as a pass.`,
    );
  } else {
    fail('FAILED · the non-collection claim does not hold. Fix before sending anything.');
  }
  info(`Claim: ${doc.claim}`);

  return { verdict: doc.summary.verdict };
}

export type { LintStatus };
