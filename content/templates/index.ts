import { Channel, Scenario, type Channel as Ch, type Scenario as Sc } from '@chetna/core';

/**
 * The seeded template library.
 *
 * Every template here is authored to pass @chetna/safety-lint: links exist only
 * as the four permitted placeholders, there is no input of any kind, images are
 * inline or the tracking pixel, and {{watermark}} plus {{reportUrl}} are always
 * present.
 *
 * Two templates at the end are DELIBERATELY harmful and are expected to be
 * blocked by @chetna/ethics. They are seeded so the demo can show a refusal
 * rather than describe one, and so the abuse suite has real content to run on.
 */

export interface SeedTemplate {
  key: string;
  name: string;
  channel: Ch;
  scenario: Sc;
  subject: string;
  fromName: string;
  fromAddress: string;
  html: string;
  text?: string;
  /** 1..5 — how well the premise fits this audience's real work. */
  premiseAlignment: number;
  attachments?: { filename: string; contentType: string }[];
  /** Expected to be BLOCKED by the ethics screen. Seeded for the demo. */
  demoBlocked?: boolean;
  /** Why this template exists in the library, shown in the Studio. */
  note: string;
}

const LOGO =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==';

const footer = (sender: string) => `
  <hr style="border:none;border-top:1px solid #e5e5e5;margin:20px 0" />
  <p style="font-size:11px;color:#777;line-height:1.5">
    ${sender}<br />
    Not expecting this message? <a href="{{reportUrl}}">Report it</a> — it takes one click and
    we would rather have a false alarm than a quiet mistake.
  </p>
  <img src="{{pixelUrl}}" width="1" height="1" alt="" style="display:block" />
  {{watermark}}`;

