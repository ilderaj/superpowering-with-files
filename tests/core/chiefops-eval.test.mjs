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

test('chiefops guidance treats historical session ids as explicit routing cues', async () => {
  const skill = await readFile('harness/core/skills/chiefops/SKILL.md', 'utf8');
  const docs = await readFile('docs/chiefops.md', 'utf8');
  const combined = `${skill}\n${docs}`;

  assert.match(combined, /Historical Session Routing/i);
  assert.match(combined, /threadId/i);
  assert.match(combined, /sessionId/i);
  assert.match(combined, /continue_worker/i);
  assert.match(combined, /respawn_worker/i);
  assert.match(combined, /handoff_worker/i);
  assert.match(combined, /chief_direct/i);
  assert.match(
    combined,
    /historical `threadId` or `sessionId` values? default to explicit worker\/session routing/i
  );
  assert.match(
    combined,
    /Chief-direct remains allowed only with an explicit reason/i
  );
  assert.match(combined, /stale\/unsafe rationale/i);
  assert.match(combined, /bounded slice/i);
  assert.match(combined, /proof target/i);
  assert.match(combined, /evidence sink/i);
  assert.match(combined, /return-to-Chief gate/i);
  assert.match(
    combined,
    /Assignment Packet[\s\S]*evidenceSink[\s\S]*returnToChiefInstruction/i
  );
});

test('chiefops guidance preserves explicit visible Codex session worker routing', async () => {
  const skill = await readFile('harness/core/skills/chiefops/SKILL.md', 'utf8');
  const docs = await readFile('docs/chiefops.md', 'utf8');
  const combined = `${skill}\n${docs}`;

  assert.match(combined, /Visible Codex Session Worker Requests/i);
  assert.match(
    combined,
    /explicitly asks for a visible Codex session worker[\s\S]*requested execution route/i
  );
  assert.match(combined, /Codex thread\/session tools/i);
  assert.match(
    combined,
    /subagent, hidden\/internal worker slice, or Chief-direct implementation is a downgrade/i
  );
  assert.match(
    combined,
    /Subagent\/internal worker wording alone must not be presented as satisfying an explicit visible Codex session worker request/i
  );
  assert.match(combined, /the downgrade reason/i);
  assert.match(combined, /the proof target and evidence sink/i);
  assert.match(combined, /the return-to-Chief gate/i);
});
