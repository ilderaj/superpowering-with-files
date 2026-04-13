# 任务计划：Cross-IDE Projection 全面审计

## Goal

全面审计 HarnessTemplate 的 installation structure、entry files、skills/hooks 投影，以及 upstream/updates 相关实现；对照 Codex、GitHub Copilot、Cursor、Claude Code 官方文档确认路径、命名、分类与链接格式是否正确，并先产出优化 Plans，不直接执行实现更新。

## Current State
Status: active
Archive Eligible: no
Close Reason:

## Current Phase

Complete; awaiting integration decision

## Phases

### Phase 1: 范围恢复与既有任务复核
- [x] 读取用户要求和项目 AGENTS policy
- [x] 使用 `using-superpowers`、`planning-with-files`、`writing-plans`
- [x] 扫描相关 active planning 任务
- [x] 提取旧任务中与 Copilot entry、skills、hooks 有关的事实
- **Status:** complete

### Phase 2: 项目结构与实现审计
- [x] 审计 installation structure
- [x] 审计 entry files 路径解析、adapter manifests、模板和文档
- [x] 审计 skills projection metadata、path resolver、sync/doctor/status 行为
- [x] 审计 hooks projection metadata、assets、merge 和 opt-in 行为
- [x] 审计 upstream、updates、candidate baseline 相关实现
- **Status:** complete

### Phase 3: 官方文档对照
- [x] 查阅 Codex 官方文档，确认 workspace/user-global entry 和 skills 约定
- [x] 查阅 GitHub Copilot 官方文档，重点确认 workspace entry 和 user-global entry 的路径头差异
- [x] 查阅 Cursor 官方文档，确认 rules、project/user rules、hooks 和 skill/extension 可用路径
- [x] 查阅 Claude Code 官方文档，确认 CLAUDE.md、skills、hooks、settings 路径
- **Status:** complete

### Phase 4: 差异判断与风险分级
- [x] 对照实现与官方文档，列出正确项、不确定项、错误项
- [x] 判断是否需要优化更新
- [x] 为需要更新的内容设计 Plans
- **Status:** complete

### Phase 5: 交付 Plans
- [x] 只输出审计结论和 Plans
- [x] 不执行实现修改
- [x] 在 findings/progress 中同步 durable decisions
- **Status:** complete

### Phase 6: Subagent-driven 执行
- [x] 创建隔离 worktree 并记录 base
- [x] Task 1：修正 Cursor user-global entry 投影
- [x] Task 2：修正 Claude Code hooks settings JSON merge
- [x] Task 3：加强 hook health 内容验证
- [x] Task 4：补强 sync/fetch/update/status 状态
- [x] Task 5：同步 README 和安装/兼容性/架构文档
- [x] Task 6：全量验证和最终 code review
- **Status:** complete

## Key Questions

1. 当前四个平台 workspace 与 user-global entry path 是否与官方文档一致？
2. Copilot workspace entry 与 user-global entry 是否使用了正确且不同的路径头？
3. Skills 的投影根目录是否有官方依据，还是 Harness 自定义约定？
4. Hooks 的投影路径和事件命名是否有官方依据，还是 adapter-specific 自定义层？
5. Upstream/update/sync 的职责边界是否清晰且与文档一致？

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| 本轮只做审计和 Plans，不修改实现 | 用户明确要求“不要直接执行” |
| 使用新的 `planning/active/cross-ide-projection-audit/` | 避免覆盖既有 active 任务，同时保留审计上下文 |
| 官方文档结论必须和本地实现逐项对照 | 用户要求确认路径、映射、投影和分类是否正确 |
| 需要优化更新 | Claude Code hooks 路径与官方 settings 模型不一致；Cursor user-global entry 没有官方文件系统入口依据；hook merge/health/upstream 状态存在质量缺口 |
| 暂不判定 Codex skills/hooks 错误 | 官方 Codex developer 子页直接抓取被 403，本轮只能确认 `~/.codex/config.toml`/notify hook，不能把 `.codex/skills` 当作官方已证实事实 |
| 用户随后要求执行 Plans | 使用 `subagent-driven-development` 在隔离 worktree 中完成实现；原“只出 Plans”边界被后续用户请求覆盖 |
| worktree 分支待集成 | 实现位于 `/Users/jared/.config/superpowers/worktrees/HarnessTemplate/codex-cross-ide-projection-fix` 的 `codex/cross-ide-projection-fix` 分支，尚未提交 |

