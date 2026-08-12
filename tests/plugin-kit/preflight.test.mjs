import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildPlugin } from '../../packages/plugin-kit/src/build-plugin.mjs';
import { validateBuiltPlugin } from '../../packages/plugin-kit/src/preflight.mjs';
import { validatePortablePlugin } from '../../packages/plugin-kit/src/portable-validation.mjs';

test('validateBuiltPlugin accepts a generated Codex Trio plugin root', async () => {
  const workDir = await mkdtemp(path.join(os.tmpdir(), 'harness-preflight-'));
  const build = await buildPlugin({ target: 'codex', version: '1.0.9', outDir: path.join(workDir, 'plugins') });
  const result = await validateBuiltPlugin({ target: 'codex', pluginRoot: build.pluginRoot });
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
});

test('validateBuiltPlugin reports missing required files', async () => {
  const workDir = await mkdtemp(path.join(os.tmpdir(), 'harness-preflight-missing-'));
  const build = await buildPlugin({ target: 'codex', version: '1.0.9', outDir: path.join(workDir, 'plugins') });
  await rm(path.join(build.pluginRoot, 'skills/trio/dev/SKILL.md'));

  const result = await validateBuiltPlugin({ target: 'codex', pluginRoot: build.pluginRoot });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes('skills/trio/dev/SKILL.md')));
});

test('validateBuiltPlugin rejects an entire runtime directory', async () => {
  const workDir = await mkdtemp(path.join(os.tmpdir(), 'harness-preflight-runtime-'));
  const build = await buildPlugin({ target: 'codex', version: '1.0.9', outDir: path.join(workDir, 'plugins') });
  await mkdir(path.join(build.pluginRoot, 'runtime'), { recursive: true });
  await writeFile(path.join(build.pluginRoot, 'runtime/forbidden.mjs'), 'bad runtime\n');

  const result = await validateBuiltPlugin({ target: 'codex', pluginRoot: build.pluginRoot });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes('runtime/')));
});

test('validateBuiltPlugin accepts a generated Agent Plugins portable root', async () => {
  const workDir = await mkdtemp(path.join(os.tmpdir(), 'harness-preflight-portable-'));
  const build = await buildPlugin({ target: 'agent-plugins', version: '1.1.0', outDir: path.join(workDir, 'plugins') });

  const result = await validateBuiltPlugin({ target: 'agent-plugins', pluginRoot: build.pluginRoot });
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
});

test('portable validation rejects a wrong schema URL', async () => {
  const workDir = await mkdtemp(path.join(os.tmpdir(), 'harness-portable-schema-'));
  const build = await buildPlugin({ target: 'agent-plugins', version: '1.1.0', outDir: path.join(workDir, 'plugins') });
  const manifestPath = path.join(build.pluginRoot, 'plugin.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifest.$schema = 'https://example.invalid/schema.json';
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const result = await validatePortablePlugin({ pluginRoot: build.pluginRoot });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes('$schema')));
});

test('portable validation rejects fields outside the closed manifest schema', async () => {
  const workDir = await mkdtemp(path.join(os.tmpdir(), 'harness-portable-closed-'));
  const build = await buildPlugin({ target: 'agent-plugins', version: '1.1.0', outDir: path.join(workDir, 'plugins') });
  const manifestPath = path.join(build.pluginRoot, 'plugin.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifest.skills = './skills/';
  manifest.interface = { displayName: 'Harness' };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const result = await validatePortablePlugin({ pluginRoot: build.pluginRoot });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes('outside the closed Agent Plugins v1 schema: skills')));
  assert.ok(result.errors.some((error) => error.includes('outside the closed Agent Plugins v1 schema: interface')));
});

test('portable validation enforces the lowercase package-name constraint', async () => {
  const workDir = await mkdtemp(path.join(os.tmpdir(), 'harness-portable-name-'));
  const build = await buildPlugin({ target: 'agent-plugins', version: '1.1.0', outDir: path.join(workDir, 'plugins') });
  const manifestPath = path.join(build.pluginRoot, 'plugin.json');

  for (const invalidName of ['Harness-Plugin', 'harness--plugin', 'harness..plugin', '-harness', 'harness-']) {
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    manifest.name = invalidName;
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    const result = await validatePortablePlugin({ pluginRoot: build.pluginRoot });
    assert.equal(result.ok, false, `name ${invalidName} must be rejected`);
    assert.ok(result.errors.some((error) => error.includes('valid lowercase package name')));
  }
});

