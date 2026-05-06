# 项目 roadmap/backlog/follow-up 全量审计发现

## Durable Findings

- 本轮任务按 tracked/deep 处理，因为它包含多阶段审计、任务清理、版本规划和 durable decision 输出。
- 用户显式要求使用 `using-superpowers`，因此本轮建立 companion plan，并保持 `planning/active/project-roadmap-audit/` 为权威任务状态。
- 当前工作区已有非本轮修改：`planning/active/global-rule-context-load-analysis/findings.md` 与 `planning/active/global-rule-context-load-analysis/progress.md`。本轮不得覆盖这些改动。

## Audit Notes

- 文件盘点确认：`docs/roadmap.md` 是唯一显式 roadmap 文件；未发现独立 `backlog.md`，backlog 主要存在于 `planning/active/*` 与 `docs/superpowers/plans/*`。
- `docs/roadmap.md` 当前只有 3 个 active roadmap items：workspace safety overlay、safety hook false-positive reduction、default safety posture re-evaluation。
- `planning/active/active-followup-consolidation/` 是既有 follow-up 汇总项目，已把仍需保持 active 的任务分为报告收口、实现收口、长尾运行三批。
- `planning/active/post-upstream-automation-followups/` 当前唯一未完成动作是等待 2026-05-08 20:05 Asia/Shanghai heartbeat 后观察首次 scheduled upstream refresh run。
- 当前 active task 状态分布初步为：active 9 个（含本轮）、waiting_review 8 个、closed 4 个、空目录 1 个。
- 清理后 active task 降为 11 个目录，其中 1 个是本轮 `project-roadmap-audit`，其余 10 个均有明确保留原因。
- 本轮已把版本计划写入 `docs/roadmap.md`，包含 v1.1 到 v1.6 六个版本。

## Cleanup Decisions

- 可立即归档：`companion-plan-warning-governance`、`session-summary-mechanism`、`worktree-naming-governance`，因为它们均为 `Status: closed` 且 `Archive Eligible: yes`。
- 已完成但待收口的 planning/meta 任务：`active-followup-consolidation`、`planning-lifecycle-audit-review`、`planning-timestamp-heading-audit`、`spec-review-planning-recovery-brief-hot-summary`。这些任务的结论已纳入本轮 audit，可以关闭归档，减少 active 噪音。
- `spec-review-planning-recovery-brief-hot-summary` 的开放发现不是该 audit task 未完成，而是后续 backlog：generic targets 仍会在 compact/change-detect 事件输出 HOT CONTEXT，需并入 cross-IDE context budget/brief recovery 版本计划。
- `verify-backup-governance-on-dev/` 是空目录且没有三件套 planning files，属于异常残留；已确认只可作为空目录清理，不可当作正常 active task 归档。
- 保留不清理：仍有开放 PR / 外部动作 / 未来 heartbeat / 未执行方案的任务，包括 `cross-ide-single-source-consolidation`、`cross-ide-projection-audit`、`origin-cloud-harness-deployment-plan`、`readme-slim-pr`、`rename-repo-superpowering-with-files`、`post-upstream-automation-followups`。
- 第二批可关闭归档：`typemint-skill-duplication-check`（重复候选根因已明确）、`gstack-harness-comparison-analysis`（对比结论与后续队列已明确）、`backup-fix-session-investigation`（根因和预防方案已明确）、`rename-repo-superpowering-with-files`（GitHub rename、remote、文档和验证已完成，PR 已合并到 `dev`）。
- 继续保留的 review/PR 任务：`readme-slim-pr`（PR #29 仍是 review 交付语义）、`cross-ide-single-source-consolidation`（PR #22 仍是 review 交付语义）、`cross-ide-projection-audit`（实现 worktree 已完成但未提交/集成决策待定）。
- 继续保留的 active 实施任务：`cross-ide-hook-capability-alignment`（只剩 dev integration）、`post-upstream-automation-followups`（等待 2026-05-08 heartbeat）、`global-rule-context-load-analysis`（当前有外部未归属修改，不在本轮覆盖）、`harness-template-foundation`（foundation umbrella，多个 companion plans，暂不机械关闭）。
- 继续保留的研究/方案任务：`cursor-official-load-model-research`（缺完整官方链接交付）、`rtk-support-feasibility-analysis`（Phase 5 report delivery 仍 in_progress）、`origin-cloud-harness-deployment-plan`（外部并发更新后等待 review）。

## Final Remaining Active Queue

| Task | Status | Keep Reason | Roadmap Version |
| --- | --- | --- | --- |
| `cross-ide-hook-capability-alignment` | active | Phase 6 dev integration / push 未完成 | v1.2 |
| `cross-ide-projection-audit` | waiting_review | 实现 worktree 完成但提交/集成决策待定 | v1.2 |
| `cross-ide-single-source-consolidation` | waiting_review | PR #22 review 语义仍存在 | v1.2 |
| `cursor-official-load-model-research` | active | 需要补完整官方链接交付 | v1.2 |
| `global-rule-context-load-analysis` | active | 当前有外部未归属修改，且预算治理仍是主线任务 | v1.3 |
| `rtk-support-feasibility-analysis` | active | Phase 5 report delivery 仍 in_progress | v1.3 |
| `origin-cloud-harness-deployment-plan` | waiting_review | 外部并发更新后等待 review | v1.4 |
| `post-upstream-automation-followups` | active | 等待 2026-05-08 20:05 Asia/Shanghai heartbeat | v1.4 |
| `readme-slim-pr` | waiting_review | PR #29 review 语义仍存在 | v1.5 |
| `harness-template-foundation` | active | foundation umbrella 和 release/adoption closeout 仍需明确 | v1.6 |

## Version Plan Summary

| Version | Theme | Key Scope |
| --- | --- | --- |
| v1.1 | Planning hygiene and active cleanup | 关闭/归档已完成任务，保持 active 队列可解释 |
| v1.2 | Cross-IDE projection and hook closure | 投影路径、hook lifecycle、single-source、Cursor facts |
| v1.3 | Context budget and skill discovery governance | budget ledger、lean global profile、RTK、duplicate skill dedupe |
| v1.4 | Safety overlay, cloud harness, automation follow-through | safety overlay、false positives、cloud repo-local harness、scheduled run |
| v1.5 | Workflow productization and operator experience | gstack lane 借鉴、README/PR、workflow lanes、eval/browser contract |
| v1.6 | Release readiness and adoption stabilization | foundation closeout、release docs、adoption reproducibility、default safety posture |
