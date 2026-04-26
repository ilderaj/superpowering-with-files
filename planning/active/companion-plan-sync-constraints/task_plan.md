# Task Plan: Companion Plan Sync Constraints

## Goal
评估并设计一套更强的 companion-plan 同步约束，覆盖 active task planning 更新与 archive 场景，避免 active plan 与 companion plan 的双向引用、sync-back 状态或归档位置发生漂移而未被及时阻断。

## Current State
Status: active
Archive Eligible: no
Close Reason:

## Current Phase
Phase 3

## Phases

### Phase 1: Context And Gap Analysis
- [x] 读取 close/archive 与 plan-location 校验入口
- [x] 确认当前约束是 warn-only 还是存在阻断点
- [x] 定义这次需要补的场景边界
- **Status:** complete

### Phase 2: Constraint Design
- [x] 比较 warn-only / hard-block / assisted-sync 三种约束方案
- [x] 给出推荐方案与落点
- [x] 明确验证与回退策略
- **Status:** complete

### Phase 3: Spec Drafting And Review
- [x] 将确认后的方案写入 design spec
- [x] 自检 spec 的一致性、边界与可实施性
- [x] 等待用户 review spec 后再进入 implementation plan
- **Status:** complete

### Phase 4: Implementation Plan Drafting
- [x] 基于 approved spec 写出详细 implementation plan
- [x] 自检 implementation plan 的覆盖度、占位符和类型一致性
- [ ] 等待执行方式选择
- **Status:** in_progress

## Decisions Made

| Decision | Rationale |
| --- | --- |
| 用户选择 `B`：`close-task` 与 `archive-task` 都应 hard-block，只要 companion plan 未同步就不允许继续 | 相比 warn-only，更能在 lifecycle 关键节点阻止 active planning 与 companion artifact 漂移 |
| 用户选择 `A`：`archive-task` 应自动迁移 companion artifact 到对应 `planning/archive/<timestamp-task>/companion_plan.md`，而不是仅做阻断 | archive 属于机械性收口动作，自动迁移能减少人为漏改路径与历史 artifact 滞留 `docs/superpowers/plans/` |

## Notes
- 本任务当前先做设计与约束方案评估，不直接实现代码。
- Design spec path: `docs/superpowers/specs/2026-04-26-companion-plan-sync-constraints-design.md`
- Companion plan path: `docs/superpowers/plans/2026-04-26-companion-plan-sync-constraints.md`