test('portable validation rejects a non-object top-level manifest', async () => {
  const workDir = await mkdtemp(path.join(os.tmpdir(), 'harness-portable-top-'));
  const build = await buildPlugin({ target: 'agent-plugins', version: '1.1.0', outDir: path.join(workDir, 'plugins') });
  await writeFile(path.join(build.pluginRoot, 'plugin.json'), '[1, 2, 3]\n');

  const result = await validatePortablePlugin({ pluginRoot: build.pluginRoot });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes('must be a non-array object')));
});

test('portable validation rejects non-string manifest fields', async () => {
  const workDir = await mkdtemp(path.join(os.tmpdir(), 'harness-portable-types-'));
  const build = await buildPlugin({ target: 'agent-plugins', version: '1.1.0', outDir: path.join(workDir, 'plugins') });
  const manifestPath = path.join(build.pluginRoot, 'plugin.json');

  for (const [field, value] of [
    ['description', 7],
    ['version', 11],
    ['homepage', { url: 'https://example.invalid' }],
    ['repository', ['https://example.invalid']],
    ['license', true]
  ]) {
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    manifest[field] = value;
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    const result = await validatePortablePlugin({ pluginRoot: build.pluginRoot });
    assert.equal(result.ok, false, `field ${field} with non-string value must be rejected`);
    assert.ok(
      result.errors.some((error) => error.includes(`${field} must be a string`)),
      `field ${field} must report a string type error`
    );
  }
});

test('portable validation rejects malformed author objects', async () => {
  const workDir = await mkdtemp(path.join(os.tmpdir(), 'harness-portable-author-'));
  const build = await buildPlugin({ target: 'agent-plugins', version: '1.1.0', outDir: path.join(workDir, 'plugins') });
  const manifestPath = path.join(build.pluginRoot, 'plugin.json');

  const cases = [
    ['author as string', 'Superpowering With Files', 'author must be a non-array object'],
    ['author with extra property', { name: 'Superpowering With Files', role: 'owner' }, 'outside the supported name/email/url fields'],
    ['author with non-string property', { name: 'Superpowering With Files', email: 42 }, 'author.email must be a string']
  ];

  for (const [label, author, expectedError] of cases) {
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    manifest.author = author;
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    const result = await validatePortablePlugin({ pluginRoot: build.pluginRoot });
    assert.equal(result.ok, false, `${label} must be rejected`);
    assert.ok(result.errors.some((error) => error.includes(expectedError)), `${label} must report ${expectedError}`);
  }
});

test('portable validation rejects malformed keywords arrays', async () => {
  const workDir = await mkdtemp(path.join(os.tmpdir(), 'harness-portable-keywords-'));
  const build = await buildPlugin({ target: 'agent-plugins', version: '1.1.0', outDir: path.join(workDir, 'plugins') });
  const manifestPath = path.join(build.pluginRoot, 'plugin.json');

  const cases = [
    ['keywords as string', 'harness', 'keywords must be an array of strings'],
    ['keywords with non-string item', ['harness', 5], 'keywords[1] must be a string']
  ];

  for (const [label, keywords, expectedError] of cases) {
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    manifest.keywords = keywords;
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    const result = await validatePortablePlugin({ pluginRoot: build.pluginRoot });
    assert.equal(result.ok, false, `${label} must be rejected`);
    assert.ok(result.errors.some((error) => error.includes(expectedError)), `${label} must report ${expectedError}`);
  }
});

test('portable validation rejects malformed extensions objects', async () => {
  const workDir = await mkdtemp(path.join(os.tmpdir(), 'harness-portable-extensions-'));
  const build = await buildPlugin({ target: 'agent-plugins', version: '1.1.0', outDir: path.join(workDir, 'plugins') });
  const manifestPath = path.join(build.pluginRoot, 'plugin.json');

  const cases = [
    ['extensions as array', [], 'extensions must be a non-array object'],
    ['extensions with array value', { 'com.example': [] }, 'extensions.com.example must be a non-array object']
  ];

  for (const [label, extensions, expectedError] of cases) {
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    manifest.extensions = extensions;
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    const result = await validatePortablePlugin({ pluginRoot: build.pluginRoot });
    assert.equal(result.ok, false, `${label} must be rejected`);
    assert.ok(result.errors.some((error) => error.includes(expectedError)), `${label} must report ${expectedError}`);
  }
});

