# Visible worker Root 契约收敛计划

状态：Root/Codex-only 方案已执行并通过 Chief 验收。DSH source、tests、docs 和 projections 全部排除；后续可单独评估 deprecated DSH support。

## 决定

SWF 在 Root Harness 退役 active visible-worker execution contract，不恢复专用 Host bridge。普通执行继续使用已验收的 direct/native-first。

| 概念 | 目标语义 |
| --- | --- |
| 当前主任务直接执行 | 主执行者在现有授权和范围内完成，并按相关 capability 验证收口 |
| native subagent | 当前任务内部的有界 helper；返回候选，由主执行者整合 |
| 用户可见独立任务 | 只有用户明确要求新任务时由 Host 创建；不作为当前任务内部 worker |
| legacy strict input | `visible_worker_required` 仍可被 parser 识别，但所有 Root Host lifecycle operation 返回迁移 blocker |
| historical visible route | `visible_worker` 仅保留为历史 evidence vocabulary；resolver 不再产出该 route |
| `manual_pending` | 保留为真实权限、能力、绑定或迁移 blocker |
| Corleone persona | 保留静态身份和兼容配置；不决定模型、权限、执行拓扑或是否完成 |

## Roadmap 位置

本项作为 V1.4 preflight maintenance slice 执行。V1.3 只补必要 errata，不重开已接受版本；V1.4 主线和 V2.0 经济性评估不因此扩 scope。

## 明确排除

- 不修改或测试 `plugins/dsh/**`。
- 不要求 root/DSH parity。
- 不修复 DSH dispatch、persona 或 evidence seam。
- 不把本次 Root 决定解释成 DSH 已迁移；DSH 当前行为保持既有状态，后续弃用另行决策。

## 阅读顺序

1. [审计结论](audit.md)：问题、证据和 Root/DSH 边界。
2. [实施计划](implementation.md)：Root source、tests、canonical docs 和 projection 顺序。
3. [验证计划](verification.md)：Root RED/GREEN、兼容和投影验收。

未来执行状态只记录在对应 execution Trio 的 `task_plan.md`、`findings.md` 和 `progress.md` 中。
