import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const root = process.cwd();
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

test('committed template files do not contain author-specific absolute paths', async () => {
  const files = await collectFiles(root);
  const offenders = [];

  for (const file of files) {
    let info;
    try {
      info = await stat(file);
    } catch (error) {
      if (error && error.code === 'ENOENT') continue;
      throw error;
    }
    if (!info.isFile()) continue;
    let text;
    try {
      text = await readFile(file, 'utf8');
    } catch (error) {
      if (error && error.code === 'ENOENT') continue;
      throw error;
    }
    for (const token of forbidden) {
      if (text.includes(token)) {
        offenders.push(`${path.relative(root, file)} contains ${token}`);
      }
    }
  }

  assert.deepEqual(offenders, []);
});