## Proposed Plans

### Plan A: 修正官方明确不一致的路径
- 将 Claude Code hooks 从 `.claude/hooks.json`、`~/.claude/hooks.json` 改为 settings JSON 内的 `hooks` 配置：
  - workspace: `.claude/settings.json`
  - user-global: `~/.claude/settings.json`
  - hook scripts 继续放在 `.claude/hooks/*` 与 `~/.claude/hooks/*`
- 将 Cursor user-global entry 从自动投影文件降级为 manual/settings instruction：
  - workspace entry 继续使用 `.cursor/rules/harness.mdc`
  - user-global 不再声明 `~/.cursor/rules/harness.mdc` 为自动 entry
  - user-global skills 继续保留 `~/.cursor/skills`
- 为 Copilot workspace/user-global 保持当前路径：
  - workspace: `.github/copilot-instructions.md`
  - user-global: `~/.copilot/instructions/harness.instructions.md`

### Plan B: 加强投影引擎和健康检查
- 给 hook projection 增加 per-platform `configTarget` 能力，避免把所有非 Copilot 平台都映射到 `hooks.json`。
- 将 Claude settings JSON merge 作为一等配置类型处理，保留用户已有 settings 字段。
- 让 `doctor`/`status` 校验 hook config 的内容，而不只是检查文件存在。
- 将 hook config merge 纳入 manifest/ownership 记录，避免直接覆写有效 JSON 时绕过投影安全模型。

### Plan C: 同步文档、测试和历史兼容说明
- 更新 README、`docs/install/*`、`docs/compatibility/hooks.md`、`docs/architecture.md` 中的 Claude hooks 与 Cursor global entry 描述。
- 更新 path、hook-projection、sync-hooks、health 测试，覆盖 Claude settings JSON 和 Cursor user-global entry unsupported/manual 行为。
- 在 compatibility 文档中保留旧路径说明为“旧实现/不推荐”，但不要继续声明为官方正确路径。

### Plan D: Codex 证据补齐
- 在不改实现前，先通过可访问的 OpenAI 官方文档源补齐 Codex entry、skills、hooks 的官方依据。
- 若官方确认 `.codex/skills` 已不是推荐投影根，再单独制定迁移计划，优先考虑 `.agents/skills` 作为跨 IDE skill 根。
- 在确认前，文档中把 Codex skills/hooks 表述改为 Harness 当前约定或 Codex app 当前支持，而不是官方已验证要求。

### Plan E: Upstream/updates 状态补强
- 让 `sync`、`fetch`、`update` 写入 state 中已有的 `lastSync`、`lastFetch`、`lastUpdate`。
- 在 `status` 中展示 staged candidate、applied upstream source、commit/version 信息。
- 把 README 中 “allowlisted upstream changes” 改成更精确的“known upstream source names”，除非实现真正的 per-file allowlist。

## Detailed Executable Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` task-by-task. Implementers must use TDD: write the failing test first, run it, then implement. Do not read this plan file from a subagent; the controller will pass each task text directly.

**Goal:** Make Harness projection paths and file semantics match the official documentation for GitHub Copilot, Cursor, Claude Code, and the confirmed Codex surface.

**Architecture:** Keep platform facts in metadata and adapter manifests, keep path derivation in `harness/installer/lib/paths.mjs`, and keep hook config format differences inside hook projection/config helpers. Do not create a second projection system. Documentation must distinguish official platform requirements from Harness conventions and current evidence gaps.

**Tech Stack:** Node.js ESM CLI, built-in `node:test`, JSON metadata, Markdown documentation.

### Task 1: Cursor user-global entry should not render a fake rules file

**Files:**
- Modify: `harness/core/metadata/platforms.json`
- Modify: `harness/adapters/cursor/manifest.json`
- Modify: `tests/installer/paths.test.mjs`
- Optional if needed: `tests/adapters/templates.test.mjs`

