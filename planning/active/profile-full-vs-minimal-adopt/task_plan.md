# Task Plan: Profile Full vs Minimal Adopt Comparison

## Goal
详细比较项目 profile 中 `full adopt` 与 `minimal adopt` 的区别，重点从两条线展开：
1. projection 最终会落哪些组件、分别影响哪些 target/path；
2. token consumption 如何被计算、两种 profile 在上下文体积上的真实差异来自哪里。

## Current State
Status: waiting_review
Archive Eligible: no
Close Reason:

## Current Phase
Phase 4

## Phases

### Phase 1: 上下文恢复与入口定位
- [x] 扫描现有 `planning/active/`，确认没有可直接复用的同主题 task
- [x] 定位 profile、projection、verify/token summary 的实现入口
- [x] 记录本轮分析边界与关键问题
- **Status:** complete

### Phase 2: `full` 与 `minimal-global` skill profile 对比
- [x] 读取 skill profile 定义与相关测试
- [x] 明确两种 profile 各自包含/排除的 skill 组件
- [x] 确认默认 adopt/install 流里的 profile 选择与 override 规则
- **Status:** complete

### Phase 3: projection 与 token consumption 对比
- [x] 读取 projection planner / renderer / verify summary 逻辑
- [x] 说明组件投影差异如何传导到最终 token 体积
- [x] 用仓库内现有文档/测试/报告交叉验证
- **Status:** complete

### Phase 4: 结论整理
- [x] 输出面向用户的差异矩阵
- [x] 补充适用场景、边界与容易误解的点
- **Status:** complete

## Key Questions
1. 这里的 “minimal adopt” 在仓库术语里是否等同于 `minimal-global` skill profile？
2. `full adopt` 与 `minimal adopt` 的主要差异，是只在 skill projection 层，还是也影响 entry / hooks / planning projection？
3. token consumption 的口径，仓库当前是按 verify summary 的 `approxTokens` 来看，还是还有其他独立统计来源？

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| 本轮作为独立 tracked analysis task 处理 | 需要跨实现、测试、文档做比较，并且结论有复用价值 |
| 优先按仓库真实术语分析 `full` 与 `minimal-global` | README、install docs、tests 当前都用这组名称，避免先按口语理解跑偏 |
| 以 user-global adopt 语境为主做量化 | `adopt-global` 是 user-global-only，且 README 明确把 `minimal-global` 定义为 user-global / `both` 默认 |
| token 对比分成两层：`skillProfiles` discovery summary 与 session ledger | 仓库里这两层口径不同，只看其中一层会误读 profile 影响范围 |

## Notes
- 本轮不改代码，目标是做 source-backed comparison。
