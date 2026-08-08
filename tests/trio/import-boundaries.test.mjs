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

function moduleSyntaxMask(source) {
  const masked = [...source];
  const blank = (index) => {
    if (masked[index] !== '\n') masked[index] = ' ';
  };

  function maskQuotedString(index, quote) {
    blank(index);
    for (index += 1; index < source.length; index += 1) {
      if (source[index] === '\\') {
        blank(index);
        if (index + 1 < source.length) blank(index + 1);
        index += 1;
        continue;
      }
      blank(index);
      if (source[index] === quote) return index + 1;
    }
    throw new Error('Unterminated string literal in module source.');
  }

  function maskLineComment(index) {
    blank(index);
    blank(index + 1);
    for (index += 2; index < source.length && source[index] !== '\n'; index += 1) blank(index);
    return index;
  }

  function maskBlockComment(index) {
    blank(index);
    blank(index + 1);
    for (index += 2; index < source.length; index += 1) {
      if (source[index] === '*' && source[index + 1] === '/') {
        blank(index);
        blank(index + 1);
        return index + 2;
      }
      blank(index);
    }
    throw new Error('Unterminated block comment in module source.');
  }

  function maskTemplateExpression(index) {
    let depth = 1;
    for (; index < source.length; index += 1) {
      if (source[index] === '/' && source[index + 1] === '/') {
        index = maskLineComment(index) - 1;
        continue;
      }
      if (source[index] === '/' && source[index + 1] === '*') {
        index = maskBlockComment(index) - 1;
        continue;
      }
      if (source[index] === '\'' || source[index] === '"') {
        index = maskQuotedString(index, source[index]) - 1;
        continue;
      }
      if (source[index] === '`') {
        index = maskTemplate(index) - 1;
        continue;
      }
      if (source[index] === '{') {
        depth += 1;
      } else if (source[index] === '}') {
        depth -= 1;
        if (depth === 0) return index + 1;
      }
    }
    throw new Error('Unterminated template expression in module source.');
  }

  function maskTemplate(index) {
    blank(index);
    for (index += 1; index < source.length; index += 1) {
      if (source[index] === '\\') {
        blank(index);
        if (index + 1 < source.length) blank(index + 1);
        index += 1;
        continue;
      }
      if (source[index] === '`') {
        blank(index);
        return index + 1;
      }
      if (source[index] === '$' && source[index + 1] === '{') {
        blank(index);
        blank(index + 1);
        index = maskTemplateExpression(index + 2) - 1;
        continue;
      }
      blank(index);
    }
    throw new Error('Unterminated template literal in module source.');
  }

  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === '/' && source[index + 1] === '/') {
      index = maskLineComment(index) - 1;
      continue;
    }
    if (source[index] === '/' && source[index + 1] === '*') {
      index = maskBlockComment(index) - 1;
      continue;
    }
    if (source[index] === '\'' || source[index] === '"') {
      index = maskQuotedString(index, source[index]) - 1;
      continue;
    }
    if (source[index] === '`') index = maskTemplate(index) - 1;
  }

  return masked.join('');
}

function importSpecifiers(source) {
  const syntaxMask = moduleSyntaxMask(source);
  const records = [];
  const staticOrReexport = /\b(?:import|export)\s+(?:[^'";]+?\s+from\s+)?(['"])([^'"]+)\1/g;
  for (const match of source.matchAll(staticOrReexport)) {
    if (syntaxMask.slice(match.index, match.index + match[0].search(/\s/u)).startsWith('import')
      || syntaxMask.slice(match.index, match.index + match[0].search(/\s/u)).startsWith('export')) {
      records.push({ start: match.index, specifier: match[2] });
    }
  }

  const literalDynamic = /\bimport\s*\(\s*(['"])([^'"]+)\1\s*\)/g;
  for (const match of source.matchAll(literalDynamic)) {
    if (syntaxMask.slice(match.index, match.index + 'import'.length) === 'import') {
      records.push({ start: match.index, specifier: match[2] });
    }
  }

  const resolvedStarts = new Set(records.map((record) => record.start));
  for (const match of syntaxMask.matchAll(/\b(import|export)\b/g)) {
    const keyword = match[1];
    const afterKeyword = syntaxMask.slice(match.index + keyword.length).trimStart();
    if (keyword === 'import' && afterKeyword.startsWith('.')) continue;
    if (resolvedStarts.has(match.index)) continue;

    if (keyword === 'import') {
      const kind = afterKeyword.startsWith('(') ? 'dynamic import' : 'import';
      throw new Error(`Unsupported ${kind} syntax at source offset ${match.index}.`);
    }

    if (afterKeyword.startsWith('*') || /^\{[^}]*\}\s+from\b/u.test(afterKeyword)) {
      throw new Error(`Unsupported re-export syntax at source offset ${match.index}.`);
    }
  }

  return records.sort((left, right) => left.start - right.start).map((record) => record.specifier);
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

function assertAllowedImport(filePath, specifier) {
  if (specifier.startsWith('node:')) return;
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

async function assertImportBoundaries(inventory) {
  for (const filePath of inventory) {
    const source = await readFile(path.join(AUTHORITY_ROOT, filePath), 'utf8');
    for (const specifier of importSpecifiers(source)) assertAllowedImport(filePath, specifier);
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

  assert.deepEqual(
    importSpecifiers([
      "const receipt = 'transient';",
      "const note = 'import(targetPath)';",
      'const template = `export { readTrioTask } from legacyControlPlane;`;',
      '// import(targetPath)',
      '/* export { readTrioTask } from legacyControlPlane; */',
      "import { readTrioTask } from './read.mjs';",
      "export { readTrioTask } from './read.mjs';",
      "await import('./read.mjs');"
    ].join('\n')),
    ['./read.mjs', './read.mjs', './read.mjs']
  );
  assert.throws(
    () => importSpecifiers('await import(targetPath);'),
    /unsupported dynamic import syntax/i
  );
  assert.throws(
    () => importSpecifiers('const note = `${import(targetPath)}`;'),
    /unsupported dynamic import syntax/i
  );
  assert.throws(
    () => importSpecifiers('export { readTrioTask } from legacyControlPlane;'),
    /unsupported re-export syntax/i
  );
  assert.throws(
    () => assertAllowedImport('harness/trio/core/store.mjs', '../legacy/receipt.mjs'),
    /unlisted runtime file/i
  );

  const milestone = parseMilestoneArgs(process.argv.slice(2));
  const actual = await discoveredInventory();
  assert.deepEqual(actual, [...MILESTONE_INVENTORY[milestone]].sort(), `${milestone} inventory mismatch`);
  await assertImportBoundaries(actual);
  console.log(JSON.stringify({ milestone, inventory: actual }));
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) await run();
