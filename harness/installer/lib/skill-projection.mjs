import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { resolveSkillTargetPaths } from './paths.mjs';

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
    if (!['schemaVersion', 'defaultProfile', 'profiles'].includes(key)) {
      throw new TypeError(`Harness skill profiles contains unsupported field: ${key}`);
    }
  }

  if (config.schemaVersion !== 1) {
    throw new TypeError('Harness skill profiles schemaVersion must be 1.');
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
}

function validateSkillProfileEntries(profileName, profileEntries, index, childNamesByParent) {
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

    if (!childNamesByParent[parentSkillName]?.includes(childName)) {
      throw new TypeError(`Harness skill profile ${profileName} references unknown child: ${entry}`);
    }
  }
}

export async function loadSkillProfiles(rootDir) {
  const config = JSON.parse(await readFile(path.join(rootDir, SKILL_PROFILES_PATH), 'utf8'));
  validateSkillProfilesConfig(config);
  return config;
}

export function defaultSkillProfileForTargets(skillProfiles, targets, requestedSkillProfile) {
  if (requestedSkillProfile) {
    return requestedSkillProfile;
  }

  return targets.length === 1 && targets[0] === 'copilot'
    ? 'copilot-default'
    : skillProfiles.defaultProfile;
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

function selectedCollectionChildren(profileSelection, parentSkillName, childNames) {
  if (profileSelection.allowedParents.has(parentSkillName)) {
    return childNames;
  }

  const allowedChildren = profileSelection.allowedChildren.get(parentSkillName);
  if (!allowedChildren) {
    return [];
  }

  return childNames.filter((childName) => allowedChildren.has(childName));
}

async function loadSkillIndex(rootDir) {
  return JSON.parse(await readFile(path.join(rootDir, 'harness/core/skills/index.json'), 'utf8'));
}

async function loadPlatformsMetadata(rootDir) {
  return JSON.parse(await readFile(path.join(rootDir, 'harness/core/metadata/platforms.json'), 'utf8'));
}

function strategyFor(skill, target) {
  const strategy = skill.projection[target] || skill.projection.default;
  if (!strategies.has(strategy)) {
    throw new Error(`Unsupported projection strategy: ${strategy}`);
  }
  return strategy;
}

async function collectionChildNames(sourcePath) {
  const entries = await readdir(sourcePath, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function patchKey(patch) {
  return `${patch.type}:${patch.marker ?? ''}`;
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
    source: path.join(rootDir, skill.baselinePath),
    patches: resolvePatches(skill.patches, target)
  };
}

export async function planSkillProjections({ rootDir, homeDir, scope, target, skillProfile }) {
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

    collectionChildrenByParent[parentSkillName] = await collectionChildNames(
      path.join(rootDir, skill.baselinePath)
    );
  }

  validateSkillProfileEntries(profileName, profileEntries, index, collectionChildrenByParent);
  const profileSelection = buildProfileSelection(profileEntries);
  const projections = [];

  for (const [parentSkillName, skill] of Object.entries(index.skills).sort(([left], [right]) =>
    left.localeCompare(right)
  )) {
    const sourceRoot = path.join(rootDir, skill.baselinePath);
    const strategy = strategyFor(skill, target);

    if (skill.layout === 'collection') {
      const childNames = selectedCollectionChildren(
        profileSelection,
        parentSkillName,
        collectionChildrenByParent[parentSkillName] ?? []
      );

      if (!childNames.length) {
        continue;
      }

      const targetPaths = resolveSkillTargetPaths(rootDir, homeDir, scope, target, {
        layout: 'collection',
        childNames
      });

      for (const childName of childNames) {
        for (const targetPath of targetPaths.filter((candidate) => path.basename(candidate) === childName)) {
          const patches = normalizePatches(skill.childPatches?.[childName]);
          projections.push({
            kind: 'skill',
            parentSkillName,
            skillName: childName,
            target,
            strategy,
            sourcePath: path.join(sourceRoot, childName),
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

      for (const targetPath of resolveSkillTargetPaths(rootDir, homeDir, scope, target, skill)) {
        const patches = resolvePatches(skill.patches, target);
        projections.push({
          kind: 'skill',
          parentSkillName,
          skillName: skill.targetName,
          target,
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
