import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateGoalWriterFixtures,
  evaluatePrompt
} from '../../harness/core/skills/goal-writer/lib/evaluate-goal-writer.mjs';

function buildPrompt({ objective, context, workDiscipline }) {
  return `\`\`\`text
/goal Objective: ${objective}
Context: ${context}
Constraints: Keep the change within the approved Goal Writer surface.
Work Discipline: ${workDiscipline}
Validation: Run node --test tests/core/goal-writer-eval.test.mjs and inspect planning/active/<task-id>/progress.md.
Done Criteria: At least 1 evaluator rule is proven by the focused test.
Stop/Escalate: Stop if the evaluator needs a new prompt schema or broader marker set.
Next Step: Run the focused evaluator test.
\`\`\``;
}

const standardWorkDiscipline =
  'Restore planning/active/<task-id>/ before each round, keep quick, tracked, and deep-reasoning routing explicit, and use docs/superpowers/plans/<date>-<task-id>.md with a reviewer for deep-reasoning rounds so goal drift stays contained.';

const iterativeContract =
  'Iteration Contract: Each pass re-reads fresh evidence/feedback/state and uses it to select the next bounded action; if it cannot change that choice, the task is reclassified as a one-shot or staged workflow.';

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

test('evaluatePrompt rejects iterative intent without a fresh-feedback contract', () => {
  const fixture = {
    id: 'iterative-without-contract',
    title: 'iterative prompt without contract',
    category: 'tracked',
    expectedRoute: 'tracked',
    maxLength: 4000
  };
  const prompt = buildPrompt({
    objective: 'Repeat documentation cleanup passes until the work is complete.',
    context: 'The tracked work has ordinary validation and a finite stop boundary.',
    workDiscipline: standardWorkDiscipline
  });

  const result = evaluatePrompt(fixture, prompt);
  assert.equal(result.pass, false);
  assert.match(result.notes.join('\n'), /Iteration Contract/);
});

test('evaluatePrompt accepts an iterative prompt with a causal iteration contract', () => {
  const fixture = {
    id: 'iterative-with-contract',
    title: 'iterative prompt with contract',
    category: 'tracked',
    expectedRoute: 'tracked',
    maxLength: 4000
  };
  const prompt = buildPrompt({
    objective: 'Repeat bounded passes until convergence without changing the root goal.',
    context: 'The tracked work has ordinary validation and a finite stop boundary.',
    workDiscipline: `${standardWorkDiscipline}\n${iterativeContract}`
  });

  const result = evaluatePrompt(fixture, prompt);
  assert.equal(result.pass, true, result.notes.join('; '));
});

test('evaluatePrompt rejects iterative keyword soup without a causal relationship', () => {
  const fixture = {
    id: 'iterative-keyword-soup',
    title: 'iterative keyword soup',
    category: 'tracked',
    expectedRoute: 'tracked',
    maxLength: 4000
  };
  const prompt = buildPrompt({
    objective: 'Repeat bounded passes until convergence without changing the root goal.',
    context: 'Fresh evidence, next bounded action, and one-shot/staged workflow are listed as review terms.',
    workDiscipline: `${standardWorkDiscipline}\nIteration Contract: Fresh evidence; next bounded action; one-shot/staged workflow.`
  });

  const result = evaluatePrompt(fixture, prompt);
  assert.equal(result.pass, false);
  assert.match(result.notes.join('\n'), /Iteration Contract/);
});

test('evaluatePrompt leaves ordinary planning and validation loops unchanged', () => {
  const fixture = {
    id: 'ordinary-validation-loop',
    title: 'ordinary validation loop',
    category: 'tracked',
    expectedRoute: 'tracked',
    maxLength: 4000
  };
  const prompt = buildPrompt({
    objective: 'Validate one tracked change against the repository contract.',
    context: 'The planning loop is part of the ordinary tracked workflow.',
    workDiscipline: `${standardWorkDiscipline} Record each validation loop in progress.md.`
  });

  const result = evaluatePrompt(fixture, prompt);
  assert.equal(result.pass, true, result.notes.join('; '));
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