- [ ] **Step 1: Write failing path tests**

Add or update tests in `tests/installer/paths.test.mjs` so Cursor has a workspace entry but no user-global rendered entry:

```js
test('resolveTargetPaths returns Cursor workspace rule only for workspace scope', () => {
  const paths = resolveTargetPaths('/repo', '/home/user', 'workspace', 'cursor');
  assert.deepEqual(paths, ['/repo/.cursor/rules/harness.mdc']);
});

test('resolveTargetPaths returns no Cursor user-global rendered entry', () => {
  const paths = resolveTargetPaths('/repo', '/home/user', 'user-global', 'cursor');
  assert.deepEqual(paths, []);
});

test('resolveTargetPaths returns Cursor workspace rule only when scope is both', () => {
  const paths = resolveTargetPaths('/repo', '/home/user', 'both', 'cursor');
  assert.deepEqual(paths, ['/repo/.cursor/rules/harness.mdc']);
});
```

- [ ] **Step 2: Run the failing tests**

Run:

```bash
node --test tests/installer/paths.test.mjs
```

Expected before implementation: the user-global and both-scope Cursor tests fail because `/home/user/.cursor/rules/harness.mdc` is still returned.

- [ ] **Step 3: Implement metadata and manifest change**

In `harness/core/metadata/platforms.json`, keep Cursor `entryFiles` for compatibility but add scope-specific entries:

```json
"cursor": {
  "displayName": "Cursor",
  "entryFiles": [".cursor/rules/harness.mdc"],
  "entryFilesByScope": {
    "workspace": [".cursor/rules/harness.mdc"],
    "global": []
  },
  "skillRoots": {
    "workspace": [".cursor/skills"],
    "global": [".cursor/skills"]
  },
  "hookRoots": {
    "workspace": [".cursor"],
    "global": [".cursor"]
  },
  "supportsGlobal": true,
  "supportsWorkspace": true,
  "skillsStrategy": "mixed"
}
```

In `harness/adapters/cursor/manifest.json`, change `globalEntries` to an empty array:

```json
"workspaceEntries": [".cursor/rules/harness.mdc"],
"globalEntries": []
```

- [ ] **Step 4: Run focused tests**

Run:

```bash
node --test tests/installer/paths.test.mjs tests/adapters/templates.test.mjs
```

Expected: all tests pass.

- [ ] **Step 5: Report task result**

Return status `DONE` with changed files and test output summary. Do not commit unless the controller explicitly asks.

### Task 2: Claude Code hooks must merge into settings JSON

**Files:**
- Modify: `harness/installer/lib/hook-projection.mjs`
- Modify: `harness/installer/lib/hook-config.mjs`
- Modify: `harness/installer/commands/sync.mjs`
- Modify: `tests/adapters/hook-projection.test.mjs`
- Modify: `tests/adapters/sync-hooks.test.mjs`
- Modify: `tests/installer/hook-config.test.mjs`

- [ ] **Step 1: Write failing hook projection tests**

Add tests to `tests/adapters/hook-projection.test.mjs`:

```js
test('planHookProjections returns Claude Code hook config under settings.json', async () => {
  const plans = await planHookProjections({
    rootDir: process.cwd(),
    homeDir: '/home/user',
    scope: 'workspace',
    target: 'claude-code',
    hookMode: 'on'
  });
  const planning = plans.find((plan) => plan.parentSkillName === 'planning-with-files');

  assert.equal(planning.status, 'planned');
  assert.equal(planning.configTarget, path.join(process.cwd(), '.claude/settings.json'));
  assert.equal(planning.configFormat, 'settings');
  assert.equal(planning.scriptTargetRoot, path.join(process.cwd(), '.claude/hooks'));
});

test('planHookProjections returns Claude Code user-global hook config under settings.json', async () => {
  const plans = await planHookProjections({
    rootDir: process.cwd(),
    homeDir: '/home/user',
    scope: 'user-global',
    target: 'claude-code',
    hookMode: 'on'
  });
  const planning = plans.find((plan) => plan.parentSkillName === 'planning-with-files');

  assert.equal(planning.configTarget, path.join('/home/user', '.claude/settings.json'));
  assert.equal(planning.configFormat, 'settings');
  assert.equal(planning.scriptTargetRoot, path.join('/home/user', '.claude/hooks'));
});
```

