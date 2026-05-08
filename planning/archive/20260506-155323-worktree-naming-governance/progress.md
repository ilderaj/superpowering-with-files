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

### 2026-04-26（执行）
- 用户已批准直接执行 companion plan，并要求完成 verify、merge back 到本地 `dev`、commit、push。
- 当前执行工作区：`copilot/using-superpowers-execution-plan` worktree。
- 执行策略：沿用 companion plan 的 task 顺序，先写失败测试，再补实现，再做 focused verification 与全量 verification。
- 已实现 `worktree-name` helper / CLI / `worktree-preflight` naming reuse / projected `using-git-worktrees` patch / policy and operator docs sync。
- focused verification slices:
  - `npm test -- tests/installer/commands.test.mjs tests/installer/worktree-name.test.mjs`
  - `npm test -- tests/installer/worktree-preflight.test.mjs tests/installer/worktree-name.test.mjs`
  - `npm test -- tests/adapters/skill-projection.test.mjs tests/adapters/sync-skills.test.mjs`
  - `npm test -- tests/adapters/skill-projection.test.mjs tests/adapters/sync-skills.test.mjs tests/installer/commands.test.mjs tests/installer/worktree-name.test.mjs tests/installer/worktree-preflight.test.mjs`
- live repo smoke:
  - `./scripts/harness worktree-name --task worktree-naming-governance --namespace copilot --json`
  - `./scripts/harness worktree-preflight --task worktree-naming-governance --json`
- full verification:
  - `npm run verify`
  - `./scripts/harness sync --dry-run`
  - `./scripts/harness doctor --check-only`
- code review caught one real issue: empty namespace was being normalized to `default/`; added regression assertion and fixed `sanitizeNamespace()` to preserve the bare canonical label.
- live repo smoke caught one integration issue: `worktree-preflight` needed explicit `--task` pass-through in multi-active-task repos; added regression test and fixed command parsing.
- merged branch `copilot/using-superpowers-execution-plan` into local `dev` with commit `f933748`, then prepared task closure on `dev`.

## Files Changed

- `harness/installer/lib/worktree-name.mjs`
- `harness/installer/commands/worktree-name.mjs`
- `harness/installer/lib/superpowers-using-git-worktrees-patch.mjs`
- `planning/active/worktree-naming-governance/task_plan.md`
- `planning/active/worktree-naming-governance/findings.md`
- `planning/active/worktree-naming-governance/progress.md`
- `docs/superpowers/specs/2026-04-26-worktree-naming-governance-design.md`
- `docs/superpowers/plans/2026-04-26-worktree-naming-governance.md`
- `harness/installer/commands/harness.mjs`
- `harness/installer/commands/worktree-preflight.mjs`
- `harness/installer/commands/sync.mjs`
- `harness/core/skills/index.json`
- `harness/core/policy/base.md`
- `harness/core/skills/safe-bypass-flow/SKILL.md`
- `tests/installer/commands.test.mjs`
- `tests/installer/worktree-name.test.mjs`
- `tests/installer/worktree-preflight.test.mjs`
- `tests/adapters/skill-projection.test.mjs`
- `tests/adapters/sync-skills.test.mjs`
- `README.md`
- `docs/maintenance.md`
- `docs/release.md`
- `docs/safety/vibe-coding-safety-manual.md`
- `docs/install/codex.md`
- `docs/install/copilot.md`
- `docs/install/cursor.md`
- `docs/install/claude-code.md`

## Verification

| Check | Command | Expected | Status |
|-------|---------|----------|--------|
| Planning artifact whitespace check | `git --no-pager diff --check -- planning/active/worktree-naming-governance docs/superpowers/specs/2026-04-26-worktree-naming-governance-design.md docs/superpowers/plans/2026-04-26-worktree-naming-governance.md` | 新增文件没有 diff formatting / whitespace 问题 | pass |
| Planning artifact scope check | `git status --short -- planning/active/worktree-naming-governance docs/superpowers/specs/2026-04-26-worktree-naming-governance-design.md docs/superpowers/plans/2026-04-26-worktree-naming-governance.md` | 新增范围仅包含本次 planning/design/plan 文件 | pass |
| Task 1 focused TDD slice | `npm test -- tests/installer/commands.test.mjs tests/installer/worktree-name.test.mjs` | helper / CLI contract turns green | pass |
| Task 2 focused TDD slice | `npm test -- tests/installer/worktree-preflight.test.mjs tests/installer/worktree-name.test.mjs` | preflight naming reuse turns green | pass |
| Task 3 focused projection slice | `npm test -- tests/adapters/skill-projection.test.mjs tests/adapters/sync-skills.test.mjs` | child patch planning/materialization stay green | pass |
| Doc / projection verification slice | `npm test -- tests/adapters/skill-projection.test.mjs tests/adapters/sync-skills.test.mjs tests/installer/commands.test.mjs tests/installer/worktree-name.test.mjs tests/installer/worktree-preflight.test.mjs` | doc-linked regression surface stays green | pass |
| Full repository verification | `npm run verify` | repository test suite stays green | pass |
| Live helper smoke | `./scripts/harness worktree-name --task worktree-naming-governance --namespace copilot --json` | emits canonical label + branch name from planning task identity | pass |
| Live preflight smoke | `./scripts/harness worktree-preflight --task worktree-naming-governance --json` | emits separate naming object without changing base recommendation | pass |
| Projection preview | `./scripts/harness sync --dry-run` | no unexpected projection drift | pass |
| Health check | `./scripts/harness doctor --check-only` | no new health regressions from this task | pass |

## Open Questions For Review

1. 现有 `doctor` 仍会报告另一个无关 task（`companion-plan-sync-constraints`）的 companion-plan back-reference warning；本次 task 自身的 warning 已修复。

## Next Step

- Push `dev` to `origin`.
