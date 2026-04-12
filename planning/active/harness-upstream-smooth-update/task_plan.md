# Harness Upstream Smooth Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking. This repository overrides the default Superpowers plan location: durable state for this task lives in `planning/active/harness-upstream-smooth-update/`, not in `docs/superpowers/plans/`.

**Goal:** Add a hard upstream update path that can refresh vendored `superpowers` and `planning-with-files` baselines while preventing accidental changes to Harness core policy, adapters, installer flow, or planning state.

**Architecture:** Add a small upstream helper module that separates candidate staging from applying updates. `fetch` writes candidates under ignored local state, `update` applies candidates only into allowlisted `harness/upstream/<name>` paths, and tests assert protected Harness paths remain unchanged. The implementation keeps Harness core and flow as the source of truth while allowing upstream skill baselines to move independently.

**Tech Stack:** Node.js ESM, `node:test`, `node:fs/promises`, `node:child_process`, existing Harness CLI command modules.

---

## Current State
Status: closed
Archive Eligible: yes
Close Reason: 已完成 upstream smooth update 硬能力实现，并通过 focused upstream tests、完整仓库验证和 mutation boundary 检查。

## Scope

- In scope:
  - Implement real `fetch` and `update` behavior for upstream candidates.
  - Stage upstream candidates under `.harness/upstream-candidates/<source-name>/`.
  - Apply updates only to allowlisted `harness/upstream/<source-name>` directories.
  - Support `superpowers` from git using `harness/upstream/sources.json`.
  - Support `planning-with-files` via an explicit local source path when fetching, because its current source is `local-initial-import`.
  - Add tests that prove protected paths cannot be mutated by upstream update.
  - Update maintenance docs with the verified upstream update flow.
- Out of scope:
  - Do not auto-merge upstream semantic conflicts.
  - Do not change `harness/core/policy/base.md` or platform overrides during update.
  - Do not wire skill filesystem projection into `sync`.
  - Do not mutate user-global IDE directories.
  - Do not change vendored upstream contents in this planning-only turn.

## File Structure

- Create: `harness/installer/lib/upstream.mjs`
  - Owns upstream source loading, source selection, staging path resolution, allowlist checks, candidate staging, and candidate apply operations.
- Modify: `harness/installer/commands/fetch.mjs`
  - Replaces the current contract stub with CLI parsing and candidate staging.
- Modify: `harness/installer/commands/update.mjs`
  - Replaces the current contract stub with allowlisted candidate application.
- Create: `tests/installer/upstream.test.mjs`
  - Unit tests for helper behavior and protected path invariants.
- Create: `tests/installer/upstream-commands.test.mjs`
  - Command-level tests for `fetchCommand` and `updateCommand` using temporary repositories and local source fixtures.
- Modify: `docs/maintenance.md`
  - Adds a documented upstream update flow and guardrails.
- Modify: `planning/active/harness-upstream-smooth-update/findings.md`
  - Records durable decisions and verification results during execution.
- Modify: `planning/active/harness-upstream-smooth-update/progress.md`
  - Records command results and any failed attempts during execution.

## Task 1: Upstream Helper Contracts

**Files:**
- Create: `harness/installer/lib/upstream.mjs`
- Test: `tests/installer/upstream.test.mjs`

- [x] **Step 1: Write failing tests for source loading and path guards**

Create `tests/installer/upstream.test.mjs` with:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  assertInsideRoot,
  candidatePathForSource,
  loadUpstreamSources,
  upstreamPathForSource
} from '../../harness/installer/lib/upstream.mjs';

test('loadUpstreamSources reads configured upstream sources', async () => {
  const sources = await loadUpstreamSources(process.cwd());
  assert.equal(sources.superpowers.type, 'git');
  assert.equal(sources.superpowers.path, 'harness/upstream/superpowers');
  assert.equal(sources['planning-with-files'].type, 'local-initial-import');
});

