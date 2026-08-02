import assert from 'node:assert/strict';
import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AUTHORITY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export const FINAL_INVENTORY = Object.freeze([
  'harness/trio/core/authority.mjs',
  'harness/trio/core/read.mjs',
  'harness/trio/core/routing.mjs',
  'harness/trio/core/store.mjs',
  'harness/trio/compatibility/legacy-reader.mjs',
  'harness/trio/hosts/generic.mjs',
  'harness/trio/hosts/codex.mjs',
  'harness/trio/config.mjs',
  'harness/trio/projection.mjs',
  'harness/installer/commands/trio.mjs',
  'harness/runtime/authority-root.mjs'
]);

const MILESTONE_INVENTORY = Object.freeze({
  wave1: Object.freeze([
    FINAL_INVENTORY[0],
    FINAL_INVENTORY[1],
    FINAL_INVENTORY[2],
    FINAL_INVENTORY[4],
    FINAL_INVENTORY[9],
    FINAL_INVENTORY[10]
  ]),
  wave2: Object.freeze([
    FINAL_INVENTORY[0],
    FINAL_INVENTORY[1],
    FINAL_INVENTORY[2],
    FINAL_INVENTORY[3],
    FINAL_INVENTORY[4],
    FINAL_INVENTORY[9],
    FINAL_INVENTORY[10]
  ]),
  wave4: Object.freeze([
    FINAL_INVENTORY[0],
    FINAL_INVENTORY[1],
    FINAL_INVENTORY[2],
    FINAL_INVENTORY[3],
    FINAL_INVENTORY[4],
    FINAL_INVENTORY[5],
    FINAL_INVENTORY[6],
    FINAL_INVENTORY[9],
    FINAL_INVENTORY[10]
  ]),
  final: FINAL_INVENTORY
});

export const FINAL_DIRECTION_MATRIX = Object.freeze({
  'harness/trio/core/authority.mjs': Object.freeze([]),
  'harness/trio/core/read.mjs': Object.freeze([
    'harness/trio/core/authority.mjs'
  ]),
  'harness/trio/core/routing.mjs': Object.freeze([]),
  'harness/trio/core/store.mjs': Object.freeze([
    'harness/trio/core/authority.mjs',
    'harness/trio/core/read.mjs'
  ]),
  'harness/trio/compatibility/legacy-reader.mjs': Object.freeze([
    'harness/trio/core/authority.mjs',
    'harness/trio/core/read.mjs'
  ]),
  'harness/trio/hosts/generic.mjs': Object.freeze([
    'harness/trio/core/routing.mjs'
  ]),
  'harness/trio/hosts/codex.mjs': Object.freeze([
    'harness/trio/core/routing.mjs'
  ]),
  'harness/trio/config.mjs': Object.freeze([]),
  'harness/trio/projection.mjs': Object.freeze([
    'harness/trio/config.mjs'
  ]),
  'harness/installer/commands/trio.mjs': Object.freeze([
    'harness/trio/core/authority.mjs',
    'harness/trio/core/read.mjs',
    'harness/trio/core/routing.mjs',
    'harness/trio/core/store.mjs',
    'harness/trio/compatibility/legacy-reader.mjs',
    'harness/trio/hosts/generic.mjs',
    'harness/trio/hosts/codex.mjs',
    'harness/trio/config.mjs',
    'harness/trio/projection.mjs'
  ]),
  'harness/runtime/authority-root.mjs': Object.freeze([
    'harness/trio/core/authority.mjs'
  ])
});

export function parseMilestoneArgs(argv) {
  if (!Array.isArray(argv) || argv.length !== 2 || argv[0] !== '--milestone') {
    throw new Error('Expected exactly one --milestone <wave1|wave2|wave4|final> argument.');
  }
  const milestone = argv[1];
  if (!milestone || !Object.hasOwn(MILESTONE_INVENTORY, milestone)) {
    throw new Error(`Unknown or empty milestone: ${String(milestone)}`);
  }
  return milestone;
}

async function pathExists(targetPath) {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function walkMjs(relativeDir) {
  const absoluteDir = path.join(AUTHORITY_ROOT, relativeDir);
  if (!(await pathExists(absoluteDir))) return [];
  const result = [];
  for (const entry of await readdir(absoluteDir, { withFileTypes: true })) {
    const relativePath = path.join(relativeDir, entry.name).split(path.sep).join('/');
    if (entry.isDirectory()) result.push(...await walkMjs(relativePath));
    else if (entry.isFile() && entry.name.endsWith('.mjs')) result.push(relativePath);
  }
  return result;
}

async function discoveredInventory() {
  const paths = await walkMjs('harness/trio');
  for (const externalPath of [
    'harness/installer/commands/trio.mjs',
    'harness/runtime/authority-root.mjs'
  ]) {
    if (await pathExists(path.join(AUTHORITY_ROOT, externalPath))) paths.push(externalPath);
  }
  return paths.sort();
}

function importSpecifiers(source) {
  const specifiers = [];
  const pattern = /\b(?:import|export)\s+(?:[^'";]+?\s+from\s+)?['"]([^'"]+)['"]|\bimport\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const match of source.matchAll(pattern)) specifiers.push(match[1] ?? match[2]);
  return specifiers;
}

function resolveRelativeImport(filePath, specifier) {
  if (!specifier.startsWith('.')) return specifier;
  return path.relative(
    AUTHORITY_ROOT,
    path.resolve(AUTHORITY_ROOT, path.dirname(filePath), specifier)
  ).split(path.sep).join('/');
}

function allowedRelativeImports(filePath) {
  return new Set(FINAL_DIRECTION_MATRIX[filePath] ?? []);
}

async function assertImportBoundaries(inventory) {
  const forbidden = /planning-task|root-policy|chiefops|receipt|anchor|profile|companion|reconciliation|mcp|upstream/iu;
  for (const filePath of inventory) {
    const source = await readFile(path.join(AUTHORITY_ROOT, filePath), 'utf8');
    assert.doesNotMatch(source, forbidden, `${filePath} imports a forbidden legacy control plane`);
    for (const specifier of importSpecifiers(source)) {
      if (specifier.startsWith('node:')) continue;
      const resolved = resolveRelativeImport(filePath, specifier);
      assert.equal(
        resolved.startsWith('../') || path.isAbsolute(resolved),
        false,
        `${filePath} escapes the authority root through ${specifier}`
      );
      assert.ok(
        FINAL_INVENTORY.includes(resolved),
        `${filePath} imports unlisted runtime file ${resolved}`
      );
      assert.ok(
        allowedRelativeImports(filePath).has(resolved),
        `${filePath} has an import outside its Wave 1 direction: ${resolved}`
      );
    }
  }
}

async function run() {
  assert.deepEqual(Object.keys(FINAL_DIRECTION_MATRIX), FINAL_INVENTORY);
  for (const invalid of [
    [],
    ['--milestone'],
    ['--milestone', ''],
    ['--milestone', 'unknown'],
    ['--milestone', 'wave1', '--milestone', 'final'],
    ['--milestone=wave1']
  ]) {
    assert.throws(() => parseMilestoneArgs(invalid), /milestone/i);
  }

  const milestone = parseMilestoneArgs(process.argv.slice(2));
  const actual = await discoveredInventory();
  assert.deepEqual(actual, [...MILESTONE_INVENTORY[milestone]].sort(), `${milestone} inventory mismatch`);
  await assertImportBoundaries(actual);
  console.log(JSON.stringify({ milestone, inventory: actual }));
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) await run();
