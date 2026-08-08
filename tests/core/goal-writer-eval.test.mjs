import { test } from 'node:test';
import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import path from 'node:path';

test('goal-writer prompt-contract bundle is physically retired', async () => {
  const retiredPaths = [
    'harness/core/skills/goal-writer/SKILL.md',
    'harness/core/skills/goal-writer/examples.md',
    'harness/core/skills/goal-writer/fixtures/acceptance-proof-task.json',
    'harness/core/skills/goal-writer/fixtures/ambiguous-intent.json',
    'harness/core/skills/goal-writer/fixtures/context-heavy-task.json',
    'harness/core/skills/goal-writer/fixtures/deep-reasoning-task.json',
    'harness/core/skills/goal-writer/fixtures/moderate-tracked-task.json',
    'harness/core/skills/goal-writer/fixtures/quick-task.json',
    'harness/core/skills/goal-writer/fixtures/sparse-intent.json',
    'harness/core/skills/goal-writer/fixtures/tracked-task.json',
    'harness/core/skills/goal-writer/lib/evaluate-goal-writer.mjs',
    'harness/core/skills/goal-writer/outputs/acceptance-proof-task.goal.md',
    'harness/core/skills/goal-writer/outputs/ambiguous-intent.goal.md',
    'harness/core/skills/goal-writer/outputs/context-heavy-task.goal.md',
    'harness/core/skills/goal-writer/outputs/deep-reasoning-task.goal.md',
    'harness/core/skills/goal-writer/outputs/moderate-tracked-task.goal.md',
    'harness/core/skills/goal-writer/outputs/quick-task.goal.md',
    'harness/core/skills/goal-writer/outputs/sparse-intent.goal.md',
    'harness/core/skills/goal-writer/outputs/tracked-task.goal.md',
    'harness/core/skills/goal-writer/rubric.md',
    'harness/core/skills/goal-writer/scripts/evaluate-goal-writer.mjs',
    'harness/core/skills/goal-writer/template.md'
  ];

  for (const relativePath of retiredPaths) {
    await assert.rejects(
      access(path.join(process.cwd(), relativePath)),
      { code: 'ENOENT' },
      relativePath
    );
  }
});
