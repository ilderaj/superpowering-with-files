import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { fetchCommand } from '../../harness/installer/commands/fetch.mjs';
import { updateCommand } from '../../harness/installer/commands/update.mjs';

const execFileAsync = promisify(execFile);

async function withCwd(dir, fn) {
  const previous = process.cwd();
  process.chdir(dir);
  try {
    return await fn();
  } finally {
    process.chdir(previous);
  }
}

async function createGitSource(root, content) {
  await mkdir(root, { recursive: true });
  await execFileAsync('git', ['init'], { cwd: root });
  await writeFile(path.join(root, 'SKILL.md'), content);
  await execFileAsync('git', ['add', 'SKILL.md'], { cwd: root });
  await execFileAsync(
    'git',
    ['-c', 'user.name=Harness Test', '-c', 'user.email=harness@example.invalid', 'commit', '-m', 'initial'],
    { cwd: root }
  );
}

async function writeSources(root, source) {
  await mkdir(path.join(root, 'harness/upstream'), { recursive: true });
  await writeFile(
    path.join(root, 'harness/upstream/sources.json'),
    JSON.stringify({
      schemaVersion: 1,
      sources: {
        'planning-with-files': {
          type: 'git',
          url: source,
          path: 'harness/upstream/planning-with-files'
        }
      }
    })
  );
}

test('fetchCommand stages git planning-with-files candidate without touching core', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'harness-fetch-'));
  const source = await mkdtemp(path.join(os.tmpdir(), 'harness-local-source-'));
  try {
    await writeSources(root, source);
    await mkdir(path.join(root, 'harness/core/policy'), { recursive: true });
    await writeFile(path.join(root, 'harness/core/policy/base.md'), 'core policy');
    await createGitSource(source, '# Planning With Files\n');

    await withCwd(root, () => fetchCommand(['--source=planning-with-files']));

    assert.equal(
      await readFile(path.join(root, '.harness/upstream-candidates/planning-with-files/SKILL.md'), 'utf8'),
      '# Planning With Files\n'
    );
    assert.equal(await readFile(path.join(root, 'harness/core/policy/base.md'), 'utf8'), 'core policy');
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(source, { recursive: true, force: true });
  }
});

test('updateCommand applies candidate only to harness upstream path', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'harness-update-'));
  const source = await mkdtemp(path.join(os.tmpdir(), 'harness-local-source-'));
  try {
    await writeSources(root, source);
    await mkdir(path.join(root, 'harness/core/policy'), { recursive: true });
    await mkdir(path.join(root, 'harness/upstream/planning-with-files'), { recursive: true });
    await writeFile(path.join(root, 'harness/core/policy/base.md'), 'core policy');
    await writeFile(path.join(root, 'harness/upstream/planning-with-files/SKILL.md'), 'old skill');
    await createGitSource(source, 'new skill');

    await withCwd(root, async () => {
      await fetchCommand(['--source=planning-with-files']);
      await updateCommand(['--source=planning-with-files']);
    });

    assert.equal(await readFile(path.join(root, 'harness/upstream/planning-with-files/SKILL.md'), 'utf8'), 'new skill');
    assert.equal(await readFile(path.join(root, 'harness/core/policy/base.md'), 'utf8'), 'core policy');
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(source, { recursive: true, force: true });
  }
});

test('updateCommand leaves IDE projections to later sync', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'harness-update-sync-boundary-'));
  const source = await mkdtemp(path.join(os.tmpdir(), 'harness-local-source-'));
  try {
    await writeSources(root, source);
    await mkdir(path.join(root, 'harness/upstream/planning-with-files'), { recursive: true });
    await mkdir(path.join(root, '.github/skills/planning-with-files'), { recursive: true });
    await writeFile(path.join(root, '.github/skills/planning-with-files/SKILL.md'), 'old projected skill');
    await createGitSource(source, 'new upstream skill');

    await withCwd(root, async () => {
      await fetchCommand(['--source=planning-with-files']);
      await updateCommand(['--source=planning-with-files']);
    });

    assert.equal(await readFile(path.join(root, 'harness/upstream/planning-with-files/SKILL.md'), 'utf8'), 'new upstream skill');
    assert.equal(await readFile(path.join(root, '.github/skills/planning-with-files/SKILL.md'), 'utf8'), 'old projected skill');
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(source, { recursive: true, force: true });
  }
});

test('updateCommand rejects source metadata that targets harness core', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'harness-update-guard-'));
  try {
    await mkdir(path.join(root, 'harness/upstream'), { recursive: true });
    await mkdir(path.join(root, '.harness/upstream-candidates/evil'), { recursive: true });
    await writeFile(path.join(root, '.harness/upstream-candidates/evil/file.md'), 'evil');
    await writeFile(
      path.join(root, 'harness/upstream/sources.json'),
      JSON.stringify({
        schemaVersion: 1,
        sources: {
          evil: { type: 'local-initial-import', path: 'harness/core/policy' }
        }
      })
    );

    await assert.rejects(
      withCwd(root, () => updateCommand(['--source=evil'])),
      /must stay inside harness\/upstream|outside allowed root/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
