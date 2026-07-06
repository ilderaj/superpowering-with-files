import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('chiefops skill preserves authority, receipt, and bounded-governance guardrails', async () => {
  const skill = await readFile('harness/core/skills/chiefops/SKILL.md', 'utf8');
  const template = await readFile('harness/core/skills/chiefops/template.md', 'utf8');
  const examples = await readFile('harness/core/skills/chiefops/examples.md', 'utf8');
  const rubric = await readFile('harness/core/skills/chiefops/rubric.md', 'utf8');

  assert.match(skill, /^---[\s\S]*^name:\s*chiefops/m);
  assert.match(skill, /planning\/active\/<task-id>\//);
  assert.match(skill, /\.harness\/execution\/receipts\/<taskId>\/\*\.json/);
  assert.match(skill, /does not create durable state, replace task memory, or act as a runner/i);
  assert.match(skill, /Common Mistakes/);

  assert.match(template, /ChiefOps Readout/);
  assert.match(template, /Forbidden moves:/);
  assert.match(template, /no second durable memory/);

  assert.match(examples, /Example 1: Runtime\/MCP execution slice/);
  assert.match(examples, /Example 2: Receipt-aware blocker triage/);

  assert.match(rubric, /only durable task memory/);
  assert.match(rubric, /one bounded next slice/);
  assert.doesNotMatch(`${skill}\n${template}\n${examples}\n${rubric}`, /TBD|TODO|implement later/i);
});
