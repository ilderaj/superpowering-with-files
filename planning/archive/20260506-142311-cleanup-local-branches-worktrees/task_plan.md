# Cleanup Local Branches And Worktrees

## Current State
Status: closed
Archive Eligible: yes
Close Reason: 清理完成，本地只保留 `main` 和 `dev`，额外 worktree 已移除。

## Goal
清理当前仓库中除 `main` 和 `dev` 之外的本地分支与本地 worktree，并保留可回滚记录。

## Scope
- 删除当前仓库的本地分支，保留 `main` 与 `dev`。
- 删除当前仓库关联的额外本地 git worktree。
- 不删除远端分支。
- 在执行前完成 checkpoint 和风险落盘。

## Phases
1. 盘点 worktree 与分支状态。状态：complete
2. 风险评估与 checkpoint。状态：complete
3. 执行清理。状态：complete
4. 验证与收尾。状态：complete

## Decisions
- 用户明确要求清理本地 `main/dev` 以外的分支和 worktree。
- 对未并入 `dev`/`main` 的分支，仍按用户要求删除，但必须先记录 checkpoint 和 rollback 路径。
- 仅清理本地分支和本地 worktree，不触碰任何远端分支。

## Risk Assessment

| 风险 | 触发条件 | 影响范围 | 缓解 / 已落盘的回退方案 |
|---|---|---|---|
| 删除未并入 `dev/main` 的本地分支或移除额外 worktree，导致本地引用消失 | 执行 `git worktree remove /Users/jared/.config/superpowers/worktrees/SuperpoweringWithFiles/fix-checkpoint-adoption && git branch -D 202604281445-copilot-usage-billing-impact-analysis-001 chore/checkpoint-push-smoke-1777131129 copilot/subagent-dev-deploy-verify copilot/subagents-plan-execution copilot/superpowers-execution-merge-commit copilot/superpowers-execution-plan copilot/using-subagents-for-plans copilot/using-superpowers-execution-plan copilot/worktree-superpowers-execution fix/checkpoint-adoption readme-slim-pr` | 当前仓库本地 refs，以及一个位于 `/Users/jared/.config/superpowers/worktrees/...` 的仓库 worktree；不触及远端分支 | 已创建 checkpoint：`/Users/jared/.agent-config/checkpoints/SuperpoweringWithFiles/2026-04-30T09-56-21Z`。回滚时从 checkpoint 恢复 `.git`/工作树快照，或按 checkpoint 中记录的 refs 重新创建本地分支与 worktree；详细 rollback 已写入 `progress.md`。 |

## Verification Results
| Command | Result |
|---|---|
| `git worktree list` | pass: only `/Users/jared/SuperpoweringWithFiles [dev]` remains |
| `git for-each-ref --format='%(refname:short)' refs/heads` | pass: only `dev` and `main` remain |
| `test -d /Users/jared/.config/superpowers/worktrees/SuperpoweringWithFiles/fix-checkpoint-adoption && echo exists || echo removed` | pass: `removed` |
