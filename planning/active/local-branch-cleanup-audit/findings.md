# Findings & Decisions

## Requirements
- 检查所有本地分支。
- 审计分支当前状态与用途。
- 评估“清理本地分支”的方案，不直接删除。

## Research Findings
- 当前主工作区位于 `dev`，`git status --short --branch` 显示 `dev...origin/dev [ahead 1]`。
- 当前工作区还存在未提交改动：`.codex-worktrees/202605061308-roadmap-v1-4-safety-overlay-governance-002`。
- 这次 `ahead 1` 需要在审计中单独判断其是否仅由 planning / meta 变更构成，避免误导对分支活跃度的判断。
- 已执行 `git fetch --all --prune`，审计基于最新远端引用。
- 当前共有 `19` 个本地分支：
  - 保留主线：`dev`、`main`
  - `backup/*`：3 个
  - `codex/*`：8 个
  - `copilot/*`：3 个
  - 其他：`automation/upstream-refresh` 1 个
- 当前共有 `11` 个 worktree：
  - 主工作区 `dev`
  - `main` worktree 1 个
  - 额外 branch-bound worktree 8 个
  - detached worktree 1 个：`/Users/jared/.config/superpowers/worktrees/SuperpoweringWithFiles/20260503-upstream-refresh-main-promotion @ 6281a9c`
- `dev` 相对 `origin/dev` 的 ahead 1 提交是 `56e3a55 Fix active-summary test fixture directory creation`，内容只新增了 `planning/active/branch-head-sync-latest/` 三件套，不包含产品/脚本代码差异。
- 已同时并入 `dev` 与 `main`、且当前不被 worktree 占用的分支：
  - `backup/pr41-dev-before-main-merge-20260506`
  - `codex/202605060339-verify-worktree-naming-regressions-001`
  - `codex/202605070150-roadmap-v1-4-safety-overlay-governance-003`
  - `codex/202605070210-roadmap-v1-5-workflow-productization-001`
  - `codex/202605070235-roadmap-v1-6-release-readiness-001`
  - `copilot/20260503-upstream-refresh-rehearsal-fix-dev`
  - `automation/upstream-refresh` 也已并入两条主线，但它在 active followup 任务中仍作为固定 automation branch name 被引用，适合列入 review 候选而不是第一批直接删。
- 已同时并入 `dev` 与 `main`、但仍被 clean worktree 占用的分支：
  - `copilot/202604301444-github-actions-upstream-automation-analysis-001`
  - `copilot/20260504-upstream-refresh-rehearsal-final-fix-dev`
  - `codex/202605060906-roadmap-v1-1-planning-hygiene-001`
  - `codex/202605061018-roadmap-v1-1-planning-hygiene-001`
  - `codex/202605061025-roadmap-v1-2-cross-ide-closure-001`
  - `codex/202605061218-roadmap-v1-3-context-budget-governance-001`
  - `codex/202605061308-roadmap-v1-4-safety-overlay-governance-001`
- `codex/202605061308-roadmap-v1-4-safety-overlay-governance-002` 对应的仓内 fallback worktree 有大量未提交修改，并且仍被 active task `roadmap-v1.4-safety-overlay-governance` 明确引用，当前不可清理。
- `backup/dev-before-origin-align-20260504` 未并入 `dev/main`，属于纯本地恢复点。
- `backup/main-before-dev-sync-20260508-1125` 已被 `main` 包含，但它是今天新建的回退点，时间上过近，不建议立刻删。
- `codex/202605061018-roadmap-v1-1-planning-hygiene-001` 的 upstream 配置异常：本地分支跟踪的是 `origin/dev` 而不是同名 `origin/codex/*` 分支，且当前 `behind 23`；这更像 stale worktree 遗留，不像还在维护中的 feature branch。
- detached worktree `20260503-upstream-refresh-main-promotion @ 6281a9c` 不绑定本地分支，且该提交已被 `dev/main` 和多个 roadmap 分支包含；它不阻塞分支删除，但本身是明确的本地清理候选。
- 执行完成后的剩余本地分支只有 6 个：
  - `automation/upstream-refresh`
  - `backup/dev-before-origin-align-20260504`
  - `backup/main-before-dev-sync-20260508-1125`
  - `codex/202605061308-roadmap-v1-4-safety-overlay-governance-002`
  - `dev`
  - `main`
- 执行完成后的剩余 worktree 只有 3 个：
  - 主工作区 `dev`
  - `main` worktree
  - 仓内 fallback worktree `codex/202605061308-roadmap-v1-4-safety-overlay-governance-002`
- `codex/...-002` worktree 仍然脏，且 active task 引用仍在，保留策略没有变化。

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| 分支审计必须同时看 local refs、remote tracking、worktree 占用与历史任务语义 | 仅看 `git branch --merged` 会漏掉恢复点、占用分支与未推远端分支 |
| 将清理候选按“三档”分层而不是只按 merged / not merged 二分 | 本仓库大量 stale refs 来自已归档任务 worktree，真正的风险边界在于是否被占用、是否仍承载恢复语义、是否仍被 active task 引用 |
| 执行时继续保留 `automation/upstream-refresh` | 它在 active followup task 中仍被明确引用为固定 automation branch name，先不与纯 stale 分支混删 |

## Issues Encountered
| Issue | Resolution |
|-------|------------|
| `dev` ahead 1 容易被误判为代码未同步 | 复核该 commit 仅包含 `branch-head-sync-latest` planning 三件套，单独标记为 planning-only 漂移 |

## Destructive Operations Log
| Command | Target | Checkpoint | Rollback |
|---------|--------|------------|----------|
| `./scripts/harness checkpoint . --quiet` | 当前仓库快照 | `/Users/jared/.agent-config/checkpoints/SuperpoweringWithFiles/2026-05-08T03-39-41Z` | n/a |
| `git worktree remove <detached/main-promotion>` | detached worktree `/Users/jared/.config/superpowers/worktrees/SuperpoweringWithFiles/20260503-upstream-refresh-main-promotion` | `/Users/jared/.agent-config/checkpoints/SuperpoweringWithFiles/2026-05-08T03-39-41Z` | restore from checkpoint or recreate worktree at `6281a9c` |
| `git worktree remove <tier-2 clean worktrees>` | 7 clean branch-bound worktrees | `/Users/jared/.agent-config/checkpoints/SuperpoweringWithFiles/2026-05-08T03-39-41Z` | restore from checkpoint or recreate worktrees from surviving refs / remotes |
| `git branch -D <tier-1 + tier-2 branches>` | 13 local branches | `/Users/jared/.agent-config/checkpoints/SuperpoweringWithFiles/2026-05-08T03-39-41Z` | restore refs from checkpoint, or recreate from `origin/*` when remote still exists |

## Resources
- `/Users/jared/SuperpoweringWithFiles/planning/archive/20260506-142311-cleanup-local-branches-worktrees/`
- `/Users/jared/SuperpoweringWithFiles/.git`
