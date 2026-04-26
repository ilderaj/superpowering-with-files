# 任务计划：Superpowers Companion Plan 跨 IDE 投射审计

## Goal

审计 `Superpowers Plans` 与 `Planning with Files` 的新关系模型是否已经从 `HarnessTemplate` 源策略、任务计划、投影实现、测试与 Jared 的跨 IDE / 跨 workspace 入口文件完整落地，重点核查 Copilot。

## Current State
Status: waiting_review
Archive Eligible: no
Close Reason:

## Current Phase

Complete

## Phases

### Phase 1: 范围恢复与历史上下文复核
- [x] 读取用户请求与 `/Users/jared/AGENTS.md`
- [x] 使用 `using-superpowers` 与 `planning-with-files` 的最小必要说明
- [x] 读取目标文件与相关 active task 记录
- **Status:** complete

### Phase 2: 源策略与实现证据链审计
- [x] 审计 `harness/core/policy/base.md` 与 companion-plan 语义
- [x] 审计 installer/projection/tests/docs 中的落地状态
- [x] 审计 Jared 全局入口文件与模板输出是否同步
- **Status:** complete

### Phase 3: Copilot 重点核查
- [x] 核查 Copilot workspace/user-global instructions、skills、相关 patch 是否表达 companion-plan 新模型
- [x] 判断 Copilot 是否存在只更新模板、未更新投影结果的问题
- **Status:** complete

### Phase 4: 交付审计报告
- [x] 输出按严重级别排序的 findings
- [x] 记录证据、边界与剩余不确定项
- **Status:** complete

### Phase 5: Warning 修复计划
- [x] 复核 `adoption-status` 中当前 warning 列表
- [x] 区分 orphan companion 与 active-task-link drift 两类问题
- [x] 形成按优先级排序的修复计划与验证顺序
- **Status:** complete

### Phase 6: Warning 误报修复执行
- [x] 为 companion-plan health 补回归测试
- [x] 收紧 canonical 引用解析并支持 markdown link back-reference
- [x] 修正当前 active companion plan 的显式回指格式
- [x] 复跑 health / adoption status，确认只剩历史 orphan warning
- **Status:** complete

## Key Questions

1. `base.md` 中新增的 companion-plan / memory-plan 双向同步与引用规则，是否已经进入真正被 IDE 消费的入口文件？
2. `planning/active/superpowers-plan-artifact-model/task_plan.md` 描述的“已覆盖所有 supported targets”是否有实现与测试证据支持？
3. Jared 的 user-global / workspace 入口与技能投影，是否已经把这套规则同步到 Copilot、Codex、Claude Code、Cursor？
4. 是否仍存在旧规则残留，导致某些 IDE 继续把 `docs/superpowers/plans/**` 当作被禁止或非 canonical，而不是 required companion artifact？

## Decisions Made

| Decision | Rationale |
| --- | --- |
| 本轮是审计，不直接改实现 | 用户要求先做审计报告 |
| 以 `HarnessTemplate` 为主审计仓库，同时检查 Jared 全局入口投影 | 用户要求看“整个 Jared 的所有 workspace、所有 IDE”，重点是投影结果是否真的生效 |
| 优先相信实现与测试，其次才是 task plan 自述 | `task_plan.md` 可以宣称完成，但不能替代代码与实际投影证据 |
| 本轮 warning 修复优先处理 task-memory / companion-plan 关系，而不是 installer 逻辑 | 当前 warning 文案与测试语义一致，先修数据再考虑是否需要改检测器 |
| 先消除 false positive，再保留历史 orphan warning | `docs/architecture.md` 与 `docs/compatibility/hooks.md` 已明确这类 warning 可以是历史/人类文档提示，不属于安装失败 |
