import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { planSkillProjections } from '../../harness/installer/lib/skill-projection.mjs';

function projectionKey(projection) {
  return `${projection.parentSkillName}:${projection.skillName}`;
}

test('standard profile makes curated Matt engineering disciplines the default and excludes Superpowers', async () => {
  const plan = await planSkillProjections({
    rootDir: process.cwd(),
    homeDir: '/home/user',
    scope: 'workspace',
    target: 'codex',
    skillProfile: 'standard'
  });

  const keys = plan.map(projectionKey).sort();
  assert.ok(keys.includes('mattpocock-skills:tdd'));
  assert.ok(keys.includes('mattpocock-skills:diagnosing-bugs'));
  assert.ok(keys.includes('mattpocock-skills:code-review'));
  assert.ok(keys.includes('mattpocock-skills:codebase-design'));
  assert.ok(keys.includes('mattpocock-skills:domain-modeling'));
  assert.ok(keys.includes('office-work-quality:office-work-quality'));
  assert.ok(!keys.some((key) => key.startsWith('superpowers:')));
  assert.ok(!keys.includes('superpowers:using-superpowers'));

  const tdd = plan.find((projection) => projectionKey(projection) === 'mattpocock-skills:tdd');
  assert.match(tdd.sourcePath, /harness\/upstream\/mattpocock-skills\/skills\/engineering\/tdd$/);
  assert.match(tdd.targetPath, /\.agents\/skills\/tdd$/);
});

test('minimal-global only projects the allow-listed subset for user-global Codex', async () => {
  const plan = await planSkillProjections({
    rootDir: process.cwd(),
    homeDir: '/home/user',
    scope: 'user-global',
    target: 'codex',
    skillProfile: 'minimal-global'
  });

  const keys = plan.map(projectionKey).sort();
  const allowedGlobalRoot = '/home/user/.agents/skills/';
  assert.deepEqual(keys, [
    'mattpocock-skills:code-review',
    'mattpocock-skills:diagnosing-bugs',
    'mattpocock-skills:tdd',
    'office-work-quality:office-work-quality',
    'planning-with-files:planning-with-files',
  ]);
  assert.ok(plan.every((projection) => projection.targetPath.startsWith(allowedGlobalRoot)));
  assert.ok(!keys.some((key) => key.startsWith('superpowers:')));
  assert.ok(keys.includes('mattpocock-skills:tdd'));
  assert.ok(keys.includes('office-work-quality:office-work-quality'));
  assert.ok(plan.some((projection) => projection.skillName === 'planning-with-files'));
  assert.ok(!keys.includes('overengineering-review:overengineering-review'));
  assert.ok(!keys.includes('simplification-ledger:simplification-ledger'));
});

test('full remains a high-assurance compatibility alias while default is lightweight standard', async () => {
  const fullPlan = await planSkillProjections({
    rootDir: process.cwd(),
    homeDir: '/home/user',
    scope: 'workspace',
    target: 'codex',
    skillProfile: 'full'
  });
  const defaultPlan = await planSkillProjections({
    rootDir: process.cwd(),
    homeDir: '/home/user',
    scope: 'workspace',
    target: 'codex'
  });
  const highAssurancePlan = await planSkillProjections({
    rootDir: process.cwd(),
    homeDir: '/home/user',
    scope: 'workspace',
    target: 'codex',
    skillProfile: 'high-assurance'
  });

  const fullKeys = fullPlan.map(projectionKey).sort();
  const defaultKeys = defaultPlan.map(projectionKey).sort();

  const highAssuranceKeys = highAssurancePlan.map(projectionKey).sort();

  assert.deepEqual(fullKeys, highAssuranceKeys);
  assert.ok(!defaultKeys.some((key) => key.startsWith('superpowers:')));
  assert.ok(defaultKeys.includes('mattpocock-skills:tdd'));
  assert.ok(fullKeys.includes('goal-writer:goal-writer'));
  assert.ok(fullKeys.includes('goal2plan:goal2plan'));
  assert.ok(fullKeys.includes('autonomous-release-closure:autonomous-release-closure'));
  assert.ok(fullKeys.includes('overengineering-review:overengineering-review'));
  assert.ok(fullKeys.includes('simplification-ledger:simplification-ledger'));
  assert.ok(fullKeys.includes('planning-with-files:planning-with-files'));
  assert.ok(!fullKeys.includes('superpowers:using-superpowers'));
  assert.ok(fullKeys.includes('superpowers:writing-plans'));
  assert.ok(!fullKeys.includes('superpowers:goal-writer'));
  assert.ok(!fullKeys.includes('superpowers:overengineering-review'));
});

