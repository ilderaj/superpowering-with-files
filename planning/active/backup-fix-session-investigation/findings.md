# Findings

- 丢失的 implementation plan 并没有“凭空消失”，而是被保存进 migration stash 的 untracked-files snapshot：`stash@{0}` 的第三父提交正是 `00fcaec6d26e34f1e61de6877afa2dd862b78ac2`。
- `00fcaec6` 包含：
  - `docs/superpowers/plans/2026-04-26-backup-conflict-governance-plan.md`
  - `planning/active/backup-skills-duplicate-analysis/{task_plan,findings,progress}.md`
- `00fcaec6` 既不是 `dev` 的祖先，也不是 `copilot/superpowers-execution-merge-commit` 的祖先；因此这些文件从未真正进入目标分支历史。
- `copilot/superpowers-execution-merge-commit` 这条 branch/worktree 的本地历史显示，它是从 `52c61a4 merge: integrate companion lifecycle sync` 创建出来的，随后 fast-forward 到 `f63c96e`，最后提交了 `e4229fa docs: close companion sync task`。它的有效工作内容始终围绕 `companion-plan-sync-constraints`，不是 backup duplicate 修复。
- 当前 planning 记录里对 `/Users/jared/SuperpoweringWithFiles.worktrees/copilot-superpowers-execution-merge-commit` 的引用，全部来自 `planning/active/companion-plan-sync-constraints/`，进一步说明这个 worktree 在仓库视角上是 companion-sync 收尾 worktree，而不是 backup-fix worktree。
- 目前证据更支持“错误上下文/复用 generic execution-merge-commit worktree + migration stash 把未跟踪计划文件收走”，而不是“backup 修复本身做了但没生效”。

## Current Hypothesis

- 根因不是单纯的 worktree 名称重复，而是 task-agnostic 的 generic worktree/branch 命名与迁移流程组合在一起，导致：
  1. session 落到了已经绑定 companion-sync 收尾上下文的 execution-merge-commit worktree；
  2. backup-fix 的 planning/plan 文件当时还是主 `dev` 上的未跟踪文件；
  3. worktree 迁移时这些未跟踪文件被收入 stash snapshot，而没有被应用/提交到新的执行分支；
  4. 后续执行者继续按照该 worktree 里已有的 companion-sync planning 收口，最终自然不会产出 backup duplicate 修复。

## Proposed Prevention

- worktree / branch 命名必须 task-scoped，而不是复用 `copilot-superpowers-execution-merge-commit` 这类 task-agnostic 名称。建议强制把 task id 编进 worktree path、branch name、checkpoint label 和 session summary。
- 在“按 plan 执行”入口增加一致性校验：如果传入的 plan path 指向 `backup-conflict-governance`，但当前 worktree 的 active task / branch / companion plan 指向 `companion-plan-sync-constraints`，则直接阻断执行。
- 在 worktree migration / reuse 前，先把用户明确要求的 plan 与 planning 文件写入并纳入目标 branch，不能只让它们停留在主 checkout 的 untracked 状态。
- 对 migration stash 增加可见性：如果把 plan/task files 收进 `stash^3`，应该在终端输出中明确列出，并要求执行者先恢复这些文件再继续，而不是静默继续原上下文。
- 在 closeout / cleanup 前做 task-boundary review：确认 worktree 中最近一次 active planning 更新、companion plan 路径、待执行 plan 路径三者一致，避免“在 A 任务的收尾 worktree 里执行 B 任务 plan”。