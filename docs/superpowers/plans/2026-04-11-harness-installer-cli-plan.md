# Harness Installer CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 `./scripts/harness` CLI 的基础状态机、路径解析、render/link/materialize 操作，以及 `install`、`doctor`、`sync` 的最小可用版本。

**Architecture:** CLI 入口只做命令分发，业务逻辑放在 `harness/installer/lib/`。所有平台信息从 `harness/core/metadata/platforms.json` 和 `harness/core/skills/index.json` 读取，避免把平台规则写死在 CLI 命令里。

**Tech Stack:** Node.js built-in modules, `node:test`, POSIX shell wrapper, JSON state.

---

## File Structure

- Create: `scripts/harness` - executable shell wrapper.
- Create: `harness/installer/commands/harness.mjs` - CLI dispatcher.
- Create: `harness/installer/commands/install.mjs` - interactive and flag-driven install command.
- Create: `harness/installer/commands/doctor.mjs` - health check command.
- Create: `harness/installer/commands/sync.mjs` - projection sync command.
- Create: `harness/installer/commands/status.mjs` - state summary command.
- Create: `harness/installer/commands/fetch.mjs` - command contract placeholder with explicit non-mutating response.
- Create: `harness/installer/commands/update.mjs` - command contract placeholder with explicit response.
- Create: `harness/installer/lib/state.mjs` - state read/write helpers.
- Create: `harness/installer/lib/metadata.mjs` - metadata loading and validation.
- Create: `harness/installer/lib/paths.mjs` - workspace and user-global path resolver.
- Create: `harness/installer/lib/fs-ops.mjs` - link/materialize/render filesystem helpers.
- Create: `tests/installer/state.test.mjs`
- Create: `tests/installer/paths.test.mjs`
- Create: `tests/installer/fs-ops.test.mjs`

## Task 1: Add CLI Wrapper And Dispatcher

**Files:**
- Create: `scripts/harness`
- Create: `harness/installer/commands/harness.mjs`

- [ ] **Step 1: Create executable wrapper**

Create `scripts/harness`:

```sh
#!/usr/bin/env sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
exec node "$ROOT_DIR/harness/installer/commands/harness.mjs" "$@"
```

- [ ] **Step 2: Create dispatcher**

Create `harness/installer/commands/harness.mjs`:

```js
#!/usr/bin/env node
import { install } from './install.mjs';
import { doctor } from './doctor.mjs';
import { sync } from './sync.mjs';
import { status } from './status.mjs';
import { fetchCommand } from './fetch.mjs';
import { updateCommand } from './update.mjs';

const commands = {
  install,
  doctor,
  sync,
  status,
  fetch: fetchCommand,
  update: updateCommand
};

function usage() {
  return [
    'Usage: ./scripts/harness <command>',
    '',
    'Commands:',
    '  install  Configure Harness projections',
    '  doctor   Check Harness installation health',
    '  sync     Reproject core into installed targets',
    '  status   Show local Harness state',
    '  fetch    Fetch upstream candidates',
    '  update   Apply fetched upstream candidates'
  ].join('\n');
}

const [commandName, ...args] = process.argv.slice(2);

if (!commandName || commandName === '--help' || commandName === '-h') {
  console.log(usage());
  process.exit(0);
}

const command = commands[commandName];
if (!command) {
  console.error(`Unknown command: ${commandName}`);
  console.error(usage());
  process.exit(1);
}

try {
  await command(args);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
```

- [ ] **Step 3: Create temporary command modules**

Create each command file with an exported function so dispatcher can load:

```js
export async function install() {
  console.log('install command contract ready');
}
```

Use matching function names:

```text
doctor
sync
status
fetchCommand
updateCommand
```

- [ ] **Step 4: Make wrapper executable**

Run:

```bash
chmod +x scripts/harness
```

Expected:

```text
no output and exit code 0
```

- [ ] **Step 5: Run dispatcher help**

Run:

```bash
./scripts/harness --help
```

Expected:

```text
Usage: ./scripts/harness <command>
```

- [ ] **Step 6: Commit**

```bash
git add scripts/harness harness/installer/commands
git commit -m "feat: add harness cli dispatcher"
```

## Task 2: Implement State Helpers

**Files:**
- Create: `harness/installer/lib/state.mjs`
- Test: `tests/installer/state.test.mjs`

- [ ] **Step 1: Write failing test**

Create `tests/installer/state.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { defaultState, readState, writeState } from '../../harness/installer/lib/state.mjs';

test('defaultState creates v1 workspace state', () => {
  assert.deepEqual(defaultState(), {
    schemaVersion: 1,
    scope: 'workspace',
    projectionMode: 'link',
    targets: {},
    upstream: {}
  });
});

test('writeState and readState roundtrip local state', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'harness-state-'));
  try {
    const state = {
      schemaVersion: 1,
      scope: 'both',
      projectionMode: 'portable',
      targets: { codex: { enabled: true, paths: ['AGENTS.md'] } },
      upstream: {}
    };

    await writeState(dir, state);
    assert.deepEqual(await readState(dir), state);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test tests/installer/state.test.mjs
```

