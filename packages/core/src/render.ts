import { BRAND } from './brand';

/**
 * Template rendering.
 *
 * Only these placeholders exist. The four URL placeholders expand to opaque
 * token paths — which is why safety-lint rule SL010 can guarantee that no URL
 * in any message ever carries personal data.
 */
export interface RenderVars {
  firstName: string;
  displayName: string;
  department: string;
  orgName: string;
  clickUrl: string;
  pixelUrl: string;
  qrUrl: string;
  reportUrl: string;
  watermarkId: string;
  today?: string;
}

/**
 * The watermark: invisible to a reader, trivially findable afterwards by a SOC
 * analyst, an investigator or the recipient's own mail search. Mandated by
 * safety-lint SL006 — a simulated message that cannot be identified as one
 * after the fact is just phishing.
 */
export function watermarkHtml(watermarkId: string): string {
  return (
    `<span data-${BRAND.watermarkPrefix}="${watermarkId}" ` +
    `style="display:none;color:transparent;font-size:0;line-height:0;max-height:0;overflow:hidden">` +
    `${watermarkId}</span>`
  );
}

const ESCAPE: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Participant-supplied values are escaped: a name is data, never markup. */
function esc(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ESCAPE[c] ?? c);
}

export function renderTemplate(html: string, vars: RenderVars): string {
  const map: Record<string, string> = {
    '{{firstName}}': esc(vars.firstName),
    '{{displayName}}': esc(vars.displayName),
    '{{department}}': esc(vars.department),
    '{{orgName}}': esc(vars.orgName),
    '{{clickUrl}}': vars.clickUrl,
    '{{pixelUrl}}': vars.pixelUrl,
    '{{qrUrl}}': vars.qrUrl,
    '{{reportUrl}}': vars.reportUrl,
    '{{watermark}}': watermarkHtml(vars.watermarkId),
    '{{today}}': esc(vars.today ?? new Date().toISOString().slice(0, 10)),
  };
  let out = html;
  for (const [token, value] of Object.entries(map)) out = out.split(token).join(value);
  return out;
}

export function renderSubject(subject: string, vars: RenderVars): string {
  return subject
    .split('{{firstName}}')
    .join(vars.firstName)
    .split('{{displayName}}')
    .join(vars.displayName)
    .split('{{department}}')
    .join(vars.department)
    .split('{{orgName}}')
    .join(vars.orgName);
}

/**
 * Headers every simulated message carries. These are what a mail gateway
 * allowlists on, and what proves after the fact that a message came from the
 * simulation platform rather than an attacker.
 */
export function simulationHeaders(watermarkId: string, campaignId: string): Record<string, string> {
  return {
    [BRAND.simulationHeader]: watermarkId,
    [BRAND.simulationHeaderAlt]: 'true',
    'X-Chetna-Campaign': campaignId,
    'Auto-Submitted': 'auto-generated',
  };
}

/** Build the four token URLs for one assignment. */
export function tokenUrls(simBaseUrl: string, token: string) {
  const base = simBaseUrl.replace(/\/+$/, '');
  return {
    clickUrl: `${base}/t/${token}`,
    pixelUrl: `${base}/p/${token}`,
    qrUrl: `${base}/q/${token}`,
    reportUrl: `${base}/r/${token}`,
  };
}
