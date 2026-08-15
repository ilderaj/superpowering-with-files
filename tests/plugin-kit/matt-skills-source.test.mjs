import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  MATT_SKILLS_INVENTORY,
  mattSkillsCorpusRoot,
  verifyMattSkillsSource,
  loadMattSkillsSource,
} from '../../packages/plugin-kit/src/matt-skills-source.mjs';

const LOCKED_BODY_DIGESTS = Object.freeze({
  'grill-me': '6189dfceb7304a6e5558f75d87e68fa3bc7fcf7ba120e44f21f8a61fe01eba54',
  grilling: 'fa5c1e5ee76b1c8f1ae56101f52c9e239de75d5c578adc61227b92d10b7e52ef',
  'to-questionnaire': '8e7f9ed8d7b2e66babf1a54aee9b94319bf38c32619cffe78819df6518ead5fc',
});

async function copyCorpus() {
  const dir = await mkdtemp(join(tmpdir(), 'matt-skills-source-'));
  await cp(mattSkillsCorpusRoot(), dir, { recursive: true });
  return dir;
}

async function withCorpus(mutate) {
  const dir = await copyCorpus();
  try {
    await mutate(dir);
    return await verifyMattSkillsSource({ corpusRoot: dir });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('approved inventory matches the locked v1.2.3 corpus', () => {
  assert.deepEqual([...MATT_SKILLS_INVENTORY], ['grill-me', 'grilling', 'to-questionnaire']);
});

test('real corpus verifies and loads', async () => {
  const result = await verifyMattSkillsSource();
  assert.equal(result.ok, true, result.errors.join('\n'));

  const loaded = await loadMattSkillsSource();
  assert.deepEqual(Object.keys(loaded.skills).sort(), ['grill-me', 'grilling', 'to-questionnaire']);
  for (const [name, digest] of Object.entries(LOCKED_BODY_DIGESTS)) {
    assert.ok(loaded.skills[name].length > 0, `body for ${name} is empty`);
    assert.equal(loaded.metadata.bodyPatch, false);
  }
  assert.ok(loaded.license.length > 0, 'license is empty');
  assert.equal(loaded.metadata.repo, 'https://github.com/mattpocock/skills');
  assert.equal(loaded.metadata.tag, 'v1.2.3');
  assert.equal(loaded.metadata.tagObject, '835450ef244ab7335f75d95b83e7d979eae22a6d');
  assert.equal(loaded.metadata.commit, '6acc160e4e0cd062dbbbd7a1b26ae92855edf07e');
});

test('rejects unsupported skill in metadata inventory', async () => {
  const result = await withCorpus(async (dir) => {
    const metadata = JSON.parse(await readFile(join(dir, 'UPSTREAM.json'), 'utf8'));
    metadata.skills.push({
      name: 'not-a-matt-skill',
      corpusPath: 'not-a-matt-skill/SKILL.md',
      originalPath: 'skills/productivity/not-a-matt-skill/SKILL.md',
      sha256: '0'.repeat(64),
    });
    await writeFile(join(dir, 'UPSTREAM.json'), JSON.stringify(metadata, null, 2));
  });
  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some((error) => error.includes('unsupported skill in inventory') && error.includes('not-a-matt-skill')),
    result.errors.join('\n'),
  );
});

test('rejects unexpected top-level corpus entries', async () => {
  const result = await withCorpus(async (dir) => {
    await writeFile(join(dir, 'stray.txt'), 'x');
  });
  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some((error) => error.includes('unsupported inventory entry in corpus') && error.includes('stray.txt')),
    result.errors.join('\n'),
  );
});

test('rejects missing body', async () => {
  const result = await withCorpus(async (dir) => {
    await rm(join(dir, 'grill-me', 'SKILL.md'), { force: true });
  });
  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some((error) => error.includes('missing body') && error.includes('grill-me')),
    result.errors.join('\n'),
  );
});

test('rejects altered body', async () => {
  const result = await withCorpus(async (dir) => {
    await writeFile(join(dir, 'grilling', 'SKILL.md'), (await readFile(join(dir, 'grilling', 'SKILL.md'), 'utf8')) + '\n');
  });
  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some((error) => error.includes('body digest mismatch') && error.includes('grilling')),
    result.errors.join('\n'),
  );
});

