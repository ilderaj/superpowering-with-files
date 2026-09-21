# Decision-Control Runtime 收益对照评估设计 v2（效率优先，成本护栏）

> 2026-09-20审计更正：当前整改规格以 `docs/plans/jev-swf-audit-20260920/spec.md` 为准；执行见同目录plan.md。下文保留原设计历史，冲突处已被新规格取代。T1是契约回放，不是独立预测准确率；WP07保持shadow，不能单凭接入证明效率收益；outputTokens不等于freshTokens；成本按实测全量求和，不减avoidedCost。

状态：**方案，未实施**。本文只回答“怎么证明效率收益且成本不失控”，不改变任何运行时行为。
关联：spec `docs/superpowers/specs/2026-09-19-decision-control-runtime-design.md`；plan `docs/plans/2026-09-19-decision-control-runtime-plan.md`；基线 `docs/plans/2026-09-19-decision-control-runtime-baseline.md`；既有经济性契约 `tests/evals/v20-economics/contract.md`；v1.4 usage 形状 `tests/evals/v14-cross-domain/README.md`。

> v1 版把 Token 当主指标。v2 按你的重定义改为：**效率是主目标，Token 是护栏**。即不要求“更便宜”，只要求“不更贵，或最多 +5% 且被效率收益覆盖”。

---

## 0. 目标重定义

| 维度 | 角色 | 判定 |
|---|---|---|
| 决策更快 | 主目标 | 决策延迟、回合数下降 |
| 输出 Token 更少 | 主目标（同时也是成本下降） | 输出 Token 数下降 |
| 决策更准 | 主目标 | 带 ground truth 的准确率、危险错误率下降 |
| 流程更顺 | 主目标 | 返工/重规划/人工介入/确认次数下降 |
| 总成本 | **护栏** | 净成本 ≤ 基线 × 1.05；超过 1.00 的部分必须被效率收益覆盖 |

**关键结论（必须先讲）**：当前 milestone 里决策层是惰性的，且 deterministic 后端是**纯代码、0 token、亚毫秒**。所以它今天的**新增成本约为 0**，但**新增收益也为 0**（因为它不影响任何一次真实走向）。效率收益只有在 gate 能影响 transition 之后才可测——这正是 WP-07 那个 live caller。**这不是坏消息**：它意味着护栏几乎免费，问题只在于证明效率。

---

## 1. 两个目标族与指标定义

### 1.1 效率指标（主）

| 指标 | 定义 | 采集方式 | 离线可测 |
|---|---|---|---|
| `decisionLatencyMs` | 单次决策墙钟耗时 | trace 已有 `latencyMs` 字段，包一层 `performance.now()` | 是（deterministic 亚毫秒；语义后端才是真实值） |
| `outputTokens` | 任务输出 token 数 | Host usage / v1.4 `usage.freshTokens` | 否（live） |
| `decisionAccuracy` | gate 判断与 ground truth 的一致率 | 混淆矩阵 | **是** |
| `falseDoneRate` | P(判 done \| 真值 ≠ done) | 混淆矩阵 | **是** |
| `prematureExecutionRate` | P(判可执行 \| 真值要求先补 plan/依赖) | 混淆矩阵 | **是** |
| `roundsToResolution` | 任务从开始到验收的回合数 | 真实轨迹计数 | 否（live） |
| `repairLoops` | 返工循环次数 | 真实轨迹计数 | 否（live） |
| `replans` | 重规划次数 | 真实轨迹计数 | 否（live） |
| `humanInterventions` | 人工介入次数 | v20 契约同名字段 | 否（live） |
| `repeatConfirmations` | 重复确认次数 | v20 契约同名字段 | 否（live） |
| `unnecessarySteps` | 多余步骤数 | v20 契约同名字段 | 否（live） |
| `phaseTransitions` | 生命周期阶段转换次数（流程顺畅度代理） | 真实轨迹计数 | 否（live） |

### 1.2 成本护栏指标

| 指标 | 定义 |
|---|---|
| `netFreshTokens` | 该任务全部计量窗口的 `input − cachedInput + output`，**含决策层自身成本** |
| `netTotalTokens` | 次要护栏，`input + output` |
| `gateCostTokens` | 决策层自身消耗（deterministic/operator = 0；语义后端 = 每次决策的 token） |
| `elapsedMs` | 任务整体墙钟 |

净成本公式（必须显式写进报告）：