- [ ] **Step 2: Write failing settings merge tests**

In `tests/installer/hook-config.test.mjs`, add tests for a new exported helper named `mergeHookSettings`:

```js
test('mergeHookSettings preserves non-hook Claude settings', () => {
  const merged = mergeHookSettings(
    { permissions: { allow: ['Bash(npm test)'] } },
    {
      hooks: {
        Stop: [
          {
            description: 'Harness-managed planning-with-files hook',
            hooks: [{ type: 'command', command: 'bash .claude/hooks/task-scoped-hook.sh claude-code stop' }]
          }
        ]
      }
    },
    'claude-code'
  );

  assert.deepEqual(merged.permissions, { allow: ['Bash(npm test)'] });
  assert.equal(merged.hooks.Stop.length, 1);
});

test('mergeHookSettings replaces prior Harness-managed entry and preserves user hook entry', () => {
  const existing = {
    hooks: {
      Stop: [
        {
          description: 'user hook',
          hooks: [{ type: 'command', command: 'echo user' }]
        },
        {
          description: 'Harness-managed planning-with-files hook',
          hooks: [{ type: 'command', command: 'echo old' }]
        }
      ]
    }
  };
  const incoming = {
    hooks: {
      Stop: [
        {
          description: 'Harness-managed planning-with-files hook',
          hooks: [{ type: 'command', command: 'echo new' }]
        }
      ]
    }
  };

  const merged = mergeHookSettings(existing, incoming, 'claude-code');
  assert.deepEqual(
    merged.hooks.Stop.map((entry) => entry.hooks[0].command),
    ['echo user', 'echo new']
  );
});
```

- [ ] **Step 3: Write failing sync tests**

Add tests to `tests/adapters/sync-hooks.test.mjs`:

```js
test('sync installs Claude Code hooks into settings.json when hookMode is on', async () => {
  const root = await createHarnessFixture();
  try {
    await writeState(root, {
      schemaVersion: 1,
      scope: 'workspace',
      projectionMode: 'link',
      hookMode: 'on',
      targets: { 'claude-code': { enabled: true, paths: [path.join(root, 'CLAUDE.md')] } },
      upstream: {}
    });

    await withCwd(root, () => sync([]));
    const settings = JSON.parse(await readFile(path.join(root, '.claude/settings.json'), 'utf8'));

    assert.ok(settings.hooks.UserPromptSubmit);
    assert.ok(settings.hooks.SessionStart);
    assert.match(JSON.stringify(settings), /Harness-managed planning-with-files hook/);
    assert.match(JSON.stringify(settings), /Harness-managed superpowers hook/);
    assert.match(await readFile(path.join(root, '.claude/hooks/task-scoped-hook.sh'), 'utf8'), /planning\/active/);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('sync preserves existing Claude Code settings while merging hooks', async () => {
  const root = await createHarnessFixture();
  try {
    await writeState(root, {
      schemaVersion: 1,
      scope: 'workspace',
      projectionMode: 'link',
      hookMode: 'on',
      targets: { 'claude-code': { enabled: true, paths: [path.join(root, 'CLAUDE.md')] } },
      upstream: {}
    });
    await mkdir(path.join(root, '.claude'), { recursive: true });
    await writeFile(
      path.join(root, '.claude/settings.json'),
      `${JSON.stringify({ permissions: { allow: ['Bash(node --test)'] } }, null, 2)}\n`
    );

    await withCwd(root, () => sync([]));
    const settings = JSON.parse(await readFile(path.join(root, '.claude/settings.json'), 'utf8'));

    assert.deepEqual(settings.permissions, { allow: ['Bash(node --test)'] });
    assert.ok(settings.hooks.Stop);
  } finally {
    await removeHarnessFixture(root);
  }
});
```

- [ ] **Step 4: Run failing tests**

Run:

