import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { sync } from '../../harness/installer/commands/sync.mjs';
import { writeState } from '../../harness/installer/lib/state.mjs';
import {
  createHarnessFixture,
  removeHarnessFixture,
  withCwd
} from '../helpers/harness-fixture.mjs';

test('sync projects workspace entries and skills', async () => {
  const root = await createHarnessFixture();
  try {
    await writeState(root, {
      schemaVersion: 1,
      scope: 'workspace',
      projectionMode: 'link',
      targets: {
        codex: { enabled: true, paths: [path.join(root, 'AGENTS.md')] },
        copilot: { enabled: true, paths: [path.join(root, '.github/copilot-instructions.md')] }
      },
      upstream: {}
    });

    await withCwd(root, () => sync([]));

    assert.match(await readFile(path.join(root, 'AGENTS.md'), 'utf8'), /Harness Policy For Codex/);
    assert.equal((await lstat(path.join(root, '.agents/skills/using-superpowers'))).isDirectory(), true);
    assert.match(
      await readFile(path.join(root, '.agents/skills/using-superpowers/SKILL.md'), 'utf8'),
      /name: using-superpowers/
    );

    const copilotPlanning = await readFile(path.join(root, '.github/skills/planning-with-files/SKILL.md'), 'utf8');
    assert.match(copilotPlanning, /Harness Copilot planning-with-files patch/);
    assert.match(copilotPlanning, /tracked tasks/);
    assert.match(copilotPlanning, /Tool-call count is only a hint/);

    const writingPlans = await readFile(path.join(root, '.agents/skills/writing-plans/SKILL.md'), 'utf8');
    assert.match(writingPlans, /Harness Superpowers writing-plans location patch/);
    assert.match(writingPlans, /planning\/active\/<task-id>\/` as the primary task-memory location/);
    assert.match(writingPlans, /\*\*Save durable task state to:\*\* `planning\/active\/<task-id>\/task_plan\.md`/);
    assert.match(writingPlans, /For Deep-reasoning tasks, you may additionally create a companion plan/);
    assert.match(writingPlans, /secondary artifact for reasoning and review, not the primary task-memory record/);
    assert.match(writingPlans, /write its path, a short summary, and the current sync-back status/);
    assert.doesNotMatch(writingPlans, /\*\*Save plans to:\*\* `docs\/superpowers\/plans/);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('sync rejects non-owned skill target by default', async () => {
  const root = await createHarnessFixture();
  try {
    await writeState(root, {
      schemaVersion: 1,
      scope: 'workspace',
      projectionMode: 'link',
      targets: {
        copilot: { enabled: true, paths: [path.join(root, '.github/copilot-instructions.md')] }
      },
      upstream: {}
    });
    await mkdir(path.join(root, '.github/skills'), { recursive: true });
    await writeFile(path.join(root, '.github/skills/planning-with-files'), 'user file');

    await assert.rejects(withCwd(root, () => sync([])), /Refusing to overwrite non-Harness-owned path/);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('sync backs up non-owned skill target when requested', async () => {
  const root = await createHarnessFixture();
  try {
    await writeState(root, {
      schemaVersion: 1,
      scope: 'workspace',
      projectionMode: 'link',
      targets: {
        copilot: { enabled: true, paths: [path.join(root, '.github/copilot-instructions.md')] }
      },
      upstream: {}
    });
    await mkdir(path.join(root, '.github/skills'), { recursive: true });
    await writeFile(path.join(root, '.github/skills/planning-with-files'), 'user file');

    await withCwd(root, () => sync(['--conflict=backup']));

    const skill = await readFile(path.join(root, '.github/skills/planning-with-files/SKILL.md'), 'utf8');
    assert.match(skill, /Harness Copilot planning-with-files patch/);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('sync refreshes materialized Copilot skill after upstream changes', async () => {
  const root = await createHarnessFixture();
  try {
    await writeState(root, {
      schemaVersion: 1,
      scope: 'workspace',
      projectionMode: 'link',
      targets: {
        copilot: { enabled: true, paths: [path.join(root, '.github/copilot-instructions.md')] }
      },
      upstream: {}
    });

    await withCwd(root, () => sync([]));
    await writeFile(
      path.join(root, 'harness/upstream/planning-with-files/UPSTREAM_REFRESH_MARKER.md'),
      'refreshed baseline'
    );
    await withCwd(root, () => sync([]));

    assert.equal(
      await readFile(path.join(root, '.github/skills/planning-with-files/UPSTREAM_REFRESH_MARKER.md'), 'utf8'),
      'refreshed baseline'
    );
  } finally {
    await removeHarnessFixture(root);
  }
});

test('sync refreshes materialized Codex collection skill after upstream changes', async () => {
  const root = await createHarnessFixture();
  try {
    await writeState(root, {
      schemaVersion: 1,
      scope: 'workspace',
      projectionMode: 'link',
      targets: {
        codex: { enabled: true, paths: [path.join(root, 'AGENTS.md')] }
      },
      upstream: {}
    });

    await withCwd(root, () => sync([]));
    await writeFile(
      path.join(root, 'harness/upstream/superpowers/skills/using-superpowers/UPSTREAM_REFRESH_MARKER.md'),
      'refreshed baseline'
    );
    await withCwd(root, () => sync([]));

    assert.equal(
      await readFile(path.join(root, '.agents/skills/using-superpowers/UPSTREAM_REFRESH_MARKER.md'), 'utf8'),
      'refreshed baseline'
    );
  } finally {
    await removeHarnessFixture(root);
  }
});
