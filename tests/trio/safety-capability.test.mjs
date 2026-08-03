import assert from 'node:assert/strict';
import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(testDirectory, '..', '..');
const skillPath = path.join(repositoryRoot, 'harness', 'trio', 'capabilities', 'safety', 'SKILL.md');
const capabilityDirectory = path.dirname(skillPath);
const fixtureDirectory = path.join(repositoryRoot, 'tests', 'fixtures', 'trio-v2', 'safety');

const expectedFixtureDefinitions = Object.freeze({
  'allow-fixture-local.json': Object.freeze({
    id: 'allow-fixture-local',
    operation: 'verify',
    target: 'tests/fixtures/trio-v2/safety/fixture.txt',
    targetScope: 'fixture_local',
    mutates: false,
    externalEffect: 'none',
    decision: 'allow'
  }),
  'ask-destructive-cleanup.json': Object.freeze({
    id: 'ask-destructive-cleanup',
    operation: 'cleanup',
    target: 'planning/active/example/cleanup-target',
    targetScope: 'authority_relative',
    mutates: true,
    externalEffect: 'none',
    decision: 'ask'
  }),
  'checkpoint-rollback.json': Object.freeze({
    id: 'checkpoint-rollback',
    operation: 'destructive_cleanup',
    target: 'planning/active/example/destructive-target',
    targetScope: 'authority_relative',
    mutates: true,
    externalEffect: 'none',
    decision: 'ask'
  }),
  'deny-outside-authority.json': Object.freeze({
    id: 'deny-outside-authority',
    operation: 'delete',
    target: '../outside-authority/target',
    targetScope: 'outside_authority',
    mutates: true,
    externalEffect: 'none',
    decision: 'deny'
  })
});

const expectedFixtureTupleFields = Object.freeze([
  'id',
  'operation',
  'target',
  'targetScope',
  'mutates',
  'externalEffect',
  'decision'
]);
const expectedCapabilityNames = Object.freeze(['SKILL.md']);
const expectedFixtureNames = Object.freeze(Object.keys(expectedFixtureDefinitions));

const expectedOutputs = Object.freeze([
  'harness/trio/capabilities/safety/SKILL.md',
  'tests/trio/safety-capability.test.mjs',
  ...expectedFixtureNames.map((name) => `tests/fixtures/trio-v2/safety/${name}`)
]);

function replaceExactlyOnce(source, before, after) {
  const occurrences = source.split(before).length - 1;
  assert.equal(occurrences, 1, `Expected one source occurrence for: ${before}`);
  return source.replace(before, after);
}

