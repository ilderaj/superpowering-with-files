# Copilot Usage-Based Billing 对 Harness 的开销影响分析与优化计划

> **Active task path:** `planning/active/copilot-usage-billing-impact-analysis/`
> **Lifecycle state:** `closed`
> **Sync-back status:** retained as the historical analysis artifact and closed after merge into local `dev`, projection sync, and publication to `origin/dev` on 2026-04-29.

- Active task path: `planning/active/copilot-usage-billing-impact-analysis/`
- Lifecycle state: `closed`
- Sync-back status: retained as the historical analysis artifact and closed after merge into local `dev`, projection sync, and publication to `origin/dev` on 2026-04-29.

> Active task: `planning/active/copilot-usage-billing-impact-analysis/`
> Scope: plan only, no implementation in this round.

Active task path: planning/active/copilot-usage-billing-impact-analysis/

## 目标

在 GitHub Copilot 从 request/unit 计费迁移到 usage-based billing 之后，评估当前 Harness 在不同 chat 使用场景下的 credits 消耗结构，并提出一套不过分损伤效能的 usage 优化计划。

## 核心判断

这个问题的主矛盾不是“某一次回答太长”，而是 Harness 里原本在 request-based 模式下被固定成本掩盖的上下文税，会在 usage-based billing 下变成可重复结算的持续成本。对当前系统来说，最危险的不是单轮 output，而是以下三类反复发生的 input/cached 成本：

1. always-on 规则入口的固定税
2. hooks 注入的恢复税
3. 长任务中 planning / skills / subagent 协调带来的执行税

## 分析范围

计划覆盖以下对象：

- workspace / user-global always-on instructions
- projected skills 与 skills discovery / loading 行为
- session-start / pre-tool-use / user-prompt-submit 等 hook 注入
- planning-with-files 的 hot-context 恢复路径
- 长会话、复杂任务、多阶段任务、短问短答等不同 chat 场景

不覆盖：

- code completion / Next Edit Suggestion
- 本轮直接修改 harness 实现
- 非 Copilot 平台的独立计费模型

## 当前已知基线

- shared policy `base.md` 约 4096 tokens。
- 各平台 rendered entry 约 4.1k-4.2k tokens，说明主要固定税来自 shared policy，而不是平台 override。
- `context-budgets.json` 已定义 warn 级预算：entry 7500、hookPayload 3000、planningHotContext 4000、skillProfile 5500 tokens。
- `global-rule-context-load-analysis` 已指出：superpowers 与 planning-with-files hooks 会把 skill 内容和 task context 直接注入 prompt。
- GitHub usage-based billing 明确把 input、output、cached tokens 都纳入 credits。

## 场景化成本框架

### 场景 A: 短问短答 / 单轮咨询

特征：
- 用户只提一个问题
- 几乎没有文件编辑
- 可能只有少量搜索或阅读

主要成本：
- input: always-on rules + skill bootstrap + 少量上下文
- output: 一次回答
- cached: 如果同会话内重复问答，入口规则的重复缓存也会计费

风险判断：
- 在这种场景下，Harness 的固定税最不划算，因为任务本身很短，规则入口占比会异常高。

### 场景 B: 中等复杂度单任务

特征：
- 需要若干次搜索、阅读、编辑、验证
- 会触发技能选择与少量 planning

主要成本：
- input: always-on entry + 技能正文 + 少量 planning 恢复 + 被读文件片段
- output: 进度更新、分析解释、编辑结果说明
- cached: 多轮对话里复用的规则、技能、局部文件内容

风险判断：
- 这是最常见也最容易积累浪费的场景。若每轮都带过重 entry/hook payload，总成本会稳定偏高。

### 场景 C: 长时 agentic 任务 / 多 phase 规划

特征：
- 会持续读取 planning 文件
- hooks 反复注入 active plan / progress
- 可能调用多个技能、多个子任务、多个验证步骤

主要成本：
- input: fixed tax + repeated recovery tax + tool-result echo tax
- output: 中间进度、计划、解释、验证结论
- cached: 相同 planning 头部、相同技能正文、相同 policy 在多轮中反复复用

风险判断：
- 在 usage-based billing 下，这类任务会把过去“免费放大”的流程强约束全部显性货币化，是最需要治理的场景。

### 场景 D: 复杂任务 + 多个技能 + hooks 全开

特征：
- using-superpowers 强制技能检查
- planning-with-files 要求任务落盘与恢复
- 多个 process skill / implementation skill 叠加

主要成本：
- input: skill discovery + skill 正文 + hook 注入 + planning 热上下文
- output: 结构化计划、过程解释、状态同步
- cached: 大段技能与规则会跨轮复用并持续计费

风险判断：
- 这是 Harness 相对“纯裸 agent”最昂贵的情形，但同时也是其价值最集中的情形。优化不能简单粗暴地删功能，而要提高单位 token 的产出效率。

## 计划原则

1. 先削减无差别重复税，再削减真正有价值的流程约束。
2. 优先治理 input 与 cached token，因为它们在长会话里会反复累积。
3. 保留对复杂任务最关键的能力：技能发现、任务落盘、恢复摘要、验证要求。
4. 不追求“最省 token”，追求“单位 token 产出最大化”。

