import { test } from 'node:test';
import assert from 'node:assert/strict';
import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const skillsRoot = path.join(process.cwd(), 'harness/core/skills');
const requiredSections = ['Outcome Contract', 'When to Use', 'Common Mistakes'];
const retiredLocalSkillPaths = [
  'harness/core/skills/risk-assessment-before-destructive-changes/SKILL.md',
  'harness/core/skills/safe-bypass-flow/SKILL.md',
  'harness/core/skills/second-opinion/SKILL.md'
];

async function localSkillFiles() {
  const entries = await readdir(skillsRoot, { withFileTypes: true });
  const candidates = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(skillsRoot, entry.name, 'SKILL.md'));

  const existing = await Promise.all(
    candidates.map(async (file) => {
      try {
        await access(file);
        return file;
      } catch {
        return null;
      }
    })
  );

  return existing.filter(Boolean).sort();
}

function extractSectionBody(text, title) {
  const heading = `## ${title}`;
  const index = text.indexOf(heading);
  if (index === -1) {
    return null;
  }

  const lineEnd = text.indexOf('\n', index);
  const remainder = lineEnd === -1 ? '' : text.slice(lineEnd + 1);
  const nextHeadingOffset = remainder.search(/^## /m);
  const body = nextHeadingOffset === -1 ? remainder : remainder.slice(0, nextHeadingOffset);
  return { index, body: body.trim() };
}

test('risk assessment local skill is physically retired', async () => {
  for (const relativePath of retiredLocalSkillPaths) {
    await assert.rejects(access(path.join(process.cwd(), relativePath)), { code: 'ENOENT' });
  }
});

test('Harness-owned local skills use Waza-style outcome contracts without adding always-on prompt text', async () => {
  const files = await localSkillFiles();
  assert.ok(files.length > 0, 'expected local Harness skills');

  for (const file of files) {
    const text = await readFile(file, 'utf8');
    assert.match(text, /^---[\s\S]*^name:\s*\S+/m, file);
    assert.match(text, /^---[\s\S]*^description:\s*.+/m, file);
    let previousIndex = -1;
    const sections = new Map(
      requiredSections.map((title) => {
        const section = extractSectionBody(text, title);
        assert.ok(section, `${file}: missing ## ${title}`);
        assert.notEqual(section.body, '', `${file}: ## ${title} must have body content`);
        assert.ok(section.index > previousIndex, `${file}: ## ${title} must appear after prior required section`);
        previousIndex = section.index;
        return [title, section];
      })
    );

    assert.doesNotMatch(text, /TBD|TODO|implement later/i, file);
  }
});
