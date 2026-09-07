import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { validateResultRecord } from './v14-cross-domain/result-contract.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const evalRoot = path.join(repoRoot, 'tests/evals/v14-cross-domain');
const scenariosPath = path.join(evalRoot, 'scenarios.json');

async function loadScenarios() {
  return JSON.parse(await readFile(scenariosPath, 'utf8'));
}

test('V1.4 scenarios expose exactly the five release cases', async () => {
  const scenarios = await loadScenarios();
  assert.equal(Array.isArray(scenarios), true);
  assert.deepEqual(scenarios.map(({ caseId }) => caseId).sort(), ['D1', 'O1', 'O2', 'O3', 'O4']);
  assert.equal(new Set(scenarios.map(({ caseId }) => caseId)).size, 5);

  for (const scenario of scenarios) {
    assert.equal(scenario.schemaVersion, 'v1.4');
    assert.equal(Array.isArray(scenario.workflowIds), true);
    assert.equal(Array.isArray(scenario.inputRefs), true);
    assert.equal(scenario.inputRefs.length > 0, true);
    assert.equal(Array.isArray(scenario.expected?.requiredFacts), true);
    assert.equal(Array.isArray(scenario.expected?.requiredStates), true);
    assert.equal(typeof scenario.expected?.numeric, 'object');
    assert.equal(Array.isArray(scenario.forbidden), true);
    assert.equal(['none', 'host-authenticated-delivery'].includes(scenario.liveGate), true);
  }
});

test('scenario inputs are bounded repository fixtures and all references resolve', async () => {
  const scenarios = await loadScenarios();
  for (const scenario of scenarios) {
    for (const inputRef of scenario.inputRefs) {
      assert.equal(path.isAbsolute(inputRef), false, `${scenario.caseId} input must be relative`);
      assert.equal(inputRef.includes('..'), false, `${scenario.caseId} input must stay in its fixture root`);
      const target = inputRef.startsWith('office/')
        ? path.join(repoRoot, 'tests/fixtures/trio-v2', inputRef)
        : path.join(evalRoot, inputRef);
      await access(target);
    }
  }
});

test('O1 and O2 preserve current-source, conflict, pending, and Chinese-summary boundaries', async () => {
  const scenarios = await loadScenarios();
  const o1 = scenarios.find(({ caseId }) => caseId === 'O1');
  const o2 = scenarios.find(({ caseId }) => caseId === 'O2');

  assert.deepEqual(o1.workflowIds, ['W1']);
  assert.deepEqual(o1.expected.requiredStates, ['fact', 'assumption', 'conflict', 'recommendation', 'pending']);
  assert.deepEqual(o1.expected.requiredFacts, ['2026-01-03', '12日交付草稿', '一期只读查询']);
  assert.deepEqual(o1.expected.numeric, {});
  assert.equal(o1.forbidden.includes('old_requirement_as_current_fact'), true);
  assert.equal(o1.forbidden.includes('fabricated_csv_decision'), true);

  assert.deepEqual(o2.workflowIds, ['W2']);
  assert.deepEqual(o2.expected.requiredStates, ['事实', '动作', '负责人', '输出', '期限/风险', '来源']);
  assert.equal(o2.expected.requiredFacts.includes('证据不足，待确认'), true);
  assert.equal(o2.forbidden.includes('fabricated_owner'), true);
  assert.equal(o2.forbidden.includes('fabricated_next_week_plan'), true);
});

test('O3 keeps the existing Office numeric and artifact contracts exact', async () => {
  const scenarios = await loadScenarios();
  const o3 = scenarios.find(({ caseId }) => caseId === 'O3');
  assert.deepEqual(o3.inputRefs, [
    'office/document-brief.docx',
    'office/pdf-review.pdf',
    'office/presentation-status.pptx',
    'office/spreadsheet-budget.xlsx'
  ]);
  assert.deepEqual(o3.expected.numeric, {
    C5: 1200,
    C6: 950,
    C7: 1450,
    C10: 3600,
    C11: 0.1,
    C12: 3960,
    tolerance: 1e-9
  });
  assert.equal(o3.expected.requiredStates.includes('rendered'), true);
  assert.equal(o3.forbidden.includes('file_exists_as_acceptance'), true);
});

test('O4 is live-only and deterministic evidence can never claim delivery', async () => {
  const scenarios = await loadScenarios();
  const o4 = scenarios.find(({ caseId }) => caseId === 'O4');
  assert.deepEqual(o4.workflowIds, ['W2']);
  assert.equal(o4.liveGate, 'host-authenticated-delivery');
  assert.deepEqual(o4.expected.requiredStates, ['blocked', 'unknown']);
  assert.equal(o4.expected.requiredStates.includes('pass'), false);
  for (const boundary of ['source', 'schedule', 'recipient', 'authorization', 'execution', 'recipientVisible']) {
    assert.equal(o4.forbidden.includes(`missing_${boundary}_as_pass`), true);
  }
  assert.equal(o4.forbidden.includes('mock_delivery'), true);
  assert.equal(o4.forbidden.includes('queued_as_delivered'), true);
});

