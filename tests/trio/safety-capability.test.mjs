import assert from 'node:assert/strict';
import { constants } from 'node:fs';
import { access, lstat, readdir, readFile } from 'node:fs/promises';
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
const expectedCapabilityNames = Object.freeze(['SKILL.md', 'bin']);
const expectedFixtureNames = Object.freeze(Object.keys(expectedFixtureDefinitions));

const expectedOutputs = Object.freeze([
  'harness/trio/capabilities/safety/SKILL.md',
  'harness/trio/capabilities/safety/bin/checkpoint',
  'tests/trio/safety-capability.test.mjs',
  ...expectedFixtureNames.map((name) => `tests/fixtures/trio-v2/safety/${name}`)
]);

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

function assertExactInventory(actualNames, expectedNames, label) {
  assert.deepEqual(
    [...actualNames].sort(),
    [...expectedNames].sort(),
    `${label} must contain the exact approved inventory.`
  );
}

// Recognize essential ordered decision clauses without freezing sentences or headings.
function extractDecisionRules(markdown) {
  const definitions = [
    { name: 'credential-deny', pattern: /credentials[^\n]*secrets[^\n]*certificates[^\n]*payment data[^\n]*production configuration[^\n]*deny/i,
      decision: 'deny', matches: (c) => c.credential === true },
    { name: 'boundary-deny', pattern: /(?:invalid|ambiguous)[^\n]*outside authority[^\n]*cross.workspace[^\n]*deny/i,
      decision: 'deny', matches: (c) => c.invalidTarget || c.targetScope === 'outside_authority' || c.crossWorkspace === true },
    { name: 'external-ask', pattern: /external write[^\n]*send[^\n]*merge[^\n]*release[^\n]*deploy[^\n]*publish[^\n]*ask/i,
      decision: 'ask', matches: (c) => c.externalEffect !== 'none' },
    { name: 'destructive-ask', pattern: /local destructive[^\n]*delete[^\n]*cleanup[^\n]*reset[^\n]*chmod[^\n]*chown[^\n]*ask/i,
      decision: 'ask', matches: (c) => c.mutates === true },
    { name: 'fixture-allow', pattern: /only[^\n]*authority.contained[^\n]*fixture.local[^\n]*mutates=false[^\n]*externalEffect=none[^\n]*allow/i,
      decision: 'allow', matches: (c) => c.targetScope === 'fixture_local' && c.operation === 'verify' && c.mutates === false && c.externalEffect === 'none' },
  ];
  let previous = -1;
  for (const rule of definitions) {
    const match = rule.pattern.exec(markdown);
    assert.ok(match, `Missing safety decision: ${rule.name}`);
    assert.ok(match.index > previous, `Safety precedence changed: ${rule.name}`);
    previous = match.index;
  }
  assert.match(markdown, /first applicable decision wins/i);
  return definitions;
}

function resolveDecisionFromSkill(markdown, candidate) {
  return extractDecisionRules(markdown).find((rule) => rule.matches(candidate))?.decision ?? null;
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
  const { fields } = parseSkill(markdown);
  assert.equal(fields.name, 'safety');
  assert.ok(fields.description);
  extractDecisionRules(markdown);
  for (const rule of [
    /recommendations only/i,
    /risk assessment[^\n]*checkpoint reference[^\n]*rollback steps[^\n]*human confirmation/i,
    /never convert[^\n]*ask[^\n]*allow/i,
    /Host[^\n]*security[^\n]*binding/i,
    /never clean[^\n]*Host.owned[^\n]*inference/i,
    /cleanup[^\n]*authenticated ownership[^\n]*gate/i,
    /Trio[^\n]*sole durable task authority/i,
    /checkpoint[^\n]*recovery evidence only[^\n]*never[^\n]*permission/i,
    /does not[^\n]*read or log credentials[^\n]*run commands/i,
    /deny and ask[^\n]*never[^\n]*executed[^\n]*approved[^\n]*released[^\n]*sent/i,
  ]) assert.match(markdown, rule);
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

test('safety capability exposes exactly the seven approved read-only outputs', async () => {
  for (const relativePath of expectedOutputs) {
    await access(path.join(repositoryRoot, relativePath));
  }

  const capabilityEntries = await readdir(capabilityDirectory, { withFileTypes: true });
  assertExactInventory(
    capabilityEntries.map((entry) => entry.name),
    expectedCapabilityNames,
    'Safety capability directory'
  );
  const skillEntry = capabilityEntries.find((entry) => entry.name === 'SKILL.md');
  const binEntry = capabilityEntries.find((entry) => entry.name === 'bin');
  assert.ok(skillEntry?.isFile(), 'Safety capability SKILL.md must be a file.');
  assert.ok(binEntry?.isDirectory(), 'Safety capability bin must be a directory.');

  const checkpointPath = path.join(capabilityDirectory, 'bin', 'checkpoint');
  const checkpointStats = await lstat(checkpointPath);
  assert.ok(checkpointStats.isFile(), 'Safety capability checkpoint must be a regular file.');
  await access(checkpointPath, constants.X_OK);

  const fixtureEntries = await readdir(fixtureDirectory, { withFileTypes: true });
  assertExactInventory(
    fixtureEntries.map((entry) => entry.name),
    expectedFixtureNames,
    'Safety fixture directory'
  );
  assert.ok(fixtureEntries.every((entry) => entry.isFile()), 'Safety fixture inventory must contain files only.');

  await assert.rejects(
    access(path.join(repositoryRoot, 'harness/core/hooks/safety')),
    { code: 'ENOENT' }
  );
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

test('safety semantic mutations cannot broaden permission or remove recovery safeguards', async () => {
  const text = await readFile(skillPath, 'utf8');
  for (const pattern of [
    /^.*invalid or ambiguous.*$/mi,
    /^Credentials.*$/mi,
    /^External write.*ask.*$/mi,
    /^Only.*fixture.local.*$/mi,
    /^A destructive ask.*$/mi,
    /^A checkpoint.*$/mi,
    /^Never clean.*$/mi,
    /^The first applicable.*$/mi,
  ]) assert.throws(() => assertSafetySkillContract(text.replace(pattern, '')));
  // A harmless lexical variation must not invalidate decision coverage.
  assertSafetySkillContract(text.replace('Any invalid or ambiguous target', 'An invalid or ambiguous target'));
  const external = /^External write.*ask.*$/m.exec(text)[0];
  const local = /^Local destructive.*$/m.exec(text)[0];
  assert.throws(() => assertSafetySkillContract(text.replace(external, 'SWAP').replace(local, external).replace('SWAP', local)));
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


test('safety recommendation scope honors prior authorization without overriding Host policy', async () => {
  const text = await readFile(skillPath, 'utf8');
  for (const rule of [
    /recommendation[^\n]*not[^\n]*(?:Host|global)[^\n]*permission/i,
    /(?:reuse|honor)[^\n]*existing authorization|existing authorization[^\n]*applies/i,
    /ask[^\n]*does not[^\n]*(?:repeat|another|new)[^\n]*question/i,
    /(?:changed|missing|ambiguous)[^\n]*(?:scope|authorization)[^\n]*(?:ask|clarify)/i,
    /Host[^\n]*(?:security|restrictions)[^\n]*(?:unchanged|binding|retain)/i,
  ]) assert.match(text, rule);
});
