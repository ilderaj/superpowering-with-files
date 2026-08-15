#!/usr/bin/env node
// Version-lock guard (Slice 3, plan item 2).
//
// Fail-closed check that @deepseek-ai/dsh is pinned EXACTLY to 0.1.0-rc.6 in
// BOTH package.json (dependencies specifier) and pnpm-lock.yaml (importers
// specifier + resolved version). Any upgrade to the dsh anchor must make this
// guard exit non-zero, so the release gate cannot pass silently. Upgrade flow:
// change the pin -> this guard fails (expected) -> run the full test suite ->
// manual acceptance (feasibility report risk: rc-period weekly breaking).
//
// Usage: node scripts/guard-version-lock.mjs [plugin-root]
// Exit 0 = pin intact; exit 1 = mismatch (violations printed).

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

export const LOCKED_DSH_PACKAGE = '@deepseek-ai/dsh';
export const LOCKED_DSH_VERSION = '0.1.0-rc.6';

export function pluginRootOf(override) {
  return resolve(override ?? dirname(fileURLToPath(import.meta.url)), '..');
}

function versionFromLockfileKey(line) {
  const marker = "'" + LOCKED_DSH_PACKAGE + '@';
  const start = line.indexOf(marker);
  if (start < 0) return null;
  const rest = line.slice(start + marker.length);
  const match = rest.match(/^([0-9][^'"(*]*)/);
  return match ? match[1] : null;
}

export async function checkVersionLock(root) {
  const violations = [];

  // 1. package.json: exact specifier under dependencies.
  let manifest;
  try {
    manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  } catch (error) {
    return { ok: false, violations: ['package.json unreadable: ' + error.message] };
  }
  const specifier = manifest?.dependencies?.[LOCKED_DSH_PACKAGE];
  if (specifier !== LOCKED_DSH_VERSION) {
    violations.push(
      'package.json dependencies["' + LOCKED_DSH_PACKAGE + '"] must be exactly "' +
      LOCKED_DSH_VERSION + '", got: ' + String(specifier)
    );
  } else if (!/^[0-9]/.test(specifier) || /[^0-9a-z.-]/.test(specifier)) {
    violations.push('package.json specifier must be exact (no range): ' + specifier);
  }

  // 2. Lockfile: importers '.' entry for the anchor, plus no foreign version
  // anywhere in the lockfile.
  let lock;
  try {
    lock = await readFile(join(root, 'pnpm-lock.yaml'), 'utf8');
  } catch (error) {
    return { ok: false, violations: ['pnpm-lock.yaml unreadable: ' + error.message] };
  }
  const lines = lock.split(/\r?\n/);
  const importersStart = lines.findIndex((line) => line.trim() === 'importers:');
  const keyLine = "'" + LOCKED_DSH_PACKAGE + "':";
  const pinnedIndex = importersStart >= 0
    ? lines.slice(importersStart + 1, importersStart + 60).findIndex((line) => line.includes(keyLine)) + importersStart + 1
    : -1;
  if (importersStart < 0 || pinnedIndex < 0) {
    violations.push('lockfile has no importers entry for ' + LOCKED_DSH_PACKAGE);
  } else {
    const specifierLine = lines[pinnedIndex + 1] ?? '';
    const versionLine = lines[pinnedIndex + 2] ?? '';
    const specifier = specifierLine.match(/specifier:\s*(\S+)/)?.[1] ?? null;
    if (specifier !== LOCKED_DSH_VERSION) {
      violations.push(
        'lockfile importers specifier for ' + LOCKED_DSH_PACKAGE +
        ' must be exactly ' + LOCKED_DSH_VERSION + ', got: ' + (specifier ?? 'missing')
      );
    }
    const version = versionLine.match(/version:\s*([0-9][^\s(]*)/)?.[1] ?? null;
    if (version !== LOCKED_DSH_VERSION) {
      violations.push(
        'lockfile resolved version for ' + LOCKED_DSH_PACKAGE +
        ' must be exactly ' + LOCKED_DSH_VERSION + ', got: ' + (version ?? 'missing')
      );
    }
  }
  const foreign = [];
  for (const line of lines) {
    const found = versionFromLockfileKey(line);
    if (found !== null && found !== LOCKED_DSH_VERSION) foreign.push(found);
  }
  for (const version of foreign) {
    violations.push('lockfile resolves ' + LOCKED_DSH_PACKAGE + ' at a foreign version: ' + version);
  }

  return { ok: violations.length === 0, violations };
}

export async function main(argv = process.argv.slice(2)) {
  const root = pluginRootOf(argv[0]);
  const result = await checkVersionLock(root);
  if (result.ok) {
    console.log('version-lock ok: ' + LOCKED_DSH_PACKAGE + ' == ' + LOCKED_DSH_VERSION + ' (package.json + pnpm-lock.yaml)');
    return 0;
  }
  console.error('version-lock FAILED (fail-closed):');
  for (const violation of result.violations) console.error(' - ' + violation);
  return 1;
}

if (import.meta.url === 'file://' + process.argv[1]) {
  process.exitCode = await main();
}
