import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import { sha256File } from './sha256.mjs';

const LOCKED_PROVENANCE = Object.freeze({
  repo: 'https://github.com/mattpocock/skills',
  tag: 'v1.2.3',
  tagObject: '835450ef244ab7335f75d95b83e7d979eae22a6d',
  commit: '6acc160e4e0cd062dbbbd7a1b26ae92855edf07e',
});

const LOCKED_LICENSE = Object.freeze({
  path: 'LICENSE',
  sha256: '0e7ac423bf2c6e223b7c5b156f8cf72da49d748e56a1641402c31f22ad07dbb5',
});

const LOCKED_SKILLS = Object.freeze([
  Object.freeze({
    name: 'grill-me',
    corpusPath: 'grill-me/SKILL.md',
    originalPath: 'skills/productivity/grill-me/SKILL.md',
    sha256: '6189dfceb7304a6e5558f75d87e68fa3bc7fcf7ba120e44f21f8a61fe01eba54',
  }),
  Object.freeze({
    name: 'grilling',
    corpusPath: 'grilling/SKILL.md',
    originalPath: 'skills/productivity/grilling/SKILL.md',
    sha256: 'fa5c1e5ee76b1c8f1ae56101f52c9e239de75d5c578adc61227b92d10b7e52ef',
  }),
  Object.freeze({
    name: 'to-questionnaire',
    corpusPath: 'to-questionnaire/SKILL.md',
    originalPath: 'skills/productivity/to-questionnaire/SKILL.md',
    sha256: '8e7f9ed8d7b2e66babf1a54aee9b94319bf38c32619cffe78819df6518ead5fc',
  }),
]);

export const MATT_SKILLS_INVENTORY = Object.freeze(LOCKED_SKILLS.map(({ name }) => name));

const ROOT_ENTRY_NAMES = new Set([
  'LICENSE',
  'UPSTREAM.json',
  ...MATT_SKILLS_INVENTORY,
]);

function isMissing(error) {
  return error?.code === 'ENOENT';
}

async function readJson(filePath, errors) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    if (isMissing(error)) {
      errors.push('missing UPSTREAM.json');
    } else {
      errors.push(`invalid UPSTREAM.json: ${error.message}`);
    }
    return undefined;
  }
}

function verifyExactKeys(value, expectedKeys, label, errors) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    errors.push(`invalid ${label}`);
    return false;
  }

  const expected = new Set(expectedKeys);
  for (const key of Object.keys(value)) {
    if (!expected.has(key)) {
      errors.push(`unsupported ${label} field: ${key}`);
    }
  }
  for (const key of expected) {
    if (!(key in value)) {
      errors.push(`missing ${label} field: ${key}`);
    }
  }
  return true;
}

function verifyMetadata(metadata, errors) {
  if (!verifyExactKeys(
    metadata,
    ['repo', 'tag', 'tagObject', 'commit', 'license', 'bodyPatch', 'skills'],
    'UPSTREAM.json',
    errors,
  )) {
    return;
  }

  for (const [key, expected] of Object.entries(LOCKED_PROVENANCE)) {
    if (metadata[key] !== expected) {
      errors.push(`${key} mismatch`);
    }
  }

  if (metadata.bodyPatch !== false) {
    errors.push('bodyPatch must be false');
  }

  if (verifyExactKeys(metadata.license, ['path', 'sha256'], 'license metadata', errors)) {
    for (const [key, expected] of Object.entries(LOCKED_LICENSE)) {
      if (metadata.license[key] !== expected) {
        errors.push(`license ${key} mismatch`);
      }
    }
  }

  if (!Array.isArray(metadata.skills)) {
    errors.push('invalid skills metadata');
    return;
  }

  const entriesByName = new Map();
  for (const entry of metadata.skills) {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      errors.push('invalid skill entry in metadata');
      continue;
    }

    if (!MATT_SKILLS_INVENTORY.includes(entry.name)) {
      errors.push(`unsupported skill in inventory: ${entry.name}`);
      continue;
    }
    if (entriesByName.has(entry.name)) {
      errors.push(`duplicate skill entry in metadata: ${entry.name}`);
      continue;
    }
    entriesByName.set(entry.name, entry);
  }

  for (const expectedSkill of LOCKED_SKILLS) {
    const entry = entriesByName.get(expectedSkill.name);
    if (!entry) {
      errors.push(`missing skill entry in metadata: ${expectedSkill.name}`);
      continue;
    }
    verifyExactKeys(entry, ['name', 'corpusPath', 'originalPath', 'sha256'], `skill metadata for ${expectedSkill.name}`, errors);
    for (const key of ['corpusPath', 'originalPath', 'sha256']) {
      if (entry[key] !== expectedSkill[key]) {
        errors.push(`${key} mismatch for ${expectedSkill.name}`);
      }
    }
  }
}