test('upstream paths are constrained to harness/upstream', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'harness-upstream-'));
  try {
    await mkdir(path.join(root, 'harness/upstream'), { recursive: true });
    await mkdir(path.join(root, 'harness/upstream-candidates'), { recursive: true });
    await writeFile(
      path.join(root, 'harness/upstream/sources.json'),
      JSON.stringify({
        schemaVersion: 1,
        sources: {
          safe: { type: 'local-initial-import', path: 'harness/upstream/safe' },
          escape: { type: 'local-initial-import', path: 'harness/core/policy' }
        }
      })
    );

    const sources = await loadUpstreamSources(root);
    assert.equal(upstreamPathForSource(root, 'safe', sources.safe), path.join(root, 'harness/upstream/safe'));
    assert.throws(
      () => upstreamPathForSource(root, 'escape', sources.escape),
      /must stay inside harness\/upstream|outside allowed root/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('candidate paths are constrained to local harness state', () => {
  const root = '/repo';
  assert.equal(
    candidatePathForSource(root, 'superpowers'),
    path.join(root, '.harness/upstream-candidates/superpowers')
  );
  assert.throws(() => assertInsideRoot('/repo/harness/core', '/repo/harness/upstream'), /outside allowed root/);
});
```

- [x] **Step 2: Run tests and verify they fail**

Run:

```bash
node --test tests/installer/upstream.test.mjs
```

Expected: FAIL with an import error because `harness/installer/lib/upstream.mjs` does not exist.

- [x] **Step 3: Implement minimal upstream helper**

Create `harness/installer/lib/upstream.mjs`:

```js
import { cp, mkdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const UPSTREAM_ROOT = 'harness/upstream';
const CANDIDATE_ROOT = '.harness/upstream-candidates';

function normalizeInside(rootDir, relativePath) {
  const resolved = path.resolve(rootDir, relativePath);
  const root = path.resolve(rootDir);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Path escapes repository root: ${relativePath}`);
  }
  return resolved;
}

export function assertInsideRoot(targetPath, allowedRoot) {
  const resolvedTarget = path.resolve(targetPath);
  const resolvedRoot = path.resolve(allowedRoot);
  if (resolvedTarget !== resolvedRoot && !resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`${resolvedTarget} is outside allowed root ${resolvedRoot}`);
  }
}

export async function loadUpstreamSources(rootDir) {
  const file = path.join(rootDir, 'harness/upstream/sources.json');
  const metadata = JSON.parse(await readFile(file, 'utf8'));
  if (metadata.schemaVersion !== 1 || !metadata.sources || typeof metadata.sources !== 'object') {
    throw new Error('Invalid upstream sources metadata.');
  }
  return metadata.sources;
}

export function upstreamPathForSource(rootDir, sourceName, source) {
  if (!source || typeof source.path !== 'string') {
    throw new Error(`Unknown upstream source: ${sourceName}`);
  }
  const targetPath = normalizeInside(rootDir, source.path);
  const allowedRoot = path.join(rootDir, UPSTREAM_ROOT);
  assertInsideRoot(targetPath, allowedRoot);
  if (path.relative(allowedRoot, targetPath).startsWith('..')) {
    throw new Error(`Upstream source ${sourceName} must stay inside ${UPSTREAM_ROOT}.`);
  }
  return targetPath;
}

export function candidatePathForSource(rootDir, sourceName) {
  if (!/^[a-zA-Z0-9_.-]+$/.test(sourceName)) {
    throw new Error(`Invalid upstream source name: ${sourceName}`);
  }
  return path.join(rootDir, CANDIDATE_ROOT, sourceName);
}

export function parseSourceFilter(args) {
  const sourceArg = args.find((arg) => arg.startsWith('--source='));
  return sourceArg ? sourceArg.slice('--source='.length) : 'all';
}

export function parseFromPath(args) {
  const fromArg = args.find((arg) => arg.startsWith('--from='));
  return fromArg ? fromArg.slice('--from='.length) : undefined;
}

export async function stageLocalCandidate(rootDir, sourceName, fromPath) {
  if (!fromPath) {
    throw new Error(`Source ${sourceName} requires --from=/path/to/source for local candidate staging.`);
  }
  const candidatePath = candidatePathForSource(rootDir, sourceName);
  await rm(candidatePath, { recursive: true, force: true });
  await mkdir(path.dirname(candidatePath), { recursive: true });
  await cp(path.resolve(fromPath), candidatePath, { recursive: true });
  return candidatePath;
}

export function runGit(args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, { stdio: 'pipe', ...options });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(stderr.trim() || `git ${args.join(' ')} failed with exit code ${code}`));
    });
  });
}

export async function stageGitCandidate(rootDir, sourceName, source) {
  if (!source.url) {
    throw new Error(`Git source ${sourceName} must define a url.`);
  }
  const candidatePath = candidatePathForSource(rootDir, sourceName);
  await rm(candidatePath, { recursive: true, force: true });
  await mkdir(path.dirname(candidatePath), { recursive: true });
  await runGit(['clone', '--depth=1', source.url, candidatePath]);
  await rm(path.join(candidatePath, '.git'), { recursive: true, force: true });
  return candidatePath;
}

export async function applyCandidate(rootDir, sourceName, source) {
  const candidatePath = candidatePathForSource(rootDir, sourceName);
  const targetPath = upstreamPathForSource(rootDir, sourceName, source);
  await rm(targetPath, { recursive: true, force: true });
  await mkdir(path.dirname(targetPath), { recursive: true });
  await cp(candidatePath, targetPath, { recursive: true });
  return targetPath;
}
```

- [x] **Step 4: Run focused helper tests**

Run:

```bash
node --test tests/installer/upstream.test.mjs
```

Expected: PASS for the three helper tests.

- [x] **Step 5: Commit Task 1**

Run:

```bash
git add harness/installer/lib/upstream.mjs tests/installer/upstream.test.mjs
git commit -m "feat: add upstream update helpers"
```

## Task 2: Fetch Command Candidate Staging

**Files:**
- Modify: `harness/installer/commands/fetch.mjs`
- Test: `tests/installer/upstream-commands.test.mjs`

- [x] **Step 1: Write failing command tests for local staging**

Create `tests/installer/upstream-commands.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fetchCommand } from '../../harness/installer/commands/fetch.mjs';

async function withCwd(dir, fn) {
  const previous = process.cwd();
  process.chdir(dir);
  try {
    return await fn();
  } finally {
    process.chdir(previous);
  }
}

async function writeSources(root) {
  await mkdir(path.join(root, 'harness/upstream'), { recursive: true });
  await writeFile(
    path.join(root, 'harness/upstream/sources.json'),
    JSON.stringify({
      schemaVersion: 1,
      sources: {
        'planning-with-files': {
          type: 'local-initial-import',
          path: 'harness/upstream/planning-with-files'
        }
      }
    })
  );
}

test('fetchCommand stages local planning-with-files candidate without touching core', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'harness-fetch-'));
  const source = await mkdtemp(path.join(os.tmpdir(), 'harness-local-source-'));
  try {
    await writeSources(root);
    await mkdir(path.join(root, 'harness/core/policy'), { recursive: true });
    await writeFile(path.join(root, 'harness/core/policy/base.md'), 'core policy');
    await writeFile(path.join(source, 'SKILL.md'), '# Planning With Files\n');

    await withCwd(root, () => fetchCommand(['--source=planning-with-files', `--from=${source}`]));

    assert.equal(
      await readFile(path.join(root, '.harness/upstream-candidates/planning-with-files/SKILL.md'), 'utf8'),
      '# Planning With Files\n'
    );
    assert.equal(await readFile(path.join(root, 'harness/core/policy/base.md'), 'utf8'), 'core policy');
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(source, { recursive: true, force: true });
  }
});
```

- [x] **Step 2: Run test and verify it fails**

Run:

```bash
node --test tests/installer/upstream-commands.test.mjs
```

Expected: FAIL because `fetchCommand` still only prints the contract message and does not stage candidates.

- [x] **Step 3: Implement fetch command**

Replace `harness/installer/commands/fetch.mjs` with:

```js
import {
  loadUpstreamSources,
  parseFromPath,
  parseSourceFilter,
  stageGitCandidate,
  stageLocalCandidate
} from '../lib/upstream.mjs';

function selectedSources(sources, filter) {
  if (filter === 'all') return Object.entries(sources);
  if (!sources[filter]) {
    throw new Error(`Unknown upstream source: ${filter}`);
  }
  return [[filter, sources[filter]]];
}

export async function fetchCommand(args = []) {
  const rootDir = process.cwd();
  const sources = await loadUpstreamSources(rootDir);
  const filter = parseSourceFilter(args);
  const fromPath = parseFromPath(args);
  const staged = [];

  for (const [sourceName, source] of selectedSources(sources, filter)) {
    if (source.type === 'git') {
      staged.push(await stageGitCandidate(rootDir, sourceName, source));
      continue;
    }
    if (source.type === 'local-initial-import') {
      staged.push(await stageLocalCandidate(rootDir, sourceName, fromPath));
      continue;
    }
    throw new Error(`Unsupported upstream source type: ${source.type}`);
  }

  console.log(`Fetched ${staged.length} upstream candidate(s): ${staged.join(', ')}`);
}
```

- [x] **Step 4: Run command tests**

Run:

```bash
node --test tests/installer/upstream-commands.test.mjs
```

Expected: PASS for local candidate staging.

- [x] **Step 5: Run helper and command tests together**

Run:

```bash
node --test tests/installer/upstream.test.mjs tests/installer/upstream-commands.test.mjs
```

Expected: PASS for all upstream tests.

- [x] **Step 6: Commit Task 2**

Run:

```bash
git add harness/installer/commands/fetch.mjs tests/installer/upstream-commands.test.mjs
git commit -m "feat: stage upstream fetch candidates"
```

## Task 3: Update Command Allowlisted Apply

**Files:**
- Modify: `harness/installer/commands/update.mjs`
- Modify: `tests/installer/upstream-commands.test.mjs`

- [x] **Step 1: Add failing update tests**

Modify `tests/installer/upstream-commands.test.mjs` so the import section includes:

```js
import { updateCommand } from '../../harness/installer/commands/update.mjs';
```

Then append these tests to the same file:

```js

test('updateCommand applies candidate only to harness upstream path', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'harness-update-'));
  const source = await mkdtemp(path.join(os.tmpdir(), 'harness-local-source-'));
  try {
    await writeSources(root);
    await mkdir(path.join(root, 'harness/core/policy'), { recursive: true });
    await mkdir(path.join(root, 'harness/upstream/planning-with-files'), { recursive: true });
    await writeFile(path.join(root, 'harness/core/policy/base.md'), 'core policy');
    await writeFile(path.join(root, 'harness/upstream/planning-with-files/SKILL.md'), 'old skill');
    await writeFile(path.join(source, 'SKILL.md'), 'new skill');

    await withCwd(root, async () => {
      await fetchCommand(['--source=planning-with-files', `--from=${source}`]);
      await updateCommand(['--source=planning-with-files']);
    });

    assert.equal(await readFile(path.join(root, 'harness/upstream/planning-with-files/SKILL.md'), 'utf8'), 'new skill');
    assert.equal(await readFile(path.join(root, 'harness/core/policy/base.md'), 'utf8'), 'core policy');
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(source, { recursive: true, force: true });
  }
});

test('updateCommand rejects source metadata that targets harness core', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'harness-update-guard-'));
  try {
    await mkdir(path.join(root, 'harness/upstream'), { recursive: true });
    await mkdir(path.join(root, '.harness/upstream-candidates/evil'), { recursive: true });
    await writeFile(path.join(root, '.harness/upstream-candidates/evil/file.md'), 'evil');
    await writeFile(
      path.join(root, 'harness/upstream/sources.json'),
      JSON.stringify({
        schemaVersion: 1,
        sources: {
          evil: { type: 'local-initial-import', path: 'harness/core/policy' }
        }
      })
    );

    await assert.rejects(
      withCwd(root, () => updateCommand(['--source=evil'])),
      /must stay inside harness\/upstream|outside allowed root/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

- [x] **Step 2: Run test and verify it fails**

Run:

```bash
node --test tests/installer/upstream-commands.test.mjs
```

Expected: FAIL because `updateCommand` still only prints the contract message.

- [x] **Step 3: Implement update command**

Replace `harness/installer/commands/update.mjs` with:

```js
import {
  applyCandidate,
  loadUpstreamSources,
  parseSourceFilter
} from '../lib/upstream.mjs';

function selectedSources(sources, filter) {
  if (filter === 'all') return Object.entries(sources);
  if (!sources[filter]) {
    throw new Error(`Unknown upstream source: ${filter}`);
  }
  return [[filter, sources[filter]]];
}

export async function updateCommand(args = []) {
  const rootDir = process.cwd();
  const sources = await loadUpstreamSources(rootDir);
  const filter = parseSourceFilter(args);
  const updated = [];

  for (const [sourceName, source] of selectedSources(sources, filter)) {
    updated.push(await applyCandidate(rootDir, sourceName, source));
  }

  console.log(`Updated ${updated.length} upstream source(s): ${updated.join(', ')}`);
}
```

- [x] **Step 4: Run command tests**

Run:

```bash
node --test tests/installer/upstream-commands.test.mjs
```

Expected: PASS for fetch and update command tests.

- [x] **Step 5: Run repo verification**

Run:

```bash
npm run verify
```

Expected: all repo-scoped tests pass, including the new upstream tests through `tests/installer/*.test.mjs`.

- [x] **Step 6: Commit Task 3**

Run:

```bash
git add harness/installer/commands/update.mjs tests/installer/upstream-commands.test.mjs
git commit -m "feat: apply upstream candidates safely"
```

## Task 4: Documentation and Maintenance Flow

**Files:**
- Modify: `docs/maintenance.md`
- Modify: `planning/active/harness-upstream-smooth-update/findings.md`
- Modify: `planning/active/harness-upstream-smooth-update/progress.md`

- [x] **Step 1: Update maintenance docs**

Add this section to `docs/maintenance.md`:

````md
## Upstream Skill Updates

Upstream updates are staged before they are applied:

```bash
./scripts/harness fetch --source=superpowers
./scripts/harness update --source=superpowers
```

`planning-with-files` currently uses a local initial import source, so provide the local source explicitly:

```bash
./scripts/harness fetch --source=planning-with-files --from=/path/to/planning-with-files
./scripts/harness update --source=planning-with-files
```

The update command may only write into `harness/upstream/<source-name>`. It must not modify `harness/core`, `harness/adapters`, `harness/installer`, or `planning/active`.

After any upstream update, run:

```bash
npm run verify
./scripts/harness sync
./scripts/harness doctor
```
````

- [x] **Step 2: Run documentation diff check**

Run:

```bash
git diff --check -- docs/maintenance.md
```

Expected: no whitespace errors.

- [x] **Step 3: Run full verification**

Run:

```bash
npm run verify
```

Expected: all repo-scoped tests pass.

- [x] **Step 4: Update Planning with Files**

Update:

- `planning/active/harness-upstream-smooth-update/findings.md` with final update-flow decisions and verification result.
- `planning/active/harness-upstream-smooth-update/progress.md` with commands and pass/fail outcomes.
- `planning/active/harness-upstream-smooth-update/task_plan.md` lifecycle only after implementation is fully verified.

- [x] **Step 5: Commit Task 4**

Run:

```bash
git add docs/maintenance.md planning/active/harness-upstream-smooth-update
git commit -m "docs: document upstream skill update flow"
```

## Final Verification

- [x] **Step 1: Run focused upstream tests**

Run:

```bash
node --test tests/installer/upstream.test.mjs tests/installer/upstream-commands.test.mjs
```

Expected: all upstream helper and command tests pass.

- [x] **Step 2: Run full repository verification**

Run:

```bash
npm run verify
```

Expected: all tests pass.

- [x] **Step 3: Inspect mutation boundaries**

Run:

```bash
git diff --name-only
```

Expected changed files are limited to:

```text
docs/maintenance.md
harness/installer/commands/fetch.mjs
harness/installer/commands/update.mjs
harness/installer/lib/upstream.mjs
tests/installer/upstream.test.mjs
tests/installer/upstream-commands.test.mjs
planning/active/harness-upstream-smooth-update/findings.md
planning/active/harness-upstream-smooth-update/progress.md
planning/active/harness-upstream-smooth-update/task_plan.md
```

If an actual upstream refresh is performed during implementation, also allow changes under:

```text
harness/upstream/superpowers/**
harness/upstream/planning-with-files/**
```

No changes under `harness/core/**`, `harness/adapters/**`, or unrelated `planning/active/**` should appear.

## Decisions

- `fetch` stages candidates; `update` applies candidates. This prevents direct remote-to-baseline mutation.
- Only `harness/upstream/**` is an update target. `.harness/upstream-candidates/**` is ignored local staging state.
- `superpowers` can be fetched from git because `sources.json` already has a git URL.
- `planning-with-files` remains local-source based for now; fetch requires `--from=/path/to/planning-with-files` until a portable upstream URL is defined.
- The hard guarantee is test-backed path confinement, not a policy sentence alone.

## Self-Review

- Spec coverage: covered real `fetch`, real `update`, allowlisted writes, planning-with-files local source behavior, docs, and verification.
- Placeholder scan: no placeholder work items are left; all tasks include explicit files, commands, and expected outcomes.
- Type consistency: helper names used in tests match helper names defined in the planned `upstream.mjs` implementation.

## Errors Encountered

| Error | Attempt | Resolution |
|---|---|---|
| None | 0 | No implementation attempted in this planning-only turn. |
