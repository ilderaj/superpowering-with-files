import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  applyMattArchitectureHarnessPatch,
  applyMattCodebaseDesignHarnessPatch,
  applyMattCodeReviewHarnessPatch,
  applyMattDebugHarnessPatch,
  applyMattDomainModelingHarnessPatch,
  applyMattGrillingHarnessPatch,
  applyMattGrillWithDocsHarnessPatch,
  applyMattImplementHarnessPatch,
  applyMattPrototypeHarnessPatch,
  applyMattResearchHarnessPatch,
  applyMattWritingSkillsHarnessPatch,
  applyMattTddHarnessPatch
} from '../../harness/installer/lib/matt-coding-contracts-patch.mjs';
import { planSkillProjections } from '../../harness/installer/lib/skill-projection.mjs';

async function withSkill(relativePath, callback) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'matt-skill-patch-'));
  const target = path.join(root, path.basename(relativePath));
  try {
    await cp(path.join(process.cwd(), 'harness/upstream/mattpocock-skills/skills', relativePath), target, {
      recursive: true
    });
    await callback(target);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('Matt TDD patch removes the mandatory per-seam human gate', async () => {
  await withSkill('engineering/tdd', async (target) => {
    await applyMattTddHarnessPatch(target);
    const text = await readFile(path.join(target, 'SKILL.md'), 'utf8');
    assert.match(text, /Harness Matt TDD authority patch/);
    assert.match(text, /approved spec and repository contract/);
    assert.doesNotMatch(text, /No test is written at an unconfirmed seam/);
  });
});

test('Matt code review patch removes tracker setup and mandatory two-agent fan-out', async () => {
  await withSkill('engineering/code-review', async (target) => {
    await applyMattCodeReviewHarnessPatch(target);
    const text = await readFile(path.join(target, 'SKILL.md'), 'utf8');
    assert.match(text, /Harness Matt code-review authority patch/);
    assert.match(text, /planning\/active\/<task-id>/);
    assert.match(text, /prohibited.*worker_discretion.*encouraged/s);
    assert.doesNotMatch(text, /run `\/setup-matt-pocock-skills`/);
    assert.doesNotMatch(text, /Spawn both sub-agents in parallel/);
  });
});

test('Matt domain modeling patch keeps new artifacts behind project authority', async () => {
  await withSkill('engineering/domain-modeling', async (target) => {
    await applyMattDomainModelingHarnessPatch(target);
    const text = await readFile(path.join(target, 'SKILL.md'), 'utf8');
    assert.match(text, /Harness Matt domain-modeling authority patch/);
    assert.match(text, /authoritative trio/);
    assert.doesNotMatch(text, /If no `CONTEXT\.md` exists, create one when the first term is resolved/);
  });
});

const explicitPatchCases = [
  ['engineering/diagnosing-bugs', applyMattDebugHarnessPatch, /Harness Matt debugging authority patch/],
  ['engineering/codebase-design', applyMattCodebaseDesignHarnessPatch, /Harness Matt codebase-design authority patch/],
  ['engineering/implement', applyMattImplementHarnessPatch, /Harness Matt implement authority patch/],
  ['engineering/research', applyMattResearchHarnessPatch, /Harness Matt research authority patch/],
  ['engineering/prototype', applyMattPrototypeHarnessPatch, /Harness Matt prototype authority patch/],
  ['engineering/improve-codebase-architecture', applyMattArchitectureHarnessPatch, /Harness Matt architecture workflow authority patch/],
  ['engineering/grill-with-docs', applyMattGrillWithDocsHarnessPatch, /Harness Matt grill-with-docs authority patch/],
  ['productivity/grilling', applyMattGrillingHarnessPatch, /Harness Matt grilling authority patch/],
  ['productivity/writing-great-skills', applyMattWritingSkillsHarnessPatch, /Harness Matt writing-skills authority patch/]
];

for (const [relativePath, applyPatch, marker] of explicitPatchCases) {
  test(`Matt ${relativePath} patch is fail-closed and carries Harness authority`, async () => {
    await withSkill(relativePath, async (target) => {
      await applyPatch(target);
      const text = await readFile(path.join(target, 'SKILL.md'), 'utf8');
      assert.match(text, marker);
      await assert.doesNotReject(() => applyPatch(target));
    });
    const empty = await mkdtemp(path.join(os.tmpdir(), 'matt-skill-bad-anchor-'));
    try {
      await cp(path.join(process.cwd(), 'harness/upstream/mattpocock-skills/skills', relativePath), empty, {
        recursive: true
      });
      await import('node:fs/promises').then(({ writeFile }) => writeFile(path.join(empty, 'SKILL.md'), '---\nname: drifted\n---\n', 'utf8'));
      await assert.rejects(() => applyPatch(empty), /Unable to apply/);
    } finally {
      await rm(empty, { recursive: true, force: true });
    }
  });
}

test('standard projections register the core Matt authority patches', async () => {
  const plan = await planSkillProjections({
    rootDir: process.cwd(),
    homeDir: '/home/user',
    scope: 'workspace',
    target: 'codex',
    skillProfile: 'standard'
  });
  const patchTypes = Object.fromEntries(
    plan
      .filter((entry) => entry.parentSkillName === 'mattpocock-skills')
      .map((entry) => [entry.skillName, entry.patches.map((patch) => patch.type)])
  );
  assert.deepEqual(patchTypes.tdd, ['matt-tdd-harness-authority']);
  assert.deepEqual(patchTypes['code-review'], ['matt-code-review-harness-authority']);
  assert.deepEqual(patchTypes['domain-modeling'], ['matt-domain-modeling-harness-authority']);
  assert.deepEqual(patchTypes['diagnosing-bugs'], ['matt-debug-harness-authority']);
  assert.deepEqual(patchTypes['codebase-design'], ['matt-codebase-design-harness-authority']);
});

test('Matt pilot registers all explicit workflow patches', async () => {
  const plan = await planSkillProjections({
    rootDir: process.cwd(), homeDir: '/home/user', scope: 'workspace', target: 'codex', skillProfile: 'matt-pilot'
  });
  const patchTypes = Object.fromEntries(plan.filter((entry) => entry.parentSkillName === 'mattpocock-skills')
    .map((entry) => [entry.skillName, entry.patches.map((patch) => patch.type)]));
  for (const name of ['implement', 'research', 'prototype', 'improve-codebase-architecture', 'grill-with-docs', 'grilling', 'writing-great-skills']) {
    assert.equal(patchTypes[name]?.length, 1, `${name} must have one Harness patch`);
  }
});