Expected:

```text
Cannot find module
```

- [ ] **Step 3: Implement state helpers**

Create `harness/installer/lib/state.mjs`:

```js
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export function defaultState() {
  return {
    schemaVersion: 1,
    scope: 'workspace',
    projectionMode: 'link',
    targets: {},
    upstream: {}
  };
}

export function statePath(rootDir) {
  return path.join(rootDir, '.harness', 'state.json');
}

export async function readState(rootDir) {
  try {
    return JSON.parse(await readFile(statePath(rootDir), 'utf8'));
  } catch (error) {
    if (error && error.code === 'ENOENT') return defaultState();
    throw error;
  }
}

export async function writeState(rootDir, state) {
  await mkdir(path.dirname(statePath(rootDir)), { recursive: true });
  await writeFile(statePath(rootDir), `${JSON.stringify(state, null, 2)}\n`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
node --test tests/installer/state.test.mjs
```

Expected:

```text
ok
```

- [ ] **Step 5: Commit**

```bash
git add harness/installer/lib/state.mjs tests/installer/state.test.mjs
git commit -m "feat: add harness state helpers"
```

## Task 3: Implement Metadata Loader

**Files:**
- Create: `harness/installer/lib/metadata.mjs`
- Test: `tests/installer/metadata.test.mjs`

- [ ] **Step 1: Write failing test**

Create `tests/installer/metadata.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadPlatforms, normalizeTargets, normalizeScope } from '../../harness/installer/lib/metadata.mjs';

test('loadPlatforms reads v1 supported targets', async () => {
  const metadata = await loadPlatforms(process.cwd());
  assert.equal(metadata.defaultScope, 'workspace');
  assert.deepEqual(metadata.supportedScopes, ['workspace', 'user-global', 'both']);
  assert.ok(metadata.platforms.codex);
  assert.ok(metadata.platforms.copilot);
  assert.ok(metadata.platforms.cursor);
  assert.ok(metadata.platforms['claude-code']);
});

test('normalizeScope rejects invalid scope', () => {
  assert.equal(normalizeScope('both'), 'both');
  assert.throws(() => normalizeScope('global'), /Invalid scope/);
});

test('normalizeTargets expands all and validates names', async () => {
  const metadata = await loadPlatforms(process.cwd());
  assert.deepEqual(normalizeTargets(metadata, ['all']), ['codex', 'copilot', 'cursor', 'claude-code']);
  assert.throws(() => normalizeTargets(metadata, ['unknown']), /Unknown target/);
});
```

- [ ] **Step 2: Implement metadata loader**

Create `harness/installer/lib/metadata.mjs`:

```js
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const scopes = new Set(['workspace', 'user-global', 'both']);

export async function loadPlatforms(rootDir) {
  const file = path.join(rootDir, 'harness/core/metadata/platforms.json');
  return JSON.parse(await readFile(file, 'utf8'));
}

export function normalizeScope(scope = 'workspace') {
  if (!scopes.has(scope)) {
    throw new Error(`Invalid scope: ${scope}. Expected workspace, user-global, or both.`);
  }
  return scope;
}

export function normalizeTargets(metadata, targets) {
  const available = Object.keys(metadata.platforms);
  if (!targets.length || targets.includes('all')) return available;

  for (const target of targets) {
    if (!available.includes(target)) {
      throw new Error(`Unknown target: ${target}`);
    }
  }

  return targets;
}
```

- [ ] **Step 3: Run test**

Run:

```bash
node --test tests/installer/metadata.test.mjs
```

Expected:

```text
ok
```

- [ ] **Step 4: Commit**

```bash
git add harness/installer/lib/metadata.mjs tests/installer/metadata.test.mjs
git commit -m "feat: add metadata loading"
```

## Task 4: Implement Path Resolver

**Files:**
- Create: `harness/installer/lib/paths.mjs`
- Test: `tests/installer/paths.test.mjs`

- [ ] **Step 1: Write failing test**

Create `tests/installer/paths.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveTargetPaths } from '../../harness/installer/lib/paths.mjs';

test('resolveTargetPaths returns workspace paths', () => {
  const paths = resolveTargetPaths('/repo', '/home/user', 'workspace', 'codex');
  assert.deepEqual(paths, ['/repo/AGENTS.md']);
});

test('resolveTargetPaths returns user-global paths', () => {
  const paths = resolveTargetPaths('/repo', '/home/user', 'user-global', 'copilot');
  assert.deepEqual(paths, ['/home/user/.copilot/copilot-instructions.md']);
});

test('resolveTargetPaths returns both paths', () => {
  const paths = resolveTargetPaths('/repo', '/home/user', 'both', 'cursor');
  assert.deepEqual(paths, ['/repo/.cursor/rules/harness.mdc', '/home/user/.cursor/rules/harness.mdc']);
});
```

