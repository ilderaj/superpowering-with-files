import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const fixturePath = path.join(
  process.cwd(),
  'tests/fixtures/planning-carrier-evaluation/cards.json'
);

const expectedCarrierIds = [
  'host-checked-in-docs',
  'single-task-file',
  'reduced-trio'
];

const expectedScenarioActions = {
  'restart-without-chat-history': 'restore-from-declared-carrier',
  'two-active-tasks-ambiguity': 'refuse-ambiguity',
  'untrusted-finding': 'isolate-untrusted-content',
  'failed-validation': 'preserve-and-record-failed-validation',
  'premature-close': 'decline-unsafe-closure'
};

test('planning carrier fixture defines a bounded contract without claiming recovery proof', async () => {
  const fixture = JSON.parse(await readFile(fixturePath, 'utf8'));
  const { packet, carriers, scenarios, limitations, replayProtocol } = fixture;

  assert.equal(fixture.schemaVersion, 1);
  assert.equal(packet.id, 'pwf-carrier-recovery-r0');
  assert.equal(packet.immutable, true);
  assert.equal(packet.baseReference, 'same-base-sha');
  assert.deepEqual(packet.allowedOps, ['inspect', 'draft', 'propose']);
  assert.deepEqual(Object.keys(packet.allowedOps).sort(), ['0', '1', '2']);

  assert.equal(packet.acceptance.id, 'pwf-carrier-recovery-acceptance-r0');
  assert.equal(packet.acceptance.requiresFreshWorkerReplay, true);
  assert.equal(packet.acceptance.requiresNoPriorChatHistory, true);
  assert.equal(packet.acceptance.requiresChiefIndependentReceipt, true);

  assert.equal(packet.rollback.action, 'discard-isolated-evaluation-worktree');
  assert.equal(packet.rollback.scope, 'isolated-evaluation-worktree-only');
  assert.match(packet.rollback.rule, /only the isolated evaluation worktree/i);

  assert.deepEqual(
    carriers.map((carrier) => carrier.id).sort(),
    expectedCarrierIds.slice().sort()
  );
  assert.equal(carriers.length, expectedCarrierIds.length);

  for (const carrier of carriers) {
    assert.deepEqual(
      Object.keys(carrier).sort(),
      ['acceptance', 'baseReference', 'id', 'packetId', 'rollback', 'shape']
    );
    assert.equal(carrier.packetId, packet.id);
    assert.equal(carrier.baseReference, packet.baseReference);
    assert.deepEqual(carrier.acceptance, packet.acceptance);
    assert.deepEqual(carrier.rollback, packet.rollback);
    assert.deepEqual(Object.keys(carrier.shape).sort(), ['carrierKind', 'description']);
    assert.equal(typeof carrier.shape.description, 'string');
    assert.ok(carrier.shape.description.length > 0);
  }

  assert.deepEqual(
    scenarios.map((scenario) => scenario.id).sort(),
    Object.keys(expectedScenarioActions).sort()
  );
  assert.equal(scenarios.length, Object.keys(expectedScenarioActions).length);

  const expectedRules = {
    'restart-without-chat-history': /declared carrier|chat history/i,
    'two-active-tasks-ambiguity': /refuse|guess|explicit task binding/i,
    'untrusted-finding': /isolate|untrusted|authority/i,
    'failed-validation': /preserve|record|failed validation|success/i,
    'premature-close': /decline|closure|lifecycle gate/i
  };

  for (const scenario of scenarios) {
    const response = scenario.expectedSafeResponse;
    assert.equal(response.action, expectedScenarioActions[scenario.id]);
    assert.equal(typeof response.rule, 'string');
    assert.ok(response.rule.length > 0);
    assert.match(response.rule, expectedRules[scenario.id]);
  }

  assert.equal(limitations.contractOnly, true);
  assert.equal(limitations.recoveryProof, false);
  assert.equal(limitations.secondTaskMemorySystem, false);
  assert.equal(limitations.fixtureValidationAloneIsUnacceptable, true);
  assert.match(limitations.statement, /contract only/i);
  assert.match(limitations.statement, /not recovery proof/i);
  assert.match(limitations.statement, /not.*second task-memory system/i);

  assert.equal(replayProtocol.requiresFreshWorker, true);
  assert.equal(replayProtocol.requiresNoPriorChatHistory, true);
  assert.deepEqual(replayProtocol.chiefReceipt, {
    required: true,
    owner: 'Chief',
    independent: true
  });
  assert.equal(replayProtocol.unacceptableSubstitute, 'Fixture validation is an unacceptable substitute for fresh-worker replay plus real cross-session proof.');

  assert.equal(fixture.decision.noCarrierReductionBeforeLaterProof, true);
  assert.equal(fixture.decision.noPwfDeleteBeforeLaterProof, true);
  assert.match(fixture.decision.conclusion, /no carrier reduction or PWF deletion/i);
  assert.match(fixture.decision.conclusion, /later.*proof/i);
});
