import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const utc8TimestampPattern = /\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC\+8/;

async function createFixture(name) {
  const root = path.join(process.cwd(), 'tests/installer/.artifacts', name);
  await rm(root, { recursive: true, force: true });
  await mkdir(path.join(root, 'scripts'), { recursive: true });
  await Promise.all([
    cp(path.join(process.cwd(), 'harness'), path.join(root, 'harness'), { recursive: true }),
    cp(path.join(process.cwd(), 'docs'), path.join(root, 'docs'), { recursive: true }),
    cp(path.join(process.cwd(), 'scripts'), path.join(root, 'scripts'), { recursive: true }),
    cp(path.join(process.cwd(), 'package.json'), path.join(root, 'package.json'))
  ]);
  return root;
}

async function removeFixture(root) {
  await rm(root, { recursive: true, force: true });
}

async function harnessCommand(root, ...args) {
  return execFileAsync('node', [path.join(root, 'harness/installer/commands/harness.mjs'), ...args], {
    cwd: root
  });
}

async function writeTask(root, taskId, { taskPlan, findings, progress }) {
  const taskDir = path.join(root, 'planning/active', taskId);
  await mkdir(taskDir, { recursive: true });
  await Promise.all([
    writeFile(path.join(taskDir, 'task_plan.md'), taskPlan),
    writeFile(path.join(taskDir, 'findings.md'), findings),
    writeFile(path.join(taskDir, 'progress.md'), progress)
  ]);
}

function activeTaskFiles(title, status = 'active') {
  return {
    taskPlan: [
      `# ${title}`,
      '',
      '## Current State',
      `Status: ${status}`,
      'Archive Eligible: no',
      'Close Reason:'
    ].join('\n'),
    findings: '# Findings\n',
    progress: '# Progress\n'
  };
}

test('harness --help lists the record command', async () => {
  const root = await createFixture('record-help');
  try {
    const { stdout } = await harnessCommand(root, '--help');
    assert.match(stdout, /record\s+Append a timestamped record block to task_plan, findings, progress, or reconciliation/);
  } finally {
    await removeFixture(root);
  }
});

test('harness record invalid file error lists reconciliation as an accepted file', async () => {
  const root = await createFixture('record-invalid-file');
  try {
    await writeTask(root, 't1', activeTaskFiles('Task One'));

    await assert.rejects(
      harnessCommand(root, 'record', '--file', 'notes'),
      (error) => {
        assert.match(error.stderr, /Expected one of: task_plan, findings, progress, reconciliation/);
        return true;
      }
    );
  } finally {
    await removeFixture(root);
  }
});

test('harness record appends a timestamped progress block for the active task', async () => {
  const root = await createFixture('record-progress');
  try {
    await writeTask(root, 't1', activeTaskFiles('Task One'));

    const { stdout, stderr } = await harnessCommand(
      root,
      'record',
      '--file',
      'progress',
      '--title',
      'Phase 2: Verification'
    );

    assert.equal(stderr, '');
    assert.match(stdout, /planning\/active\/t1\/progress\.md/);

    const progress = await readFile(path.join(root, 'planning/active/t1/progress.md'), 'utf8');
    assert.match(progress, new RegExp(`## Session: ${utc8TimestampPattern.source}`));
    assert.match(progress, /### Phase 2: Verification/);
    assert.match(progress, /- Actions taken:\n  -/);
    assert.match(progress, /- Files created\/modified:\n  -/);
  } finally {
    await removeFixture(root);
  }
});

test('harness record --task appends findings and task_plan records with the shared UTC+8 heading format', async () => {
  const root = await createFixture('record-findings-task-plan');
  try {
    await writeTask(root, 't1', activeTaskFiles('Task One'));
    await writeTask(root, 't2', activeTaskFiles('Task Two'));

    await harnessCommand(root, 'record', '--task', 't2', '--file', 'findings', '--title', 'Discovery');
    await harnessCommand(root, 'record', '--task', 't2', '--file', 'task_plan', '--title', 'Plan Update');

    const findings = await readFile(path.join(root, 'planning/active/t2/findings.md'), 'utf8');
    const taskPlan = await readFile(path.join(root, 'planning/active/t2/task_plan.md'), 'utf8');
    const untouched = await readFile(path.join(root, 'planning/active/t1/findings.md'), 'utf8');

    assert.match(findings, new RegExp(`## Findings Record: ${utc8TimestampPattern.source}`));
    assert.match(findings, /### Discovery/);
    assert.match(taskPlan, new RegExp(`## Plan Record: ${utc8TimestampPattern.source}`));
    assert.match(taskPlan, /### Plan Update/);
    assert.equal(untouched, '# Findings\n');
  } finally {
    await removeFixture(root);
  }
});


test('harness record can create and append a reconciliation record', async () => {
  const root = await createFixture('record-reconciliation');
  try {
    await writeTask(root, 't1', activeTaskFiles('Task One'));

    const { stdout, stderr } = await harnessCommand(
      root,
      'record',
      '--task',
      't1',
      '--file',
      'reconciliation',
      '--title',
      'Archive Readiness'
    );

    assert.equal(stderr, '');
    assert.match(stdout, /planning\/active\/t1\/reconciliation\.md/);

    const reconciliation = await readFile(path.join(root, 'planning/active/t1/reconciliation.md'), 'utf8');
    assert.match(reconciliation, /^# Reconciliation: t1/m);
    assert.match(reconciliation, new RegExp(`## Reconciliation Record: ${utc8TimestampPattern.source}`));
    assert.match(reconciliation, /### Archive Readiness/);
    assert.match(reconciliation, /## Verification Evidence/);
    assert.match(reconciliation, /## Archive Readiness\n- Not ready/);
  } finally {
    await removeFixture(root);
  }
});
