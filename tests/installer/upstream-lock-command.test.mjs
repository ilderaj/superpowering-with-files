import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

function harnessCommand(root, ...args) {
  return execFileAsync('node', [path.join(process.cwd(), 'harness/installer/commands/harness.mjs'), ...args], {
    cwd: root
  });
}

async function createTaggedGitSource(root, { content, tag }) {
  await mkdir(root, { recursive: true });
  await execFileAsync('git', ['init'], { cwd: root });
  await writeFile(path.join(root, 'SKILL.md'), content);
  await execFileAsync('git', ['add', 'SKILL.md'], { cwd: root });
  await execFileAsync(
    'git',
    ['-c', 'user.name=Harness Test', '-c', 'user.email=harness@example.invalid', 'commit', '-m', 'initial'],
    { cwd: root }
  );
  await execFileAsync('git', ['tag', '-a', tag, '-m', tag], { cwd: root });
}

async function writeSourceConfig(root, source) {
  await mkdir(path.join(root, 'harness/upstream'), { recursive: true });
  await writeFile(
    path.join(root, 'harness/upstream/sources.json'),
    JSON.stringify(
      {
        schemaVersion: 2,
        sources: {
          superpowers: {
            type: 'git',
            url: source,
            github: {
              owner: 'fixture',
              repo: 'superpowers'
            },
            path: 'harness/upstream/superpowers',
            resolution: {
              strategy: 'latest-tag',
              allowPrerelease: false,
              fallbacks: []
            }
          }
        }
      },
      null,
      2
    ) + '\n'
  );
}

test('upstream-lock command writes .source-lock.json for selected sources', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'harness-upstream-lock-'));
  const source = await mkdtemp(path.join(os.tmpdir(), 'harness-upstream-lock-source-'));
  try {
    await createTaggedGitSource(source, { content: '# Superpowers v6.1.1\n', tag: 'v6.1.1' });
    await writeSourceConfig(root, source);

    const { stdout } = await harnessCommand(root, 'upstream-lock', '--source=superpowers');
    assert.match(stdout, /Resolved 1 upstream source\(s\) into harness\/upstream\/\.source-lock\.json/);

    const lock = JSON.parse(await readFile(path.join(root, 'harness/upstream/.source-lock.json'), 'utf8'));
    assert.equal(lock.sources.superpowers.resolved.version, 'v6.1.1');
    assert.equal(lock.sources.superpowers.resolved.kind, 'latest-tag');
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(source, { recursive: true, force: true });
  }
});
