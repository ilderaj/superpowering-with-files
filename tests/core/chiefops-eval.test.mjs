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
  assert.match(skill, /route intake or plan deficiencies to `plan` \/ `goal2plan`/i);
  assert.match(skill, /route release-closure work to `autonomous-release-closure`/i);
  assert.match(skill, /route proof and closure work to `verify`, `reconcile`, `finish`, or `release`/i);
  assert.match(skill, /Assignment Packet/i);
  assert.match(skill, /keep the packet derived\/ephemeral by default/i);
  assert.match(skill, /do not persist assignment intent in execution receipts before work has actually been attempted or completed/i);
  assert.match(skill, /Common Mistakes/);

  assert.match(template, /ChiefOps Readout/);
  assert.match(template, /Chief Prompt Contract:/);
  assert.match(template, /Assignment Packet:/);
  assert.match(template, /Worker Prompt Contract:/);
  assert.match(template, /Forbidden moves:/);
  assert.match(template, /no second durable memory/);
  assert.match(template, /Write an execution receipt only if work was actually attempted and reached an outcome/);

  assert.match(examples, /Example 1: Chief-routed runtime\/MCP execution slice/);
  assert.match(examples, /Example 2: Receipt-aware blocker triage/);
  assert.match(examples, /Return after this runtime\/MCP slice/);
  assert.match(examples, /If no work is attempted, do not emit a receipt/);

  assert.match(rubric, /only durable task memory/);
  assert.match(rubric, /one bounded next slice/);
  assert.match(rubric, /Routes plan or intake deficiencies to `plan` \/ `goal2plan`/);
  assert.match(rubric, /Keeps Assignment Packet state derived\/ephemeral by default/);
  assert.match(rubric, /Keeps assignment intent in planning\/progress/);
  assert.doesNotMatch(`${skill}\n${template}\n${examples}\n${rubric}`, /TBD|TODO|implement later/i);
});
