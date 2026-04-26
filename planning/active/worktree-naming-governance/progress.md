# Progress: Worktree Naming Governance

## Session Log

### 2026-04-26（分析）
- 读取 `using-superpowers`、`brainstorming`、`planning-with-files`、`writing-plans` 技能，确认本次属于 tracked planning task。
- 复核当前 worktree 相关实现与文档：
  - `harness/installer/commands/worktree-preflight.mjs`
  - `harness/upstream/superpowers/skills/using-git-worktrees/SKILL.md`
  - `harness/upstream/planning-with-files/scripts/planning_paths.py`
  - `docs/maintenance.md`
- 确认现状问题：当前 code path 没有统一的 branch / worktree naming contract；“像是取 prompt 第一话”不是 Harness 实现，而是上层 agent 的自由发挥空间。

### 2026-04-26（方案收敛）
- 对比三类路径：纯 task slug、纯 policy 文案、repo-owned helper + projection patch。
- 收敛推荐方案：以 planning task id 派生 canonical run label `YYYYMMDDHHMM-<task-slug>-NNN`，并通过 repo-owned helper 与 projected `using-git-worktrees` patch 在多 IDE 间统一。
- 明确 upstream safety 边界：不改 `harness/upstream/**`，所有机械支持落在 `harness/installer/**`、`harness/core/**`、文档与测试。

### 2026-04-26（文档落盘）
- 新建 task-scoped planning 目录：`planning/active/worktree-naming-governance/`
- 新建设计文档：`docs/superpowers/specs/2026-04-26-worktree-naming-governance-design.md`
- 新建 implementation plan：`docs/superpowers/plans/2026-04-26-worktree-naming-governance.md`
- 将 companion artifact 路径、摘要与 review 状态写回 task-scoped planning files。

### 2026-04-26（校验）
- 运行 `git --no-pager diff --check -- ...` 校验新增文件；无 whitespace / patch formatting 问题。
- 运行 `git status --short -- planning/active/worktree-naming-governance docs/superpowers/specs/2026-04-26-worktree-naming-governance-design.md docs/superpowers/plans/2026-04-26-worktree-naming-governance.md`，确认新增范围仅包含本次 task-scoped planning、design、implementation plan 文件。

## Files Changed

- `planning/active/worktree-naming-governance/task_plan.md`
- `planning/active/worktree-naming-governance/findings.md`
- `planning/active/worktree-naming-governance/progress.md`
- `docs/superpowers/specs/2026-04-26-worktree-naming-governance-design.md`
- `docs/superpowers/plans/2026-04-26-worktree-naming-governance.md`

## Verification

| Check | Command | Expected | Status |
|-------|---------|----------|--------|
| Planning artifact whitespace check | `git --no-pager diff --check -- planning/active/worktree-naming-governance docs/superpowers/specs/2026-04-26-worktree-naming-governance-design.md docs/superpowers/plans/2026-04-26-worktree-naming-governance.md` | 新增文件没有 diff formatting / whitespace 问题 | pass |
| Planning artifact scope check | `git status --short -- planning/active/worktree-naming-governance docs/superpowers/specs/2026-04-26-worktree-naming-governance-design.md docs/superpowers/plans/2026-04-26-worktree-naming-governance.md` | 新增范围仅包含本次 planning/design/plan 文件 | pass |

## Open Questions For Review

1. branch name 是否保留 agent namespace（如 `copilot/`、`codex/`、`fix/`）作为可选前缀，还是要求 branch 和 worktree basename 完全相同？
2. sequence `NNN` 是否应按“同一 task 全局递增”处理，还是只在同一分钟时间戳下递增？当前推荐是按同一 task 全局递增，更利于阅读与审计。
3. preflight 是否应默认直接显示 suggested name，还是先新增独立 helper，再让 skill/policy 调它？当前推荐是 helper 为 source of truth，preflight 再复用 helper 输出。

## Next Step

- 等待用户 review design / implementation plan；如方案方向认可，再进入实现。