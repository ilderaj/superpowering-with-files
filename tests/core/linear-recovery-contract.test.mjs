import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const chief = read('harness/trio/governance/chiefops/SKILL.md');
const skill = read('harness/core/skills/linear-work-control/SKILL.md');
const reference = read('harness/core/skills/linear-work-control/reference.md');
const section = (text, heading) => {
  const start = text.indexOf(heading);
  assert.notEqual(start, -1, `Missing contract branch: ${heading}`);
  return text.slice(start + heading.length).split(/\n## /)[0];
};

test('authorized nightly successors use readiness evidence without repeat permission', () => {
  assert.match(chief, /existing authorization includes unattended local execution/i);
  assert.match(chief, /verified prerequisites and readiness/i);
  assert.match(chief, /without repeat permission/i);
  assert.match(chief, /otherwise.*human.*confirm/i);
  assert.doesNotMatch(chief, /Write the label only after that answer/);
});

test('recovery separates absent teams, capacity evidence, and local implementation', () => {
  const recovery = section(reference, '## 4a. Recovery readiness');
  assert.match(recovery, /Team absence.*not.*capacity exceeded/i);
  assert.match(recovery, /unknown.*sources.*acceptance.*permits/is);
  assert.match(recovery, /fixture.*local implementation.*actual onboarding/is);
  assert.match(recovery, /prerequisites.*acceptance.*non-overlapping/is);
  assert.match(recovery, /rollout.*costs.*login.*human/is);
  assert.match(skill, /recovery readiness.*reference\.md#4a-recovery-readiness/i);
});

test('resolved prerequisites can close blockers without manufacturing human approval', () => {
  assert.match(reference, /verified prerequisite evidence may resolve a dependency blocker/i);
  assert.match(reference, /human decision blocker still requires.*human decision/i);
  assert.doesNotMatch(reference, /only a recorded human decision does/);
});

test('Team UI exception is conditional, guarded, and read back before binding', () => {
  const bootstrap = section(reference, '## 5a. Team bootstrap UI fallback');
  for (const requirement of [
    /only.*Team bootstrap.*MCP lacks.*creat/is,
    /existing authorization.*same.*scope/is,
    /guard.*workspace.*name.*key.*duplicate.*permissions.*plan/is,
    /create only.*approved scope/is,
    /MCP.*readback.*IDs.*before.*binding/is,
    /login.*ambiguity.*human/is,
    /never extract.*tokens/is,
    /normal.*writes.*MCP/is,
  ]) assert.match(bootstrap, requirement);
  assert.match(skill, /Team bootstrap.*reference\.md#5a-team-bootstrap-ui-fallback/i);
  assert.doesNotMatch(skill, /every write goes through the authenticated Linear MCP/);
  assert.doesNotMatch(reference, /Linear MCP\s+the only write path/);
});
