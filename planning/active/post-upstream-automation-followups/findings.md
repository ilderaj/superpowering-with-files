# Findings

## Current Facts
- `github-actions-upstream-automation-analysis` 已关闭，且 2026-05-06 审计再次确认主线实现、远端 variable、`dev` protection、最新 manual rehearsal 都仍然成立。
- 下一次 weekly schedule 理论触发时间是 **2026-05-08 20:00 Asia/Shanghai**（GitHub cron `0 12 * * 5`）。
- 首次 scheduled run 观察已通过 thread heartbeat `watch-first-upstream-refresh-scheduled-run` 排队。

## Task Boundary
- 这三个问题面不应继续挂在同一个 closed task 下：
  - scheduled run 跟踪是运营/验证任务
  - stale worktree 处置是现场治理任务
  - verify failures 是代码/测试修复任务
- `worktree-naming-governance` 虽然相关，但已关闭；当前回归需要新的修复 task 来重新取证、修正和验证。

## 2026-05-06 Execution Update
- 2026-05-06 再次查询 GitHub 远端，结果未漂移：
  - 默认分支仍为 `main`
  - `dev` protection 仍要求 `1` 个 approval、resolved conversations，并禁用 force push/deletion
  - `UPSTREAM_REFRESH_SCHEDULE_ENABLED` 仍为 `true`
  - 最近 5 次 `upstream-refresh.yml` run 仍全部是 `workflow_dispatch`，最新成功 run 仍是 `25295497835`
- 已创建 thread heartbeat automation：`watch-first-upstream-refresh-scheduled-run`
  - schedule: 每周五 20:05（线程 locale）
  - purpose: 在首次 scheduled run 窗口后自动回到本线程，检查 `schedule` 事件 run 是否成功、是否 no_changes、是否创建/更新 PR，或是否需要下载 failure artifact

## Stale Worktree Evidence Captured
- stale worktree 路径：`/Users/jared/.config/superpowers/worktrees/SuperpoweringWithFiles/20260503-upstream-refresh-rehearsal-fix`
- branch：`copilot/20260503-upstream-refresh-layout-compat-dev`
- 当前 worktree 中既有 tracked upstream baseline diff，也有大量 untracked projection / upstream refresh 产物。
- `git diff --stat` 显示当前 tracked diff 只集中在 `AGENTS.md` 与 `harness/upstream/superpowers/**` 7 个文件；这不是当前主线待合并实现，而是失败 refresh 后遗留的工作树状态。
- `.harness/upstream-refresh-result.json` 已确认：
  - `status = failure`
  - `baseRef = origin/dev`
  - `branchName = automation/upstream-refresh`
  - `blockedReason` 包含 `npm run verify` failure，并附带 `.planning/**` 与 `CLAUDE.md` allowlist violation
- 本地 branch `copilot/20260503-upstream-refresh-layout-compat-dev` 存在对应远端，因此清理本地现场不会抹掉远端提交历史。

## 2026-05-06 Execution Completion
- 已创建 checkpoint：`/Users/jared/.agent-config/checkpoints/SuperpoweringWithFiles/2026-05-06T03-36-52Z`。
- stale rehearsal worktree 已删除，本地 branch `copilot/20260503-upstream-refresh-layout-compat-dev` 也已删除；远端历史保持不变。
- 独立 repair task 已修复原始 `7` 个 verify 失败：
  - `worktree-name` / `worktree-preflight` 的真实根因是 session env precedence 过强，`CODEX_THREAD_ID` 在没有对应 active task 目录时仍抢占了解析链。
  - `sync-skills` 的 `EPERM` 是测试环境未隔离 `HOME`，不是产品逻辑回归。
- 主工作区最新验证结果为 `npm run verify => 319 pass / 0 fail`，因此后续 followup 不再受这 7 个失败阻塞。
- 当前唯一剩余事项是 heartbeat 在 2026-05-08 20:05 Asia/Shanghai 续跑，观察首次 `schedule` 事件 run。

## 2026-05-08 Manual Run Failure
- 用户于 2026-05-08 手动触发 `Upstream Refresh #6`，run id `25539563928`，事件类型 `workflow_dispatch`。
- 失败 job 为 `Refresh upstream baselines`，失败 step 为 `Run upstream refresh`。
- 根因不是 refresh contract 本身漂移，而是最新 upstream `superpowers` 改写了两个 skill 结构，导致本地 patch 锚点失效：
  - `finishing-a-development-branch`
  - `using-git-worktrees`
- 已单开 repair task：`planning/active/upstream-refresh-6-failure-repair/`。

## 2026-05-08 Scheduled Run Observation
- heartbeat 触发时间：`2026-05-08T13:06:58.413Z`，即 **2026-05-08 21:06:58 Asia/Shanghai**。
- 到该时点为止：
  - `upstream-refresh.yml` workflow 仍为 `state = active`
  - `UPSTREAM_REFRESH_SCHEDULE_ENABLED = true`
  - 仓库级 `event = schedule` Actions runs 总数仍为 `0`
  - `upstream-refresh.yml` 最近 runs 仍全部是 `workflow_dispatch`
