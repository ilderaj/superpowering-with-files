// Version-lock guard regression (Slice 3, plan item 2).
//
// The guard is fail-closed: the exact @deepseek-ai/dsh pin must hold in BOTH
// package.json and pnpm-lock.yaml, and any upgrade attempt must make the guard
// fail. These tests exercise checkVersionLock against the real plugin files
// and against mutated temp copies (bumped pin, range specifier, foreign
// lockfile version).

import { copyFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { checkVersionLock, LOCKED_DSH_PACKAGE, LOCKED_DSH_VERSION } from '../scripts/guard-version-lock.mjs';

const PLUGIN_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

async function withMutatedPlugin<T>(mutate: (root: string) => Promise<void> | void, run: (root: string) => Promise<T>): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), 'swf-dsh-lock-'));
  try {
    await copyFile(join(PLUGIN_ROOT, 'package.json'), join(root, 'package.json'));
    await copyFile(join(PLUGIN_ROOT, 'pnpm-lock.yaml'), join(root, 'pnpm-lock.yaml'));
    await mutate(root);
    return await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

describe('version-lock guard (Slice 3)', () => {
  it('passes on the committed plugin: package.json + lockfile both pin 0.1.0-rc.6 exactly', async () => {
    const result = await checkVersionLock(PLUGIN_ROOT);
    expect(result.ok).toBe(true);
    expect(result.violations).toEqual([]);
  });

  it('fails closed when package.json is bumped to a newer rc', async () => {
    await withMutatedPlugin(async (root) => {
      const manifest = JSON.parse(await (await import('node:fs/promises')).readFile(join(root, 'package.json'), 'utf8'));
      manifest.dependencies[LOCKED_DSH_PACKAGE] = '0.1.0-rc.7';
      await writeFile(join(root, 'package.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
    }, async (root) => {
      const result = await checkVersionLock(root);
      expect(result.ok).toBe(false);
      expect(result.violations.join('\n')).toContain('must be exactly');
      expect(result.violations.join('\n')).toContain('got: 0.1.0-rc.7');
    });
  });

  it('fails closed on a range specifier even when it matches the pin', async () => {
    await withMutatedPlugin(async (root) => {
      const manifest = JSON.parse(await (await import('node:fs/promises')).readFile(join(root, 'package.json'), 'utf8'));
      manifest.dependencies[LOCKED_DSH_PACKAGE] = '^' + LOCKED_DSH_VERSION;
      await writeFile(join(root, 'package.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
    }, async (root) => {
      const result = await checkVersionLock(root);
      expect(result.ok).toBe(false);
      expect(result.violations.join('\n')).toContain('must be exactly');
    });
  });

  it('fails closed when the lockfile importers specifier is bumped', async () => {
    await withMutatedPlugin(async (root) => {
      const lockPath = join(root, 'pnpm-lock.yaml');
      const lock = await (await import('node:fs/promises')).readFile(lockPath, 'utf8');
      const bumped = lock.replace(
        'specifier: ' + LOCKED_DSH_VERSION + '\n',
        'specifier: 0.1.0-rc.7\n'
      );
      await writeFile(lockPath, bumped, 'utf8');
    }, async (root) => {
      const result = await checkVersionLock(root);
      expect(result.ok).toBe(false);
      expect(result.violations.join('\n')).toContain('importers specifier');
    });
  });

  it('fails closed when a foreign dsh version appears in the lockfile', async () => {
    await withMutatedPlugin(async (root) => {
      const lockPath = join(root, 'pnpm-lock.yaml');
      const lock = await (await import('node:fs/promises')).readFile(lockPath, 'utf8');
      // Inject a second package entry at a foreign version.
      const bumped = lock.replace(
        "  '" + LOCKED_DSH_PACKAGE + '@' + LOCKED_DSH_VERSION + "':",
        "  '" + LOCKED_DSH_PACKAGE + "@0.1.0-rc.7':\n    resolution: {integrity: sha512-deadbeef}\n\n  '" + LOCKED_DSH_PACKAGE + '@' + LOCKED_DSH_VERSION + "':"
      );
      await writeFile(lockPath, bumped, 'utf8');
    }, async (root) => {
      const result = await checkVersionLock(root);
      expect(result.ok).toBe(false);
      expect(result.violations.join('\n')).toContain('foreign version: 0.1.0-rc.7');
    });
  });
});
