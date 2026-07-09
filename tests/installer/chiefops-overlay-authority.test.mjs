import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { resolveAuthorityBinding } from '../../harness/runtime/chiefops-overlay/authority-binding.mjs';

async function task(root, taskId, title = taskId, extraProgress = '') {
  const dir = path.join(root, 'planning/active', taskId);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'task_plan.md'), `# ${title}\n\n## Current State\nStatus: active\n`);
  await writeFile(path.join(dir, 'findings.md'), '# Findings\n');
  await writeFile(path.join(dir, 'progress.md'), `# Progress\n${extraProgress}`);
}

test('resolveAuthorityBinding fails closed when multiple active tasks exist without explicit authority', async () => {
  const root = path.join(process.cwd(), 'tests/installer/.artifacts/chiefops-authority-multi');
  await rm(root, { recursive: true, force: true });
  await task(root, 'one');
  await task(root, 'two');

  await assert.rejects(
    resolveAuthorityBinding({ root, activeTaskIds: ['one', 'two'] }),
    /multiple active tasks.*explicit authority/i
  );
});

test('resolveAuthorityBinding verifies trio files before returning authority', async () => {
  const root = path.join(process.cwd(), 'tests/installer/.artifacts/chiefops-authority-ok');
  await rm(root, { recursive: true, force: true });
  await task(
    root,
    'chiefops-demo',
    'ChiefOps Demo',
    [
      'currentSlice: ChiefOps V0b overlay',
      'proofTarget: thread control overlay proof',
      'evidenceSink: planning/active/chiefops-demo/progress.md'
    ].join('\n')
  );

  const result = await resolveAuthorityBinding({
    root,
    authorityTaskId: 'chiefops-demo',
    planningRoot: root,
    activeTaskIds: ['chiefops-demo'],
    bindingPacket: {
      authorityTaskId: 'chiefops-demo',
      currentSlice: 'ChiefOps V0b overlay',
      proofTarget: 'thread control overlay proof',
      evidenceSink: 'planning/active/chiefops-demo/progress.md'
    }
  });

  assert.equal(result.authorityTaskId, 'chiefops-demo');
  assert.equal(result.status, 'verified_bound');
});

test('resolveAuthorityBinding rejects missing trio files', async () => {
  const root = path.join(process.cwd(), 'tests/installer/.artifacts/chiefops-authority-missing');
  await rm(root, { recursive: true, force: true });
  await mkdir(path.join(root, 'planning/active/chiefops-demo'), { recursive: true });
  await writeFile(path.join(root, 'planning/active/chiefops-demo/task_plan.md'), '# Demo\n');

  await assert.rejects(
    resolveAuthorityBinding({
      root,
      authorityTaskId: 'chiefops-demo',
      planningRoot: root,
      activeTaskIds: ['chiefops-demo']
    }),
    /missing authoritative trio files/
  );
});

test('resolveAuthorityBinding rejects explicit but wrong trio binding', async () => {
  const root = path.join(process.cwd(), 'tests/installer/.artifacts/chiefops-authority-wrong-trio');
  await rm(root, { recursive: true, force: true });
  await task(
    root,
    'billing-release',
    'Billing Release',
    [
      'currentSlice: billing release slice',
      'proofTarget: billing release proof',
      'evidenceSink: planning/active/billing-release/progress.md'
    ].join('\n')
  );

  await assert.rejects(
    resolveAuthorityBinding({
      root,
      authorityTaskId: 'billing-release',
      planningRoot: root,
      activeTaskIds: ['billing-release'],
      bindingPacket: {
        authorityTaskId: 'billing-release',
        currentSlice: 'ChiefOps V0b overlay',
        proofTarget: 'thread control overlay proof',
        evidenceSink: 'planning/active/chiefops-v0b/progress.md'
      }
    }),
    /binding does not match authoritative trio surface/
  );
});

