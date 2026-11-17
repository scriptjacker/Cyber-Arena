import { BRAND, type LintFinding, type TemplateMeta } from '@chetna/core';
import { parse, type HTMLElement } from 'node-html-parser';

/**
 * The only merge placeholders permitted inside a URL. Each expands to an opaque
 * 128-bit token path at send time. Nothing else may appear in a link, which is
 * how we guarantee no personal data ever reaches a URL, a referrer header or a
 * proxy log.
 */
export const URL_PLACEHOLDERS = ['{{clickUrl}}', '{{pixelUrl}}', '{{qrUrl}}', '{{reportUrl}}'] as const;

/** Placeholders allowed in body text, never in an attribute. */
export const TEXT_PLACEHOLDERS = [
  '{{displayName}}',
  '{{firstName}}',
  '{{department}}',
  '{{orgName}}',
  '{{watermark}}',
  '{{today}}',
] as const;

const TOKEN_PATH = /^\/(?:p|t|q|r)\/[A-Za-z0-9_-]{22}$/;
const INERT_ATTACHMENT_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'text/plain',
  'text/calendar',
]);
const DANGEROUS_EXTENSIONS =
  /\.(exe|scr|bat|cmd|com|ps1|vbs|js|jar|msi|dll|lnk|iso|img|zip|rar|7z|docm|xlsm|pptm|dotm|xlam)$/i;

export interface RuleContext {
  html: string;
  text?: string;
  meta: TemplateMeta;
  root: HTMLElement;
}

export interface Rule {
  id: string;
  severity: 'FAIL' | 'WARN';
  title: string;
  /** One sentence, shown in the Studio next to the finding. */
  rationale: string;
  run: (ctx: RuleContext) => LintFinding[];
}

const fail = (
  rule: Pick<Rule, 'id' | 'severity'>,
  message: string,
  remedy: string,
  snippet?: string,
): LintFinding => ({
  ruleId: rule.id,
  severity: rule.severity,
  message,
  remedy,
  ...(snippet ? { snippet: snippet.slice(0, 200) } : {}),
});

// ---------------------------------------------------------------------------

export const SL001: Rule = {
  id: 'SL001_NO_PASSWORD_INPUT',
  severity: 'FAIL',
  title: 'No password input may exist',
  rationale:
    'A real password field makes browsers and password managers autofill genuine credentials, which the page could then read. We remove the risk class rather than promise not to look.',
  run: (ctx) => {
    const out: LintFinding[] = [];
    for (const el of ctx.root.querySelectorAll('input')) {
      const type = (el.getAttribute('type') ?? 'text').toLowerCase();
      const ac = (el.getAttribute('autocomplete') ?? '').toLowerCase();
      if (type === 'password') {
        out.push(
          fail(SL001, 'A password input is present.', 'Delete the field entirely.', el.outerHTML),
        );
      } else if (ac.includes('password')) {
        out.push(
          fail(
            SL001,
            `An input requests password autofill (autocomplete="${ac}").`,
            'Remove the autocomplete attribute and the field.',
            el.outerHTML,
          ),
        );
      }
    }
    return out;
  },
};

export const SL002: Rule = {
  id: 'SL002_NO_NAMED_INPUT',
  severity: 'FAIL',
  title: 'No named input, textarea or select',
  rationale:
    'A field with a name is a field whose value can be submitted. Without names there is nothing to serialise, so there is nothing to capture.',
  run: (ctx) => {
    const out: LintFinding[] = [];
    for (const el of ctx.root.querySelectorAll('input, textarea, select')) {
      const name = el.getAttribute('name');
      if (name) {
        out.push(
          fail(
            SL002,
            `<${el.rawTagName}> has name="${name}", so its value could be submitted.`,
            'Remove the name attribute. Decoy panels need no names.',
            el.outerHTML,
          ),
        );
      }
    }
    return out;
  },
};

export const SL003: Rule = {
  id: 'SL003_NO_FORM_ACTION',
  severity: 'FAIL',
  title: 'No form may have a destination',
  rationale: 'A form with no action and no POST method has nowhere to send anything.',
  run: (ctx) => {
    const out: LintFinding[] = [];
    for (const form of ctx.root.querySelectorAll('form')) {
      const action = form.getAttribute('action');
      const method = (form.getAttribute('method') ?? '').toLowerCase();
      if (action) {
        out.push(
          fail(SL003, `A form posts to "${action}".`, 'Remove the action attribute.', form.outerHTML),
        );
      }
      if (method === 'post') {
        out.push(
          fail(SL003, 'A form declares method="post".', 'Remove the method attribute.', form.outerHTML),
        );
      }
    }
    for (const el of ctx.root.querySelectorAll('[formaction]')) {
      out.push(
        fail(
          SL003,
          `An element uses formaction="${el.getAttribute('formaction')}".`,
          'Remove the formaction attribute.',
          el.outerHTML,
        ),
      );
    }
    return out;
  },
};