test('unknown skill profile fails', async () => {
  await assert.rejects(
    planSkillProjections({
      rootDir: process.cwd(),
      homeDir: '/home/user',
      scope: 'workspace',
      target: 'codex',
      skillProfile: 'unknown'
    }),
    /Invalid skills profile: unknown/
  );
});

test('production profiles expose daily Harness governance and keep one coding owner', async () => {
  const plans = Object.fromEntries(await Promise.all(
    ['standard', 'hybrid-candidate', 'high-assurance', 'full'].map(async (skillProfile) => [
      skillProfile,
      await planSkillProjections({
        rootDir: process.cwd(),
        homeDir: '/home/user',
        scope: 'workspace',
        target: 'codex',
        skillProfile
      })
    ])
  ));

  const standardKeys = plans.standard.map(projectionKey).sort();
  for (const skill of ['goal-writer', 'goal2plan', 'overengineering-review', 'simplification-ledger']) {
    assert.ok(standardKeys.includes(`${skill}:${skill}`), skill);
  }

  const hybridKeys = plans['hybrid-candidate'].map(projectionKey).sort();
  assert.ok(hybridKeys.includes('mattpocock-skills:tdd'));
  assert.ok(hybridKeys.includes('mattpocock-skills:diagnosing-bugs'));
  assert.ok(hybridKeys.includes('mattpocock-skills:code-review'));
  assert.ok(hybridKeys.includes('superpowers:writing-plans'));
  assert.ok(hybridKeys.includes('superpowers:verification-before-completion'));
  assert.ok(!hybridKeys.includes('superpowers:test-driven-development'));
  assert.ok(!hybridKeys.includes('superpowers:systematic-debugging'));
  assert.ok(!hybridKeys.includes('superpowers:requesting-code-review'));
  assert.ok(!hybridKeys.includes('superpowers:subagent-driven-development'));

  const highKeys = plans['high-assurance'].map(projectionKey).sort();
  assert.deepEqual(plans.full.map(projectionKey).sort(), highKeys);
  assert.deepEqual(
    highKeys.filter((key) => key !== 'autonomous-release-closure:autonomous-release-closure'),
    hybridKeys
  );
});

test('pilot profiles isolate Matt and Superpowers coding contracts', async () => {
  const matt = await planSkillProjections({
    rootDir: process.cwd(), homeDir: '/home/user', scope: 'workspace', target: 'codex', skillProfile: 'matt-pilot'
  });
  const superpowers = await planSkillProjections({
    rootDir: process.cwd(), homeDir: '/home/user', scope: 'workspace', target: 'codex', skillProfile: 'superpowers-pilot'
  });
  const mattKeys = matt.map(projectionKey).sort();
  const superpowerKeys = superpowers.map(projectionKey).sort();

  assert.ok(!mattKeys.some((key) => key.startsWith('superpowers:')));
  for (const key of [
    'mattpocock-skills:implement',
    'mattpocock-skills:research',
    'mattpocock-skills:prototype',
    'mattpocock-skills:improve-codebase-architecture',
    'mattpocock-skills:grill-with-docs',
    'mattpocock-skills:grilling',
    'mattpocock-skills:writing-great-skills'
  ]) assert.ok(mattKeys.includes(key), key);

  assert.ok(!superpowerKeys.some((key) => key.startsWith('mattpocock-skills:')));
  for (const key of [
    'superpowers:test-driven-development',
    'superpowers:systematic-debugging',
    'superpowers:requesting-code-review',
    'superpowers:subagent-driven-development'
  ]) assert.ok(superpowerKeys.includes(key), key);
});

