// Drive the console as each seeded role and assert what it shows and refuses.
// Sessions are minted locally with SESSION_SECRET, which is exactly what the
// login action does — this exercises the pages, not the password form.
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.CONSOLE_URL?.replace('localhost', '127.0.0.1') ?? 'http://127.0.0.1:4000';

const env = Object.fromEntries(
  readFileSync(resolve(ROOT, '.env'), 'utf8')
    .split(/\r?\n/)
    .map((l) => /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(l))
    .filter(Boolean)
    .map((m) => [m[1], m[2].trim().replace(/^["']|["']$/g, '')]),
);
const SECRET = env.SESSION_SECRET;

function cookieFor(userId, role) {
  const body = Buffer.from(
    JSON.stringify({ userId, role, exp: Date.now() + 3600_000 }),
    'utf8',
  ).toString('base64url');
  const mac = createHmac('sha256', SECRET).update(body).digest('base64url');
  return `chetna_session=${body}.${mac}`;
}

async function get(path, cookie) {
  const res = await fetch(BASE + path, {
    headers: cookie ? { cookie } : {},
    redirect: 'manual',
  });
  const text = res.status === 200 ? await res.text() : '';
  return { status: res.status, location: res.headers.get('location') ?? '', text };
}

let pass = 0;
let fail = 0;
function check(label, condition, detail = '') {
  if (condition) {
    pass++;
    console.log(`  OK   ${label}`);
  } else {
    fail++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

const ROLES = {
  security: cookieFor('usr_security', 'SECURITY_ADMIN'),
  hr: cookieFor('usr_hr', 'HR_APPROVER'),
  analyst: cookieFor('usr_analyst', 'ANALYST'),
  auditor: cookieFor('usr_auditor', 'AUDITOR'),
};

console.log('\n=== Security admin: the operator view ===');
{
  const home = await get('/', ROLES.security);
  check('overview renders', home.status === 200, `status ${home.status}`);
  check('leads with report rate, not click rate', home.text.includes('Report rate'));
  check(
    'states the holdout verdict honestly',
    /No significant effect|Effect detected/.test(home.text),
  );
  check('shows the attestation verdict', home.text.includes('ATTESTED'));

  const templates = await get('/templates', ROLES.security);
  check('template library renders', templates.status === 200);
  check('marks blocked lures as unsendable', templates.text.includes('cannot send — gate G5'));

  const blocked = await get('/templates/tpl_covid-bonus', ROLES.security);
  check('blocked template page renders', blocked.status === 200);
  check('cites the real precedent', blocked.text.includes('West Midlands Trains'));
  check(
    'security admin CANNOT override its own ethics block',
    blocked.text.includes('Only a') && !blocked.text.includes('Override as People/HR'),
  );

  const campaign = await get('/campaigns/cmp_q2_courier', ROLES.security);
  check('campaign preflight renders', campaign.status === 200);
  check('shows the seven gates', campaign.text.includes('Preflight — the seven gates'));
  check('shows real refusal reason codes', /G4_[A-Z_]+/.test(campaign.text));
  check('shows both approval slots', campaign.text.includes('People / HR approver'));

  const analytics = await get('/analytics', ROLES.security);
  check('analytics renders', analytics.status === 200);
  check('publishes machine-filtered opens', analytics.text.includes('Attributed to machines'));
  check('k-anonymity withholds small cohorts', analytics.text.includes('cohort(s) withheld'));

  const governance = await get('/governance', ROLES.security);
  check('governance renders', governance.status === 200);
  check('audit chain tooling present', governance.text.includes('Verify the chain'));
  check('retention schedule shown', governance.text.includes('never auto-purged'));

  const triage = await get('/triage', ROLES.security);
  check('triage renders', triage.status === 200);
  check('surfaces a genuine campaign among reports', triage.text.includes('genuine campaign'));

  const inbox = await get('/inbox', ROLES.security);
  check('mailboxes render', inbox.status === 200);
}

console.log('\n=== People/HR: holds the override, not the operations ===');
{
  const blocked = await get('/templates/tpl_covid-bonus', ROLES.hr);
  check('HR sees the override form', blocked.text.includes('Override as People/HR'));
  check('override demands a long justification', blocked.text.includes('more characters required'));

  const governance = await get('/governance', ROLES.hr);
  check(
    'HR is refused governance, with an explanation',
    governance.status === 307 && governance.location.includes('/denied'),
    `status ${governance.status} -> ${governance.location}`,
  );

  const studio = await get('/templates/new', ROLES.hr);
  check(
    'HR cannot author templates',
    studio.status === 307 && studio.location.includes('/denied'),
    `status ${studio.status}`,
  );
}

console.log('\n=== Analyst: reads aggregates, nothing else ===');
{
  const analytics = await get('/analytics', ROLES.analyst);
  check('analyst can read analytics', analytics.status === 200);

  const governance = await get('/governance', ROLES.analyst);
  check(
    'analyst refused governance',
    governance.status === 307 && governance.location.includes('/denied'),
  );

  const studio = await get('/templates/new', ROLES.analyst);
  check('analyst cannot author templates', studio.status === 307);

  const denied = await get('/denied?c=ethics%3Aoverride', ROLES.analyst);
  check('the refusal page explains the separation', denied.status === 200);
  check(
    'and names who holds the capability instead',
    denied.text.includes('Held by') && denied.text.includes('People / HR'),
  );
}

console.log('\n=== Auditor: reads the record, touches nothing ===');
{
  const governance = await get('/governance', ROLES.auditor);
  check('auditor can read governance', governance.status === 200);
  check(
    'but cannot run the retention job',
    governance.text.includes('This role may not run the retention job'),
  );
}

console.log('\n=== Forged and stale sessions ===');
{
  const tampered = ROLES.analyst.replace(/.$/, (c) => (c === 'A' ? 'B' : 'A'));
  const forged = await get('/governance', tampered);
  check(
    'a tampered session cookie is rejected',
    forged.status === 307 && forged.location.includes('/login'),
    `status ${forged.status}`,
  );

  const body = Buffer.from(
    JSON.stringify({ userId: 'usr_security', role: 'SECURITY_ADMIN', exp: Date.now() - 1000 }),
    'utf8',
  ).toString('base64url');
  const mac = createHmac('sha256', SECRET).update(body).digest('base64url');
  const expired = await get('/governance', `chetna_session=${body}.${mac}`);
  check(
    'a correctly signed but EXPIRED session is rejected',
    expired.status === 307 && expired.location.includes('/login'),
    `status ${expired.status}`,
  );

  // Privilege escalation attempt: claim OWNER in the payload. The role is
  // re-read from the database on every request, so the claim is ignored.
  const liftBody = Buffer.from(
    JSON.stringify({ userId: 'usr_analyst', role: 'OWNER', exp: Date.now() + 3600_000 }),
    'utf8',
  ).toString('base64url');
  const liftMac = createHmac('sha256', SECRET).update(liftBody).digest('base64url');
  const lifted = await get('/governance', `chetna_session=${liftBody}.${liftMac}`);
  check(
    'a self-claimed OWNER role in the cookie does not escalate',
    lifted.status === 307 && lifted.location.includes('/denied'),
    `status ${lifted.status} -> ${lifted.location}`,
  );
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail > 0 ? 1 : 0);