export const SL004: Rule = {
  id: 'SL004_NO_EXTERNAL_POST',
  severity: 'FAIL',
  title: 'No programmatic exfiltration',
  rationale:
    'fetch, XMLHttpRequest and sendBeacon are the three ways a page can move data off it without a form.',
  run: (ctx) => {
    const out: LintFinding[] = [];
    const patterns: [RegExp, string][] = [
      [/\bfetch\s*\(/i, 'fetch('],
      [/XMLHttpRequest/i, 'XMLHttpRequest'],
      [/navigator\s*\.\s*sendBeacon/i, 'navigator.sendBeacon'],
      [/new\s+WebSocket/i, 'WebSocket'],
      [/new\s+EventSource/i, 'EventSource'],
    ];
    for (const [re, label] of patterns) {
      if (re.test(ctx.html)) {
        out.push(
          fail(
            SL004,
            `The template contains ${label}, which could transmit data.`,
            'Remove it. Templates are static content; telemetry is the platform’s job, not the template’s.',
          ),
        );
      }
    }
    return out;
  },
};

export const SL005: Rule = {
  id: 'SL005_NO_SCRIPT',
  severity: 'FAIL',
  title: 'No executable content',
  rationale:
    'Mail clients mostly strip scripts anyway; permitting them in authored templates would hand an operator an arbitrary-code primitive.',
  run: (ctx) => {
    const out: LintFinding[] = [];
    if (ctx.root.querySelectorAll('script').length > 0) {
      out.push(fail(SL005, 'A <script> element is present.', 'Remove it.'));
    }
    // Inspect parsed ATTRIBUTES rather than regexing the source. The earlier
    // regex required quotes around the value, so `onload=alert(1)` walked
    // straight past it. Any attribute whose name begins with "on" is an event
    // handler regardless of how its value is written.
    for (const el of ctx.root.querySelectorAll('*')) {
      for (const name of Object.keys(el.attributes)) {
        if (!name.toLowerCase().startsWith('on')) continue;
        out.push(
          fail(
            SL005,
            `An inline event handler is present: ${name} on <${el.rawTagName}>.`,
            'Remove the handler. Templates are static content.',
            el.outerHTML,
          ),
        );
      }
    }
    if (/javascript\s*:/i.test(ctx.html)) {
      out.push(fail(SL005, 'A javascript: URL is present.', 'Remove it.'));
    }
    if (ctx.root.querySelectorAll('iframe, object, embed').length > 0) {
      out.push(
        fail(SL005, 'An iframe, object or embed is present.', 'Remove it; use an image instead.'),
      );
    }
    return out;
  },
};

export const SL006: Rule = {
  id: 'SL006_WATERMARK_PRESENT',
  severity: 'FAIL',
  title: 'Simulation watermark and headers are mandatory',
  rationale:
    'Every simulated message must be identifiable as one after the fact — by the recipient, by the SOC, and by an investigator six months later.',
  run: (ctx) => {
    const out: LintFinding[] = [];
    if (!ctx.html.includes('{{watermark}}')) {
      out.push(
        fail(
          SL006,
          'The {{watermark}} placeholder is missing from the body.',
          `Insert {{watermark}} (it renders as an invisible ${BRAND.watermarkPrefix}-* marker).`,
        ),
      );
    }
    if (!ctx.meta.hasSimulationHeaders) {
      out.push(
        fail(
          SL006,
          `The message is not configured to carry the ${BRAND.simulationHeader} and ${BRAND.simulationHeaderAlt} headers.`,
          'Enable simulation headers on the template.',
        ),
      );
    }
    if (!ctx.meta.watermarkId || !ctx.meta.watermarkId.startsWith(BRAND.watermarkPrefix)) {
      out.push(
        fail(SL006, 'The template has no valid watermark id.', 'Regenerate the template watermark.'),
      );
    }
    return out;
  },
};

export const SL007: Rule = {
  id: 'SL007_KILL_LINK_PRESENT',
  severity: 'FAIL',
  title: 'A one-click report path is mandatory',
  rationale:
    'Reporting is the behaviour we are trying to build, so every message must make it possible — and it doubles as the escape hatch for anyone who feels uneasy.',
  run: (ctx) => {
    if (ctx.meta.channel === 'VOICE_TABLETOP') return [];
    return ctx.html.includes('{{reportUrl}}')
      ? []
      : [
          fail(
            SL007,
            'The {{reportUrl}} report link is missing.',
            'Add a "Report this message" link using {{reportUrl}}.',
          ),
        ];
  },
};

export const SL008: Rule = {
  id: 'SL008_NO_REMOTE_ASSET',
  severity: 'WARN',
  title: 'No remote or third-party brand assets',
  rationale:
    'Remote images leak recipient activity to a third party, break the offline demo, and risk using a trademark we have no licence to.',
  run: (ctx) => {
    const out: LintFinding[] = [];
    for (const img of ctx.root.querySelectorAll('img')) {
      const src = (img.getAttribute('src') ?? '').trim();
      if (!src) continue;
      if (src === '{{pixelUrl}}' || src.startsWith('data:') || src.startsWith('cid:')) continue;
      if (TOKEN_PATH.test(src)) continue;
      out.push(
        fail(
          SL008,
          `Image loads from "${src}".`,
          'Inline the asset as a data: URI or use a local placeholder.',
          img.outerHTML,
        ),
      );
    }
    return out;
  },
};

export const SL009: Rule = {
  id: 'SL009_NO_ATTACHMENT_PAYLOAD',
  severity: 'FAIL',
  title: 'Attachments must be inert',
  rationale:
    'A simulation teaches the lesson at the landing page. It never needs to ship a file that could execute anything.',
  run: (ctx) => {
    const out: LintFinding[] = [];
    for (const a of ctx.meta.attachments ?? []) {
      if (DANGEROUS_EXTENSIONS.test(a.filename)) {
        out.push(
          fail(SL009, `Attachment "${a.filename}" has an executable or archive extension.`, 'Use a PDF, PNG or text file.'),
        );
      }
      if (!INERT_ATTACHMENT_TYPES.has(a.contentType.toLowerCase())) {
        out.push(
          fail(
            SL009,
            `Attachment "${a.filename}" has content type "${a.contentType}", which is not on the inert allowlist.`,
            `Allowed: ${[...INERT_ATTACHMENT_TYPES].join(', ')}.`,
          ),
        );
      }
    }
    return out;
  },
};

export const SL010: Rule = {
  id: 'SL010_NO_PII_IN_URL',
  severity: 'FAIL',
  title: 'No personal data in any URL',
  rationale:
    'URLs end up in referrer headers, proxy logs, browser history and over shoulders. Opaque tokens mean a leaked URL reveals nothing about a person.',
  run: (ctx) => {
    const out: LintFinding[] = [];
    const seen: { el: HTMLElement; attr: string; value: string }[] = [];
    for (const el of ctx.root.querySelectorAll('[href], [src], [action], [background]')) {
      for (const attr of ['href', 'src', 'action', 'background']) {
        const v = el.getAttribute(attr);
        if (v) seen.push({ el, attr, value: v.trim() });
      }
    }

    for (const { el, attr, value } of seen) {
      if ((URL_PLACEHOLDERS as readonly string[]).includes(value)) continue;
      if (value.startsWith('#') || value.startsWith('data:') || value.startsWith('cid:')) continue;
      if (TOKEN_PATH.test(value)) continue;

      if (value.startsWith('mailto:')) {
        if (value.includes('?')) {
          out.push(
            fail(
              SL010,
              `mailto link carries query parameters: "${value}".`,
              'Use a bare mailto: address with no parameters.',
              el.outerHTML,
            ),
          );
        }
        continue;
      }

      // Any surviving URL is either a raw external link or a placeholder misuse.
      const placeholderMisuse = /\{\{\s*\w+\s*\}\}/.exec(value);
      if (placeholderMisuse) {
        out.push(
          fail(
            SL010,
            `URL in ${attr} uses the placeholder "${placeholderMisuse[0]}", which is not one of the four permitted link placeholders.`,
            `Use only ${URL_PLACEHOLDERS.join(', ')} inside links.`,
            el.outerHTML,
          ),
        );
        continue;
      }
      out.push(
        fail(
          SL010,
          `URL in ${attr} is not an opaque token path: "${value}".`,
          `Route every link through ${URL_PLACEHOLDERS.join(', ')}.`,
          el.outerHTML,
        ),
      );
    }

    // Belt and braces: an email address or obvious identifier anywhere in a URL.
    const urlish = seen.map((s) => s.value).join(' ');
    if (/[?&](email|mail|user|username|name|uid|employee|pid)=/i.test(urlish)) {
      out.push(
        fail(SL010, 'A URL carries an identifying query parameter.', 'Remove it; use the token path.'),
      );
    }
    if (/@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(urlish.replace(/mailto:[^\s"']+/gi, ''))) {
      out.push(
        fail(SL010, 'A URL appears to contain an email address.', 'Remove it; use the token path.'),
      );
    }
    return out;
  },
};

export const ALL_RULES: Rule[] = [
  SL001,
  SL002,
  SL003,
  SL004,
  SL005,
  SL006,
  SL007,
  SL008,
  SL009,
  SL010,
];

export function parseHtml(html: string): HTMLElement {
  return parse(html, { comment: true });
}