```bash
node --test tests/adapters/hook-projection.test.mjs tests/installer/hook-config.test.mjs tests/adapters/sync-hooks.test.mjs
```

Expected before implementation: Claude config target and `mergeHookSettings` tests fail.

- [ ] **Step 5: Implement hook projection format**

In `harness/installer/lib/hook-projection.mjs`, make `hookConfigTarget` platform-specific:

```js
function hookConfigTarget(root, target, parentSkillName) {
  if (target === 'copilot') {
    return path.join(root, `${parentSkillName}.json`);
  }

  if (target === 'claude-code') {
    return path.join(root, 'settings.json');
  }

  return path.join(root, 'hooks.json');
}

function hookConfigFormat(target) {
  return target === 'claude-code' ? 'settings' : 'hooks';
}
```

Add `configFormat: hookConfigFormat(target)` to both planned hook projection objects.

- [ ] **Step 6: Implement settings merge helper**

In `harness/installer/lib/hook-config.mjs`, export `mergeHookSettings`:

```js
export function mergeHookSettings(existingSettings = {}, incomingConfig, target) {
  if (!isPlainObject(existingSettings)) {
    throw new TypeError(`Hook settings for ${target} must be a JSON object.`);
  }

  const existingConfig = {
    hooks: isPlainObject(existingSettings.hooks) ? existingSettings.hooks : {}
  };
  const mergedConfig = mergeHookConfig(existingConfig, incomingConfig, target);

  return {
    ...existingSettings,
    hooks: mergedConfig.hooks
  };
}
```

- [ ] **Step 7: Use settings merge in sync**

In `harness/installer/commands/sync.mjs`, import `mergeHookSettings` and branch on `projection.configFormat`:

```js
import { mergeHookConfig, mergeHookSettings } from '../lib/hook-config.mjs';
```

Inside `writeHookConfigProjection`, replace the existing merge branch with:

```js
const existing = await readJsonIfExists(projection.configTarget);
if (projection.configFormat === 'settings') {
  merged = mergeHookSettings(existing ?? {}, incoming, projection.target);
} else if (existing) {
  merged = mergeHookConfig(existing, incoming, projection.target);
}
```

- [ ] **Step 8: Run focused tests**

Run:

```bash
node --test tests/adapters/hook-projection.test.mjs tests/installer/hook-config.test.mjs tests/adapters/sync-hooks.test.mjs
```

Expected: all tests pass.

- [ ] **Step 9: Report task result**

Return status `DONE` with changed files and test output summary. Do not commit unless the controller explicitly asks.

### Task 3: Health checks must validate hook content, not just file presence

**Files:**
- Modify: `harness/installer/lib/health.mjs`
- Modify: `tests/installer/health.test.mjs`

- [ ] **Step 1: Write failing health test for missing managed hook entry**

Add this test to `tests/installer/health.test.mjs`:

```js
test('readHarnessHealth reports a problem when hook config exists without the managed entry', async () => {
  const root = await createHarnessFixture();
  try {
    await writeState(root, {
      schemaVersion: 1,
      scope: 'workspace',
      projectionMode: 'link',
      hookMode: 'on',
      targets: {
        cursor: { enabled: true, paths: [path.join(root, '.cursor/rules/harness.mdc')] }
      },
      upstream: {}
    });

    await withCwd(root, () => sync([]));
    await writeFile(
      path.join(root, '.cursor/hooks.json'),
      `${JSON.stringify({ version: 1, hooks: { stop: [] } }, null, 2)}\n`
    );

    const health = await readHarnessHealth(root, '/home/user');
    const planning = health.targets.cursor.hooks.find((hook) => hook.parentSkillName === 'planning-with-files');

    assert.equal(planning.status, 'problem');
    assert.match(planning.message, /missing Harness-managed planning-with-files hook/);
    assert.ok(health.problems.some((problem) => problem.includes('planning-with-files')));
  } finally {
    await removeHarnessFixture(root);
  }
});
```

- [ ] **Step 2: Write failing health test for Claude settings content**

Add:

