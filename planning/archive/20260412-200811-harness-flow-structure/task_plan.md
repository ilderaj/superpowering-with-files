# Harness 流程与结构图说明任务

## Current State
Status: closed
Archive Eligible: yes
Close Reason: 已将流程图、结构图和精简说明整合进 README，并完成 Markdown diff 与相关测试验证。

## Goal
梳理本项目的两类图：

1. 任务进入全局 governance rules 后，如何判断是否使用 Superpowers、何时创建 Planning with Files、如何回写 lifecycle 状态以及如何 archive。
2. Harness 针对 Codex、GitHub Copilot、Cursor、Claude Code 的全局安装位置、项目内规则文件、IDE 识别入口，以及实体文件、硬链接、软链接和指向关系。

## Finishing Criteria
- 从仓库源码、模板和文档中核对安装路径与规则入口。
- 输出一个逻辑流程图和一个结构图。
- 明确哪些结论来自仓库事实，哪些是根据当前实现推导。
- 更新 `findings.md` 与 `progress.md`。

## Phases
- [x] Phase 1: 建立本任务的 planning 文件。
- [x] Phase 2: 读取安装器、路径解析、adapter manifest、模板和安装文档。
- [x] Phase 3: 汇总流程与结构事实。
- [x] Phase 4: 输出 Mermaid 图和说明。
- [x] Phase 5: 回写 lifecycle 状态，按完成规则关闭但不直接归档。
- [x] Phase 6: 将流程图、结构图和精简说明整合进 README。
- [x] Phase 7: 验证 README diff 与 Markdown 基本结构。

## Decisions
- 本次任务不修改产品代码，只输出说明图。
- 按仓库策略，Planning with Files 是长期任务状态唯一来源；Superpowers 只作为临时 reasoning 或能力集合，不保存长期任务状态。
- 结构图需要区分“当前 `sync` 已实现的入口文件写入”和“skills 投射元数据已有但落盘流程尚未接入 `sync`”。
- README 文档内容按项目规则使用英文；对话和总结继续使用中文。

## Errors Encountered
| Error | Attempt | Resolution |
|---|---|---|
| `fd` command not found | 1 | 按仓库工具降级规则使用 `rg --files`。 |
