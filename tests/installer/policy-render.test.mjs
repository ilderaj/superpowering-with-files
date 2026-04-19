import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { renderEntry } from '../../harness/installer/lib/adapters.mjs';
import { renderPolicyProfile } from '../../harness/installer/lib/policy-render.mjs';

test('each declared policy profile renders independently', async () => {
  const rootDir = process.cwd();

  const alwaysOnCore = await renderPolicyProfile(rootDir, 'always-on-core');
  const trackedTaskExtended = await renderPolicyProfile(rootDir, 'tracked-task-extended');
  const deepReasoningReference = await renderPolicyProfile(rootDir, 'deep-reasoning-reference');

  assert.match(alwaysOnCore, /Rule Precedence/);
  assert.match(trackedTaskExtended, /Planning-With-Files Lifecycle Rule/);
  assert.match(deepReasoningReference, /Companion Plan Model/);
});

test('renderEntry accepts a policy profile override', async () => {
  const rendered = await renderEntry(process.cwd(), 'codex', ['tracked-task-extended']);

  assert.match(rendered, /Complex Task Orchestration/);
  assert.doesNotMatch(rendered, /Task Classification/);
});

test('renderPolicyProfile does not split on code fences that contain section-like headings', async () => {
  const rendered = await renderPolicyProfile(process.cwd(), 'tracked-task-extended');
  const currentStateMatches = rendered.match(/## Current State/g) ?? [];

  assert.match(rendered, /```md[\s\S]*## Current State[\s\S]*```/);
  assert.equal(currentStateMatches.length, 1);
  assert.match(rendered, /Planning-With-Files Lifecycle Rule/);
  assert.match(rendered, /Complex Task Orchestration/);
});

test('renderPolicyProfile fails clearly when a profile references a missing section', async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), 'policy-render-'));
  await mkdir(path.join(rootDir, 'harness/core/policy'), { recursive: true });
  await writeFile(
    path.join(rootDir, 'harness/core/policy/base.md'),
    await readFile(path.join(process.cwd(), 'harness/core/policy/base.md'), 'utf8')
  );

  const entryProfiles = JSON.parse(
    await readFile(path.join(process.cwd(), 'harness/core/policy/entry-profiles.json'), 'utf8')
  );
  entryProfiles.profiles['broken-profile'] = ['Missing Heading'];

  await writeFile(
    path.join(rootDir, 'harness/core/policy/entry-profiles.json'),
    `${JSON.stringify(entryProfiles, null, 2)}\n`
  );

  await assert.rejects(
    () => renderPolicyProfile(rootDir, 'broken-profile'),
    /references missing sections: Missing Heading/
  );
});