function parseSkill(markdown) {
  const lines = markdown.split(/\r?\n/u);
  assert.equal(lines[0], '---', 'The skill must begin with a YAML header.');
  const closingIndex = lines.indexOf('---', 1);
  assert.ok(closingIndex > 1, 'The skill must close its YAML header.');

  const fields = {};
  for (const line of lines.slice(1, closingIndex)) {
    const match = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/u);
    assert.ok(match, `Invalid header line: ${line}`);
    const key = match[1];
    assert.equal(Object.hasOwn(fields, key), false, `Duplicate header key: ${key}`);
    fields[key] = match[2].replace(/^['"]|['"]$/gu, '');
  }

  return {
    fields,
    body: lines.slice(closingIndex + 1).join('\n')
  };
}

function sectionBody(body, heading) {
  const lines = body.split(/\r?\n/u);
  const headingIndex = lines.indexOf(`## ${heading}`);
  assert.ok(headingIndex >= 0, `Missing section: ${heading}`);
  const nextHeadingOffset = lines.slice(headingIndex + 1).findIndex((line) => /^##\s+/u.test(line));
  const endIndex = nextHeadingOffset < 0
    ? lines.length
    : headingIndex + 1 + nextHeadingOffset;
  return lines.slice(headingIndex + 1, endIndex).join('\n');
}

function assertExactInventory(actualNames, expectedNames, label) {
  assert.deepEqual(
    [...actualNames].sort(),
    [...expectedNames].sort(),
    `${label} must contain the exact approved inventory.`
  );
}

function decisionClauseLines(markdown) {
  const { body } = parseSkill(markdown);
  return sectionBody(body, 'Decision Precedence')
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
}

function findDecisionClause(lines, clause) {
  const index = lines.findIndex((line) => line === clause || line.startsWith(`${clause} `));
  assert.ok(index >= 0, `Missing decision clause: ${clause}`);
  return index;
}

function extractDecisionRules(markdown) {
  const lines = decisionClauseLines(markdown);
  const indexes = {
    credentialDeny: findDecisionClause(
      lines,
      'Credentials, secrets, certificates, payment data, and production configuration are always deny.'
    ),
    boundaryDeny: findDecisionClause(
      lines,
      'Any invalid or ambiguous target, any path outside authority, any cross-workspace write or delete, and any credentials, secrets, certificates, payment data, or production configuration is deny.'
    ),
    externalAsk: findDecisionClause(
      lines,
      'External write, send, merge, release, deploy, or publish is ask with an explicit Host capability observation and a human gate.'
    ),
    localAsk: findDecisionClause(
      lines,
      'Local destructive, delete, cleanup, reset, chmod, chown, or broad rewrite is ask.'
    ),
    fixtureAllow: findDecisionClause(
      lines,
      'Only an authority-contained fixture-local verification with mutates=false and externalEffect=none can be allow.'
    ),
    firstApplicable: findDecisionClause(lines, 'The first applicable decision wins.')
  };

  assert.ok(indexes.boundaryDeny < indexes.externalAsk, 'Boundary deny must precede external ask.');
  assert.ok(indexes.boundaryDeny < indexes.localAsk, 'Boundary deny must precede local ask.');
  assert.ok(indexes.boundaryDeny < indexes.fixtureAllow, 'Boundary deny must precede fixture allow.');
  assert.ok(indexes.externalAsk < indexes.localAsk, 'External ask must precede local ask.');
  assert.ok(indexes.externalAsk < indexes.fixtureAllow, 'External ask must precede fixture allow.');
  assert.ok(indexes.localAsk < indexes.fixtureAllow, 'Local ask must precede fixture allow.');
  assert.ok(indexes.firstApplicable > indexes.fixtureAllow, 'First-applicable declaration must follow the ordered clauses.');

  return [
    {
      name: 'credential-deny',
      index: indexes.credentialDeny,
      decision: 'deny',
      matches: (candidate) => candidate.credential === true
    },
    {
      name: 'boundary-deny',
      index: indexes.boundaryDeny,
      decision: 'deny',
      matches: (candidate) => candidate.targetScope === 'outside_authority' || candidate.crossWorkspace === true
    },
    {
      name: 'external-ask',
      index: indexes.externalAsk,
      decision: 'ask',
      matches: (candidate) => candidate.externalEffect !== 'none'
    },
    {
      name: 'local-destructive-ask',
      index: indexes.localAsk,
      decision: 'ask',
      matches: (candidate) => candidate.mutates === true
    },
    {
      name: 'fixture-local-allow',
      index: indexes.fixtureAllow,
      decision: 'allow',
      matches: (candidate) => (
        candidate.targetScope === 'fixture_local'
        && candidate.operation === 'verify'
        && candidate.mutates === false
        && candidate.externalEffect === 'none'
      )
    }
  ].sort((left, right) => left.index - right.index);
}

function resolveDecisionFromSkill(markdown, candidate) {
  const rule = extractDecisionRules(markdown).find((entry) => entry.matches(candidate));
  return rule?.decision ?? null;
}

function swapExactlyOnce(source, first, second) {
  const marker = '__SAFETY_SWAP_MARKER__';
  assert.equal(source.split(first).length - 1, 1, `Expected one source occurrence for: ${first}`);
  assert.equal(source.split(second).length - 1, 1, `Expected one source occurrence for: ${second}`);
  return source.replace(first, marker).replace(second, first).replace(marker, second);
}

const forbiddenTerminalStates = new Set(['executed', 'approved', 'released', 'sent']);

function assertNoTerminalState(value, location = 'root') {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoTerminalState(entry, `${location}[${index}]`));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      const normalizedKey = key.trim().toLowerCase();
      if (forbiddenTerminalStates.has(normalizedKey)) {
        throw new Error(`Forbidden terminal state key at ${location}.${key}.`);
      }
      assertNoTerminalState(child, `${location}.${key}`);
    }
    return;
  }
  if (typeof value === 'string' && forbiddenTerminalStates.has(value.trim().toLowerCase())) {
    throw new Error(`Forbidden terminal state value at ${location}.`);
  }
}

