import { Channel, CueTag, type Channel as Ch, type CueTag as Tag } from '@chetna/core';

/**
 * The micro-learning library.
 *
 * Designed against a hard constraint from the evidence: in the UCSD study
 * (19,500 employees, IEEE S&P 2025) **75% of people spent one minute or less**
 * on embedded training and a third closed it immediately — yet those who
 * *completed* an interactive session did measurably better afterwards.
 *
 * So every module here is built to a 45-second budget, carries exactly one
 * behaviour to change, ends in a drill rather than a "continue" button, and is
 * assigned ONLY to someone who showed the matching gap. Nobody is ever given a
 * blanket course.
 */

export interface DrillOption {
  text: string;
  correct: boolean;
  /** Shown after answering, whether right or wrong. */
  why: string;
}

export interface SeedModule {
  slug: string;
  title: string;
  /** One sentence. This is what the participant sees before committing time. */
  summary: string;
  cueTags: Tag[];
  channelTags: Ch[];
  minutes: number;
  /** The whole lesson. Read aloud, this is about 40 seconds. */
  body: string;
  /** The one thing to actually do differently. */
  action: string;
  drill: { question: string; options: DrillOption[] };
}

export const SEED_MODULES: SeedModule[] = [
  {
    slug: 'read-the-domain',
    title: 'Read the domain, right to left',
    summary: 'Ninety seconds of domain-reading defeats most link phishing.',
    cueTags: [CueTag.LOOKALIKE_DOMAIN, CueTag.REPLY_TO_MISMATCH, CueTag.BRAND_IMPERSONATION],
    channelTags: [Channel.EMAIL, Channel.QR],
    minutes: 1,
    body: `A domain is read **from the last dot backwards**. In
\`nimbus.test.secure-login.example\`, the real owner is \`example\` — not \`nimbus\`.
Everything to the left is decoration an attacker controls.

Three shapes to distrust on sight:

- **An extra word**: \`nimbus-courier.test\` when you expect \`nimbus.test\`
- **A hyphen that joins a brand to a verb**: \`nimbus-verify\`, \`login-nimbus\`
- **A reply path on a different domain from the sender**

The display name is free text. Anyone can set it to anything.`,
    action:
      'Before you click, read the domain from the final dot backwards. If the owner is not who you expected, stop.',
    drill: {
      question: 'Which of these is genuinely owned by nimbus.test?',
      options: [
        { text: 'portal.nimbus.test', correct: true, why: 'The final two labels are nimbus.test, so nimbus owns it.' },
        {
          text: 'nimbus.test.secure-login.example',
          correct: false,
          why: 'Read backwards: the owner is example. "nimbus.test" is just a subdomain label.',
        },
        {
          text: 'nimbus-test.example',
          correct: false,
          why: 'A hyphen is not a dot. The owner is example.',
        },
      ],
    },
  },
  {
    slug: 'urgency-is-the-tell',
    title: 'Urgency is the tell',
    summary: 'The pressure to act fast is the attack, not a detail of it.',
    cueTags: [CueTag.URGENCY, CueTag.AUTHORITY],
    channelTags: [Channel.EMAIL, Channel.SMS_SIM, Channel.VOICE_TABLETOP],
    minutes: 1,
    body: `Phishing works by removing the pause in which you would have checked. That
is why messages arrive with deadlines, threats of lost access, or a senior name attached.

The reported median time from delivery to click is about **21 seconds**. The median time
to *report* is about **28 minutes**. That gap is the whole problem — and it is made of
people acting before thinking.

Two things to notice, because they almost never appear in genuine internal mail:

- A **consequence** you will suffer if you do not act now
- A request to **keep it confidential** or skip the usual approval`,
    action:
      'When a message creates time pressure, that is your cue to slow down — not speed up. Verify through a channel you chose yourself.',
    drill: {
      question: 'A director emails asking you to handle a payment today, confidentially. What first?',
      options: [
        {
          text: 'Call them on the number already in your contacts',
          correct: true,
          why: 'Out-of-band verification on a number you already had cannot be redirected by the attacker.',
        },
        {
          text: 'Reply to the email to confirm it is really them',
          correct: false,
          why: 'Your reply goes wherever the reply-to header points — possibly straight back to the attacker.',
        },
        {
          text: 'Do it, then mention it at the next stand-up',
          correct: false,
          why: 'Secrecy plus urgency is the signature of business email compromise. The request to stay quiet is the red flag.',
        },
      ],
    },
  },
  {
    slug: 'never-sign-in-from-a-link',
    title: 'Never sign in from a link',
    summary: 'One habit removes an entire category of attack.',
    cueTags: [CueTag.CREDENTIAL_PROMPT, CueTag.GENERIC_GREETING],
    channelTags: [Channel.EMAIL, Channel.QR],
    minutes: 1,
    body: `No legitimate internal process needs you to re-enter your password from an
email link. Not a password expiry, not a mailbox quota, not a document share.

A convincing fake sign-in page costs an attacker nothing, and modern ones relay your
one-time code to the real site in real time — so having MFA does not save you here.

The habit that does: **navigate to the service yourself**, from a bookmark or by typing
the address. If the message was genuine, the task will be waiting for you when you arrive.`,
    action:
      'Reach every sign-in page through your own bookmark, never through a link someone sent you.',
    drill: {
      question: 'An email says your password expires today and links to the portal. What do you do?',
      options: [
        {
          text: 'Open the portal from your own bookmark and check there',
          correct: true,
          why: 'If the notice is real, the prompt will be there. If it is not, you have lost nothing.',
        },
        {
          text: 'Click the link, but check the padlock before typing',
          correct: false,
          why: 'A padlock only means the connection is encrypted. Attacker-controlled sites have padlocks too.',
        },
        {
          text: 'Click the link and use a password manager, so nothing is typed',
          correct: false,
          why: 'Worse: a password manager may autofill real credentials into a convincing fake. This is exactly why this platform renders no password field at all.',
        },
      ],
    },
  },
  {
    slug: 'attachments-and-qr-codes',
    title: 'Attachments and QR codes',
    summary: 'Both move you somewhere your organisation cannot protect you.',
    cueTags: [CueTag.ATTACHMENT_LURE, CueTag.QR_LURE],
    channelTags: [Channel.EMAIL, Channel.QR],
    minutes: 1,
    body: `An unexpected attachment, especially one that must be opened to resolve
something, is a delivery mechanism. An invoice you were not expecting is not an invoice.

A **QR code** is worse than a link, for one specific reason: you cannot hover over it. It
also moves you from a managed laptop to a personal phone — past the mail gateway, past the
endpoint protection, and past most of what your security team can see or recover.

"Quishing" exists precisely because that handover is invisible.`,
    action:
      'Treat a QR code in email as an unreadable link. If you must act, find the service yourself instead of scanning.',
    drill: {
      question: 'A facilities email asks you to scan a QR code to renew your parking permit. Why is this risky?',
      options: [
        {
          text: 'You cannot inspect the destination, and it moves you to an unmanaged device',
          correct: true,
          why: 'Both at once — no hover preview, and your phone sits outside the corporate controls.',
        },
        {
          text: 'QR codes can contain viruses',
          correct: false,
          why: 'A QR code is just text, usually a URL. The risk is where it sends you, not the code itself.',
        },
        {
          text: 'It is not risky if the email came from inside the organisation',
          correct: false,
          why: 'Sender addresses are trivially spoofed, and internal mailboxes get compromised.',
        },
      ],
    },
  },
  {
    slug: 'mfa-and-push-fatigue',
    title: 'MFA prompts you did not cause',
    summary: 'Approve only what you started, seconds ago.',
    cueTags: [CueTag.MFA_PUSH],
    channelTags: [Channel.EMAIL, Channel.VOICE_TABLETOP],
    minutes: 1,
    body: `Attackers who already have your password will trigger **real** MFA prompts and
wait. Some send a prompt every few minutes until approving becomes the easiest way to make
it stop. Reported figures put a typical burst at around two dozen prompts in twelve
minutes, often in the small hours.

Two rules, and they are absolute:

- Approve a prompt **only** if you caused it yourself, in the last few seconds
- **Never** read a code out loud, type it into a chat, or give it to someone who called you

An unexpected prompt is not noise. It means somebody already has your password.`,
    action:
      'Deny any prompt you did not start, then report it — an unexpected prompt means your password is already known.',
    drill: {
      question: 'Three approval prompts arrive at 02:40. You were asleep. What do you do?',
      options: [
        {
          text: 'Deny them and report it — the password is compromised',
          correct: true,
          why: 'The prompts prove someone has the password. Denying stops the login; reporting gets it reset.',
        },
        {
          text: 'Approve one so the notifications stop, then change the password tomorrow',
          correct: false,
          why: 'That one approval is the whole attack. This is exactly what push-bombing is designed to produce.',
        },
        {
          text: 'Ignore them and go back to sleep',
          correct: false,
          why: 'Better than approving, but the attacker still holds a working password and will try again.',
        },
      ],
    },
  },
  {
    slug: 'verify-before-you-pay',
    title: 'Verify before money moves',
    summary: 'Bank detail changes get verified by voice, on a number you already had.',
    cueTags: [CueTag.PAYMENT_CHANGE],
    channelTags: [Channel.EMAIL],
    minutes: 1,
    body: `Business email compromise is the costliest category of attack by losses, and it
rarely involves malware. It involves a plausible email changing where money goes.

The pattern is always the same: an existing supplier or colleague, a new account number, a
reason that makes sense, and mild time pressure.

The control is procedural, not technical. **A change to payment details is verified by
voice, on a number you already held** — never a number from the email, and never by
replying to it.`,
    action:
      'Never change payment details from an email alone. Call the known number and confirm, every time, no exceptions for seniority.',
    drill: {
      question: 'A known supplier emails new bank details before the payment run. What is sufficient?',
      options: [
        {
          text: 'Call the contact number you already have on file and confirm',
          correct: true,
          why: 'Out-of-band verification on a pre-existing number is the one check an email attacker cannot intercept.',
        },
        {
          text: 'Check that the email came from their usual address',
          correct: false,
          why: 'Addresses are spoofed, and real supplier mailboxes get compromised — then the mail genuinely is from them.',
        },
        {
          text: 'Call the number in the email signature',
          correct: false,
          why: 'If the email is hostile, so is that number. You would be verifying with the attacker.',
        },
      ],
    },
  },
  {
    slug: 'ai-written-lures',
    title: 'Good writing is no longer evidence',
    summary: 'The spelling-mistake heuristic is dead. Here is what replaced it.',
    cueTags: [CueTag.AI_GENERATED_POLISH, CueTag.SPELLING_GRAMMAR, CueTag.BRAND_IMPERSONATION],
    channelTags: [Channel.EMAIL, Channel.SMS_SIM, Channel.VOICE_TABLETOP],
    minutes: 1,
    body: `Most of us were taught to look for bad spelling. That advice has expired.

In a 2025 study presented at ICML, fully AI-automated spear phishing achieved a **54%**
click-through rate — the same as **human expert** attackers (54%), against 12% for generic
lures, and at a tiny fraction of the cost. The same work found that a current AI model
*detected* phishing well above 90%, catching some messages humans missed.

So the thing to check is no longer the prose. It is the **structure**: who is really
sending it, where the link really goes, and whether this request would normally arrive
this way.

The same applies to voice. A cloned voice on a phone call is now cheap, which is why a
callback to a number you already had beats recognising someone's voice.`,
    action:
      'Stop grading the writing. Check the sender, the destination and the process instead — and verify voice requests by calling back.',
    drill: {
      question: 'A flawlessly written internal email asks you to confirm access to a finance system. What does the quality of the writing tell you?',
      options: [
        {
          text: 'Nothing at all about whether it is genuine',
          correct: true,
          why: 'Correct. AI-generated lures match expert human ones for effectiveness. Writing quality carries no signal any more.',
        },
        {
          text: 'That it is probably genuine, since attackers write badly',
          correct: false,
          why: 'This is the heuristic the 2025 ICML results retired. It is now actively misleading.',
        },
        {
          text: 'That it was definitely written by AI and is therefore an attack',
          correct: false,
          why: 'Also wrong, and the mirror-image error. Your colleagues use AI to write too. Judge the structure, not the style.',
        },
      ],
    },
  },
];

export function moduleForCueTag(tag: Tag): SeedModule | undefined {
  return SEED_MODULES.find((m) => m.cueTags.includes(tag));
}

export function moduleBySlug(slug: string): SeedModule | undefined {
  return SEED_MODULES.find((m) => m.slug === slug);
}
