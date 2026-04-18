# 任务计划：Harness Adoption 治理方案

## Goal

基于前一轮审计结果，为 Jared 全局与重点 workspace 制定一份不改 `HarnessTemplate` 代码的治理方案，明确 adoption 的优先级、可行/不可行边界、存量兼容策略，以及 projection 相关处置原则。

## Current State
Status: active
Archive Eligible: no
Close Reason:

## Current Phase

Complete

## Phases

### Phase 1: 范围恢复与对象清单确认
- [x] 读取用户要求与已完成的 companion-plan 审计结论
- [x] 确认重点范围：`HarnessTemplate`、`Agent Plugin`、`TypeMint`、`BabyCry`、`LullabyApp`、Jared user-global
- [x] 定位相关入口、rules、skills、instructions 文件
- **Status:** complete

### Phase 2: 重复与冲突面审计
- [x] 识别各 workspace 是否有自身的 Harness 入口 / delta 入口 / OpenSpec 入口
- [x] 识别全局与 workspace 的 `writing-plans` / `planning-with-files` / superpowers 相关重复
- [x] 判断哪些重复属于“应消除重复”，哪些属于“项目 delta，不应折叠”
- **Status:** complete

### Phase 3: 治理方案设计
- [x] 输出 adoption 总原则
- [x] 输出可行 / 不可行 / 暂时保留 / 立即对齐 四类结论
- [x] 输出 projection 相关治理策略
- [x] 输出针对重点 workspace 与 Jared 全局的分批计划
- **Status:** complete

### Phase 4: 交付
- [x] 整理为可执行治理方案，不修改代码
- [x] 在 planning 文件中记录 durable decisions
- **Status:** complete

### Phase 5: 全局 Adoption 执行
- [x] 仅对 Jared user-global targets 执行 Harness sync
- [x] 验证 `.codex` / `.copilot` / `.claude` / `.cursor` 下入口与 skills 已刷新
- [x] 保持 workspace 分层策略，不对重点 workspace 做全覆盖修改
- **Status:** complete

## Key Questions

1. Jared 全局入口与 skill 投影是否应该优先对齐，优先级是否高于单个 workspace？
2. 重点 workspace 中哪些文件属于 Harness baseline 重复，哪些属于项目 delta，不应简单去重？
3. `planning-with-files` / `writing-plans` / superpowers 的重复内容，一次性清理风险有多大？
4. 在不影响存量 workspace 的前提下，projection adoption 应该怎么分层推进？

## Decisions Made

| Decision | Rationale |
| --- | --- |
| 本轮只输出治理方案，不实施修改 | 用户明确要求先出 plan，且不要修改 `HarnessTemplate` 代码 |
| 优先区分“全局 baseline”与“workspace delta” | 这决定哪些重复是坏重复，哪些是合理分层 |
| 对存量 workspace 采取兼容优先 | 用户明确要求不要影响现有存量 workspace |
| 用户已确认 Copilot `planning-with-files` companion-plan patch 已修复，可进入 adoption 执行 | 现在可以执行“先全局、后分层 workspace”的方案，而不是停留在治理建议 |
