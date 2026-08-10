import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { discoverAuthorityRoot } from '../../harness/trio/core/authority.mjs';
import {
  createHarnessFixture,
  removeHarnessFixture
} from '../helpers/harness-fixture.mjs';

const execFileAsync = promisify(execFile);

function harnessCommand(root, ...args) {
  const maybeOptions = args.at(-1);
  const options =
    maybeOptions && typeof maybeOptions === 'object' && !Array.isArray(maybeOptions) ? args.pop() : {};

  return execFileAsync('node', [path.join(root, 'harness/installer/commands/harness.mjs'), ...args], {
    cwd: options.cwd ?? root
  });
}

test('workspace-link creates a stable authority-root override for the current leaf workspace', async () => {
  const root = await createHarnessFixture();
  try {
    const leafDir = path.join(root, 'packages/demo');
    await mkdir(leafDir, { recursive: true });

    await harnessCommand(root, 'workspace-link', '--root', root, { cwd: leafDir });

    const overridePath = path.join(leafDir, '.harness/authority-root.json');
    const override = JSON.parse(await readFile(overridePath, 'utf8'));
    assert.equal(override.schemaVersion, 1);
    assert.equal(
      override.authorityRoot,
      path.relative(path.join(leafDir, '.harness'), root).split(path.sep).join('/')
    );

    const discovered = await discoverAuthorityRoot(leafDir);
    assert.equal(await realpath(discovered.rootDir), await realpath(root));
    assert.equal(discovered.source, 'override-file');
  } finally {
    await removeHarnessFixture(root);
  }
});

test('workspace-link rewrites an existing authority-root override deterministically', async () => {
  const root = await createHarnessFixture();
  try {
    const leafDir = path.join(root, 'packages/demo');
    await mkdir(path.join(leafDir, '.harness'), { recursive: true });
    await writeFile(
      path.join(leafDir, '.harness/authority-root.json'),
      `${JSON.stringify({ schemaVersion: 1, authorityRoot: '../bogus' }, null, 2)}\n`
    );

    await harnessCommand(root, 'workspace-link', `--root=${root}`, { cwd: leafDir });

    const override = JSON.parse(await readFile(path.join(leafDir, '.harness/authority-root.json'), 'utf8'));
    assert.equal(
      override.authorityRoot,
      path.relative(path.join(leafDir, '.harness'), root).split(path.sep).join('/')
    );
  } finally {
    await removeHarnessFixture(root);
  }
});

test('workspace-link rejects external authority roots that do not contain the current leaf workspace', async () => {
  const root = await createHarnessFixture();
  const externalRoot = await createHarnessFixture();
  try {
    const leafDir = path.join(root, 'packages/demo');
    await mkdir(leafDir, { recursive: true });

    await assert.rejects(
      harnessCommand(root, 'workspace-link', `--root=${externalRoot}`, { cwd: leafDir }),
      /ancestor authority root/
    );
  } finally {
    await removeHarnessFixture(root);
    await removeHarnessFixture(externalRoot);
  }
});

test('workspace-link refuses to write inside the authority root without --force', async () => {
  const root = await createHarnessFixture();
  try {
    await assert.rejects(harnessCommand(root, 'workspace-link', `--root=${root}`), /--force/);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('workspace-link can force-write an override from the authority root', async () => {
  const root = await createHarnessFixture();
  try {
    await harnessCommand(root, 'workspace-link', `--root=${root}`, '--force');
    const override = JSON.parse(await readFile(path.join(root, '.harness/authority-root.json'), 'utf8'));
    assert.equal(override.schemaVersion, 1);
    assert.equal(override.authorityRoot, '..');
  } finally {
    await removeHarnessFixture(root);
  }
});
