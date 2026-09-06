import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  createHarnessFixture,
  removeHarnessFixture
} from '../helpers/harness-fixture.mjs';

const execFileAsync = promisify(execFile);
const utc8TimestampPattern = /\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC\+8/;

test('init-session.sh writes progress sessions with a UTC+8 timestamp', async () => {
  const root = await createHarnessFixture();
  try {
    await mkdir(path.join(root, 'planning/active'), { recursive: true });

    await execFileAsync('bash', [
      path.join(root, 'harness/upstream/planning-with-files/scripts/init-session.sh'),
      root,
      'timestamp-demo'
    ]);

    const progress = await readFile(
      path.join(root, 'planning/active/timestamp-demo/progress.md'),
      'utf8'
    );
    const taskPlan = await readFile(
      path.join(root, 'planning/active/timestamp-demo/task_plan.md'),
      'utf8'
    );

    assert.match(progress, new RegExp(`^## Session: ${utc8TimestampPattern.source}$`, 'm'));
    assert.doesNotMatch(progress, /\[(?:DATE|TIMESTAMP)\]/);
    assert.match(taskPlan, /^## Current State$/m);
    assert.match(taskPlan, /^Status: active$/m);
    assert.match(taskPlan, /^Archive Eligible: no$/m);
    assert.match(taskPlan, /^Reconcile: open$/m);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('init-session.sh keeps v3 gated mode through the Harness root entrypoint', async () => {
  const root = await createHarnessFixture();
  try {
    await execFileAsync('bash', [
      path.join(root, 'harness/upstream/planning-with-files/scripts/init-session.sh'),
      '--gated',
      'Build Pipeline'
    ], { cwd: root });

    const activePlan = (await readFile(path.join(root, '.planning/.active_plan'), 'utf8')).trim();
    const mode = await readFile(path.join(root, '.planning', activePlan, '.mode'), 'utf8');

    assert.equal(mode.trim(), 'autonomous gate');
  } finally {
    await removeHarnessFixture(root);
  }
});


test('init-session.ps1 formats timestamps with an explicit UTC+8 offset', async () => {
  const script = await readFile(
    path.join(process.cwd(), 'harness/upstream/planning-with-files/scripts/init-session.ps1'),
    'utf8'
  );

  assert.match(script, /planning_record\.py" timestamp/);
});

test('planning_record.py renders canonical progress and findings headings', async () => {
  const scriptPath = path.join(process.cwd(), 'harness/upstream/planning-with-files/scripts/planning_record.py');
  const { stdout: progressHeading } = await execFileAsync('python3', [scriptPath, 'heading', 'progress']);
  const { stdout: findingsHeading } = await execFileAsync('python3', [scriptPath, 'heading', 'findings']);
  const { stdout: taskPlanHeading } = await execFileAsync('python3', [scriptPath, 'heading', 'task_plan']);

  assert.match(progressHeading.trim(), new RegExp(`^## Session: ${utc8TimestampPattern.source}$`));
  assert.match(findingsHeading.trim(), new RegExp(`^## Findings Record: ${utc8TimestampPattern.source}$`));
  assert.match(taskPlanHeading.trim(), new RegExp(`^## Plan Record: ${utc8TimestampPattern.source}$`));
});

test('planning chronology remains available through the overlay reference and templates', async () => {
  const upstream = path.join(process.cwd(), 'harness/upstream/planning-with-files');
  const overlay = path.join(process.cwd(), 'harness/core/upstream-overlays/planning-with-files');
  const skill = await readFile(path.join(overlay, 'SKILL.md'), 'utf8');
  const referenceLink = [...skill.matchAll(/\]\(([^)]+\.md)\)/g)]
    .map((match) => match[1]).find((target) => target === 'reference.md');
  assert.ok(referenceLink, 'the short entry must expose its chronology and recovery reference');
  const [original, reference, originalProgress, overlayProgress] = await Promise.all([
    readFile(path.join(upstream, 'SKILL.md'), 'utf8'),
    readFile(path.join(overlay, referenceLink), 'utf8'),
    readFile(path.join(upstream, 'templates/progress.md'), 'utf8'),
    readFile(path.join(overlay, 'templates/progress.md'), 'utf8'),
  ]);
  for (const document of [original, reference]) {
    const guidance = document.replace(/\s+/g, ' ');
    assert.match(guidance, /YYYY-MM-DD HH:mm:ss UTC\+8/, 'records retain explicit time and offset');
    assert.match(guidance, /(?:get|fetch)[^\n]*time[^\n]*tool/i, 'time comes from tooling');
    assert.match(guidance, /(?:append|keep)[^\n]*chronological/i, 'record ordering is explicit');
    assert.match(guidance, /(?:never|do not)[^\n]*(?:guess|invent)/i, 'timestamps cannot be fabricated');
  }
  for (const template of [originalProgress, overlayProgress]) {
    assert.match(template, /chronological/i);
    assert.match(template, /YYYY-MM-DD HH:mm:ss UTC\+8/);
  }
});
