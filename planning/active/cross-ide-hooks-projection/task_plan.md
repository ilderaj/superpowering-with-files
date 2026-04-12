# Entry And Skills Governance Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 HarnessTemplate 的 `sync`、`doctor`、`status`、`update` 形成真正的 entry + skills 投影闭环，并安全处理 Copilot 的 `planning-with-files` materialized copy。

**Architecture:** `harness/upstream/*` 继续作为可替换 baseline；`harness/core/metadata` 只声明平台读取路径和 projection metadata；`harness/installer/lib` 负责生成 projection plan、执行 link/materialize/render、安全冲突处理和健康检查。`update` 只更新 upstream baseline，后续 `sync` 从更新后的 baseline 重新投影到各 IDE 实际读取目录。

**Tech Stack:** Node.js ESM, `node:test`, JSON metadata, POSIX-compatible filesystem operations, Harness CLI.

---

## Current State

Status: waiting_review
Archive Eligible: no
Close Reason:

## Worktree Context

- Worktree base: `dev @ 7c5bcfe4eb61f3b23ab82bc21bec78c7a727bfe4`
- 执行阶段使用隔离 worktree：`/Users/jared/.config/superpowers/worktrees/HarnessTemplate/codex-entry-skills-governance`。
- 如果执行本计划前需要隔离 worktree，先运行：

```bash
./scripts/harness worktree-preflight
git worktree add <path> -b codex/entry-skills-governance dev
```

## Finishing Criteria

- `sync` 会渲染 entry files，并为每个 enabled target 投影 `superpowers` 和 `planning-with-files`。
- `sync --conflict=reject` 遇到非 Harness-owned 目标文件或目录会拒绝覆盖。
- `sync --conflict=backup` 遇到非 Harness-owned 目标文件或目录会先备份，再写入 projection。
- Copilot 的 `planning-with-files` materialized copy 会真实写入 `.github/skills/planning-with-files` 或 `~/.copilot/skills/planning-with-files`，并执行 Harness-owned patch。
- `doctor` 会检查每个 IDE 的 entry 是否存在、skills 是否存在、symlink 是否指向正确 source、Copilot materialized copy 是否存在且包含 patch marker。
- `status` 会展示每个 IDE 的 entry + skills 状态，而不是只输出裸 state JSON。
- `update` 更新 `harness/upstream/*` 后，下一次 `sync` 会用更新后的 baseline 覆盖 Harness-owned skill projections。
- `npm run verify` 通过。
- README 和 compatibility docs 删除“skills 尚未 wired into sync”的旧说明，并说明冲突处理、Copilot materialize 路径和 doctor/status 行为。

## Execution Result

- Implementation complete on branch `codex/entry-skills-governance`.
- Verification complete:
  - `npm run verify` passed with 56 tests.
  - Temporary projection smoke passed for Codex, Copilot, Cursor, and Claude Code.
  - Conflict smoke passed: default sync rejected non-Harness-owned Copilot skill path; `--conflict=backup` backed it up and completed.
  - `git diff --check` passed after Markdown whitespace cleanup.

## File Structure

- Modify: `harness/core/metadata/platforms.json`
  增加每个平台 workspace/global 的 `skillRoots`。
- Modify: `harness/core/skills/index.json`
  增加 `layout`、`targetName` 和 Copilot patch marker metadata。
- Modify: `harness/core/state-schema/state.schema.json`
  增加 projection manifest 相关状态说明时保持 state v1 兼容。
- Create: `harness/installer/lib/projection-manifest.mjs`
  记录 Harness-owned projection paths，用于安全替换和 doctor 检查。
- Modify: `harness/installer/lib/paths.mjs`
  增加 skills root/path resolver。
- Modify: `harness/installer/lib/fs-ops.mjs`
  增加 safe write/copy/link helpers、目录 materialize、冲突备份。
- Modify: `harness/installer/lib/skill-projection.mjs`
  从 strategy lookup 扩展为完整 projection planner。
- Create: `harness/installer/lib/copilot-planning-patch.mjs`
  对 Copilot materialized `planning-with-files` 执行实际 patch。
- Create: `harness/installer/lib/health.mjs`
  产出 doctor/status 共享的 entry + skills 健康状态。
- Modify: `harness/installer/commands/sync.mjs`
  执行 entry + skills projection。
- Modify: `harness/installer/commands/doctor.mjs`
  使用 health summary 进行检查。
- Modify: `harness/installer/commands/status.mjs`
  输出 IDE 维度状态摘要。
- Modify: `harness/installer/commands/install.mjs`
  继续只写 state，但校验 projection mode 与 targets，为 sync 留出 conflict mode。
- Create: `tests/helpers/harness-fixture.mjs`
  为 command tests 创建临时 Harness root。
- Modify: `tests/installer/paths.test.mjs`
- Modify: `tests/installer/fs-ops.test.mjs`
- Modify: `tests/adapters/skill-projection.test.mjs`
- Modify: `tests/adapters/sync.test.mjs`
- Create: `tests/adapters/sync-skills.test.mjs`
- Create: `tests/installer/health.test.mjs`
- Modify: `tests/core/skill-index.test.mjs`
- Modify: `README.md`
- Modify: `docs/architecture.md`
- Modify: `docs/compatibility/copilot-planning-with-files.md`
- Modify: `docs/install/codex.md`
- Modify: `docs/install/copilot.md`
- Modify: `docs/install/cursor.md`
- Modify: `docs/install/claude-code.md`

## Task Graph

```mermaid
flowchart TD
  T1["Task 1: metadata and path contract"] --> T2["Task 2: projection manifest and safe fs ops"]
  T2 --> T3["Task 3: skill projection planner"]
  T3 --> T4["Task 4: Copilot planning patch"]
  T4 --> T5["Task 5: sync executes skills projection"]
  T5 --> T6["Task 6: doctor/status health summary"]
  T5 --> T7["Task 7: update-to-sync refresh coverage"]
  T6 --> T8["Task 8: docs"]
  T7 --> T8
  T8 --> T9["Task 9: verification"]
```

### Task 1: Metadata And Path Contract

