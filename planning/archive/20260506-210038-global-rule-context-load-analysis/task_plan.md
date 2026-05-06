# 全局 Harness 上下文开销治理分析与整改规划

## Current State
Status: closed
Archive Eligible: yes
Close Reason: Context budget governance and global adoption closure completed under roadmap v1.3.
Closed At: 2026-05-06T21:00:17

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
- **Status:** complete
目标：恢复现有 planning 上下文，吸收已有全局规则成本分析与跨 IDE 审计记录。

### Phase 2
- **Status:** complete
目标：量化当前 global harness 的规则/skills/恢复链路成本，并整理本地设计问题假设。

### Phase 3
- **Status:** complete
目标：并行核查各 IDE 官方文档，确认入口与加载机制事实来源。

### Phase 4
- **Status:** complete
目标：汇总问题矩阵，评估各整改方向的通用性、收益成本比、风险与 adopt 难度。

### Phase 5
- **Status:** complete
目标：输出详尽分析报告与整改 plan，包含测试、校准、验证流程。

### Phase 6
- **Status:** complete
目标：面向近期模型与订阅成本上升，重新审计所有支持 IDE 的 Harness token budget 开销，输出一份只供 review 的可行性分析报告，不执行优化改动。

### Phase 7
- **Status:** complete
目标：执行用户批准的 budget 优化路线：补真实 ledger、收紧 user-global 默认 skill profile、保持 deep/tracked 按需展开、落地 IDE-specific budget policy，并完成测试验证。

## Companion Plan

- Companion plan: `planning/archive/20260506-210038-global-rule-context-load-analysis/companion_plan.md`
- Companion summary: 输出了一份可执行的整改计划，覆盖上下文预算、薄入口渲染、planning compact recovery、hook payload 收敛、opt-in skill profile、以及测试/校准/发布门槛，并已在本任务中完成 Phase 7 实施与真实 global adoption 收口。
- Sync-back status: closed at 2026-05-06T21:00:17: Context budget governance and global adoption closure completed under roadmap v1.3.

## 当前关键判断

- 这次问题不是单点“AGENTS.md 太长”，而是 global harness 层的固定成本、恢复成本、技能生态成本和 workspace 叠加成本共同作用。
- 当前最值得先核实的是：
  - 共享 `base.md` 长文本是否仍是绝对主成本
  - global entry + workspace entry + projected skills 是否会形成多层重复
  - `planning-with-files` / `using-superpowers` 等技能在 global adoption 下是否构成持续背景税
  - 哪些优化可以在不推翻现有 projection 架构的前提下完成
- 用户当前明确要求先出详尽报告和整改 plan，因此本任务只做研究、归纳和规划，不改代码。
- 2026-05-06 用户新增要求：全面审计所有支持 IDE 的 token 初始化与运行开销，并输出 budget 可行性分析报告；本轮边界为 analysis/report only，等待用户 review 后再决定是否执行优化。
- 2026-05-06 结论：当前 entry 固定税已降至约 1.0k-1.24k tokens；主要风险转为 skill profile 潜在正文面、global/workspace 叠加、deep/tracked 规则是否常驻、以及真实 per-turn ledger 缺口。本轮报告已写入 findings，状态等待用户 review。
- 2026-05-06 用户批准执行 P0-P4：本轮进入实现阶段，但仍不执行真实 user-global adoption；只改 Harness source、tests、docs 与本任务 planning。

## Phase 7 Implementation Plan

### P0：真实 ledger

- 在 health context 中新增 budget ledger，按 target 输出：
  - session 成本：entry、skill discovery、skill body、skill source、planning hot context。
  - turn 成本：hook payload、planning hot context、pretool/posttool 类重复触发项。
  - install/profile 信息：scope、policyProfile、skillProfile、hookMode、projectionMode。
- `verify --output=stdout` 输出 ledger 摘要，JSON 报告保留结构化明细。
- `doctor --check-only` 在预算 warning/problem 时继续沿用现有 health problem/warning 机制。

### P1：user-global 默认 profile 收紧

- 将 user-global / scope=both 的默认 skill profile 改为 lean profile（优先复用 `minimal-global`）。
- workspace 默认继续允许 `full`，避免破坏 repo-local rich workflow。
- 显式 `--skills-profile=full` 必须继续生效，作为 opt-in。

### P2：deep/tracked 按需展开

- 保持 `always-on-core` 默认不包含 `tracked-task-extended` 和 `deep-reasoning-reference`。
- 增加/保留回归测试，防止 tracked/deep 细则重新进入默认 entry。

### P3：IDE-specific budget policy

- 在代码/文档中明确 target policy：
  - Copilot：thin entry、scope overlap 检查、避免多层 instructions 叠加。
  - Codex/Claude Code：稳定轻入口、skills 按需、hook 摘要化。
  - Cursor：workspace rule 轻量，避免 Always 规则承载大 policy。
- 先作为可验证配置/文档与 report 输出，不引入第二套投影系统。

### 验证门槛

- focused tests：commands / health / policy-render / adoption。
- full tests：`npm run verify`。
- Harness smoke：`./scripts/harness verify --output=stdout`、`./scripts/harness doctor --check-only`。

### Verification Result

- Focused tests passed: `node --test tests/installer/commands.test.mjs tests/installer/adoption.test.mjs tests/installer/health.test.mjs tests/installer/policy-render.test.mjs tests/adapters/skill-profile.test.mjs`，`89/89` passed。
- Full tests passed: `npm run verify`，`326/326` passed。
- Harness smoke passed:
  - `./scripts/harness verify --output=stdout`
  - `./scripts/harness doctor --check-only`
- Residual note: `doctor --check-only` still reports one existing companion-plan warning for `docs/superpowers/plans/2026-04-28-copilot-usage-billing-impact-analysis-plan.md`; exit code remains `0` and this warning predates this phase.
