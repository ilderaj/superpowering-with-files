# Backup Conflict Governance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Active task path:** `planning/active/backup-skills-duplicate-analysis/`
> **Lifecycle state:** closed
> **Sync-back status:** closed on `2026-04-26T14:13:51Z`; Task 1-5 finished, full repo verification passed, the branch was merged into local `dev`, and the execution worktree was cleaned up.

**Goal:** 修复当前 user-global `*.harness-backup-*` 重复残留，并把后续 `sync --conflict=backup` 从“目标目录旁边生成 sibling 备份”改成“保留冲突备份但不再制造 live-root 重复”。

**Architecture:** 保持 `sync --conflict=backup` 的语义，但把备份落点从目标路径旁边迁移到 home-scoped 的集中归档区，并用 index 记录原路径、时间戳、内容摘要与归档位置。`sync` 在写 projection 前先归档非 Harness-owned 冲突目标；在正常同步时顺带扫描并归并历史 sibling `*.harness-backup-*`，把当前重复问题一起收口。`doctor` / `adoption-status` 继续复用 health 管线，负责暴露未收敛的 legacy backups 或 archive/index 异常。

**Tech Stack:** Node.js, `fs/promises`, existing installer sync/adoption/health test suites, repo-local `.harness/*` state plus home-scoped backup archive metadata.

---

## Confirmed Problem Statement

- `harness/installer/lib/fs-ops.mjs` 当前直接把冲突目标重命名为 `<target>.harness-backup-<timestamp>`，时间戳来自 `new Date().toISOString()`，因此后缀是 UTC 时间，不是本地时区。
- 本机现有重复来自一次显式的 `./scripts/harness sync --conflict=backup`。`planning/active/git-execution-authorization-analysis/progress.md` 已记录命令顺序是先 `sync --conflict=backup`，后 `adopt-global`；`.harness/adoption/global.json` 的 `appliedAt` 为 `2026-04-26T05:14:45.776Z`，晚于现存备份后缀 `20260426T044458`，可确认备份先于 adoption。
- 受影响内容不止 skills。当前可见的 live-root sibling backups 包括：
  - `~/.agents/skills/*`
  - `~/.claude/skills/*`
  - `~/.cursor/skills/*`
  - `~/.claude/CLAUDE.md.harness-backup-*`
  - `~/.copilot/instructions/harness.instructions.md.harness-backup-*`
- 当前没有发现 `.codex/**` 的同类备份，也没有发现 hooks 脚本或 hooks 配置的同类备份；这与实现一致，因为 hooks 配置走 merge 路径，只有 malformed JSON 等异常路径才会退化到 backup overwrite。

## Target Outcomes

1. `sync --conflict=backup` 仍然保留冲突前内容，但不再在技能根或入口文件旁边留下 `.harness-backup-*` siblings。
2. 现有 legacy sibling backups 在一次正常 sync 中被归档和去重，不需要额外手工删除。
3. 同一目标、同一内容不会被重复归档；只有内容变化时才生成新的备份记录。
4. `doctor --check-only` / `adoption-status` 能说明是否还存在 legacy backups、archive/index 漂移或待清理状态。
5. 文档把 `--conflict=backup` 明确描述为“归档冲突内容并接管”，而不是“在原目录旁边留下一个重复副本”。

### Task 1: Pin Backup Governance Contracts

**Files:**
- Modify: `tests/installer/fs-ops.test.mjs`
- Modify: `tests/adapters/sync-skills.test.mjs`
- Modify: `tests/installer/adoption.test.mjs`
- Modify: `tests/installer/health.test.mjs`

- [ ] **Step 1: Add a failing fs-ops contract for archived backups instead of sibling renames**

```js
test('writeRenderedProjection archives non-owned existing file when requested', async () => {
  const archiveEvents = [];

  const result = await writeRenderedProjection({
    targetPath: target,
    content: 'generated',
    ownedTargets: new Set(),
    conflictMode: 'backup',
    backupHandler: async (details) => {
      archiveEvents.push(details);
      await rm(details.targetPath, { force: true, recursive: true });
      return { backupPath: '/tmp/archive/AGENTS.md' };
    }
  });

  assert.equal(result.backupPath, '/tmp/archive/AGENTS.md');
  assert.equal(archiveEvents).length, 1;
  await assert.rejects(readFile(`${target}.harness-backup-20260413T010203`, 'utf8'), /ENOENT/);
});
```

- [ ] **Step 2: Add a failing sync regression for legacy sibling backup normalization**