**Files:**
- Modify: `harness/core/metadata/platforms.json`
- Modify: `harness/core/skills/index.json`
- Modify: `harness/installer/lib/paths.mjs`
- Modify: `tests/installer/paths.test.mjs`
- Modify: `tests/core/skill-index.test.mjs`

- [ ] **Step 1: Write failing path tests**

Add to `tests/installer/paths.test.mjs`:

```js
import { resolveSkillRoots, resolveSkillTargetPaths } from '../../harness/installer/lib/paths.mjs';

test('resolveSkillRoots returns workspace skill root for Copilot', () => {
  assert.deepEqual(resolveSkillRoots('/repo', '/home/user', 'workspace', 'copilot'), [
    '/repo/.github/skills'
  ]);
});

test('resolveSkillRoots returns global skill root for Codex', () => {
  assert.deepEqual(resolveSkillRoots('/repo', '/home/user', 'user-global', 'codex'), [
    '/home/user/.codex/skills'
  ]);
});

test('resolveSkillTargetPaths maps a single skill into each selected root', () => {
  assert.deepEqual(
    resolveSkillTargetPaths('/repo', '/home/user', 'both', 'cursor', {
      layout: 'single',
      targetName: 'planning-with-files'
    }),
    [
      '/repo/.cursor/skills/planning-with-files',
      '/home/user/.cursor/skills/planning-with-files'
    ]
  );
});

test('resolveSkillTargetPaths maps collection children into the skill root', () => {
  assert.deepEqual(
    resolveSkillTargetPaths('/repo', '/home/user', 'workspace', 'claude-code', {
      layout: 'collection',
      childNames: ['using-superpowers', 'writing-plans']
    }),
    [
      '/repo/.claude/skills/using-superpowers',
      '/repo/.claude/skills/writing-plans'
    ]
  );
});
```

- [ ] **Step 2: Run path tests and verify failure**

Run:

```bash
npm run test -- tests/installer/paths.test.mjs
```

Expected: FAIL with missing exports `resolveSkillRoots` and `resolveSkillTargetPaths`.

- [ ] **Step 3: Update platform metadata**

Modify each platform in `harness/core/metadata/platforms.json`:

```json
"codex": {
  "displayName": "Codex",
  "entryFiles": ["AGENTS.md"],
  "skillRoots": {
    "workspace": [".codex/skills"],
    "global": [".codex/skills"]
  },
  "supportsGlobal": true,
  "supportsWorkspace": true,
  "skillsStrategy": "link-preferred"
}
```

Use these `skillRoots` values for the remaining targets:

```json
"copilot": {
  "skillRoots": {
    "workspace": [".github/skills"],
    "global": [".copilot/skills"]
  }
},
"cursor": {
  "skillRoots": {
    "workspace": [".cursor/skills"],
    "global": [".cursor/skills"]
  }
},
"claude-code": {
  "skillRoots": {
    "workspace": [".claude/skills"],
    "global": [".claude/skills"]
  }
}
```

- [ ] **Step 4: Update skill index metadata**

Modify `harness/core/skills/index.json`:

```json
"superpowers": {
  "source": "https://github.com/obra/superpowers",
  "baselinePath": "harness/upstream/superpowers/skills",
  "layout": "collection",
  "projection": {
    "default": "link",
    "copilot": "link",
    "cursor": "link",
    "codex": "link",
    "claude-code": "link"
  }
},
"planning-with-files": {
  "source": "https://github.com/OthmanAdi/planning-with-files",
  "baselinePath": "harness/upstream/planning-with-files",
  "layout": "single",
  "targetName": "planning-with-files",
  "projection": {
    "default": "link",
    "copilot": "materialize",
    "cursor": "link",
    "codex": "link",
    "claude-code": "link"
  },
  "patches": {
    "copilot": {
      "type": "copilot-planning-with-files",
      "marker": "Harness Copilot planning-with-files patch"
    }
  }
}
```

- [ ] **Step 5: Implement path resolvers**

Add to `harness/installer/lib/paths.mjs`:

```js
function resolveSkillRootEntries(target) {
  const platform = platforms[target];
  if (!platform) throw new Error(`Unknown target: ${target}`);
  if (!platform.skillRoots) throw new Error(`Target ${target} does not define skillRoots.`);
  return platform.skillRoots;
}

export function resolveSkillRoots(rootDir, homeDir, scope, target) {
  const roots = resolveSkillRootEntries(target);
  const results = [];

  if (scope === 'workspace' || scope === 'both') {
    results.push(...expand(rootDir, roots.workspace ?? []));
  }

  if (scope === 'user-global' || scope === 'both') {
    results.push(...expand(homeDir, roots.global ?? []));
  }

  return results;
}

export function resolveSkillTargetPaths(rootDir, homeDir, scope, target, descriptor) {
  const roots = resolveSkillRoots(rootDir, homeDir, scope, target);

  if (descriptor.layout === 'single') {
    return roots.map((root) => path.join(root, descriptor.targetName));
  }

  if (descriptor.layout === 'collection') {
    return roots.flatMap((root) => descriptor.childNames.map((childName) => path.join(root, childName)));
  }

  throw new Error(`Unsupported skill layout: ${descriptor.layout}`);
}
```

- [ ] **Step 6: Update skill index tests**

Add to `tests/core/skill-index.test.mjs`:

```js
test('skill index declares layouts required for filesystem projection', async () => {
  const index = JSON.parse(await readFile('harness/core/skills/index.json', 'utf8'));

  assert.equal(index.skills.superpowers.layout, 'collection');
  assert.equal(index.skills['planning-with-files'].layout, 'single');
  assert.equal(index.skills['planning-with-files'].targetName, 'planning-with-files');
  assert.equal(index.skills['planning-with-files'].patches.copilot.type, 'copilot-planning-with-files');
});
```

- [ ] **Step 7: Run focused tests**

Run:

```bash
npm run test -- tests/installer/paths.test.mjs tests/core/skill-index.test.mjs
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add harness/core/metadata/platforms.json harness/core/skills/index.json harness/installer/lib/paths.mjs tests/installer/paths.test.mjs tests/core/skill-index.test.mjs
git commit -m "feat: define skill projection paths"
```

