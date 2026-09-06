import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import * as trioRead from '../../harness/trio/core/read.mjs';
import {
  readTrioTask,
  resolveTrioTask,
  listActiveTrioTaskIds
} from '../../harness/trio/core/read.mjs';
import { readLegacyTask } from '../../harness/trio/compatibility/legacy-reader.mjs';
import { readExactTrioTask } from '../../harness/trio/core/store.mjs';

async function createRoot(prefix = 'trio-read-') {
  const root = await mkdtemp(path.join(os.tmpdir(), prefix));
  await mkdir(path.join(root, 'planning', 'active'), { recursive: true });
  return root;
}

async function writeTrioTask(root, taskId, {
  status = 'active',
  taskPlan = null,
  findings = '# Findings\n\nA finding.\n',
  progress = '# Progress\n\nA progress event.\n'
} = {}) {
  const taskDir = path.join(root, 'planning', 'active', taskId);
  await mkdir(taskDir, { recursive: true });
  await writeFile(
    path.join(taskDir, 'task_plan.md'),
    taskPlan ?? `# ${taskId}\n\n## Current State\nStatus: ${status}\n`,
    'utf8'
  );
  await writeFile(path.join(taskDir, 'findings.md'), findings, 'utf8');
  await writeFile(path.join(taskDir, 'progress.md'), progress, 'utf8');
  return taskDir;
}

async function readSummaryFixture(root, taskId, options = {}) {
  await writeTrioTask(root, taskId, options);
  return readExactTrioTask(root, { taskId });
}

