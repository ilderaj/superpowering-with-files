# GitHub Upstream Refresh Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `main` 上建立每周五定时触发的 upstream refresh workflow，从 `origin/dev` 派生自动化分支，运行 Harness refresh/validation 链路，并在无冲突、验证通过、diff 合规时创建或更新指向 `dev` 的 PR。

**Architecture:** v1 采用单一 workflow 完成 schedule/manual trigger、branch prep、Harness refresh、diff allowlist、PR create/update，避免依赖 `GITHUB_TOKEN` 触发新的 CI run。冲突、验证失败、allowlist 失败都按 fail-fast 处理，停止开 PR/停止落地到 `dev`，并把结果写入 artifact 与结果文件供人工接管。

**Tech Stack:** GitHub Actions, Node.js built-ins (`node:child_process`, `node:fs/promises`, `node:test`), Git CLI, GitHub CLI, existing Harness CLI commands

---

## Companion Link

- Authoritative task memory: `planning/active/github-actions-upstream-automation-analysis/`
- Active task path: `planning/active/github-actions-upstream-automation-analysis/`
- Sync-back status: synced on `2026-04-19`

## Planning Assumptions

- 默认 schedule 采用 **Friday 21:00 UTC**，对应 cron：`0 21 * * 5`。
- workflow 文件放在默认分支 `main`，但 refresh 工作分支固定从 `origin/dev` 派生。
- v1 **不启用 auto-merge**，也不允许 workflow 直推 `dev`。
- v1 的“处理冲突”定义为：**fail-fast + artifact/log + 人工接管**，不是 bot 自动解冲突。
- 在启用定时任务前，先配置 `dev` 的 branch protection 与 required checks；否则只允许手动 `workflow_dispatch` 演练。

## File Map

- Create: `.github/workflows/upstream-refresh.yml` — scheduled/manual workflow entrypoint.
- Create: `scripts/ci/lib/upstream-refresh.mjs` — refresh command sequencing, diff filtering, result shaping.
- Create: `scripts/ci/run-upstream-refresh.mjs` — executes refresh chain and writes `.harness/upstream-refresh-result.json`.
- Create: `scripts/ci/lib/upstream-pr.mjs` — commit eligibility, PR metadata, branch constants.
- Create: `scripts/ci/open-upstream-pr.mjs` — commit, push, create/update PR.
- Create: `tests/automation/upstream-refresh-workflow.test.mjs` — workflow trigger and wiring contract tests.
- Create: `tests/automation/upstream-refresh-lib.test.mjs` — refresh sequencing and diff filtering tests.
- Create: `tests/automation/upstream-pr-lib.test.mjs` — PR helper tests.
- Modify: `package.json` — include automation tests in `npm run verify`.
- Modify: `docs/maintenance.md` — operator docs, failure handling, enablement checklist.

## Rollout Gates

- Gate 1: `dev` 必须先配置 branch protection / required checks，才允许启用定时 schedule。
- Gate 2: refresh 只允许提交 repo-owned upstream/projection/doc 文件；运行态文件不进入 commit。
- Gate 3: 任何冲突、verify 失败、allowlist 失败、commit 失败、PR 失败都必须使 workflow fail。
- Gate 4: 没有变更时只产出成功结果，不创建空 PR。
- Gate 5: v1 不做 auto-merge；merge 仍由受保护分支上的 reviewer/checks 决定。

### Task 0: Governance And Activation Preflight

**Files:**
- Modify: `docs/maintenance.md`
- Manual config: GitHub branch protection for `dev`
- Manual config: Actions permissions / optional notification target

- [ ] **Step 1: Document branch protection precondition**

把下面这组前置条件写进 `docs/maintenance.md`：

```text
Protect branch: dev
Require pull request before merging
Require status checks to pass before merging
Required check: npm run verify (or the workflow job name that wraps it)
Restrict direct pushes to dev
```

- [ ] **Step 2: Record activation order**

在 `docs/maintenance.md` 中写清启用顺序：

```text
1. Merge workflow implementation to main
2. Configure dev branch protection
3. Run workflow_dispatch once and confirm result
4. Enable weekly schedule
```

- [ ] **Step 3: Lock the schedule default**

在 workflow contract tests 和 `docs/maintenance.md` 中统一使用：

```text
Friday 21:00 UTC
cron: 0 21 * * 5
```

### Task 1: Add Workflow Contract Tests First

**Files:**
- Create: `tests/automation/upstream-refresh-workflow.test.mjs`
- Create: `tests/automation/upstream-refresh-lib.test.mjs`
- Create: `tests/automation/upstream-pr-lib.test.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write workflow trigger contract**

验证 workflow 至少具备这些 contract：

```text
on:
  workflow_dispatch:
  schedule:
    - cron: '0 21 * * 5'
permissions:
  contents: write
  pull-requests: write
