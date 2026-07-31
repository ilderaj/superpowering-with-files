import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import {
  findExactRetiredSkillProjections,
  isExactRetiredSkillProjection,
  retiredSkillTombstoneDigests
} from '../../harness/installer/lib/retired-skill-tombstone.mjs';

const publishedDigests = [
  'sha256:1e5b31c0287eda57c11037a2cc7ebd9acec4f72cedff022fbd1921bbede7356c',
  'sha256:2d7dafd03cc1410f260ddf33bd6ac05aba01c6e6189ca10fcedfbf45a06f87f8',
  'sha256:d6c16e03ff726810b43dde8d7972d9355af582967111f0781c523c8e2448d9de'
];

test('retired tombstone accepts only the exact published projection digest', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'retired-skill-tombstone-'));
  const target = path.join(root, 'second-opinion-advisory');
  try {
    await mkdir(target, { recursive: true });
    assert.deepEqual(
      [...retiredSkillTombstoneDigests.get('second-opinion-advisory')].sort(),
      publishedDigests
    );
    assert.equal(
      await isExactRetiredSkillProjection(target, { digestTarget: async () => publishedDigests[0] }),
      true
    );
    assert.equal(
      await isExactRetiredSkillProjection(target, { digestTarget: async () => 'sha256:modified' }),
      false
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('retired tombstone discovery scans only declared skill roots', async () => {
  const root = '/repo';
  const home = '/home/user';
  const matches = await findExactRetiredSkillProjections({
    rootDir: root,
    homeDir: home,
    scope: 'user-global',
    targets: ['codex'],
    isRetiredProjection: async (targetPath) => targetPath === '/home/user/.agents/skills/second-opinion-advisory'
  });

  assert.deepEqual(matches, ['/home/user/.agents/skills/second-opinion-advisory']);
});
