# Findings: Roadmap v1.3 Context Budget Governance

## Scope Boundaries

- `v1.3` 聚焦 context budget、skill discovery、duplicate-skill dedupe、RTK feasibility 与 generic brief/hot context regression。
- `global-rule-context-load-analysis` 仍有并发修改风险；只能在显式边界内接续，不覆盖现有内容。
- 不触碰 `origin-cloud-harness-deployment-plan`，该任务属于 `v1.4`。

## Known Inputs

- Roadmap source: `docs/roadmap.md`
- Master execution companion: `docs/superpowers/plans/2026-05-06-roadmap-implementation-plan.md`
- Related active tasks:
  - `planning/active/global-rule-context-load-analysis/`
  - `planning/active/rtk-support-feasibility-analysis/`

## Open Findings

- `v1.3` 开始前需要先区分“仍需实现的 active task”和“只需把 archived findings 转成 runtime guardrails”的两类工作，再决定子任务切分。

## Durable Outcomes

- `rtk-support-feasibility-analysis` 已收口为 roadmap policy：RTK 保持 optional integration lane，不进入 `v1.3` 核心 upstream 或 runtime 轨道。
- `global-rule-context-load-analysis` 已完成 Phase 7 的 source、verification 与真实 global adoption 收口，并在 sync-back 校验后归档。
- generic target planning hook 现在与 Copilot 一样遵守 compact/brief contract：`session-start` 与 `pre-tool-use` 保持简短，重复 prompt 回退到 `BRIEF CONTEXT`，planning 变化后再恢复 full `HOT CONTEXT`。
- duplicate-skill 诊断已落成 symlink-aware classifier，并在 `doctor` / `health` 中明确区分 `display-duplicate` 与 `true-duplicate`。
- `docs/roadmap.md` 的 `v1.3` 已标记为 complete，并写入 closeout 结果。