### Task 2: Projection Manifest And Safe Filesystem Operations

**Files:**
- Create: `harness/installer/lib/projection-manifest.mjs`
- Modify: `harness/installer/lib/fs-ops.mjs`
- Modify: `tests/installer/fs-ops.test.mjs`

- [ ] **Step 1: Write failing safe write tests**

Add to `tests/installer/fs-ops.test.mjs`:

```js
import { mkdir, readlink } from 'node:fs/promises';
import {
  linkDirectoryProjection,
  materializeDirectoryProjection,
  writeRenderedProjection
} from '../../harness/installer/lib/fs-ops.mjs';

test('writeRenderedProjection rejects non-owned existing file by default', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'harness-fs-'));
  try {
    const target = path.join(dir, 'AGENTS.md');
    await writeFile(target, 'user content');

    await assert.rejects(
      writeRenderedProjection({
        targetPath: target,
        content: 'generated',
        ownedTargets: new Set(),
        conflictMode: 'reject'
      }),
      /Refusing to overwrite non-Harness-owned path/
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('writeRenderedProjection backs up non-owned existing file when requested', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'harness-fs-'));
  try {
    const target = path.join(dir, 'AGENTS.md');
    await writeFile(target, 'user content');

    const result = await writeRenderedProjection({
      targetPath: target,
      content: 'generated',
      ownedTargets: new Set(),
      conflictMode: 'backup',
      now: () => '20260413T010203'
    });

    assert.equal(await readFile(target, 'utf8'), 'generated');
    assert.equal(await readFile(result.backupPath, 'utf8'), 'user content');
    assert.match(path.basename(result.backupPath), /AGENTS\.md\.harness-backup-20260413T010203/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('linkDirectoryProjection replaces owned path with symlink to source', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'harness-fs-'));
  try {
    const source = path.join(dir, 'source');
    const target = path.join(dir, 'target');
    await mkdir(source, { recursive: true });
    await writeFile(path.join(source, 'SKILL.md'), 'skill');

    await linkDirectoryProjection({
      sourcePath: source,
      targetPath: target,
      ownedTargets: new Set([target]),
      conflictMode: 'reject'
    });

    assert.equal(await readlink(target), source);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('materializeDirectoryProjection copies a directory tree', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'harness-fs-'));
  try {
    const source = path.join(dir, 'source');
    const target = path.join(dir, 'target');
    await mkdir(path.join(source, 'scripts'), { recursive: true });
    await writeFile(path.join(source, 'SKILL.md'), 'skill');
    await writeFile(path.join(source, 'scripts/check.sh'), 'echo ok');

    await materializeDirectoryProjection({
      sourcePath: source,
      targetPath: target,
      ownedTargets: new Set(),
      conflictMode: 'reject'
    });

    assert.equal(await readFile(path.join(target, 'SKILL.md'), 'utf8'), 'skill');
    assert.equal(await readFile(path.join(target, 'scripts/check.sh'), 'utf8'), 'echo ok');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run fs tests and verify failure**

Run:

```bash
npm run test -- tests/installer/fs-ops.test.mjs
```

Expected: FAIL with missing safe projection exports.

- [ ] **Step 3: Add projection manifest helper**

Create `harness/installer/lib/projection-manifest.mjs`:

```js
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export const PROJECTION_MANIFEST_RELATIVE_PATH = '.harness/projections.json';

export function projectionManifestPath(rootDir) {
  return path.join(rootDir, PROJECTION_MANIFEST_RELATIVE_PATH);
}

export async function readProjectionManifest(rootDir) {
  try {
    const manifest = JSON.parse(await readFile(projectionManifestPath(rootDir), 'utf8'));
    if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.entries)) {
      throw new Error('Invalid projection manifest.');
    }
    return manifest;
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return { schemaVersion: 1, entries: [] };
    }
    throw error;
  }
}

