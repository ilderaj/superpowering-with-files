import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const ignoredDirs = new Set(['.git', 'node_modules', 'planning']);
const scannedExtensions = new Set(['.md', '.json', '.mjs', '.js', '.sh']);
const authorUser = 'jared';
const forbidden = [
  `/Users/${authorUser}/`,
  `C:\\Users\\${authorUser}\\`,
  `/home/${authorUser}/`,
];

async function collectFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
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

test('committed template files do not contain author-specific absolute paths', async () => {
  const files = await collectFiles(root);
  const offenders = [];

  for (const file of files) {
    const info = await stat(file);
    if (!info.isFile()) continue;
    const text = await readFile(file, 'utf8');
    for (const token of forbidden) {
      if (text.includes(token)) {
        offenders.push(`${path.relative(root, file)} contains ${token}`);
      }
    }
  }

  assert.deepEqual(offenders, []);
});
