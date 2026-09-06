import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, readlink, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { trioCommand } from '../../harness/installer/commands/trio.mjs';

async function createTrioRoot() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'trio-command-read-'));
  await addTrioTask(root, 'command-task');
  return root;
}

async function addTrioTask(root, taskId, {
  status = 'active',
  taskPlan = `# ${taskId}\n\n## Current State\nStatus: ${status}\n`,
  findings = '# Findings\n',
  progress = '# Progress\n'
} = {}) {
  const taskPath = path.join(root, 'planning', 'active', taskId);
  await mkdir(taskPath, { recursive: true });
  await writeFile(path.join(taskPath, 'task_plan.md'), taskPlan, 'utf8');
  await writeFile(path.join(taskPath, 'findings.md'), findings, 'utf8');
  await writeFile(path.join(taskPath, 'progress.md'), progress, 'utf8');
  return taskPath;
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function fileSnapshot(root) {
  const snapshot = {};
  async function visit(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const target = path.join(current, entry.name);
      const relative = path.relative(root, target);
      if (entry.isDirectory()) {
        snapshot[relative] = { type: 'directory' };
        await visit(target);
      } else if (entry.isFile()) {
        snapshot[relative] = { type: 'file', sha256: sha256(await readFile(target)) };
      } else if (entry.isSymbolicLink()) {
        snapshot[relative] = { type: 'symlink', target: await readlink(target) };
      } else {
        snapshot[relative] = { type: 'other' };
      }
    }
  }
  await visit(root);
  return snapshot;
}

