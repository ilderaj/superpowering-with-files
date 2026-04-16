# 任务计划：Planning 入口规则澄清与执行

## Goal

消除 Harness policy 与 `planning-with-files` skill 在“何时必须进入 planning”上的歧义，把明确优先级和任务分级规则落到仓库源文件、投影结果与测试中。

## Current State
Status: closed
Archive Eligible: yes
Close Reason: Planning entry classification and precedence rules were implemented, synced, and verified.

## Current Phase

Phase 4

## Phases

### Phase 1: 范围恢复与规则判定
- [x] 读取用户给出的冲突点与相关规则源文件
- [x] 确认需要修改的是源模板而不只是生成文件
- [x] 建立 task-scoped planning 文件并记录完成标准
- **Status:** complete

### Phase 2: 规则改写
- [x] 为 policy 增加明确优先级和任务分级
- [x] 收敛 `planning-with-files` skill 中的触发语义
- [x] 避免 “>5 tool calls” 单独决定是否必须进入 planning
- **Status:** complete

### Phase 3: 投影与测试同步
- [x] 同步模板/生成结果中的新文案
- [x] 更新或新增测试断言，覆盖新规则
- [x] 确认没有只修生成物、遗漏源文件
- **Status:** complete

### Phase 4: 验证与收尾
- [x] 运行相关测试与 repo 级验证
- [x] 在 progress/findings 中记录结果与最终决策
- [x] 准备向用户交付变更摘要
- **Status:** complete

## Finishing Criteria

- `harness/core/policy/base.md` 明确写出 rule precedence 与 task classification。
- `harness/upstream/planning-with-files/SKILL.md` 不再把 `>5 tool calls` 作为单独的硬触发条件。
- 生成的 `AGENTS.md` 与核心 policy 一致。
- 至少相关 adapter/sync/template 测试通过。
- planning 文件完整记录本次判定、修改范围与验证结果。

## Key Questions

1. 哪条规则应该作为 planning 入口的最高优先级判定？
2. “straightforward/simple” 与 “tool call count” 应该如何分工，避免互相覆盖？
3. 哪些任务特征应直接触发 tracked task，而不是交给 agent 自由解释？

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| 新建独立 task `planning-entry-rule-clarification` | 这是新的规则治理任务，不应覆盖历史 active task |
| 先改源模板与上游 skill，再看投影结果 | 仓库里 `AGENTS.md` 是生成物，只改生成物会再次漂移 |
| 本轮直接执行，不额外创建 docs 计划文档 | 项目 policy 已明确 durable task memory 只能落在 `planning/active/<task-id>/` |
| 把入口治理收敛为 `Quick task` / `Tracked task` / `Deep-reasoning task` | 这比继续堆“simple / straightforward / >5 tool calls”更可执行 |
| `>5 tool calls` 只保留为提示信号 | 工具次数无法稳定区分小修复和真正需要 durable planning 的任务 |

## Errors Encountered

| Error | Attempt | Resolution |
|-------|---------|------------|
| `fd` 不存在 | 1 | 按仓库降级策略改用 `find` / `rg` |

## Notes

- 若规则改写影响模板快照或测试语义，优先同步测试而不是保留旧断言。
- 对话与 planning 内容使用中文；代码、测试字面量和文档模板内容按现有仓库约定保持英文。