test('matched-task profile evaluation fixture covers six classes and required metrics', async () => {
  const fixture = JSON.parse(await readFile('tests/fixtures/skill-profile-evaluation/tasks.json', 'utf8'));
  const evaluationDoc = await readFile('docs/skill-profile-evaluation.md', 'utf8');
  assert.equal(fixture.schemaVersion, 1);
  assert.deepEqual(fixture.profiles, ['matt-pilot', 'superpowers-pilot', 'hybrid-candidate']);
  assert.equal(fixture.taskClasses.length, 6);
  assert.deepEqual(new Set(fixture.taskClasses.map((entry) => entry.id)).size, 6);
  for (const metric of [
    'success', 'evidenceCompleteness', 'reworkOrEscalation', 'tokens', 'latency',
    'trustworthyCost', 'subagentCount', 'humanConfirmationCount', 'scopeDrift',
    'falseSkillInvocation', 'extraAuthorityFiles'
  ]) assert.ok(fixture.metrics.includes(metric), metric);
  assert.equal(fixture.decisionComparison.baseline, 'standard');
  assert.equal(fixture.decisionComparison.comparison, 'hybrid-candidate');
  assert.equal(fixture.decisionComparison.assuranceCondition, 'risk-triggered-assurance');
  assert.equal(fixture.decisionComparison.baseReference, 'same-base-sha');
  assert.deepEqual(fixture.decisionComparison.metrics, fixture.metrics);
  assert.ok(fixture.decisionComparison.requiredRealTaskClasses.includes('cross-session-tracked-task'));
  assert.ok(fixture.decisionComparison.requiredRealTaskClasses.includes('high-risk-migration-release'));
  for (const taskClass of fixture.decisionComparison.requiredRealTaskClasses) {
    assert.ok(fixture.taskClasses.some((entry) => entry.id === taskClass), taskClass);
  }
  assert.equal(fixture.decisionComparison.conditions.noDefaultChange, true);
  assert.equal(fixture.decisionComparison.conditions.productionSelectionRequiresHumanGate, true);
  assert.equal(fixture.decisionComparison.conditions.noLifecycleSkillExpansionWithoutMatchedEvidence, true);
  assert.match(evaluationDoc, /## Decision Comparison/);
  assert.match(evaluationDoc, /`standard` as the baseline versus the retained `hybrid-candidate`/);
  assert.match(evaluationDoc, /risk-triggered assurance/);
  assert.match(evaluationDoc, /not runtime or Host enforcement/);
  assert.match(evaluationDoc, /Production selection requires a separate human gate/);
  assert.ok(evaluationDoc.includes(
    'This gate covers lifecycle-skill expansion, not merely profile selection: no Superpowers lifecycle-skill expansion may be proposed or accepted without the matched decision evidence and a reviewed human gate. It is an auditable review/test contract, not runtime or Host enforcement.'
  ));
  for (const taskClass of fixture.taskClasses) {
    assert.equal(taskClass.baseReference, 'same-base-sha');
    assert.equal(typeof taskClass.assignmentPacket, 'string');
    assert.ok(taskClass.expectedEvidence.length > 0);
    assert.ok(taskClass.acceptanceRubric.length > 0);
  }
  assert.ok(fixture.taskClasses.some((entry) => entry.id === 'cross-session-tracked-task'));
  assert.equal(fixture.officeControlLane.profile, 'office');
});

test('profile dependency closure covers Matt explicit workflows and Superpowers SDD', async () => {
  const profiles = JSON.parse(await readFile('harness/core/skills/profiles.json', 'utf8')).profiles;
  const matt = new Set(profiles['matt-pilot']);
  for (const dependency of [
    'mattpocock-skills:engineering/codebase-design',
    'mattpocock-skills:engineering/domain-modeling',
    'mattpocock-skills:productivity/grilling'
  ]) assert.ok(matt.has(dependency), dependency);

  const superpowers = new Set(profiles['superpowers-pilot']);
  for (const dependency of [
    'superpowers:requesting-code-review',
    'superpowers:finishing-a-development-branch'
  ]) assert.ok(superpowers.has(dependency), dependency);
  assert.ok(!profiles['hybrid-candidate'].includes('superpowers:subagent-driven-development'));

  const goal2planFiles = await Promise.all([
    'harness/core/skills/goal2plan/SKILL.md',
    'harness/core/skills/goal2plan/template.md',
    'harness/core/skills/goal2plan/examples.md'
  ].map((filePath) => readFile(filePath, 'utf8')));
  assert.doesNotMatch(goal2planFiles.join('\n'), /`brainstorming`|use brainstorming/i);
});
