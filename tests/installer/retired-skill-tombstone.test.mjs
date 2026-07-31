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

const publishedDigest = 'sha256:2d7dafd03cc1410f260ddf33bd6ac05aba01c6e6189ca10fcedfbf45a06f87f8';

test('retired tombstone accepts only the exact published projection digest', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'retired-skill-tombstone-'));
  const target = path.join(root, 'second-opinion-advisory');
  try {
    await mkdir(target, { recursive: true });
    assert.equal(retiredSkillTombstoneDigests.get('second-opinion-advisory').has(publishedDigest), true);
    assert.equal(
      await isExactRetiredSkillProjection(target, { digestTarget: async () => publishedDigest }),
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
