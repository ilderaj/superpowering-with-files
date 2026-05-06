## 任务概述

审计本地 `planning/active/` 下的任务状态与归档资格；先对高置信可归档任务补齐 eligibility，不执行 archive；再对 `waiting_review` 与 `closed + yes` 任务做严格 code review / audit，判断哪些适合后续 archive；最后为仍保持 `active` 的任务收敛 follow-up 并落一个新的 planning 项目。

## Current State
Status: waiting_review
Archive Eligible: no
Close Reason: 已完成 archive 执行与 companion-sync 收尾，等待用户 review 最终结果。

## 完成标准

- 完成 `planning/active/` 任务目录盘点
- 逐个检查 lifecycle block 与必要证据文件
- 给出任务分组结论：可改状态 / 可归档 / 暂不动作
- 形成可 review 的审计结论，不直接执行 archive move
- 完成 8 个高置信已完成任务的 `Archive Eligible: yes` 收尾
- 完成 `waiting_review` 与 `closed + yes` 任务的 archive readiness audit
- 新建一个 task-scoped planning 项目，承接仍为 `active` 的 follow-up

## 阶段

### Phase 1: 盘点活动任务
Status: complete

- 列出当前 `planning/active/` 下的任务目录
- 识别可能需要重点审计的 stale / completed-looking 任务

### Phase 2: 核查 lifecycle 与证据
Status: complete

- 检查各任务 `task_plan.md` 的 `## Current State`
- 结合 `progress.md` / `findings.md` 判断是否真正完成、是否具备 close/archive 依据

### Phase 3: 输出审计建议
Status: complete

- 按任务输出建议状态
- 汇总可执行的后续 cleanup 范围，但保持只读

### Phase 4: 补齐 archive eligibility
Status: complete

- 仅修改高置信可归档但尚未翻 eligibility 的任务
- 不执行实际 archive move

### Phase 5: 复审 waiting_review 与 closed+yes
Status: complete

- 对 `waiting_review` 任务做严格 lifecycle / verification / unresolved-items 审计
- 对 `closed + yes` 任务复核是否存在未消化风险，判断是否适合 archive

### Phase 6: 收敛 active follow-ups
Status: complete

- 总结仍保持 `active` 任务的 follow-up
- 落一个新的 planning 项目用于后续治理

### Phase 7: 执行 archive
Status: complete

- 将已判定适合 archive 的 `waiting_review` 任务先收口为 `closed + yes`
- 使用 helper scripts 归档全部已确认 archive-ready 的任务

## 判定规则

- 仅当 `Status: closed` 且 `Archive Eligible: yes` 时，才可 archive
- 正文看起来完成，不等于可以 archive；需要 lifecycle block 与证据一致
- 缺少 `## Current State` 的旧任务，只能列为 stale candidate，不能直接 archive
- 是否可以从 `active` 变更到 `waiting_review` / `closed`，要以 `progress.md` / `findings.md` 中的交付与验证证据为准

## 审计摘要

- 高置信可直接 archive：9 个，已满足 `closed + yes`
- 已执行 eligibility 收尾：8 个
- archive readiness audit 后适合后续 archive 的 `waiting_review`：4 个
- archive readiness audit 后适合后续 archive 的 `closed + yes`：14 个
- archive readiness audit 后暂不适合 archive 的 `waiting_review`：4 个
- archive readiness audit 后暂不适合 archive 的 `closed + yes`：3 个
- 已实际 archive：18 个
- 建议保持 `active`：10 个
- planning hygiene 异常：1 个空目录，需单独清理，不应按正常 task archive
