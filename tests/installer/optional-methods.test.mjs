import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../harness/optional-skills/methods/', import.meta.url));
const skills = ['code-review', 'codebase-design', 'diagnosing-bugs', 'domain-modeling', 'tdd'];
const read = (path) => readFile(join(root, path), 'utf8');

async function filesUnder(dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    assert.equal(entry.isSymbolicLink(), false, `nonportable symlink: ${entry.name}`);
    assert.ok(!['.git', 'node_modules', '.cache', '__pycache__'].includes(entry.name), `unexpected copied directory: ${entry.name}`);
    if (entry.isDirectory()) files.push(...await filesUnder(join(dir, entry.name)));
    else files.push(join(dir, entry.name));
  }
  return files;
}

function withoutFences(markdown) {
  // Example output paths inside fenced templates are not bundled dependencies.
  return markdown.replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1\s*$/gm, '');
}

test('each method is independently portable and its referenced resources are reachable', async () => {
  assert.deepEqual((await readdir(root, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort(), skills);
  for (const skill of skills) {
    const skillRoot = resolve(root, skill);
    const files = await filesUnder(skillRoot);
    const visited = new Set();
    const pending = [join(skillRoot, 'SKILL.md')];
    while (pending.length) {
      const file = pending.pop();
      if (visited.has(file)) continue;
      visited.add(file);
      if (!file.endsWith('.md')) continue;
      const text = await readFile(file, 'utf8');
      assert.doesNotMatch(text, /(?:\/Users\/|\/home\/|~\/\.agents\/|~\/\.codex\/)/, `machine-local dependency: ${file}`);
      for (const [, link] of withoutFences(text).matchAll(/\[[^\]]+\]\(([^)\s]+)\)/g)) {
        if (/^(?:https?:|mailto:|#)/.test(link)) continue;
        const target = resolve(dirname(file), decodeURIComponent(link.split('#')[0]));
        assert.ok(target.startsWith(`${skillRoot}${sep}`), `dependency escapes individually adoptable skill: ${file} -> ${link}`);
        assert.ok((await stat(target)).isFile(), `missing file: ${file} -> ${link}`);
        pending.push(target);
      }
    }
    assert.deepEqual([...visited].sort(), files.sort(), `unreachable resource in ${skill}`);
  }
});

test('provenance covers every curated file and preserves the unchanged supporting inputs', async () => {
  const provenance = JSON.parse(await read('PROVENANCE.json'));
  assert.equal(provenance.sourceKind, 'local skill snapshot');
  const inputs = new Map(provenance.inputs.map((entry) => [entry.path, entry.sha256]));
  assert.equal(inputs.size, provenance.inputs.length);
  for (const [path, digest] of inputs) {
    assert.match(digest, /^[a-f0-9]{64}$/, path);
    assert.ok((await stat(join(root, path))).isFile(), path);
  }
  for (const path of ['tdd/tests.md', 'tdd/mocking.md', 'diagnosing-bugs/scripts/hitl-loop.template.sh']) {
    const bytes = await readFile(join(root, path));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), inputs.get(path), `copied reference changed: ${path}`);
  }
  const derived = provenance.derivedReferences;
  for (const parents of Object.values(derived)) {
    assert.ok(parents.length > 0);
    for (const parent of parents) assert.ok(inputs.has(parent), `unknown derivation input: ${parent}`);
  }
  const actual = (await Promise.all(skills.map((skill) => filesUnder(join(root, skill))))).flat().map((path) => relative(root, path)).sort();
  assert.deepEqual([...inputs.keys(), ...Object.keys(derived)].sort(), actual);
});

async function fixture(t) {
  const cwd = await mkdtemp(join(tmpdir(), 'optional-methods-diff-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, {
    cwd, encoding: 'utf8',
    env: {
      ...process.env,
      GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_AUTHOR_NAME: 'Fixture', GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
      GIT_COMMITTER_NAME: 'Fixture', GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
    },
  });
  git('init', '--quiet');
  const put = (path, text) => writeFile(join(cwd, path), text);
  // Create objects only inside the disposable fixture; no source-repository commits/config.
  const snapshot = (parents = []) => git('commit-tree', git('write-tree').trim(), ...parents.flatMap((sha) => ['-p', sha]), '-m', 'fixture').trim();
  const moveHead = (sha) => git('update-ref', 'HEAD', sha);
  await put('tracked.txt', 'original\n');
  git('add', '--', 'tracked.txt');
  const base = snapshot();
  moveHead(base);
  return { cwd, git, put, snapshot, moveHead, base };
}

async function documentedDiff(mode, git, refs = {}) {
  const source = await read('code-review/DIFF-SCOPES.md');
  const row = source.split('\n').find((line) => line.startsWith(`| ${mode} |`));
  assert.ok(row, `missing documented diff mode: ${mode}`);
  const command = row.split('|')[2].trim().replace(/^`|`$/g, '');
  assert.ok(command.startsWith('git diff '));
  const args = command.slice(4).split(/\s+/).map((arg) => arg.replace(/<([^>]+)>/g, (_, key) => {
    assert.ok(refs[key], `missing fixture revision: ${key}`);
    return refs[key];
  }));
  return git(...args);
}