test('trioCommand status resolves a unique active task without --task and preserves file bytes', async () => {
  const root = await createTrioRoot();
  try {
    const before = await fileSnapshot(root);
    const report = await trioCommand(
      ['status', '--root', root],
      { writeOutput: false }
    );
    const after = await fileSnapshot(root);

    assert.equal(report.command, 'status');
    assert.equal(report.mode, 'read-only');
    assert.equal(report.task.taskId, 'command-task');
    assert.equal(report.task.source, 'unique-active');
    assert.equal(report.task.status, 'active');
    assert.equal(report.model, null);
    assert.equal(Object.hasOwn(report, 'summary'), false);
    assert.deepEqual(after, before);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('trioCommand status --summary returns the exact recorded summary for an explicit task', async () => {
  const root = await createTrioRoot();
  try {
    await writeFile(
      path.join(root, 'planning', 'active', 'command-task', 'task_plan.md'),
      '# Command task\n\nGoal: 继续导出审阅\n\n## Current State\nStatus: active\n\n## Remaining Work\n- 核对字段。\n\n## Resume Conditions\n- 保持当前范围。\n',
      'utf8'
    );
    await writeFile(
      path.join(root, 'planning', 'active', 'command-task', 'findings.md'),
      '# Findings\n\n## Current Decisions\n- 保留抽屉。\n\n## Deliverables\n- 审阅稿。\n',
      'utf8'
    );
    const before = await fileSnapshot(root);
    const report = await trioCommand(
      ['status', '--root', root, '--task', 'command-task', '--summary'],
      { writeOutput: false }
    );
    const after = await fileSnapshot(root);

    assert.equal(report.command, 'status');
    assert.equal(report.readOnly, true);
    assert.equal(report.model, null);
    assert.equal(report.summary.kind, 'recorded-trio-summary');
    assert.equal(report.summary.taskId, 'command-task');
    assert.equal(report.summary.fields.goal.text, '继续导出审阅');
    assert.equal(report.summary.fields.decisions.text, '- 保留抽屉。');
    assert.equal(report.summary.fields.deliverables.text, '- 审阅稿。');
    assert.equal(report.summary.fields.remainingWork.text, '- 核对字段。');
    assert.equal(report.summary.fields.resumeConditions.text, '- 保持当前范围。');
    assert.deepEqual(after, before);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('trioCommand status --summary honors an explicit task when multiple active tasks exist', async () => {
  const root = await createTrioRoot();
  try {
    await addTrioTask(root, 'second-task', {
      taskPlan: '# Second task\n\nGoal: 第二任务\n\n## Current State\nStatus: active\n',
      findings: '# Findings\n\n## Current Decisions\n- 第二决定。\n'
    });
    const report = await trioCommand(
      ['status', '--root', root, '--task', 'second-task', '--summary'],
      { writeOutput: false }
    );
    assert.equal(report.task.taskId, 'second-task');
    assert.equal(report.task.source, 'explicit');
    assert.equal(report.summary.fields.goal.text, '第二任务');
    assert.equal(report.summary.fields.decisions.text, '- 第二决定。');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('trioCommand rejects summary without an explicit task or with an attached value before any read/write', async () => {
  const root = await createTrioRoot();
  try {
    const before = await fileSnapshot(root);
    await assert.rejects(
      () => trioCommand(['status', '--root', root, '--summary'], { writeOutput: false }),
      /explicit --task/i
    );
    await assert.rejects(
      () => trioCommand(['status', '--root', root, '--task', 'command-task', '--summary=true'], { writeOutput: false }),
      /invalid --summary/i
    );
    await assert.rejects(
      () => trioCommand(['status', '--root', root, '--task', 'command-task', '--summary', 'value'], { writeOutput: false }),
      /unknown trio option/i
    );
    await assert.rejects(
      () => trioCommand(['status', '--root', root, '--task', 'command-task', '--summary', '--summary'], { writeOutput: false }),
      /duplicate --summary/i
    );
    const invalidSummaryCommands = [
      ['next', '--root', root, '--dry-run', '--role', 'chief', '--summary'],
      ['init', '--root', root, '--task', 'new-task', '--goal', 'x', '--summary'],
      ['progress', '--root', root, '--task', 'command-task', '--event', 'x', '--actor', 'chief', '--detail', 'x', '--summary'],
      ['accept', '--root', root, '--task', 'command-task', '--actor', 'chief', '--detail', 'x', '--summary'],
      ['stop', '--root', root, '--task', 'command-task', '--actor', 'chief', '--reason', 'x', '--summary'],
      ['close', '--root', root, '--task', 'command-task', '--actor', 'chief', '--reason', 'x', '--summary'],
      ['archive', '--root', root, '--task', 'command-task', '--actor', 'chief', '--timestamp', '20260906-160000', '--summary']
    ];
    for (const args of invalidSummaryCommands) {
      await assert.rejects(() => trioCommand(args, { writeOutput: false }), /only to status/i);
    }
    assert.deepEqual(await fileSnapshot(root), before);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('trioCommand CLI status --summary emits one JSON record with no stdout pollution', async () => {
  const root = await createTrioRoot();
  try {
    await writeFile(
      path.join(root, 'planning', 'active', 'command-task', 'task_plan.md'),
      '# Command task\n\nGoal: CLI摘要\n\n## Current State\nStatus: active\n',
      'utf8'
    );
    const result = spawnSync(
      process.execPath,
      [path.join(process.cwd(), 'harness/installer/commands/trio.mjs'), 'status', '--root', root, '--task', 'command-task', '--summary'],
      { encoding: 'utf8' }
    );
    assert.equal(result.status, 0, result.stderr);
    const lines = result.stdout.trim().split('\n');
    assert.equal(lines.length, 1);
    const report = JSON.parse(lines[0]);
    assert.equal(report.command, 'status');
    assert.equal(report.summary.fields.goal.text, 'CLI摘要');
    assert.equal(report.model, null);
    assert.equal(result.stderr, '');

    const wrapper = spawnSync(
      process.execPath,
      [path.join(process.cwd(), 'harness/installer/commands/harness.mjs'), 'trio', 'status', '--root', root, '--task', 'command-task', '--summary'],
      { encoding: 'utf8' }
    );
    assert.equal(wrapper.status, 0, wrapper.stderr);
    const wrapperReport = JSON.parse(wrapper.stdout);
    assert.equal(wrapperReport.summary.fields.goal.text, 'CLI摘要');
    assert.equal(wrapper.stderr, '');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('trioCommand summary keeps exact-reader failures and empty content fail-closed', async () => {
  const cases = [
    {
      name: 'invalid task',
      mutate: async () => null,
      taskId: 'missing-task',
      error: /not found/i
    },
    {
      name: 'missing file',
      mutate: async (root) => rm(path.join(root, 'planning/active/command-task/findings.md')),
      taskId: 'command-task',
      error: /incomplete|missing/i
    },
    {
      name: 'extra file',
      mutate: async (root) => writeFile(path.join(root, 'planning/active/command-task', 'extra.md'), 'sidecar\n', 'utf8'),
      taskId: 'command-task',
      error: /exactly the three|extra/i
    },
    {
      name: 'symlink',
      mutate: async (root) => {
        const target = path.join(root, 'planning/active/command-task/findings.md');
        await rm(target);
        await symlink('/tmp', target);
      },
      taskId: 'command-task',
      error: /symlink/i
    }
  ];

  for (const entry of cases) {
    const root = await createTrioRoot();
    try {
      await entry.mutate(root);
      await assert.rejects(
        () => trioCommand(['status', '--root', root, '--task', entry.taskId, '--summary'], { writeOutput: false }),
        entry.error,
        entry.name
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }

  const emptyRoot = await createTrioRoot();
  try {
    await writeFile(path.join(emptyRoot, 'planning/active/command-task/findings.md'), '', 'utf8');
    await assert.rejects(
      () => trioCommand(
        ['status', '--root', emptyRoot, '--task', 'command-task', '--summary'],
        { writeOutput: false }
      ),
      /empty findings/i
    );
  } finally {
    await rm(emptyRoot, { recursive: true, force: true });
  }
});

test('trioCommand summary refreshes source text and hash after findings drift', async () => {
  const root = await createTrioRoot();
  try {
    const findings = path.join(root, 'planning/active/command-task/findings.md');
    await writeFile(findings, '# Findings\n\n## Current Decisions\n- 初始决定。\n', 'utf8');
    const first = await trioCommand(
      ['status', '--root', root, '--task', 'command-task', '--summary'],
      { writeOutput: false }
    );
    await writeFile(findings, '# Findings\n\n## Current Decisions\n- 更新决定。\n', 'utf8');
    const second = await trioCommand(
      ['status', '--root', root, '--task', 'command-task', '--summary'],
      { writeOutput: false }
    );
    assert.equal(first.summary.fields.decisions.text, '- 初始决定。');
    assert.equal(second.summary.fields.decisions.text, '- 更新决定。');
    assert.notEqual(
      first.summary.fields.decisions.source.sha256,
      second.summary.fields.decisions.source.sha256
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('trioCommand summary preserves terminal status without lifecycle side effects', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'trio-command-terminal-'));
  try {
    await addTrioTask(root, 'closed-task', {
      status: 'closed',
      taskPlan: '# Closed task\n\nGoal: 已完成审阅\n\n## Current State\nStatus: closed\n',
      findings: '# Findings\n\n## Deliverables\n- 审阅稿。\n'
    });
    const before = await fileSnapshot(root);
    const report = await trioCommand(
      ['status', '--root', root, '--task', 'closed-task', '--summary'],
      { writeOutput: false }
    );
    assert.equal(report.task.status, 'closed');
    assert.equal(report.task.terminal, true);
    assert.equal(report.summary.status, 'closed');
    assert.equal(report.summary.terminal, true);
    assert.deepEqual(await fileSnapshot(root), before);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('trio next fails closed without a declared work role and makes no model decision', async () => {
  const root = await createTrioRoot();
  try {
    await assert.rejects(
      () => trioCommand(
        ['next', '--root', root, '--dry-run', '--class', 'tracked'],
        { writeOutput: false }
      ),
      /--role|declared work role/i
    );
    await assert.rejects(
      () => trioCommand(
        ['next', '--root', root, '--dry-run', '--class', 'quick'],
        { writeOutput: false }
      ),
      /--role|declared work role/i
    );

    const status = await trioCommand(['status', '--root', root], { writeOutput: false });
    assert.equal(status.command, 'status');
    assert.equal(status.model, null);

    const next = await trioCommand(
      ['next', '--root', root, '--dry-run', '--role', 'chief'],
      { writeOutput: false }
    );
    assert.equal(next.model.workRole, 'chief');
    assert.equal(next.model.requestedModel, 'gpt-5.6-sol');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('trioCommand calculates next --dry-run without writing or creating a Trio', async () => {
  const root = await createTrioRoot();
  try {
    const before = await fileSnapshot(root);
    const report = await trioCommand(
      ['next', '--root', root, '--dry-run', '--role', 'chief'],
      { writeOutput: false }
    );
    const after = await fileSnapshot(root);

    assert.equal(report.command, 'next');
    assert.equal(report.mode, 'dry-run');
    assert.equal(report.readOnly, true);
    assert.equal(report.action, 'resume-trio');
    assert.equal(Object.hasOwn(report, 'summary'), false);
    assert.deepEqual(report.writes, []);
    assert.deepEqual(after, before);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('trioCommand routes quick no-Trio work inline without reading or creating Trio files', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'trio-command-quick-'));
  try {
    const before = await fileSnapshot(root);
    const report = await trioCommand(
      ['next', '--root', root, '--class', 'quick', '--dry-run', '--role', 'coding', '--complexity', 'high'],
      { writeOutput: false }
    );
    const after = await fileSnapshot(root);

    assert.equal(report.task, null);
    assert.equal(report.action, 'execute-inline');
    assert.deepEqual(report.writes, []);
    assert.deepEqual(after, before);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('trioCommand returns create-trio only for definite tracked no-Trio cases', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'trio-command-tracked-'));
  try {
    const before = await fileSnapshot(root);
    const noActive = await trioCommand(
      ['next', '--root', root, '--class', 'tracked', '--dry-run', '--role', 'chief'],
      { writeOutput: false }
    );
    const explicitMissing = await trioCommand(
      ['next', '--root', root, '--task', 'future-task', '--class', 'tracked', '--dry-run', '--role', 'chief'],
      { writeOutput: false }
    );
    const after = await fileSnapshot(root);

    assert.equal(noActive.task, null);
    assert.equal(noActive.action, 'create-trio');
    assert.equal(explicitMissing.task, null);
    assert.equal(explicitMissing.action, 'create-trio');
    assert.deepEqual(after, before);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('trioCommand fails closed for multiple or corrupt tasks and invalid explicit task IDs', async () => {
  const multipleRoot = await createTrioRoot();
  const corruptRoot = await createTrioRoot();
  try {
    const secondTask = path.join(multipleRoot, 'planning', 'active', 'second-task');
    await mkdir(secondTask, { recursive: true });
    await writeFile(path.join(secondTask, 'task_plan.md'), '# Second\n\nStatus: active\n', 'utf8');
    await writeFile(path.join(secondTask, 'findings.md'), '# Findings\n', 'utf8');
    await writeFile(path.join(secondTask, 'progress.md'), '# Progress\n', 'utf8');

    await assert.rejects(
      () => trioCommand(['next', '--root', multipleRoot, '--class', 'tracked', '--dry-run', '--role', 'chief'], { writeOutput: false }),
      /multiple/i
    );

    await writeFile(
      path.join(corruptRoot, 'planning', 'active', 'command-task', 'task_plan.md'),
      '# Corrupt task\n',
      'utf8'
    );
    await assert.rejects(
      () => trioCommand(['next', '--root', corruptRoot, '--task', 'command-task', '--class', 'tracked', '--dry-run', '--role', 'chief'], { writeOutput: false }),
      /corrupt|status|incomplete/i
    );
    await assert.rejects(
      () => trioCommand(['next', '--root', corruptRoot, '--task', '../invalid', '--class', 'quick', '--dry-run'], { writeOutput: false }),
      /invalid task/i
    );
  } finally {
    await rm(multipleRoot, { recursive: true, force: true });
    await rm(corruptRoot, { recursive: true, force: true });
  }
});

test('verify all runs the final Trio inventory before legacy backstops', async () => {
  const packageJson = JSON.parse(await readFile(path.join(process.cwd(), 'package.json'), 'utf8'));

  assert.equal(
    packageJson.scripts['verify:all'],
    'npm run verify:trio && npm run verify:core && npm run verify:homepage'
  );
  assert.match(
    packageJson.scripts['verify:trio'],
    /node tests\/trio\/import-boundaries\.test\.mjs --milestone final$/
  );
});

test('trio next --dry-run exposes role and complexity decisions without writing', async () => {
  const root = await createTrioRoot();
  try {
    const before = await fileSnapshot(root);
    const report = await trioCommand(
      ['next', '--root', root, '--dry-run', '--role', 'coding', '--complexity', 'xhigh'],
      { writeOutput: false }
    );
    const after = await fileSnapshot(root);

    assert.equal(report.command, 'next');
    assert.equal(report.mode, 'dry-run');
    assert.equal(report.readOnly, true);
    assert.equal(report.model.workRole, 'coding');
    assert.equal(report.model.complexity, 'xhigh');
    assert.equal(report.model.requestedModel, 'opencode-go/deepseek-v4-flash');
    assert.equal(report.model.requestedEffort, 'xhigh');
    assert.equal(report.model.actualModel, 'unknown');
    assert.deepEqual(report.writes, []);
    assert.deepEqual(after, before);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('trio next rejects execution overrides and unknown role or complexity input', async () => {
  const root = await createTrioRoot();
  try {
    await assert.rejects(
      () => trioCommand(
        ['next', '--root', root, '--dry-run', '--role', 'coding', '--complexity', 'xhigh', '--override-reason', 'upgrade'],
        { writeOutput: false }
      ),
      /override.*execution|execution roles never upgrade/i
    );
    await assert.rejects(
      () => trioCommand(['next', '--root', root, '--dry-run', '--role', 'deep'], { writeOutput: false }),
      /unknown work role/i
    );
    await assert.rejects(
      () => trioCommand(['next', '--root', root, '--dry-run', '--role', 'coding', '--complexity', 'ultra'], { writeOutput: false }),
      /complexity/i
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('trio next records structured Chief override provenance and stays read-only', async () => {
  const root = await createTrioRoot();
  try {
    const before = await fileSnapshot(root);
    const report = await trioCommand(
      ['next', '--root', root, '--dry-run', '--role', 'planning', '--override-reason', 'chief gate review', '--override-source', 'operator'],
      { writeOutput: false }
    );
    const after = await fileSnapshot(root);

    assert.equal(report.model.workRole, 'planning');
    assert.equal(report.model.requestedModel, 'gpt-5.6-sol');
    assert.equal(report.model.requestedEffort, 'max');
    assert.deepEqual(report.model.override, {
      reason: 'chief gate review',
      provenance: 'operator'
    });
    assert.deepEqual(report.writes, []);
    assert.deepEqual(after, before);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('trio write commands render JSON-serializable reports to a captured stdout writer', async () => {
  const root = await createTrioRoot();
  try {
    async function capture(args) {
      const chunks = [];
      const stdout = {
        write(chunk) {
          chunks.push(String(chunk));
          return true;
        }
      };
      const report = await trioCommand(args, { writeOutput: true, stdout });
      return { report, parsed: JSON.parse(chunks.join('')) };
    }

    const progress = await capture([
      'progress', '--root', root, '--task', 'command-task',
      '--event', 'worker_done', '--actor', 'worker-1', '--detail', 'BigInt-free CLI output.'
    ]);
    assert.equal(progress.report.command, 'progress');
    assert.equal(Object.hasOwn(progress.report, 'summary'), false);
    assert.equal(progress.parsed.command, 'progress');
    assert.equal(progress.parsed.result.event, 'worker_done');
    assert.equal(progress.parsed.result.actor, 'worker-1');
    assert.equal(progress.parsed.result.detail, 'BigInt-free CLI output.');
    assert.equal(typeof progress.parsed.result.sha256, 'string');
    assert.equal(progress.parsed.result.sha256.length, 64);
    assert.equal(typeof progress.parsed.result.dev, 'string');
    assert.equal(typeof progress.parsed.result.ino, 'string');
    assert.equal(typeof progress.parsed.result.nlink, 'string');
    assert.equal(typeof progress.report.result.dev, 'string');

    const accepted = await capture([
      'accept', '--root', root, '--task', 'command-task',
      '--actor', 'chief', '--detail', 'Accepted via CLI.'
    ]);
    assert.equal(accepted.report.command, 'accept');
    assert.equal(Object.hasOwn(accepted.report, 'summary'), false);
    assert.equal(accepted.parsed.result.event, 'accepted');
    assert.equal(accepted.parsed.result.actor, 'chief');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
