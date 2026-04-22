# 任务计划：RTK 支持可行性与价值分析

## Goal

基于官方文档与 GitHub 一手资料，评估在 Harness 中增加对 `rtk-ai/rtk` 的支持是否值得做、适合做到什么程度、在当前各 IDE 中能产生什么效果，以及它与 Harness 当前两个 upstream 核心模块 `superpowers`、`planning-with-files` 的兼容性与适配性。

## Current State
Status: active
Archive Eligible: no
Close Reason:

## Current Phase

Phase 5: 报告交付

## Phases

### Phase 1: 仓库现状与边界确认
- [ ] 确认 Harness 当前 upstream 模块与平台适配结构
- [ ] 确认本次分析对象和不做代码改动的边界
- **Status:** complete

### Phase 2: 外部事实采集
- [ ] 查阅 `rtk-ai/rtk` 官方 README / docs / release / API 说明
- [ ] 查阅 GitHub issues / PR，提取成熟度、限制、集成方式与平台支持证据
- [ ] 查阅各 IDE 官方文档，确认能否承载 RTK 所需能力
- **Status:** complete

### Phase 3: 兼容性与适配性评估
- [ ] 对照 Harness 当前 adapter / projection / policy 结构
- [ ] 分析 RTK 与 `superpowers` 的关系：替代、补充还是冲突
- [ ] 分析 RTK 与 `planning-with-files` 的关系：可协同、需隔离还是会破坏约束
- **Status:** complete

### Phase 4: 价值与成本模型
- [ ] 列出价值点
- [ ] 估算一次性接入成本、维护成本、迁移成本
- [ ] 估算可能的效率提升与成本节省区间，并标明假设基础
- **Status:** complete

### Phase 5: 报告交付
- [ ] 产出可行性分析与价值分析报告
- [ ] 明确结论、建议优先级、风险与不确定性
- **Status:** in_progress

## Key Questions

1. RTK 的核心能力到底是什么，是否与 Harness 的职责边界匹配？
2. RTK 接入需要哪一层支持：adapter、skills、hooks、runtime，还是独立插件？
3. 哪些 IDE 具备承载 RTK 的必要能力，哪些只能部分支持？
4. RTK 与 `superpowers`、`planning-with-files` 的兼容点和冲突点分别是什么？
5. 接入收益是否足以覆盖实现与长期维护成本？

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| 本任务只做调研与评估，不修改程序和代码 | 用户明确要求 |
| 兼容性分析以仓库中声明的两个 upstream 模块为准：`superpowers`、`planning-with-files` | `harness/upstream/sources.json` 明确如此 |
| 结论必须建立在官方文档与 GitHub 一手资料上 | 用户明确要求“不要猜” |
| 结论以 Harness 当前支持的四个目标为主：Codex、GitHub Copilot、Cursor、Claude Code | `harness/core/metadata/platforms.json` 与 adapter manifests 明确如此 |
| 评估“加支持”时，优先考虑 Harness-managed optional integration，而不是直接建议用户运行 `rtk init` | `rtk init` 会直接改 Harness 也在管理的 entry / hook 配置，和 `sync` 的权威投影模型存在边界冲突 |