```text
netCost(arm) = 任务本身成本 + gateCost − 因少返工省下的成本
护栏：netCost(swf) ≤ 1.05 × netCost(baseline)
```

---

## 2. 验收判定规则（复合门）

**一次评估只有在同时满足 A 与 B 时才算“效率正收益且成本可接受”。**

### A. 效率门（主）

预登记**一组**效率主指标（建议：`roundsToResolution`、`repairLoops`、`outputTokens`、`decisionAccuracy`）。要求：

1. **至少一项**主指标改善超过预登记最小效应量（例如 ≥15% 下降，或中位数少 ≥1 个回合）；
2. 改善在**两轮都同向**，并在独立 holdout 上复现；
3. 质量四维（`factual`/`scope`/`usable`/`limitations`）**无回归**。

### B. 成本护栏门

`netCost(swf) ≤ 1.05 × netCost(baseline)`，且：

- 若 `netCost(swf) ≤ netCost(baseline)`：护栏直接通过；
- 若落在 `(1.00, 1.05]`：**“覆盖”条件**——该成本增加必须能归因到决策层，且对应的效率改善已在两轮 + holdout 复现（即 A 已满足）。无法归因或未复现 → 判 `unproven`，不得判通过；
- 若 `> 1.05`：护栏失败 → 判 `not_supported`。

### 判定输出

```text
efficiencyVerdict: improved | unchanged | regressed
costVerdict:       within | covered_band | exceeded
verdict:           supported | unproven | not_supported
```

`supported` 要求 `efficiencyVerdict = improved` 且 `costVerdict ∈ {within, covered_band}`。缺测/未执行/不可比一律 `unproven`，不提升为通过。

---

## 3. 三层执行（重排优先级）

| 层 | 证明什么 | 成本 | 当前是否可做 |
|---|---|---|---|
| **T1 判断准确率** | 决策更准（效率门的一部分，离线可量化） | 低 | **可以，先做** |
| **T1.5 结果锚定反事实回放** | gate 能抓到真实发生的问题 | 中 | 需要带 outcome 的真实轨迹 |
| **T2 live 配对 cohort** | 真实更快/更少返工/更少输出 token，且成本在护栏内 | 高 | **阻塞于 WP-07** |

### T1 — 判断准确率（第一步）

给每个案例补 `groundTruth` 标签，对 gate 与旧行为各算一遍混淆矩阵，产出 `decisionAccuracy`、`falseDoneRate`、`prematureExecutionRate`。**这一层立刻能给出量化对比**，且完全离线。

它证明不了“省 token / 更快”，但能回答“这个 gate 值不值得进入 T2”。若 gate 准确率不比旧行为高，T2 不必做。

### T1.5 — 结果锚定反事实回放（第二步）

用真实已完成任务的最终 outcome 作 ground truth，在真实决策点上离线跑 gate：

- `catchRate` = gate 预警且问题后来真发生；
- `falseAlarmRate` = gate 预警但结果没问题。

比 T2 便宜，且用真实结果而非专家标签。

### T2 — live 配对 cohort（最后）

复用 v20-economics 协议：预登记 → 同一 case 跑 baseline 与 swf 两臂（同 model/effort/工具/输入）→ 两轮 + 独立 holdout → 质量门 → 上节的复合判定。

**效率指标的 live 采集必须在 T2 之前先把埋点做好**（见 §4），否则跑完也拿不到 `roundsToResolution` / `repairLoops`。

---

## 4. 测量机制（怎么真的拿到数）

| 指标 | 采集点 | 现状 | 需补什么 |
|---|---|---|---|
| `decisionLatencyMs` | `evaluateDecision` 外包 `performance.now()` | 字段已有，恒写 `null` | 一行包壳 |
| `gateCostTokens` | 语义后端调用处 | 无 | 只有引入语义后端才需要 |
| `outputTokens` | Host usage / v1.4 `usage` | 有形状，无采集 | 从 Host rollout 读 |
| `roundsToResolution` / `repairLoops` / `replans` / `phaseTransitions` | 真实轨迹计数 | 无 | 一个离线轨迹解析器 |
| `humanInterventions` / `repeatConfirmations` / `unnecessarySteps` | v20 契约字段 | 契约有，填数靠 reviewer | 人工填 + 证据引用 |

**重要**：deterministic/operator 后端下 `gateCostTokens = 0`。所以护栏在“不引入语义后端”的前提下几乎不可能失败——风险只来自任务本身的方差。

---

