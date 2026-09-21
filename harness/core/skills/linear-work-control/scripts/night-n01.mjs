#!/usr/bin/env node
import {
  evaluateRunBudget,
  matchModelEvidence,
  planExecutionAfterClaim,
  planSuccessorPromotion,
  reconcilePromotion,
  selectAcrossScopes,
} from '../lib/night-n01.mjs';

const help = `Usage: node harness/core/skills/linear-work-control/scripts/night-n01.mjs < snapshot.json
Read one offline JSON contract from stdin. Set operation to one of:
model, budget, scopes, claim, promotion-plan, promotion-reconcile.
This command never reads the clock, persists state, calls Linear, or claims work.
`;
const args = process.argv.slice(2);
const emit = value => process.stdout.write(JSON.stringify(value) + '\n');
if (args.length === 1 && args[0] === '--help') {
  process.stdout.write(help);
  process.exit(0);
}
if (args.length) {
  emit({ ok: false, reason: 'invalid-arguments' });
  process.exit(2);
}

try {
  let input = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) input += chunk;
  const value = JSON.parse(input);
  const result = value.operation === 'model' ? matchModelEvidence(value)
    : value.operation === 'budget' ? evaluateRunBudget(value)
    : value.operation === 'scopes' ? selectAcrossScopes(value)
    : value.operation === 'claim' ? planExecutionAfterClaim(value)
    : value.operation === 'promotion-plan' ? planSuccessorPromotion(value)
    : value.operation === 'promotion-reconcile' ? reconcilePromotion(value.plan, value.result)
    : { ok: false, reason: 'invalid-operation' };
  emit(result);
  if (result.ok === false && value.operation !== 'model' && value.operation !== 'budget') process.exitCode = 1;
} catch {
  emit({ ok: false, reason: 'invalid-input' });
  process.exitCode = 1;
}