- 结论：首次“真实 scheduled run”并没有在预期窗口内触发；这不是失败 run，而是根本没有生成 `schedule` 事件记录。

## 2026-05-08 First Real Scheduled Run (`#7`)
- 后续又出现了首次真实 `event = schedule` 的 run：
  - run id：`25559163029`
  - createdAt：`2026-05-08T13:47:40Z`，即 **2026-05-08 21:47:40 Asia/Shanghai**
  - conclusion：`failure`
- 这说明 GitHub schedule 触发存在明显延迟；`21:06` 的 heartbeat 观察只是一张时间点快照，不能直接当作“当天不会触发”的最终结论。
- 失败结构与 `#6` 已明显不同：
  - `Run upstream refresh` 已成功
  - 失败 step 变成 `Open upstream refresh pull request`
- failed log 的最小根因是：
  - `gh pr create failed: spawn E2BIG`
- `upstream-refresh-result` artifact 已确认：
  - `status = success`
  - `eligibleFiles.length = 1737`
- 结论：
  - 首次真实 scheduled run 已经证明 `#6` 的 patch 兼容性修复解除了一阶阻塞
  - 当前新的剩余问题在 PR 打开路径，而不是 refresh 主链路
  - 该问题已并入 `planning/active/upstream-refresh-6-failure-repair/`，不再单开新的 followup task

## 2026-05-08 Manual Rerun After Push
- 用户已把第一轮 PR-opening 修复推到 `origin`，随后手动触发 run `25562079399`。
- 这次 rerun 进一步确认：
  - `spawn E2BIG` 已经消失
  - refresh 主链路与 result artifact 上传/读取都已恢复
  - 新的剩余失败点是固定 automation branch 的远端状态机：
    - 远端 `automation/upstream-refresh` 分支仍存在
    - 但仓库里没有对应 open PR
    - 当前 create path 仍尝试 `git push --set-upstream`，因此被 non-fast-forward 拒绝
- 该问题仍属于同一 repair chain，已继续在 `upstream-refresh-6-failure-repair` 中处理。

## 2026-05-08 Remote State After Second Push
- 第二轮代码修复已经进入 `origin/dev` 并通过远端 rerun 验证到最后一层。
- 当前链路中的最终 blocker 不再是代码，而是 repo 级 GitHub Actions policy：
  - `gh pr create` 被拒绝，错误为：
    - `GitHub Actions is not permitted to create or approve pull requests (createPullRequest)`
  - 仓库 workflow-permissions 快照为：
    - `default_workflow_permissions = read`
    - `can_approve_pull_request_reviews = false`
- 这意味着 followup 任务的代码侧目标已经基本完成；剩余的是 human 级仓库设置操作。

## 2026-05-08 After Repo Setting Enablement
- repo setting 已确认生效后，新的 rerun `25562792583` 证明：
  - Actions PR policy blocker 已经解除
  - 但 upstream refresh 仍未完全恢复，因为 refresh step 现在会跑到更深的验证面
- 新暴露的问题不是 PR policy，而是：
  - workflow 没有先 `npm ci`
  - Python `__pycache__/*.pyc` 被误判为 refresh allowlist violation
- 这两项都已继续并入同一个 repair task 处理。

## 2026-05-09 Production Path Clarification
- repair task 后续已确认：
  - 本地 `npm ci` 后，`npm run verify` 已恢复为 `360 pass / 0 fail / 1 skipped`
  - `npm ci` + Python cache filtering 相关修复已经在 `origin/dev`
- 但从 `main` 手动触发的新 run `25563477358` 仍失败，这不是 repair 回退，而是发布路径尚未收口：
  - `origin/main` 的 `upstream-refresh.yml` 仍未包含 `Install dependencies`
  - `origin/dev` 的 `upstream-refresh.yml` 才包含该修复
- 因此 followup 视角下的当前剩余事项已经收敛为一件事：
  - 让 `main` 接到 `origin/dev @ 60b2224e5e2fd9184f76de5c8d86993f1fb18310`
  - 然后再验证 `workflow_dispatch --ref main` / 真实 `schedule` 路径

## 2026-05-09 Followup Closure
- 用户随后已将修复合入 `main`，并由 agent 从 `main` 成功重跑 production path：
  - run id：`25583701010`
  - conclusion：`success`
- 这次 run 证明 followup task 关心的两件事都已收口：
  - `main` 确实拿到了修复后的 workflow 与 refresh 代码
  - production path 不仅 refresh 成功，而且成功创建/更新了 upstream refresh PR
- 当前可见产物：
  - open PR `#45 chore: refresh upstream baselines`
  - head: `automation/upstream-refresh`
  - base: `dev`
- 后续又继续完成了 repo-local entry files refresh 风险的收口：
  - `main` 先后通过 `#46`、`#47`、`#48` 三个微型 hotfix 修复 PR body 过大、repo-local entry exclusion、以及 tracked/untracked restore 分流问题
  - 最终 production rerun `25604752525` 成功
  - `#45 chore: refresh upstream baselines` 已成功合并
- 因此本 task 已不再有剩余执行项，可转为 closed/archive-eligible。
