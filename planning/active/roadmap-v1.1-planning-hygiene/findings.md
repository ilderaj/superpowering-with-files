# Roadmap v1.1 Findings

## Durable Findings

- `v1.1` 的最小实现面是 lifecycle audit contract 与全量 active summary，不是再造第二套 planning workflow。
- 现有仓库已具备单任务 lifecycle 检查与 close/archive guard；缺的是 operator-facing 的全量 active queue 汇总入口。
- `project-roadmap-audit` 是当前唯一可明确在 `v1.1` 收口并归档的 roadmap task。
- `global-rule-context-load-analysis` 虽然接近可关闭，但当前存在并发修改，不能在 `v1.1` 擅自收口。

## Source Context

- 子线 A 结论：除 `project-roadmap-audit` 外，其余 roadmap tasks 仍有 PR、review、时间 gate、报告交付或集成动作未完成。
- 子线 B 结论：应新增 `active-summary` 命令暴露 `planning/active/` 全量汇总，并在 `docs/maintenance.md` 增加 lifecycle audit checklist。
- 现有底层脚本：
  - `harness/core/upstream-overlays/planning-with-files/scripts/task_lifecycle.py`
  - `harness/core/upstream-overlays/planning-with-files/scripts/task-status.py`
  - `harness/core/upstream-overlays/planning-with-files/scripts/scan-active.py`

## Execution Decisions

- `active-summary` 采用新增 installer command，而不是修改现有单任务 `summary` 语义。
- 文本输出服务 operator，JSON 输出服务 `.harness/planning-active-summary.json` 等后续 automation/verification 消费。
- v1.1 只关闭 `project-roadmap-audit`，不碰有并发修改或外部 gate 的任务。

## Audit Outcome

- 审计后 active queue 为 12 个 task：
  - `active`: 8
  - `waiting_review`: 4
- 无空 active 目录、无缺失 `task_plan.md` 的异常。
- 当前 4 个需要继续保留的 `waiting_review + looks_complete` task：
  - `cross-ide-projection-audit`
  - `cross-ide-single-source-consolidation`
  - `origin-cloud-harness-deployment-plan`
  - `readme-slim-pr`
- 这些 task 的共性不是“可直接归档”，而是仍有 review、PR 或集成决策 gate，因此在 `v1.1` 保留是正确行为。
- `project-roadmap-audit` 已完成 close/archive；其结论已转移到 `docs/roadmap.md` 和 `roadmap-implementation-plan` 总控任务。
