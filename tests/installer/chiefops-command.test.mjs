import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { writeExecutionReceipt } from '../../harness/runtime/execution-receipt.mjs';
import { createHarnessFixture, removeHarnessFixture } from '../helpers/harness-fixture.mjs';

const execFileAsync = promisify(execFile);

function createChiefOpsFixture() {
  return createHarnessFixture({ linkNodeModules: true });
}

function harnessCommand(root, ...args) {
  return execFileAsync('node', [path.join(root, 'harness/installer/commands/harness.mjs'), ...args], {
    cwd: root,
    env: {
      ...process.env,
      HARNESS_PROJECT_ROOT: root
    }
  });
}

async function writeTask(root, taskId, files = {}) {
  const taskDir = path.join(root, 'planning/active', taskId);
  await mkdir(taskDir, { recursive: true });

  if (files.taskPlan !== undefined) {
    await writeFile(path.join(taskDir, 'task_plan.md'), files.taskPlan);
  }
  if (files.findings !== undefined) {
    await writeFile(path.join(taskDir, 'findings.md'), files.findings);
  }
  if (files.progress !== undefined) {
    await writeFile(path.join(taskDir, 'progress.md'), files.progress);
  }
}

function activeTaskPlan(title, extra = []) {
  return [
    `# ${title}`,
    '',
    '## Current State',
    'Status: active',
    'Archive Eligible: no',
    'Close Reason:',
    'Reconcile: open',
    '',
    '## Routing Decision',
    '- Selected Route: tracked-lean',
    '- Route Reason: bounded tracked execution',
    '- Promotion Trigger: none',
    '- Route Evidence Surface: planning + receipts',
    '',
    '## Verification Contract',
    '',
    '### Mode: execution',
    '- **Proof Target:** Keep the derived board aligned with planning and receipts.',
    '- **Primary Proof:** node --test tests/installer/chiefops-command.test.mjs',
    '- **Backstop Proof:** read-only MCP registration tests.',
    '- **Escalation Trigger:** duplicate task scanning appears.',
    '- **Evidence Sink:** tests/installer/chiefops-command.test.mjs',
    '- **Reconcile Rule:** sync results into progress.md.',
    '- **Unacceptable Substitute:** manual eyeballing only.',
    ...extra
  ].join('\n');
}

test('harness --help lists the chiefops command', async () => {
  const root = await createHarnessFixture();
  try {
    const { stdout } = await harnessCommand(root, '--help');
    assert.match(stdout, /chiefops\s+Read the derived ChiefOps board for an active tracked task/);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('harness chiefops --help prints usage', async () => {
  const root = await createChiefOpsFixture();
  try {
    const { stdout, stderr } = await harnessCommand(root, 'chiefops', '--help');
    assert.equal(stderr, '');
    assert.match(stdout, /Usage: \.\/scripts\/harness chiefops board --task <task-id> \[--json\]/);
    assert.match(stdout, /chiefops overlay index --task <task-id> \[--json\]/);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('harness chiefops board prints a compact text readout for a blocked task', async () => {
  const root = await createChiefOpsFixture();
  try {
    await writeTask(root, 'chiefops-demo', {
      taskPlan: activeTaskPlan('ChiefOps Demo'),
      findings: '# Findings\n',
      progress: '# Progress\n'
    });
    await writeExecutionReceipt(root, {
      schemaVersion: 1,
      taskId: 'chiefops-demo',
      unitId: 'unit-02',
      actor: 'codex',
      mode: 'inline',
      resultStatus: 'blocked',
      startedAt: '2026-06-04T04:00:00.000Z',
      finishedAt: '2026-06-04T04:05:00.000Z',
      changedFiles: ['harness/runtime/chiefops-service.mjs'],
      verificationCommands: [],
      artifactsProduced: [{ type: 'note', ref: 'progress.md#unit-02' }],
      followups: [{ type: 'integration', status: 'open', target: 'progress.md' }],
      syncBackRef: 'progress.md#unit-02'
    });

    const { stdout, stderr } = await harnessCommand(root, 'chiefops', 'board', '--task', 'chiefops-demo');

    assert.equal(stderr, '');
    assert.match(stdout, /ChiefOps board for chiefops-demo/);
    assert.match(stdout, /status=active lane=tracked-lean risk=high/);
    assert.match(stdout, /signals=execution_receipt_blocked,execution_followup_open,reconciliation_open/);
    assert.match(stdout, /latest_receipt=unit-02\/blocked/);
    assert.match(stdout, /next=Resolve the blocked or failed execution unit before widening scope\./);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('harness chiefops board --json prints runtime-shaped JSON', async () => {
  const root = await createChiefOpsFixture();
  try {
    await writeTask(root, 'chiefops-demo', {
      taskPlan: activeTaskPlan('ChiefOps Demo'),
      findings: '# Findings\n',
      progress: '# Progress\n'
    });

    const { stdout, stderr } = await harnessCommand(root, 'chiefops', 'board', '--task', 'chiefops-demo', '--json');
    const parsed = JSON.parse(stdout);

    assert.equal(stderr, '');
    assert.equal(parsed.taskId, 'chiefops-demo');
    assert.equal(parsed.status, 'active');
    assert.equal(parsed.lane, 'tracked-lean');
    assert.equal(parsed.derivedRisk, 'medium');
    assert.equal(parsed.latestReceipt, null);
    assert.match(parsed.recommendedNextAction, /Finish reconciliation evidence/);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('harness chiefops board requires --task', async () => {
  const root = await createChiefOpsFixture();
  try {
    await assert.rejects(
      harnessCommand(root, 'chiefops', 'board'),
      (error) => {
        assert.equal(error.code, 1);
        assert.match(error.stderr, /Missing required --task <task-id>\./);
        return true;
      }
    );
  } finally {
    await removeHarnessFixture(root);
  }
});

test('harness chiefops board exits with code 1 when the requested task is missing', async () => {
  const root = await createChiefOpsFixture();
  try {
    await assert.rejects(
      harnessCommand(root, 'chiefops', 'board', '--task', 'missing-task'),
      (error) => {
        assert.equal(error.code, 1);
        assert.match(error.stderr, /Active task not found: missing-task/);
        return true;
      }
    );
  } finally {
    await removeHarnessFixture(root);
  }
});

test('harness chiefops board adds a bounded next action beyond active-summary', async () => {
  const root = await createChiefOpsFixture();
  try {
    await writeTask(root, 'chiefops-demo', {
      taskPlan: activeTaskPlan('ChiefOps Demo', [
        '',
        '### Phase 1: Gather context',
        '- **Status:** complete',
        '',
        '### Phase 2: Execute next slice',
        '- **Status:** pending'
      ]),
      findings: '# Findings\n',
      progress: '# Progress\n'
    });

    const chiefops = await harnessCommand(root, 'chiefops', 'board', '--task', 'chiefops-demo');
    const activeSummary = await harnessCommand(root, 'active-summary');

    assert.match(chiefops.stdout, /next=/);
    assert.doesNotMatch(activeSummary.stdout, /next=/);
    assert.match(activeSummary.stdout, /status=active/);
  } finally {
    await removeHarnessFixture(root);
  }
});
