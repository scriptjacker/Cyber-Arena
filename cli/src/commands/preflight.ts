import { gateOf, ReasonCode, reasonText } from '@chetna/core';
import { buildHypotheticalContext, buildPreflightContexts, prisma } from '@chetna/db';
import { evaluate, GATES, summarise } from '@chetna/policy';
import { scopeDiff } from '@chetna/audit';
import { bold, dim, fail, green, heading, info, kv, ok, warn, yellow } from '../lib/out';

/**
 * Dry-run the seven gates for every person on a campaign's roster.
 *
 * This is the panel an operator sees before asking two colleagues to sign
 * anything: every gate, every refusal, every reason, with nothing sent.
 */
export async function preflight(
  campaignId: string,
  options: { email?: string } = {},
): Promise<void> {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) {
    fail(`no campaign with id ${campaignId}`);
    return;
  }

  heading(`Preflight — ${campaign.name} (${campaign.status})`);

  const contexts = await buildPreflightContexts(campaignId);
  if (contexts.length === 0) {
    fail('no roster members found for this campaign');
    return;
  }

  const decisions = contexts.map((c) => evaluate(c));
  const summary = summarise(decisions);
  const first = contexts[0];

  kv('participants evaluated', summary.total);
  kv('would send', summary.allowed);
  kv('blocked', summary.blocked);
  kv('mode', first.mode);
  kv('transport host', first.transport.host);

  // Per-gate status, computed across the whole roster.
  console.log('');
  console.log(`  ${bold('Gate'.padEnd(6))}${bold('Name'.padEnd(16))}${bold('Status')}`);
  for (const gate of GATES) {
    const failing = decisions.filter((d) => d.reasons.some((r) => gateOf(r) === gate.n)).length;
    const line = `  ${String(gate.n).padEnd(6)}${gate.name.padEnd(16)}`;
    console.log(line + (failing === 0 ? green('pass') : yellow(`${failing} blocked`)));
  }

  if (summary.byReason.length > 0) {
    console.log('');
    console.log(`  ${bold('Refusals')}`);
    for (const r of summary.byReason) {
      console.log(`  ${String(r.count).padStart(4)} × ${r.code}`);
      console.log(`       ${dim(r.text)}`);
    }
  } else {
    console.log('');
    ok('every gate passes for every participant on the roster');
  }

  // Scope drift is worth calling out explicitly, with a diff, because it is the
  // refusal an operator is most likely to be surprised by.
  const drifted = decisions.some((d) => d.reasons.includes(ReasonCode.G1_SCOPE_DRIFT));
  if (drifted && first.grant) {
    console.log('');
    warn('The campaign has changed since it was approved. The approvers signed:');
    for (const line of scopeDiff(first.grant.scopeSnapshot, first.liveScope)) {
      console.log(`       ${line}`);
    }
    info('Re-request authorization. Two people must sign the new scope.');
  }

  // ------------------------------------------------- hypothetical recipient
  if (options.email) {
    heading(`Hypothetical recipient — ${options.email}`);
    const ctx = await buildHypotheticalContext(campaignId, options.email);
    if (!ctx) {
      fail('could not build a context for this campaign');
      return;
    }
    const decision = evaluate(ctx);
    if (decision.allow) {
      warn('ALLOWED — this address would receive a simulated message.');
    } else {
      fail(`BLOCKED at gate ${decision.gate}`);
      for (const r of decision.reasons) {
        console.log(`       ${r}`);
        console.log(`       ${dim(reasonText(r))}`);
      }
    }
  }
}
