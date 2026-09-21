import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const doc = await readFile(new URL('../../harness/core/skills/linear-work-control/automation-workflows.md', import.meta.url), 'utf8');
const [night, morning] = [...doc.matchAll(/```text\n([\s\S]*?)```/g)].map(m => m[1]);
test('night queue revisits after success with one global attempt/time budget', () => {
  assert.doesNotMatch(night, /at most one ready task/i);
  assert.match(night, /3 attempted slices/);
  assert.match(night, /45 minutes/);
  assert.match(night, /never reset.*startedAt/i);
  assert.match(night, /night-queue\.mjs/);
  assert.match(night, /after every outcome/i);
});
test('night recovery resolves each issue and publishes running before work', () => {
  assert.match(night, /bind-thread/);
  assert.match(night, /team.*not.*teamId/);
  assert.match(night, /agent-running.*before.*execution/i);
  assert.match(night, /remaining.*skipped/i);
  assert.match(night, /existing authorization/i);
  assert.match(night, /every mapped successor/i);
  assert.match(night, /API-returned identifier and UUID/i);
  assert.match(night, /binding need not store a title/i);
  assert.match(night, /cached title differs.*refresh.*continue/i);
  assert.match(night, /subIssues.*subIssueIds/i);
  assert.match(night, /agree uniquely/i);
  assert.match(night, /before and after every result/i);
  assert.match(night, /existing progress\.md/i);
  assert.match(night, /Do not create a new state store/i);
});
test('morning reports queue coverage without broadening writes', () => {
  assert.match(morning, /agent-ready.*nightly/);
  assert.match(morning, /remaining/);
  assert.match(morning, /no bulk status changes/);
  assert.match(morning, /every binding/i);
  assert.match(morning, /API identifier \+ UUID/i);
  assert.match(morning, /refresh stale cached titles/i);
  assert.match(morning, /parent In Progress.*actually running/i);
  assert.match(morning, /stale label/i);
  assert.match(morning, /reason.*next action.*owner/i);
});

test('recovery discovers successors, reconciles budget stops and compares scopes', () => {
  assert.match(night, /mapped successors.*regardless of queue labels/i);
  assert.match(night, /each.*scope.*same.*budget/i);
  assert.match(night, /compare.*per-scope.*priority/i);
  assert.match(night, /empty scope.*not.*empty project/i);
  assert.match(night, /safe budget stop.*Todo.*remove agent-running/i);
  assert.match(night, /goalIssue.id/);
  assert.match(night, /promotion outcomes/i);
  assert.match(night, /ownership is unknown.*skip the conflicting write/i);
});

// Entry reconciliation is necessary when daytime acceptance emptied all queue labels.
test('night entry promotes mapped successors even when the labeled queue is empty', () => {
  const source = night;
  assert.match(source, /Before the first selection.*even when the labeled queue is empty/);
  assert.match(source, /pass that discovered file explicitly via --binding/);
  assert.match(source, /Partial progress never permits Done/);
});

test('night and morning preserve run-bound model evidence and provider unknowns', () => {
  assert.match(night, /configured model.*effort/i);
  assert.match(night, /Host-reported route.*effort/i);
  assert.match(night, /provider actual identity/i);
  assert.match(night, /evidence source.*time/i);
  assert.match(night, /trusted Host evidence.*current run/i);
  assert.match(night, /self-report.*unknown/i);
  assert.match(night, /route.*mismatch.*stop.*affected/i);
  assert.match(night, /actual passed configuration/i);
  assert.match(night, /finishedAt.*overrun/i);
  assert.match(morning, /configured model.*Host-reported route.*provider actual identity/is);
  assert.match(morning, /verification.*matched.*unknown.*mismatch/is);
  assert.match(morning, /heartbeat.*active.*paused.*unresolved/is);
  assert.match(morning, /provider.*unknown/i);
});
