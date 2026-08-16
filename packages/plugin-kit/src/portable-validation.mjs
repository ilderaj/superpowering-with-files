import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { agentPluginsSchemaUrl } from './platform-contracts.mjs';

const PORTABLE_MANIFEST_FIELDS = new Set([
  '$schema',
  'name',
  'version',
  'description',
  'author',
  'homepage',
  'repository',
  'license',
  'keywords',
  'extensions'
]);

const PORTABLE_SKILL_NAMES = [
  'trio',
  'dev',
  'office',
  'safety',
  'chiefops',
  'planning-with-files',
  'overengineering-review',
  'simplification-ledger'
];

// Mirrors the Agent Plugins v1.0.0 manifest name constraint.
const PORTABLE_NAME_PATTERN = /^(?!.*(?:--|\.\.))[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/;

export async function validatePortablePlugin({ pluginRoot, skillNames = PORTABLE_SKILL_NAMES }) {
  const errors = [];

  await validateManifest(path.join(pluginRoot, 'plugin.json'), errors);
  await validateImmediateSkillDiscovery(path.join(pluginRoot, 'skills'), skillNames, errors);
  await validateRootContainment(pluginRoot, errors);

  return {
    ok: errors.length === 0,
    errors
  };
}

async function validateManifest(manifestPath, errors) {
  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  } catch (error) {
    errors.push(`Invalid portable plugin.json: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }

  if (typeof manifest !== 'object' || manifest === null || Array.isArray(manifest)) {
    errors.push('Portable plugin.json must be a non-array object');
    return;
  }

  if (manifest.$schema !== agentPluginsSchemaUrl) {
    errors.push(`Portable $schema must be exactly ${agentPluginsSchemaUrl}`);
  }

  for (const key of Object.keys(manifest)) {
    if (!PORTABLE_MANIFEST_FIELDS.has(key)) {
      errors.push(`Portable plugin.json contains a field outside the closed Agent Plugins v1 schema: ${key}`);
    }
  }

  if (typeof manifest.name !== 'string' || manifest.name.length === 0 || manifest.name.length > 64) {
    errors.push('Portable plugin name must be a non-empty string of at most 64 characters');
  } else if (!PORTABLE_NAME_PATTERN.test(manifest.name)) {
    errors.push(`Portable plugin name is not a valid lowercase package name: ${manifest.name}`);
  }

  // Project release metadata (own-package policy, not Agent Plugins schema requirements).
  if (typeof manifest.version !== 'string') {
    errors.push(`Portable plugin version must be a string (project release metadata), got ${JSON.stringify(manifest.version)}`);
  }

  if (typeof manifest.license !== 'string') {
    errors.push('Portable plugin.json field license must be a string when present');
  } else if (manifest.license !== 'MIT') {
    errors.push('Portable plugin license must be MIT (project release metadata)');
  }

  if (typeof manifest.repository !== 'string') {
    errors.push('Portable plugin.json field repository must be a string when present');
  } else if (manifest.repository.length === 0) {
    errors.push('Portable plugin.json must declare source/repository metadata (project release metadata)');
  }

  for (const field of ['description', 'homepage']) {
    if (manifest[field] !== undefined && typeof manifest[field] !== 'string') {
      errors.push(`Portable plugin.json field ${field} must be a string when present`);
    }
  }

  if (manifest.author !== undefined) {
    if (typeof manifest.author !== 'object' || manifest.author === null || Array.isArray(manifest.author)) {
      errors.push('Portable plugin author must be a non-array object when present');
    } else {
      for (const [key, value] of Object.entries(manifest.author)) {
        if (!['name', 'email', 'url'].includes(key)) {
          errors.push(`Portable plugin author property ${key} is outside the supported name/email/url fields`);
        } else if (typeof value !== 'string') {
          errors.push(`Portable plugin author.${key} must be a string when present`);
        }
      }
    }
  }

  if (manifest.keywords !== undefined) {
    if (!Array.isArray(manifest.keywords)) {
      errors.push('Portable plugin keywords must be an array of strings when present');
    } else {
      for (const [index, item] of manifest.keywords.entries()) {
        if (typeof item !== 'string') {
          errors.push(`Portable plugin keywords[${index}] must be a string`);
        }
      }
    }
  }

  if (manifest.extensions !== undefined) {
    if (typeof manifest.extensions !== 'object' || manifest.extensions === null || Array.isArray(manifest.extensions)) {
      errors.push('Portable plugin extensions must be a non-array object when present');
    } else {
      for (const [key, value] of Object.entries(manifest.extensions)) {
        if (typeof value !== 'object' || value === null || Array.isArray(value)) {
          errors.push(`Portable plugin extensions.${key} must be a non-array object`);
        }
      }
    }
  }
}

async function validateImmediateSkillDiscovery(skillsRoot, skillNames, errors) {
  let entries;
  try {
    entries = (await readdir(skillsRoot, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
  } catch (error) {
    errors.push(`Portable skills/ directory is missing: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }

  const names = entries.map((entry) => entry.name);
  const expected = [...skillNames].sort();
  if (names.join(',') !== expected.join(',')) {
    errors.push(`Portable skills/ must contain exactly these immediate skill directories: ${expected.join(', ')}, got: ${names.join(', ')}`);
    return;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      errors.push(`Portable skills/${entry.name} must be a directory`);
      continue;
    }

    const skillDir = path.join(skillsRoot, entry.name);
    const children = (await readdir(skillDir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));

    const skillMarkdown = children.find((child) => child.name === 'SKILL.md');
    if (!skillMarkdown || !skillMarkdown.isFile()) {
      errors.push(`Portable skills/${entry.name} must contain a regular SKILL.md file`);
      continue;
    }

    const nested = [];
    for (const child of children) {
      if (child.isDirectory()) {
        await collectNestedSkillMarkdown(path.join(skillDir, child.name), nested);
      }
    }
    if (nested.length > 0) {
      errors.push(`Portable skills/${entry.name} must not contain nested SKILL.md discovery`);
      continue;
    }

    await validateSkillFrontmatter(path.join(skillDir, 'SKILL.md'), entry.name, errors);
  }
}

