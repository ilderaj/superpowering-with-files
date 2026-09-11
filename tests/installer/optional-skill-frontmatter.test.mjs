import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Guard: every optional-skill SKILL.md must parse under a standard YAML
// frontmatter loader. An unquoted plain scalar containing a colon followed by
// a space becomes a nested mapping, so libyaml rejects the whole block
// ("mapping values are not allowed in this context") and the host cannot
// load, adopt, or auto-trigger the skill -- even when byte-level adoption and
// projection tests all pass.
//
// Mirrors the same guard upstream in
// harness/upstream/planning-with-files/tests/test_skill_frontmatter_valid.py,
// which exists because this exact break shipped in that project once.

const root = fileURLToPath(new URL('../../harness/optional-skills/', import.meta.url));

// YAML indicators that only stay literal inside a quoted or block scalar.
const LEADING_INDICATORS = new Set(['&', '*', '!', '%', '@', '{', '}', '[', ']', ',', '#']);

async function skillFiles(dir) {
  const found = [];
  const entries = (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    if (entry.name === 'node_modules') continue;
    const next = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...await skillFiles(next));
    else if (entry.name === 'SKILL.md') found.push(next);
  }
  return found;
}

function frontmatterBlock(markdown) {
  assert.ok(markdown.startsWith('---\n'), 'skill must start with YAML frontmatter');
  const end = markdown.indexOf('\n---', 4);
  assert.notEqual(end, -1, 'skill frontmatter must close');
  return markdown.slice(4, end);
}

// A dependency-free approximation of "loads as a YAML plain scalar": the
// repository ships no YAML parser, so this rejects the constructs that either
// make libyaml fail or silently truncate, and stays quiet for quoted values.
function assertPlainScalarIsYamlSafe(value, key, label) {
  if (value === '') return;
  const first = value[0];
  if (first === '"' || first === "'" || first === '|' || first === '>') return;
  assert.ok(!/:\s/.test(value), label + ': unquoted frontmatter "' + key + '" contains a colon-space, which YAML reads as a mapping; quote the value');
  assert.ok(!value.endsWith(':'), label + ': unquoted frontmatter "' + key + '" ends with a colon');
  assert.ok(!/\s#/.test(value), label + ': unquoted frontmatter "' + key + '" contains a space then hash, which YAML reads as a comment');
  assert.ok(!LEADING_INDICATORS.has(first), label + ': unquoted frontmatter "' + key + '" starts with the YAML indicator "' + first + '"');
}

function parseFrontmatter(markdown, label) {
  const values = {};
  for (const line of frontmatterBlock(markdown).split('\n')) {
    if (!line.trim()) continue;
    const match = /^([A-Za-z0-9_-]+):(?:[ \t]+(.*))?$/.exec(line);
    assert.ok(match, label + ': not a flat key/value frontmatter line: ' + line);
    const key = match[1];
    const value = match[2] ?? '';
    assert.equal(Object.hasOwn(values, key), false, label + ': duplicate frontmatter key: ' + key);
    assertPlainScalarIsYamlSafe(value, key, label);
    values[key] = value.trim();
  }
  return values;
}

function assertOptionalSkillFrontmatter(markdown, label) {
  const values = parseFrontmatter(markdown, label);
  assert.equal(typeof values.description, 'string', label + ': frontmatter needs a description');
  assert.ok(values.description.trim().length > 0, label + ': description must not be empty');
  assert.ok(values.description.length <= 1024, label + ': description must be at most 1024 characters');
  return values;
}

test('every optional skill declares YAML-loadable frontmatter', async () => {
  const files = await skillFiles(root);
  assert.ok(files.length >= 10, 'expected the curated optional-skill set, found ' + files.length);
  for (const file of files) {
    const directory = basename(dirname(file));
    const values = assertOptionalSkillFrontmatter(await readFile(file, 'utf8'), directory);
    assert.equal(values.name, directory, directory + ': frontmatter name must match its directory');
  }
});

test('ux-design description is quoted so a plain-scalar colon cannot break loading', async () => {
  const markdown = await readFile(join(root, 'ux-design', 'SKILL.md'), 'utf8');
  const values = assertOptionalSkillFrontmatter(markdown, 'ux-design');
  assert.match(values.description, /^"Design judgment and verification/);
  assert.match(values.description, /visuals: screens, pages, dashboards/);
});

test('the guard rejects an unquoted description containing a colon-space', async () => {
  const markdown = await readFile(join(root, 'ux-design', 'SKILL.md'), 'utf8');
  const broken = markdown.replace(/^description: "(.*)"$/m, 'description: $1');
  assert.notEqual(broken, markdown, 'the description is expected to be quoted');
  assert.match(broken, /visuals: screens/, 'mutation keeps the colon-space in place');
  assert.throws(() => assertOptionalSkillFrontmatter(broken, 'ux-design'), /colon-space/);
  assert.doesNotThrow(() => assertOptionalSkillFrontmatter(markdown, 'ux-design'));
});

