import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

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
  const maybeOptions = args.at(-1);
  const options =
    maybeOptions && typeof maybeOptions === 'object' && !Array.isArray(maybeOptions) ? args.pop() : {};

  return execFileAsync('node', [path.join(root, 'harness/installer/commands/harness.mjs'), ...args], {
    cwd: options.cwd ?? root,
    env: {
      ...process.env,
      HARNESS_PROJECT_ROOT: root
    }
  });
}

async function writeTask(root, taskId, { taskPlan, findings, progress, sessionStartEpoch }) {
  const taskDir = path.join(root, 'planning/active', taskId);
  await mkdir(taskDir, { recursive: true });
  await Promise.all([
    writeFile(path.join(taskDir, 'task_plan.md'), taskPlan),
    writeFile(path.join(taskDir, 'findings.md'), findings),
    writeFile(path.join(taskDir, 'progress.md'), progress)
  ]);

  if (sessionStartEpoch !== undefined) {
    await writeFile(path.join(taskDir, '.session-start'), `${sessionStartEpoch}\n`);
  }
}

function activeTaskFiles(title, status = 'active', statusLine = `Status: ${status}`) {
  return {
    taskPlan: [
      `# ${title}`,
      '',
      '## Current State',
      statusLine,
      'Archive Eligible: no',
      'Close Reason:',
      '',
      '### Phase 1: Gather context',
      '- **Status:** complete',
      '',
      '### Phase 2: Render summary',
      '- **Status:** pending'
    ].join('\n'),
    findings: ['## Findings', '- Keep output compact.'].join('\n'),
    progress: ['## Progress', '- Added command coverage.'].join('\n')
  };
}

test('harness --help does not list the hidden summary command', async () => {
  const root = await createFixture('summary-help');
  try {
    const { stdout } = await harnessCommand(root, '--help');
    assert.doesNotMatch(stdout, /^\s*summary\b/m);
  } finally {
    await removeFixture(root);
  }
});

test('harness summary accepts active status lines with extra whitespace', async () => {
  const root = await createFixture('summary-flexible-status');
  try {
    await writeTask(root, 't1', activeTaskFiles('Task One', 'active', 'Status:  active'));

    const { stdout, stderr } = await harnessCommand(root, 'summary');

    assert.equal(stderr, '');
    assert.match(stdout, /Task: Task One \(t1\)/);
  } finally {
    await removeFixture(root);
  }
});

test('harness summary prints SESSION SUMMARY for a single active task', async () => {
  const root = await createFixture('summary-single-active');
  try {
    await writeTask(root, 't1', activeTaskFiles('Task One'));

    const { stdout, stderr } = await harnessCommand(root, 'summary');

    assert.equal(stderr, '');
    assert.match(stdout, /\[planning-with-files\] SESSION SUMMARY/);
    assert.match(stdout, /Task: Task One \(t1\)/);
    assert.match(stdout, /Status: active  Phases: 1\/2  Duration: unavailable/);
    assert.ok(stdout.endsWith('\n'));
  } finally {
    await removeFixture(root);
  }
});

test('harness summary surfaces a compact companion warning for active tasks with drift', async () => {
  const root = await createFixture('summary-companion-drift');
  try {
    await writeTask(root, 't1', {
      taskPlan: [
        '# Task One',
        '',
        '## Current State',
        'Status: active',
        'Archive Eligible: no',
        'Close Reason:',
        '',
        '## Companion Plan',
        '- Companion plan: `docs/superpowers/plans/task-one.md`',
        '- Companion summary: reasoning notes',
        '- Sync-back status: active draft',
        '',
        '### Phase 1: Gather context',
        '- **Status:** complete',
        '',
        '### Phase 2: Render summary',
        '- **Status:** pending'
      ].join('\n'),
      findings: ['## Findings', '- Keep output compact.'].join('\n'),
      progress: ['## Progress', '- Added command coverage.'].join('\n')
    });
    await mkdir(path.join(root, 'docs/superpowers/plans'), { recursive: true });
    await writeFile(
      path.join(root, 'docs/superpowers/plans/task-one.md'),
      '# Task One Companion\n\nLifecycle state: active\nSync-back status: active draft\n'
    );

    const { stdout, stderr } = await harnessCommand(root, 'summary');

    assert.equal(stderr, '');
    assert.match(stdout, /Companion: needs attention - Companion plan is missing Active task path/);
  } finally {
    await removeFixture(root);
  }
});