```

- [ ] **Step 2: Write refresh sequencing contract**

验证 refresh command chain 固定为：

```text
git fetch origin main dev
git checkout -B automation/upstream-refresh origin/dev
./scripts/harness install --scope=workspace --targets=all --projection=link
./scripts/harness fetch
./scripts/harness update
npm run verify
./scripts/harness worktree-preflight
./scripts/harness sync --dry-run
./scripts/harness sync
./scripts/harness doctor
```

- [ ] **Step 3: Write diff filtering contract**

验证 changed files 过滤逻辑满足：

```text
include: tracked repo-owned files
include: untracked repo-owned files
exclude: .harness/projections.json
exclude: .harness/state.json
exclude: unrelated workspace files
```

- [ ] **Step 4: Add test coverage to repo verify**

把自动化测试并入仓库验证入口：

```text
npm run verify
```

### Task 2: Implement Refresh Runner

**Files:**
- Create: `scripts/ci/lib/upstream-refresh.mjs`
- Create: `scripts/ci/run-upstream-refresh.mjs`

- [ ] **Step 1: Implement branch preparation helpers**

固定使用这些常量：

```text
baseRef = origin/dev
branchName = automation/upstream-refresh
resultPath = .harness/upstream-refresh-result.json
```

- [ ] **Step 2: Implement refresh execution chain**

runner 要顺序执行：

```text
fetch -> checkout -B -> harness install -> harness fetch -> harness update -> npm run verify -> worktree-preflight -> sync --dry-run -> sync -> doctor
```

- [ ] **Step 3: Capture repo-owned changed files**

变更收集必须同时覆盖：

```text
git diff --name-only --relative HEAD
git ls-files --others --exclude-standard
```

然后合并、去重、过滤 runtime-only files。

- [ ] **Step 4: Emit machine-readable result**

无论成功或失败，都写结果文件：

```json
{
  "status": "success|failure|no_changes",
  "baseRef": "origin/dev",
  "branchName": "automation/upstream-refresh",
  "eligibleFiles": [],
  "blockedReason": ""
}
```

### Task 3: Define Fail-Fast Conflict Handling

**Files:**
- Modify: `scripts/ci/lib/upstream-refresh.mjs`
- Modify: `scripts/ci/run-upstream-refresh.mjs`
- Modify: `docs/maintenance.md`

- [ ] **Step 1: Treat git conflicts as terminal failures**

如果 `git checkout -B` 后的 refresh/sync 链路出现 merge/conflict 类错误，runner 必须：

```text
mark status = failure
set blockedReason
upload result/log artifact
exit non-zero
```

- [ ] **Step 2: Treat verify and allowlist failures the same way**

以下失败全部统一为不可自动推进：

```text
npm run verify failed
allowlist violation
git commit failed
gh pr create/update failed
```

- [ ] **Step 3: Document manual takeover path**

`docs/maintenance.md` 需要写清人工接管动作：

```text
download artifact
reproduce on local dev branch
fix conflict or validation issue
open/update PR manually if needed
```

### Task 4: Implement PR Automation

**Files:**
- Create: `scripts/ci/lib/upstream-pr.mjs`
- Create: `scripts/ci/open-upstream-pr.mjs`

- [ ] **Step 1: Stabilize PR metadata**

固定这些常量：

```text
branchName = automation/upstream-refresh
baseBranch = dev
title = chore: refresh upstream baselines
```

- [ ] **Step 2: Configure bot git identity before commit**

commit 前必须显式设置：

```text
git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
```

- [ ] **Step 3: Create or update PR only when eligibleFiles is non-empty**

逻辑必须是：

```text
no eligible files -> no PR
open PR on same branch exists -> update/push branch only
no open PR -> create PR targeting dev
```

### Task 5: Wire Workflow And Artifacts

**Files:**
- Create: `.github/workflows/upstream-refresh.yml`

- [ ] **Step 1: Check out main and fetch dev**

workflow job 需要在 `main` 上运行，但脚本内部切到 `origin/dev` 派生的工作分支。

- [ ] **Step 2: Run refresh runner before PR runner**

workflow 顺序固定为：

```text
setup node
run refresh runner
upload result artifact
conditionally run PR runner
```

- [ ] **Step 3: Gate PR creation on success + eligible changes**

只有以下条件同时满足才运行 `open-upstream-pr.mjs`：

```text
result.status == success
eligibleFiles.length > 0
```

### Task 6: Verify And Enable Safely

**Files:**
- Modify: `docs/maintenance.md`

- [ ] **Step 1: Verify tests locally**

至少覆盖：

```text
npm run verify
node --test tests/automation/*.test.mjs
```

- [ ] **Step 2: Dry-run via workflow_dispatch before schedule**

启用顺序必须先人工触发一次，确认：

```text
result file generated
artifact uploaded
no unexpected files in eligibleFiles
PR creation/update path works
```

- [ ] **Step 3: Enable weekly schedule last**

只有在 `workflow_dispatch` 演练通过且 `dev` protection 已就位后，才打开：

```text
schedule: Friday 21:00 UTC
```

## Self-Review

- Spec coverage: 本 companion plan 覆盖 schedule、branch source、冲突分流、branch protection 前置条件、详细执行清单和文档同步。
- Placeholder scan: passed; 时区、cron、冲突语义、启用顺序都已具体化。
- Type consistency: refresh runner / PR runner / workflow / docs 的职责边界一致，task memory 与 companion plan 的边界已分离。
