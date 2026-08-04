import { test } from 'node:test';
import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import path from 'node:path';

test('goal2plan prompt-contract bundle is physically retired', async () => {
  const retiredPaths = [
    'harness/core/skills/goal2plan/SKILL.md',
    'harness/core/skills/goal2plan/examples.md',
    'harness/core/skills/goal2plan/fixtures/fallback-eligible-sparse-high-complexity.json',
    'harness/core/skills/goal2plan/fixtures/sparse-high-complexity.json',
    'harness/core/skills/goal2plan/lib/evaluate-goal2plan.mjs',
    'harness/core/skills/goal2plan/outputs/fallback-eligible-sparse-high-complexity.goal.md',
    'harness/core/skills/goal2plan/outputs/sparse-high-complexity.goal.md',
    'harness/core/skills/goal2plan/rubric.md',
    'harness/core/skills/goal2plan/scripts/evaluate-goal2plan.mjs',
    'harness/core/skills/goal2plan/template.md'
  ];
  const presentRetiredPaths = [];

  for (const relativePath of retiredPaths) {
    try {
      await access(path.join(process.cwd(), relativePath));
      presentRetiredPaths.push(relativePath);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }

  assert.deepEqual(presentRetiredPaths, []);
});
