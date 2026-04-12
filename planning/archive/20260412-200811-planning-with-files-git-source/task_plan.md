# Task Plan: Planning With Files Git Source

## Goal
将 `planning-with-files` 的 HarnessTemplate upstream 主源从 `local-initial-import` 改为 `https://github.com/OthmanAdi/planning-with-files`，让它可以像 `superpowers` 一样通过 Git source 自动拉取候选更新。

## Current State
Status: closed
Archive Eligible: yes
Close Reason: 已确认 `OthmanAdi/planning-with-files` 为主源，并将 HarnessTemplate 的 upstream source、skill index、文档和测试同步为 git source。

## Current Phase
Phase 4

## Phases

### Phase 1: 计划与影响面确认
- [x] 读取 `writing-plans` 和 `planning-with-files` 规则
- [x] 搜索 `local-initial-import`、`planning-with-files` 和相关文档/测试引用
- [x] 确认不需要新增 updater 逻辑，因为 `fetchCommand` 已支持 `source.type === "git"`
- **Status:** complete

### Phase 2: 测试先行更新
- [x] 修改 upstream tests，使 `planning-with-files` 期望为 git source
- [x] 运行相关测试，确认修改前实现会失败
- **Status:** complete

### Phase 3: 源元数据与文档更新
- [x] 修改 `harness/upstream/sources.json`
- [x] 修改 `harness/core/skills/index.json`
- [x] 更新 `README.md` 与 `docs/maintenance.md` 中的 fetch 指令
- **Status:** complete

### Phase 4: 验证与收尾
- [x] 运行相关测试
- [x] 运行仓库 verify
- [x] 更新 planning 文件并汇报结果
- **Status:** complete

## Implementation Plan

### Task 1: Update Tests For Git Source

**Files:**
- Modify: `tests/installer/upstream.test.mjs`
- Modify: `tests/installer/upstream-commands.test.mjs`
- Test: `node --test tests/installer/upstream.test.mjs tests/installer/upstream-commands.test.mjs`

- [ ] **Step 1: Update source metadata expectations**

Change the configured-source assertion from:

```js
assert.equal(sources['planning-with-files'].type, 'local-initial-import');
```

to:

```js
assert.equal(sources['planning-with-files'].type, 'git');
assert.equal(sources['planning-with-files'].url, 'https://github.com/OthmanAdi/planning-with-files');
```

- [ ] **Step 2: Update command fixture to model git source**

Change the `writeSources` fixture to write:

```js
'planning-with-files': {
  type: 'git',
  url: source,
  path: 'harness/upstream/planning-with-files'
}
```

where `source` is a temporary git repository path created by the test.

- [ ] **Step 3: Run failing test**

Run:

```bash
node --test tests/installer/upstream.test.mjs tests/installer/upstream-commands.test.mjs
```

Expected before implementation: the configured-source test fails because `harness/upstream/sources.json` still contains `local-initial-import`.

### Task 2: Update Source Metadata And Docs

**Files:**
- Modify: `harness/upstream/sources.json`
- Modify: `harness/core/skills/index.json`
- Modify: `README.md`
- Modify: `docs/maintenance.md`
- Test: `npm run verify`

- [ ] **Step 1: Update upstream source metadata**

Change `harness/upstream/sources.json` to:

```json
"planning-with-files": {
  "type": "git",
  "url": "https://github.com/OthmanAdi/planning-with-files",
  "path": "harness/upstream/planning-with-files"
}
```

- [ ] **Step 2: Update skill index metadata**

Change `harness/core/skills/index.json` to:

```json
"source": "https://github.com/OthmanAdi/planning-with-files"
```

- [ ] **Step 3: Update user-facing maintenance docs**

Replace the old local-source instructions:

```bash
./scripts/harness fetch --source=planning-with-files --from=/path/to/planning-with-files
```

with:

```bash
./scripts/harness fetch --source=planning-with-files
```

- [ ] **Step 4: Run verification**

Run:

```bash
npm run verify
```

Expected after implementation: all tests pass.

## Key Decisions
| Decision | Rationale |
|----------|-----------|
| 以 `https://github.com/OthmanAdi/planning-with-files` 作为主源 | 用户已确认这是要跟踪的主源 |
| 只改 source metadata、docs 和 tests | `fetchCommand` 已支持 git source，无需新增 updater 行为 |
| 不写 `docs/superpowers/plans/` | 仓库 AGENTS 规则覆盖 superpowers 默认计划位置，长期计划必须在 `planning/active/<task-id>/` |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| `loadUpstreamSources reads configured upstream sources` 预期失败 | 1 | 按 TDD 流程先把测试改为期望 `git`，再更新 `harness/upstream/sources.json` |