```js
test('readHarnessHealth validates Claude Code hooks inside settings JSON', async () => {
  const root = await createHarnessFixture();
  try {
    await writeState(root, {
      schemaVersion: 1,
      scope: 'workspace',
      projectionMode: 'link',
      hookMode: 'on',
      targets: {
        'claude-code': { enabled: true, paths: [path.join(root, 'CLAUDE.md')] }
      },
      upstream: {}
    });

    await withCwd(root, () => sync([]));
    const health = await readHarnessHealth(root, '/home/user');
    const planning = health.targets['claude-code'].hooks.find((hook) => hook.parentSkillName === 'planning-with-files');

    assert.equal(planning.status, 'ok');
  } finally {
    await removeHarnessFixture(root);
  }
});
```

- [ ] **Step 3: Run failing tests**

Run:

```bash
node --test tests/installer/health.test.mjs
```

Expected before implementation: missing managed entry is not detected.

- [ ] **Step 4: Implement content validation**

In `harness/installer/lib/health.mjs`, after verifying `projection.configTarget` exists, parse the JSON and validate expected marker:

```js
async function inspectHook(projection) {
  if (projection.status === 'unsupported') {
    return projection;
  }

  if (!(await exists(projection.configTarget))) {
    return { ...projection, status: 'missing', message: 'Hook config is missing.' };
  }

  const configText = await readFile(projection.configTarget, 'utf8').catch(() => '');
  let config;
  try {
    config = JSON.parse(configText);
  } catch {
    return { ...projection, status: 'problem', message: 'Hook config is malformed JSON.' };
  }

  const marker = `Harness-managed ${projection.parentSkillName} hook`;
  if (!JSON.stringify(config.hooks ?? {}).includes(marker)) {
    return { ...projection, status: 'problem', message: `Hook config is missing ${marker}.` };
  }

  for (const sourcePath of projection.scriptSourcePaths) {
    const targetPath = path.join(projection.scriptTargetRoot, path.basename(sourcePath));
    if (!(await exists(targetPath))) {
      return { ...projection, status: 'missing', message: `Hook script is missing: ${targetPath}` };
    }
  }

  return { ...projection, status: 'ok' };
}
```

Keep the script existence loop intact. Do not reject unsupported hooks.

- [ ] **Step 5: Run focused tests**

Run:

```bash
node --test tests/installer/health.test.mjs tests/adapters/sync-hooks.test.mjs
```

Expected: all tests pass.

- [ ] **Step 6: Report task result**

Return status `DONE` with changed files and test output summary.

### Task 4: Sync/fetch/update/status must expose upstream and timing state

**Files:**
- Modify: `harness/installer/lib/state.mjs`
- Modify: `harness/installer/commands/sync.mjs`
- Modify: `harness/installer/commands/fetch.mjs`
- Modify: `harness/installer/commands/update.mjs`
- Modify: `harness/installer/lib/health.mjs`
- Modify: `tests/installer/state.test.mjs`
- Modify: `tests/installer/upstream-commands.test.mjs`
- Modify: `tests/installer/health.test.mjs`

- [ ] **Step 1: Write failing state helper test**

In `tests/installer/state.test.mjs`, add:

```js
test('updateState reads, updates, and writes state', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'harness-state-'));
  try {
    await writeState(dir, {
      schemaVersion: 1,
      scope: 'workspace',
      projectionMode: 'link',
      hookMode: 'off',
      targets: {},
      upstream: {}
    });

    await updateState(dir, (state) => ({
      ...state,
      lastSync: '2026-04-13T00:00:00.000Z'
    }));

    assert.equal((await readState(dir)).lastSync, '2026-04-13T00:00:00.000Z');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
```

Update imports to include `updateState`.

- [ ] **Step 2: Write failing sync timestamp test**

Add to `tests/adapters/sync.test.mjs` or `tests/installer/state.test.mjs` with existing fixture helpers:

```js
test('sync records lastSync timestamp', async () => {
  const root = await createHarnessFixture();
  try {
    await writeState(root, {
      schemaVersion: 1,
      scope: 'workspace',
      projectionMode: 'link',
      hookMode: 'off',
      targets: { codex: { enabled: true, paths: [path.join(root, 'AGENTS.md')] } },
      upstream: {}
    });

    await withCwd(root, () => sync([]));
    assert.match((await readState(root)).lastSync, /^\d{4}-\d{2}-\d{2}T/);
  } finally {
    await removeHarnessFixture(root);
  }
});
```