- [ ] **Step 2: Implement path resolver**

Create `harness/installer/lib/paths.mjs`:

```js
import path from 'node:path';

const workspacePaths = {
  codex: ['AGENTS.md'],
  copilot: ['.copilot/copilot-instructions.md'],
  cursor: ['.cursor/rules/harness.mdc'],
  'claude-code': ['CLAUDE.md']
};

const globalPaths = {
  codex: ['.codex/AGENTS.md'],
  copilot: ['.copilot/copilot-instructions.md'],
  cursor: ['.cursor/rules/harness.mdc'],
  'claude-code': ['.claude/CLAUDE.md']
};

function expand(base, values) {
  return values.map((value) => path.join(base, value));
}

export function resolveTargetPaths(rootDir, homeDir, scope, target) {
  const results = [];

  if (scope === 'workspace' || scope === 'both') {
    results.push(...expand(rootDir, workspacePaths[target] || []));
  }

  if (scope === 'user-global' || scope === 'both') {
    results.push(...expand(homeDir, globalPaths[target] || []));
  }

  return results;
}
```

- [ ] **Step 3: Run test**

Run:

```bash
node --test tests/installer/paths.test.mjs
```

Expected:

```text
ok
```

- [ ] **Step 4: Commit**

```bash
git add harness/installer/lib/paths.mjs tests/installer/paths.test.mjs
git commit -m "feat: add target path resolver"
```

## Task 5: Implement Filesystem Operations

**Files:**
- Create: `harness/installer/lib/fs-ops.mjs`
- Test: `tests/installer/fs-ops.test.mjs`

- [ ] **Step 1: Write failing test**

Create `tests/installer/fs-ops.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { materializeFile, renderTemplate } from '../../harness/installer/lib/fs-ops.mjs';

test('renderTemplate replaces named tokens', () => {
  assert.equal(renderTemplate('Hello {{name}}', { name: 'Harness' }), 'Hello Harness');
});

test('materializeFile copies content and creates parent dirs', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'harness-fs-'));
  try {
    const source = path.join(dir, 'source.md');
    const target = path.join(dir, 'nested/target.md');
    await writeFile(source, 'content');
    await materializeFile(source, target);
    assert.equal(await readFile(target, 'utf8'), 'content');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Implement filesystem helpers**

Create `harness/installer/lib/fs-ops.mjs`:

```js
import { copyFile, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

export function renderTemplate(template, values) {
  return template.replace(/\{\{([a-zA-Z0-9_.-]+)\}\}/g, (_, key) => {
    if (!(key in values)) {
      throw new Error(`Missing template value: ${key}`);
    }
    return values[key];
  });
}

export async function writeRenderedFile(targetPath, content) {
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, content);
}

export async function materializeFile(sourcePath, targetPath) {
  await mkdir(path.dirname(targetPath), { recursive: true });
  await copyFile(sourcePath, targetPath);
}

export async function linkPath(sourcePath, targetPath) {
  await mkdir(path.dirname(targetPath), { recursive: true });
  await rm(targetPath, { recursive: true, force: true });
  await symlink(sourcePath, targetPath);
}

export async function readText(filePath) {
  return readFile(filePath, 'utf8');
}
```

- [ ] **Step 3: Run test**

Run:

```bash
node --test tests/installer/fs-ops.test.mjs
```

Expected:

```text
ok
```

- [ ] **Step 4: Commit**

```bash
git add harness/installer/lib/fs-ops.mjs tests/installer/fs-ops.test.mjs
git commit -m "feat: add projection filesystem helpers"
```

## Task 6: Implement Install And Status Commands

**Files:**
- Modify: `harness/installer/commands/install.mjs`
- Modify: `harness/installer/commands/status.mjs`

- [ ] **Step 1: Implement flag parsing install command**

Replace `harness/installer/commands/install.mjs` with:

```js
import os from 'node:os';
import { loadPlatforms, normalizeScope, normalizeTargets } from '../lib/metadata.mjs';
import { resolveTargetPaths } from '../lib/paths.mjs';
import { writeState } from '../lib/state.mjs';

