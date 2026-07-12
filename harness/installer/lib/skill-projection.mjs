import { access, lstat, readdir, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { resolveSkillTargetPaths } from './paths.mjs';
import { resolveHarnessSourcePath } from '../../runtime/source-root.mjs';

const strategies = new Set(['link', 'materialize']);
const SKILL_PROFILES_PATH = 'harness/core/skills/profiles.json';

function normalizePatches(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function resolvePatches(patchConfig, target) {
  if (!patchConfig) return [];
  return [
    ...normalizePatches(patchConfig.default),
    ...normalizePatches(patchConfig[target])
  ];
}

function validateSkillProfilesConfig(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new TypeError('Harness skill profiles must be a JSON object.');
  }

  for (const key of Object.keys(config)) {
    if (!['schemaVersion', 'defaultProfile', 'policyProfileBySkillProfile', 'profiles'].includes(key)) {
      throw new TypeError(`Harness skill profiles contains unsupported field: ${key}`);
    }
  }

  if (config.schemaVersion !== 2) {
    throw new TypeError('Harness skill profiles schemaVersion must be 2.');
  }

  if (typeof config.defaultProfile !== 'string' || !config.defaultProfile) {
    throw new TypeError('Harness skill profiles defaultProfile must be a string.');
  }

  if (!config.profiles || typeof config.profiles !== 'object' || Array.isArray(config.profiles)) {
    throw new TypeError('Harness skill profiles profiles must be a JSON object.');
  }

  for (const [profileName, entries] of Object.entries(config.profiles)) {
    if (!Array.isArray(entries) || !entries.every((entry) => typeof entry === 'string' && entry)) {
      throw new TypeError(`Harness skill profiles profile ${profileName} must be an array of strings.`);
    }
  }

  if (!config.profiles[config.defaultProfile]) {
    throw new TypeError(
      `Harness skill profiles defaultProfile ${config.defaultProfile} must reference an existing profile.`
    );
  }

  if (!config.policyProfileBySkillProfile || typeof config.policyProfileBySkillProfile !== 'object' || Array.isArray(config.policyProfileBySkillProfile)) {
    throw new TypeError('Harness skill profiles policyProfileBySkillProfile must be a JSON object.');
  }

  for (const profileName of Object.keys(config.profiles)) {
    if (typeof config.policyProfileBySkillProfile[profileName] !== 'string' || !config.policyProfileBySkillProfile[profileName]) {
      throw new TypeError(`Harness skill profile ${profileName} must map to an entry policy profile.`);
    }
  }
}

function validateSkillProfileEntries(profileName, profileEntries, index, childDescriptorsByParent) {
  for (const entry of profileEntries) {
    const [parentSkillName, childName] = entry.split(':');

    if (!parentSkillName) {
      throw new TypeError(`Harness skill profile ${profileName} contains an empty skill entry.`);
    }

    const skill = index.skills[parentSkillName];
    if (!skill) {
      throw new TypeError(`Harness skill profile ${profileName} references unknown skill: ${entry}`);
    }

    if (childName === undefined) {
      continue;
    }

    if (skill.layout !== 'collection') {
      throw new TypeError(
        `Harness skill profile ${profileName} references child ${entry} but ${parentSkillName} is not a collection.`
      );
    }

    if (!childDescriptorsByParent[parentSkillName]?.some((child) => child.id === childName)) {
      throw new TypeError(`Harness skill profile ${profileName} references unknown child: ${entry}`);
    }
  }
}

export async function loadSkillProfiles(rootDir) {
  const config = JSON.parse(await readFile(resolveHarnessSourcePath(rootDir, SKILL_PROFILES_PATH), 'utf8'));
  validateSkillProfilesConfig(config);
  return config;
}

export function defaultSkillProfileForTargets(skillProfiles, targets, requestedSkillProfile, scope = 'workspace') {
  if (requestedSkillProfile) {
    return requestedSkillProfile;
  }

  if (scope === 'user-global' || scope === 'both') {
    return 'minimal-global';
  }

  return targets.length === 1 && targets[0] === 'copilot'
    ? 'copilot-default'
    : skillProfiles.defaultProfile;
}

export function policyProfileForSkillProfile(skillProfiles, skillProfile, requestedPolicyProfile) {
  if (requestedPolicyProfile) {
    return requestedPolicyProfile;
  }

  const policyProfile = skillProfiles.policyProfileBySkillProfile?.[skillProfile];
  if (!policyProfile) {
    throw new Error(`No entry policy profile is configured for skills profile: ${skillProfile}.`);
  }

  return policyProfile;
}

function resolveSkillProfileName(skillProfiles, requestedProfile) {
  const profileName = requestedProfile ?? skillProfiles.defaultProfile;
  if (!skillProfiles.profiles[profileName]) {
    throw new Error(
      `Invalid skills profile: ${profileName}. Expected one of: ${Object.keys(skillProfiles.profiles).join(', ')}.`
    );
  }
  return profileName;
}

function buildProfileSelection(profileEntries) {
  const allowedParents = new Set();
  const allowedChildren = new Map();

  for (const entry of profileEntries) {
    const [parentSkillName, childName] = entry.split(':');

    if (childName === undefined) {
      allowedParents.add(parentSkillName);
      continue;
    }

    const children = allowedChildren.get(parentSkillName) ?? new Set();
    children.add(childName);
    allowedChildren.set(parentSkillName, children);
  }

  return { allowedParents, allowedChildren };
}

function selectedCollectionChildren(profileSelection, parentSkillName, children) {
  if (profileSelection.allowedParents.has(parentSkillName)) {
    return children;
  }

  const allowedChildren = profileSelection.allowedChildren.get(parentSkillName);
  if (!allowedChildren) {
    return [];
  }

  return children.filter((child) => allowedChildren.has(child.id));
}

async function loadSkillIndex(rootDir) {
  return JSON.parse(
    await readFile(resolveHarnessSourcePath(rootDir, 'harness/core/skills/index.json'), 'utf8')
  );
}

async function loadPlatformsMetadata(rootDir) {
  return JSON.parse(
    await readFile(resolveHarnessSourcePath(rootDir, 'harness/core/metadata/platforms.json'), 'utf8')
  );
}

function strategyFor(skill, target) {
  const strategy = skill.projection[target] || skill.projection.default;
  if (!strategies.has(strategy)) {
    throw new Error(`Unsupported projection strategy: ${strategy}`);
  }
  return strategy;
}

async function collectionChildDescriptors(sourcePath) {
  const children = [];

  async function visit(directory, relativeDirectory = '') {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries.filter((candidate) => candidate.isDirectory()).sort((left, right) => left.name.localeCompare(right.name))) {
      const relativePath = relativeDirectory ? path.join(relativeDirectory, entry.name) : entry.name;
      const childPath = path.join(directory, entry.name);

      if (await pathExists(path.join(childPath, 'SKILL.md'))) {
        children.push({
          id: relativePath.split(path.sep).join('/'),
          sourcePath: childPath,
          targetName: entry.name
        });
        continue;
      }

      await visit(childPath, relativePath);
    }
  }

  await visit(sourcePath);
  return children.sort((left, right) => left.id.localeCompare(right.id));
}