## Usage 优化计划

### Phase 1: 建立 Copilot 成本可观测性

目标：先看清楚哪里在花 credits，再决定削哪里。

动作：
- 把现有 `context-budgets.json` 从静态预算升级为场景报告输入。
- 为 Copilot 路径补一份“chat 成本账本”报告：entry、hook payload、planning hot context、skill profile 分别占多少近似 tokens。
- 在验证流程里区分 input、output、cached 三类估算，而不是只给总量。

投入产出判断：
- 成本低，收益高。
- 这是所有后续优化的前置条件，否则很容易做成“拍脑袋减配”。

### Phase 2: 把 always-on entry 从“全量 shared policy”改成“薄入口 + 按需展开”

目标：降低短任务与所有任务的固定 input 税。

动作：
- 把当前超长 shared policy 中真正必须 always-on 的硬约束缩到最小骨架。
- 把长篇流程、长解释、反模式表格、详细执行规范迁移到 skills 或按需文档。
- 对 Copilot 优先利用 its own progressive loading model，而不是继续把完整 policy 直接塞进入口。

投入产出判断：
- 收益非常高，因为会影响所有 chat。
- 风险是规则覆盖率下降，因此需要保留少量硬门槛与关键流程跳转语句。

### Phase 3: 收紧 hooks，从“注入原文”转为“摘要优先、按需展开”

目标：降低中长任务里的重复 input/cached 税。

动作：
- `session-start` 不再默认注入整段 `using-superpowers` 正文，而是注入更短的 bootstrap 摘要，并把技能正文留给显式加载。
- `planning-with-files` hooks 从“固定行数截取”演进到“预算内摘要 + 变更增量 + 必要指针”。
- 对 `pre-tool-use` 这类高频事件设置更严预算，避免每次工具调用都背上几百到几千 token 的重复包袱。

投入产出判断：
- 对复杂任务收益很高。
- 风险是恢复质量下降，因此需要保留 task id、当前 phase、未完成项、最近失败与下一步这类高价值信息。

### Phase 4: 细分 skill profiles，避免把整个 superpowers 生态默认投影给 Copilot

目标：降低 skill 发现面与潜在背景成本。

动作：
- 为 Copilot 提供更轻的默认 profile，只保留高频、低歧义、ROI 高的技能。
- 把重流程技能改成 opt-in profile 或 workspace-level adoption，而不是默认 user-global 全开。
- 对“技能非常多但命中率低”的集合做 profile 分层。

投入产出判断：
- 收益中高，尤其对广泛分发的 global harness 用户价值大。
- 风险是某些高级流程默认不可用，但这比所有会话持续付费更容易接受。

### Phase 5: 改写 planning 恢复模型，优先热摘要而不是大文件头部重放

目标：压低长任务、多阶段任务的恢复税。

动作：
- 引入更小的 hot summary artifact，记录当前 phase、关键决策、最近进展、下一步。
- 让 hooks 优先注入 hot summary，而不是 task_plan 前 N 行 + progress 后 N 行的固定组合。
- 仅在需要时让 agent 自己读取详细 planning 文件，而不是每轮自动预载。

投入产出判断：
- 对 tracked task 收益很高。
- 这一步对 Harness 效能影响最敏感，需要以“不丢恢复能力”为前提推进。

### Phase 6: 建立预算门禁与回归测试

目标：防止后续演化重新把 token 税加回来。

动作：
- 为 entry、hook payload、planning hot context、skill profile 增加预算回归检查。
- 在 `doctor` / `verify` 中输出预算告警与“global + workspace 重叠税”提示。
- 对 Copilot 特别增加 usage-oriented smoke checks，验证“短任务不应携带长任务级上下文”。

投入产出判断：
- 技术成本中等，但长期 ROI 很高。
- 没有这一步，前面几轮优化很容易被后续规则扩张吃回去。

## 优先级建议

如果只做前三件事，就按这个顺序：

1. 成本可观测性
2. 薄 always-on entry
3. hook 摘要化

原因：
- 这三件事同时覆盖了短任务和长任务。
- 它们主要削减的是“无差别重复税”，对 Harness 核心价值伤害最小。
- skill profile 与 planning 恢复优化虽然重要，但更适合在前面三步有度量基础后迭代。

## 预期效果

如果计划按优先级落地，预期会出现三类改善：

- 短问短答：固定成本显著下降，避免“问一个小问题先交一大段系统税”。
- 中等复杂度任务：每轮 input 变轻，重复 cached token 成本下降。
- 长任务：恢复信息更聚焦，hooks 不再把大量低价值文本反复塞进 prompt。

## 不应做的事

- 不要直接删除 planning-with-files 或 superpowers 这类高价值能力。
- 不要只盯 output token，忽略 repeated input/cached tax。
- 不要为了省 token 把复杂任务重新推回“无状态裸聊”，那会把失败率和返工成本抬上去。

## 执行前建议

真正进入实现前，应该先把本计划拆成一个以 ROI 为顺序的执行计划，并为每一阶段定义：

- 预算目标
- 不可退让的效能指标
- 回归验证方式
- 失败时的回退路径