import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const SUPERPOWERS_TDD_SEAM_PATCH_MARKER = 'Harness Superpowers TDD seam contract patch';
export const SUPERPOWERS_DEBUG_LOOP_PATCH_MARKER = 'Harness Superpowers debugging red-capable loop patch';
export const SUPERPOWERS_REVIEW_AXES_PATCH_MARKER = 'Harness Superpowers code-review axes patch';

function insertBefore(original, marker, anchor, block, skillPath) {
  if (original.includes(marker)) return original;
  if (!anchor.test(original)) {
    throw new Error(`Unable to apply ${marker} to ${skillPath}`);
  }
  return original.replace(anchor, `${block}\n\n$&`);
}

export async function applySuperpowersTddSeamPatch(targetDir) {
  const skillPath = path.join(targetDir, 'SKILL.md');
  const original = await readFile(skillPath, 'utf8');
  const block = [
    `## ${SUPERPOWERS_TDD_SEAM_PATCH_MARKER}`,
    '',
    'Before writing the RED test, identify the highest practical test seam: the public interface, workflow boundary, adapter boundary, CLI surface, or vertical slice most likely to prove the requested behavior.',
    '',
    'Record the chosen seam in the test name, test fixture, or task progress when the task is tracked. If the seam is ambiguous, ask one concise intake question or choose the smallest vertical slice that can fail for the real requirement.',
    '',
    'Prefer behavior at the agreed seam over tests that only prove mocks, internals, or incidental implementation structure.'
  ].join('\n');

  await writeFile(
    skillPath,
    insertBefore(original, SUPERPOWERS_TDD_SEAM_PATCH_MARKER, /^## The Iron Law$/m, block, skillPath),
    'utf8'
  );
}

export async function applySuperpowersDebugLoopPatch(targetDir) {
  const skillPath = path.join(targetDir, 'SKILL.md');
  const original = await readFile(skillPath, 'utf8');
  const block = [
    `## ${SUPERPOWERS_DEBUG_LOOP_PATCH_MARKER}`,
    '',
    'Phase 1 is not complete until there is a tight, deterministic, agent-runnable loop that can go red for the specific bug or failure being investigated.',
    '',
    'The loop can be a focused test command, fixture, replay, one-off script, or minimal reproduction, but it must fail for the real issue before fixes begin. If no red-capable loop can be built, stop and record the blocker instead of guessing.',
    '',
    'When the task is tracked, record the loop command and current red signal in `planning/active/<task-id>/progress.md` before moving to implementation.'
  ].join('\n');

  await writeFile(
    skillPath,
    insertBefore(original, SUPERPOWERS_DEBUG_LOOP_PATCH_MARKER, /^## The Four Phases$/m, block, skillPath),
    'utf8'
  );
}

export async function applySuperpowersReviewAxesPatch(targetDir) {
  const skillPath = path.join(targetDir, 'SKILL.md');
  const original = await readFile(skillPath, 'utf8');
  const block = [
    `## ${SUPERPOWERS_REVIEW_AXES_PATCH_MARKER}`,
    '',
    'Ask reviewers to separate findings into two axes:',
    '',
    '- Standards: code quality, architecture fit, maintainability, security, accessibility, tests, and repo conventions.',
    '- Spec: whether the diff implements the stated requirement, proof target, acceptance criteria, and declared non-goals.',
    '',
    'A review is not clean if either axis has an unresolved Critical or Important issue. Do not let strong Standards results hide a Spec miss, or a correct Spec hide unsafe implementation quality.',
    '',
    'For tracked work, send the reviewer the relevant `planning/active/<task-id>/` summary, companion plan path when present, proof target, and exact base/head SHAs.'
  ].join('\n');

  await writeFile(
    skillPath,
    insertBefore(original, SUPERPOWERS_REVIEW_AXES_PATCH_MARKER, /^## When to Request Review$/m, block, skillPath),
    'utf8'
  );
}
