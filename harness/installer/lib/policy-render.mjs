import { readFile } from 'node:fs/promises';
import path from 'node:path';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isFenceLine(line) {
  const match = line.match(/^(\s*)(`{3,}|~{3,})(.*)$/);
  if (!match) {
    return null;
  }

  return {
    marker: match[2][0],
    length: match[2].length
  };
}

function splitSections(markdown) {
  const sections = [];
  let current = { title: '__preamble__', lines: [] };
  let activeFence = null;

  for (const line of markdown.split('\n')) {
    const fence = isFenceLine(line);
    if (fence) {
      if (activeFence && activeFence.marker === fence.marker && fence.length >= activeFence.length) {
        activeFence = null;
      } else if (!activeFence) {
        activeFence = fence;
      }

      current.lines.push(line);
      continue;
    }

    if (!activeFence && line.startsWith('## ')) {
      sections.push({
        title: current.title,
        body: current.lines.join('\n').trimEnd()
      });
      current = { title: line.slice(3).trim(), lines: [] };
      continue;
    }

    current.lines.push(line);
  }

  sections.push({
    title: current.title,
    body: current.lines.join('\n').trimEnd()
  });

  return sections.filter((section) => section.body.trim().length > 0);
}

function renderSection(section) {
  if (section.title === '__preamble__') {
    return section.body;
  }

  return `## ${section.title}\n\n${section.body}`;
}

function normalizeProfileNames(profileNames, defaultProfile) {
  if (profileNames === undefined) {
    return [defaultProfile];
  }

  if (Array.isArray(profileNames)) {
    return profileNames;
  }

  return [profileNames];
}

export async function loadPolicyProfiles(rootDir) {
  return JSON.parse(
    await readFile(path.join(rootDir, 'harness/core/policy/entry-profiles.json'), 'utf8')
  );
}

async function renderIncludedPolicyFiles(rootDir, include) {
  const contents = await Promise.all(
    include.map((file) => readFile(path.join(rootDir, 'harness/core/policy', file), 'utf8'))
  );
  return contents.join('\n\n').trim();
}

export async function renderPolicyProfile(rootDir, profileNames) {
  const [basePolicy, entryProfiles] = await Promise.all([
    readFile(path.join(rootDir, 'harness/core/policy/base.md'), 'utf8'),
    loadPolicyProfiles(rootDir)
  ]);
  const resolvedProfileNames = normalizeProfileNames(profileNames, entryProfiles.defaultProfile);
  const sectionProfileNames = [];
  const includeBlocks = [];

  for (const profileName of resolvedProfileNames) {
    const profile = entryProfiles.profiles[profileName];
    if (!profile) {
      throw new Error(`Unknown policy profile: ${profileName}`);
    }

    if (Array.isArray(profile)) {
      sectionProfileNames.push(profileName);
      continue;
    }

    if (isPlainObject(profile) && Array.isArray(profile.include) && profile.include.length > 0) {
      includeBlocks.push(await renderIncludedPolicyFiles(rootDir, profile.include));
      continue;
    }

    throw new Error(`Policy profile ${profileName} must be an array of section names or an include list.`);
  }

  if (includeBlocks.length > 0 && sectionProfileNames.length === 0) {
    return includeBlocks.join('\n\n').trim();
  }

  const profileSections = [];
  for (const profileName of sectionProfileNames) {
    profileSections.push(...entryProfiles.profiles[profileName]);
  }

  const sections = splitSections(basePolicy);
  const wantedSections = new Set(profileSections);
  const renderedSections = sections.filter(
    (section) => section.title === '__preamble__' || wantedSections.has(section.title)
  );
  const missingSections = profileSections.filter(
    (sectionName) => !sections.some((section) => section.title === sectionName)
  );

  if (missingSections.length > 0) {
    throw new Error(
      `Policy profile ${sectionProfileNames.join(', ')} references missing sections: ${missingSections.join(', ')}`
    );
  }

  const rendered = renderedSections.map(renderSection).join('\n\n').trim();
  return [...includeBlocks, rendered].filter(Boolean).join('\n\n').trim();
}
