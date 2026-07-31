import { lstat } from 'node:fs/promises';
import path from 'node:path';
import { digestTarget } from './backup-archive.mjs';
import { resolveSkillRoots } from './paths.mjs';

const RETIRED_SKILL_TOMBSTONE_DIGESTS = new Map([
  ['second-opinion-advisory', new Set([
    'sha256:1e5b31c0287eda57c11037a2cc7ebd9acec4f72cedff022fbd1921bbede7356c',
    'sha256:2d7dafd03cc1410f260ddf33bd6ac05aba01c6e6189ca10fcedfbf45a06f87f8',
    'sha256:d6c16e03ff726810b43dde8d7972d9355af582967111f0781c523c8e2448d9de'
  ])]
]);

async function isDirectory(targetPath) {
  try {
    const stat = await lstat(targetPath);
    return stat.isDirectory() && !stat.isSymbolicLink();
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

export async function isExactRetiredSkillProjection(targetPath, options = {}) {
  const expectedDigests = RETIRED_SKILL_TOMBSTONE_DIGESTS.get(path.basename(targetPath));
  if (!expectedDigests || !(await isDirectory(targetPath))) return false;
  const digest = await (options.digestTarget ?? digestTarget)(targetPath);
  return expectedDigests.has(digest);
}

export async function findExactRetiredSkillProjections({
  rootDir,
  homeDir,
  scope,
  targets,
  deploymentProfile = 'standard',
  isRetiredProjection = isExactRetiredSkillProjection
}) {
  const candidates = new Set();
  for (const target of targets) {
    for (const skillRoot of resolveSkillRoots(rootDir, homeDir, scope, target, deploymentProfile)) {
      for (const skillName of RETIRED_SKILL_TOMBSTONE_DIGESTS.keys()) {
        candidates.add(path.join(skillRoot, skillName));
      }
    }
  }

  const matches = [];
  for (const targetPath of [...candidates].sort((left, right) => left.localeCompare(right))) {
    if (await isRetiredProjection(targetPath)) matches.push(targetPath);
  }
  return matches;
}

export const retiredSkillTombstoneDigests = RETIRED_SKILL_TOMBSTONE_DIGESTS;