async function pathExists(targetPath) {
  try {
    await access(targetPath);
    return true;
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return false;
    }

    throw error;
  }
}

async function resolveSingleSkillSourceRoot(rootDir, skill) {
  const sourceRoot = path.join(rootDir, skill.baselinePath);

  if (await pathExists(path.join(sourceRoot, 'SKILL.md'))) {
    return sourceRoot;
  }

  const canonicalRoot = path.join(sourceRoot, 'skills', skill.targetName);
  if (await pathExists(path.join(canonicalRoot, 'SKILL.md'))) {
    return canonicalRoot;
  }

  return sourceRoot;
}

function patchKey(patch) {
  return `${patch.type}:${patch.marker ?? ''}`;
}

async function isSymbolicLinkPath(targetPath) {
  try {
    return (await lstat(targetPath)).isSymbolicLink();
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return false;
    }

    throw error;
  }
}

async function canonicalProjectionRealpath(projection) {
  for (const candidatePath of [projection.targetPath, projection.sourcePath]) {
    try {
      return await realpath(candidatePath);
    } catch (error) {
      if (error && error.code === 'ENOENT') {
        continue;
      }

      throw error;
    }
  }

  return path.resolve(projection.sourcePath);
}

export function coalesceSkillProjections(projections) {
  const grouped = new Map();

  for (const projection of projections) {
    const key = path.resolve(projection.targetPath);
    const existing = grouped.get(key);

    if (!existing) {
      grouped.set(key, {
        ...projection,
        targets: [projection.target]
      });
      continue;
    }

    if (existing.sourcePath !== projection.sourcePath) {
      throw new Error(`Shared skill root conflict for ${projection.targetPath}`);
    }

    if (!existing.targets.includes(projection.target)) {
      existing.targets.push(projection.target);
    }

    const seenPatches = new Set((existing.patches ?? []).map((patch) => patchKey(patch)));
    for (const patch of projection.patches ?? []) {
      const key = patchKey(patch);
      if (seenPatches.has(key)) continue;
      seenPatches.add(key);
      existing.patches = existing.patches ?? [];
      existing.patches.push(patch);
    }
  }

  return [...grouped.values()].sort((left, right) => left.targetPath.localeCompare(right.targetPath));
}

