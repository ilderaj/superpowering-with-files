import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import {
  assertInsideRoot,
  candidatePathForSource,
  loadUpstreamSources,
  stageGitCandidate,
  upstreamPathForSource
} from '../../harness/installer/lib/upstream.mjs';

const execFileAsync = promisify(execFile);

test('loadUpstreamSources reads configured upstream sources', async () => {
  const sources = await loadUpstreamSources(process.cwd());
  assert.equal(sources.superpowers.type, 'git');
  assert.equal(sources.superpowers.path, 'harness/upstream/superpowers');
  assert.equal(sources['planning-with-files'].type, 'local-initial-import');
});

test('upstream paths are constrained to harness/upstream', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'harness-upstream-'));
  try {
    await mkdir(path.join(root, 'harness/upstream'), { recursive: true });
    await mkdir(path.join(root, 'harness/upstream-candidates'), { recursive: true });
    await writeFile(
      path.join(root, 'harness/upstream/sources.json'),
      JSON.stringify({
        schemaVersion: 1,
        sources: {
          safe: { type: 'local-initial-import', path: 'harness/upstream/safe' },
          escape: { type: 'local-initial-import', path: 'harness/core/policy' }
        }
      })
    );

    const sources = await loadUpstreamSources(root);
    assert.equal(upstreamPathForSource(root, 'safe', sources.safe), path.join(root, 'harness/upstream/safe'));
    assert.throws(
      () => upstreamPathForSource(root, 'escape', sources.escape),
      /must stay inside harness\/upstream|outside allowed root/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('candidate paths are constrained to local harness state', () => {
  const root = '/repo';
  assert.equal(
    candidatePathForSource(root, 'superpowers'),
    path.join(root, '.harness/upstream-candidates/superpowers')
  );
  assert.throws(() => assertInsideRoot('/repo/harness/core', '/repo/harness/upstream'), /outside allowed root/);
});

test('stageGitCandidate clones a git source into local candidate state', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'harness-git-candidate-'));
  const upstreamRepo = await mkdtemp(path.join(os.tmpdir(), 'harness-git-source-'));
  try {
    await execFileAsync('git', ['init'], { cwd: upstreamRepo });
    await writeFile(path.join(upstreamRepo, 'SKILL.md'), '# Superpowers\n');
    await execFileAsync('git', ['add', 'SKILL.md'], { cwd: upstreamRepo });
    await execFileAsync(
      'git',
      ['-c', 'user.name=Harness Test', '-c', 'user.email=harness@example.invalid', 'commit', '-m', 'initial'],
      { cwd: upstreamRepo }
    );

    const candidate = await stageGitCandidate(root, 'superpowers', { url: upstreamRepo });
    assert.equal(candidate, path.join(root, '.harness/upstream-candidates/superpowers'));
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(upstreamRepo, { recursive: true, force: true });
  }
});