## 5. 案例集（映射 goal §17，均需补 groundTruth）

| 区域 | 案例 | bundle |
|---|---|---|
| Intake | 平凡快速编辑 / 多步 tracked 编码 / 仅规划 / 执行既有 plan / office 产物 / 高不确定架构 | `intake` |
| Plan Gate | 真正就绪 / 需求不全 / 依赖未解 / 验收含糊 | `plan` |
| Verify Gate | 测试过但目标未达 / 目标达成证据充分 / 需局部修复 / 需重规划 / 基础设施失败 | `verify` |
| Night | 干净成功 / 技术失败 / 需人工阻塞 / 意外扩范围 / 验证失败 | `verify` |
| Office | 确定性过但语义差 / 语义过但确定性失败 | `verify` |
| Release | 就绪未授权 / 就绪已授权 | `release` |

现有 27 例可作起点，但**必须补 `groundTruth`**，否则只是重复 T0。

---

## 6. 实验协议（复用既有）

- 预登记：`cohort.id`、`caseIds`、`holdoutIds`、效率主指标集、`costGuardrailMargin = 0.05`、各输入 hash、`rubricHash`、两臂 `methodHash`、`toolScopeHash`、`preregisteredAt`。
- 两臂对称：同输入、同工具范围、同质量 rubric、同启动清单；计量窗口含 gate 成本。
- 两轮 + 独立 holdout；失败、重试、超时全保留。
- 共享成本（派单/评审/整合）单列，不拆分伪造归因。
- **零差不计为改善；不利案例不得丢弃。**

---

## 7. 需要新建的交付物

1. `tests/fixtures/decision/cases.json` 增补 `groundTruth`（T1）。
2. 决策准确率 runner（离线：混淆矩阵 + 两个危险错误率 + 旧行为对照）。
3. 结果锚定回放 runner（T1.5）。
4. 真实轨迹解析器（产出 `roundsToResolution`/`repairLoops`/`replans`/`phaseTransitions`）。
5. `evaluateDecision` 的 `latencyMs` 包壳（一行）。
6. （T2）预登记 cohort JSON + live 运行协议文档。

全部为**新增、离线、只读输入**，不改运行时行为（第 5 项是唯一触及运行时的，且只填一个已有字段）。

---

## 8. 阻塞与依赖

- **T2 阻塞于 WP-07**：gate 必须能影响走向，效率收益才可测。live caller 不存在，且已判定为架构工作。
- **T1 不阻塞**：纯离线，立刻可做，且直接产出效率门的“决策更准”部分。
- 建议路径：T1 →（gate 更准）→ T1.5 →（catchRate 好）→ 补埋点 → WP-07 caller → T2。

---

## 9. 成本与风险

| 项 | 成本 | 风险 |
|---|---|---|
| T1 标注 | 约 27–40 例专家标注，半天到一天 | 标签主观；需固定 rubric + 独立复核 |
| T1 runner | 低 | 无 |
| 轨迹解析器 | 中 | 轨迹格式依赖 Host；需容错 |
| T1.5 | 需带 outcome 的真实轨迹 | 样本量小、选择偏差 |
| T2 | 高（N case × 2 臂 × 2 轮 live） | 贵；结论仍可能 `unproven`（既有 v20 实验即如此） |

**最大风险**：效率收益若主要来自 `roundsToResolution` 这类 live 指标，则**在 WP-07 之前完全不可测**。因此 T1 的准确率结果是当前唯一能立即拿到的证据。

---

## 10. 待你决定

1. 是否先做 **T1（判断准确率）**？这是唯一立刻可量化、不阻塞的部分。
2. 效率主指标集选哪几个？建议 `roundsToResolution` + `repairLoops` + `outputTokens` + `decisionAccuracy`。
3. `costGuardrailMargin` 确认为 **+5%**？是否需要更严（如 +2%）？
4. T1 的 ground truth 由谁标注、谁复核？
5. 是否同意“先证明判断更准，再投入 live 对照”的顺序？
6. T2 是否等 WP-07 caller 落地后再排期？

在你确认前，我不会写任何 runner，也不会改 fixture。

## 11. 已确认的决定（2026-09-19）

| 项 | 决定 |
|---|---|
| 是否先做 T1 | 是，已执行 |
| 效率主指标集 | `roundsToResolution` + `repairLoops` + `outputTokens` + `decisionAccuracy` |
| 护栏余量 | **+5%**（净成本 ≤ 基线 × 1.05） |
| ground truth 标注/复核 | Chief 标注，两个独立 subagent 复核（已执行） |
| 先准后 live | 同意 |
| T2 排期 | 等 WP-07 live caller 落地后 |

