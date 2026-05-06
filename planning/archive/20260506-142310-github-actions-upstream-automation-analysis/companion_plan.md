# GitHub Upstream Refresh Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `main` 上建立每周五 20:00 定时触发的 upstream refresh workflow，先按 upstream `HEAD` 判断 Superpowers 与 Planning with Files 是否有更新；有更新时从 `origin/dev` 派生自动化分支，运行 Harness refresh/validation 链路，并在无冲突、验证通过、diff 合规时创建或更新指向 `dev` 的 PR。PR merge 后，远端 `dev` 由 GitHub 完成；本地 `dev` 同步需要独立的 local sync helper，只做 fast-forward 安全同步。

**Architecture:** v1 采用单一 workflow 完成 schedule/manual trigger、upstream HEAD probe、branch prep、Harness refresh、diff allowlist、PR create/update，避免依赖 `GITHUB_TOKEN` 触发新的 CI run。冲突、验证失败、allowlist 失败都按 fail-fast 处理，停止开 PR/停止落地到 `dev`，并把结果写入 artifact 与结果文件供人工接管。本地同步不放进 GitHub Actions，因为 GitHub runner 不能直接修改开发者机器上的 checkout。

**Tech Stack:** GitHub Actions, Node.js built-ins (`node:child_process`, `node:fs/promises`, `node:test`), Git CLI, GitHub CLI, existing Harness CLI commands

---

## Companion Link

- Authoritative task memory: `planning/active/github-actions-upstream-automation-analysis/`
- Active task path: `planning/archive/20260506-142310-github-actions-upstream-automation-analysis/`
- Lifecycle state: archived
- Sync-back status: archived at 2026-05-06T14:23:10: moved companion plan into archive

## Planning Assumptions

- 默认 schedule 采用 **Friday 20:00 Asia/Shanghai**，对应 GitHub Actions cron：`0 12 * * 5`。如果实际需要其他时区，只改 cron 与文档，不改执行链路。
- workflow 文件放在默认分支 `main`，但 refresh 工作分支固定从 `origin/dev` 派生。
- v1 **不启用 auto-merge**，也不允许 workflow 直推 `dev`。
- v1 的“处理冲突”定义为：**fail-fast + artifact/log + 人工接管**，不是 bot 自动解冲突。
- 在启用定时任务前，先配置 `dev` 的 branch protection 与 required checks；否则只允许手动 `workflow_dispatch` 演练。
- v1 的“PR merge 后同步到 local dev”定义为 repo 内新增本地命令或可选 LaunchAgent 调用的 fast-forward helper；它不自动解决语义冲突，不处理未提交工作区，只在安全时执行 `git pull --ff-only`。

## 2026-04-30 Feasibility Review

- GitHub cloud flow is feasible: scheduled HEAD probe, update branch, validation, PR creation, and review gates can all be implemented in GitHub Actions.
- GitHub-only local sync is not feasible: Actions cannot reach this machine's local `dev` checkout after a remote PR merge.
- Safe local sync is feasible with a separate local helper: after PR merge, it can fetch `origin/dev`, require a clean worktree, verify fast-forward, then update local `dev`.
- Fully automatic conflict resolution is not safe for v1: upstream baselines and generated projections are supply-chain inputs, so conflicts should fail fast with a clear recovery artifact.
- Current repo state still has no `.github/workflows/`, `scripts/ci/`, or `tests/automation/`; this plan remains unimplemented as of 2026-04-30.
- Remote default branch is still `main`; `dev` still has no branch protection. Schedule should remain disabled or manual-only until protection and required checks are configured.

## File Map

- Create: `.github/workflows/upstream-refresh.yml` — scheduled/manual workflow entrypoint.
- Create: `scripts/ci/lib/upstream-heads.mjs` — upstream HEAD probing and baseline comparison.
- Create: `scripts/ci/lib/upstream-refresh.mjs` — refresh command sequencing, diff filtering, result shaping.
- Create: `scripts/ci/run-upstream-refresh.mjs` — executes refresh chain and writes `.harness/upstream-refresh-result.json`.
- Create: `scripts/ci/lib/upstream-pr.mjs` — commit eligibility, PR metadata, branch constants.
- Create: `scripts/ci/open-upstream-pr.mjs` — commit, push, create/update PR.
- Create: `scripts/local/sync-dev-after-upstream-pr.mjs` — optional local fast-forward sync helper for developer machines.
- Create: `tests/automation/upstream-refresh-workflow.test.mjs` — workflow trigger and wiring contract tests.
- Create: `tests/automation/upstream-heads.test.mjs` — HEAD probe and no-change skip tests.
- Create: `tests/automation/upstream-refresh-lib.test.mjs` — refresh sequencing and diff filtering tests.
- Create: `tests/automation/upstream-pr-lib.test.mjs` — PR helper tests.
- Create: `tests/automation/local-dev-sync.test.mjs` — local fast-forward safety tests.
- Modify: `package.json` — include automation tests in `npm run verify`.
- Modify: `docs/maintenance.md` — operator docs, failure handling, enablement checklist.

## Rollout Gates

- Gate 1: `dev` 必须先配置 branch protection / required checks，才允许启用定时 schedule。
- Gate 2: refresh 只允许提交 repo-owned upstream/projection/doc 文件；运行态文件不进入 commit。
- Gate 3: 任何冲突、verify 失败、allowlist 失败、commit 失败、PR 失败都必须使 workflow fail。
- Gate 4: 没有变更时只产出成功结果，不创建空 PR。
- Gate 5: v1 不做 auto-merge；merge 仍由受保护分支上的 reviewer/checks 决定。
- Gate 6: local dev sync 只能 fast-forward；脏工作区、本地领先、分叉、冲突全部停止并输出恢复建议。

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
Friday 20:00 Asia/Shanghai
cron: 0 12 * * 5
```

### Task 1: Add Workflow And HEAD Probe Contract Tests First

**Files:**
- Create: `tests/automation/upstream-refresh-workflow.test.mjs`
- Create: `tests/automation/upstream-heads.test.mjs`
- Create: `tests/automation/upstream-refresh-lib.test.mjs`
- Create: `tests/automation/upstream-pr-lib.test.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write workflow trigger contract**