test('portable validation accepts a schema-valid non-semver version string', async () => {
  const workDir = await mkdtemp(path.join(os.tmpdir(), 'harness-portable-version-'));
  const build = await buildPlugin({ target: 'agent-plugins', version: '1.1.0', outDir: path.join(workDir, 'plugins') });
  const manifestPath = path.join(build.pluginRoot, 'plugin.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifest.version = '2026.08-draft';
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const result = await validatePortablePlugin({ pluginRoot: build.pluginRoot });
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
});

test('portable validation rejects nested skill discovery', async () => {
  const workDir = await mkdtemp(path.join(os.tmpdir(), 'harness-portable-nested-'));
  const build = await buildPlugin({ target: 'agent-plugins', version: '1.1.0', outDir: path.join(workDir, 'plugins') });
  await mkdir(path.join(build.pluginRoot, 'skills/trio/dev'), { recursive: true });
  await writeFile(path.join(build.pluginRoot, 'skills/trio/dev/SKILL.md'), '---\nname: dev\n---\n');

  const result = await validatePortablePlugin({ pluginRoot: build.pluginRoot });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes('no nested discovery')));
});

test('portable validation rejects frontmatter name that does not match its directory', async () => {
  const workDir = await mkdtemp(path.join(os.tmpdir(), 'harness-portable-frontmatter-'));
  const build = await buildPlugin({ target: 'agent-plugins', version: '1.1.0', outDir: path.join(workDir, 'plugins') });
  await writeFile(
    path.join(build.pluginRoot, 'skills/dev/SKILL.md'),
    '---\nname: development\n---\n# Development\n'
  );

  const result = await validatePortablePlugin({ pluginRoot: build.pluginRoot });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes('must match its directory')));
});

test('portable validation rejects missing or blank skill descriptions', async () => {
  const workDir = await mkdtemp(path.join(os.tmpdir(), 'harness-portable-description-'));
  const build = await buildPlugin({ target: 'agent-plugins', version: '1.1.0', outDir: path.join(workDir, 'plugins') });
  const devSkillPath = path.join(build.pluginRoot, 'skills/dev/SKILL.md');

  await writeFile(devSkillPath, '---\nname: dev\n---\n# Dev\n');
  let result = await validatePortablePlugin({ pluginRoot: build.pluginRoot });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes('frontmatter has no description')));

  await writeFile(devSkillPath, '---\nname: dev\ndescription:\n---\n# Dev\n');
  result = await validatePortablePlugin({ pluginRoot: build.pluginRoot });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes('description must not be empty')));
});

test('portable validation rejects skill descriptions longer than 1024 characters', async () => {
  const workDir = await mkdtemp(path.join(os.tmpdir(), 'harness-portable-description-long-'));
  const build = await buildPlugin({ target: 'agent-plugins', version: '1.1.0', outDir: path.join(workDir, 'plugins') });
  const devSkillPath = path.join(build.pluginRoot, 'skills/dev/SKILL.md');
  const overlong = 'd'.repeat(1025);

  await writeFile(devSkillPath, `---\nname: dev\ndescription: ${overlong}\n---\n# Dev\n`);

  const result = await validatePortablePlugin({ pluginRoot: build.pluginRoot });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes('at most 1024 characters')));
});

test('portable validation rejects symlinks and proves regular-file containment', async () => {
  const workDir = await mkdtemp(path.join(os.tmpdir(), 'harness-portable-symlink-'));
  const build = await buildPlugin({ target: 'agent-plugins', version: '1.1.0', outDir: path.join(workDir, 'plugins') });
  const { symlink } = await import('node:fs/promises');
  await symlink(path.join(build.pluginRoot, 'plugin.json'), path.join(build.pluginRoot, 'skills/trio/escape.json'));

  const result = await validatePortablePlugin({ pluginRoot: build.pluginRoot });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes('must not contain symlinks')));
});

test('portable validation requires exactly five immediate skill directories', async () => {
  const workDir = await mkdtemp(path.join(os.tmpdir(), 'harness-portable-skills-'));
  const build = await buildPlugin({ target: 'agent-plugins', version: '1.1.0', outDir: path.join(workDir, 'plugins') });
  await mkdir(path.join(build.pluginRoot, 'skills/extra'));
  await writeFile(path.join(build.pluginRoot, 'skills/extra/SKILL.md'), '---\nname: extra\n---\n');

  const result = await validatePortablePlugin({ pluginRoot: build.pluginRoot });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes('exactly the five immediate skill directories')));
});
