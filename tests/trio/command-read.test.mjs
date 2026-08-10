import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { trioCommand } from '../../harness/installer/commands/trio.mjs';

async function createTrioRoot() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'trio-command-read-'));
  const taskDir = path.join(root, 'planning', 'active', 'command-task');
  await mkdir(taskDir, { recursive: true });
  await writeFile(
    path.join(taskDir, 'task_plan.md'),
    '# Command task\n\n## Current State\nStatus: active\n',
    'utf8'
  );
  await writeFile(path.join(taskDir, 'findings.md'), '# Findings\n', 'utf8');
  await writeFile(path.join(taskDir, 'progress.md'), '# Progress\n', 'utf8');
  return root;
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function fileSnapshot(root) {
  const snapshot = {};
  async function visit(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) await visit(target);
      else if (entry.isFile()) snapshot[path.relative(root, target)] = sha256(await readFile(target));
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
    assert.deepEqual(after, before);
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
    assert.equal(accepted.parsed.result.event, 'accepted');
    assert.equal(accepted.parsed.result.actor, 'chief');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