export async function classifySkillProjectionDuplicates(projections) {
  const grouped = new Map();

  for (const projection of projections) {
    if (projection.kind !== 'skill') {
      continue;
    }

    if (!(await isSymbolicLinkPath(projection.targetPath))) {
      continue;
    }

    const key = `${projection.target}\0${projection.skillName}`;
    const entries = grouped.get(key) ?? [];
    entries.push({
      ...projection,
      resolvedPath: await canonicalProjectionRealpath(projection),
      sourcePath: path.resolve(projection.sourcePath),
      targetPath: path.resolve(projection.targetPath)
    });
    grouped.set(key, entries);
  }

  return [...grouped.values()]
    .filter((entries) => entries.length > 1)
    .map((entries) => {
      const resolvedPaths = [...new Set(entries.map((entry) => entry.resolvedPath))].sort((left, right) =>
        left.localeCompare(right)
      );
      const sourcePaths = [...new Set(entries.map((entry) => entry.sourcePath))].sort((left, right) =>
        left.localeCompare(right)
      );
      const targetPaths = [...new Set(entries.map((entry) => entry.targetPath))].sort((left, right) =>
        left.localeCompare(right)
      );

      return {
        target: entries[0].target,
        skillName: entries[0].skillName,
        classification: resolvedPaths.length === 1 ? 'display-duplicate' : 'true-duplicate',
        resolvedPath: resolvedPaths.length === 1 ? resolvedPaths[0] : resolvedPaths.join(', '),
        resolvedPaths,
        sourcePaths,
        targetPaths
      };
    })
    .sort((left, right) =>
      [left.target, left.skillName, left.classification].join('\0').localeCompare(
        [right.target, right.skillName, right.classification].join('\0')
      )
    );
}

export async function projectionForSkill(rootDir, skillName, target) {
  const [index, metadata] = await Promise.all([
    loadSkillIndex(rootDir),
    loadPlatformsMetadata(rootDir)
  ]);

  if (!metadata.platforms[target]) {
    throw new Error(`Unknown target: ${target}`);
  }

  const skill = index.skills[skillName];

  if (!skill) {
    throw new Error(`Unknown skill: ${skillName}`);
  }

  const strategy = strategyFor(skill, target);

  return {
    skillName,
    target,
    strategy,
    source: skill.layout === 'single'
      ? await resolveSingleSkillSourceRoot(rootDir, skill)
      : path.join(rootDir, skill.baselinePath),
    patches: resolvePatches(skill.patches, target)
  };
}