## 12. T1 执行结果（2026-09-19）

离线评估器 `scripts/evaluate-decision-accuracy.mjs`，结果 `tests/fixtures/decision/observed-accuracy-result.json`。

| 指标 | 值 |
|---|---|
| gateAccuracy（运行时 transition 字段） | **0.808** (21/26) |
| answerAccuracy（bundle 答案） | 0.962 (25/26) |
| oldAccuracy（fixture 旧行为列，仅供参考） | 0.423 (11/26) |
| falseDoneRate | 0.043 (1/23) |
| prematureExecutionRate | **1.00** (4/4) |
| unevaluable | 1 |
| structuralGapCases | 7 |

**判定：效率门的“决策更准”部分成立、但被结构性缺口压制。** answer 层 0.962 远高于旧行为 0.423；transition 字段仅 0.808，差距全部来自两个缺口：

- **F23**：intake bundle `composites: []`，INTAKE->PLAN 无法表达，4 个应 plan 的案例全部误报 `continue`（这就是 prematureExecutionRate = 1.00）。
- **F24**：`retry` 在失败分类表里但不在 `DECISION_OUTCOMES`，`resolveNextState` 对基础设施失败完全无反应，把 `failure: timeout` 判成 `done`（唯一的 false-done）。

**方法学修正**：首版 runner 用 `plan_needed` 推 intake 的 truth 又用它算正确率，属循环论证；两个独立 reviewer 各自发现该问题。现行版本分别报告 `gateTransitionVerdict`（headline）与 `gateAnswerVerdict`。

**含义**：T1 已给出第一个量化对比，且是**对 gate 不利**的真实结果。它同时说明：在修 F23/F24 之前，不应进入 T2——因为 live 效率收益的一部分会被这两个缺口抵消。修 F23/F24 是运行时改动，属新切片，需另行授权。

## 13. F23/F24 修复后的 T1 复跑（2026-09-19）

用户授权修复 F23/F24 后重跑 T1。运行时改动三处，均在 `harness/trio/core/decision.mjs`：

| 缺口 | 修复 |
|---|---|
| F23 intake 无 composite | `DECISION_OUTCOMES` 增加 `plan`；intake bundle 增加 composite `intake_route`（读 `plan_needed`），`transitionRecommendationOf('intake')` 现在返回 `plan` 或 `continue` |
| F24 retry 不在词表 | `DECISION_OUTCOMES` 增加 `retry`；`resolveNextState` 现在消费基础设施失败（返回 `retry`，不再判 `done`） |
| F24 次生缺陷 | 新增 `unresolvedDeterministicChecks`：status `unknown` 的检查不再被忽略，验证未完成时返回 `retry` |

| 指标 | 修复前 | 修复后 |
|---|---|---|
| gateAccuracy（运行时 transition 字段） | 0.808 (21/26) | **1.000 (26/26)** |
| answerAccuracy | 0.962 (25/26) | 1.000 (26/26) |
| oldAccuracy（仅供参考） | 0.423 (11/26) | 0.423 (11/26) |
| falseDoneRate | 0.043 (1/23) | **0** |
| prematureExecutionRate | 1.00 (4/4) | **0** |
| structuralGapCases | 7 | **0** |
| expressibleTruthRate | — | 1 |
| unevaluable | 1 | 1 |

**判定：效率门的“决策更准”部分现在成立。** 运行时 transition 字段与设计意图所在的 answer 层已经收敛到同一个表面（1.000），两个危险错误率都归零。唯一仍不可评的 `night-technical-provider-failure` 与词表无关：该 fixture 故意缺一个答案，gate 正确地拒绝猜测。

**必须诚实说明的口径限制**：27 例的标签与 composite 读的是同一份证据（intake 的标签由 `plan_needed` 推出，而 `resolveIntakeRoute` 也读 `plan_needed`）。所以 1.000 证明的是**可表达性 + 内部一致性**，不是独立预测准确率。runner 现在把这一点显式写进 `labelDerivationCaveat`。要证明独立准确率，需要“先写标签、后写 composite”的留出集，即 T1.5。

**对 T2 的含义**：F23/F24 不再抵消 live 效率收益，T2 的前置条件回到唯一的那一条——WP-07 live caller。
