# Task Plan: Alma Goal A MCP Read-Only Adoption

## Goal
围绕目标 A 产出一份更轻量的 implementation plan，明确以全局 MCP read-only 接入为核心，让 Alma 能理解并通常遵循 harness 工作流，同时保持可删除、零污染。

## Current State
Status: waiting_review
Archive Eligible: no
Close Reason:

## Current Phase
Phase 2

## Phases

### Phase 1: 重新界定 Goal A 范围
- [x] 区分 Goal A 与“强执行 tracked/deep 分流”
- [x] 确认 Goal A 更适合操作型 rollout plan，而非重型工程 plan
- **Status:** complete

### Phase 2: 生成轻量 implementation plan
- [x] 产出基于 MCP read-only 的 adoption plan
- [x] 明确 in-scope / out-of-scope
- [x] 给出是否“直接全局开始读 MCP 就行”的结论
- **Status:** complete

## Key Questions
1. Goal A 是否需要正式 Alma adapter？
2. Goal A 是否只靠 Alma 侧全局 MCP read-only + 一点 workflow note 就够？
3. 是否还需要 repo 内的实现计划？

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| Goal A 不需要先做正式 Alma adapter | 目标只是“理解并通常遵循”而不是“强执行” |
| Goal A 可以先直接从全局 MCP read-only 开始 | 这是最轻、最可回滚、最不污染原方案的路径 |
| 仍然保留一个很小的 rollout/checklist plan | 方便验证效果、回滚和交接 |

## Notes
- companion plan 路径：`docs/superpowers/plans/2026-05-15-alma-goal-a-mcp-readonly-adoption-plan.md`
- Sync-back status: completed for current planning summary.
