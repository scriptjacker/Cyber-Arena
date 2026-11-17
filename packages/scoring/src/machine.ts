import { ActorClass, IpClass, type MachineAssessment, type MachineSignals } from '@chetna/core';

/**
 * Machine-traffic classification.
 *
 * Open-tracking pixels are unreliable in both directions. Apple Mail Privacy
 * Protection pre-fetches images through a proxy, registering an "open" for
 * someone who never read the message; enterprise secure email gateways and
 * scanners visit links, producing "clicks" no human made; and blocked images
 * cause false negatives in the other direction.
 *
 * Vendor estimates of the inflation range from 15 to 50 points. Rather than
 * pick a number and pretend, we score each event's machine likelihood, exclude
 * anything over the threshold from human metrics, AND publish the filtered
 * volume on the dashboard so the adjustment is visible instead of hidden.
 */

/** Substrings that identify automated fetchers rather than a person reading mail. */
const SCANNER_UA_PATTERNS: { pattern: RegExp; family: string }[] = [
  { pattern: /GoogleImageProxy/i, family: 'google-image-proxy' },
  { pattern: /YahooMailProxy/i, family: 'yahoo-proxy' },
  { pattern: /Barracuda/i, family: 'gateway-barracuda' },
  { pattern: /Proofpoint/i, family: 'gateway-proofpoint' },
  { pattern: /Mimecast/i, family: 'gateway-mimecast' },
  { pattern: /Symantec|Broadcom/i, family: 'gateway-symantec' },
  { pattern: /Microsoft Office Existence Discovery/i, family: 'ms-link-discovery' },
  { pattern: /BingPreview|bingbot/i, family: 'bing' },
  { pattern: /SkypeUriPreview/i, family: 'ms-uri-preview' },
  { pattern: /Slackbot|Discordbot|TelegramBot|WhatsApp/i, family: 'chat-unfurler' },
  { pattern: /curl|wget|python-requests|libwww|Go-http-client|okhttp|axios|node-fetch/i, family: 'script-client' },
  { pattern: /HeadlessChrome|Puppeteer|Playwright|PhantomJS/i, family: 'headless-browser' },
  { pattern: /bot\b|crawler|spider|scanner|monitor/i, family: 'generic-bot' },
];

/** Apple's MPP proxy presents as Mac/iOS Mail but fetches with no later interaction. */
const APPLE_MAIL_UA = /\bMail\/\d|AppleWebKit.*\bMobileMail\b|Mac OS X.*\bMail\b/i;

export const MACHINE_THRESHOLD = 0.5;

export function uaFamily(userAgent?: string): string {
  if (!userAgent) return 'unknown';
  for (const { pattern, family } of SCANNER_UA_PATTERNS) {
    if (pattern.test(userAgent)) return family;
  }
  if (APPLE_MAIL_UA.test(userAgent)) return 'apple-mail';
  if (/iPhone|iPad/i.test(userAgent)) return 'ios';
  if (/Android/i.test(userAgent)) return 'android';
  if (/Windows NT/i.test(userAgent)) return 'windows';
  if (/Macintosh/i.test(userAgent)) return 'macos';
  if (/Linux/i.test(userAgent)) return 'linux';
  return 'other';
}

/**
 * Additive signal weights. Documented here rather than buried, because anyone
 * reading our numbers is entitled to know how we decided what was a person.
 */
export const SIGNAL_WEIGHTS = {
  FAST_FETCH: 0.4, // within 2s of send — faster than a human could read it
  SCANNER_UA: 0.5, // a known gateway, proxy or script client
  SCANNER_IP: 0.3, // source classified as a scanner/datacentre range
  NO_LATER_INTERACTION: 0.1, // pixel loaded, nothing ever followed
  PREFETCH_MODE: 0.2, // Sec-Fetch-Mode consistent with image prefetch
  APPLE_MPP: 0.45, // Apple Mail client signature with no interaction
} as const;

export function assessMachine(signals: MachineSignals): MachineAssessment {
  const hit: string[] = [];
  let score = 0;

  const family = uaFamily(signals.userAgent);
  const isKnownScanner = SCANNER_UA_PATTERNS.some(
    ({ pattern }) => signals.userAgent && pattern.test(signals.userAgent),
  );

  if (typeof signals.msSinceSent === 'number' && signals.msSinceSent < 2000) {
    score += SIGNAL_WEIGHTS.FAST_FETCH;
    hit.push('fetched within 2s of sending');
  }
  if (isKnownScanner) {
    score += SIGNAL_WEIGHTS.SCANNER_UA;
    hit.push(`known automated client (${family})`);
  }
  if (signals.ipClass === IpClass.SCANNER) {
    score += SIGNAL_WEIGHTS.SCANNER_IP;
    hit.push('source address in a scanner range');
  }
  if (signals.hadLaterInteraction === false) {
    score += SIGNAL_WEIGHTS.NO_LATER_INTERACTION;
    hit.push('no interaction followed the fetch');
  }
  if (signals.secFetchMode === 'no-cors') {
    score += SIGNAL_WEIGHTS.PREFETCH_MODE;
    hit.push('image prefetch request pattern');
  }
  if (family === 'apple-mail' && signals.hadLaterInteraction === false) {
    score += SIGNAL_WEIGHTS.APPLE_MPP;
    hit.push('Apple Mail Privacy Protection proxy pattern');
  }

  const bounded = Math.min(1, score);
  return {
    score: bounded,
    actorClass:
      bounded >= MACHINE_THRESHOLD
        ? ActorClass.MACHINE
        : hit.length === 0
          ? ActorClass.HUMAN
          : ActorClass.UNKNOWN,
    signals: hit,
    uaFamily: family,
  };
}

/** Coarse IP classification. The raw address is never stored. */
export function classifyIp(ip: string | undefined): IpClass {
  if (!ip) return IpClass.OTHER;
  const v = ip.replace(/^::ffff:/, '').trim();
  if (v === '127.0.0.1' || v === '::1' || v.startsWith('127.')) return IpClass.LOOPBACK;
  if (/^10\./.test(v) || /^192\.168\./.test(v) || /^172\.(1[6-9]|2\d|3[01])\./.test(v)) {
    return IpClass.PRIVATE;
  }
  if (/^(169\.254|100\.64)\./.test(v)) return IpClass.PRIVATE;
  return IpClass.OTHER;
}