function readOption(args, name, fallback) {
  const prefix = `--${name}=`;
  const value = args.find((arg) => arg.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

export async function install(args = []) {
  const rootDir = process.cwd();
  const metadata = await loadPlatforms(rootDir);
  const scope = normalizeScope(readOption(args, 'scope', metadata.defaultScope));
  const projectionMode = readOption(args, 'projection', 'link');
  const targetArg = readOption(args, 'targets', 'all');
  const targets = normalizeTargets(metadata, targetArg.split(',').filter(Boolean));

  if (!['link', 'portable'].includes(projectionMode)) {
    throw new Error(`Invalid projection mode: ${projectionMode}`);
  }

  const state = {
    schemaVersion: 1,
    scope,
    projectionMode,
    targets: {},
    upstream: {}
  };

  for (const target of targets) {
    state.targets[target] = {
      enabled: true,
      paths: resolveTargetPaths(rootDir, os.homedir(), scope, target)
    };
  }

  await writeState(rootDir, state);
  console.log(`Installed Harness state for ${targets.join(', ')} using ${scope} scope.`);
}
```

- [ ] **Step 2: Implement status command**

Replace `harness/installer/commands/status.mjs` with:

```js
import { readState } from '../lib/state.mjs';

export async function status() {
  const state = await readState(process.cwd());
  console.log(JSON.stringify(state, null, 2));
}
```

- [ ] **Step 3: Run install**

Run:

```bash
./scripts/harness install --scope=both --targets=codex,copilot --projection=portable
```

Expected:

```text
Installed Harness state for codex, copilot using both scope.
```

- [ ] **Step 4: Run status**

Run:

```bash
./scripts/harness status
```

Expected includes:

```json
"scope": "both"
```

- [ ] **Step 5: Commit**

```bash
git add harness/installer/commands/install.mjs harness/installer/commands/status.mjs .harness/state.json
git commit -m "feat: add install state command"
```

## Task 7: Implement Doctor And Sync Contracts

**Files:**
- Modify: `package.json`
- Modify: `harness/installer/commands/doctor.mjs`
- Modify: `harness/installer/commands/sync.mjs`
- Modify: `harness/installer/commands/fetch.mjs`
- Modify: `harness/installer/commands/update.mjs`

- [ ] **Step 1: Implement doctor**

Replace `harness/installer/commands/doctor.mjs` with:

```js
import { access, readFile } from 'node:fs/promises';
import { readState } from '../lib/state.mjs';

export async function doctor(args = []) {
  const checkOnly = args.includes('--check-only');
  const state = await readState(process.cwd());
  const problems = [];

  for (const [target, config] of Object.entries(state.targets)) {
    for (const filePath of config.paths) {
      try {
        await access(filePath);
        const text = await readFile(filePath, 'utf8').catch(() => '');
        const authorPath = `/Users/${'jared'}/`;
        if (text.includes(authorPath)) {
          problems.push(`${target}: personal path found in ${filePath}`);
        }
      } catch {
        problems.push(`${target}: missing ${filePath}`);
      }
    }
  }

  if (problems.length) {
    console.error(problems.join('\n'));
    process.exitCode = 1;
    return;
  }

  console.log(checkOnly ? 'Harness check passed.' : 'Harness installation is healthy.');
}
```

After `doctor.mjs` exists, update `package.json` so `verify` runs the doctor check as well:

```json
{
  "scripts": {
    "verify": "node --test && node harness/installer/commands/doctor.mjs --check-only"
  }
}
```

- [ ] **Step 2: Implement sync contract**

Replace `harness/installer/commands/sync.mjs` with:

```js
import { readState } from '../lib/state.mjs';

export async function sync() {
  const state = await readState(process.cwd());
  const targets = Object.keys(state.targets);
  console.log(`Sync contract ready for ${targets.length} target(s): ${targets.join(', ')}`);
}
```

- [ ] **Step 3: Implement fetch contract**

Replace `harness/installer/commands/fetch.mjs` with:

```js
export async function fetchCommand() {
  console.log('Fetch command contract ready. Upstream mutation is not enabled in this milestone.');
}
```

- [ ] **Step 4: Implement update contract**

Replace `harness/installer/commands/update.mjs` with:

```js
export async function updateCommand() {
  console.log('Update command contract ready. Applying fetched upstream changes is not enabled in this milestone.');
}
```

- [ ] **Step 5: Run full command smoke test**

Run:

```bash
./scripts/harness status
./scripts/harness sync
./scripts/harness fetch
./scripts/harness update
```

Expected:

```text
status prints JSON
sync prints target count
fetch prints contract message
update prints contract message
```

- [ ] **Step 6: Commit**

```bash
git add harness/installer/commands
git commit -m "feat: add installer command contracts"
```

## Self-Review

- Spec coverage: 覆盖 CLI 入口、state、metadata、scope、projection mode、install/status/doctor/sync/fetch/update 命令合同。
- Placeholder scan: passed; fetch/update are explicit command contracts, not empty placeholders.
- Type consistency: `scope`、`projectionMode`、`targets` 与 core schema 一致。

## Task Memory

- Authoritative task state: `planning/active/harness-template-foundation/`
