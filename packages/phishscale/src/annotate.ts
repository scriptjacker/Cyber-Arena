import type { DetectedCue } from '@chetna/core';
import { parse, type HTMLElement, type Node } from 'node-html-parser';

/**
 * Cue annotation — the reason this package exists.
 *
 * A difficulty score teaches nobody anything. What teaches is seeing the cues
 * you missed, highlighted in the exact message you were just fooled by. This
 * walks the TEXT NODES of the original email and wraps each cue's anchor text,
 * leaving the markup, layout and styling intact.
 *
 * Text nodes only, deliberately: a naive string replace would corrupt
 * attributes, break tags, and happily "annotate" the inside of a style block.
 */

export interface AnnotateOptions {
  /** Class applied to each highlight. */
  className?: string;
  /** Cue ids to highlight. Defaults to all of them. */
  only?: string[];
}

export interface AnnotateResult {
  html: string;
  /** Cues whose anchor text was found and highlighted. */
  anchored: string[];
  /**
   * Cues with no locatable anchor — structural observations such as "no
   * branding" or "unnaturally polished prose" that are not a span of text.
   * The UI lists these separately rather than pretending they were highlighted.
   */
  unanchored: string[];
}

const ESCAPE: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
};
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ESCAPE[c] ?? c);

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'HEAD', 'TITLE', 'NOSCRIPT']);

function isTextNode(node: Node): boolean {
  return node.nodeType === 3;
}

export function annotateCues(
  html: string,
  cues: readonly DetectedCue[],
  options: AnnotateOptions = {},
): AnnotateResult {
  const className = options.className ?? 'chetna-cue';
  const wanted = options.only ? cues.filter((c) => options.only?.includes(c.id)) : [...cues];

  const anchored = new Set<string>();
  const withAnchor = wanted.filter((c) => c.anchor?.text && c.anchor.text.trim().length > 1);
  const root = parse(html, { comment: true });

  // Longest anchors first, so a short cue cannot consume part of a longer one.
  const ordered = [...withAnchor].sort(
    (a, b) => (b.anchor?.text.length ?? 0) - (a.anchor?.text.length ?? 0),
  );

  const walk = (node: HTMLElement): void => {
    if (SKIP_TAGS.has(node.rawTagName?.toUpperCase() ?? '')) return;
    for (const child of [...node.childNodes]) {
      if (isTextNode(child)) {
        const original = child.rawText;
        if (!original || !original.trim()) continue;

        // Claim non-overlapping spans against the ORIGINAL text, longest cue
        // first. Doing it this way rather than substituting as we go matters:
        // a short cue ("hours") would otherwise match inside a longer cue's
        // replacement ("within 24 hours") and corrupt it.
        const lower = original.toLowerCase();
        const claimed: { start: number; end: number; cueId: string }[] = [];

        for (const cue of ordered) {
          const needle = cue.anchor?.text;
          if (!needle || anchored.has(cue.id)) continue;
          const n = needle.toLowerCase();
          for (let from = 0; ; ) {
            const start = lower.indexOf(n, from);
            if (start < 0) break;
            const end = start + n.length;
            if (!claimed.some((c) => start < c.end && end > c.start)) {
              claimed.push({ start, end, cueId: cue.id });
              anchored.add(cue.id);
              break;
            }
            from = start + 1;
          }
        }

        if (claimed.length > 0) {
          claimed.sort((a, b) => a.start - b.start);
          let out = '';
          let cursor = 0;
          for (const c of claimed) {
            out += esc(original.slice(cursor, c.start));
            out +=
              `<mark class="${className}" data-cue-id="${esc(c.cueId)}" tabindex="0">` +
              `${esc(original.slice(c.start, c.end))}</mark>`;
            cursor = c.end;
          }
          out += esc(original.slice(cursor));

          // node-html-parser emits a text node's `rawText` verbatim, so writing
          // pre-escaped markup here inserts the highlight without re-parsing
          // the document. The cast is needed because `rawText` is declared
          // read-only on the base Node type; `annotate.test.ts` asserts the
          // behaviour rather than trusting it.
          (child as unknown as { rawText: string }).rawText = out;
        }
      } else {
        walk(child as HTMLElement);
      }
    }
  };

  walk(root);

  return {
    html: root.toString(),
    anchored: [...anchored],
    unanchored: wanted.filter((c) => !anchored.has(c.id)).map((c) => c.id),
  };
}

/**
 * The three checks that would have caught a given lure, derived from its cues.
 * Shown under the annotated email, because "here is what to do differently" is
 * the only part of a teachable moment that changes behaviour.
 */
export function actionsForCues(cues: readonly DetectedCue[]): string[] {
  const actions = new Map<string, string>();
  for (const cue of cues) {
    switch (cue.tag) {
      case 'LOOKALIKE_DOMAIN':
      case 'BRAND_IMPERSONATION':
        actions.set('domain', 'Read the sender domain from the final dot backwards.');
        break;
      case 'REPLY_TO_MISMATCH':
        actions.set('reply', 'Check where a reply would actually go before you answer.');
        break;
      case 'URGENCY':
        actions.set('urgency', 'Treat time pressure as a reason to slow down, not speed up.');
        break;
      case 'AUTHORITY':
        actions.set('authority', 'Verify the person, not the job title — on a number you already had.');
        break;
      case 'CREDENTIAL_PROMPT':
        actions.set('signin', 'Never sign in from a link. Reach the service through your own bookmark.');
        break;
      case 'ATTACHMENT_LURE':
        actions.set('attachment', 'An attachment you did not ask for is not an attachment you should open.');
        break;
      case 'QR_LURE':
        actions.set('qr', 'A QR code is a link you cannot inspect. Find the service yourself instead.');
        break;
      case 'MFA_PUSH':
        actions.set('mfa', 'Approve only a prompt you caused yourself, seconds ago.');
        break;
      case 'PAYMENT_CHANGE':
        actions.set('payment', 'Confirm every change to payment details by voice, on a known number.');
        break;
      case 'GENERIC_GREETING':
        actions.set('greeting', 'Your employer knows your name. A generic greeting is a signal.');
        break;
      case 'AI_GENERATED_POLISH':
      case 'SPELLING_GRAMMAR':
        actions.set('writing', 'Judge the sender and the destination, not the quality of the writing.');
        break;
      default:
        break;
    }
  }
  return [...actions.values()].slice(0, 3);
}
