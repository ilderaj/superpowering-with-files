import { test } from 'node:test';
import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import path from 'node:path';

test('autonomous-release-closure bundle is physically retired', async () => {
  const retiredPaths = [
    'harness/core/skills/autonomous-release-closure/SKILL.md',
    'harness/core/skills/autonomous-release-closure/examples.md',
    'harness/core/skills/autonomous-release-closure/fixtures/disjoint-pr-ambiguity.json',
    'harness/core/skills/autonomous-release-closure/fixtures/finishing-handoff.json',
    'harness/core/skills/autonomous-release-closure/fixtures/loop-budget-fallback.json',
    'harness/core/skills/autonomous-release-closure/fixtures/pr-closure.json',
    'harness/core/skills/autonomous-release-closure/fixtures/stacked-promotion-chain.json',
    'harness/core/skills/autonomous-release-closure/lib/evaluate-autonomous-release-closure.mjs',
    'harness/core/skills/autonomous-release-closure/outputs/disjoint-pr-ambiguity.md',
    'harness/core/skills/autonomous-release-closure/outputs/finishing-handoff.md',
    'harness/core/skills/autonomous-release-closure/outputs/loop-budget-fallback.md',
    'harness/core/skills/autonomous-release-closure/outputs/pr-closure.md',
    'harness/core/skills/autonomous-release-closure/outputs/stacked-promotion-chain.md',
    'harness/core/skills/autonomous-release-closure/scripts/evaluate-autonomous-release-closure.mjs',
    'harness/core/skills/autonomous-release-closure/template.md'
  ];

  for (const relativePath of retiredPaths) {
    await assert.rejects(
      access(path.join(process.cwd(), relativePath)),
      { code: 'ENOENT' },
      relativePath
    );
  }
});