export const SEED_TEMPLATES: SeedTemplate[] = [
  {
    key: 'courier-customs',
    name: 'Courier redelivery — customs charge',
    channel: Channel.EMAIL,
    scenario: Scenario.SPEARPHISHING_LINK,
    subject: 'Shipment NC-4471-PQ held pending a customs charge',
    fromName: 'Nimbus Courier Updates',
    fromAddress: 'updates@nimbus-courier.test',
    premiseAlignment: 4,
    note: 'The primary demo lure. Few cues, a premise that fits a logistics company exactly, so it rates HIGH to VERY_HIGH difficulty.',
    html: `
  <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#222;max-width:560px">
    <img src="${LOGO}" alt="Nimbus Courier" width="120" height="28" />
    <p>Hello {{firstName}},</p>
    <p>A shipment addressed to you at {{department}} is held at the Bengaluru hub pending a
       customs charge of INR 240. Shipments unclaimed after 72 hours are returned to the sender.</p>
    <p><a href="{{clickUrl}}">Review shipment NC-4471-PQ</a></p>
    <p>Regards,<br />Nimbus Courier Updates</p>
    ${footer('Nimbus Courier Updates · Logistics Operations')}
  </div>`,
  },
  {
    key: 'password-expiry',
    name: 'IT service desk — password expiry',
    channel: Channel.EMAIL,
    scenario: Scenario.SPEARPHISHING_LINK,
    subject: 'Action required: your network password expires today',
    fromName: 'IT Service Desk',
    fromAddress: 'servicedesk@nimbus-it-support.test',
    premiseAlignment: 4,
    note: 'The most-used real-world lure. Carries the credential-prompt and urgency cues, and a lookalike sender domain.',
    html: `
  <div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#222;max-width:560px">
    <p>Dear User,</p>
    <p>Our records show your network password expires today. To avoid losing access to email
       and the VPN, please confirm your identity and set a new password before 18:00.</p>
    <p><a href="{{clickUrl}}">Continue to the password portal</a></p>
    <p>IT Service Desk</p>
    ${footer('Nimbus IT Service Desk')}
  </div>`,
  },
  {
    key: 'doc-share',
    name: 'Document shared with you',
    channel: Channel.EMAIL,
    scenario: Scenario.SPEARPHISHING_VIA_SERVICE,
    subject: 'Priya shared "Q1 Budget Review" with you',
    fromName: 'Document Cloud',
    fromAddress: 'no-reply@doc-cloud-share.test',
    premiseAlignment: 4,
    note: 'Impersonates a file-sharing service, which is how a great many real intrusions begin. Vague call to action is the main cue.',
    html: `
  <div style="font-family:Arial,sans-serif;font-size:14px;color:#222;max-width:560px">
    <img src="${LOGO}" alt="Document Cloud" width="100" height="24" />
    <p>A document has been shared with you.</p>
    <table style="border-collapse:collapse;margin:16px 0">
      <tr><td style="padding:6px 0;color:#666">Document</td><td style="padding:6px 12px"><b>Q1 Budget Review.xlsx</b></td></tr>
      <tr><td style="padding:6px 0;color:#666">Shared by</td><td style="padding:6px 12px">Priya R (Finance)</td></tr>
      <tr><td style="padding:6px 0;color:#666">Expires</td><td style="padding:6px 12px">In 48 hours</td></tr>
    </table>
    <p><a href="{{clickUrl}}">View document</a></p>
    ${footer('Document Cloud notifications')}
  </div>`,
  },
  {
    key: 'qr-parking',
    name: 'QR — parking permit renewal (quishing)',
    channel: Channel.QR,
    scenario: Scenario.SPEARPHISHING_LINK,
    subject: 'Scan to renew your campus parking permit',
    fromName: 'Facilities Team',
    fromAddress: 'facilities@nimbus-campus.test',
    premiseAlignment: 3,
    note: 'Quishing. A QR code moves the target to a personal phone, outside the mail gateway and the managed laptop — and you cannot hover over a QR code.',
    html: `
  <div style="font-family:Arial,sans-serif;font-size:14px;color:#222;max-width:560px">
    <p>Hello {{firstName}},</p>
    <p>Parking permits for the {{orgName}} campus must be renewed this month. Scan the QR code
       below with your phone to confirm your vehicle details.</p>
    <p style="text-align:center;margin:24px 0">
      <img src="${LOGO}" alt="QR code to renew your parking permit" width="160" height="160" />
    </p>
    <p style="text-align:center;font-size:12px;color:#666">
      Cannot scan the code? <a href="{{qrUrl}}">Open the renewal page</a>
    </p>
    ${footer('Nimbus Facilities Team')}
  </div>`,
  },
  {
    key: 'mfa-approve',
    name: 'MFA push approval (fatigue)',
    channel: Channel.EMAIL,
    scenario: Scenario.PHISHING_FOR_INFORMATION,
    subject: 'Approve the sign-in request we just sent',
    fromName: 'Security Operations',
    fromAddress: 'secops@nimbus-identity.test',
    premiseAlignment: 3,
    note: 'Teaches MFA fatigue: approve only a prompt you caused yourself, seconds ago. Never read a code out to anyone.',
    html: `
  <div style="font-family:Arial,sans-serif;font-size:14px;color:#222;max-width:560px">
    <p>Hello {{firstName}},</p>
    <p>We detected a sign-in to your account from a new device. A push notification has been
       sent to your authenticator. Please approve the request to keep your session active, or
       review the attempt below.</p>
    <p><a href="{{clickUrl}}">Review the sign-in attempt</a></p>
    ${footer('Nimbus Security Operations')}
  </div>`,
  },
  {
    key: 'invoice-attachment',
    name: 'Invoice attachment',
    channel: Channel.EMAIL,
    scenario: Scenario.SPEARPHISHING_ATTACHMENT,
    subject: 'Invoice NC-8841 for March',
    fromName: 'Accounts Receivable',
    fromAddress: 'accounts@nimbus-supplies-ltd.test',
    premiseAlignment: 3,
    attachments: [{ filename: 'Invoice-NC-8841.pdf', contentType: 'application/pdf' }],
    note: 'Attachment lure with an inert PDF. The file is a one-page teachable moment, not a payload — enforced by safety-lint SL009.',
    html: `
  <div style="font-family:Arial,sans-serif;font-size:14px;color:#222;max-width:560px">
    <p>Dear {{firstName}},</p>
    <p>Please find attached invoice NC-8841 for services in March. Payment terms are 30 days
       from the invoice date.</p>
    <p>Queries to <a href="mailto:ar-team@nimbus-supplies-group.test">our accounts team</a>.</p>
    <p><a href="{{clickUrl}}">View invoice online</a></p>
    ${footer('Nimbus Supplies Ltd · Accounts Receivable')}
  </div>`,
  },
  {
    key: 'vendor-bank-change',
    name: 'Vendor bank detail change (BEC)',
    channel: Channel.EMAIL,
    scenario: Scenario.SPEARPHISHING_LINK,
    subject: 'Updated remittance details for Nimbus Supplies',
    fromName: 'Ravi Menon — Nimbus Supplies',
    fromAddress: 'r.menon@nimbus-supplies-group.test',
    premiseAlignment: 4,
    note: 'Business email compromise, the costliest category by loss. Teaches: never change bank details on the strength of an email — verify by phone on a number you already had.',
    html: `
  <div style="font-family:Arial,sans-serif;font-size:14px;color:#222;max-width:560px">
    <p>Hi {{firstName}},</p>
    <p>Our banking has moved to a new provider this quarter. Please update payment details on
       your side before the next remittance run so there is no delay in settlement.</p>
    <p><a href="{{clickUrl}}">View the updated remittance details</a></p>
    <p>Thanks,<br />Ravi Menon<br />Nimbus Supplies</p>
    <p style="font-size:12px;color:#666">Replies to
      <a href="mailto:accounts@nimbus-supplies-billing.test">accounts@nimbus-supplies-billing.test</a>
    </p>
    ${footer('Nimbus Supplies · Billing')}
  </div>`,
  },
  {
    key: 'md-urgent-task',
    name: 'Managing director — urgent confidential task',
    channel: Channel.EMAIL,
    scenario: Scenario.SPEARPHISHING_LINK,
    subject: 'Quick favour — handling this personally',
    fromName: 'Anita Deshpande',
    fromAddress: 'a.deshpande@nimbus-exec.test',
    premiseAlignment: 2,
    note: 'Authority plus secrecy. Rates easier than it looks because the premise is implausible for most roles — which is exactly what difficulty adjustment is for.',
    html: `
  <div style="font-family:Arial,sans-serif;font-size:14px;color:#222;max-width:560px">
    <p>{{firstName}},</p>
    <p>Are you at your desk? I need something handled today and would rather not involve the
       wider team until it is settled. Please keep this confidential for now and review the
       brief below.</p>
    <p><a href="{{clickUrl}}">Open the brief</a></p>
    <p>Sent from my phone<br />Anita</p>
    ${footer('Nimbus Executive Office')}
  </div>`,
  },
  {
    key: 'obvious-prize',
    name: 'Deliberately obvious lure (calibration)',
    channel: Channel.EMAIL,
    scenario: Scenario.SPEARPHISHING_LINK,
    subject: 'CONGRATULATIONS!! You have won a FREE gift — claim immediatly!!',
    fromName: 'Rewards Team',
    fromAddress: 'winner@claims-processing-centre.test',
    premiseAlignment: 1,
    note: 'Intentionally terrible. It exists to calibrate: a programme that only sends lures like this can report a flattering click rate, which is precisely what difficulty-adjusted metrics expose.',
    html: `
  <div style="font-family:Arial,sans-serif;font-size:14px;color:#222;max-width:560px">
    <p>Dear Valued Customer,</p>
    <p>CONGRATULATIONS!! Your acount has been selected for a FREE gift!! You must claim
       immediatly or your reward will be permanently removed within 24 hours!!</p>
    <p>Visit http://203.0.113.44/claim or <a href="{{clickUrl}}">click here</a> to recieve your prize.</p>
    ${footer('Rewards Processing')}
  </div>`,
  },
  {
    key: 'sms-delivery',
    name: 'SMS — delivery reschedule (simulated)',
    channel: Channel.SMS_SIM,
    scenario: Scenario.SPEARPHISHING_LINK,
    subject: 'SMS: parcel delivery attempt failed',
    fromName: 'NC-Delivery',
    fromAddress: 'sms@nimbus-courier.test',
    premiseAlignment: 3,
    note: 'Smishing, delivered inside the platform as a message card. No telecom gateway is involved — the same seven gates apply.',
    html: `
  <div style="font-family:Arial,sans-serif;font-size:14px;color:#222;max-width:360px">
    <p style="background:#f1f1f3;border-radius:14px;padding:12px 14px">
      NC-Delivery: we missed you today. Reschedule your parcel within 24h:
      <a href="{{clickUrl}}">nc-dlv.test/r</a>
    </p>
    ${footer('Simulated SMS · delivered in-platform only')}
  </div>`,
  },

  // ---------------------------------------------------------------------
  // Deliberately harmful. Expected to be BLOCKED by @chetna/ethics.
  // ---------------------------------------------------------------------
  {
    key: 'covid-bonus',
    name: '[BLOCKED] Pandemic recognition bonus',
    channel: Channel.EMAIL,
    scenario: Scenario.SPEARPHISHING_LINK,
    subject: 'COVID-19 recognition bonus — confirm your bank details',
    fromName: 'Anita Deshpande',
    fromAddress: 'a.deshpande@nimbus-exec.test',
    premiseAlignment: 5,
    demoBlocked: true,
    note: 'This is the West Midlands Trains lure, April 2021. Their union called it "crass and reprehensible" — staff had been ill with COVID and a colleague had died. GoDaddy and Tribune Publishing did the same thing with fake bonuses. The ethics screen blocks it and shows the operator why.',
    html: `
  <div style="font-family:Arial,sans-serif;font-size:14px;color:#222;max-width:560px">
    <p>Dear colleague,</p>
    <p>In recognition of your work during the pandemic, a one-off payment has been approved
       for all frontline staff. Please confirm your bank details to receive it with this
       month's payroll.</p>
    <p><a href="{{clickUrl}}">Confirm bank details</a></p>
    ${footer('Nimbus Executive Office')}
  </div>`,
  },
  {
    key: 'redundancy-notice',
    name: '[BLOCKED] Redundancy consultation notice',
    channel: Channel.EMAIL,
    scenario: Scenario.SPEARPHISHING_LINK,
    subject: 'Confidential: your role and the restructuring announcement',
    fromName: 'People Team',
    fromAddress: 'people@nimbus-hr-portal.test',
    premiseAlignment: 5,
    demoBlocked: true,
    note: 'Blocked. A message implying someone may lose their job produces fear long before any lesson lands, and in an organisation that has had recent layoffs it is indistinguishable from cruelty.',
    html: `
  <div style="font-family:Arial,sans-serif;font-size:14px;color:#222;max-width:560px">
    <p>Dear {{firstName}},</p>
    <p>Following the restructuring announcement, your role has been identified for redundancy
       consultation. Please review your exit formalities and notice period below.</p>
    <p><a href="{{clickUrl}}">Review consultation documents</a></p>
    ${footer('Nimbus People Team')}
  </div>`,
  },
];

export const SENDABLE_TEMPLATES = SEED_TEMPLATES.filter((t) => !t.demoBlocked);
export const BLOCKED_DEMO_TEMPLATES = SEED_TEMPLATES.filter((t) => t.demoBlocked);

export function templateByKey(key: string): SeedTemplate | undefined {
  return SEED_TEMPLATES.find((t) => t.key === key);
}