```js
test('sync normalizes legacy sibling backups under managed skill roots', async () => {
  await mkdir(path.join(homeDir, '.claude/skills'), { recursive: true });
  await mkdir(path.join(homeDir, '.claude/skills/using-superpowers.harness-backup-20260426T044458'));

  await withCwd(root, () => sync([]));

  await assert.rejects(
    lstat(path.join(homeDir, '.claude/skills/using-superpowers.harness-backup-20260426T044458')),
    /ENOENT/
  );
  const index = JSON.parse(await readFile(path.join(homeDir, '.harness/backup-index.json'), 'utf8'));
  assert.equal(index.entries.some((entry) => entry.originalPath.endsWith('using-superpowers')), true);
});
```

- [ ] **Step 3: Add a failing adoption regression to keep the current operator flow green**

```js
test('adopt-global remains in_sync after backup-based takeover without leaving sibling backups', async () => {
  await writeFile(path.join(homeDir, '.copilot/instructions/harness.instructions.md'), 'legacy');
  await harnessCommand(root, homeDir, 'sync', '--conflict=backup');
  await harnessCommand(root, homeDir, 'adopt-global');

  await assert.rejects(
    readFile(path.join(homeDir, '.copilot/instructions/harness.instructions.md.harness-backup-20260426T044458'), 'utf8'),
    /ENOENT/
  );
});
```

- [ ] **Step 4: Add a failing health regression for unnormalized legacy backups**

```js
assert.match(
  problems.join('\n'),
  /Legacy Harness sibling backups detected under user-global roots/
);
```

- [ ] **Step 5: Run the focused tests to verify they fail for the expected reason**

Run: `npm test -- tests/installer/fs-ops.test.mjs tests/adapters/sync-skills.test.mjs tests/installer/adoption.test.mjs tests/installer/health.test.mjs`
Expected: FAIL on archive-store / legacy-normalization assertions because current implementation still writes sibling backups.

### Task 2: Introduce a Home-Scoped Backup Archive Service

**Files:**
- Create: `harness/installer/lib/backup-archive.mjs`
- Modify: `harness/installer/lib/fs-ops.mjs`

- [ ] **Step 1: Create backup archive helpers and index schema**

```js
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';

export function backupArchiveRoot(homeDir = os.homedir()) {
  return path.join(homeDir, '.harness/backups');
}

export function backupIndexPath(homeDir = os.homedir()) {
  return path.join(homeDir, '.harness/backup-index.json');
}

export async function archiveConflictTarget({ homeDir, targetPath, now, source }) {
  return {
    backupPath: path.join(backupArchiveRoot(homeDir), now(), source, encodeTargetPath(targetPath)),
    digest: await digestTarget(targetPath)
  };
}
```

- [ ] **Step 2: Encode archive metadata so repeated identical conflicts dedupe cleanly**

```json
{
  "schemaVersion": 1,
  "entries": [
    {
      "originalPath": "$HOME/.claude/skills/using-superpowers",
      "archivedAt": "2026-04-26T04:44:58.000Z",
      "digest": "sha256:...",
      "archivePath": "$HOME/.harness/backups/20260426T044458Z/claude-code/using-superpowers",
      "reason": "non-harness-owned-conflict"
    }
  ]
}
```

- [ ] **Step 3: Refactor fs-ops to delegate backup handling instead of always generating sibling paths**

```js
async function prepareProjectionTarget({ targetPath, ownedTargets, conflictMode, backupHandler, now = defaultTimestamp }) {
  const stat = await pathStat(targetPath);
  if (!stat) return { backupPath: undefined };

  const resolvedTarget = path.resolve(targetPath);
  if (ownedTargets.has(resolvedTarget)) {
    await rm(targetPath, { recursive: true, force: true });
    await mkdir(path.dirname(targetPath), { recursive: true });
    return { backupPath: undefined };
  }

  if (conflictMode === 'backup') {
    if (!backupHandler) throw new Error('backupHandler is required when conflictMode=backup');
    const result = await backupHandler({ targetPath, now, stat });
    await mkdir(path.dirname(targetPath), { recursive: true });
    return result;
  }

  throw new Error(`Refusing to overwrite non-Harness-owned path: ${targetPath}`);
}
```

- [ ] **Step 4: Run the focused fs-ops test slice**

Run: `npm test -- tests/installer/fs-ops.test.mjs`
Expected: PASS for the new archive-backed behavior.

### Task 3: Route Sync Through the Archive Service and Normalize Legacy Sibling Backups

**Files:**
- Modify: `harness/installer/commands/sync.mjs`
- Modify: `harness/installer/lib/projection-manifest.mjs`
- Modify: `harness/installer/lib/backup-archive.mjs`

- [ ] **Step 1: Build a backup manager in sync that knows planned target roots and home-scoped archive paths**

```js
const backupManager = await createBackupArchiveManager({
  rootDir,
  homeDir,
  state,
  manifest: currentManifest,
  plan
});
```

- [ ] **Step 2: Normalize legacy sibling backups before projection writes**

