# Findings

## Current Facts
- `github-actions-upstream-automation-analysis` 已关闭，且 2026-05-06 审计再次确认主线实现、远端 variable、`dev` protection、最新 manual rehearsal 都仍然成立。
- 下一次 weekly schedule 理论触发时间是 **2026-05-08 20:00 Asia/Shanghai**（GitHub cron `0 12 * * 5`）。
- 旧 worktree `/Users/jared/.config/superpowers/worktrees/SuperpoweringWithFiles/20260503-upstream-refresh-rehearsal-fix` 当前为脏状态，保留了一次失败 refresh 的未提交产物和 result file。
- 当前 `npm run verify` 共有 7 个失败：
  - `tests/adapters/sync-skills.test.mjs`：`~/.harness/backups` 写权限相关 `EPERM`
  - `tests/installer/worktree-name.test.mjs`：4 个断言失败
  - `tests/installer/worktree-preflight.test.mjs`：2 个断言失败

## Task Boundary
- 这三个问题面不应继续挂在同一个 closed task 下：
  - scheduled run 跟踪是运营/验证任务
  - stale worktree 处置是现场治理任务
  - verify failures 是代码/测试修复任务
- `worktree-naming-governance` 虽然相关，但已关闭；当前回归需要新的修复 task 来重新取证、修正和验证。

## Pending Decisions For Review
1. 首次 scheduled run 跟踪是否在 run 后直接处理产出的 PR / failure artifact，还是先只做观察和记录。
2. stale worktree 是保留为失败现场，还是在补齐证据后清理。
3. verify repair 是否优先在隔离 worktree 中执行，以避免主工作区多 active tasks 和本地 HOME 污染继续干扰断言。
