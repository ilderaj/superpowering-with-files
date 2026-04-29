# Copilot usage-based billing 对 Harness 开销影响分析与优化规划

## Goal
基于当前 Harness 的真实上下文装载路径，先完成 usage-based billing 影响分析与优化计划，再按不明显削弱 Harness 约束效果的前提，分阶段落实高 ROI 的 Copilot usage 优化。

## Current State
Status: closed
Archive Eligible: yes
Close Reason: merged into local dev, projections synced to the latest code, and published to origin/dev on 2026-04-29.

## Current Phase
Phase 13

## Companion Plans
- Companion plan: `docs/superpowers/plans/2026-04-28-copilot-usage-optimization-implementation-plan.md`
- Companion summary: Detailed implementation plan covering cost ledger fidelity, lean skill defaults, planning recovery v2, overlap governance, budget gates, and opt-in concise output guidance.
- Companion plan: `docs/superpowers/plans/2026-04-28-copilot-usage-billing-impact-analysis-plan.md`
- Companion summary: Original plan-only analysis of usage-based billing impact, retained as the historical decision record for this tracked task.
- Sync-back status: closed on 2026-04-29 after merge into local dev, projection sync, final verification, and push to origin/dev.

## Phases

### Phase 1: 计费变化与现状基线收集
- [x] 提取 GitHub usage-based billing 的核心变化
- [x] 找到仓库内已有的上下文/token 体积基线
- [x] 记录与本任务直接相关的代码/文档锚点
- **Status:** complete

### Phase 2: 场景化开销模型设计
- [x] 定义不同使用场景
- [x] 拆分 input / output / cached token 成本来源
- [x] 标记高杠杆优化点
- **Status:** complete

### Phase 3: 优化计划编写
- [x] 制定分阶段 usage 优化方案
- [x] 说明收益、风险、对效能的影响
- [x] 写入人类可读的计划文档
- **Status:** complete

### Phase 4: 交付与状态收敛
- [x] 向用户输出计划而不执行
- [x] 回写任务状态与结论摘要
- **Status:** complete

### Phase 5: 第 1 阶段可观测性实现
- [x] 选择最小实现切口
- [x] 以 TDD 方式补充失败测试
- [x] 为 `verify` / `health` 增加 context ledger summary
- **Status:** complete

### Phase 6: 定向验证与交付
- [x] 跑窄测试验证实现
- [x] 回写 findings / progress
- [x] 运行一次仓库内实际 `verify` 生成报告
- **Status:** complete

### Phase 7: Copilot 薄 always-on entry
- [x] 以 TDD 增加 Copilot 默认薄入口失败测试
- [x] 仅对 Copilot 的 `always-on-core` 做 target-specific thin profile 映射
- [x] 保持安装态 `policyProfile` 仍为 `always-on-core`
- **Status:** complete

### Phase 8: Copilot planning hook 摘要化
- [x] 以 TDD 增加 Copilot `session-start` / `pre-tool-use` 紧缩失败测试
- [x] 将重复 hot context 改为事件级短摘要，同时保留 `user-prompt-submit` 的完整 hot context
- [x] 完成 entry + hooks 的定向回归与真实 `verify`
- **Status:** complete

### Phase 9: 后续优化 impl plan 编制
- [x] 汇总当前已完成的 usage 优化基线
- [x] 盘点 skill / planning / adoption / budget 的下一阶段切口
- [x] 产出完整实现计划供 review
- **Status:** complete

### Phase 10: Impl plan execution in isolated worktree
- [x] 完成 Copilot ledger fidelity、lean default skills、planning recovery v2、overlap governance、budget gates、opt-in concise guidance 的代码落地
- [x] 将实现限制在 Copilot target-aware slimming，不扩大其他 adapter 的默认约束面
- [x] 保持 persisted policy profile 语义稳定，并通过 focused regression suite 验证
- **Status:** complete

### Phase 11: Branch-specific review and live verification
- [x] 在 `202604281445-copilot-usage-billing-impact-analysis-001` worktree 上重新核对 branch、HEAD、代码落点与 companion plan 对应关系
- [x] 运行 focused regression suite，确认实现分支 `101 passed, 0 failed`
- [x] 执行 Copilot-only live install，再运行 `verify` 与 `doctor --check-only` 验证预算与约束面
- **Status:** complete

### Phase 12: Planning governance cleanup and merge gate
- [x] 回填 active task 对 analysis companion artifact 的引用
- [x] 为 primary companion plan 补齐 `Active task path`、`Lifecycle state`、`Sync-back status`
- [x] 将任务状态推进到 `waiting_integration`，只保留 merge 前的常规集成动作
- **Status:** complete

### Phase 13: Integration and publication
- [x] 将 `202604281445-copilot-usage-billing-impact-analysis-001` merge 回本地 `dev`
- [x] 在 merged `dev` 上重新运行 focused regression suite
- [x] sync 本地 projections 后重新运行 `verify` / `doctor --check-only`
- [x] 将任务生命周期收口并发布到 `origin/dev`
- **Status:** complete