- [ ] **Step 3: Write failing fetch/update state tests**

In `tests/installer/upstream-commands.test.mjs`, after existing `fetchCommand` and `updateCommand` calls, assert state fields:

```js
const stateAfterFetch = await readState(root);
assert.match(stateAfterFetch.lastFetch, /^\d{4}-\d{2}-\d{2}T/);
assert.equal(
  stateAfterFetch.upstream['planning-with-files'].candidatePath,
  path.join(root, '.harness/upstream-candidates/planning-with-files')
);

const stateAfterUpdate = await readState(root);
assert.match(stateAfterUpdate.lastUpdate, /^\d{4}-\d{2}-\d{2}T/);
assert.equal(
  stateAfterUpdate.upstream['planning-with-files'].appliedPath,
  path.join(root, 'harness/upstream/planning-with-files')
);
```

Update imports to include `readState`.

- [ ] **Step 4: Write failing health/status metadata test**

In `tests/installer/health.test.mjs`, add or extend a test so `readHarnessHealth` returns state metadata:

```js
assert.equal(health.lastSync, state.lastSync);
assert.deepEqual(health.upstream, state.upstream);
```

- [ ] **Step 5: Run failing tests**

Run:

```bash
node --test tests/installer/state.test.mjs tests/installer/upstream-commands.test.mjs tests/installer/health.test.mjs tests/adapters/sync.test.mjs
```

Expected before implementation: `updateState`, timestamps, and health metadata assertions fail.

- [ ] **Step 6: Implement state helper**

In `harness/installer/lib/state.mjs`, export:

```js
export async function updateState(rootDir, updater) {
  const currentState = await readState(rootDir);
  const nextState = updater(currentState);
  await writeState(rootDir, nextState);
  return nextState;
}
```

- [ ] **Step 7: Record lastSync**

In `harness/installer/commands/sync.mjs`, import `updateState` and write after `writeProjectionManifest`:

```js
await updateState(rootDir, (currentState) => ({
  ...currentState,
  lastSync: new Date().toISOString()
}));
```

- [ ] **Step 8: Record fetch/update state**

In `fetch.mjs`, import `updateState` and after staging write:

```js
const fetchedAt = new Date().toISOString();
await updateState(rootDir, (state) => {
  const upstream = { ...state.upstream };
  for (const [sourceName, candidatePath] of stagedBySource) {
    upstream[sourceName] = {
      ...(upstream[sourceName] ?? {}),
      candidatePath,
      lastFetch: fetchedAt
    };
  }
  return { ...state, upstream, lastFetch: fetchedAt };
});
```

In `update.mjs`, mirror the same pattern with `appliedPath`, `lastUpdate`, and the update timestamp.

- [ ] **Step 9: Include metadata in health/status JSON**

In `readHarnessHealth`, add these fields to the returned object:

```js
lastSync: state.lastSync,
lastFetch: state.lastFetch,
lastUpdate: state.lastUpdate,
upstream: state.upstream,
```

`status` already prints `readHarnessHealth`, so no separate status formatter is needed.

- [ ] **Step 10: Run focused tests**

Run:

```bash
node --test tests/installer/state.test.mjs tests/installer/upstream-commands.test.mjs tests/installer/health.test.mjs tests/adapters/sync.test.mjs
```

Expected: all tests pass.

- [ ] **Step 11: Report task result**

Return status `DONE` with changed files and test output summary.

### Task 5: Documentation must match the corrected platform model

**Files:**
- Modify: `README.md`
- Modify: `docs/install/cursor.md`
- Modify: `docs/install/claude-code.md`
- Modify: `docs/compatibility/hooks.md`
- Modify: `docs/architecture.md`
- Modify if needed: `docs/install/codex.md`

- [ ] **Step 1: Search docs for stale paths**

Run:

