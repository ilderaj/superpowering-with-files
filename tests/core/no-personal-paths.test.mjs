import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const root = process.cwd();
const execFileAsync = promisify(execFile);
const ignoredDirs = new Set([
  '.git',
  '.harness',
  '.test-fixtures',
  'node_modules',
  'planning',
  '.worktrees',
  'worktrees',
  '.codex-worktrees'
]);
const scannedExtensions = new Set(['.md', '.json', '.mjs', '.js', '.sh']);
const authorUser = 'jared';
const forbidden = [
  `/Users/${authorUser}/`,
  `C:\\Users\\${authorUser}\\`,
  `/home/${authorUser}/`,
];

async function collectFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true }).catch((error) => {
    if (error && error.code === 'ENOENT') {
      return [];
    }
    throw error;
  });
  const files = [];

  for (const entry of entries) {
    if (ignoredDirs.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(fullPath));
      continue;
    }
    if (entry.isFile() && scannedExtensions.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }

  return files;
}

async function selectTrackedTextFiles(repoRoot, indexListing) {
  const files = [];
  for (const relativePath of indexListing.toString('utf8').split('\0').filter(Boolean)) {
    if (relativePath.split(/[\\/]/).some((segment) => ignoredDirs.has(segment))) continue;
    if (!scannedExtensions.has(path.extname(relativePath))) continue;
    const file = path.resolve(repoRoot, relativePath);
    const relative = path.relative(repoRoot, file);
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new Error(`Git index path escapes repository root: ${relativePath}`);
    }
    try {
      if ((await stat(file)).isFile()) files.push(file);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
  return files;
}

async function collectTrackedTextFiles(repoRoot) {
  const { stdout } = await execFileAsync('git', ['ls-files', '-z'], {
    cwd: repoRoot,
    encoding: 'buffer'
  });
  return selectTrackedTextFiles(repoRoot, stdout);
}

async function findForbiddenPathOffenders(repoRoot, files) {
  const offenders = [];
  for (const file of files) {
    const bytes = await readFile(file);
    for (const token of forbidden) {
      if (bytes.includes(Buffer.from(token))) {
        offenders.push(`${path.relative(repoRoot, file)} contains ${token}`);
      }
    }
  }
  return offenders;
}

test('collectFiles ignores local worktree directories', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'no-personal-paths-'));
  try {
    await mkdir(path.join(tempRoot, '.worktrees/example/docs'), { recursive: true });
    await mkdir(path.join(tempRoot, '.test-fixtures/example/docs'), { recursive: true });
    await writeFile(
      path.join(tempRoot, '.worktrees/example/docs/personal-path.md'),
      `${forbidden[0]}should-not-be-scanned\n`
    );
    await writeFile(
      path.join(tempRoot, '.test-fixtures/example/docs/personal-path.md'),
      `${forbidden[0]}should-not-be-scanned\n`
    );
    await writeFile(path.join(tempRoot, 'README.md'), '# kept\n');

    const files = await collectFiles(tempRoot);
    assert.deepEqual(files.map((file) => path.relative(tempRoot, file)).sort(), ['README.md']);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test('committed-file scope ignores an untracked ordinary file while retaining a listed tracked path', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'no-personal-paths-scope-'));
  try {
    await writeFile(path.join(tempRoot, 'reported-tracked.md'), `${forbidden[0]}must-be-detected\n`);
    await writeFile(path.join(tempRoot, 'untracked-ordinary.md'), `${forbidden[0]}must-be-ignored\n`);

    const files = await selectTrackedTextFiles(tempRoot, Buffer.from('reported-tracked.md\0'));
    const offenders = await findForbiddenPathOffenders(tempRoot, files);

    assert.deepEqual(offenders, [`reported-tracked.md contains ${forbidden[0]}`]);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test('committed template files do not contain author-specific absolute paths', async () => {
  assert.deepEqual(await findForbiddenPathOffenders(root, await collectTrackedTextFiles(root)), []);
});
