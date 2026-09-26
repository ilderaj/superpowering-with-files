import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const doc = await readFile(new URL('../../harness/core/skills/linear-work-control/automation-workflows.md', import.meta.url), 'utf8');
const [night, fallback, morning] = [...doc.matchAll(/```text\n([\s\S]*?)```/g)].map(m => m[1]);

test('night carrier ladder documents combo failover plus an independent fallback', () => {
  assert.match(doc, /## Carrier model ladder/);
  assert.match(doc, /combo\/DeepSeekCombo/);
  assert.match(doc, /strategy: failover/);
  assert.match(doc, /command-code\/gpt-5\.6-luna/);
  assert.match(doc, /main\/gpt-5\.6-luna/);
  assert.match(doc, /swf-night-executor-fallback/);
  assert.match(doc, /Configured failover is not proven failover\./);
});

test('fallback carrier acts only when the primary pass did not complete', () => {
  assert.ok(fallback, 'the fallback prompt block must exist between the night and morning blocks');
  assert.match(fallback, /carrier=fallback/);
  assert.match(fallback, /still running, stop without any write/is);
  assert.match(fallback, /never claim that the primary run succeeded/i);
  assert.match(fallback, /3-attempt \/ 45-minute/);
  assert.match(fallback, /window has closed with no terminal outcome/i);
  assert.match(fallback, /entry checkpoint alone is not completion/i);
  assert.match(fallback, /DONE ALLOWED/);
  assert.match(fallback, /Asia\/Shanghai/);
  assert.match(fallback, /no change to the primary night, morning, or any other automation/);
});

test('installed state names each carrier, its schedule and its model', () => {
  assert.match(doc, /\| Night Executor \| `swf-night-executor` \| cron \| ACTIVE \| `FREQ=DAILY;BYHOUR=1;BYMINUTE=30` \| `combo\/DeepSeekCombo` \|/);
  assert.match(doc, /\| Night Executor Fallback \| `swf-night-executor-fallback` \| cron \| ACTIVE \| `FREQ=DAILY;BYHOUR=3;BYMINUTE=0` \| `command-code\/gpt-5\.6-luna` \|/);
  assert.match(doc, /\| Morning Handoff \| `swf-morning-handoff` \| cron \| ACTIVE \| `FREQ=DAILY;BYHOUR=7;BYMINUTE=30` \| `combo\/DeepSeekCombo` \|/);
  assert.match(doc, /zip\(\('swf-night-executor', 'swf-night-executor-fallback', 'swf-morning-handoff'\), blocks\)/);
  assert.match(doc, /The three `text` blocks above are the source prompts/);
});

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

test('the ladder requires carrier independence in provider and accounting domain', () => {
  assert.match(doc, /Carrier independence has two dimensions/);
  assert.match(doc, /upstream provider path and the accounting domain/);
  assert.match(doc, /shares command-code with one L1 target/);
  assert.match(doc, /shared local proxy/);
  assert.match(doc, /usage_limit_exceeded/);
  assert.match(doc, /2026-09-22/);
  assert.match(doc, /carrier gap, not a night gap/);
});

test('morning reports the fallback carrier liveness separately from a night gap', () => {
  assert.match(morning, /swf-night-executor-fallback/);
  assert.match(morning, /failed-before-first-model-call/);
  assert.match(morning, /not-triggered/);
  assert.match(morning, /usage_limit_exceeded/);
  assert.match(morning, /carrier gap, not a night gap/);
  assert.match(morning, /unreadable or incomplete evidence is unknown/);
  assert.match(morning, /failed-after-start/);
  assert.match(morning, /completed-noop/);
  assert.match(morning, /Never report a successful no-op as a coverage gap/);
  assert.match(morning, /Never present a missing fallback record as the primary pass having failed/);
});
