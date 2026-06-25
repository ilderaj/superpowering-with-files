import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export async function createSimplificationLedgerFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'simplification-ledger-'));
  await mkdir(path.join(root, 'src'), { recursive: true });
  await mkdir(path.join(root, 'scripts'), { recursive: true });
  await mkdir(path.join(root, 'docs'), { recursive: true });

  await writeFile(
    path.join(root, 'src/a.js'),
    '// swf-simplify: single-pass only; upgrade when batching is required\n',
    'utf8'
  );
  await writeFile(
    path.join(root, 'scripts/b.py'),
    '# swf-simplify: local scan only; upgrade when cross-workspace support is needed\n',
    'utf8'
  );
  await writeFile(
    path.join(root, 'docs/notes.md'),
    'This document mentions swf-simplify: in prose and should stay out of the ledger.\n',
    'utf8'
  );
  await writeFile(
    path.join(root, 'src/c.css'),
    '/* swf-simplify: block comments are out of scope in V1 */\n',
    'utf8'
  );

  return root;
}

export async function removeSimplificationLedgerFixture(root) {
  await rm(root, { recursive: true, force: true });
}