```js
const normalization = await backupManager.normalizeLegacyBackups();
for (const warning of normalization.warnings) {
  console.warn(warning);
}
```

- [ ] **Step 3: Route all conflict backups through the archive manager**

```js
await writeRenderedProjection({
  targetPath: entry.targetPath,
  content: entry.content,
  ownedTargets,
  conflictMode,
  backupHandler: backupManager.backupHandler
});
```

- [ ] **Step 4: Keep duplicate prevention content-aware rather than timestamp-only**

```js
if (latestEntry && latestEntry.originalPath === targetPath && latestEntry.digest === digest) {
  await rm(targetPath, { recursive: true, force: true });
  return { backupPath: latestEntry.archivePath, deduped: true };
}
```

- [ ] **Step 5: Run the sync/adoption focused slice**

Run: `npm test -- tests/adapters/sync-skills.test.mjs tests/installer/adoption.test.mjs`
Expected: PASS; sync archives conflicts without leaving sibling duplicates, and adoption still reaches `in_sync`.

### Task 4: Surface Backup Governance in Health and Adoption Status

**Files:**
- Modify: `harness/installer/lib/health.mjs`
- Modify: `harness/installer/lib/adoption.mjs`
- Modify: `tests/installer/health.test.mjs`
- Modify: `tests/installer/adoption.test.mjs`

- [ ] **Step 1: Teach health to inspect managed roots for legacy sibling backups and archive/index drift**

```js
if (legacyBackups.length > 0) {
  problems.push(
    `Legacy Harness sibling backups detected under user-global roots: ${legacyBackups.join(', ')}`
  );
}
```

- [ ] **Step 2: Keep adoption-status piggybacking on health instead of inventing a second audit path**

```js
const health = await readHarnessHealth(rootDir, homeDir);
if (health.problems.length > 0) {
  status = 'apply_failed';
  reasons.push(...health.problems);
}
```

- [ ] **Step 3: Ensure the post-fix happy path stays clean**

```js
assert.equal(status.status, 'in_sync');
assert.equal(status.reasons.some((reason) => /Legacy Harness sibling backups/.test(reason)), false);
```

- [ ] **Step 4: Run the focused health/adoption slice**

Run: `npm test -- tests/installer/health.test.mjs tests/installer/adoption.test.mjs`
Expected: PASS; health reports legacy backup drift only when it still exists, otherwise stays green.

### Task 5: Update Operator Documentation and Verification Guidance

**Files:**
- Modify: `README.md`
- Modify: `docs/install/codex.md`
- Modify: `docs/install/claude-code.md`
- Modify: `docs/install/copilot.md`
- Modify: `docs/install/cursor.md`
- Modify: `docs/maintenance.md`

- [ ] **Step 1: Update install docs so `sync --conflict=backup` describes archive-based takeover**

```md
By default, `sync` refuses to overwrite non-Harness-owned files. To preserve a backup and continue, run:

```bash
./scripts/harness sync --conflict=backup
```

Harness archives the pre-existing content into `~/.harness/backups/` and records it in `~/.harness/backup-index.json`; it no longer leaves `.harness-backup-*` siblings in the live skill or entry roots.
```

- [ ] **Step 2: Document legacy backup normalization for operators reviewing current duplicates**

```md
If older `.harness-backup-*` siblings already exist from a previous takeover, the next successful `sync` imports them into the archive store and removes the live duplicates before projecting the new baseline.
```

- [ ] **Step 3: Keep maintenance verification explicit**

```bash
export HOME=/path/to/disposable-home
./scripts/harness install --scope=user-global --targets=all --hooks=on
./scripts/harness sync --conflict=backup
./scripts/harness doctor --check-only
./scripts/harness adoption-status
```

- [ ] **Step 4: Run the full repository verification**

Run: `npm run verify`
Expected: PASS; all installer, adoption, and docs checks are green.

## Final Verification Checklist

- [ ] No new `*.harness-backup-*` siblings are created under `~/.agents`, `~/.claude`, `~/.cursor`, `~/.copilot`, or `~/.codex` during `sync --conflict=backup`.
- [ ] Existing sibling backups are archived and removed on the first post-fix sync.
- [ ] `~/.harness/backup-index.json` records archived entries with stable metadata and content digests.
- [ ] `adopt-global` remains green after the backup-based takeover flow.
- [ ] `doctor --check-only` cleanly distinguishes healthy archive state from legacy duplicate drift.

## Notes For Review

- This plan intentionally does **not** delete historical content outright. It converts live-root duplicates into a governed archive so rollback evidence remains available.
- This plan intentionally keeps `--conflict=backup` as an explicit operator action. The optimization is where the backup goes and how repeated content is deduped, not silently overwriting non-owned targets.
- Companion to `planning/active/backup-skills-duplicate-analysis/`; durable status, findings, and execution state remain there.
