import { readFile } from 'node:fs/promises';
import path from 'node:path';

function splitSections(markdown) {
  const sections = [];
  let current = { title: '__preamble__', lines: [] };

  for (const line of markdown.split('\n')) {
    if (line.startsWith('## ')) {
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

export async function renderPolicyProfile(rootDir, profileName) {
  const [basePolicy, entryProfilesJson] = await Promise.all([
    readFile(path.join(rootDir, 'harness/core/policy/base.md'), 'utf8'),
    readFile(path.join(rootDir, 'harness/core/policy/entry-profiles.json'), 'utf8')
  ]);

  const entryProfiles = JSON.parse(entryProfilesJson);
  const resolvedProfileName = profileName ?? entryProfiles.defaultProfile;
  const profileSections = entryProfiles.profiles[resolvedProfileName];

  if (!profileSections) {
    throw new Error(`Unknown policy profile: ${resolvedProfileName}`);
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
      `Policy profile ${resolvedProfileName} references missing sections: ${missingSections.join(', ')}`
    );
  }

  return renderedSections.map(renderSection).join('\n\n').trim();
}
