import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LOCKED_SKILLS } from '../../packages/plugin-kit/src/matt-skills-lock.mjs';
import {
  MATT_SKILLS_INVENTORY,
  mattSkillsCorpusRoot,
  verifyMattSkillsSource,
  loadMattSkillsSource,
} from '../../packages/plugin-kit/src/matt-skills-source.mjs';

const EXPECTED_INVENTORY = Object.freeze([
  'ask-matt',
  'code-review',
  'codebase-design',
  'diagnosing-bugs',
  'domain-modeling',
  'grill-me',
  'grill-with-docs',
  'grilling',
  'handoff',
  'implement',
  'improve-codebase-architecture',
  'prototype',
  'research',
  'resolving-merge-conflicts',
  'tdd',
  'teach',
  'to-questionnaire',
  'to-spec',
  'to-tickets',
  'triage',
  'wait-what',
  'wayfinder',
  'wizard',
  'writing-for-agents',
]);

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
  assert.deepEqual([...MATT_SKILLS_INVENTORY].sort(), [...EXPECTED_INVENTORY]);
  assert.equal(LOCKED_SKILLS.length, 24);
});

test('real corpus verifies and loads', async () => {
  const result = await verifyMattSkillsSource();
  assert.equal(result.ok, true, result.errors.join('\n'));

  const loaded = await loadMattSkillsSource();
  assert.deepEqual(Object.keys(loaded.skills).sort(), [...EXPECTED_INVENTORY]);
  for (const skill of LOCKED_SKILLS) {
    const rawBody = await readFile(join(mattSkillsCorpusRoot(), skill.name, 'SKILL.md'));
    assert.equal(createHash('sha256').update(rawBody).digest('hex'), skill.sha256, 'raw pin for ' + skill.name);
    assert.ok(loaded.skills[skill.name].length > 0, 'body for ' + skill.name + ' is empty');
    for (const file of skill.files) {
      assert.ok(
        await readFile(join(mattSkillsCorpusRoot(), skill.name, file.path), 'utf8').then((text) => text.length > 0),
        'corpus file for ' + skill.name + '/' + file.path + ' is empty',
      );
    }
  }
  assert.equal(loaded.metadata.bodyPatch, false);
  assert.ok(loaded.license.length > 0, 'license is empty');
  assert.equal(loaded.metadata.repo, 'https://github.com/mattpocock/skills');
  assert.equal(loaded.metadata.tag, 'v1.2.3');
  assert.equal(loaded.metadata.tagObject, '835450ef244ab7335f75d95b83e7d979eae22a6d');
  assert.equal(loaded.metadata.commit, '6acc160e4e0cd062dbbbd7a1b26ae92855edf07e');
  assert.deepEqual(loaded.overlays, ['grilling']);
});

test('rejects unsupported skill in metadata inventory', async () => {
  const result = await withCorpus(async (dir) => {
    const metadata = JSON.parse(await readFile(join(dir, 'UPSTREAM.json'), 'utf8'));
    metadata.skills.push({
      name: 'not-a-matt-skill',
      originalPath: 'skills/productivity/not-a-matt-skill',
      sha256: '0'.repeat(64),
      files: [],
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

test('rejects extra unlisted file in a corpus skill directory', async () => {
  const result = await withCorpus(async (dir) => {
    await writeFile(join(dir, 'to-questionnaire', 'stray.md'), 'x');
  });
  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some((error) => error.includes('unsupported inventory entry in corpus') && error.includes('to-questionnaire/stray.md')),
    result.errors.join('\n'),
  );
});

test('rejects missing body', async () => {
  const result = await withCorpus(async (dir) => {
    await rm(join(dir, 'grill-me', 'SKILL.md'), { force: true });
  });
  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some((error) => error.includes('missing body') && error.includes('grill-me/SKILL.md')),
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

test('rejects altered extra file in a multi-file skill directory', async () => {
  const multi = LOCKED_SKILLS.find((skill) => skill.files.length > 1);
  const extra = multi.files.find((file) => file.path !== 'SKILL.md');
  const result = await withCorpus(async (dir) => {
    await writeFile(
      join(dir, multi.name, extra.path),
      (await readFile(join(dir, multi.name, extra.path), 'utf8')) + '\n',
    );
  });
  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some((error) => error.includes('body digest mismatch') && error.includes(multi.name + '/' + extra.path)),
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
    const grillMe = metadata.skills.find((skill) => skill.name === 'grill-me');
    grillMe.sha256 = '0'.repeat(64);
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
  const grillingProvenance = loaded.overlayProvenance.find((entry) => entry.name === 'grilling');
  assert.ok(grillingProvenance, 'grilling overlay provenance should be emitted');
  assert.equal(
    grillingProvenance.corpusSha256,
    'fa5c1e5ee76b1c8f1ae56101f52c9e239de75d5c578adc61227b92d10b7e52ef',
  );
  assert.equal(
    grillingProvenance.overlaySha256,
    createHash('sha256').update(await readFile(new URL('../../harness/core/upstream-overlays/mattpocock/grilling/SKILL.md', import.meta.url))).digest('hex'),
  );
  assert.equal(loaded.skills.grilling, await readFile(new URL('../../harness/core/upstream-overlays/mattpocock/grilling/SKILL.md', import.meta.url), 'utf8'));
  assert.notEqual(grillingProvenance.overlaySha256, grillingProvenance.corpusSha256);
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