test('rejects missing license', async () => {
  const result = await withCorpus(async (dir) => {
    await rm(join(dir, 'LICENSE'), { force: true });
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes('missing license')), result.errors.join('\n'));
});

test('rejects altered license', async () => {
  const result = await withCorpus(async (dir) => {
    await writeFile(join(dir, 'LICENSE'), (await readFile(join(dir, 'LICENSE'), 'utf8')) + '\n');
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes('license digest mismatch')), result.errors.join('\n'));
});

test('rejects missing metadata', async () => {
  const result = await withCorpus(async (dir) => {
    await rm(join(dir, 'UPSTREAM.json'), { force: true });
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes('UPSTREAM.json')), result.errors.join('\n'));
});

test('rejects altered provenance metadata', async () => {
  const result = await withCorpus(async (dir) => {
    const metadata = JSON.parse(await readFile(join(dir, 'UPSTREAM.json'), 'utf8'));
    metadata.commit = '0'.repeat(40);
    await writeFile(join(dir, 'UPSTREAM.json'), JSON.stringify(metadata, null, 2));
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes('commit mismatch')), result.errors.join('\n'));
});

test('rejects altered metadata digest', async () => {
  const result = await withCorpus(async (dir) => {
    const metadata = JSON.parse(await readFile(join(dir, 'UPSTREAM.json'), 'utf8'));
    metadata.skills[0].sha256 = '0'.repeat(64);
    await writeFile(join(dir, 'UPSTREAM.json'), JSON.stringify(metadata, null, 2));
  });
  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some((error) => error.includes('sha256 mismatch') && error.includes('grill-me')),
    result.errors.join('\n'),
  );
});

test('rejects missing skill entry in metadata', async () => {
  const result = await withCorpus(async (dir) => {
    const metadata = JSON.parse(await readFile(join(dir, 'UPSTREAM.json'), 'utf8'));
    metadata.skills = metadata.skills.filter((skill) => skill.name !== 'grilling');
    await writeFile(join(dir, 'UPSTREAM.json'), JSON.stringify(metadata, null, 2));
  });
  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some((error) => error.includes('missing skill entry in metadata') && error.includes('grilling')),
    result.errors.join('\n'),
  );
});

test('rejects missing bodyPatch', async () => {
  const result = await withCorpus(async (dir) => {
    const metadata = JSON.parse(await readFile(join(dir, 'UPSTREAM.json'), 'utf8'));
    delete metadata.bodyPatch;
    await writeFile(join(dir, 'UPSTREAM.json'), JSON.stringify(metadata, null, 2));
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes('bodyPatch')), result.errors.join('\n'));
});

test('rejects non-false bodyPatch', async () => {
  const result = await withCorpus(async (dir) => {
    const metadata = JSON.parse(await readFile(join(dir, 'UPSTREAM.json'), 'utf8'));
    metadata.bodyPatch = true;
    await writeFile(join(dir, 'UPSTREAM.json'), JSON.stringify(metadata, null, 2));
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes('bodyPatch')), result.errors.join('\n'));
});

test('loadMattSkillsSource throws on verification failure', async () => {
  const dir = await copyCorpus();
  try {
    await rm(join(dir, 'LICENSE'), { force: true });
    await assert.rejects(
      () => loadMattSkillsSource({ corpusRoot: dir }),
      (error) => error.code === 'MATT_SKILLS_VERIFICATION_FAILED',
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('overlay replaces grilling body without touching the pinned corpus', async () => {
  const loaded = await loadMattSkillsSource();
  assert.ok(loaded.overlays.includes('grilling'), 'grilling overlay should be applied');
  assert.ok(
    loaded.skills.grilling.includes('request_user_input'),
    'overlay body should contain the plan-mode question-card flow',
  );
  assert.ok(
    loaded.skills.grilling.includes('Ask the whole frontier in one round, then wait'),
    'overlay body should keep the frontier-round structure',
  );
  const result = await verifyMattSkillsSource();
  assert.equal(result.ok, true, result.errors.join('\n'));
});
