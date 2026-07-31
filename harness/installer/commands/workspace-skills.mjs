import { execFile } from 'node:child_process';
import { cp, lstat, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import {
  coalesceSkillProjections,
  listSkillCatalogProjections,
  loadSkillProfiles,
  planSkillProjections
} from '../lib/skill-projection.mjs';
import { digestTarget } from '../lib/backup-archive.mjs';
import { applySkillPatches } from '../lib/sync-apply.mjs';
import { discoverAuthorityRoot } from '../../runtime/authority-root.mjs';
import { materializeDirectoryProjection } from '../lib/fs-ops.mjs';
import { normalizeRetiredSkillProfile } from '../lib/state.mjs';
import {
  createProjectionManifest,
  ownedTargetSet,
  readProjectionManifest,
  writeProjectionManifest
} from '../lib/projection-manifest.mjs';

const WORKSPACE_PROFILE_RELATIVE_PATH = 'harness/workspace-skill-profile.json';
const WORKSPACE_MANIFEST_RELATIVE_PATH = '.harness/workspace-skill-projections.json';
const SUPPORTED_TARGETS = new Set(['codex', 'claude-code']);
const RETIRED_WORKSPACE_SKILL_TOMBSTONES = new Map([
  ['second-opinion-advisory', {
    requiredMarkers: [
      'name: second-opinion-advisory',
      '# Second-Opinion Advisory',
      '## Outcome Contract',
      '## Common Mistakes'
    ]
  }]
]);
const execFileAsync = promisify(execFile);

export function workspaceSkillProfilePath(rootDir) {
  return path.join(rootDir, WORKSPACE_PROFILE_RELATIVE_PATH);
}

export function workspaceProjectionManifestPath(rootDir) {
  return path.join(rootDir, WORKSPACE_MANIFEST_RELATIVE_PATH);
}

function validateWorkspaceSkillProfile(profile) {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
    throw new TypeError('Workspace skill profile must be a JSON object.');
  }
  if (profile.schemaVersion !== 1) {
    throw new TypeError('Workspace skill profile schemaVersion must be 1.');
  }
  if (typeof profile.skillProfile !== 'string' || !profile.skillProfile) {
    throw new TypeError('Workspace skill profile skillProfile must be a string.');
  }
  if (profile.deploymentProfile !== 'standard') {
    throw new TypeError('Workspace skill profile deploymentProfile must be standard.');
  }
  if (profile.projectionMode !== 'portable') {
    throw new TypeError('Workspace skill profile projectionMode must be portable.');
  }
  if (!Array.isArray(profile.targets) || profile.targets.length === 0) {
    throw new TypeError('Workspace skill profile targets must be a non-empty array.');
  }
  for (const target of profile.targets) {
    if (!SUPPORTED_TARGETS.has(target)) {
      throw new TypeError(`Workspace skill profile target must be codex or claude-code: ${target}`);
    }
  }
  return profile;
}

export async function readWorkspaceSkillProfile(rootDir) {
  const profile = JSON.parse(await readFile(workspaceSkillProfilePath(rootDir), 'utf8'));
  return validateWorkspaceSkillProfile({
    ...profile,
    skillProfile: normalizeRetiredSkillProfile(profile.skillProfile, 'workspace')
  });
}

export async function planWorkspaceSkills({ rootDir, profile }) {
  const effectiveProfile = validateWorkspaceSkillProfile(profile ?? await readWorkspaceSkillProfile(rootDir));
  const profiles = await loadSkillProfiles(rootDir);
  if (!profiles.profiles[effectiveProfile.skillProfile]) {
    throw new Error(`Unknown workspace skill profile: ${effectiveProfile.skillProfile}`);
  }

  const rawSkillWrites = [];
  for (const target of effectiveProfile.targets) {
    rawSkillWrites.push(...await planSkillProjections({
      rootDir,
      homeDir: rootDir,
      scope: 'workspace',
      target,
      skillProfile: effectiveProfile.skillProfile,
      deploymentProfile: effectiveProfile.deploymentProfile
    }));
  }

  return {
    targets: [...effectiveProfile.targets],
    entryWrites: [],
    skillWrites: coalesceSkillProjections(rawSkillWrites),
    hookWrites: [],
    managedWrites: []
  };
}