export async function planSkillProjections({
  rootDir,
  homeDir,
  scope,
  target,
  skillProfile,
  deploymentProfile = 'standard'
}) {
  const [index, metadata, skillProfiles] = await Promise.all([
    loadSkillIndex(rootDir),
    loadPlatformsMetadata(rootDir),
    loadSkillProfiles(rootDir)
  ]);

  if (!metadata.platforms[target]) {
    throw new Error(`Unknown target: ${target}`);
  }

  const profileName = resolveSkillProfileName(skillProfiles, skillProfile);
  const profileEntries = skillProfiles.profiles[profileName];
  const collectionChildrenByParent = {};

  for (const [parentSkillName, skill] of Object.entries(index.skills)) {
    if (skill.layout !== 'collection') {
      continue;
    }

    collectionChildrenByParent[parentSkillName] = await collectionChildDescriptors(
      path.join(rootDir, skill.baselinePath)
    );
  }

  validateSkillProfileEntries(profileName, profileEntries, index, collectionChildrenByParent);
  const profileSelection = buildProfileSelection(profileEntries);
  const projections = [];

  for (const [parentSkillName, skill] of Object.entries(index.skills).sort(([left], [right]) =>
    left.localeCompare(right)
  )) {
    const sourceRoot = skill.layout === 'single'
      ? await resolveSingleSkillSourceRoot(rootDir, skill)
      : path.join(rootDir, skill.baselinePath);
    const strategy = strategyFor(skill, target);

    if (skill.layout === 'collection') {
      const children = selectedCollectionChildren(
        profileSelection,
        parentSkillName,
        collectionChildrenByParent[parentSkillName] ?? []
      );

      if (!children.length) {
        continue;
      }

      const targetPaths = resolveSkillTargetPaths(
        rootDir,
        homeDir,
        scope,
        target,
        {
          layout: 'collection',
          childNames: children.map((child) => child.targetName)
        },
        deploymentProfile
      );

      for (const child of children) {
        for (const targetPath of targetPaths.filter((candidate) => path.basename(candidate) === child.targetName)) {
          const patches = normalizePatches(skill.childPatches?.[child.id] ?? skill.childPatches?.[child.targetName]);
          projections.push({
            kind: 'skill',
            parentSkillName,
            skillName: child.targetName,
            target,
            deploymentProfile,
            strategy,
            sourcePath: child.sourcePath,
            targetPath,
            patches
          });
        }
      }
      continue;
    }

    if (skill.layout === 'single') {
      if (!profileSelection.allowedParents.has(parentSkillName)) {
        continue;
      }

      for (const targetPath of resolveSkillTargetPaths(
        rootDir,
        homeDir,
        scope,
        target,
        skill,
        deploymentProfile
      )) {
        const patches = resolvePatches(skill.patches, target);
        projections.push({
          kind: 'skill',
          parentSkillName,
          skillName: skill.targetName,
          target,
          deploymentProfile,
          strategy,
          sourcePath: sourceRoot,
          targetPath,
          patches
        });
      }
      continue;
    }

    throw new Error(`Unsupported skill layout: ${skill.layout}`);
  }

  return projections;
}

export async function listSkillCatalogProjections({
  rootDir,
  homeDir,
  scope,
  target,
  deploymentProfile = 'standard'
}) {
  const [index, metadata] = await Promise.all([
    loadSkillIndex(rootDir),
    loadPlatformsMetadata(rootDir)
  ]);
  if (!metadata.platforms[target]) {
    throw new Error(`Unknown target: ${target}`);
  }

  const projections = [];
  for (const [parentSkillName, skill] of Object.entries(index.skills).sort(([left], [right]) =>
    left.localeCompare(right)
  )) {
    const strategy = strategyFor(skill, target);
    if (skill.layout === 'collection') {
      const children = await collectionChildDescriptors(path.join(rootDir, skill.baselinePath));
      const targetPaths = resolveSkillTargetPaths(
        rootDir,
        homeDir,
        scope,
        target,
        { layout: 'collection', childNames: children.map((child) => child.targetName) },
        deploymentProfile
      );
      for (const child of children) {
        for (const targetPath of targetPaths.filter((candidate) => path.basename(candidate) === child.targetName)) {
          projections.push({
            kind: 'skill',
            parentSkillName,
            skillName: child.targetName,
            target,
            deploymentProfile,
            strategy,
            sourcePath: child.sourcePath,
            targetPath,
            patches: normalizePatches(skill.childPatches?.[child.id] ?? skill.childPatches?.[child.targetName])
          });
        }
      }
      continue;
    }

    if (skill.layout === 'single') {
      const sourcePath = await resolveSingleSkillSourceRoot(rootDir, skill);
      for (const targetPath of resolveSkillTargetPaths(
        rootDir,
        homeDir,
        scope,
        target,
        skill,
        deploymentProfile
      )) {
        projections.push({
          kind: 'skill',
          parentSkillName,
          skillName: skill.targetName,
          target,
          deploymentProfile,
          strategy,
          sourcePath,
          targetPath,
          patches: resolvePatches(skill.patches, target)
        });
      }
      continue;
    }

    throw new Error(`Unsupported skill layout: ${skill.layout}`);
  }

  return projections;
}