## Merge Gate
- `node --test tests/installer/health.test.mjs tests/installer/commands.test.mjs tests/installer/adoption.test.mjs tests/hooks/task-scoped-hook.test.mjs tests/hooks/hook-budget.test.mjs tests/hooks/session-summary.test.mjs tests/installer/policy-render.test.mjs tests/installer/copilot-usage-budget.test.mjs`
	- Passing standard: `101 passed, 0 failed` on branch `202604281445-copilot-usage-billing-impact-analysis-001`
- `node harness/installer/commands/harness.mjs install --scope=workspace --targets=copilot --projection=link --profile=always-on-core --hooks=on`
	- Passing standard: exits `0` and materializes only the Copilot workspace projection for live validation
- `node harness/installer/commands/harness.mjs verify --output=.harness/verification-ledger && ./scripts/harness doctor --check-only`
	- Passing standard: `Harness check passed.`, no companion-plan warnings, `Scope overlap verdict: ok`, `Hook payload target: copilot`, `Context warnings: 0`

## Risk Assessment

| 风险 | 触发条件 | 影响范围 | 缓解 / 已落盘的回退方案 |
|---|---|---|---|
| 计划只基于抽象判断，未绑定真实实现路径 | 未核对 entry / hooks / planning 恢复代码 | 优化建议可能偏离当前 Harness | 先以已有 token 基线为锚，再补充最小必要代码锚点 |
| 过度压缩导致 Harness 失去流程约束力 | 只追求 token 降低，不评估行为退化 | 规则执行率、恢复能力、跨 IDE 一致性下降 | 计划按 ROI 分层，优先削减重复税和无差别注入 |
| 将 cached token 误视为“免费” | 新计费把 cached token 也计入 credits | 预算判断失真 | 在场景模型中单独列 cached token 并区分“便宜但不为零” |

## Key Questions
1. 当前 Harness 的固定 chat 成本主要来自哪些 always-on / hook / 恢复路径？
2. 哪些场景会把这些固定成本反复放大成 usage-based billing 下的主要账单来源？
3. 哪些优化能在不明显伤害效能的前提下，优先降低 input/output/cached token 总成本？

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| 新建独立 tracked task 而不是复用旧任务 | 本次问题面向 Copilot usage-based billing，结论需与既有“全局上下文治理”分析隔离 |
| 以 `global-rule-context-load-analysis` 作为初始证据锚点 | 该任务已量化 entry、skills 与 hooks 的近似 token 体积，可直接复用 |
| 本轮只输出计划，不执行优化 | 用户明确要求“不要直接执行，先输出计划” |
| 第 1 阶段先落地 `verify` / `health` 的 context ledger summary | 现有测量与预算原语已存在，补 summary 和报告是成本最低、反馈最快的实现切口 |
| `planningHotContext` 直接复用 `buildPlanningHotContext` | 这是 hooks 已经在用的真实热上下文生成逻辑，避免二次定义 |
| `skillProfile` 先定义为 hook-enabled 场景下的技能发现面账本 | 这样能补可观测性，又不会在轻量 entry-only 检查里引入高噪声回归 |
| Copilot 默认入口单独映射到 `copilot-always-on-thin` | Copilot override 已明确要求 thin entry，且只对该 target 收紧能最小化跨平台回归风险 |
| Copilot planning hooks 只压缩 `session-start` 与 `pre-tool-use` | 这两类事件重复且高频，改为摘要能降低固定税与 cached token，同时保留 `user-prompt-submit` 的恢复能力 |
| 下一阶段优先级定为 ledger fidelity → lean skills → planning recovery v2 → overlap governance → budget gates | 这个顺序先打稳可观测性与默认固定税，再处理长会话重复税，最后上治理与回归门禁 |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
|       | 1       |            |

## Notes
- 当前阶段重点是把“开销来源”映射到真实 Harness 路径，而不是提前做方案细节实现。
- 若后续进入执行阶段，需要单独评估哪些优化属于 source 侧一次性改动，哪些属于 platform/profile 配置策略。
- 当前轮次已完成“分析 + 计划”交付；后续若推进实现，应从 `waiting_execution` 状态继续。
- 当前已进入执行阶段，并完成路线图的前 3 个高 ROI 步骤：可观测性、Copilot 薄入口、Copilot planning hook 摘要化。
- 当前已补完一份可执行的 impl plan，后续若启动实现，建议按 Companion Plan 里的 Batch A / B / C 串行推进。
- 当前用于 merge readiness 判断的唯一权威 review surface 是 worktree `202604281445-copilot-usage-billing-impact-analysis-001`，而不是主工作区 `dev`。
- merge ready 在本任务里表示“代码、测试、live Copilot verify/doctor、planning/companion 治理都已通过”，不等于已经执行实际 merge。
- 本任务现已完成 merge、projection sync、final verification 与 origin/dev 发布，可按 archive 规则择机归档。