async function verifyCorpusInventory(corpusRoot, errors) {
  let rootEntries;
  try {
    rootEntries = await readdir(corpusRoot, { withFileTypes: true });
  } catch (error) {
    if (isMissing(error)) {
      errors.push('missing corpus root');
    } else {
      errors.push(`cannot read corpus root: ${error.message}`);
    }
    return;
  }

  for (const entry of rootEntries) {
    if (!ROOT_ENTRY_NAMES.has(entry.name)) {
      errors.push(`unsupported inventory entry in corpus: ${entry.name}`);
    }
  }

  for (const skill of LOCKED_SKILLS) {
    const skillDir = join(corpusRoot, skill.name);
    try {
      const entries = await readdir(skillDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name !== 'SKILL.md') {
          errors.push(`unsupported inventory entry in corpus: ${skill.name}/${entry.name}`);
        }
      }
    } catch (error) {
      if (!isMissing(error)) {
        errors.push(`cannot read corpus skill directory ${skill.name}: ${error.message}`);
      }
    }
  }
}

async function verifyFileDigest(filePath, expectedDigest, missingError, mismatchError, errors) {
  try {
    const digest = await sha256File(filePath);
    if (digest !== expectedDigest) {
      errors.push(mismatchError);
    }
  } catch (error) {
    if (isMissing(error)) {
      errors.push(missingError);
    } else {
      errors.push(`${missingError}: ${error.message}`);
    }
  }
}

export function mattSkillsCorpusRoot() {
  const repositoryRoot = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
  return join(repositoryRoot, 'harness', 'optional-skills', 'mattpocock', 'v1.2.3');
}

export function mattSkillsOverlayRoot() {
  const repositoryRoot = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
  return join(repositoryRoot, 'harness', 'core', 'upstream-overlays', 'mattpocock');
}

export async function verifyMattSkillsSource({ corpusRoot = mattSkillsCorpusRoot() } = {}) {
  const errors = [];
  await verifyCorpusInventory(corpusRoot, errors);

  const metadata = await readJson(join(corpusRoot, 'UPSTREAM.json'), errors);
  if (metadata !== undefined) {
    verifyMetadata(metadata, errors);
  }

  await Promise.all([
    verifyFileDigest(
      join(corpusRoot, LOCKED_LICENSE.path),
      LOCKED_LICENSE.sha256,
      'missing license',
      'license digest mismatch',
      errors,
    ),
    ...LOCKED_SKILLS.map((skill) => verifyFileDigest(
      join(corpusRoot, skill.corpusPath),
      skill.sha256,
      `missing body: ${skill.name}`,
      `body digest mismatch: ${skill.name}`,
      errors,
    )),
  ]);

  return { ok: errors.length === 0, errors };
}

export async function loadMattSkillsSource({ corpusRoot = mattSkillsCorpusRoot() } = {}) {
  const verification = await verifyMattSkillsSource({ corpusRoot });
  if (!verification.ok) {
    const error = new Error(`Matt skills source verification failed: ${verification.errors.join('; ')}`);
    error.code = 'MATT_SKILLS_VERIFICATION_FAILED';
    error.errors = verification.errors;
    throw error;
  }

  const [metadataText, license, ...bodies] = await Promise.all([
    readFile(join(corpusRoot, 'UPSTREAM.json'), 'utf8'),
    readFile(join(corpusRoot, 'LICENSE'), 'utf8'),
    ...LOCKED_SKILLS.map((skill) => readFile(join(corpusRoot, skill.corpusPath), 'utf8')),
  ]);

  const skills = Object.fromEntries(LOCKED_SKILLS.map((skill, index) => [skill.name, bodies[index]]));
  const overlays = [];
  const overlayProvenance = [];
  const overlayRoot = mattSkillsOverlayRoot();
  for (const skill of LOCKED_SKILLS) {
    const overlayPath = join(overlayRoot, skill.name, 'SKILL.md');
    try {
      skills[skill.name] = await readFile(overlayPath, 'utf8');
      overlays.push(skill.name);
      overlayProvenance.push({
        name: skill.name,
        corpusSha256: skill.sha256,
        overlaySha256: await sha256File(overlayPath),
      });
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }

  return {
    metadata: JSON.parse(metadataText),
    license,
    skills,
    overlays,
    overlayProvenance,
  };
}
