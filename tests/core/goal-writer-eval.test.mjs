import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateGoalWriterFixtures,
  evaluatePrompt
} from '../../harness/core/skills/goal-writer/lib/evaluate-goal-writer.mjs';

test('goal-writer fixtures pass hard checks and stay within the prompt budget', async () => {
  const report = await evaluateGoalWriterFixtures();
  const quickTask = report.results.find((result) => result.id === 'quick-task');
  const acceptanceProofTask = report.results.find((result) => result.id === 'acceptance-proof-task');
  const moderateTrackedTask = report.results.find((result) => result.id === 'moderate-tracked-task');

  assert.equal(report.summary.total, 8);
  assert.equal(report.summary.passed, 8);
  assert.equal(report.summary.failed, 0);
  assert.ok(report.summary.maxLength <= 4000);
  assert.ok(report.summary.minScore >= 9);
  assert.ok(quickTask, 'quick-task fixture should exist');
  assert.ok(acceptanceProofTask, 'acceptance-proof-task fixture should exist');
  assert.ok(moderateTrackedTask, 'moderate-tracked-task fixture should exist');
  assert.ok(quickTask.length <= 1200, 'quick-task fixture should use the compact prompt budget');
  assert.ok(acceptanceProofTask.length <= 1700, 'acceptance-proof-task should stay within the proof-first budget');
  assert.ok(moderateTrackedTask.length <= 1700, 'moderate-tracked-task should stay within the tracked budget');

  for (const result of report.results) {
    assert.equal(result.pass, true, `${result.id}: ${result.notes.join('; ')}`);
    assert.equal(result.usesFencedBlock, true, result.id);
    assert.equal(result.hasNumericTarget, true, result.id);
    assert.ok(result.length <= 4000, result.id);
    assert.deepEqual(result.missingSections, [], result.id);
  }
});

test('evaluatePrompt accepts plain-text validation commands', () => {
  const fixture = {
    id: 'plain-text-validation',
    title: 'plain text validation',
    category: 'tracked',
    expectedRoute: 'tracked',
    maxLength: 4000
  };
  const prompt = `\`\`\`text
/goal Objective: Keep the validation contract strict without rejecting plain-text commands.
Context: Fix the goal-writer evaluator only.
Constraints: Keep the diff small.
Work Discipline: Re-read planning/active/<task-id>/ before changes, keep quick, tracked, and deep-reasoning routing explicit, and only use docs/superpowers/plans/<date>-<task-id>.md with a reviewer for deep-reasoning rounds so goal drift stays contained.
Validation: Run node --test tests/core/goal-writer-eval.test.mjs and inspect planning/active/<task-id>/task_plan.md.
Done Criteria: At least 1 plain-text validation command passes the hard check.
Stop/Escalate: Stop if the evaluator starts accepting prose without a command.
Next Step: Patch the evaluator first.
\`\`\``;

  const result = evaluatePrompt(fixture, prompt);
  assert.equal(result.pass, true, result.notes.join('; '));
});

test('evaluatePrompt still rejects validation prose without a command or evidence surface', () => {
  const fixture = {
    id: 'validation-prose-only',
    title: 'validation prose only',
    category: 'tracked',
    expectedRoute: 'tracked',
    maxLength: 4000
  };
  const prompt = `\`\`\`text
/goal Objective: Keep validation meaningful.
Context: Fix the evaluator only.
Constraints: Keep the diff small.
Work Discipline: Re-read planning/active/<task-id>/ before changes, keep quick, tracked, and deep-reasoning routing explicit, and only use docs/superpowers/plans/<date>-<task-id>.md with a reviewer for deep-reasoning rounds so goal drift stays contained.
Validation: Confirm the result looks reasonable to the reviewer.
Done Criteria: At least 1 validation rule remains strict.
Stop/Escalate: Stop if the proof gate weakens.
Next Step: Patch the evaluator first.
\`\`\``;

  const result = evaluatePrompt(fixture, prompt);
  assert.equal(result.pass, false);
  assert.match(
    result.notes.join('\n'),
    /Validation must name at least one concrete command or authoritative evidence surface/
  );
});

test('evaluatePrompt accepts a plain-text bare filename as an evidence surface', () => {
  const fixture = {
    id: 'validation-bare-filename',
    title: 'validation bare filename',
    category: 'tracked',
    expectedRoute: 'tracked',
    maxLength: 4000
  };
  const prompt = `\`\`\`text
/goal Objective: Keep evidence-surface validation compatible with plain filenames.
Context: Fix the goal-writer evaluator only.
Constraints: Keep the diff small.
Work Discipline: Re-read planning/active/<task-id>/ before changes, keep quick, tracked, and deep-reasoning routing explicit, and only use docs/superpowers/plans/<date>-<task-id>.md with a reviewer for deep-reasoning rounds so goal drift stays contained.
Validation: Inspect README.md before landing the change.
Done Criteria: At least 1 bare filename evidence surface passes the hard check.
Stop/Escalate: Stop if bare filenames regress.
Next Step: Patch the evaluator first.
\`\`\``;

  const result = evaluatePrompt(fixture, prompt);
  assert.equal(result.pass, true, result.notes.join('; '));
});