验证 workflow 至少具备这些 contract：

```text
on:
  workflow_dispatch:
  schedule:
    - cron: '0 12 * * 5'
permissions:
  contents: write
  pull-requests: write
```

- [ ] **Step 2: Write upstream HEAD probe contract**

验证 workflow 在创建工作分支前先比较 upstream remote HEAD：

```text
git ls-remote https://github.com/obra/superpowers HEAD
git ls-remote https://github.com/OthmanAdi/planning-with-files HEAD
compare against recorded source heads or current baseline tree digest
no upstream change -> write no_changes result and skip branch/PR
upstream change -> continue refresh chain
```

- [ ] **Step 3: Write refresh sequencing contract**

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

- [ ] **Step 4: Write diff filtering contract**

验证 changed files 过滤逻辑满足：

```text
include: tracked repo-owned files
include: untracked repo-owned files
exclude: .harness/projections.json
exclude: .harness/state.json
exclude: unrelated workspace files
```

- [ ] **Step 5: Add test coverage to repo verify**

把自动化测试并入仓库验证入口：

```text
npm run verify
```

### Task 2: Implement Upstream HEAD Probe And Refresh Runner

**Files:**
- Create: `scripts/ci/lib/upstream-heads.mjs`
- Create: `scripts/ci/lib/upstream-refresh.mjs`
- Create: `scripts/ci/run-upstream-refresh.mjs`

- [ ] **Step 1: Implement upstream HEAD probe**

Load `harness/upstream/sources.json`, run `git ls-remote <url> HEAD` for each git source, and compare with a repo-owned record such as:

```text
harness/upstream/.source-heads.json
```

The record should store source name, URL, observed HEAD SHA, and timestamp from the last accepted refresh. If the HEADs match, exit with `no_changes` before branch creation.

- [ ] **Step 2: Implement branch preparation helpers**

固定使用这些常量：

```text
baseRef = origin/dev
branchName = automation/upstream-refresh
resultPath = .harness/upstream-refresh-result.json
```

- [ ] **Step 3: Implement refresh execution chain**

runner 要顺序执行：

```text
fetch -> checkout -B -> harness install -> harness fetch -> harness update -> npm run verify -> worktree-preflight -> sync --dry-run -> sync -> doctor
```

- [ ] **Step 4: Capture repo-owned changed files**

变更收集必须同时覆盖：

```text
git diff --name-only --relative HEAD
git ls-files --others --exclude-standard
```

然后合并、去重、过滤 runtime-only files。

- [ ] **Step 5: Emit machine-readable result**

无论成功或失败，都写结果文件：

```json
{
  "status": "success|failure|no_changes",
  "baseRef": "origin/dev",
  "branchName": "automation/upstream-refresh",
  "sourceHeads": {},
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

### Task 4: Implement PR Automation And Automatic Review Gate

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

- [ ] **Step 4: Request automatic review without treating it as merge approval**

Use repository rules or PR metadata to request automatic review. Acceptable v1 options:

```text
GitHub Copilot automatic review configured at repo/org level
CODEOWNERS review request for upstream refresh paths
required workflow checks as the merge gate
```

Do not let a bot review replace the user's final PR review.

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
schedule: Friday 20:00 Asia/Shanghai
cron: 0 12 * * 5
```

### Task 7: Add Optional Local Dev Sync Helper

**Files:**
- Create: `scripts/local/sync-dev-after-upstream-pr.mjs`
- Create: `tests/automation/local-dev-sync.test.mjs`
- Modify: `docs/maintenance.md`
- Optional local config: macOS LaunchAgent or manual shell alias outside the repository

- [x] **Step 1: Implement safe local preflight**

The helper must verify:

```text
current repository is this repo
current branch is dev or can switch to dev safely
worktree is clean
origin/dev exists
local dev is not ahead of origin/dev
update can be fast-forwarded
```

- [x] **Step 2: Execute only fast-forward sync**

Allowed command shape:

```text
git fetch origin dev
git checkout dev
git merge --ff-only origin/dev
```

If this fails, stop and print recovery instructions. Do not stash, rebase, or resolve conflicts automatically in v1.

- [x] **Step 3: Trigger the helper explicitly**

Recommended v1 activation is manual or local scheduled polling. GitHub Actions cannot directly trigger it on this machine. Optional approaches:

```text
manual: node scripts/local/sync-dev-after-upstream-pr.mjs
local schedule: macOS LaunchAgent that runs the helper after expected PR merge windows
advanced: local webhook listener, only if the machine is intentionally exposed or tunneled
```

- [x] **Step 4: Document conflict boundaries**

Document that local conflicts are not automatically resolved. The helper should create a clear terminal report with:

```text
current branch
local HEAD
origin/dev HEAD
reason sync stopped
manual recovery command suggestions
```

## Self-Review

- Spec coverage: 本 companion plan 覆盖 schedule、HEAD 探测、branch source、冲突分流、branch protection 前置条件、详细执行清单、本地 dev 同步边界和文档同步。
- Placeholder scan: passed; 时区、cron、冲突语义、启用顺序都已具体化。
- Type consistency: HEAD probe / refresh runner / PR runner / workflow / local sync helper / docs 的职责边界一致，task memory 与 companion plan 的边界已分离。
