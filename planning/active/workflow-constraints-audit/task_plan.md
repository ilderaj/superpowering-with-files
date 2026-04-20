## 任务目标

审计并确认最近关于任务分类、规则优先级、tracked task 触发条件、superpowers sync-back 约束，以及 companion plan 边界的修改是否已经在仓库入口文档、跨 IDE 投影与自检流程中生效；如有缺口，精炼更新 README 或相关入口文档，并完成一次自检。

## 任务分类

- 类型：Tracked task
- 原因：涉及多阶段审计、跨 IDE 一致性核对、文档更新与自检留痕，需持久化记录。

## 完成标准

1. 确认任务分类、rule precedence、tracked task 触发条件与 superpowers sync-back 约束在权威入口中存在且表述一致。
2. 确认 companion plan 只作为 deep-reasoning task 的次级产物，且不会替代 `planning/active/<task-id>/`。
3. 明确 Codex、Copilot、Cursor、Claude Code 的相关入口/兼容文档是否覆盖相同约束；若存在表达缺口，完成精炼补充。
4. 完成一次仓库自检，确认后续 agent 不会因为 “straightforward work” 绕开 `planning-with-files`，也不会把 superpowers 的详细 implementation plan 直接塞进 `planning/active/<task-id>/task_plan.md`。

## 阶段

### Phase 1
状态：complete
目标：盘点现有约束在入口文档、架构文档、兼容文档与最近提交中的落点。

### Phase 2
状态：complete
目标：按需更新 README 或相关入口文档，保持结构不变，只收敛相关说明。

### Phase 3
状态：complete
目标：执行自检并记录结论、残余风险与后续注意事项。

## 最终结果

- 已确认 task classification、rule precedence、tracked task 触发条件、superpowers sync-back 约束与 companion plan 模型存在于共享 policy 源头，并通过 adapter/template/patch/test 链路覆盖到所有支持的 IDE。
- 已补强规则文案，避免后续 agent 因 “straightforward work” 误绕过 `planning-with-files`，也避免把 superpowers 的详细 implementation plan 直接附着到 active task 的 `task_plan.md`。
- 已完成自检，当前修改未破坏既有测试或健康检查。
- 2026-04-18 当前复核再次确认：上述约束在 `dev` HEAD 仍然成立，相关 targeted tests、`verify`、`doctor` 全部通过；本轮为只读审计，无代码变更。

## Current State
Status: active
Archive Eligible: no
Close Reason:
