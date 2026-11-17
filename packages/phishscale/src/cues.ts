import {
  CueCategory,
  CueTag,
  domainOf,
  type DetectedCue,
  type TemplateMeta,
} from '@chetna/core';
import { parse } from 'node-html-parser';

/**
 * Cue detection for the NIST Phish Scale.
 *
 * NIST sorts observable cues into five categories — errors, technical
 * indicators, visual presentation, language and content, and common tactics —
 * and counts them. FEWER cues means a HARDER email to detect. Combined with how
 * well the premise fits the recipient's work, that gives a detection-difficulty
 * rating.
 *
 * Every cue carries an anchor so the teachable moment can highlight it in the
 * exact email the person received. That mapping is the reason this package
 * exists: a difficulty number alone teaches nobody anything.
 *
 * Reference: https://csrc.nist.gov/pubs/journal/2020/09/categorizing-human-phishing-detection-difficulty-a/final
 */

export interface CueInput {
  subject: string;
  html: string;
  text?: string;
  meta: TemplateMeta;
  /** The organisation's own mail domain, for lookalike detection. */
  orgDomain?: string;
}

interface Detector {
  id: string;
  category: CueCategory;
  tag: CueTag;
  label: string;
  explanation: string;
  detect: (ctx: PreparedInput) => { anchor?: string } | null;
}

interface PreparedInput extends CueInput {
  plain: string;
  plainLower: string;
  subjectLower: string;
  anchors: { href: string; text: string }[];
  imgCount: number;
  imgWithoutAlt: number;
  hasQr: boolean;
}

function prepare(input: CueInput): PreparedInput {
  const root = parse(input.html);
  const plain = root
    .textContent.replace(/&nbsp;/gi, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim();
  const anchors = root.querySelectorAll('a').map((a) => ({
    href: (a.getAttribute('href') ?? '').trim(),
    text: a.textContent.trim(),
  }));
  const imgs = root.querySelectorAll('img');
  return {
    ...input,
    plain,
    plainLower: plain.toLowerCase(),
    subjectLower: input.subject.toLowerCase(),
    anchors,
    imgCount: imgs.length,
    imgWithoutAlt: imgs.filter((i) => !i.getAttribute('alt')).length,
    hasQr:
      input.meta.channel === 'QR' ||
      /qr[\s-]?code|scan (?:the|this) (?:code|qr)/i.test(`${input.subject} ${plain}`),
  };
}

const phrase = (hay: string, list: string[]): string | null => {
  for (const p of list) {
    const i = hay.toLowerCase().indexOf(p.toLowerCase());
    if (i >= 0) return hay.slice(i, i + p.length);
  }
  return null;
};

// --------------------------------------------------------------------------
// 1. ERRORS
// --------------------------------------------------------------------------

const MISSPELLINGS = [
  'recieve',
  'recieved',
  'immediatly',
  'verifcation',
  'verfiy',
  'acount',
  'accont',
  'payement',
  'succesful',
  'sucessful',
  'adress',
  'occured',
  'seperate',
  'neccessary',
  'maintainance',
  'kindly revert',
  'do the needful',
  'dear valued costumer',
];

const D_MISSPELLING: Detector = {
  id: 'ERR_SPELLING',
  category: CueCategory.ERRORS,
  tag: CueTag.SPELLING_GRAMMAR,
  label: 'Spelling or grammar error',
  explanation:
    'Legitimate bulk mail from a large organisation is usually proofread. A misspelling is one of the cheapest cues to spot — though note that modern AI-written lures no longer have them.',
  detect: (c) => {
    const hit = phrase(`${c.subject} ${c.plain}`, MISSPELLINGS);
    return hit ? { anchor: hit } : null;
  },
};

const D_PUNCTUATION: Detector = {
  id: 'ERR_PUNCTUATION',
  category: CueCategory.ERRORS,
  tag: CueTag.SPELLING_GRAMMAR,
  label: 'Excessive or inconsistent punctuation',
  explanation:
    'Strings of exclamation marks, or ALL-CAPS words mid-sentence, signal an author trying to manufacture urgency rather than a corporate template.',
  detect: (c) => {
    const m = /!{2,}|\?{2,}/.exec(`${c.subject} ${c.plain}`);
    if (m) return { anchor: m[0] };
    const caps = /\b[A-Z]{5,}\b/.exec(c.plain.replace(/\b(?:IT|HR|VPN|MFA|OTP|URL|PDF|QR|SSO|CEO|CFO|GST|PAN|KYC|SMS|API)\b/g, ''));
    return caps ? { anchor: caps[0] } : null;
  },
};

// --------------------------------------------------------------------------
// 2. TECHNICAL INDICATORS
// --------------------------------------------------------------------------

const D_DISPLAY_NAME_MISMATCH: Detector = {
  id: 'TECH_DISPLAY_NAME_MISMATCH',
  category: CueCategory.TECHNICAL_INDICATORS,
  tag: CueTag.BRAND_IMPERSONATION,
  label: 'Sender name does not match the sending address',
  explanation:
    'The display name is free text that anyone can set. Checking the actual address behind it is the single highest-value habit in email security.',
  detect: (c) => {
    const local = c.meta.fromAddress.split('@')[0]?.toLowerCase() ?? '';
    const nameWords = c.meta.fromName
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3);
    if (nameWords.length === 0) return null;
    const overlap = nameWords.some((w) => local.includes(w.slice(0, 4)));
    return overlap ? null : { anchor: c.meta.fromAddress };
  },
};

const D_LOOKALIKE_DOMAIN: Detector = {
  id: 'TECH_LOOKALIKE_DOMAIN',
  category: CueCategory.TECHNICAL_INDICATORS,
  tag: CueTag.LOOKALIKE_DOMAIN,
  label: 'Lookalike sender domain',
  explanation:
    'The domain resembles one you trust but is not it — an extra word, a hyphen, a different suffix. Read domains right-to-left from the final dot.',
  detect: (c) => {
    const from = domainOf(c.meta.fromAddress);
    if (!from) return null;
    if (!c.orgDomain) {
      return /-(?:secure|login|verify|support|portal|account|team|service|hr|it)\b|\b(?:secure|login|verify|support|portal|account)-/.test(
        from,
      )
        ? { anchor: from }
        : null;
    }
    if (from === c.orgDomain) return null;
    const orgLabel = c.orgDomain.split('.')[0] ?? '';
    if (orgLabel.length >= 4 && from.includes(orgLabel)) return { anchor: from };
    return null;
  },
};

const D_REPLY_TO_MISMATCH: Detector = {
  id: 'TECH_REPLY_TO',
  category: CueCategory.TECHNICAL_INDICATORS,
  tag: CueTag.REPLY_TO_MISMATCH,
  label: 'Reply path differs from the sender',
  explanation:
    'A reply-to on a different domain means your answer goes somewhere other than where the mail appears to come from. Classic in business-email-compromise.',
  detect: (c) => {
    const mailto = c.anchors.find((a) => a.href.startsWith('mailto:'));
    if (!mailto) return null;
    const replyDomain = domainOf(mailto.href.replace(/^mailto:/i, ''));
    const fromDomain = domainOf(c.meta.fromAddress);
    return replyDomain && replyDomain !== fromDomain ? { anchor: mailto.text || mailto.href } : null;
  },
};

const D_LINK_TEXT_MISMATCH: Detector = {
  id: 'TECH_LINK_TEXT_MISMATCH',
  category: CueCategory.TECHNICAL_INDICATORS,
  tag: CueTag.LOOKALIKE_DOMAIN,
  label: 'Link text claims a destination it is not',
  explanation:
    'The visible text of a link is decoration. Hovering to read the real destination before clicking defeats most link-based phishing.',
  detect: (c) => {
    const claim = c.anchors.find((a) => /^(https?:\/\/|www\.)/i.test(a.text));
    return claim ? { anchor: claim.text } : null;
  },
};

