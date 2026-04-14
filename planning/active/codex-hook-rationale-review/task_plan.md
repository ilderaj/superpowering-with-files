# Codex Hook 覆盖依据复核计划

## Current State
Status: active
Archive Eligible: no
Close Reason:

## 目标

- 复核为什么当前 HarnessTemplate 对 `Codex` 不投影 hooks，而对其他 IDE 可以部分投影。
- 区分“产品能力限制”“仓库尚未验证/实现”“历史设计取舍”三类原因。
- 盘点当前框架下已有 hooks、各自用途，以及 `Codex` 不 cover 的实际影响。
- 如果现有设计依据不足，提出一个可扩展、跨 IDE 兼容、架构简洁的统一 cover 方案。

## 完成标准

- 给出当前设计的直接代码依据、文档依据、历史决策依据。
- 给出 `Codex` 官方能力边界的核对结果；若无法确认，明确标注证据缺口。
- 给出当前 hooks 清单、支持矩阵、用途和对使用体验的影响。
- 给出是否应调整当前设计的结论；若应调整，给出最小但可扩展的方案。

## 执行步骤

1. 审查仓库内 `hooks` 相关实现、文档、测试和历史计划。
2. 核对 `Codex`、`Copilot`、`Cursor`、`Claude Code` 的 hooks 能力依据。
3. 汇总设计理由、证据缺口、风险和备选架构。
4. 输出结论并同步到 findings/progress。
