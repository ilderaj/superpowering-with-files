## 任务概述

把当前仍应保持 `active` 的任务收敛成一个可执行的后续跟进项目，明确每个任务的下一步、依赖关系、收口顺序与非目标边界，避免后续继续在多个 active 目录之间来回切换。

## Current State
Status: waiting_review
Archive Eligible: no
Close Reason:

## 完成标准

- 列出纳入后续治理的 active task 清单
- 按任务写清 follow-up、依赖与建议顺序
- 区分“报告收口”“实现收口”“长期治理”三类工作流
- 保持只规划，不直接改动这些 active task 的 lifecycle

## 阶段

### Phase 1: active task 收口分类
Status: complete

- 汇总需要继续保持 `active` 的任务
- 按任务性质分组

### Phase 2: 依赖与顺序设计
Status: complete

- 识别哪些任务可以先做报告收口
- 识别哪些任务依赖外部事件或更大治理链路

### Phase 3: 输出 follow-up 项目计划
Status: complete

- 写出后续执行批次
- 记录非目标与暂停条件

## 批次规划

### Batch A: 报告与分析收口

- `cursor-official-load-model-research`
- `global-rule-context-load-analysis`
- `gstack-harness-comparison-analysis`
- `rtk-support-feasibility-analysis`
- `typemint-skill-duplication-check`

目标：把已有事实采集收口成 review-ready 报告或结论稿，尽量不再扩展调研范围。

### Batch B: 实现收口与治理建议

- `backup-fix-session-investigation`
- `cross-ide-hook-capability-alignment`

目标：把“已接近完成但还没形成最终治理结论/closeout”的任务收口成明确建议或最终状态判断。

### Batch C: 长尾运行与基础设施治理

- `post-upstream-automation-followups`
- `harness-template-foundation`

目标：继续观察自动化首轮运行结果，并把基础仓库 schema / metadata 收口到下一个稳定点。

## 非目标

- 不在本项目中自动修改上述 active task 的 lifecycle
- 不把当前 `planning-lifecycle-audit-review` 元任务并入此 follow-up 项目
- 不把空目录异常 `verify-backup-governance-on-dev/` 当作正常 active task 处理