test('documented staged and unstaged modes isolate index and worktree; untracked files remain explicit', async (t) => {
  const f = await fixture(t);
  await f.put('tracked.txt', 'staged\n');
  f.git('add', '--', 'tracked.txt');
  await f.put('tracked.txt', 'working\n');
  await f.put('untracked.txt', 'new file\n');
  const staged = await documentedDiff('Staged', f.git);
  assert.match(staged, /-original\n\+staged/);
  assert.doesNotMatch(staged, /working|untracked/);
  const unstaged = await documentedDiff('Unstaged', f.git);
  assert.match(unstaged, /-staged\n\+working/);
  assert.doesNotMatch(unstaged, /original|untracked/);
  assert.equal(f.git('ls-files', '--others', '--exclude-standard'), 'untracked.txt\n');
});

test('combined tracked WIP is a net diff; opposite index and worktree edits still have separate patches', async (t) => {
  const f = await fixture(t);
  await f.put('tracked.txt', 'staged\n');
  f.git('add', '--', 'tracked.txt');
  await f.put('tracked.txt', 'working\n');
  assert.match(await documentedDiff('Tracked work in progress', f.git), /-original\n\+working/);
  await f.put('tracked.txt', 'original\n');
  assert.equal(await documentedDiff('Tracked work in progress', f.git), '');
  assert.notEqual(await documentedDiff('Staged', f.git), '');
  assert.notEqual(await documentedDiff('Unstaged', f.git), '');
});

test('single commit review excludes later commits and the dirty working tree', async (t) => {
  const f = await fixture(t);
  await f.put('tracked.txt', 'selected\n');
  f.git('add', '--', 'tracked.txt');
  const selected = f.snapshot([f.base]);
  f.moveHead(selected);
  await f.put('tracked.txt', 'later\n');
  f.git('add', '--', 'tracked.txt');
  f.moveHead(f.snapshot([selected]));
  await f.put('tracked.txt', 'dirty\n');
  const patch = await documentedDiff('Commit', f.git, { commit: selected });
  assert.match(patch, /-original\n\+selected/);
  assert.doesNotMatch(patch, /later|dirty/);
});

test('branch/PR contribution excludes target-only changes while fixed endpoints include them', async (t) => {
  const f = await fixture(t);
  await f.put('feature.txt', 'feature\n');
  f.git('add', '--', 'feature.txt');
  const head = f.snapshot([f.base]);
  f.git('read-tree', f.base);
  await f.put('target.txt', 'target\n');
  f.git('add', '--', 'target.txt');
  const target = f.snapshot([f.base]);
  const refs = { base: target, head };
  const contribution = await documentedDiff('Branch or PR contribution', f.git, refs);
  assert.match(contribution, /\+feature/);
  assert.doesNotMatch(contribution, /target.txt/);
  const endpoints = await documentedDiff('Fixed endpoints', f.git, refs);
  assert.match(endpoints, /\+feature/);
  assert.match(endpoints, /-target/);
  assert.equal(f.git('merge-base', target, head).trim(), f.base);
});

test('root and merge commit modes use the explicitly selected comparison tree', async (t) => {
  const f = await fixture(t);
  // The empty tree is obtained from the fixture object database, independent of hash format.
  f.git('read-tree', '--empty');
  const emptyTree = f.git('write-tree').trim();
  assert.match(await documentedDiff('Root commit', f.git, { 'empty-tree': emptyTree, commit: f.base }), /\+original/);
  f.git('read-tree', f.base);
  await f.put('left.txt', 'left\n');
  f.git('add', '--', 'left.txt');
  const left = f.snapshot([f.base]);
  f.git('read-tree', f.base);
  await f.put('right.txt', 'right\n');
  f.git('add', '--', 'right.txt');
  const right = f.snapshot([f.base]);
  f.git('read-tree', left);
  f.git('add', '--', 'right.txt');
  const merge = f.snapshot([left, right]);
  const fromLeft = await documentedDiff('Merge commit', f.git, { parent: left, commit: merge });
  const fromRight = await documentedDiff('Merge commit', f.git, { parent: right, commit: merge });
  assert.match(fromLeft, /\+right/);
  assert.doesNotMatch(fromLeft, /left.txt/);
  assert.match(fromRight, /\+left/);
  assert.doesNotMatch(fromRight, /right.txt/);
});

test('retained human feedback template runs and captures observations without inventing a verdict', () => {
  const script = join(root, 'diagnosing-bugs/scripts/hitl-loop.template.sh');
  execFileSync('bash', ['-n', script]);
  const output = execFileSync('bash', [script], { input: '\ny\nExport failed\n', encoding: 'utf8' });
  assert.match(output, /ERRORED=y\nERROR_MSG=Export failed/);
});