async function readAuthorityBytes(taskDir) {
  const fileNames = ['task_plan.md', 'findings.md', 'progress.md'];
  return Promise.all(fileNames.map(async (fileName) => [
    fileName,
    (await readFile(path.join(taskDir, fileName))).toString('hex')
  ]));
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

test('readTrioTask reads an explicitly selected complete Trio without writing', async () => {
  const root = await createRoot();
  try {
    const taskDir = await writeTrioTask(root, 'explicit-task');
    const result = await readTrioTask(root, { taskId: 'explicit-task' });

    assert.equal(result.taskId, 'explicit-task');
    assert.equal(result.taskDir, await realpath(taskDir));
    assert.equal(result.status, 'active');
    assert.equal(result.source, 'explicit');
    assert.match(result.files.taskPlan, /Status: active/);
    assert.match(result.files.findings, /A finding/);
    assert.match(result.files.progress, /A progress event/);
    assert.equal(result.authorityRoot, await realpath(root));
    assert.deepEqual(result.binding, {
      authorityRoot: await realpath(root),
      taskId: 'explicit-task',
      files: {
        taskPlan: { path: result.paths.taskPlan, sha256: sha256(result.files.taskPlan) },
        findings: { path: result.paths.findings, sha256: sha256(result.files.findings) },
        progress: { path: result.paths.progress, sha256: sha256(result.files.progress) }
      }
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('resolveTrioTask selects the unique active Trio when no task id is supplied', async () => {
  const root = await createRoot();
  try {
    await writeTrioTask(root, 'only-active');
    assert.deepEqual(await listActiveTrioTaskIds(root), ['only-active']);

    const result = await resolveTrioTask(root);
    assert.equal(result.taskId, 'only-active');
    assert.equal(result.source, 'unique-active');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('readTrioTask fails closed when multiple active tasks exist', async () => {
  const root = await createRoot();
  try {
    await writeTrioTask(root, 'active-one');
    await writeTrioTask(root, 'active-two');

    await assert.rejects(
      () => readTrioTask(root),
      /Multiple active tasks found under planning\/active/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('readTrioTask rejects traversal and absolute task identifiers', async () => {
  const root = await createRoot();
  try {
    for (const taskId of ['../outside', 'nested/task', '..', path.join(root, 'outside')]) {
      await assert.rejects(
        () => readTrioTask(root, { taskId }),
        /Invalid task id|must be a direct child/
      );
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('readTrioTask rejects missing and corrupt Trio files', async () => {
  const root = await createRoot();
  try {
    const missingFindings = path.join(root, 'planning', 'active', 'missing-findings');
    await mkdir(missingFindings, { recursive: true });
    await writeFile(path.join(missingFindings, 'task_plan.md'), 'Status: active\n', 'utf8');
    await writeFile(path.join(missingFindings, 'progress.md'), '# Progress\n', 'utf8');

    await assert.rejects(
      () => readTrioTask(root, { taskId: 'missing-findings' }),
      /incomplete|missing.*findings|Trio/
    );

    await writeTrioTask(root, 'corrupt-task', {
      taskPlan: '# Corrupt task\n\nNo lifecycle status.\n',
      findings: '# Findings\n',
      progress: '# Progress\n'
    });
    await assert.rejects(
      () => readTrioTask(root, { taskId: 'corrupt-task' }),
      /invalid.*status|corrupt|Status/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('legacy reader accepts an explicit nonterminal task plan without requiring a new Trio', async () => {
  const root = await createRoot('trio-legacy-read-');
  try {
    const taskDir = path.join(root, 'planning', 'active', 'legacy-in-progress');
    await mkdir(taskDir, { recursive: true });
    await writeFile(
      path.join(taskDir, 'task_plan.md'),
      '# Legacy task\n\n## Current State\nStatus: in_progress\n',
      'utf8'
    );

    const result = await readLegacyTask(root, { taskId: 'legacy-in-progress' });
    assert.equal(result.taskId, 'legacy-in-progress');
    assert.equal(result.status, 'in_progress');
    assert.equal(result.terminal, false);
    assert.equal(result.source, 'legacy');
    assert.equal(result.taskDir, await realpath(taskDir));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('readTrioTask rejects symlinked planning directories, task directories, and Trio files', async () => {
  const planningRoot = await mkdtemp(path.join(os.tmpdir(), 'trio-symlink-planning-'));
  const planningTarget = await createRoot('trio-symlink-planning-target-');
  try {
    await symlink(path.join(planningTarget, 'planning'), path.join(planningRoot, 'planning'));
    await assert.rejects(() => readTrioTask(planningRoot), /symlink/i);
  } finally {
    await rm(planningRoot, { recursive: true, force: true });
    await rm(planningTarget, { recursive: true, force: true });
  }

  const activeRoot = await mkdtemp(path.join(os.tmpdir(), 'trio-symlink-active-'));
  const activeTarget = await createRoot('trio-symlink-active-target-');
  try {
    await mkdir(path.join(activeRoot, 'planning'), { recursive: true });
    await symlink(path.join(activeTarget, 'planning', 'active'), path.join(activeRoot, 'planning', 'active'));
    await assert.rejects(() => readTrioTask(activeRoot), /symlink/i);
  } finally {
    await rm(activeRoot, { recursive: true, force: true });
    await rm(activeTarget, { recursive: true, force: true });
  }

  const taskRoot = await createRoot('trio-symlink-task-');
  const taskTargetRoot = await createRoot('trio-symlink-task-target-');
  try {
    const taskTarget = await writeTrioTask(taskTargetRoot, 'linked-task');
    await symlink(taskTarget, path.join(taskRoot, 'planning', 'active', 'linked-task'));
    await assert.rejects(() => readTrioTask(taskRoot, { taskId: 'linked-task' }), /symlink/i);
  } finally {
    await rm(taskRoot, { recursive: true, force: true });
    await rm(taskTargetRoot, { recursive: true, force: true });
  }

  for (const fileName of ['task_plan.md', 'findings.md', 'progress.md']) {
    const fileRoot = await createRoot('trio-symlink-file-');
    const externalFile = path.join(fileRoot, 'outside.md');
    try {
      const taskDir = await writeTrioTask(fileRoot, 'file-link');
      await writeFile(externalFile, '# Outside\n', 'utf8');
      await rm(path.join(taskDir, fileName));
      await symlink(externalFile, path.join(taskDir, fileName));
      await assert.rejects(() => readTrioTask(fileRoot, { taskId: 'file-link' }), /symlink/i);
    } finally {
      await rm(fileRoot, { recursive: true, force: true });
    }
  }
});

test('readTrioTask preserves corrupt active roots as errors instead of treating them as no active task', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'trio-corrupt-active-root-'));
  try {
    await mkdir(path.join(root, 'planning'), { recursive: true });
    await writeFile(path.join(root, 'planning', 'active'), 'not a directory\n', 'utf8');
    await assert.rejects(() => resolveTrioTask(root), /active|directory|corrupt/i);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('verifyTrioBinding reports bytes drift after a complete Trio changes', async () => {
  const root = await createRoot('trio-binding-drift-');
  try {
    const taskDir = await writeTrioTask(root, 'binding-task');
    const reading = await readTrioTask(root, { taskId: 'binding-task' });
    assert.equal(typeof trioRead.verifyTrioBinding, 'function');

    await writeFile(path.join(taskDir, 'progress.md'), '# Progress\n\nChanged after binding.\n', 'utf8');
    const verification = await trioRead.verifyTrioBinding(reading.binding);

    assert.equal(verification.status, 'mismatch');
    assert.equal(verification.matches, false);
    assert.deepEqual(verification.mismatches, ['progress']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('S01 complete five-field Trio produces a recorded deterministic summary', async () => {
  const root = await createRoot('trio-summary-s01-');
  try {
    const snapshot = await readSummaryFixture(root, 'complete-summary', {
      taskPlan: '# Complete task\n\nGoal: 完成导出审阅稿\n\n## Current State\nStatus: active\n\n## Remaining Work\n- 核对 Payment ID。\n- 保留原始顺序。\n\n## Resume Conditions\n- 只在本地继续审阅。\n',
      findings: '# Findings\n\n## Current Decisions\n- 采用抽屉方案。\n- 取消时区选择。\n\n## Deliverables\n- docs/export-draft.md\n- 本地完成字段核对。\n',
      progress: '# Progress\n\nA progress event.\n'
    });

    const summary = trioRead.summarizeTrioTask(snapshot);
    assert.equal(summary.schemaVersion, 1);
    assert.equal(summary.kind, 'recorded-trio-summary');
    assert.equal(summary.taskId, snapshot.taskId);
    assert.equal(summary.status, snapshot.status);
    assert.equal(summary.terminal, snapshot.terminal);
    assert.equal(summary.requiresSourceReview, true);
    assert.equal(summary.fields.goal.state, 'recorded');
    assert.equal(summary.fields.goal.text, '完成导出审阅稿');
    assert.deepEqual(summary.fields.decisions, {
      state: 'recorded',
      text: '- 采用抽屉方案。\n- 取消时区选择。',
      source: {
        file: 'findings.md',
        path: snapshot.paths.findings,
        startLine: 4,
        endLine: 5,
        sha256: snapshot.binding.files.findings.sha256
      },
      truncated: false
    });
    assert.equal(summary.fields.deliverables.text, '- docs/export-draft.md\n- 本地完成字段核对。');
    assert.equal(summary.fields.remainingWork.text, '- 核对 Payment ID。\n- 保留原始顺序。');
    assert.equal(summary.fields.resumeConditions.text, '- 只在本地继续审阅。');
    for (const field of Object.values(summary.fields)) assert.deepEqual(Object.keys(field), ['state', 'text', 'source', 'truncated']);
    assert.equal(summary.fields.goal.source.path, snapshot.paths.taskPlan);
    assert.equal(summary.fields.goal.source.sha256, snapshot.binding.files.taskPlan.sha256);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('S02 legacy Trio remains readable with all summary fields missing', async () => {
  const root = await createRoot('trio-summary-s02-');
  try {
    const snapshot = await readSummaryFixture(root, 'legacy-summary', {
      taskPlan: '# Legacy task\n\n## Current State\nStatus: active\n',
      findings: '# Findings\n',
      progress: '# Progress\n'
    });
    const summary = trioRead.summarizeTrioTask(snapshot);
    assert.equal(summary.requiresSourceReview, true);
    for (const field of Object.values(summary.fields)) {
      assert.deepEqual(field, { state: 'missing', text: null, source: null, truncated: false });
    }
    assert.equal((await readAuthorityBytes(snapshot.taskDir)).length, 3);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('S03 partial and empty sections stay independently missing', async () => {
  const root = await createRoot('trio-summary-s03-');
  try {
    const snapshot = await readSummaryFixture(root, 'partial-summary', {
      taskPlan: '# Partial\n\nGoal: 只记录已有字段\n\n## Current State\nStatus: active\n\n## Resume Conditions\n\n',
      findings: '# Findings\n\n## Current Decisions\n- 保留抽屉。\n\n## Deliverables\n\n',
      progress: '# Progress\n'
    });
    const summary = trioRead.summarizeTrioTask(snapshot);
    assert.equal(summary.fields.goal.state, 'recorded');
    assert.equal(summary.fields.decisions.state, 'recorded');
    for (const key of ['deliverables', 'remainingWork', 'resumeConditions']) {
      assert.deepEqual(summary.fields[key], { state: 'missing', text: null, source: null, truncated: false });
    }
    assert.equal(summary.fields.decisions.text, '- 保留抽屉。');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('S04 duplicate Goal and section headings become ambiguous without choosing the last', async () => {
  const root = await createRoot('trio-summary-s04-');
  try {
    const snapshot = await readSummaryFixture(root, 'duplicate-summary', {
      taskPlan: '# Duplicate\n\nGoal: 第一个目标\nGoal: 第二个目标\n\n## Current State\nStatus: active\n',
      findings: '# Findings\n\n## Current Decisions\n\n## Current Decisions\n- 第二个决定。\n',
      progress: '# Progress\n'
    });
    const summary = trioRead.summarizeTrioTask(snapshot);
    assert.deepEqual(summary.fields.goal, { state: 'ambiguous', text: null, source: null, truncated: false });
    assert.deepEqual(summary.fields.decisions, { state: 'ambiguous', text: null, source: null, truncated: false });
    assert.equal(summary.fields.deliverables.state, 'missing');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('S05 ignores fenced pseudo fields while preserving the reader status', async () => {
  const root = await createRoot('trio-summary-s05-');
  try {
    const snapshot = await readSummaryFixture(root, 'fenced-summary', {
      taskPlan: '# Fenced\n\nGoal: 围栏外目标\n\n## Current State\nStatus: active\n',
      findings: '# Findings\n\n```text\nGoal: 围栏内目标\n## Current Decisions\n- 围栏内决定。\nStatus: ignored\n```\n\n## Current Decisions\n- 围栏外决定。\n\n## Deliverables\n- 围栏外交付物。\n',
      progress: '# Progress\n'
    });
    const summary = trioRead.summarizeTrioTask(snapshot);
    assert.equal(snapshot.status, 'active');
    assert.equal(summary.fields.goal.text, '围栏外目标');
    assert.equal(summary.fields.decisions.text, '- 围栏外决定。');
    assert.equal(summary.fields.deliverables.text, '- 围栏外交付物。');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('S06 preserves ### content and stops at the next level-one or level-two heading', async () => {
  const root = await createRoot('trio-summary-s06-');
  try {
    const snapshot = await readSummaryFixture(root, 'boundary-summary', {
      taskPlan: '# Boundary\n\nGoal: 边界测试\n\n## Current State\nStatus: active\n\n## Remaining Work\n- 第一项。\n### 子标题\n- 子标题内容。\n\n## Resume Conditions\n- 后续条件。\n\n# 后续一级标题\n- 不应进入摘要。\n',
      findings: '# Findings\n'
    });
    const summary = trioRead.summarizeTrioTask(snapshot);
    assert.equal(summary.fields.remainingWork.text, '- 第一项。\n### 子标题\n- 子标题内容。');
    assert.equal(summary.fields.remainingWork.source.startLine, 9);
    assert.equal(summary.fields.remainingWork.source.endLine, 11);
    assert.equal(summary.fields.remainingWork.text.includes('后续条件'), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('S07 normalizes LF and CRLF text while binding each source to its actual bytes', async () => {
  const lfRoot = await createRoot('trio-summary-s07-lf-');
  const crlfRoot = await createRoot('trio-summary-s07-crlf-');
  try {
    const lfPlan = '# Endings\n\nGoal: 行结束\n\n## Current State\nStatus: active\n\n## Remaining Work\n- 保持换行。\n';
    const options = { taskPlan: lfPlan, findings: '# Findings\n\n## Deliverables\n- 一个交付物。\n', progress: '# Progress\n' };
    const lf = await readSummaryFixture(lfRoot, 'lf-summary', options);
    const crlf = await readSummaryFixture(crlfRoot, 'crlf-summary', {
      ...options,
      taskPlan: lfPlan.replaceAll('\n', '\r\n'),
      findings: options.findings.replaceAll('\n', '\r\n'),
      progress: options.progress.replaceAll('\n', '\r\n')
    });
    const lfSummary = trioRead.summarizeTrioTask(lf);
    const crlfSummary = trioRead.summarizeTrioTask(crlf);
    assert.equal(crlfSummary.fields.goal.text, lfSummary.fields.goal.text);
    assert.equal(crlfSummary.fields.remainingWork.text, lfSummary.fields.remainingWork.text);
    assert.equal(crlfSummary.fields.remainingWork.source.startLine, lfSummary.fields.remainingWork.source.startLine);
    assert.equal(crlfSummary.fields.remainingWork.source.endLine, lfSummary.fields.remainingWork.source.endLine);
    assert.equal(crlfSummary.fields.remainingWork.source.sha256, crlf.binding.files.taskPlan.sha256);
    assert.notEqual(crlf.binding.files.taskPlan.sha256, lf.binding.files.taskPlan.sha256);
  } finally {
    await rm(lfRoot, { recursive: true, force: true });
    await rm(crlfRoot, { recursive: true, force: true });
  }
});

test('S08 truncates at 2000 Unicode code points without splitting an emoji', async () => {
  const root = await createRoot('trio-summary-s08-');
  try {
    const cases = [
      ['under', 'a'.repeat(1999), 1999, false],
      ['exact', 'a'.repeat(2000), 2000, false],
      ['over', 'a'.repeat(2000) + '🙂', 2000, true],
      ['emoji-boundary', 'a'.repeat(1999) + '🙂', 2000, false]
    ];
    for (const [label, value, expectedLength, expectedTruncated] of cases) {
      const taskPlan = `# ${label}\n\nGoal: ${value}\n\n## Current State\nStatus: active\n`;
      const snapshot = await readSummaryFixture(root, `summary-${label}`, { taskPlan, findings: '# Findings\n', progress: '# Progress\n' });
      const field = trioRead.summarizeTrioTask(snapshot).fields.goal;
      assert.equal(Array.from(field.text).length, expectedLength, label);
      assert.equal(field.truncated, expectedTruncated, label);
      assert.equal(field.text.includes('\uFFFD'), false, label);
      if (label === 'emoji-boundary') assert.equal(field.text.endsWith('🙂'), true, label);
      assert.equal(field.source.startLine, 3, label);
      await rm(snapshot.taskDir, { recursive: true, force: true });
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('S09 recognizes fenced variants and leaves an unclosed fence opaque', async () => {
  const root = await createRoot('trio-summary-s09-');
  try {
    const snapshot = await readSummaryFixture(root, 'fence-summary', {
      taskPlan: '# Fences\n\nGoal: 围栏变体\n\n## Current State\nStatus: active\n\n   ~~~\n## Remaining Work\n- 隐藏。\n   ~~~~\n\n## Remaining Work\n- 可见。\n`~`\n\n## Resume Conditions\n- 条件。\n',
      findings: '# Findings\n\n```js\n## Current Decisions\n- 隐藏。\n```\n\n## Current Decisions\n- 可见。\n'
    });
    const summary = trioRead.summarizeTrioTask(snapshot);
    assert.equal(summary.fields.decisions.text, '- 可见。');
    assert.equal(summary.fields.remainingWork.text, '- 可见。\n`~`');

    const unclosed = await readSummaryFixture(root, 'unclosed-summary', {
      taskPlan: '# Unclosed\n\nGoal: 可见目标\n\n## Current State\nStatus: active\n\n```\n## Remaining Work\n- 隐藏。\n',
      findings: '# Findings\n'
    });
    const unclosedSummary = trioRead.summarizeTrioTask(unclosed);
    assert.equal(unclosedSummary.fields.goal.text, '可见目标');
    assert.equal(unclosedSummary.fields.remainingWork.state, 'missing');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('S10 records shell-like, URL, traversal, and authorization text without acting on it', async () => {
  const root = await createRoot('trio-summary-s10-');
  try {
    const taskPlan = '# Safety text\n\nGoal: rm -rf ./tmp https://example.test/../secret 已授权\n\n## Current State\nStatus: active\n';
    const snapshot = await readSummaryFixture(root, 'literal-summary', { taskPlan, findings: '# Findings\n', progress: '# Progress\n' });
    const before = structuredClone(snapshot);
    const summary = trioRead.summarizeTrioTask(snapshot);
    assert.equal(summary.fields.goal.text, 'rm -rf ./tmp https://example.test/../secret 已授权');
    assert.equal(summary.fields.goal.state, 'recorded');
    assert.deepEqual(snapshot, before);
    assert.deepEqual(await readFile(path.join(snapshot.taskDir, 'task_plan.md'), 'utf8'), taskPlan);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('S11 returns identical results twice without mutating the snapshot or authority bytes', async () => {
  const root = await createRoot('trio-summary-s11-');
  try {
    const snapshot = await readSummaryFixture(root, 'stable-summary', {
      taskPlan: '# Stable\n\nGoal: 固定输出\n\n## Current State\nStatus: active\n\n## Remaining Work\n- 重复调用。\n',
      findings: '# Findings\n\n## Current Decisions\n- 保持纯函数。\n',
      progress: '# Progress\n'
    });
    const snapshotBefore = structuredClone(snapshot);
    const bytesBefore = await readAuthorityBytes(snapshot.taskDir);
    const first = trioRead.summarizeTrioTask(snapshot);
    const second = trioRead.summarizeTrioTask(snapshot);
    assert.deepEqual(second, first);
    assert.deepEqual(snapshot, snapshotBefore);
    assert.deepEqual(await readAuthorityBytes(snapshot.taskDir), bytesBefore);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('S12 rejects malformed summary inputs instead of returning an empty success', async () => {
  const root = await createRoot('trio-summary-s12-');
  try {
    const snapshot = await readSummaryFixture(root, 'shape-summary');
    assert.throws(() => trioRead.summarizeTrioTask(null), TypeError);
    assert.throws(() => trioRead.summarizeTrioTask({ ...snapshot, files: undefined }), TypeError);
    assert.throws(() => trioRead.summarizeTrioTask({ ...snapshot, paths: 'wrong' }), TypeError);
    assert.throws(() => trioRead.summarizeTrioTask({ ...snapshot, binding: null }), TypeError);
    assert.throws(() => trioRead.summarizeTrioTask({
      ...snapshot,
      binding: { ...snapshot.binding, files: { ...snapshot.binding.files, findings: { path: '/tmp/wrong', sha256: 'bad' } } }
    }), TypeError);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