test('summary --task renders a compact route line when a routing decision exists', async () => {
  const root = await createFixture('summary-routing-decision');
  try {
    await writeTask(root, 'demo-task', {
      taskPlan: [
        '# Task Plan: Demo',
        '',
        '## Goal',
        'Keep routing visible.',
        '',
        '## Current State',
        'Status: active',
        'Archive Eligible: no',
        'Close Reason:',
        'Reconcile: open',
        '',
        '## Routing Decision',
        '- Selected Route: tracked-lean',
        '- Route Reason: durable task without deep reasoning',
        '- Promotion Trigger: none',
        '- Route Evidence Surface: planning + summary'
      ].join('\n'),
      findings: '## Findings\n- Keep route visible.\n',
      progress: '## Progress\n- Added routing record.\n'
    });

    const { stdout, stderr } = await harnessCommand(root, 'summary', '--task', 'demo-task');

    assert.equal(stderr, '');
    assert.match(stdout, /Route: tracked-lean - durable task without deep reasoning/);
  } finally {
    await removeFixture(root);
  }
});

test('harness summary resolves the authority root when run from a nested leaf directory', async () => {
  const root = await createFixture('summary-nested-cwd');
  try {
    const leafDir = path.join(root, 'packages/demo');
    await mkdir(leafDir, { recursive: true });
    await writeTask(root, 't1', activeTaskFiles('Task One'));

    const { stdout, stderr } = await harnessCommand(root, 'summary', { cwd: leafDir });

    assert.equal(stderr, '');
    assert.match(stdout, /Task: Task One \(t1\)/);
  } finally {
    await removeFixture(root);
  }
});

test('harness summary exits with code 1 and no active task stderr when none exist', async () => {
  const root = await createFixture('summary-no-active');
  try {
    await assert.rejects(
      harnessCommand(root, 'summary'),
      (error) => {
        assert.equal(error.code, 1);
        assert.match(error.stderr, /no active task/i);
        return true;
      }
    );
  } finally {
    await removeFixture(root);
  }
});

test('harness summary exits with code 1 when multiple active tasks exist without --task', async () => {
  const root = await createFixture('summary-multiple-active');
  try {
    await writeTask(root, 't1', activeTaskFiles('Task One'));
    await writeTask(root, 't2', activeTaskFiles('Task Two'));

    await assert.rejects(
      harnessCommand(root, 'summary'),
      (error) => {
        assert.equal(error.code, 1);
        assert.match(error.stderr, /multiple active tasks/i);
        return true;
      }
    );
  } finally {
    await removeFixture(root);
  }
});

test('harness summary --task renders the requested task even with multiple active tasks', async () => {
  const root = await createFixture('summary-specific-task');
  try {
    await writeTask(root, 't1', activeTaskFiles('Task One'));
    await writeTask(root, 't2', activeTaskFiles('Task Two'));

    const { stdout, stderr } = await harnessCommand(root, 'summary', '--task', 't2');

    assert.equal(stderr, '');
    assert.match(stdout, /Task: Task Two \(t2\)/);
    assert.doesNotMatch(stdout, /Task: Task One \(t1\)/);
  } finally {
    await removeFixture(root);
  }
});

test('harness summary --task exits with code 1 when the requested task is missing', async () => {
  const root = await createFixture('summary-missing-task');
  try {
    await writeTask(root, 't1', activeTaskFiles('Task One'));

    await assert.rejects(
      harnessCommand(root, 'summary', '--task', 'missing-task'),
      (error) => {
        assert.equal(error.code, 1);
        assert.match(error.stderr, /task .*missing-task.*not found/i);
        return true;
      }
    );
  } finally {
    await removeFixture(root);
  }
});