const D_INSECURE_URL: Detector = {
  id: 'TECH_INSECURE_URL',
  category: CueCategory.TECHNICAL_INDICATORS,
  tag: CueTag.LOOKALIKE_DOMAIN,
  label: 'Insecure or raw-IP destination mentioned',
  explanation:
    'A corporate service will not ask you to visit a plain http:// address or a bare IP address.',
  detect: (c) => {
    const m = /http:\/\/[^\s"'<]+|\b\d{1,3}(?:\.\d{1,3}){3}\b/.exec(`${c.plain} ${c.anchors.map((a) => a.text).join(' ')}`);
    return m ? { anchor: m[0] } : null;
  },
};

const D_ATTACHMENT: Detector = {
  id: 'TECH_ATTACHMENT',
  category: CueCategory.TECHNICAL_INDICATORS,
  tag: CueTag.ATTACHMENT_LURE,
  label: 'Unexpected attachment',
  explanation:
    'An attachment you did not ask for, especially one that claims to need opening to resolve something, is a standard delivery mechanism.',
  detect: (c) => {
    const a = c.meta.attachments?.[0];
    return a ? { anchor: a.filename } : null;
  },
};

// --------------------------------------------------------------------------
// 3. VISUAL PRESENTATION
// --------------------------------------------------------------------------

const D_NO_BRANDING: Detector = {
  id: 'VIS_NO_BRANDING',
  category: CueCategory.VISUAL_PRESENTATION,
  tag: CueTag.BRAND_IMPERSONATION,
  label: 'Branding absent or inconsistent',
  explanation:
    'Internal communications normally carry consistent branding. A bare message claiming to be from a corporate system is worth a second look.',
  detect: (c) => (c.imgCount === 0 ? { anchor: undefined } : null),
};

const D_IMG_NO_ALT: Detector = {
  id: 'VIS_IMG_NO_ALT',
  category: CueCategory.VISUAL_PRESENTATION,
  tag: CueTag.BRAND_IMPERSONATION,
  label: 'Images without alternative text',
  explanation:
    'Marketing and IT templates normally include alt text. Its absence suggests the message was assembled quickly, or that images are hiding text from filters.',
  detect: (c) => (c.imgWithoutAlt > 0 ? { anchor: undefined } : null),
};

const D_NO_FOOTER: Detector = {
  id: 'VIS_NO_FOOTER',
  category: CueCategory.VISUAL_PRESENTATION,
  tag: CueTag.BRAND_IMPERSONATION,
  label: 'No signature block or organisational footer',
  explanation:
    'Legitimate bulk internal mail usually identifies the sending team and how to reach them by another route.',
  detect: (c) =>
    /regards|sincerely|thanks,|team\b|helpdesk|service desk|do not reply|©|all rights reserved/i.test(
      c.plain,
    )
      ? null
      : { anchor: undefined },
};

// --------------------------------------------------------------------------
// 4. LANGUAGE AND CONTENT
// --------------------------------------------------------------------------

const GENERIC_GREETINGS = [
  'dear user',
  'dear customer',
  'dear employee',
  'dear sir/madam',
  'dear sir or madam',
  'dear valued',
  'dear account holder',
  'dear member',
  'hello user',
  'attention user',
];

const D_GENERIC_GREETING: Detector = {
  id: 'LANG_GENERIC_GREETING',
  category: CueCategory.LANGUAGE_AND_CONTENT,
  tag: CueTag.GENERIC_GREETING,
  label: 'Generic greeting',
  explanation:
    'Your employer knows your name. A greeting that does not use it suggests a message sent to a list someone bought or scraped.',
  detect: (c) => {
    const hit = phrase(c.plain, GENERIC_GREETINGS);
    return hit ? { anchor: hit } : null;
  },
};

const URGENCY = [
  'within 24 hours',
  'within 2 hours',
  'immediately',
  'urgent action',
  'action required',
  'expires today',
  'expires in',
  'before end of day',
  'final reminder',
  'last warning',
  'act now',
  'time sensitive',
  'as soon as possible',
];

const D_URGENCY: Detector = {
  id: 'LANG_URGENCY',
  category: CueCategory.LANGUAGE_AND_CONTENT,
  tag: CueTag.URGENCY,
  label: 'Manufactured time pressure',
  explanation:
    'Urgency is the attacker’s core tool: it stops you checking. Any message that needs you to act in minutes deserves the most scrutiny, not the least.',
  detect: (c) => {
    const hit = phrase(`${c.subject} ${c.plain}`, URGENCY);
    return hit ? { anchor: hit } : null;
  },
};

const CONSEQUENCE = [
  'will be suspended',
  'will be deactivated',
  'will be deleted',
  'will be locked',
  'will lose access',
  'account closure',
  'permanently removed',
  'service interruption',
  'failure to comply',
];

const D_CONSEQUENCE: Detector = {
  id: 'LANG_CONSEQUENCE',
  category: CueCategory.LANGUAGE_AND_CONTENT,
  tag: CueTag.URGENCY,
  label: 'Threatened consequence',
  explanation:
    'A threat of losing access or service is designed to make you comply before you verify. Real IT teams rarely threaten.',
  detect: (c) => {
    const hit = phrase(`${c.subject} ${c.plain}`, CONSEQUENCE);
    return hit ? { anchor: hit } : null;
  },
};

const CREDENTIAL_REQUEST = [
  'verify your password',
  'confirm your password',
  'enter your password',
  'validate your credentials',
  'confirm your login',
  'sign in to verify',
  'login to confirm',
  're-enter your credentials',
  'verify your account',
  'confirm your identity',
];

const D_CREDENTIAL_REQUEST: Detector = {
  id: 'LANG_CREDENTIAL_REQUEST',
  category: CueCategory.LANGUAGE_AND_CONTENT,
  tag: CueTag.CREDENTIAL_PROMPT,
  label: 'Asks you to sign in or confirm credentials',
  explanation:
    'No legitimate internal process needs you to re-enter a password from an email link. Navigate to the service yourself, from a bookmark.',
  detect: (c) => {
    const hit = phrase(`${c.subject} ${c.plain}`, CREDENTIAL_REQUEST);
    return hit ? { anchor: hit } : null;
  },
};

const D_PAYMENT_CHANGE: Detector = {
  id: 'LANG_PAYMENT_CHANGE',
  category: CueCategory.LANGUAGE_AND_CONTENT,
  tag: CueTag.PAYMENT_CHANGE,
  label: 'Requests a change to payment or bank details',
  explanation:
    'Changing bank details on the strength of an email is the mechanism behind most business-email-compromise losses. Verify by phone, on a number you already had.',
  detect: (c) => {
    const hit = phrase(`${c.subject} ${c.plain}`, [
      'update bank details',
      'change bank account',
      'new account number',
      'update payment details',
      'revised invoice',
      'remittance details',
      'ifsc',
    ]);
    return hit ? { anchor: hit } : null;
  },
};

const D_SECRECY: Detector = {
  id: 'LANG_SECRECY',
  category: CueCategory.LANGUAGE_AND_CONTENT,
  tag: CueTag.AUTHORITY,
  label: 'Asks you to bypass normal process',
  explanation:
    'Requests for confidentiality, or to skip the usual approval, exist to stop you asking a colleague. That is precisely when you should ask one.',
  detect: (c) => {
    const hit = phrase(c.plain, [
      'do not discuss',
      'keep this confidential',
      'between us',
      'without involving',
      'bypass the usual',
      'don’t tell',
      'do not tell',
      'handle this personally',
    ]);
    return hit ? { anchor: hit } : null;
  },
};

const D_AI_POLISH: Detector = {
  id: 'LANG_AI_POLISH',
  category: CueCategory.LANGUAGE_AND_CONTENT,
  tag: CueTag.AI_GENERATED_POLISH,
  label: 'Unnaturally uniform, polished prose',
  explanation:
    'AI-written lures have no spelling errors at all, use long even sentences and avoid contractions. The ICML 2025 study found AI-generated spear phishing matched human experts (54% click-through). "It reads well" is no longer evidence that a message is genuine.',
  detect: (c) => {
    const sentences = c.plain.split(/[.!?]+\s/).filter((s) => s.trim().length > 0);
    if (sentences.length < 3) return null;
    const avgWords =
      sentences.reduce((n, s) => n + s.trim().split(/\s+/).length, 0) / sentences.length;
    const hasContraction = /\b\w+'(?:s|t|re|ve|ll|d|m)\b/i.test(c.plain);
    return avgWords >= 22 && !hasContraction ? { anchor: undefined } : null;
  },
};

// --------------------------------------------------------------------------
// 5. COMMON TACTICS
// --------------------------------------------------------------------------

const AUTHORITY_TITLES = [
  'chief executive',
  'managing director',
  'ceo',
  'cfo',
  'chief financial',
  'head of hr',
  'human resources',
  'it service desk',
  'service desk',
  'helpdesk',
  'security team',
  'payroll team',
  'it support',
  'system administrator',
];

const D_AUTHORITY: Detector = {
  id: 'TACT_AUTHORITY',
  category: CueCategory.COMMON_TACTICS,
  tag: CueTag.AUTHORITY,
  label: 'Appeals to authority',
  explanation:
    'Claiming to be a senior leader or the IT team borrows trust you have already given to a role. Verify the person, not the title.',
  detect: (c) => {
    const hit = phrase(`${c.meta.fromName} ${c.plain}`, AUTHORITY_TITLES);
    return hit ? { anchor: hit } : null;
  },
};

const D_TOO_GOOD: Detector = {
  id: 'TACT_TOO_GOOD',
  category: CueCategory.COMMON_TACTICS,
  tag: CueTag.URGENCY,
  label: 'Offer that is too good to be true',
  explanation: 'Unexpected money, prizes or upgrades are the oldest lure there is.',
  detect: (c) => {
    const hit = phrase(`${c.subject} ${c.plain}`, [
      'you have won',
      'congratulations',
      'free gift',
      'claim your',
      'selected for',
      'refund of',
      'cashback',
    ]);
    return hit ? { anchor: hit } : null;
  },
};

const D_QR: Detector = {
  id: 'TACT_QR',
  category: CueCategory.COMMON_TACTICS,
  tag: CueTag.QR_LURE,
  label: 'QR code instead of a link',
  explanation:
    'A QR code moves you from a managed laptop to a personal phone, past your email gateway and your corporate controls. You cannot hover over a QR code to inspect it.',
  detect: (c) => (c.hasQr ? { anchor: 'QR code' } : null),
};

const D_MFA: Detector = {
  id: 'TACT_MFA',
  category: CueCategory.COMMON_TACTICS,
  tag: CueTag.MFA_PUSH,
  label: 'References an MFA prompt or code',
  explanation:
    'Attackers trigger real MFA prompts and then ask you to approve them, or to read out the code. Approve only prompts you caused yourself, seconds ago.',
  detect: (c) => {
    const hit = phrase(`${c.subject} ${c.plain}`, [
      'approve the request',
      'approve this sign-in',
      'one-time code',
      'otp',
      'verification code',
      'authenticator',
      'push notification',
      'two-factor',
    ]);
    return hit ? { anchor: hit } : null;
  },
};

const D_GENERIC_CTA: Detector = {
  id: 'TACT_GENERIC_CTA',
  category: CueCategory.COMMON_TACTICS,
  tag: CueTag.CREDENTIAL_PROMPT,
  label: 'Vague call to action',
  explanation:
    '"Click here" and "view document" hide where you are going. A legitimate message usually tells you the destination in words.',
  detect: (c) => {
    const a = c.anchors.find((x) =>
      /^(click here|view document|open document|download|view now|proceed|continue|get started|review now)$/i.test(
        x.text.trim(),
      ),
    );
    return a ? { anchor: a.text.trim() } : null;
  },
};

const D_OUT_OF_BAND: Detector = {
  id: 'TACT_OUT_OF_BAND',
  category: CueCategory.COMMON_TACTICS,
  tag: CueTag.AUTHORITY,
  label: 'Moves you to a personal channel',
  explanation:
    'Being asked to continue on WhatsApp, a mobile number or a personal address takes the conversation outside anything your organisation can monitor or recover.',
  detect: (c) => {
    const hit = phrase(c.plain, [
      'whatsapp',
      'my personal',
      'text me on',
      'reach me on my mobile',
      'telegram',
      'gmail.com',
    ]);
    return hit ? { anchor: hit } : null;
  },
};

export const DETECTORS: Detector[] = [
  D_MISSPELLING,
  D_PUNCTUATION,
  D_DISPLAY_NAME_MISMATCH,
  D_LOOKALIKE_DOMAIN,
  D_REPLY_TO_MISMATCH,
  D_LINK_TEXT_MISMATCH,
  D_INSECURE_URL,
  D_ATTACHMENT,
  D_NO_BRANDING,
  D_IMG_NO_ALT,
  D_NO_FOOTER,
  D_GENERIC_GREETING,
  D_URGENCY,
  D_CONSEQUENCE,
  D_CREDENTIAL_REQUEST,
  D_PAYMENT_CHANGE,
  D_SECRECY,
  D_AI_POLISH,
  D_AUTHORITY,
  D_TOO_GOOD,
  D_QR,
  D_MFA,
  D_GENERIC_CTA,
  D_OUT_OF_BAND,
];

export function detectCues(input: CueInput): DetectedCue[] {
  const ctx = prepare(input);
  const out: DetectedCue[] = [];
  for (const d of DETECTORS) {
    let hit: { anchor?: string } | null = null;
    try {
      hit = d.detect(ctx);
    } catch {
      hit = null;
    }
    if (!hit) continue;
    out.push({
      id: d.id,
      category: d.category,
      tag: d.tag,
      label: d.label,
      explanation: d.explanation,
      ...(hit.anchor ? { anchor: { text: hit.anchor, occurrence: 1 } } : {}),
    });
  }
  return out;
}
