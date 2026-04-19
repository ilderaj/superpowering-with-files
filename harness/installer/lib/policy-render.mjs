import { readFile } from 'node:fs/promises';
import path from 'node:path';

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

export async function renderPolicyProfile(rootDir, profileNames) {
  const [basePolicy, entryProfilesJson] = await Promise.all([
    readFile(path.join(rootDir, 'harness/core/policy/base.md'), 'utf8'),
    readFile(path.join(rootDir, 'harness/core/policy/entry-profiles.json'), 'utf8')
  ]);

  const entryProfiles = JSON.parse(entryProfilesJson);
  const resolvedProfileNames = normalizeProfileNames(profileNames, entryProfiles.defaultProfile);
  const profileSections = [];

  for (const profileName of resolvedProfileNames) {
    const sections = entryProfiles.profiles[profileName];
    if (!sections) {
      throw new Error(`Unknown policy profile: ${profileName}`);
    }

    profileSections.push(...sections);
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
      `Policy profile ${resolvedProfileNames.join(', ')} references missing sections: ${missingSections.join(', ')}`
    );
  }

  return renderedSections.map(renderSection).join('\n\n').trim();
}
