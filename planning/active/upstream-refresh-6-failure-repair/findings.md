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

## 2026-05-08 First Scheduled Run Failure (`#7`)
- 失败 run：`25559163029`
- title：`Upstream Refresh`
- event：`schedule`
- createdAt：`2026-05-08T13:47:40Z`，即 **2026-05-08 21:47:40 Asia/Shanghai**
- headSha：`fac4492961226ce39e12a4d6d0778a0b434be52d`
- `Run upstream refresh` step 已成功。
- 失败 job：`Refresh upstream baselines`
- 失败 step：`Open upstream refresh pull request`
- failed log 关键错误：
  - `gh pr create failed: spawn E2BIG`

## Root Cause Extension
- `#7` 证明 `#6` 的 patch 兼容性修复已经解除 refresh 主链路阻塞，因为 refresh result artifact 明确记录：
  - `status = success`
  - `eligibleFiles.length = 1737`
- 真实失败点转移到 PR 打开阶段：
  - `scripts/ci/open-upstream-pr.mjs` 调用 `gh pr create`
  - `scripts/ci/lib/upstream-pr.mjs` 把完整 PR body 作为 `--body <very-large-string>` 直接放进 argv
- 当 eligible files 数量极大时，PR body 会枚举全部文件路径，最终在 `execFile`/OS argv 长度限制处触发 `spawn E2BIG`。
- 这不是 GitHub workflow contract 漂移，也不是 refresh allowlist 再次失效，而是本地 PR opening adapter 对大结果集不稳健。

## Fix Strategy Extension
- `scripts/ci/lib/upstream-pr.mjs`
  - 新增 `defaultPullRequestBodyPath = .harness/upstream-pr-body.md`
  - `gh pr create/edit` 改走 `--body-file`，不再把完整 body 内联进 argv
  - PR body 的 eligible files 列表改为最多展示前 `50` 个文件，并明确提示其余文件数与“请查看 PR diff”
- `scripts/ci/open-upstream-pr.mjs`
  - 在实际 create/update 前写出 `.harness/upstream-pr-body.md`
  - 命令执行后无论成功失败都清理该临时 body file
- `tests/automation/upstream-pr-lib.test.mjs`
  - 新增 oversized eligible file list 截断测试
  - 更新 create/update 测试，校验 `--body-file` 路径、body file 内容以及清理行为

## Validation Update
- focused:
  - `node --test tests/automation/upstream-pr-lib.test.mjs tests/automation/upstream-refresh-workflow.test.mjs`
  - 结果：`27 pass / 0 fail`
- full:
  - `npm run verify`
  - 结果：`336 pass / 0 fail`