function assertSafetySkillContract(markdown) {
  const { fields, body } = parseSkill(markdown);
  assert.equal(fields.name, 'safety');
  assert.match(fields.description ?? '', /\S/u);

  const requiredSections = [
    'Decision Precedence',
    'Evidence and Human Gates',
    'Isolation and Worktree',
    'Authority and Recovery',
    'Non-Goals',
    'Return Contract'
  ];
  for (const heading of requiredSections) sectionBody(body, heading);

  const decision = sectionBody(body, 'Decision Precedence').toLowerCase();
  assert.match(decision, /invalid or ambiguous target[\s\S]*outside authority[\s\S]*cross-workspace write or delete[\s\S]*deny/u);
  assert.match(decision, /credentials, secrets, certificates, payment data, and production configuration are always deny/u);
  assert.match(decision, /external write, send, merge, release, deploy, or publish is ask with an explicit host capability observation and a human gate/u);
  assert.match(decision, /local destructive, delete, cleanup, reset, chmod, chown, or broad rewrite is ask/u);
  assert.match(decision, /only an authority-contained fixture-local verification with mutates=false and externaleffect=none can be allow/u);
  assert.doesNotMatch(decision, /fixture-local destructive cleanup can be allow/u);
  extractDecisionRules(markdown);

  const evidence = sectionBody(body, 'Evidence and Human Gates').toLowerCase();
  assert.match(evidence, /risk assessment, checkpoint reference, rollback steps, and human confirmation as evidence/u);
  assert.match(evidence, /never convert an ask to allow/u);
  assert.match(evidence, /external write, send, merge, release, deploy, publish, or deploy remains gated/u);

  const isolation = sectionBody(body, 'Isolation and Worktree').toLowerCase();
  assert.match(isolation, /worktree and isolation evidence must be truthful and host-aware/u);
  assert.match(isolation, /absent or unverified isolation keeps risk gated/u);
  assert.match(isolation, /never clean a host-owned worktree by inference/u);

  const authority = sectionBody(body, 'Authority and Recovery').toLowerCase();
  assert.match(authority, /the trio is the sole durable task authority/u);
  assert.match(authority, /checkpoint is recovery evidence only; it is never approval, permission, a receipt, or a second authority/u);
  assert.match(authority, /do not absorb safe-bypass-flow remote push, merge, or cleanup automation/u);

  const nonGoals = sectionBody(body, 'Non-Goals').toLowerCase();
  for (const forbiddenSurface of [
    'executor',
    'approval lifecycle',
    'host lifecycle',
    'receipt',
    'registry',
    'profile',
    'companion',
    'reconciliation'
  ]) {
    assert.match(nonGoals, new RegExp(`no .*${forbiddenSurface}`, 'u'));
  }

  const returnContract = sectionBody(body, 'Return Contract').toLowerCase();
  assert.match(returnContract, /deny and ask never expose executed, approved, released, or sent states/u);
}

function assertDecisionSafe(fixture) {
  assert.ok(['deny', 'ask', 'allow'].includes(fixture.decision), 'Decision must be known.');
  if (fixture.decision === 'deny' || fixture.decision === 'ask') {
    assertNoTerminalState(fixture);
  }
}

