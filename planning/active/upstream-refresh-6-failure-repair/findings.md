# Findings

## GitHub Run Facts
- 失败 run：`25539563928`
- title：`Upstream Refresh`
- event：`workflow_dispatch`
- createdAt：`2026-05-08T05:55:49Z`，即 **2026-05-08 13:55:49 Asia/Shanghai**
- headSha：`98fab25430fe6a46bd453cc2af5b37bfdd045b08`
- 失败 job：`Refresh upstream baselines`
- 失败 step：`Run upstream refresh`

## First Confirmed Failure
- 在失败日志里，第一个明确的测试失败是：
  - `tests/adapters/planning-record-time.test.mjs`
  - test name: `sync materializes planning-with-files progress template with timestamp guidance`
- 当时的直接错误是：
  - `Unable to apply Harness Superpowers finishing-a-development-branch base patch`
- 将最新 upstream candidate 真正 apply 到隔离 worktree 后，下一处暴露出的错误是：
  - `Unable to apply Harness Superpowers using-git-worktrees naming patch`

## Root Cause
- 最新 upstream `superpowers` 改写了两个 skill 的章节结构：

### finishing-a-development-branch
- 旧结构：
  - `### Step 2: Determine Base Branch`
  - `### Step 3: Present Options`
- 新结构：
  - `### Step 2: Detect Environment`
  - `### Step 3: Determine Base Branch`
  - `### Step 4: Present Options`
- 现有 patch 只匹配旧的 `Step 2 -> Step 3` 区间，因此在最新版 upstream 上直接失配。

### using-git-worktrees
- 旧 patch 锚点是固定字符串：
  - `### 2. Create Worktree`
- 最新 upstream 已改成分层结构：
  - `## Step 1: Create Isolated Workspace`
  - `### 1b. Git Worktree Fallback`
  - `#### Directory Selection`
  - `#### Create the Worktree`
- 因此原先的固定插入点也不再存在。

## Fix Strategy
- `superpowers-finishing-a-development-branch-patch.mjs`
  - 同时支持：
    - 旧版 `Step 2 -> Step 3`
    - 新版 `Step 3 -> Step 4`
  - patch block 根据命中的结构自动写成 `### Step 2` 或 `### Step 3`
- `superpowers-using-git-worktrees-patch.mjs`
  - 同时支持：
    - 旧版锚点 `### 2. Create Worktree`
    - 新版锚点 `#### Directory Selection`
- `tests/adapters/skill-projection.test.mjs`
  - 新增两个 synthetic fixture tests，显式覆盖新的 upstream 结构

## Validation
- 隔离 worktree 在 apply 最新 upstream candidate 后验证通过：
  - focused: `node --test tests/adapters/planning-record-time.test.mjs tests/adapters/skill-projection.test.mjs` => `24 pass / 0 fail`
  - full: `npm run verify` => `335 pass / 0 fail`
- 主工作区回写修复后验证通过：
  - focused: `24 pass / 0 fail`
  - full: `npm run verify` => `335 pass / 0 fail`
