import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { buildAll } from '../../packages/plugin-kit/src/build-all.mjs';

const execFileAsync = promisify(execFile);

const VERSION = '1.1.0';
const COMPANION_SKILLS = Object.freeze(['grill-me', 'grilling', 'to-questionnaire']);
const EXPECTED_RELEASE_ARTIFACTS = Object.freeze([
  'harness-codex-plugin-1.1.0.tgz',
  'harness-agent-plugins-1.1.0.tgz',
  'harness-matt-skills-codex-plugin-1.1.0.tgz',
  'harness-matt-skills-agent-plugins-1.1.0.tgz',
]);
const CORE_ARTIFACTS = Object.freeze(['harness-codex-plugin-1.1.0.tgz', 'harness-agent-plugins-1.1.0.tgz']);
const COMPANION_ARTIFACTS = Object.freeze([
  'harness-matt-skills-codex-plugin-1.1.0.tgz',
  'harness-matt-skills-agent-plugins-1.1.0.tgz',
]);
const NATIVE_COMPANION_ENTRIES = Object.freeze([
  '.codex-plugin/plugin.json',
  'README.md',
  'LICENSE',
  'UPSTREAM.json',
  'skills/grill-me/SKILL.md',
  'skills/grilling/SKILL.md',
  'skills/to-questionnaire/SKILL.md',
]);
const PORTABLE_COMPANION_ENTRIES = Object.freeze([
  'plugin.json',
  'README.md',
  'LICENSE',
  'UPSTREAM.json',
  'skills/grill-me/SKILL.md',
  'skills/grilling/SKILL.md',
  'skills/to-questionnaire/SKILL.md',
]);

let releaseDir;

before(async () => {
  const workDir = await mkdtemp(path.join(os.tmpdir(), 'matt-skills-companion-'));
  const { releaseOut } = await buildAll({ version: VERSION, release: true, outDir: path.join(workDir, 'release') });
  releaseDir = releaseOut;
});

async function tarEntries(name) {
  const { stdout } = await execFileAsync('tar', ['-tzf', path.join(releaseDir, name)]);
  return stdout
    .split('\n')
    .map((entry) => entry.replace(/^\.\//, '').replace(/\/$/, ''))
    .filter(Boolean);
}

test('release artifacts are exactly the four 1.1.0 tarballs', async () => {
  const tarballs = (await readdir(releaseDir)).filter((name) => name.endsWith('.tgz'));
  assert.deepEqual([...tarballs].sort(), [...EXPECTED_RELEASE_ARTIFACTS].sort());
});

test('original core archives carry no companion skill paths', async () => {
  for (const name of CORE_ARTIFACTS) {
    const entries = await tarEntries(name);
    for (const skill of COMPANION_SKILLS) {
      assert.ok(!entries.some((entry) => entry.includes(skill)), `${name} leaks ${skill}`);
    }
  }
});

test('native companion archive contains exactly the approved native surface', async () => {
  const entries = await tarEntries(COMPANION_ARTIFACTS[0]);
  assert.deepEqual(new Set(entries), new Set(NATIVE_COMPANION_ENTRIES));
});

test('portable companion archive contains exactly the approved flat surface', async () => {
  const entries = await tarEntries(COMPANION_ARTIFACTS[1]);
  assert.deepEqual(new Set(entries), new Set(PORTABLE_COMPANION_ENTRIES));
});

test('companion archives exclude trio, hooks, mcp, runtime, credential paths', async () => {
  for (const name of COMPANION_ARTIFACTS) {
    for (const entry of await tarEntries(name)) {
      assert.doesNotMatch(entry, /(^|\/)(trio|hooks|mcp|runtime|credential)s?(\/|$)/i, `${name}: ${entry}`);
    }
  }
});