function assertFixture(fixture, expectedName) {
  assert.equal(typeof fixture, 'object');
  assert.ok(fixture && !Array.isArray(fixture));
  for (const field of [
    'id',
    'operation',
    'target',
    'targetScope',
    'mutates',
    'externalEffect',
    'decision',
    'reason'
  ]) {
    assert.ok(Object.hasOwn(fixture, field), `${expectedName} is missing ${field}.`);
  }
  assert.equal(typeof fixture.id, 'string');
  assert.equal(typeof fixture.operation, 'string');
  assert.equal(typeof fixture.target, 'string');
  assert.equal(typeof fixture.targetScope, 'string');
  assert.equal(typeof fixture.mutates, 'boolean');
  assert.equal(typeof fixture.externalEffect, 'string');
  assertDecisionSafe(fixture);
  assert.notEqual(fixture.externalEffect, 'unknown');

  if (fixture.decision === 'allow') {
    if (fixture.mutates) throw new Error('allow fixture cannot mutate.');
    if (fixture.externalEffect !== 'none') throw new Error('allow fixture requires externalEffect=none.');
    assert.equal(fixture.targetScope, 'fixture_local');
    assert.equal(fixture.operation, 'verify');
    assert.match(fixture.target, /^tests\/fixtures\/trio-v2\/safety\//u);
    assert.equal(fixture.mutates, false);
    assert.equal(fixture.externalEffect, 'none');
  }

  if (fixture.id === 'deny-outside-authority') {
    assert.equal(fixture.operation, 'delete');
    assert.equal(fixture.targetScope, 'outside_authority');
    assert.equal(fixture.mutates, true);
    assert.equal(fixture.decision, 'deny');
    assert.match(fixture.resumeCondition, /authority-relative target/u);
  }

  if (fixture.id === 'ask-destructive-cleanup') {
    assert.equal(fixture.operation, 'cleanup');
    assert.equal(fixture.targetScope, 'authority_relative');
    assert.equal(fixture.mutates, true);
    assert.equal(fixture.decision, 'ask');
    assert.deepEqual(fixture.requiredEvidence, [
      'risk_assessment',
      'checkpoint_reference',
      'rollback_steps',
      'human_confirmation'
    ]);
  }

  if (fixture.id === 'allow-fixture-local') {
    assert.equal(fixture.operation, 'verify');
    assert.equal(fixture.targetScope, 'fixture_local');
    assert.equal(fixture.mutates, false);
    assert.equal(fixture.externalEffect, 'none');
    assert.equal(fixture.decision, 'allow');
  }

  if (fixture.id === 'checkpoint-rollback') {
    assert.equal(fixture.operation, 'destructive_cleanup');
    assert.equal(fixture.targetScope, 'authority_relative');
    assert.equal(fixture.mutates, true);
    assert.equal(fixture.decision, 'ask');
    assert.deepEqual(fixture.requiredEvidence, [
      'risk_assessment',
      'checkpoint_reference',
      'rollback_steps',
      'human_confirmation'
    ]);
    assert.equal(fixture.checkpoint.role, 'recovery_evidence_only');
    assert.equal(typeof fixture.checkpoint.reference, 'string');
    assert.equal(typeof fixture.rollback.restoreSource, 'string');
    assert.ok(Array.isArray(fixture.rollback.steps));
    assert.equal(fixture.rollback.stopOnFailure, true);
    assertNoTerminalState(fixture);
    const serialized = JSON.stringify(fixture).toLowerCase();
    for (const forbiddenClaim of ['approval', 'approved', 'release', 'released']) {
      assert.doesNotMatch(serialized, new RegExp(`"${forbiddenClaim}"`, 'u'));
    }
  }
}

function assertFixtureSet(fixtures) {
  assert.equal(fixtures.length, expectedFixtureNames.length);
  const ids = fixtures.map((fixture) => fixture.id);
  assert.equal(new Set(ids).size, ids.length, 'Fixture IDs must be unique.');
  const knownIds = new Set(Object.values(expectedFixtureDefinitions).map((definition) => definition.id));
  for (const fixture of fixtures) {
    assert.ok(knownIds.has(fixture.id), `Unknown fixture ID: ${fixture.id}`);
    assertFixture(fixture, fixture.id);
  }
}

function assertNamedFixtureSet(namedFixtures) {
  assertExactInventory(namedFixtures.map(({ name }) => name), expectedFixtureNames, 'Safety fixture directory');
  assertFixtureSet(namedFixtures.map(({ data }) => data));
  for (const { name, data } of namedFixtures) {
    const definition = expectedFixtureDefinitions[name];
    assert.ok(definition, `Unknown fixture filename: ${name}`);
    for (const field of expectedFixtureTupleFields) {
      assert.deepEqual(data[field], definition[field], `${name} has the wrong ${field} mapping.`);
    }
  }
}

async function readNamedFixtures() {
  return Promise.all(expectedFixtureNames.map(async (name) => ({
    name,
    data: JSON.parse(await readFile(path.join(fixtureDirectory, name), 'utf8'))
  })));
}

async function assertExternalWriteMutationRejected(name, expectedDecision) {
  const markdown = await readFile(skillPath, 'utf8');
  const namedFixtures = await readNamedFixtures();
  const selectedFixture = namedFixtures.find((entry) => entry.name === name);
  assert.ok(selectedFixture, `Missing fixture: ${name}`);

  const mutatedFixture = { ...selectedFixture.data, externalEffect: 'write' };
  assert.equal(
    resolveDecisionFromSkill(markdown, mutatedFixture),
    expectedDecision,
    `${name} must retain the Skill-derived decision for an external effect.`
  );
  assert.throws(
    () => assertNamedFixtureSet(namedFixtures.map((entry) => (
      entry.name === name ? { ...entry, data: mutatedFixture } : entry
    ))),
    /externalEffect|tuple|mapping/i
  );
}

function readOnlySemanticMutation(markdown, before, after) {
  const mutated = replaceExactlyOnce(markdown, before, after);
  assert.throws(() => assertSafetySkillContract(mutated));
}

test('safety capability exposes exactly the six approved read-only outputs', async () => {
  for (const relativePath of expectedOutputs) {
    await access(path.join(repositoryRoot, relativePath));
  }

  const capabilityEntries = await readdir(capabilityDirectory, { withFileTypes: true });
  assertExactInventory(
    capabilityEntries.map((entry) => entry.name),
    expectedCapabilityNames,
    'Safety capability directory'
  );
  assert.ok(capabilityEntries.every((entry) => entry.isFile()), 'Safety capability inventory must contain files only.');

  const fixtureEntries = await readdir(fixtureDirectory, { withFileTypes: true });
  assertExactInventory(
    fixtureEntries.map((entry) => entry.name),
    expectedFixtureNames,
    'Safety fixture directory'
  );
  assert.ok(fixtureEntries.every((entry) => entry.isFile()), 'Safety fixture inventory must contain files only.');
});

test('safety skill is a section-scoped pure Markdown contract', async () => {
  assertSafetySkillContract(await readFile(skillPath, 'utf8'));
});

test('safety fixtures form an exact, statically auditable decision matrix', async () => {
  assertNamedFixtureSet(await readNamedFixtures());
});

test('safety inventory validator rejects local extra Markdown and JSON names', () => {
  assert.throws(
    () => assertExactInventory(['SKILL.md', 'extra.md'], expectedCapabilityNames, 'Safety capability directory'),
    /exact|inventory/i
  );
  assert.throws(
    () => assertExactInventory([...expectedFixtureNames, 'extra.json'], expectedFixtureNames, 'Safety fixture directory'),
    /exact|inventory/i
  );
});

test('safety fixture filenames bind exact IDs and targets', async () => {
  const namedFixtures = await readNamedFixtures();
  const allowFixture = namedFixtures.find(({ name }) => name === 'allow-fixture-local.json');
  assert.ok(allowFixture);

  assert.throws(
    () => assertNamedFixtureSet(namedFixtures.map((entry) => (
      entry.name === 'allow-fixture-local.json'
        ? { ...entry, data: { ...entry.data, id: 'allow' } }
        : entry
    ))),
    /unknown|wrong fixture ID|mapping/i
  );
  assert.throws(
    () => assertFixture({ ...allowFixture.data, target: '../outside-authority/target' }, allowFixture.name),
    /fixture|target/i
  );
  assert.throws(
    () => assertFixture({ ...allowFixture.data, target: 'README.md' }, allowFixture.name),
    /fixture|target/i
  );
});

test('ask destructive fixture cannot borrow external write semantics', async () => {
  await assertExternalWriteMutationRejected('ask-destructive-cleanup.json', 'ask');
});

test('deny outside-authority fixture cannot borrow external write semantics', async () => {
  await assertExternalWriteMutationRejected('deny-outside-authority.json', 'deny');
});

test('safety fixture validator rejects duplicate IDs, missing fields, unknown decisions, and contradictions', () => {
  const base = {
    id: 'synthetic',
    operation: 'verify',
    target: 'tests/fixtures/trio-v2/safety',
    targetScope: 'fixture_local',
    mutates: false,
    externalEffect: 'none',
    decision: 'allow',
    reason: 'Fixture-local verification.'
  };

  assert.throws(
    () => assertFixtureSet([base, { ...base, id: 'other' }, { ...base, id: 'other' }, base]),
    /unique|duplicate/i
  );
  assert.throws(() => assertFixture({ ...base, decision: undefined }, 'missing-decision'), /decision/i);
  assert.throws(() => assertFixture({ ...base, decision: 'unknown' }, 'unknown-decision'), /known|decision/i);
  const missingField = { ...base };
  delete missingField.targetScope;
  assert.throws(() => assertFixture(missingField, 'missing-target-scope'), /targetScope/i);
  assert.throws(
    () => assertFixture({ ...base, mutates: true }, 'allow-mutates'),
    /allow|mutates|fixture_local/i
  );
  assert.throws(
    () => assertFixture({ ...base, externalEffect: 'write' }, 'allow-external-effect'),
    /allow|externalEffect|none/i
  );
});

test('safety skill semantic mutations fail closed at their owning sections', async () => {
  const markdown = await readFile(skillPath, 'utf8');

  readOnlySemanticMutation(
    markdown,
    'Any invalid or ambiguous target, any path outside authority, any cross-workspace write or delete, and any credentials, secrets, certificates, payment data, or production configuration is deny.',
    'Any invalid or ambiguous target, any path outside authority, any cross-workspace write or delete, and any credentials, secrets, certificates, payment data, or production configuration is allow.'
  );
  readOnlySemanticMutation(
    markdown,
    'A destructive ask requires risk assessment, checkpoint reference, rollback steps, and human confirmation as evidence.',
    'A destructive ask requires risk assessment, checkpoint reference, and rollback steps as evidence.'
  );
  readOnlySemanticMutation(
    markdown,
    'A checkpoint is recovery evidence only; it is never approval, permission, a receipt, or a second authority.',
    'A checkpoint is approval and permission, and it may allow the operation.'
  );
  readOnlySemanticMutation(
    markdown,
    'Only an authority-contained fixture-local verification with mutates=false and externalEffect=none can be allow.',
    'Fixture-local destructive cleanup can be allow.'
  );
  readOnlySemanticMutation(
    markdown,
    'Credentials, secrets, certificates, payment data, and production configuration are always deny.',
    'Credentials, secrets, certificates, payment data, and production configuration may be inspected when convenient.'
  );
  readOnlySemanticMutation(
    markdown,
    'External write, send, merge, release, deploy, or publish is ask with an explicit Host capability observation and a human gate.',
    'External write, send, merge, release, deploy, or publish is automatic.'
  );
  readOnlySemanticMutation(
    markdown,
    'The Trio is the sole durable task authority.',
    'The Trio is one of several durable task authorities.'
  );
  readOnlySemanticMutation(
    markdown,
    'Never clean a Host-owned worktree by inference.',
    'Clean a Host-owned worktree when its path appears available.'
  );
  readOnlySemanticMutation(
    markdown,
    'The first applicable decision wins.',
    ''
  );
  assert.throws(
    () => assertSafetySkillContract(swapExactlyOnce(
      markdown,
      'External write, send, merge, release, deploy, or publish is ask with an explicit Host capability observation and a human gate.',
      'Local destructive, delete, cleanup, reset, chmod, chown, or broad rewrite is ask.'
    ))
  );
});

test('deny and ask fixtures never claim execution or terminal approval', async () => {
  const fixtures = (await readNamedFixtures()).map(({ data }) => data);
  for (const fixture of fixtures.filter((item) => item.decision !== 'allow')) {
    assertDecisionSafe(fixture);
  }
});

test('recursive terminal-state guard rejects exact states but permits ordinary evidence words', async () => {
  const namedFixtures = await readNamedFixtures();
  const askFixture = namedFixtures.find(({ name }) => name === 'ask-destructive-cleanup.json');
  assert.ok(askFixture);

  for (const mutation of [
    { audit: { status: 'APPROVED' } },
    { audit: [{ result: 'sent' }] },
    { nested: { state: 'released' } },
    { executed: { value: true } },
    { nested: ['safe', { status: 'executed' }] }
  ]) {
    assert.throws(
      () => assertDecisionSafe({ ...askFixture.data, mutation }),
      /terminal state/i
    );
  }

  assert.doesNotThrow(() => assertDecisionSafe({
    ...askFixture.data,
    note: 'Approval evidence is required, but this recommendation is not approved.'
  }));
});

test('precedence resolver follows the ordered clauses in the Safety skill', async () => {
  const markdown = await readFile(skillPath, 'utf8');
  const scenarios = [
    {
      name: 'outside plus external',
      candidate: {
        targetScope: 'outside_authority',
        operation: 'delete',
        mutates: true,
        externalEffect: 'write'
      },
      expected: 'deny'
    },
    {
      name: 'credential plus fixture-local',
      candidate: {
        credential: true,
        targetScope: 'fixture_local',
        operation: 'verify',
        mutates: false,
        externalEffect: 'none'
      },
      expected: 'deny'
    },
    {
      name: 'external plus fixture-local',
      candidate: {
        targetScope: 'fixture_local',
        operation: 'verify',
        mutates: false,
        externalEffect: 'write'
      },
      expected: 'ask'
    },
    {
      name: 'destructive plus fixture-local',
      candidate: {
        targetScope: 'fixture_local',
        operation: 'cleanup',
        mutates: true,
        externalEffect: 'none'
      },
      expected: 'ask'
    }
  ];

  for (const scenario of scenarios) {
    assert.equal(resolveDecisionFromSkill(markdown, scenario.candidate), scenario.expected, scenario.name);
  }
});

test('destructive asks require evidence and never upgrade to allow', async () => {
  const namedFixtures = await readNamedFixtures();
  for (const { name, data } of namedFixtures.filter(({ data: fixture }) => (
    fixture.operation === 'cleanup' || fixture.operation === 'destructive_cleanup'
  ))) {
    assert.equal(data.decision, 'ask', `${name} must remain ask.`);
    assert.deepEqual(data.requiredEvidence, [
      'risk_assessment',
      'checkpoint_reference',
      'rollback_steps',
      'human_confirmation'
    ]);
    assert.throws(
      () => assertFixture({ ...data, decision: 'allow' }, name),
      /allow|ask|fixture/i
    );
  }
});
