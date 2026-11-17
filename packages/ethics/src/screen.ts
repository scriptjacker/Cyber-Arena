import { EthicsStatus, type EthicsFinding, type EthicsResult } from '@chetna/core';
import { THEMES, type Theme } from './taxonomy';

/**
 * Strip HTML to a plain-text haystack, then normalise whitespace and common
 * obfuscations. We deliberately look at the rendered words, not the markup, so
 * that `b<span>on</span>us` is still "bonus".
 */
export function toHaystack(subject: string, html: string, text?: string): string {
  const stripped = html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    // Remove tags WITHOUT inserting a separator, so split words rejoin.
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCharCode(Number(d)));

  return [subject, stripped, text ?? '']
    .join('\n')
    .toLowerCase()
    .replace(/[‘’“”]/g, "'")
    .replace(/[-_]{2,}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function matches(haystack: string, needle: string): boolean {
  const n = needle.toLowerCase();
  // Word boundaries only make sense for ASCII; Devanagari terms match directly.
  if (/^[\x20-\x7e]+$/.test(n)) {
    const escaped = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    return new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`, 'i').test(haystack);
  }
  return haystack.includes(n);
}

function evaluateTheme(theme: Theme, haystack: string): string[] | null {
  const strongHits = theme.strong.filter((t) => matches(haystack, t));
  if (strongHits.length > 0) return strongHits;

  const weakHits = theme.weak.filter((t) => matches(haystack, t));
  // Two independent weak signals, so a single incidental word cannot block a
  // template. False positives here cost an operator real time, and an engine
  // people route around is worse than no engine.
  if (weakHits.length >= 2) return weakHits;
  return null;
}

export interface ScreenOptions {
  /** Themes this org has consciously disabled, with a logged reason. */
  disabledThemeIds?: string[];
}

/**
 * Screen a template for harmful lure themes.
 *
 * BLOCKED  — at least one BLOCK theme fired. The template cannot be sent
 *            without a signed HR override (gate G5).
 * FLAGGED  — only CAUTION themes fired. Sendable; a human has been told why
 *            they might not want to.
 * CLEAR    — nothing fired.
 */
export function screenTemplate(
  subject: string,
  html: string,
  text?: string,
  options: ScreenOptions = {},
): EthicsResult {
  const haystack = toHaystack(subject, html, text);
  const disabled = new Set(options.disabledThemeIds ?? []);
  const findings: EthicsFinding[] = [];

  for (const theme of THEMES) {
    if (disabled.has(theme.id)) continue;
    const matched = evaluateTheme(theme, haystack);
    if (!matched) continue;
    findings.push({
      themeId: theme.id,
      label: theme.label,
      severity: theme.severity,
      matched,
      rationale: theme.rationale,
      ...(theme.precedent ? { precedent: theme.precedent } : {}),
    });
  }

  const blocked = findings.some((f) => f.severity === 'BLOCK');
  return {
    status: blocked
      ? EthicsStatus.BLOCKED
      : findings.length > 0
        ? EthicsStatus.FLAGGED
        : EthicsStatus.CLEAR,
    findings,
  };
}

export interface OverrideRecord {
  themes: string[];
  justification: string;
  approvedByHrId: string;
  signatureB64: string;
}

/**
 * Apply a signed HR override. Every blocked theme must be named explicitly —
 * an override is permission for specific, enumerated harm, not a blanket pass.
 * Signature verification itself happens in @chetna/audit; this function decides
 * whether the override is sufficient in scope.
 */
export function applyOverride(
  result: EthicsResult,
  override: OverrideRecord | null,
): EthicsResult & { overrideSufficient: boolean; unaddressedThemes: string[] } {
  if (result.status !== EthicsStatus.BLOCKED) {
    return { ...result, overrideSufficient: true, unaddressedThemes: [] };
  }
  const blockedIds = result.findings.filter((f) => f.severity === 'BLOCK').map((f) => f.themeId);
  if (!override) {
    return { ...result, overrideSufficient: false, unaddressedThemes: blockedIds };
  }
  const covered = new Set(override.themes);
  const unaddressed = blockedIds.filter((id) => !covered.has(id));
  if (unaddressed.length > 0) {
    return { ...result, overrideSufficient: false, unaddressedThemes: unaddressed };
  }
  return {
    status: EthicsStatus.OVERRIDDEN,
    findings: result.findings,
    overrideSufficient: true,
    unaddressedThemes: [],
  };
}

/** The sentence the Studio shows above a block. */
export function blockHeadline(result: EthicsResult): string | null {
  const first = result.findings.find((f) => f.severity === 'BLOCK');
  if (!first) return null;
  return `Blocked: this lure uses the "${first.label}" theme.`;
}
