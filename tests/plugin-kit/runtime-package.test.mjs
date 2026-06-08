import { test } from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  runtimePackageRoot,
  runtimeHarnessRoot
} from '../../packages/harness-runtime/src/index.mjs';

test('runtime package declares public bins and a files allowlist', async () => {
  const pkg = JSON.parse(await readFile('packages/harness-runtime/package.json', 'utf8'));

  assert.equal(pkg.name, '@superpowering-with-files/harness-runtime');
  assert.equal(pkg.version, '1.0.8');
  assert.equal(pkg.type, 'module');
  assert.equal(pkg.bin.harness, './bin/harness');
  assert.equal(pkg.bin['harness-mcp-stdio'], './bin/harness-mcp-stdio.mjs');
  assert.deepEqual(pkg.files, ['bin', 'src', 'harness', 'scripts', 'README.md']);

  await access('packages/harness-runtime/bin/harness');
  await access('packages/harness-runtime/bin/harness-mcp-stdio.mjs');
});

test('runtime path helpers point at the package-local harness copy', () => {
  assert.equal(runtimePackageRoot, path.resolve('packages/harness-runtime'));
  assert.equal(runtimeHarnessRoot, path.resolve('packages/harness-runtime/harness'));
});
