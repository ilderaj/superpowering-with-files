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
