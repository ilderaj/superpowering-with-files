# Findings & Decisions

## Requirements
- 分析 GitHub Copilot 从 PRU/request-based 切到 usage-based billing 后，对当前 Harness 在不同 chat 场景下的成本影响。
- 需要覆盖 input、output、cached token 三类消耗，而不是只看 prompt 大小。
- 需要给出一个“不明显削弱 Harness 效能”的 usage 优化计划。
- 本轮只输出计划，不直接执行改动。

## Research Findings
- GitHub 将从 2026-06-01 起把 Copilot premium request units 替换为 GitHub AI Credits。
- 使用量将按 token 消耗计费，明确包括 input、output、cached tokens。
- code completions 和 Next Edit suggestions 仍包含在套餐内，不消耗 AI Credits；本任务应聚焦 chat / agentic session。
- fallback 低价模型兜底将不再可用，意味着超额 usage 不再由平台默默吸收，而是会直接反映为预算和 spend 控制问题。
- 现有仓库任务 `planning/active/global-rule-context-load-analysis/` 已记录关键基线：
  - shared `base.md` 约 4096 tokens。
  - 各平台 rendered entry 约 4.1k-4.2k tokens，说明 shared policy 是主要固定税来源。
  - Harness 管理的核心 skills 量级约 30k+ tokens；若平台未充分懒加载，会形成显著背景面。
  - superpowers session-start 与 planning-with-files hooks 会把 skill 内容和 task hot context 注入 prompt，这会直接转成 usage-based billing 下的 input/cached 成本。
- `harness/core/context-budgets.json` 已存在预算原语：
  - `entry.warn = 7500 tokens`
  - `hookPayload.warn = 3000 tokens`
  - `planningHotContext.warn = 4000 tokens`
  - `skillProfile.warn = 5500 tokens`
  这些预算已足够作为场景分析的成本边界输入。
- `harness/installer/lib/health.mjs` 在实现前已经有：
  - `context.entries` 和 `context.hooks` 的测量能力
  - `context.planning` 与 `context.skillProfiles` 的容器占位
  - 但 `context.summary` 只汇总了 `entries`
- `harness/core/hooks/planning-with-files/scripts/task-scoped-hook.sh` 的真实 planning 热上下文来源是 `render-hot-context.mjs`，其核心实现通过 `buildPlanningHotContext()` 生成。
- `harness/installer/lib/planning-hot-context.mjs` 已对外 re-export `buildPlanningHotContext`，适合在 installer health 层直接复用。
- 将 `skillProfile` 直接按所有 `SKILL.md` 正文求和会把轻量安装场景也变成预算问题；第一版更合理的定义是“当前 profile 在 hook-enabled 场景下的技能发现面账本”。
- Copilot 默认入口此前与其他 target 共用 `always-on-core` section 集，导致 `When Superpowers Is Allowed`、`When Superpowers Is Not Allowed`、`Tool Preferences` 这些对 Copilot startup 不必要的固定税持续进入 input。
- Copilot planning hook 此前在 `session-start`、`user-prompt-submit`、`pre-tool-use` 上重复注入同一份 hot context；其中 `session-start` 与 `pre-tool-use` 的恢复收益低于它们带来的重复 input / cached token 成本。
- 当前 merged `dev` 已包含 Copilot hook payload ledger、lean default skills、planning recovery v2、overlap governance、budget gates 与 opt-in concise guidance 的完整实现。
- merged `dev` 上重新运行 focused regression suite，结果仍为 `101 passed, 0 failed`。
- merged `dev` 在执行 `node harness/installer/commands/harness.mjs sync` 更新本地 projections 后，`verify` 与 `doctor --check-only` 均通过；最新 doctor 结果为 `Harness check passed.`。
- merged `dev` 的 live verification 中，hook payload 汇总的 worst target 是 `codex`，同时 detail 里仍显示 `copilot / bootstrap / ok / 88 tokens`，说明 merged global install 已按最新逻辑同时计量 Codex 与 Copilot。
- 为了不覆盖不相关本地内容，merge 前把主工作区中同名的 3 个 planning 文件保存到了 stash `pre-merge copilot usage planning backup`；合并结果以 feature 分支的最新 planning 状态为准。
- worktree `/Users/jared/SuperpoweringWithFiles/.worktrees/202604281445-copilot-usage-billing-impact-analysis-001`、branch `202604281445-copilot-usage-billing-impact-analysis-001`、HEAD `7b8f628` 才是本任务实现完成情况的权威 review surface；主工作区 `dev` 只能作为基线，不可用于本分支 merge readiness 判断。
- implementation plan 的 Tasks 1-6 已在该 worktree 中落地，覆盖面包括 Copilot ledger fidelity、lean default skills、planning recovery v2、overlap governance、budget gates、opt-in concise guidance。
- focused regression suite 在该 worktree 上最新结果为 `101 passed, 0 failed`。
- Copilot-only live install 之后再次运行 `verify` 和 `doctor --check-only`，结果为 `Harness check passed.`，`Scope overlap verdict: ok`，`Hook payload target: copilot`，`Context warnings: 0`，并且 companion-plan warnings 已清零。
- 早先 `sync` 被 `AGENTS.md` ownership guard 拦住，根因是 all-target sync 触发了非 Harness-owned path 保护；这不影响 Copilot-targeted live verification，也不构成当前分支的运行时回归证据。

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| 用“固定税 / 恢复税 / 执行税”作为成本分析主框架 | 与仓库既有分析口径一致，且更适合 usage-based billing 的场景化比较 |
| 将 cached token 单独建模 | 新计费明确 cached token 也消耗 credits，不能被折叠进 input |
| 先做计划，不做代码级整改 | 用户要求先输出计划；当前目标是决策质量而不是实现速度 |
| 第 1 阶段实现只补 context ledger，不重做预算系统 | 现有 `measureText` / `evaluateBudget` / `readHarnessHealth` 已有足够基础 |
| `verify` markdown 报告新增 hooks / planning / skill profile 三类摘要 | 这样 CLI 用户无需翻 JSON 也能看到主要输入成本面 |
| 新增 `copilot-always-on-thin` policy profile，但不改变 persisted `always-on-core` 状态语义 | 这样既能降低 Copilot fixed tax，也不会把安装态和跨平台 policy 语义拆散 |
| Copilot `session-start` 改为 task-path startup cue，`pre-tool-use` 改为最小进度提醒 | 保留行为约束提示，但把完整 hot context 延后到真正需要的 `user-prompt-submit` |
| 下一阶段先补 Copilot ledger fidelity，再改默认 skill profile | 没有观测先改默认值，会让后续收益评估失真；先补测量才能知道 `copilot-default` 带来的实际降幅 |
| planning 恢复 v2 需要做 change-detection，而不是只继续裁文案 | 单纯继续压缩文案会损伤恢复力，只有“内容未变则不重发 full hot context”才能同时保住效能和 usage |