```bash
rg -n "~/.cursor/rules|\\.claude/hooks\\.json|~/.claude/hooks\\.json|allowlisted upstream" README.md docs
```

Expected before implementation: stale Cursor global entry and Claude hooks paths appear.

- [ ] **Step 2: Update README entry table**

Change Cursor row from rendered user-global file to manual/settings:

```md
| Cursor | `.cursor/rules/harness.mdc` | User Rules in Cursor Settings; no rendered file-system entry | Workspace rendered file; user-global skills only |
```

Keep Copilot row unchanged:

```md
| GitHub Copilot | `.github/copilot-instructions.md` | `~/.copilot/instructions/harness.instructions.md` | Rendered file |
```

- [ ] **Step 3: Update README hooks table**

Change Claude Code hook target row to:

```md
| Claude Code | `.claude/settings.json`, `.claude/hooks/*` | `~/.claude/settings.json`, `~/.claude/hooks/*` |
```

Keep Cursor row as current unless official Cursor hook extraction proves otherwise:

```md
| Cursor | `.cursor/hooks.json`, `.cursor/hooks/*` | `~/.cursor/hooks.json`, `~/.cursor/hooks/*` |
```

- [ ] **Step 4: Update Cursor installation doc**

Replace user-global section with:

```md
User-global scope does not render a Cursor rule file because Cursor User Rules are configured in Cursor Settings rather than stored as `~/.cursor/rules/*.mdc` files. Harness still projects user-global skills to `~/.cursor/skills` when user-global scope is selected.
```

- [ ] **Step 5: Update Claude Code installation doc**

Replace optional hook paths with:

```text
.claude/settings.json
.claude/hooks/run-hook.cmd
.claude/hooks/task-scoped-hook.sh
~/.claude/settings.json
~/.claude/hooks/run-hook.cmd
~/.claude/hooks/task-scoped-hook.sh
```

- [ ] **Step 6: Update compatibility and architecture docs**

In `docs/compatibility/hooks.md` and `docs/architecture.md`, describe hook config files as adapter-specific:

```md
Claude Code stores hook declarations in the `hooks` field of settings JSON. Harness merges managed entries into `.claude/settings.json` or `~/.claude/settings.json` and materializes helper scripts under the matching `.claude/hooks/` directory.
```

Clarify upstream wording:

```md
`fetch` and `update` operate only on known upstream source names from `harness/upstream/sources.json`; they do not implement a per-file allowlist.
```

- [ ] **Step 7: Add Codex evidence caveat if the docs currently overclaim**

If `docs/install/codex.md` says `.codex/skills` is officially documented, change it to say Harness currently projects Codex skills there based on the active Codex app environment, and that Codex hooks are not projected.

- [ ] **Step 8: Verify stale docs are gone**

Run:

```bash
rg -n "~/.cursor/rules|\\.claude/hooks\\.json|~/.claude/hooks\\.json|allowlisted upstream" README.md docs
```

Expected after implementation: no stale matches, except historical docs under `docs/superpowers/` if included by mistake. Do not edit historical `docs/superpowers/plans/*`.

- [ ] **Step 9: Report task result**

Return status `DONE` with changed files and search output summary.

### Task 6: Final integration verification

**Files:**
- Modify only if previous tasks exposed integration issues.

- [ ] **Step 1: Run full test suite**

Run:

```bash
npm run verify
```

Expected: all tests pass.

- [ ] **Step 2: Run stale path search**

Run:

```bash
rg -n "~/.cursor/rules|\\.claude/hooks\\.json|~/.claude/hooks\\.json" README.md docs harness tests --glob '!docs/superpowers/**'
```

Expected: no stale path references in active docs, implementation, or tests.

- [ ] **Step 3: Run git diff review**

Run:

```bash
git diff --stat
git diff --check
```

Expected: diff only contains intended implementation, tests, docs, and planning updates; no whitespace errors.

- [ ] **Step 4: Final review**

Dispatch final code review over the complete branch. Critical and Important findings must be fixed before completion.

## Errors Encountered

| Error | Attempt | Resolution |
|-------|---------|------------|
| 本机没有 `fd` | 1 | 改用 `find` 和 `rg` |
