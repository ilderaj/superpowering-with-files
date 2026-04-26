# backup 修复 session 跑偏调查

## Current State
Status: active
Archive Eligible: no
Close Reason:

## Goal
查清 `copilot-superpowers-execution-merge-commit` 这个 session 为什么没有把 duplicate backup 修复真正落到 `dev`，判断是 worktree 命名冲突、branch/worktree 复用、迁移 stash 机制，还是其它流程问题，并给出避免复发的治理方案。

## Phases
1. 恢复丢失的 backup duplicate planning 与 implementation plan。
2. 还原执行 session 的 branch/worktree/stash 时间线。
3. 判断根因，并区分“命名问题”与“上下文/迁移机制问题”的主次。
4. 给出预防方案，并把结论同步回 planning 文件。

## Constraints
- 当前阶段只调查和恢复计划，不直接修改实现代码。
- 所有结论必须基于 git history、reflog、stash、planning 文件和现存 worktree 状态。

## Related Artifacts
- Restored companion plan: `docs/superpowers/plans/2026-04-26-backup-conflict-governance-plan.md`
- Restored active task: `planning/active/backup-skills-duplicate-analysis/`