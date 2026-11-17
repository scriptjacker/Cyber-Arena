import { parse, type HTMLElement } from 'node-html-parser';

/**
 * Allowlist sanitiser for replayed email bodies.
 *
 * Why this exists even though templates are linted at authoring time: the
 * linter is a DENYLIST, and denylists leak. `SL005` looked for
 * `on[a-z]+="..."` and would have missed `onload=alert(1)` with no quotes.
 * A template is also operator-authored, so a compromised or malicious console
 * account is a real threat model — not a hypothetical one.
 *
 * So the teachable moment renders through an ALLOWLIST instead: anything not
 * explicitly permitted is removed. Combined with the nonce-based CSP (which
 * blocks un-nonced inline script outright) and the authoring-time linter, an
 * injected script has to defeat three independent layers.
 *
 * Inline `style` is kept, because that is how real HTML email is built and the
 * replay has to look like the message the person actually received. Style is a
 * presentation channel; the dangerous functions inside it are stripped below.
 */

const ALLOWED_TAGS = new Set([
  'a', 'b', 'blockquote', 'br', 'caption', 'center', 'code', 'col', 'colgroup',
  'div', 'em', 'font', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'img',
  'li', 'mark', 'ol', 'p', 'pre', 'small', 'span', 'strong', 'sub', 'sup',
  'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'u', 'ul',
]);

/** Removed along with everything inside them. */
const DROP_WITH_CONTENT = new Set([
  'script', 'style', 'iframe', 'object', 'embed', 'noscript', 'template',
  'svg', 'math', 'form', 'input', 'textarea', 'select', 'button', 'option',
  'link', 'meta', 'base', 'applet', 'frame', 'frameset', 'audio', 'video',
  'source', 'track', 'canvas', 'portal',
]);

const ALLOWED_ATTRS = new Set([
  'align', 'alt', 'bgcolor', 'border', 'cellpadding', 'cellspacing', 'class',
  'colspan', 'color', 'dir', 'face', 'height', 'href', 'rowspan', 'size',
  'span', 'src', 'style', 'tabindex', 'title', 'valign', 'width',
  // Set by the cue annotator, and needed by the overlay UI.
  'data-cue-id',
]);

const SAFE_HREF = /^(https?:\/\/|mailto:|#|\/)/i;
const SAFE_IMG_SRC = /^(data:image\/(png|jpeg|gif|webp|svg\+xml);base64,|https?:\/\/|cid:|\/)/i;
const DANGEROUS_CSS = /(expression\s*\(|url\s*\(\s*['"]?\s*(javascript|data|vbscript):|@import|behavior\s*:)/i;

export interface SanitizeResult {
  html: string;
  /** What was removed, so the UI or a test can assert on it. */
  removed: { tags: string[]; attributes: string[] };
}

export function sanitizeEmailHtml(html: string): SanitizeResult {
  const root = parse(html, { comment: false });
  const removedTags: string[] = [];
  const removedAttrs: string[] = [];

  const visit = (node: HTMLElement): void => {
    for (const child of [...node.childNodes]) {
      const el = child as HTMLElement;
      const tag = el.rawTagName?.toLowerCase();
      if (!tag) continue; // text node

      if (DROP_WITH_CONTENT.has(tag)) {
        removedTags.push(tag);
        el.remove();
        continue;
      }

      if (!ALLOWED_TAGS.has(tag)) {
        // Unknown but not inherently dangerous: drop the tag, keep the text.
        removedTags.push(tag);
        el.replaceWith(el.innerHTML);
        continue;
      }

      for (const name of Object.keys(el.attributes)) {
        const lower = name.toLowerCase();
        const value = el.getAttribute(name) ?? '';

        // Every event handler, quoted or not. This is the hole the regex had.
        if (lower.startsWith('on')) {
          removedAttrs.push(`${tag}@${lower}`);
          el.removeAttribute(name);
          continue;
        }
        if (!ALLOWED_ATTRS.has(lower)) {
          removedAttrs.push(`${tag}@${lower}`);
          el.removeAttribute(name);
          continue;
        }
        if (lower === 'href' && !SAFE_HREF.test(value.trim())) {
          removedAttrs.push(`${tag}@href`);
          el.removeAttribute(name);
          continue;
        }
        if (lower === 'src' && !SAFE_IMG_SRC.test(value.trim())) {
          removedAttrs.push(`${tag}@src`);
          el.removeAttribute(name);
          continue;
        }
        if (lower === 'style' && DANGEROUS_CSS.test(value)) {
          removedAttrs.push(`${tag}@style`);
          el.removeAttribute(name);
          continue;
        }
      }

      visit(el);
    }
  };

  visit(root);

  return {
    html: root.toString(),
    removed: { tags: [...new Set(removedTags)], attributes: [...new Set(removedAttrs)] },
  };
}