export async function writeProjectionManifest(rootDir, manifest) {
  const filePath = projectionManifestPath(rootDir);
  await mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`;

  try {
    await writeFile(tempPath, `${JSON.stringify(manifest, null, 2)}\n`);
    await rename(tempPath, filePath);
  } catch (error) {
    try {
      await unlink(tempPath);
    } catch {
      // Best-effort cleanup only.
    }
    throw error;
  }
}

export function ownedTargetSet(manifest) {
  return new Set(manifest.entries.map((entry) => path.resolve(entry.targetPath)));
}

export function upsertProjectionEntry(manifest, entry) {
  const targetPath = path.resolve(entry.targetPath);
  return {
    schemaVersion: 1,
    entries: [
      ...manifest.entries.filter((existing) => path.resolve(existing.targetPath) !== targetPath),
      { ...entry, targetPath }
    ].sort((left, right) => left.targetPath.localeCompare(right.targetPath))
  };
}
```

- [ ] **Step 4: Implement safe fs projection helpers**

Modify `harness/installer/lib/fs-ops.mjs`:

```js
import { copyFile, cp, lstat, mkdir, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

async function pathExists(targetPath) {
  try {
    return await lstat(targetPath);
  } catch (error) {
    if (error && error.code === 'ENOENT') return null;
    throw error;
  }
}

function backupPathFor(targetPath, now) {
  return `${targetPath}.harness-backup-${now()}`;
}

async function prepareProjectionTarget({ targetPath, ownedTargets, conflictMode, now = () => new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, '') }) {
  const stat = await pathExists(targetPath);
  if (!stat) {
    await mkdir(path.dirname(targetPath), { recursive: true });
    return { backupPath: undefined };
  }

  const resolvedTarget = path.resolve(targetPath);
  if (ownedTargets.has(resolvedTarget)) {
    await rm(targetPath, { recursive: true, force: true });
    await mkdir(path.dirname(targetPath), { recursive: true });
    return { backupPath: undefined };
  }

  if (conflictMode === 'backup') {
    const backupPath = backupPathFor(targetPath, now);
    await rename(targetPath, backupPath);
    await mkdir(path.dirname(targetPath), { recursive: true });
    return { backupPath };
  }

  throw new Error(`Refusing to overwrite non-Harness-owned path: ${targetPath}`);
}

export async function writeRenderedProjection(options) {
  const result = await prepareProjectionTarget(options);
  await writeFile(options.targetPath, options.content);
  return result;
}

export async function materializeDirectoryProjection(options) {
  const result = await prepareProjectionTarget(options);
  await cp(options.sourcePath, options.targetPath, { recursive: true });
  return result;
}

export async function linkDirectoryProjection(options) {
  const result = await prepareProjectionTarget(options);
  const type = process.platform === 'win32' ? 'junction' : 'dir';
  await symlink(options.sourcePath, options.targetPath, type);
  return result;
}
```

Keep the existing `writeRenderedFile`, `materializeFile`, and `linkPath` exports temporarily, but implement them by calling the new helpers with `ownedTargets: new Set([targetPath])` so old tests still pass.

- [ ] **Step 5: Run fs tests**

Run:

```bash
npm run test -- tests/installer/fs-ops.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add harness/installer/lib/projection-manifest.mjs harness/installer/lib/fs-ops.mjs tests/installer/fs-ops.test.mjs
git commit -m "feat: protect projection writes"
```

### Task 3: Skill Projection Planner

**Files:**
- Modify: `harness/installer/lib/skill-projection.mjs`
- Modify: `tests/adapters/skill-projection.test.mjs`

- [ ] **Step 1: Write failing planner tests**

Add to `tests/adapters/skill-projection.test.mjs`:

```js
test('planSkillProjections expands superpowers collection children', async () => {
  const plan = await planSkillProjections({
    rootDir: process.cwd(),
    homeDir: '/home/user',
    scope: 'workspace',
    target: 'codex'
  });

  const usingSuperpowers = plan.find((entry) => entry.skillName === 'using-superpowers');
  assert.ok(usingSuperpowers);
  assert.equal(usingSuperpowers.parentSkillName, 'superpowers');
  assert.equal(usingSuperpowers.strategy, 'link');
  assert.match(usingSuperpowers.sourcePath, /harness\/upstream\/superpowers\/skills\/using-superpowers$/);
  assert.match(usingSuperpowers.targetPath, /\.codex\/skills\/using-superpowers$/);
});

test('planSkillProjections materializes Copilot planning-with-files', async () => {
  const plan = await planSkillProjections({
    rootDir: process.cwd(),
    homeDir: '/home/user',
    scope: 'workspace',
    target: 'copilot'
  });

  const planning = plan.find((entry) => entry.skillName === 'planning-with-files');
  assert.equal(planning.strategy, 'materialize');
  assert.equal(planning.patch.type, 'copilot-planning-with-files');
  assert.match(planning.targetPath, /\.github\/skills\/planning-with-files$/);
});
```

- [ ] **Step 2: Run projection tests and verify failure**

Run:

```bash
npm run test -- tests/adapters/skill-projection.test.mjs
```

Expected: FAIL with missing export `planSkillProjections`.

- [ ] **Step 3: Implement planner**

Modify `harness/installer/lib/skill-projection.mjs`:

```js
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { resolveSkillTargetPaths } from './paths.mjs';

async function loadSkillIndex(rootDir) {
  return JSON.parse(await readFile(path.join(rootDir, 'harness/core/skills/index.json'), 'utf8'));
}

async function collectionChildNames(sourcePath) {
  const entries = await readdir(sourcePath, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function strategyFor(skill, target) {
  const strategy = skill.projection[target] || skill.projection.default;
  if (!strategies.has(strategy)) throw new Error(`Unsupported projection strategy: ${strategy}`);
  return strategy;
}

export async function planSkillProjections({ rootDir, homeDir, scope, target }) {
  const index = await loadSkillIndex(rootDir);
  const projections = [];

  for (const [parentSkillName, skill] of Object.entries(index.skills).sort(([left], [right]) => left.localeCompare(right))) {
    const sourceRoot = path.join(rootDir, skill.baselinePath);
    const strategy = strategyFor(skill, target);

    if (skill.layout === 'collection') {
      const childNames = await collectionChildNames(sourceRoot);
      const targetPaths = resolveSkillTargetPaths(rootDir, homeDir, scope, target, {
        layout: 'collection',
        childNames
      });

      for (const childName of childNames) {
        for (const targetPath of targetPaths.filter((candidate) => path.basename(candidate) === childName)) {
          projections.push({
            kind: 'skill',
            parentSkillName,
            skillName: childName,
            target,
            strategy,
            sourcePath: path.join(sourceRoot, childName),
            targetPath,
            patch: undefined
          });
        }
      }
      continue;
    }

    if (skill.layout === 'single') {
      for (const targetPath of resolveSkillTargetPaths(rootDir, homeDir, scope, target, skill)) {
        projections.push({
          kind: 'skill',
          parentSkillName,
          skillName: skill.targetName,
          target,
          strategy,
          sourcePath: sourceRoot,
          targetPath,
          patch: skill.patches ? skill.patches[target] : undefined
        });
      }
      continue;
    }

    throw new Error(`Unsupported skill layout: ${skill.layout}`);
  }

  return projections;
}
```

Keep `projectionForSkill` as a compatibility wrapper for existing callers.

- [ ] **Step 4: Run projection tests**

Run:

```bash
npm run test -- tests/adapters/skill-projection.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add harness/installer/lib/skill-projection.mjs tests/adapters/skill-projection.test.mjs
git commit -m "feat: plan skill filesystem projections"
```

### Task 4: Copilot Planning-With-Files Patch

**Files:**
- Create: `harness/installer/lib/copilot-planning-patch.mjs`
- Modify: `tests/adapters/skill-projection.test.mjs`

- [ ] **Step 1: Write failing patch test**

Add to `tests/adapters/skill-projection.test.mjs`:

```js
import { applyCopilotPlanningPatch } from '../../harness/installer/lib/copilot-planning-patch.mjs';

test('applyCopilotPlanningPatch materializes Copilot-specific skill content', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'harness-copilot-patch-'));
  try {
    const target = path.join(dir, 'planning-with-files');
    await materializeDirectoryProjection({
      sourcePath: path.join(process.cwd(), 'harness/upstream/planning-with-files'),
      targetPath: target,
      ownedTargets: new Set(),
      conflictMode: 'reject'
    });

    await applyCopilotPlanningPatch(target);
    const skill = await readFile(path.join(target, 'SKILL.md'), 'utf8');

    assert.match(skill, /Harness Copilot planning-with-files patch/);
    assert.doesNotMatch(skill, /\$\{CLAUDE_PLUGIN_ROOT\}/);
    assert.match(skill, /\.github\/skills\/planning-with-files/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run patch test and verify failure**

Run:

```bash
npm run test -- tests/adapters/skill-projection.test.mjs
```

Expected: FAIL with missing module `copilot-planning-patch.mjs`.

- [ ] **Step 3: Implement patch helper**

Create `harness/installer/lib/copilot-planning-patch.mjs`:

```js
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const MARKER = 'Harness Copilot planning-with-files patch';

function copilotSkillRootSnippet() {
  return [
    'COPILOT_PLANNING_WITH_FILES_ROOT="${GITHUB_COPILOT_SKILL_ROOT:-.github/skills/planning-with-files}"',
    'if [ ! -f "$COPILOT_PLANNING_WITH_FILES_ROOT/scripts/session-catchup.py" ] && [ -n "${HOME:-}" ]; then',
    '  COPILOT_PLANNING_WITH_FILES_ROOT="$HOME/.copilot/skills/planning-with-files"',
    'fi'
  ].join('\n');
}

export async function applyCopilotPlanningPatch(targetDir) {
  const skillPath = path.join(targetDir, 'SKILL.md');
  const original = await readFile(skillPath, 'utf8');
  const patched = original
    .replaceAll('${CLAUDE_PLUGIN_ROOT}', '$COPILOT_PLANNING_WITH_FILES_ROOT')
    .replace(
      '# Planning with Files',
      [
        `# ${MARKER}`,
        '',
        'This materialized copy is maintained by Harness for GitHub Copilot.',
        'It keeps task state under `planning/active/<task-id>/` and resolves helper scripts from the Copilot skill directory.',
        '',
        '```bash',
        copilotSkillRootSnippet(),
        '```',
        '',
        '# Planning with Files'
      ].join('\n')
    );

  await writeFile(skillPath, patched);
}

export { MARKER as COPILOT_PLANNING_PATCH_MARKER };
```

- [ ] **Step 4: Run patch tests**

Run:

```bash
npm run test -- tests/adapters/skill-projection.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add harness/installer/lib/copilot-planning-patch.mjs tests/adapters/skill-projection.test.mjs
git commit -m "feat: patch Copilot planning skill"
```

### Task 5: Sync Executes Skills Projection

**Files:**
- Modify: `harness/installer/commands/sync.mjs`
- Create: `tests/helpers/harness-fixture.mjs`
- Create: `tests/adapters/sync-skills.test.mjs`
- Modify: `tests/adapters/sync.test.mjs`

- [ ] **Step 1: Create test fixture helper**

Create `tests/helpers/harness-fixture.mjs`:

```js
import { cp, mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export async function createHarnessFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'harness-fixture-'));
  await mkdir(path.join(root, 'scripts'), { recursive: true });
  await cp(path.join(process.cwd(), 'harness'), path.join(root, 'harness'), { recursive: true });
  await cp(path.join(process.cwd(), 'scripts'), path.join(root, 'scripts'), { recursive: true });
  await cp(path.join(process.cwd(), 'package.json'), path.join(root, 'package.json'));
  return root;
}

