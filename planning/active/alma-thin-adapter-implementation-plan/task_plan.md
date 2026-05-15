# Task Plan: Alma Thin Adapter Implementation Plan

## Goal
把 Alma 适配的 implementation plan 以可插拔、可删除、不污染现有方案的方式落成文档，并明确评估“真最小版”是否足以让 Alma 用 planning-with-files 处理所有 tracked tasks、用 superpowers 处理深度任务。

## Current State
Status: waiting_review
Archive Eligible: no
Close Reason:

## Current Phase
Phase 3

## Phases

### Phase 1: 项目结构与适配边界分析
- [x] 检查现有 harness adapter / metadata / paths / template / override 结构
- [x] 明确 Alma 当前不属于 installer-managed target
- [x] 识别可插拔适配的最小改造边界
- **Status:** complete

### Phase 2: 规划实现路径
- [x] 比较薄 adapter、adapter+skills、full parity 三种方案
- [x] 选定以薄 adapter 为主的 P0 方案
- [x] 明确 deferred 范围：hooks / full MCP / 深度 skills 适配
- **Status:** complete

### Phase 3: 文档落盘与最小方案结论
- [x] 将 implementation plan 整理成 Markdown 文档
- [x] 在 planning/active 下记录本次分析任务
- [x] 明确回答真最小版是否足以支撑 tracked/deep-reasoning 分流
- **Status:** complete

## Key Questions
1. Alma 适配的第一版是否应该只做薄 adapter，而不触碰 hooks 与 full MCP？
2. 为了保证可插拔与易删除，Alma entry path 应该更偏向 `.alma/...` 还是 `ALMA.md`？
3. “真最小版”是否足以让 Alma 自动执行 planning-with-files / superpowers 分流，还是只能做到参考与部分遵循？

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| 以薄 adapter 作为推荐 P0 | 最符合“像插件一样，随时可删”的目标 |
| hooks / full MCP / 深度 skills 集成延期 | 这些部分最容易引入深耦合和平台污染 |
| 先把计划文档落到 `docs/superpowers/plans/`，同时在 `planning/active/` 保留摘要 | 符合仓库 companion plan + task-scoped planning 的现有习惯 |
| “真最小版”不足以单独强制执行 tracked/deep 分流 | 只读 MCP 只能提供规则感知，不能独立变成 Alma 的强执行层 |

## Notes
- 本轮严格只写计划文档与分析结论，不修改实现代码。
- companion plan 路径：`docs/superpowers/plans/2026-05-15-alma-thin-adapter-implementation-plan.md`
- Sync-back status: completed for current planning summary.
