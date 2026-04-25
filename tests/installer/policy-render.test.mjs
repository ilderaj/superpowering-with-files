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

test('renderPolicyProfile supports include-based safety profiles', async () => {
  const rendered = await renderPolicyProfile(process.cwd(), 'safety');

  assert.match(rendered, /Hybrid Workflow Policy/);
  assert.match(rendered, /# Safety Policy/);
  assert.match(rendered, /Never run agents from HOME/);
  assert.match(rendered, /Companion Plan Model/);
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

test('project docs keep Codex and Copilot on shared .agents skill roots while preserving platform boundaries', async () => {
  const [readme, architecture, copilotInstall, codexInstall] = await Promise.all([
    readFile(path.join(process.cwd(), 'README.md'), 'utf8'),
    readFile(path.join(process.cwd(), 'docs/architecture.md'), 'utf8'),
    readFile(path.join(process.cwd(), 'docs/install/copilot.md'), 'utf8'),
    readFile(path.join(process.cwd(), 'docs/install/codex.md'), 'utf8')
  ]);

  assert.match(readme, /GitHub Copilot \| `\.agents\/skills` \| `~\/\.agents\/skills` \| materialized/);
  assert.match(readme, /Claude Code \| `\.claude\/skills` \| `~\/\.claude\/skills` \| materialized/);
  assert.match(readme, /Cursor \| `\.cursor\/skills` \| `~\/\.cursor\/skills` \| materialized/);
  assert.doesNotMatch(readme, /GitHub Copilot \| `\.github\/skills` \| `~\/\.copilot\/skills` \| materialized/);
  assert.match(architecture, /shared skill roots are limited to Codex and GitHub Copilot/i);
  assert.match(architecture, /`\.claude\/skills`/);
  assert.match(architecture, /`\.cursor\/skills`/);
  assert.match(architecture, /platform-native/);
  assert.doesNotMatch(architecture, /GitHub Copilot \| `\.github\/skills` \| `~\/\.copilot\/skills`/);
  assert.match(copilotInstall, /`\.agents\/skills`/);
  assert.match(copilotInstall, /`~\/\.agents\/skills`/);
  assert.match(copilotInstall, /tracked-task/);
  assert.doesNotMatch(copilotInstall, /\.github\/skills/);
  assert.doesNotMatch(copilotInstall, /~\/\.copilot\/skills/);
  assert.match(codexInstall, /`\.agents\/skills`/);
  assert.match(codexInstall, /`~\/\.agents\/skills`/);
});