## Issues Encountered
| Issue | Resolution |
|-------|------------|
| 仓库中已有多个上下文治理任务，容易与本次 billing 主题混淆 | 新建独立 task，并把旧任务仅作为证据来源而非执行容器 |
| `~/.agents/skills` 本轮不存在技能文件，真实 skill root 在 workspace `.agents/skills/` | 改为读取 workspace skill 投影，避免错误引用用户目录 |
| `skillProfile` summary 初版会污染 entry-only 预算测试 | 将其测量范围收敛到 `hookMode=on` 场景，保留轻量校验稳定性 |
| Copilot 薄入口如果直接全平台收紧，会改变 Codex / Cursor / Claude 的既有约束面 | 把 profile 映射限制在 `renderEntry(..., 'copilot', 'always-on-core')` 这一个目标级入口 |
| planning hook 如果直接删除 Copilot `pre-tool-use` 输出，可能把 allow 行为交给平台默认值 | 继续输出 `permissionDecision: allow`，只压缩 `additionalContext` |
| 之前误在主工作区 `dev` 上复核 merge readiness，导致 review surface 错位 | 后续每次 review 先同时核对 `pwd`、`git branch --show-current`、`git rev-parse --short HEAD`、`git worktree list`，再开始读取 planning 和代码 |

## Destructive Operations Log
| Command | Target | Checkpoint | Rollback |
|---------|--------|------------|----------|
|         |        |            |          |

## Resources
- GitHub blog: https://github.blog/news-insights/company-news/github-copilot-is-moving-to-usage-based-billing/
- 已有基线任务：`planning/active/global-rule-context-load-analysis/`
- 预算配置：`harness/core/context-budgets.json`
- Copilot compatibility note: `docs/compatibility/copilot-planning-with-files.md`
- 关键实现：`harness/installer/lib/health.mjs`
- 关键实现：`harness/installer/commands/verify.mjs`
- 真实 planning helper：`harness/installer/lib/planning-hot-context.mjs`
- Copilot 入口映射：`harness/installer/lib/adapters.mjs`
- Copilot 薄入口 profile：`harness/core/policy/entry-profiles.json`
- Copilot planning hook：`harness/core/hooks/planning-with-files/scripts/task-scoped-hook.sh`

## Visual/Browser Findings
- GitHub 官方说明明确把 usage-based billing 的对象从“请求单位”切换成“token usage”，并把 input、output、cached token 全部纳入 credits 计算。
- 官方还给出 early May preview bill experience，说明“先建立 usage 可观测性，再做治理”是产品自身推荐路径；这对 Harness 计划意味着第一阶段不该直接重写系统，而应先建立成本可见性与场景预算。
- 当前实现结果说明：对 Copilot 单独做 target-aware slimming，能够在不改 persisted state、不改其他 target 的前提下，先压掉一批 always-on 重复税。
- 当前实现结果说明：把 Copilot planning hook 的完整 hot context 收敛到 `user-prompt-submit`，能降低高频事件的重复输入，同时保留 task 恢复主路径。
- 当前实现结果说明：planning/companion 治理 warning 只要按解析器认可的 `Companion plan` / `Active task path` 字段落盘，就可以通过 `doctor` 做 deterministic 验证，不需要依赖人工解释。
- 当前集成结果说明：merged `dev` 只有在本地 projections 也同步到最新代码后，`doctor` 才能正确评估 planning recovery v2 引入的新 hook helper；这一步现在已经完成。