test('D1 freezes the selected design and does not smuggle launch scope into the handoff', async () => {
  const scenarios = await loadScenarios();
  const d1 = scenarios.find(({ caseId }) => caseId === 'D1');
  assert.deepEqual(d1.workflowIds, ['W3']);
  assert.deepEqual(d1.expected.requiredStates, ['loading', 'empty', 'error', 'normal']);
  assert.equal(d1.expected.requiredFacts.includes('只读列表'), true);
  assert.equal(d1.expected.requiredFacts.includes('已有详情'), true);
  for (const forbidden of ['new_export', 'new_login', 'new_payment', 'launch_claim', 'fabricated_api_field']) {
    assert.equal(d1.forbidden.includes(forbidden), true);
  }
});

test('the result contract separates requested settings, actual evidence, and delivery states', async () => {
  const readme = await readFile(path.join(evalRoot, 'README.md'), 'utf8');
  for (const field of [
    'runId', 'hostRunRef', 'caseId', 'workflowIds', 'variant', 'attempt',
    'requestedModel', 'requestedEffort', 'actualModelEvidence', 'hostEvidenceRef',
    'sourceRefs', 'artifactRefs', 'result', 'limitations', 'retries', 'delivery',
    'liveGateEvidence'
  ]) assert.match(readme, new RegExp(`\\b${field}\\b`));
  assert.match(readme, /generated[^\n]*opened[^\n]*rendered[^\n]*accepted[^\n]*delivered/);
  assert.match(readme, /actualModelEvidence[^\n]*(?:unknown|null)/);
  assert.match(readme, /O4[^\n]*authorized=yes[^\n]*recipientVisible=yes/);
  assert.match(readme, /fixture[^\n]*(?:cannot|must not|不得)[^\n]*(?:pass|delivery)/i);
});

test('the executable result contract rejects malformed evidence and O4 delivery claims', () => {
  const valid = {
    schemaVersion: 'v1.4',
    runId: 'v14-o1-contract-example-01',
    hostRunRef: 'unknown',
    hostEvidenceRef: 'unknown',
    caseId: 'O1',
    workflowIds: ['W1'],
    variant: 'semantic-replay',
    attempt: 1,
    retries: 0,
    requestedModel: 'main/gpt-5.6-luna',
    requestedEffort: 'high',
    actualModelEvidence: 'unknown',
    sourceRefs: [{ ref: 'fixtures/o1-conflicting-product-sources.md', range: '2026-01-01/2026-01-03' }],
    artifactRefs: [{ pathOrHostRef: 'evidence/output.md', state: 'generated' }],
    result: 'unknown',
    limitations: ['No live delivery was attempted.'],
    usage: { freshTokens: null, cachedTokens: null, billing: null },
    delivery: { authorized: 'unknown', recipientVisible: 'unknown' },
    liveGateEvidence: null,
  };

  assert.deepEqual(validateResultRecord(valid), []);
  assert.ok(validateResultRecord({ ...valid, attempt: 2 }).includes('retries must equal attempt - 1'));
  assert.ok(validateResultRecord({ ...valid, limitations: 'none' }).includes('limitations must be a non-empty string array'));
  assert.ok(validateResultRecord({
    ...valid,
    caseId: 'O4',
    variant: 'semantic-replay',
    result: 'pass',
    hostRunRef: 'automation-2',
    hostEvidenceRef: 'automation-2/config',
    artifactRefs: [{ pathOrHostRef: 'automation-2/output', state: 'delivered' }],
    delivery: { authorized: 'yes', recipientVisible: 'yes' },
    liveGateEvidence: {
      source: { state: 'yes', ref: 'automation-2/prompt' },
      schedule: { state: 'yes', ref: 'automation-2/rrule' },
      recipient: { state: 'yes', ref: 'automation-2/target' },
      authorization: { state: 'yes', ref: 'automation-2/active' },
      executionEvent: { state: 'yes', ref: 'automation-2/run' },
      recipientVisible: { state: 'yes', ref: 'automation-2/readback' },
    },
  }).includes('O4 pass requires variant=pilot'));
  assert.ok(validateResultRecord({
    ...valid,
    caseId: 'O4',
    variant: 'pilot',
    result: 'pass',
    delivery: { authorized: 'yes', recipientVisible: 'unknown' },
  }).includes('O4 pass requires authorized=yes and recipientVisible=yes'));
  assert.ok(validateResultRecord({
    ...valid,
    artifactRefs: [{ pathOrHostRef: 'evidence/output.md', state: 'configured' }],
  }).includes('artifactRefs[0].state is invalid'));
  assert.ok(validateResultRecord({
    ...valid,
    caseId: 'O4',
    hostRunRef: 'automation-2',
    hostEvidenceRef: 'automation-2/config',
    variant: 'pilot',
    result: 'pass',
    artifactRefs: [{ pathOrHostRef: 'automation-2/config', state: 'delivered' }],
    delivery: { authorized: 'yes', recipientVisible: 'yes' },
    liveGateEvidence: {
      source: { state: 'yes', ref: 'automation-2/prompt' },
      schedule: { state: 'yes', ref: 'automation-2/rrule' },
      recipient: { state: 'yes', ref: 'automation-2/target' },
      authorization: { state: 'yes', ref: 'automation-2/active' },
      executionEvent: { state: 'unknown', ref: 'unknown' },
      recipientVisible: { state: 'unknown', ref: 'unknown' },
    },
  }).includes('O4 pass requires all live gate evidence states and refs'));
});
