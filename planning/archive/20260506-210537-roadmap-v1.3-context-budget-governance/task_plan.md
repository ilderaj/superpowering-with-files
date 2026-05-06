# Task Plan: Roadmap v1.3 Context Budget Governance

## Current State
Status: closed
Archive Eligible: yes
Close Reason: Version scope completed and merged back into dev under roadmap v1.3.
Closed At: 2026-05-06T21:05:37

## Goal

执行 `docs/roadmap.md` 的 `v1.3`，把 context budget、skill discovery、duplicate-skill dedupe、RTK feasibility 以及 generic brief/hot context regression 统一成可执行治理，并关闭或归档相关 active task。

## Scope

- 在不覆盖并发修改的前提下接续 `global-rule-context-load-analysis`。
- 完成 `rtk-support-feasibility-analysis` 的剩余报告闭环，并转成 roadmap 决策。
- 将 TypeMint/Copilot duplicate-skill 结论落成 realpath-aware dedupe / doctor warning。
- 为 generic target brief/hot context regression 增加行为级保护，避免 full HOT CONTEXT 回流。
- 在隔离 worktree 中完成开发、验证、merge back、push 和 closeout。

## Execution Source

- Master execution plan: `docs/superpowers/plans/2026-05-06-roadmap-implementation-plan.md`
- Section: `## 6. v1.3: Context Budget And Skill Discovery Governance`
- Sync-back status: closed after merge-back and roadmap closeout on `dev`.

## Current Phase

Phase 4: Task closeout

## Phases

### Phase 1: Discovery and boundary check
- [x] 复核 `global-rule-context-load-analysis` 的并发修改边界
- [x] 核对 `rtk-support-feasibility-analysis` 的剩余缺口
- [x] 提取 duplicate-skill 与 brief/hot context 的既有 archived findings
- [x] 记录 worktree base、branch 和执行边界
- **Status:** complete

### Phase 2: Implementation in isolated worktree
- [x] 落地 budget ledger / policy / doctor / verify 变更
- [x] 落地 duplicate-skill dedupe 和 generic brief/hot context regression 修复
- [x] 更新相关文档与 planning records
- **Status:** complete

### Phase 3: Verification and integration
- [x] 运行 focused tests、`npm run verify`、`./scripts/harness verify --output=stdout`、`./scripts/harness doctor --check-only`
- [x] 提交版本实现与验证记录
- [x] merge back 到本地 `dev` 并 push `origin/dev`
- **Status:** complete

### Phase 4: Task closeout
- [x] 关闭或归档相关 active task
- [x] 更新 roadmap 总控记录
- [x] 关闭并归档 `roadmap-v1.3-context-budget-governance`
- **Status:** complete

## Finishing Criteria

- `dev` 和 `origin/dev` 包含 `v1.3` 所需的 budget / dedupe / regression 治理变更。
- `global-rule-context-load-analysis`、`rtk-support-feasibility-analysis` 以及相关遗留 findings 被关闭归档，或记录明确保留理由。
- 本任务三件套记录 worktree base、验证、merge/push 和 closeout 结论。
