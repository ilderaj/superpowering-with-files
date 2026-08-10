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
  loadResolvedSourceForFetch,
  loadUpstreamSources,
  stageGitCandidate,
  upstreamPathForSource
} from '../../harness/installer/lib/upstream.mjs';
import { loadSourceLock } from '../../harness/installer/lib/upstream-config.mjs';

const execFileAsync = promisify(execFile);

test('loadUpstreamSources exposes exactly the planning-with-files source', async () => {
  const sources = await loadUpstreamSources(process.cwd());
  assert.deepEqual(Object.keys(sources), ['planning-with-files']);
  assert.equal(sources['planning-with-files'].type, 'git');
  assert.equal(sources['planning-with-files'].url, 'https://github.com/OthmanAdi/planning-with-files');
  assert.equal(sources['planning-with-files'].path, 'harness/upstream/planning-with-files');
  assert.equal(sources['planning-with-files'].overlayPath, 'harness/core/upstream-overlays/planning-with-files');
  assert.equal(sources['planning-with-files'].resolution.strategy, 'latest-release');
});

test('source lock contains exactly the planning-with-files entry', async () => {
  const lock = await loadSourceLock({ rootDir: process.cwd() });
  assert.deepEqual(Object.keys(lock.sources), ['planning-with-files']);
  assert.equal(lock.sources['planning-with-files'].resolved.kind, 'latest-release');
  assert.equal(typeof lock.sources['planning-with-files'].resolved.commitSha, 'string');
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
    candidatePathForSource(root, 'planning-with-files'),
    path.join(root, '.harness/upstream-candidates/planning-with-files')
  );
  assert.throws(() => assertInsideRoot('/repo/harness/core', '/repo/harness/upstream'), /outside allowed root/);
});

test('stageGitCandidate clones a git source into local candidate state', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'harness-git-candidate-'));
  const upstreamRepo = await mkdtemp(path.join(os.tmpdir(), 'harness-git-source-'));
  try {
    await execFileAsync('git', ['init'], { cwd: upstreamRepo });
    await writeFile(path.join(upstreamRepo, 'SKILL.md'), '# Planning With Files\n');
    await execFileAsync('git', ['add', 'SKILL.md'], { cwd: upstreamRepo });
    await execFileAsync(
      'git',
      ['-c', 'user.name=Harness Test', '-c', 'user.email=harness@example.invalid', 'commit', '-m', 'initial'],
      { cwd: upstreamRepo }
    );

    const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: upstreamRepo });
    const candidate = await stageGitCandidate(
      root,
      'planning-with-files',
      { url: upstreamRepo },
      {
        resolved: {
          ref: 'HEAD',
          commitSha: stdout.trim()
        }
      }
    );
    assert.equal(candidate, path.join(root, '.harness/upstream-candidates/planning-with-files'));
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(upstreamRepo, { recursive: true, force: true });
  }
});

test('loadResolvedSourceForFetch reads the authoritative source lock entry', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'harness-source-lock-'));
  try {
    await mkdir(path.join(root, 'harness/upstream'), { recursive: true });
    await writeFile(
      path.join(root, 'harness/upstream/sources.json'),
      JSON.stringify({
        schemaVersion: 2,
        sources: {
          'planning-with-files': {
            type: 'git',
            url: 'https://example.invalid/planning-with-files.git',
            github: { owner: 'fixture', repo: 'planning-with-files' },
            path: 'harness/upstream/planning-with-files',
            resolution: {
              strategy: 'latest-release',
              allowPrerelease: false,
              fallbacks: []
            }
          }
        }
      })
    );
    await writeFile(
      path.join(root, 'harness/upstream/.source-lock.json'),
      JSON.stringify({
        schemaVersion: 2,
        refreshedAt: '2026-07-04T00:00:00.000Z',
        sources: {
          'planning-with-files': {
            name: 'planning-with-files',
            strategy: 'latest-release',
            fallbackUsed: false,
            refreshedAt: '2026-07-04T00:00:00.000Z',
            resolved: {
              kind: 'latest-release',
              version: 'v3.9.0',
              ref: 'refs/tags/v3.9.0',
              commitSha: '0e2b00ce4e8d1789cbcb16a41f7c9510b212b942'
            }
          }
        }
      })
    );

    const { source, resolvedSource } = await loadResolvedSourceForFetch(root, 'planning-with-files');
    assert.equal(source.resolution.strategy, 'latest-release');
    assert.equal(resolvedSource.resolved.version, 'v3.9.0');
    assert.equal(resolvedSource.resolved.ref, 'refs/tags/v3.9.0');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('loadResolvedSourceForFetch does not direct callers to the retired upstream-lock command', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'harness-missing-source-lock-'));
  try {
    await mkdir(path.join(root, 'harness/upstream'), { recursive: true });
    await writeFile(
      path.join(root, 'harness/upstream/sources.json'),
      JSON.stringify({
        schemaVersion: 2,
        sources: {
          'planning-with-files': {
            type: 'git',
            url: 'https://example.invalid/planning-with-files.git',
            github: { owner: 'fixture', repo: 'planning-with-files' },
            path: 'harness/upstream/planning-with-files',
            resolution: {
              strategy: 'latest-release',
              allowPrerelease: false,
              fallbacks: []
            }
          }
        }
      })
    );

    await assert.rejects(loadResolvedSourceForFetch(root, 'planning-with-files'), (error) => {
      assert.match(error.message, /Missing resolved source lock for planning-with-files\./);
      assert.doesNotMatch(error.message, /upstream-lock/);
      return true;
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
