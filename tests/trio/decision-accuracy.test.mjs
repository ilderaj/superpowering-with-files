import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { evaluateDecisionAccuracy, oldVerdictOf, TRUTH_VOCABULARY } from '../../scripts/evaluate-decision-accuracy.mjs';
import { evaluateDecisionShadow } from '../../scripts/evaluate-decision-shadow.mjs';

async function fixtureCopy() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'decision-accuracy-'));
  for (const name of ['cases.json', 'ground-truth.json']) await writeFile(path.join(dir, name), await readFile(path.join('tests/fixtures/decision', name)));
  return dir;
}

test('accuracy uses an independent truth vocabulary and keeps unsupported in end-to-end scoring', async () => {
  assert.ok(TRUTH_VOCABULARY.includes('unsupported'));
  const dir = await fixtureCopy();
  const cases = JSON.parse(await readFile(path.join(dir, 'cases.json'))); const truth = JSON.parse(await readFile(path.join(dir, 'ground-truth.json')));
  cases.push({ ...cases[0], id: 'unsupported-case' }); truth.cases.push({ id: 'unsupported-case', truthTransition: 'wait_for_dependency' });
  await writeFile(path.join(dir, 'cases.json'), JSON.stringify(cases)); await writeFile(path.join(dir, 'ground-truth.json'), JSON.stringify(truth));
  const r = await evaluateDecisionAccuracy({ fixtureRoot: dir });
  assert.equal(r.headline.total, 28); assert.deepEqual(r.headline.unsupportedIds, ['unsupported-case']);
  assert.equal(r.headline.correctOverAll, 26 / 28); assert.equal(r.headline.abstentionRate, 1 / 28);
});

test('risk metrics expose eligible denominators and count plan readiness failures as premature', async () => {
  const r = await evaluateDecisionAccuracy();
  assert.equal(r.headline.falseDoneDenominator, 23); assert.equal(r.headline.falseDoneEligible, 24); assert.equal(r.headline.falseDoneEvaluatedCoverage, 23 / 24);
  assert.equal(r.headline.prematureExecutionEligible, 7); assert.equal(r.headline.prematureExecutionDenominator, 7); assert.equal(r.headline.prematureExecutionEvaluatedCoverage, 1);
});

test('fixture set rejects missing and duplicate labels/ids', async () => {
  const dir = await fixtureCopy(); const truth = JSON.parse(await readFile(path.join(dir, 'ground-truth.json'))); truth.cases.pop(); await writeFile(path.join(dir, 'ground-truth.json'), JSON.stringify(truth));
  await assert.rejects(() => evaluateDecisionAccuracy({ fixtureRoot: dir }), /exactly the same ids/);
  const dir2 = await fixtureCopy(); const cases = JSON.parse(await readFile(path.join(dir2, 'cases.json'))); cases.push(cases[0]); await writeFile(path.join(dir2, 'cases.json'), JSON.stringify(cases));
  await assert.rejects(() => evaluateDecisionAccuracy({ fixtureRoot: dir2 }), /duplicate ids/);
});

test('shadow null is unevaluable and does not become a disagreement', async () => {
  const r = await evaluateDecisionShadow(); const row = r.cases.find(x => x.id === 'night-technical-provider-failure');
  assert.equal(row.shadowTransition, null); assert.equal(row.disagreement, false); assert.equal(r.summary.disagreements, 15);
});

test('legacy aliases remain readable without changing truth', () => { assert.equal(oldVerdictOf({ oldBehaviour: 'policy_gate' }), 'escalate'); });


test('all unanswered cases report full abstention rather than zero', async()=>{
 const dir=await fixtureCopy();
 const all=JSON.parse(await readFile(path.join(dir,'cases.json')));
 const c=all.find(x=>x.id==='night-technical-provider-failure');
 await writeFile(path.join(dir,'cases.json'),JSON.stringify([c]));
 await writeFile(path.join(dir,'ground-truth.json'),JSON.stringify({cases:[{id:c.id,truthTransition:'retry'}]}));
 const r=await evaluateDecisionAccuracy({fixtureRoot:dir});
 assert.equal(r.headline.abstentionRate,1);assert.equal(r.headline.conditionalAgreement,null);
});