export async function removeHarnessFixture(root) {
  await rm(root, { recursive: true, force: true });
}

export async function withCwd(dir, fn) {
  const previous = process.cwd();
  process.chdir(dir);
  try {
    return await fn();
  } finally {
    process.chdir(previous);
  }
}
```

- [ ] **Step 2: Write failing sync skills tests**

Create `tests/adapters/sync-skills.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lstat, readFile, readlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { sync } from '../../harness/installer/commands/sync.mjs';
import { writeState } from '../../harness/installer/lib/state.mjs';
import { createHarnessFixture, removeHarnessFixture, withCwd } from '../helpers/harness-fixture.mjs';

test('sync projects workspace entries and skills', async () => {
  const root = await createHarnessFixture();
  try {
    await writeState(root, {
      schemaVersion: 1,
      scope: 'workspace',
      projectionMode: 'link',
      targets: {
        codex: { enabled: true, paths: [path.join(root, 'AGENTS.md')] },
        copilot: { enabled: true, paths: [path.join(root, '.github/copilot-instructions.md')] }
      },
      upstream: {}
    });

    await withCwd(root, () => sync([]));

    assert.match(await readFile(path.join(root, 'AGENTS.md'), 'utf8'), /Harness Policy For Codex/);
    assert.equal((await lstat(path.join(root, '.codex/skills/using-superpowers'))).isSymbolicLink(), true);
    assert.match(await readlink(path.join(root, '.codex/skills/using-superpowers')), /harness\/upstream\/superpowers\/skills\/using-superpowers$/);

    const copilotPlanning = await readFile(path.join(root, '.github/skills/planning-with-files/SKILL.md'), 'utf8');
    assert.match(copilotPlanning, /Harness Copilot planning-with-files patch/);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('sync rejects non-owned skill target by default', async () => {
  const root = await createHarnessFixture();
  try {
    await writeState(root, {
      schemaVersion: 1,
      scope: 'workspace',
      projectionMode: 'link',
      targets: {
        copilot: { enabled: true, paths: [path.join(root, '.github/copilot-instructions.md')] }
      },
      upstream: {}
    });
    await writeFile(path.join(root, '.github/skills/planning-with-files'), 'user file');

    await assert.rejects(withCwd(root, () => sync([])), /Refusing to overwrite non-Harness-owned path/);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('sync backs up non-owned skill target when requested', async () => {
  const root = await createHarnessFixture();
  try {
    await writeState(root, {
      schemaVersion: 1,
      scope: 'workspace',
      projectionMode: 'link',
      targets: {
        copilot: { enabled: true, paths: [path.join(root, '.github/copilot-instructions.md')] }
      },
      upstream: {}
    });
    await writeFile(path.join(root, '.github/skills/planning-with-files'), 'user file');

    await withCwd(root, () => sync(['--conflict=backup']));

    const skill = await readFile(path.join(root, '.github/skills/planning-with-files/SKILL.md'), 'utf8');
    assert.match(skill, /Harness Copilot planning-with-files patch/);
  } finally {
    await removeHarnessFixture(root);
  }
});
```

- [ ] **Step 3: Run sync skills tests and verify failure**

Run:

```bash
npm run test -- tests/adapters/sync-skills.test.mjs
```

Expected: FAIL because `sync` still only writes entry files.

- [ ] **Step 4: Implement sync projection execution**

Modify `harness/installer/commands/sync.mjs`:

```js
import { writeProjectionManifest, readProjectionManifest, ownedTargetSet, upsertProjectionEntry } from '../lib/projection-manifest.mjs';
import { linkDirectoryProjection, materializeDirectoryProjection, writeRenderedProjection } from '../lib/fs-ops.mjs';
import { planSkillProjections } from '../lib/skill-projection.mjs';
import { applyCopilotPlanningPatch } from '../lib/copilot-planning-patch.mjs';

function readOption(args, name, fallback) {
  const prefix = `--${name}=`;
  const value = args.find((arg) => arg.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

async function applySkillProjection(projection, ownedTargets, conflictMode) {
  if (projection.strategy === 'link') {
    await linkDirectoryProjection({
      sourcePath: projection.sourcePath,
      targetPath: projection.targetPath,
      ownedTargets,
      conflictMode
    });
  } else if (projection.strategy === 'materialize') {
    await materializeDirectoryProjection({
      sourcePath: projection.sourcePath,
      targetPath: projection.targetPath,
      ownedTargets,
      conflictMode
    });
    if (projection.patch?.type === 'copilot-planning-with-files') {
      await applyCopilotPlanningPatch(projection.targetPath);
    }
  } else {
    throw new Error(`Unsupported projection strategy: ${projection.strategy}`);
  }
}
```

Then update `sync(args = [])` to:

```js
export async function sync(args = []) {
  const rootDir = process.cwd();
  const homeDir = os.homedir();
  const state = await readState(rootDir);
  const conflictMode = readOption(args, 'conflict', 'reject');
  if (!['reject', 'backup'].includes(conflictMode)) {
    throw new Error(`Invalid conflict mode: ${conflictMode}`);
  }

  let manifest = await readProjectionManifest(rootDir);
  const ownedTargets = ownedTargetSet(manifest);
  const targets = Object.keys(state.targets).filter((target) => state.targets[target].enabled);

  for (const target of targets) {
    const adapter = await loadAdapter(rootDir, target);
    const content = await renderEntry(rootDir, target);
    const entries = entriesForScope(rootDir, homeDir, adapter, state.scope);

    for (const entry of entries) {
      await writeRenderedProjection({ targetPath: entry, content, ownedTargets, conflictMode });
      manifest = upsertProjectionEntry(manifest, {
        kind: 'entry',
        target,
        strategy: 'render',
        sourcePath: adapter.template,
        targetPath: entry
      });
      ownedTargets.add(path.resolve(entry));
    }

    for (const projection of await planSkillProjections({ rootDir, homeDir, scope: state.scope, target })) {
      await applySkillProjection(projection, ownedTargets, conflictMode);
      manifest = upsertProjectionEntry(manifest, projection);
      ownedTargets.add(path.resolve(projection.targetPath));
    }
  }

  await writeProjectionManifest(rootDir, manifest);
  console.log(`Synced ${targets.length} target(s): ${targets.join(', ')}`);
}
```

- [ ] **Step 5: Run sync tests**

Run:

```bash
npm run test -- tests/adapters/sync.test.mjs tests/adapters/sync-skills.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add harness/installer/commands/sync.mjs tests/helpers/harness-fixture.mjs tests/adapters/sync.test.mjs tests/adapters/sync-skills.test.mjs
git commit -m "feat: sync skills into IDE directories"
```

### Task 6: Doctor And Status Health Summary

**Files:**
- Create: `harness/installer/lib/health.mjs`
- Modify: `harness/installer/commands/doctor.mjs`
- Modify: `harness/installer/commands/status.mjs`
- Create: `tests/installer/health.test.mjs`

- [ ] **Step 1: Write failing health tests**

Create `tests/installer/health.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readHarnessHealth } from '../../harness/installer/lib/health.mjs';
import { sync } from '../../harness/installer/commands/sync.mjs';
import { writeState } from '../../harness/installer/lib/state.mjs';
import { createHarnessFixture, removeHarnessFixture, withCwd } from '../helpers/harness-fixture.mjs';

test('readHarnessHealth reports entry and skill status per target', async () => {
  const root = await createHarnessFixture();
  try {
    await writeState(root, {
      schemaVersion: 1,
      scope: 'workspace',
      projectionMode: 'link',
      targets: {
        codex: { enabled: true, paths: [path.join(root, 'AGENTS.md')] },
        copilot: { enabled: true, paths: [path.join(root, '.github/copilot-instructions.md')] }
      },
      upstream: {}
    });

    await withCwd(root, () => sync([]));
    const health = await readHarnessHealth(root, '/home/user');

    assert.equal(health.targets.codex.entries[0].status, 'ok');
    assert.equal(health.targets.codex.skills.find((skill) => skill.skillName === 'using-superpowers').status, 'ok');
    assert.equal(health.targets.copilot.skills.find((skill) => skill.skillName === 'planning-with-files').status, 'ok');
    assert.equal(health.problems.length, 0);
  } finally {
    await removeHarnessFixture(root);
  }
});
```

- [ ] **Step 2: Run health tests and verify failure**

Run:

```bash
npm run test -- tests/installer/health.test.mjs
```

Expected: FAIL with missing module `health.mjs`.

- [ ] **Step 3: Implement health summary**

Create `harness/installer/lib/health.mjs`:

```js
import { access, lstat, readFile, readlink } from 'node:fs/promises';
import path from 'node:path';
import { entriesForScope, loadAdapter } from './adapters.mjs';
import { planSkillProjections } from './skill-projection.mjs';
import { readState } from './state.mjs';
import { COPILOT_PLANNING_PATCH_MARKER } from './copilot-planning-patch.mjs';

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function inspectSkill(projection) {
  if (!(await exists(projection.targetPath))) {
    return { ...projection, status: 'missing', message: 'Skill projection is missing.' };
  }

  if (projection.strategy === 'link') {
    const stat = await lstat(projection.targetPath);
    if (!stat.isSymbolicLink()) {
      return { ...projection, status: 'problem', message: 'Expected a symlink.' };
    }
    const linkTarget = await readlink(projection.targetPath);
    if (path.resolve(path.dirname(projection.targetPath), linkTarget) !== path.resolve(projection.sourcePath)) {
      return { ...projection, status: 'problem', message: 'Symlink points to the wrong source.' };
    }
    return { ...projection, status: 'ok' };
  }

  if (projection.patch?.type === 'copilot-planning-with-files') {
    const text = await readFile(path.join(projection.targetPath, 'SKILL.md'), 'utf8').catch(() => '');
    if (!text.includes(COPILOT_PLANNING_PATCH_MARKER)) {
      return { ...projection, status: 'problem', message: 'Copilot materialized copy is missing the Harness patch marker.' };
    }
  }

  return { ...projection, status: 'ok' };
}

export async function readHarnessHealth(rootDir, homeDir) {
  const state = await readState(rootDir);
  const targets = {};
  const problems = [];

  for (const target of Object.keys(state.targets).filter((name) => state.targets[name].enabled)) {
    const adapter = await loadAdapter(rootDir, target);
    const entries = entriesForScope(rootDir, homeDir, adapter, state.scope).map((entryPath) => ({
      path: entryPath,
      status: state.targets[target].paths.includes(entryPath) ? 'ok' : 'missing'
    }));
    for (const entry of entries) {
      if (!(await exists(entry.path))) entry.status = 'missing';
      if (entry.status !== 'ok') problems.push(`${target}: missing entry ${entry.path}`);
    }

    const skills = [];
    for (const projection of await planSkillProjections({ rootDir, homeDir, scope: state.scope, target })) {
      const inspected = await inspectSkill(projection);
      skills.push(inspected);
      if (inspected.status !== 'ok') {
        problems.push(`${target}: ${inspected.skillName}: ${inspected.message}`);
      }
    }

    targets[target] = { entries, skills };
  }

  return { scope: state.scope, projectionMode: state.projectionMode, targets, problems };
}
```

- [ ] **Step 4: Update doctor command**

Modify `harness/installer/commands/doctor.mjs` to call `readHarnessHealth(process.cwd(), os.homedir())` and fail when `health.problems.length > 0`. Preserve the personal path check for entry file contents by running it over `Object.values(health.targets).flatMap((target) => target.entries)`.

- [ ] **Step 5: Update status command**

Modify `harness/installer/commands/status.mjs`:

```js
import os from 'node:os';
import { readHarnessHealth } from '../lib/health.mjs';

export async function status() {
  const health = await readHarnessHealth(process.cwd(), os.homedir());
  console.log(JSON.stringify(health, null, 2));
}
```

- [ ] **Step 6: Run health tests**

Run:

```bash
npm run test -- tests/installer/health.test.mjs
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add harness/installer/lib/health.mjs harness/installer/commands/doctor.mjs harness/installer/commands/status.mjs tests/installer/health.test.mjs
git commit -m "feat: report entry and skill health"
```

### Task 7: Update-To-Sync Refresh Coverage

**Files:**
- Modify: `tests/adapters/sync-skills.test.mjs`
- Modify: `tests/installer/upstream-commands.test.mjs`

- [ ] **Step 1: Add failing refresh test**

Add to `tests/adapters/sync-skills.test.mjs`:

```js
test('sync refreshes materialized Copilot skill after upstream changes', async () => {
  const root = await createHarnessFixture();
  try {
    await writeState(root, {
      schemaVersion: 1,
      scope: 'workspace',
      projectionMode: 'link',
      targets: {
        copilot: { enabled: true, paths: [path.join(root, '.github/copilot-instructions.md')] }
      },
      upstream: {}
    });

    await withCwd(root, () => sync([]));
    await writeFile(
      path.join(root, 'harness/upstream/planning-with-files/UPSTREAM_REFRESH_MARKER.md'),
      'refreshed baseline'
    );
    await withCwd(root, () => sync([]));

    assert.equal(
      await readFile(path.join(root, '.github/skills/planning-with-files/UPSTREAM_REFRESH_MARKER.md'), 'utf8'),
      'refreshed baseline'
    );
  } finally {
    await removeHarnessFixture(root);
  }
});
```

- [ ] **Step 2: Run refresh test and verify behavior**

Run:

```bash
npm run test -- tests/adapters/sync-skills.test.mjs
```

Expected: PASS after Task 5 because `.harness/projections.json` marks the materialized skill as Harness-owned. If it fails with overwrite refusal, update manifest recording in `sync` before continuing.

- [ ] **Step 3: Strengthen upstream command test**

Add to `tests/installer/upstream-commands.test.mjs` after `updateCommand applies candidate only to harness upstream path`:

```js
test('updateCommand leaves IDE projections to later sync', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'harness-update-sync-boundary-'));
  const source = await mkdtemp(path.join(os.tmpdir(), 'harness-local-source-'));
  try {
    await writeSources(root, source);
    await mkdir(path.join(root, 'harness/upstream/planning-with-files'), { recursive: true });
    await mkdir(path.join(root, '.github/skills/planning-with-files'), { recursive: true });
    await writeFile(path.join(root, '.github/skills/planning-with-files/SKILL.md'), 'old projected skill');
    await createGitSource(source, 'new upstream skill');

    await withCwd(root, async () => {
      await fetchCommand(['--source=planning-with-files']);
      await updateCommand(['--source=planning-with-files']);
    });

    assert.equal(await readFile(path.join(root, 'harness/upstream/planning-with-files/SKILL.md'), 'utf8'), 'new upstream skill');
    assert.equal(await readFile(path.join(root, '.github/skills/planning-with-files/SKILL.md'), 'utf8'), 'old projected skill');
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(source, { recursive: true, force: true });
  }
});
```

- [ ] **Step 4: Run upstream tests**

Run:

```bash
npm run test -- tests/installer/upstream-commands.test.mjs tests/adapters/sync-skills.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/adapters/sync-skills.test.mjs tests/installer/upstream-commands.test.mjs
git commit -m "test: cover upstream refresh projection flow"
```

### Task 8: Documentation

**Files:**
- Modify: `README.md`
- Modify: `docs/architecture.md`
- Modify: `docs/compatibility/copilot-planning-with-files.md`
- Modify: `docs/install/codex.md`
- Modify: `docs/install/copilot.md`
- Modify: `docs/install/cursor.md`
- Modify: `docs/install/claude-code.md`

- [ ] **Step 1: Update README implementation note**

Replace the old README sentence:

```md
Current implementation note: `sync` renders instruction entry files as real files. Skill projection strategies are modeled and tested, but skill filesystem projection is not wired into `sync` yet. There is no hard-link implementation; the filesystem helpers support real files and symlinks.
```

with:

```md
Current implementation note: `sync` renders entry files and projects supported skills into each enabled IDE's configured skill directory. Link projections use symlinks; materialized projections create real directory copies. Existing non-Harness-owned files are never overwritten by default. Use `./scripts/harness sync --conflict=backup` when you explicitly want Harness to preserve a local backup and write the projection.
```

- [ ] **Step 2: Add skills path table to README**

Add below the Skill projection metadata table:

```md
Skill target roots:

| Target | Workspace skill root | User-global skill root |
| --- | --- | --- |
| Codex | `.codex/skills` | `~/.codex/skills` |
| GitHub Copilot | `.github/skills` | `~/.copilot/skills` |
| Cursor | `.cursor/skills` | `~/.cursor/skills` |
| Claude Code | `.claude/skills` | `~/.claude/skills` |
```

- [ ] **Step 3: Update Copilot compatibility doc**

Ensure `docs/compatibility/copilot-planning-with-files.md` includes:

```md
Harness materializes Copilot's `planning-with-files` copy instead of linking it. During `sync`, Harness copies `harness/upstream/planning-with-files` into the Copilot skill root and applies the `Harness Copilot planning-with-files patch` marker. `doctor` checks for that marker so a stale or manually edited copy is visible.
```

- [ ] **Step 4: Update install docs**

In each `docs/install/*.md`, add the target-specific skill root and sync command:

```md
Run:

```bash
./scripts/harness install --targets=<target> --scope=workspace
./scripts/harness sync
```

By default, `sync` refuses to overwrite non-Harness-owned files. To preserve a backup and continue:

```bash
./scripts/harness sync --conflict=backup
```
```

Use the actual `<target>` value in each file: `codex`, `copilot`, `cursor`, `claude-code`.

- [ ] **Step 5: Run docs scan**

Run:

```bash
rg -n "not wired into `sync` yet|Skill projection strategies are modeled" README.md docs
```

Expected: no matches.

- [ ] **Step 6: Commit**

```bash
git add README.md docs/architecture.md docs/compatibility/copilot-planning-with-files.md docs/install/codex.md docs/install/copilot.md docs/install/cursor.md docs/install/claude-code.md
git commit -m "docs: describe skills projection lifecycle"
```

### Task 9: Full Verification

**Files:**
- No source edits unless verification exposes a defect.

- [ ] **Step 1: Run full test suite**

Run:

```bash
npm run verify
```

Expected: PASS.

- [ ] **Step 2: Run projection smoke test in a temporary root**

Run:

```bash
tmpdir="$(mktemp -d)"
cp -R harness scripts package.json "$tmpdir/"
(
  cd "$tmpdir"
  ./scripts/harness install --targets=codex,copilot,cursor,claude-code --scope=workspace
  ./scripts/harness sync
  ./scripts/harness doctor --check-only
  ./scripts/harness status
  test -f AGENTS.md
  test -f .github/copilot-instructions.md
  test -f .cursor/rules/harness.mdc
  test -f CLAUDE.md
  test -L .codex/skills/using-superpowers
  test -f .github/skills/planning-with-files/SKILL.md
  grep -q "Harness Copilot planning-with-files patch" .github/skills/planning-with-files/SKILL.md
)
rm -rf "$tmpdir"
```

Expected: all commands exit 0.

- [ ] **Step 3: Run conflict smoke test**

Run:

```bash
tmpdir="$(mktemp -d)"
cp -R harness scripts package.json "$tmpdir/"
(
  cd "$tmpdir"
  mkdir -p .github/skills
  printf 'user content' > .github/skills/planning-with-files
  ./scripts/harness install --targets=copilot --scope=workspace
  ! ./scripts/harness sync
  ./scripts/harness sync --conflict=backup
  test -f .github/skills/planning-with-files/SKILL.md
  find .github/skills -name 'planning-with-files.harness-backup-*' | grep planning-with-files
)
rm -rf "$tmpdir"
```

Expected: default sync fails, backup sync succeeds.

- [ ] **Step 4: Run whitespace check**

Run:

```bash
git diff --check
```

Expected: no output.

- [ ] **Step 5: Commit verification fixes if needed**

If Task 9 exposed defects, fix the defective source or test file, rerun the failed command, then commit:

```bash
git add <fixed-files>
git commit -m "fix: stabilize skills projection verification"
```

## Self-Review

- Spec coverage:
  - `sync` skills projection: Task 5.
  - `doctor` skills checks: Task 6.
  - `status` entry + skills visibility: Task 6.
  - `update` followed by sync using updated baseline: Task 7.
  - Copilot planning-with-files patch/materialize: Task 4 and Task 5.
  - Existing file conflicts: Task 2 and Task 5.
- Placeholder scan:
  - No `TBD`, no unspecified edge handling, no empty “write tests” steps.
- Type consistency:
  - `layout`, `targetName`, `strategy`, `patch.type`, `targetPath`, and `sourcePath` are used consistently across metadata, planner, sync, health, and tests.
