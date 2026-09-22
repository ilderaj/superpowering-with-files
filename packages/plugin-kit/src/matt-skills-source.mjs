import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import { sha256File } from './sha256.mjs';
import {
  LOCKED_LICENSE,
  LOCKED_PROVENANCE,
  LOCKED_SKILLS,
} from './matt-skills-lock.mjs';

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
      errors.push('invalid UPSTREAM.json: ' + error.message);
    }
    return undefined;
  }
}

function verifyExactKeys(value, expectedKeys, label, errors) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    errors.push('invalid ' + label);
    return false;
  }

  const expected = new Set(expectedKeys);
  for (const key of Object.keys(value)) {
    if (!expected.has(key)) {
      errors.push('unsupported ' + label + ' field: ' + key);
    }
  }
  for (const key of expected) {
    if (!(key in value)) {
      errors.push('missing ' + label + ' field: ' + key);
    }
  }
  return true;
}

function verifySkillEntry(entry, expectedSkill, errors) {
  if (!verifyExactKeys(
    entry,
    ['name', 'originalPath', 'sha256', 'files'],
    'skill metadata for ' + expectedSkill.name,
    errors,
  )) {
    return;
  }

  if (entry.name !== expectedSkill.name) {
    errors.push('name mismatch for ' + expectedSkill.name);
  }
  if (entry.originalPath !== expectedSkill.originalPath) {
    errors.push('originalPath mismatch for ' + expectedSkill.name);
  }
  if (entry.sha256 !== expectedSkill.sha256) {
    errors.push('sha256 mismatch for ' + expectedSkill.name);
  }

  if (!Array.isArray(entry.files)) {
    errors.push('invalid files for ' + expectedSkill.name);
    return;
  }

  const expectedFiles = new Map(expectedSkill.files.map((file) => [file.path, file]));
  if (entry.files.length !== expectedSkill.files.length) {
    errors.push('files length mismatch for ' + expectedSkill.name);
  }

  for (const file of entry.files) {
    if (file === null || typeof file !== 'object' || Array.isArray(file)) {
      errors.push('invalid file entry for ' + expectedSkill.name);
      continue;
    }
    if (!verifyExactKeys(file, ['path', 'originalPath', 'sha256'], 'file metadata for ' + expectedSkill.name, errors)) {
      continue;
    }
    const expected = expectedFiles.get(file.path);
    if (!expected) {
      errors.push('unsupported file for ' + expectedSkill.name + ': ' + file.path);
      continue;
    }
    if (file.originalPath !== expected.originalPath) {
      errors.push('file originalPath mismatch for ' + expectedSkill.name + ': ' + file.path);
    }
    if (file.sha256 !== expected.sha256) {
      errors.push('file sha256 mismatch for ' + expectedSkill.name + ': ' + file.path);
    }
  }
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
      errors.push(key + ' mismatch');
    }
  }

  if (metadata.bodyPatch !== false) {
    errors.push('bodyPatch must be false');
  }

  if (verifyExactKeys(metadata.license, ['path', 'sha256'], 'license metadata', errors)) {
    for (const [key, expected] of Object.entries(LOCKED_LICENSE)) {
      if (metadata.license[key] !== expected) {
        errors.push('license ' + key + ' mismatch');
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
      errors.push('unsupported skill in inventory: ' + entry.name);
      continue;
    }
    if (entriesByName.has(entry.name)) {
      errors.push('duplicate skill entry in metadata: ' + entry.name);
      continue;
    }
    entriesByName.set(entry.name, entry);
  }

  for (const expectedSkill of LOCKED_SKILLS) {
    const entry = entriesByName.get(expectedSkill.name);
    if (!entry) {
      errors.push('missing skill entry in metadata: ' + expectedSkill.name);
      continue;
    }
    verifySkillEntry(entry, expectedSkill, errors);
  }
}

async function collectRelativeFiles(root, label, errors) {
  const found = new Set();

  async function walk(dir, prefix) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (error) {
      if (isMissing(error)) {
        errors.push('missing corpus path: ' + label + (prefix ? '/' + prefix : ''));
      } else {
        errors.push('cannot read corpus path ' + label + (prefix ? '/' + prefix : '') + ': ' + error.message);
      }
      return;
    }

    for (const entry of entries) {
      const relative = prefix ? prefix + '/' + entry.name : entry.name;
      if (entry.isDirectory()) {
        await walk(join(dir, entry.name), relative);
      } else {
        found.add(relative);
      }
    }
  }

  await walk(root, '');
  return found;
}

async function verifyCorpusInventory(corpusRoot, errors) {
  let rootEntries;
  try {
    rootEntries = await readdir(corpusRoot, { withFileTypes: true });
  } catch (error) {
    if (isMissing(error)) {
      errors.push('missing corpus root');
    } else {
      errors.push('cannot read corpus root: ' + error.message);
    }
    return;
  }

  for (const entry of rootEntries) {
    if (!ROOT_ENTRY_NAMES.has(entry.name)) {
      errors.push('unsupported inventory entry in corpus: ' + entry.name);
    }
  }

  for (const skill of LOCKED_SKILLS) {
    const skillDir = join(corpusRoot, skill.name);
    const found = await collectRelativeFiles(skillDir, skill.name, errors);

    const allowed = new Set(skill.files.map((file) => file.path));
    for (const relative of found) {
      if (!allowed.has(relative)) {
        errors.push('unsupported inventory entry in corpus: ' + skill.name + '/' + relative);
      }
    }
    for (const file of skill.files) {
      if (!found.has(file.path)) {
        errors.push('missing corpus file: ' + skill.name + '/' + file.path);
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
      errors.push(missingError + ': ' + error.message);
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

export function mattSkillsPackagedFiles() {
  return LOCKED_SKILLS.flatMap((skill) => skill.files.map((file) => 'skills/' + skill.name + '/' + file.path));
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
    ...LOCKED_SKILLS.flatMap((skill) => skill.files.map((file) => verifyFileDigest(
      join(corpusRoot, skill.name, file.path),
      file.sha256,
      'missing body: ' + skill.name + '/' + file.path,
      'body digest mismatch: ' + skill.name + '/' + file.path,
      errors,
    ))),
  ]);

  return { ok: errors.length === 0, errors };
}

export async function loadMattSkillsSource({ corpusRoot = mattSkillsCorpusRoot() } = {}) {
  const verification = await verifyMattSkillsSource({ corpusRoot });
  if (!verification.ok) {
    const error = new Error('Matt skills source verification failed: ' + verification.errors.join('; '));
    error.code = 'MATT_SKILLS_VERIFICATION_FAILED';
    error.errors = verification.errors;
    throw error;
  }

  const [metadataText, license, ...bodies] = await Promise.all([
    readFile(join(corpusRoot, 'UPSTREAM.json'), 'utf8'),
    readFile(join(corpusRoot, 'LICENSE'), 'utf8'),
    ...LOCKED_SKILLS.map((skill) => readFile(join(corpusRoot, skill.name, 'SKILL.md'), 'utf8')),
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
