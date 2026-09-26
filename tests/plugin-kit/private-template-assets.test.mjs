import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildPlugin } from '../../packages/plugin-kit/src/build-plugin.mjs';

const restrictedHashes = new Set([
  'fad8669e754a3c4d129b544eaf80975abc1342670e3abcfea7c7144061986979', // Original internal portfolio PPTX.
  '0b3178c005cc93b8d49fb2876e882ef30720120aa43e06babb988078f3ea1d3c', // Its preview.
]);

test('portable Codex package excludes the identified internal portfolio assets', async () => {
  const out = await mkdtemp(path.join(os.tmpdir(), 'swf-private-assets-'));
  try {
    const { pluginRoot } = await buildPlugin({ target: 'codex', version: '2.0.1', outDir: out });
    await assert.rejects(access(path.join(pluginRoot, 'skills/artifact-template-product-leadership-portfolio')), { code: 'ENOENT' });
    async function checkTree(directory) {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          await checkTree(file);
          continue;
        }
        assert.ok(entry.isFile(), `Unexpected non-file package entry: ${file}`);
        const digest = createHash('sha256').update(await readFile(file)).digest('hex');
        assert.ok(!restrictedHashes.has(digest), `${file} repeats an identified internal/private source asset`);
      }
    }
    await checkTree(pluginRoot);
  } finally {
    await rm(out, { recursive: true, force: true });
  }
});