async function collectNestedSkillMarkdown(dir, found) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      await collectNestedSkillMarkdown(path.join(dir, entry.name), found);
    } else if (entry.isFile() && entry.name === 'SKILL.md') {
      found.push(path.join(dir, entry.name));
    }
  }
}

async function validateSkillFrontmatter(skillPath, directoryName, errors) {
  const content = await readFile(skillPath, 'utf8');
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) {
    errors.push(`Portable skills/${directoryName}/SKILL.md has no frontmatter block`);
    return;
  }

  const nameLine = match[1].split(/\r?\n/).find((line) => /^name:\s*\S/.test(line));
  if (!nameLine) {
    errors.push(`Portable skills/${directoryName}/SKILL.md frontmatter has no name`);
    return;
  }

  const skillName = nameLine.replace(/^name:\s*/, '').trim();
  if (skillName !== directoryName) {
    errors.push(`Portable skills/${directoryName}/SKILL.md frontmatter name ${JSON.stringify(skillName)} must match its directory`);
  }

  const descriptionLine = match[1].split(/\r?\n/).find((line) => /^description:/.test(line));
  if (!descriptionLine) {
    errors.push(`Portable skills/${directoryName}/SKILL.md frontmatter has no description`);
    return;
  }

  const skillDescription = descriptionLine.replace(/^description:\s*/, '').trim();
  if (skillDescription.length === 0) {
    errors.push(`Portable skills/${directoryName}/SKILL.md frontmatter description must not be empty`);
  }
  if (skillDescription.length > 1024) {
    errors.push(`Portable skills/${directoryName}/SKILL.md frontmatter description must be at most 1024 characters`);
  }
}

async function validateRootContainment(pluginRoot, errors) {
  const resolvedRoot = await realpath(pluginRoot);
  const entries = await readdir(pluginRoot, { recursive: true });

  for (const relativePath of entries) {
    const candidatePath = path.join(pluginRoot, relativePath);
    const info = await lstat(candidatePath);

    if (info.isSymbolicLink()) {
      errors.push(`Portable artifact must not contain symlinks: ${relativePath}`);
      continue;
    }

    if (!info.isFile() && !info.isDirectory()) {
      errors.push(`Portable artifact path is neither a regular file nor a directory: ${relativePath}`);
    }

    const resolvedEntry = await realpath(candidatePath);
    if (resolvedEntry !== resolvedRoot && !resolvedEntry.startsWith(`${resolvedRoot}${path.sep}`)) {
      errors.push(`Portable artifact path escapes the plugin root: ${relativePath}`);
    }
  }
}
