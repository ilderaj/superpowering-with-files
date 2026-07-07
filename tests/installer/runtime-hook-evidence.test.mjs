import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  readRuntimeHookEvidence,
  runtimeEvidenceLogPath,
  summarizeRuntimeEvidenceForProjection,
  writeRuntimeHookEvidence
} from '../../harness/installer/lib/runtime-hook-evidence.mjs';
import { createHarnessFixture, removeHarnessFixture } from '../helpers/harness-fixture.mjs';

test('readRuntimeHookEvidence reads valid Claude Code runtime trace lines', async () => {
  const root = await createHarnessFixture();
  try {
    const logPath = runtimeEvidenceLogPath(root, 'claude-code');
    await mkdir(path.dirname(logPath), { recursive: true });
    await writeFile(
      logPath,
      `${JSON.stringify({
        schemaVersion: 1,
        source: 'harness-runtime-hook',
        target: 'claude-code',
        parentSkillName: 'planning-with-files',
        eventName: 'UserPromptSubmit',
        observedAt: '2026-05-28T02:02:21.000Z',
        projectRoot: root,
        cwd: root,
        scriptName: 'task-scoped-hook.sh',
        scriptPath: path.join(root, '.claude/hooks/task-scoped-hook.sh')
      })}\n`
    );

    const evidence = await readRuntimeHookEvidence(root, 'claude-code');

    assert.equal(evidence.records.length, 1);
    assert.equal(evidence.records[0].parentSkillName, 'planning-with-files');
    assert.equal(evidence.records[0].eventName, 'UserPromptSubmit');
    assert.deepEqual(evidence.warnings, []);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('readRuntimeHookEvidence preserves optional task-resolution metadata', async () => {
  const root = await createHarnessFixture();
  try {
    const logPath = runtimeEvidenceLogPath(root, 'codex');
    await mkdir(path.dirname(logPath), { recursive: true });
    await writeFile(
      logPath,
      `${JSON.stringify({
        schemaVersion: 1,
        source: 'harness-runtime-hook',
        target: 'codex',
        parentSkillName: 'planning-with-files',
        eventName: 'UserPromptSubmit',
        observedAt: '2026-07-04T14:45:00.000Z',
        projectRoot: root,
        cwd: root,
        scriptName: 'task-scoped-hook.sh',
        scriptPath: path.join(root, '.codex/hooks/task-scoped-hook.sh'),
        resolvedTaskId: 'beta-task',
        resolutionSource: 'thread-binding',
        activeTaskCount: 2,
        threadIdPresent: true
      })}\n`
    );

    const evidence = await readRuntimeHookEvidence(root, 'codex');

    assert.equal(evidence.records.length, 1);
    assert.equal(evidence.records[0].resolvedTaskId, 'beta-task');
    assert.equal(evidence.records[0].resolutionSource, 'thread-binding');
    assert.equal(evidence.records[0].activeTaskCount, 2);
    assert.equal(evidence.records[0].threadIdPresent, true);
    assert.deepEqual(evidence.warnings, []);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('readRuntimeHookEvidence ignores invalid lines and reports warnings', async () => {
  const root = await createHarnessFixture();
  try {
    const logPath = runtimeEvidenceLogPath(root, 'claude-code');
    await mkdir(path.dirname(logPath), { recursive: true });
    await writeFile(logPath, '{not-json}\n');

    const evidence = await readRuntimeHookEvidence(root, 'claude-code');

    assert.equal(evidence.records.length, 0);
    assert.equal(evidence.warnings.length, 1);
    assert.match(evidence.warnings[0], /invalid runtime hook evidence/i);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('summarizeRuntimeEvidenceForProjection keeps mismatched runtime evidence unmeasured', async () => {
  const root = await createHarnessFixture();
  try {
    const summary = summarizeRuntimeEvidenceForProjection(
      { target: 'claude-code', parentSkillName: 'planning-with-files', eventNames: ['UserPromptSubmit'] },
      {
        records: [
          {
            schemaVersion: 1,
            source: 'harness-runtime-hook',
            target: 'claude-code',
            parentSkillName: 'planning-with-files',
            eventName: 'Stop',
            observedAt: '2026-05-28T02:02:21.000Z',
            projectRoot: '/other/root',
            cwd: '/other/root',
            scriptName: 'task-scoped-hook.sh',
            scriptPath: '/other/root/.claude/hooks/task-scoped-hook.sh'
          }
        ],
        warnings: []
      },
      root
    );

    assert.equal(summary.runtimeEvidence, 'not-measured');
    assert.equal(summary.lastObservedAt, null);
    assert.deepEqual(summary.observedEvents, []);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('writeRuntimeHookEvidence appends Codex runtime traces in the expected log file', async () => {
  const root = await createHarnessFixture();
  try {
    await writeRuntimeHookEvidence(root, 'codex', {
      schemaVersion: 1,
      source: 'harness-runtime-hook',
      target: 'codex',
      parentSkillName: 'planning-with-files',
      eventName: 'SessionStart',
      observedAt: '2026-05-28T03:03:03.000Z',
      projectRoot: root,
      cwd: root,
      scriptName: 'task-scoped-hook.sh',
      scriptPath: path.join(root, '.codex/hooks/task-scoped-hook.sh'),
      resolvedTaskId: 'codex-hooks',
      resolutionSource: 'single-active-fallback',
      activeTaskCount: 1,
      threadIdPresent: true
    });

    const evidence = await readRuntimeHookEvidence(root, 'codex');

    assert.equal(evidence.records.length, 1);
    assert.equal(evidence.records[0].target, 'codex');
    assert.equal(evidence.records[0].parentSkillName, 'planning-with-files');
    assert.equal(evidence.records[0].resolvedTaskId, 'codex-hooks');
    assert.equal(evidence.records[0].resolutionSource, 'single-active-fallback');
    assert.equal(evidence.records[0].activeTaskCount, 1);
    assert.equal(evidence.records[0].threadIdPresent, true);
    assert.deepEqual(evidence.warnings, []);
  } finally {
    await removeHarnessFixture(root);
  }
});
