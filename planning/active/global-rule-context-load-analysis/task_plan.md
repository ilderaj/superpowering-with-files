# 全局 Harness 上下文开销治理分析与整改规划

## Current State
Status: active
Archive Eligible: no
Close Reason:

## 任务目标

- 结合 `/Users/jared/TypeMint/planning/active/local-context-overhead-analysis/analysis-summary.md`，从 Jared user-global Harness 层全面审计当前 HarnessTemplate 是否存在相同或相近的上下文膨胀问题。
- 在事实来源充分的前提下，分析 global 与 workspace 分层下的固定成本、恢复成本、执行成本、技能/规则发现成本，以及 adoption 风险。
- 输出一份详尽分析报告与整改 plan，强调：
  - 尽可能通用
  - 尽量不破坏现有架构
  - 收益/成本比高
  - 风险尽量可控
  - 各 IDE 与 workspace 在 global 层 adopt 难度低
- 整改 plan 必须包含详细的研究、测试、校准、验证流程，但本轮不直接实施代码改动。

## 任务分类

- 类型：Tracked task
- 原因：涉及多阶段研究、跨 IDE 入口机制对比、上下文体积量化、历史任务交叉引用与审计结论留痕。

## 完成标准

1. 明确当前 HarnessTemplate 在 global harness 层可见的规则、skills、planning 恢复和投影链路。
2. 用可复核的度量给出当前上下文成本基线，并与 TypeMint handoff 中的成本模型对照。
3. 基于官方文档核实四个 IDE 的 global/workspace 入口、skills/hook 发现、以及潜在分层加载机制，区分“已证实事实”和“仍需保守处理”的部分。
4. 形成问题矩阵，识别：
   - 当前已存在的问题
   - 设计上容易放大上下文负担的点
   - 高收益/低风险整改机会
   - 不宜贸然改动的高耦合区域
5. 输出详尽整改 plan，包含：
   - 分阶段整改建议
   - 测试矩阵
   - 校准与回归验证流程
   - adopt 路径与风险控制

## 阶段

### Phase 1
状态：complete
目标：恢复现有 planning 上下文，吸收已有全局规则成本分析与跨 IDE 审计记录。

### Phase 2
状态：complete
目标：量化当前 global harness 的规则/skills/恢复链路成本，并整理本地设计问题假设。

### Phase 3
状态：complete
目标：并行核查各 IDE 官方文档，确认入口与加载机制事实来源。

### Phase 4
状态：complete
目标：汇总问题矩阵，评估各整改方向的通用性、收益成本比、风险与 adopt 难度。

### Phase 5
状态：complete
目标：输出详尽分析报告与整改 plan，包含测试、校准、验证流程。

## Companion Plan

- Companion plan: `docs/superpowers/plans/2026-04-19-global-harness-context-remediation-plan.md`
- Summary: 输出了一份可执行的整改计划，覆盖上下文预算、薄入口渲染、planning compact recovery、hook payload 收敛、opt-in skill profile、以及测试/校准/发布门槛。
- Sync-back Status: companion plan 已创建；active task 记录已同步路径、摘要与当前状态。

## 当前关键判断

- 这次问题不是单点“AGENTS.md 太长”，而是 global harness 层的固定成本、恢复成本、技能生态成本和 workspace 叠加成本共同作用。
- 当前最值得先核实的是：
  - 共享 `base.md` 长文本是否仍是绝对主成本
  - global entry + workspace entry + projected skills 是否会形成多层重复
  - `planning-with-files` / `using-superpowers` 等技能在 global adoption 下是否构成持续背景税
  - 哪些优化可以在不推翻现有 projection 架构的前提下完成
- 用户当前明确要求先出详尽报告和整改 plan，因此本任务只做研究、归纳和规划，不改代码。