async function statOrNull(targetPath) {
  try {
    return await lstat(targetPath);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

function allowedWorkspaceSkillRoots(rootDir) {
  return new Set([
    path.resolve(rootDir, '.agents/skills'),
    path.resolve(rootDir, '.claude/skills')
  ]);
}

async function assertWorkspaceSkillRoot(rootDir, declaredRoot) {
  const resolvedRoot = path.resolve(declaredRoot);
  if (!allowedWorkspaceSkillRoots(rootDir).has(resolvedRoot)) {
    throw new Error(`Workspace skill root is not declared: ${declaredRoot}`);
  }
  const relativeRoot = path.relative(rootDir, resolvedRoot);
  let cursor = path.resolve(rootDir);
  for (const segment of relativeRoot.split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, segment);
    const cursorStat = await statOrNull(cursor);
    if (!cursorStat) break;
    if (cursorStat.isSymbolicLink() || !cursorStat.isDirectory()) {
      throw new Error(`Workspace skill root contains a symlink or non-directory ancestor: ${cursor}`);
    }
  }
}

async function assertWorkspaceProjectionTarget(rootDir, targetPath) {
  const resolved = path.resolve(targetPath);
  const declaredRoot = path.dirname(resolved);
  if (!allowedWorkspaceSkillRoots(rootDir).has(declaredRoot)) {
    throw new Error(`Workspace skill target escapes declared skill roots: ${targetPath}`);
  }
  await assertWorkspaceSkillRoot(rootDir, declaredRoot);
}

async function containsSymlink(directoryPath) {
  const entries = await readdir(directoryPath, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(directoryPath, entry.name);
    const entryStat = await lstat(entryPath);
    if (entryStat.isSymbolicLink()) return true;
    if (entryStat.isDirectory() && await containsSymlink(entryPath)) return true;
  }
  return false;
}

async function isRetiredWorkspaceProjection(targetPath) {
  const tombstone = RETIRED_WORKSPACE_SKILL_TOMBSTONES.get(path.basename(targetPath));
  if (!tombstone) return false;

  const targetStat = await statOrNull(targetPath);
  if (!targetStat?.isDirectory() || targetStat.isSymbolicLink() || await containsSymlink(targetPath)) {
    return false;
  }

  let skillContents;
  try {
    skillContents = await readFile(path.join(targetPath, 'SKILL.md'), 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
  return tombstone.requiredMarkers.every((marker) => skillContents.includes(marker));
}

async function renderedProjectionDigest(projection) {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'harness-workspace-skill-'));
  const targetPath = path.join(temporaryRoot, projection.skillName);
  try {
    await cp(projection.sourcePath, targetPath, { recursive: true });
    await applySkillPatches({ ...projection, targetPath });
    return await digestTarget(targetPath);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

async function knownWorkspaceCatalog({ rootDir, plan }) {
  const known = new Map();
  for (const target of SUPPORTED_TARGETS) {
    const projections = await listSkillCatalogProjections({
      rootDir,
      homeDir: rootDir,
      scope: 'workspace',
      target,
      deploymentProfile: 'standard'
    });
    for (const projection of projections) {
      const targetPath = path.resolve(projection.targetPath);
      const entries = known.get(targetPath) ?? [];
      entries.push(projection);
      known.set(targetPath, entries);
    }
  }
  return known;
}

async function manifestOwnedStaleTargets({ rootDir, currentManifest, plan }) {
  const desiredTargets = new Set(plan.skillWrites.map((projection) => path.resolve(projection.targetPath)));
  const staleTargets = [];
  for (const targetPath of ownedTargetSet(currentManifest)) {
    if (desiredTargets.has(targetPath)) continue;
    await assertWorkspaceProjectionTarget(rootDir, targetPath);
    staleTargets.push(targetPath);
  }
  return staleTargets.sort();
}

export async function checkWorkspaceSkills({ rootDir, plan }) {
  const missing = [];
  const contentDrift = [];
  const desiredPaths = new Set();

  for (const projection of plan.skillWrites) {
    await assertWorkspaceProjectionTarget(rootDir, projection.targetPath);
  }

  for (const projection of plan.skillWrites) {
    const targetPath = path.resolve(projection.targetPath);
    desiredPaths.add(targetPath);
    const targetStat = await statOrNull(targetPath);
    if (!targetStat) {
      missing.push(targetPath);
      continue;
    }
    if (targetStat.isSymbolicLink() || !targetStat.isDirectory()) {
      contentDrift.push(targetPath);
      continue;
    }
    const [expectedDigest, actualDigest] = await Promise.all([
      renderedProjectionDigest(projection),
      digestTarget(targetPath)
    ]);
    if (expectedDigest !== actualDigest) {
      contentDrift.push(targetPath);
    }
  }

  const knownCatalog = await knownWorkspaceCatalog({ rootDir, plan });
  const extraKnown = [];
  const unknownPreserved = [];
  const roots = [...allowedWorkspaceSkillRoots(rootDir)];
  for (const root of roots) {
    await assertWorkspaceSkillRoot(rootDir, root);
    let entries;
    try {
      entries = await readdir(root, { withFileTypes: true });
    } catch (error) {
      if (error?.code === 'ENOENT') continue;
      throw error;
    }
    for (const entry of entries) {
      const targetPath = path.resolve(root, entry.name);
      if (desiredPaths.has(targetPath)) continue;
      if (knownCatalog.has(targetPath) || await isRetiredWorkspaceProjection(targetPath)) {
        extraKnown.push(targetPath);
      } else {
        unknownPreserved.push(targetPath);
      }
    }
  }

  missing.sort();
  contentDrift.sort();
  extraKnown.sort();
  unknownPreserved.sort();
  return {
    ok: missing.length === 0 && contentDrift.length === 0 && extraKnown.length === 0,
    missing,
    contentDrift,
    extraKnown,
    unknownPreserved
  };
}

async function gitTrackedBootstrapEligible(rootDir, targetPath, candidate) {
  const relative = path.relative(rootDir, targetPath);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return false;
  try {
    const [{ stdout: tracked }, { stdout: staged }, { stdout: status }, { stdout: indexedSkill }] = await Promise.all([
      execFileAsync('git', ['ls-files', '-z', '--', relative], { cwd: rootDir, encoding: 'utf8' }),
      execFileAsync('git', ['ls-files', '-s', '-z', '--', relative], { cwd: rootDir, encoding: 'utf8' }),
      execFileAsync('git', ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--', relative], {
        cwd: rootDir,
        encoding: 'utf8'
      }),
      execFileAsync('git', ['show', `:${path.posix.join(relative.split(path.sep).join('/'), 'SKILL.md')}`], {
        cwd: rootDir,
        encoding: 'utf8'
      })
    ]);
    if (!tracked) return false;
    if (staged.split('\0').filter(Boolean).some((record) => record.startsWith('120000 '))) return false;
    const indexedName = indexedSkill.match(/^name:\s*(.+?)\s*$/m)?.[1]?.replace(/^['"]|['"]$/g, '');
    if (indexedName !== candidate.skillName) return false;
    const records = status.split('\0').filter(Boolean);
    return records.every((record) => record.startsWith(' D ') || record.startsWith('D  '));
  } catch {
    return false;
  }
}

async function eligibleForTakeover(rootDir, targetPath, candidates) {
  if (candidates.length !== 1) return false;
  const targetStat = await statOrNull(targetPath);
  if (!targetStat?.isDirectory() || targetStat.isSymbolicLink()) return false;
  if (await containsSymlink(targetPath)) return false;
  const actualDigest = await digestTarget(targetPath);
  const candidate = candidates[0];
  const acceptedDigests = new Set([
    await digestTarget(candidate.sourcePath),
    await renderedProjectionDigest(candidate)
  ]);
  return acceptedDigests.has(actualDigest) || await gitTrackedBootstrapEligible(rootDir, targetPath, candidate);
}

export async function classifyWorkspaceSkillPlan({ rootDir, plan }) {
  const currentManifest = await readProjectionManifest(rootDir, {
    relativePath: WORKSPACE_MANIFEST_RELATIVE_PATH
  });
  const manifestStaleTargets = await manifestOwnedStaleTargets({ rootDir, currentManifest, plan });
  const manifestStaleSet = new Set(manifestStaleTargets);
  const check = await checkWorkspaceSkills({ rootDir, plan });
  const knownCatalog = await knownWorkspaceCatalog({ rootDir, plan });
  const replace = [...check.missing];
  const prune = [...manifestStaleTargets];
  const refuse = [];
  for (const targetPath of check.extraKnown) {
    if (await isRetiredWorkspaceProjection(targetPath)) {
      prune.push(targetPath);
      continue;
    }
    if (await eligibleForTakeover(rootDir, targetPath, knownCatalog.get(path.resolve(targetPath)) ?? [])) {
      prune.push(targetPath);
    } else {
      refuse.push(targetPath);
    }
  }
  for (const targetPath of check.contentDrift) {
    const desired = plan.skillWrites.filter((projection) => path.resolve(projection.targetPath) === path.resolve(targetPath));
    if (await eligibleForTakeover(rootDir, targetPath, desired)) replace.push(targetPath);
    else refuse.push(targetPath);
  }
  return {
    replace: [...new Set(replace)].sort(),
    prune: [...new Set(prune)].sort(),
    preserve: check.unknownPreserved.filter((targetPath) => !manifestStaleSet.has(path.resolve(targetPath))),
    refuse: [...new Set(refuse)].sort()
  };
}

export async function applyWorkspaceSkills({ rootDir, plan, takeover = false }) {
  const manifestOptions = { relativePath: WORKSPACE_MANIFEST_RELATIVE_PATH };
  const currentManifest = await readProjectionManifest(rootDir, manifestOptions);
  const ownedTargets = ownedTargetSet(currentManifest);
  const nextEntries = [];
  for (const projection of plan.skillWrites) {
    await assertWorkspaceProjectionTarget(rootDir, projection.targetPath);
  }
  const preflight = await checkWorkspaceSkills({ rootDir, plan });
  const knownCatalog = await knownWorkspaceCatalog({ rootDir, plan });
  const staleTargets = new Set(await manifestOwnedStaleTargets({ rootDir, currentManifest, plan }));

  for (const projection of plan.skillWrites) {
    const targetPath = path.resolve(projection.targetPath);
    const targetStat = await statOrNull(targetPath);
    if (!targetStat || ownedTargets.has(targetPath)) continue;
    if (!takeover) {
      throw new Error(`Refusing to adopt an existing unowned workspace skill without --takeover: ${targetPath}`);
    }
    if (!await eligibleForTakeover(rootDir, targetPath, [projection])) {
      throw new Error(`Refusing modified workspace skill takeover: ${targetPath}`);
    }
  }

  for (const targetPath of preflight.extraKnown) {
    await assertWorkspaceProjectionTarget(rootDir, targetPath);
    if (ownedTargets.has(path.resolve(targetPath))) {
      staleTargets.add(path.resolve(targetPath));
      continue;
    }
    if (await isRetiredWorkspaceProjection(targetPath)) {
      staleTargets.add(path.resolve(targetPath));
      continue;
    }
    if (takeover) {
      const candidates = knownCatalog.get(path.resolve(targetPath)) ?? [];
      if (candidates.length !== 1) {
        throw new Error(`Refusing ambiguous workspace skill takeover: ${targetPath}`);
      }
      if (!await eligibleForTakeover(rootDir, targetPath, candidates)) {
        throw new Error(`Refusing modified workspace skill takeover: ${targetPath}`);
      }
      staleTargets.add(path.resolve(targetPath));
    }
  }

  for (const targetPath of staleTargets) {
    await rm(targetPath, { recursive: true, force: true });
  }

  for (const projection of plan.skillWrites) {
    const targetPath = path.resolve(projection.targetPath);
    const targetStat = await statOrNull(targetPath);
    if (targetStat && takeover && !ownedTargets.has(targetPath)) {
      ownedTargets.add(targetPath);
    }

    await materializeDirectoryProjection({
      sourcePath: projection.sourcePath,
      targetPath,
      ownedTargets,
      conflictMode: 'reject'
    });
    await applySkillPatches({ ...projection, targetPath });
    nextEntries.push({
      ...projection,
      targetPath,
      strategy: 'materialize',
      sourceDigest: await digestTarget(projection.sourcePath)
    });
  }

  await writeProjectionManifest(rootDir, createProjectionManifest(nextEntries), manifestOptions);
}

function usage() {
  return [
    'Usage: ./scripts/harness workspace-skills plan|sync|check|set [options]',
    '',
    'Actions:',
    '  plan   Print the desired workspace skill projection',
    '  sync   Apply the desired workspace skill projection',
    '  check  Fail when Harness-known workspace skills drift',
    '  set    Update the committed desired skill profile',
    '',
    'Options:',
    '  --skill-profile=<name>',
    '  --takeover',
    '  --help, -h'
  ].join('\n');
}

export async function workspaceSkills(args = [], options = {}) {
  if (args.includes('--help') || args.includes('-h') || args.length === 0) {
    console.log(usage());
    return;
  }
  const rootDir = options.rootDir ?? (await discoverAuthorityRoot(process.cwd())).rootDir;
  if (args[0] === 'set') {
    const selected = args.find((arg) => arg.startsWith('--skill-profile='))?.split('=', 2)[1];
    if (!selected) throw new Error('workspace-skills set requires --skill-profile=<name>.');
    const profiles = await loadSkillProfiles(rootDir);
    if (!profiles.profiles[selected]) throw new Error(`Unknown workspace skill profile: ${selected}`);
    const current = await readWorkspaceSkillProfile(rootDir);
    const next = validateWorkspaceSkillProfile({ ...current, skillProfile: selected });
    await writeFile(workspaceSkillProfilePath(rootDir), `${JSON.stringify(next, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify({ mode: 'set', skillProfile: selected }, null, 2));
    return;
  }
  const profile = await readWorkspaceSkillProfile(rootDir);
  const plan = await planWorkspaceSkills({ rootDir, profile });

  if (args[0] === 'plan') {
    const actions = await classifyWorkspaceSkillPlan({ rootDir, plan });
    console.log(JSON.stringify({
      mode: 'plan',
      skillProfile: profile.skillProfile,
      targets: plan.targets,
      actions,
      skills: plan.skillWrites.map((entry) => ({
        kind: entry.kind,
        parentSkillName: entry.parentSkillName,
        skillName: entry.skillName,
        targetPath: entry.targetPath,
        patches: entry.patches.map((patch) => patch.type)
      }))
    }, null, 2));
    return;
  }

  if (args[0] === 'check') {
    const result = await checkWorkspaceSkills({ rootDir, plan });
    console.log(JSON.stringify({ mode: 'check', skillProfile: profile.skillProfile, ...result }, null, 2));
    if (!result.ok) {
      throw new Error('Workspace skill check failed: Harness-known projections are out of sync.');
    }
    return;
  }

  if (args[0] === 'sync') {
    await applyWorkspaceSkills({ rootDir, plan, takeover: args.includes('--takeover') });
    const result = await checkWorkspaceSkills({ rootDir, plan });
    console.log(JSON.stringify({ mode: 'sync', skillProfile: profile.skillProfile, ...result }, null, 2));
    if (!result.ok) {
      throw new Error('Workspace skill sync finished with unresolved drift.');
    }
    return;
  }

  throw new Error(`Unknown workspace-skills action: ${args[0]}`);
}
