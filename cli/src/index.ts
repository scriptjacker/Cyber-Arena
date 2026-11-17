#!/usr/bin/env node
import { BRAND } from '@chetna/core';
import { disconnect } from '@chetna/db';
import { bold, cyan, dim, fail, heading, info, kv, ok, pct } from './lib/out';
import { seed, DEMO_PASSWORD } from './commands/seed';
import { attest } from './commands/attest';
import { showAudit, verifyAudit } from './commands/audit';
import { purge } from './commands/purge';
import { preflight } from './commands/preflight';
import { metrics } from './commands/metrics';
import { status } from './commands/status';
import { sendOnce } from './commands/send';
import { keysInit } from './commands/keys';

const USAGE = `
${bold(`${BRAND.name} CLI`)} — ${BRAND.productLine}
${dim(BRAND.tagline)}

${bold('Usage')}  npm run chetna -- <command> [options]

${bold('Setup')}
  keys init                 Generate approver signing keys and session secrets
  seed                      Reset and seed the controlled test environment
  demo                      seed + safety attest + next steps (start here)
  status                    Show configuration and what is in the database

${bold('Safety and governance')}
  safety attest             Lint every template, run the credential canary, sign an attestation
  audit verify              Re-compute the whole audit chain and print its Merkle root
  audit show [n]            Print the last n audit entries (default 20)
  purge [--apply]           Enforce retention. Dry run unless --apply is given.

${bold('Campaigns')}
  preflight <campaignId> [--email a@b.test]
                            Dry-run the seven gates for every person on the roster,
                            and optionally for a hypothetical recipient
  send                      One send cycle: sink + one worker tick through the gates
  metrics [campaignId]      Campaign analytics, holdout effect, k-guarded cohorts
`;

async function main(argv: string[]): Promise<number> {
  const [command, sub, ...rest] = argv;
  const flag = (name: string): string | undefined => {
    const i = rest.indexOf(`--${name}`);
    return i >= 0 ? rest[i + 1] : undefined;
  };
  const has = (name: string) => rest.includes(`--${name}`) || sub === `--${name}`;

  switch (command) {
    case undefined:
    case 'help':
    case '--help':
    case '-h':
      console.log(USAGE);
      return 0;

    case 'keys':
      if (sub !== 'init') {
        fail('usage: keys init');
        return 1;
      }
      keysInit();
      return 0;

    case 'status':
      await status();
      return 0;

    case 'seed': {
      const summary = await seed();
      printSeedSummary(summary);
      return 0;
    }

    case 'demo': {
      const summary = await seed();
      printSeedSummary(summary);
      const result = await attest();
      printNextSteps(summary.liveCampaignId);
      return result.verdict === 'FAILED' ? 1 : 0;
    }

    case 'safety':
      if (sub !== 'attest') {
        fail('usage: safety attest');
        return 1;
      }
      return (await attest()).verdict === 'FAILED' ? 1 : 0;

    case 'audit':
      if (sub === 'verify') return (await verifyAudit()).ok ? 0 : 1;
      if (sub === 'show') {
        await showAudit(Number(rest[0] ?? 20));
        return 0;
      }
      fail('usage: audit verify | audit show [n]');
      return 1;

    case 'purge':
      await purge({ apply: has('apply') });
      return 0;

    case 'preflight': {
      if (!sub) {
        fail('usage: preflight <campaignId> [--email someone@example.test]');
        return 1;
      }
      const email = flag('email');
      await preflight(sub, email ? { email } : {});
      return 0;
    }

    case 'send':
      await sendOnce();
      return 0;

    case 'metrics':
      await metrics(sub);
      return 0;

    default:
      fail(`unknown command: ${command}`);
      console.log(USAGE);
      return 1;
  }
}

function printSeedSummary(summary: Awaited<ReturnType<typeof seed>>): void {
  heading('Controlled test environment seeded');
  kv('participants', summary.participants);
  kv('templates', `${summary.templates} (${summary.blockedTemplates} blocked by the ethics screen)`);
  kv('learning modules', summary.modules);
  kv('completed campaigns', summary.completedCampaigns.join(', '));
  kv('live campaign', `${summary.liveCampaignId} (authorized, queued)`);
  kv('prior failure rate', pct(summary.failureRatePrior));
  kv('prior report rate', pct(summary.reportRatePrior));
  console.log('');
  info(`Sign in with any of these, password ${cyan(DEMO_PASSWORD)}:`);
  for (const s of summary.staff) console.log(`       ${s.email.padEnd(26)} ${dim(s.role)}`);
}

function printNextSteps(liveCampaignId: string): void {
  heading('Next');
  console.log(`  ${dim('# dry-run the seven gates for the whole roster')}`);
  console.log(`  npm run chetna -- preflight ${liveCampaignId}`);
  console.log('');
  console.log(`  ${dim('# try to reach a real inbox, and watch gates G3 and G7 refuse')}`);
  console.log(`  npm run chetna -- preflight ${liveCampaignId} --email attacker@gmail.com`);
  console.log('');
  console.log(`  ${dim('# last quarter’s analytics, including the honest holdout result')}`);
  console.log(`  npm run chetna -- metrics cmp_q1_baseline`);
  console.log('');
  console.log(`  ${dim('# verify nothing in the record has been altered')}`);
  console.log(`  npm run chetna -- audit verify`);
}

main(process.argv.slice(2))
  .then(async (code) => {
    await disconnect();
    process.exit(code);
  })
  .catch(async (err: unknown) => {
    fail(err instanceof Error ? err.message : String(err));
    if (err instanceof Error && err.stack && process.env.CHETNA_DEBUG === '1') {
      console.error(err.stack);
    }
    await disconnect();
    process.exit(1);
  });

export { main };
