# 项目 roadmap/backlog/follow-up 全量审计 Companion Plan

Active task path: `planning/active/project-roadmap-audit/`
Lifecycle state: waiting_review
Sync-back status: waiting_review, summary synced

## Purpose

保存本轮 Superpowers 详细审计计划、文件矩阵、任务分类、清理判据和版本拆分依据。权威任务状态仍以 `planning/active/project-roadmap-audit/` 为准。

## Detailed Audit Checklist

1. 盘点所有 roadmap/backlog/follow-up/planning 相关文件。
2. 读取 README、AGENTS、scripts、package metadata 和关键 docs，建立项目能力现状。
3. 逐项审计 `planning/active/*/task_plan.md`、`findings.md`、`progress.md`。
4. 标记每个 task 的状态：active、waiting_review、blocked、closed、stale、duplicate、superseded、mergeable。
5. 判断可清理动作：close、archive、merge into roadmap、keep active、needs user review。
6. 输出至少 5 个版本的路线计划，覆盖 foundation、cleanup、cross-IDE、automation、adoption、polish/release。
7. 执行安全清理：只更新证据充分、边界清楚的 planning files；不覆盖既有未归属改动。
8. 复查 diff、状态分布和本轮 planning sync-back。

## Cleanup Guardrails

- 不自动归档没有 `Status: closed` 且 `Archive Eligible: yes` 的任务。
- 不修改当前已有未归属改动，尤其是 `global-rule-context-load-analysis` 下的两个文件。
- 不把 companion plan 当成长期权威状态；详细 checklist 放这里，摘要回写 active task 三件套。
- 若任务只有“看起来完成”，但缺少 lifecycle block 或验证记录，只能标记为候选，不能直接归档。

## Version Planning Frame

初始版本框架待审计后校准：

- v0.1: Planning hygiene and stale task cleanup.
- v0.2: Roadmap/backlog consolidation.
- v0.3: Cross-IDE instruction and projection stability.
- v0.4: Automation and adoption reliability.
- v0.5: Release readiness, documentation, and verification loop.

## Audit Matrix

### Source Files

| Source | Role | Audit Result |
| --- | --- | --- |
| `docs/roadmap.md` | 显式 roadmap | 3 个 roadmap items，均围绕 safety overlay / safety hook / default posture |
| `README.md` | 当前项目入口和能力地图 | 项目定位清楚，核心能力覆盖 install/sync/doctor/status/fetch/update/verify/adopt-global/adoption-status/summary/worktree/checkpoint/cloud-bootstrap/link-personal |
| `planning/active/active-followup-consolidation/` | follow-up 汇总 | 已把 active backlog 分为报告收口、实现收口、长尾运行三批 |
| `planning/active/post-upstream-automation-followups/` | upstream automation follow-up | 只剩 2026-05-08 首次 scheduled run 观察 |

### Active Task Lifecycle Snapshot

| Bucket | Tasks |
| --- | --- |
| Archived during this audit | `companion-plan-warning-governance`, `session-summary-mechanism`, `worktree-naming-governance` |
| Ready to close/archive after transfer | `active-followup-consolidation`, `planning-lifecycle-audit-review`, `planning-timestamp-heading-audit`, `spec-review-planning-recovery-brief-hot-summary` |
| Second cleanup wave | `typemint-skill-duplication-check`, `gstack-harness-comparison-analysis`, `backup-fix-session-investigation`, `rename-repo-superpowering-with-files` |
| Waiting review / PR / decision | `cross-ide-projection-audit`, `cross-ide-single-source-consolidation`, `origin-cloud-harness-deployment-plan`, `readme-slim-pr` |
| Active backlog | `cross-ide-hook-capability-alignment`, `cursor-official-load-model-research`, `global-rule-context-load-analysis`, `harness-template-foundation`, `post-upstream-automation-followups`, `rtk-support-feasibility-analysis` |
| Invalid active residue | `verify-backup-governance-on-dev` empty directory, removed during this audit |

## Version Plan

| Version | Theme | Primary Work |
| --- | --- | --- |
| v1.1 | Planning hygiene and active task cleanup | Keep only decision/review/event/implementation tasks active; archive completed task state. |
| v1.2 | Cross-IDE projection and hook closure | Finish projection audit, hook alignment, single-source review, and Cursor official loading evidence. |
| v1.3 | Context budget and skill discovery governance | Finish budget governance, RTK feasibility report, duplicate-skill dedupe, and generic target brief/hot regressions. |
| v1.4 | Safety overlay, cloud harness, and automation follow-through | Complete scheduled upstream run observation, review cloud harness plan, implement additive safety overlay, reduce safety false positives. |
| v1.5 | Workflow productization and operator experience | Convert gstack lessons into Harness workflow lanes, close README PR, keep docs concise, define optional eval/browser contracts. |
| v1.6 | Release readiness and adoption stabilization | Close foundation umbrella, align release docs and renamed repo state, stabilize adoption reports, re-evaluate safety defaults after overlay proof. |

## Cleanup Result

- Archived 11 planning tasks during this audit.
- Removed 1 empty invalid active directory: `planning/active/verify-backup-governance-on-dev/`.
- Remaining active directories: 11 including this audit task.
- Kept external/concurrent edits untouched:
  - `planning/active/global-rule-context-load-analysis/findings.md`
  - `planning/active/global-rule-context-load-analysis/progress.md`
  - `planning/active/origin-cloud-harness-deployment-plan/findings.md`
  - `planning/active/origin-cloud-harness-deployment-plan/progress.md`
  - `planning/active/origin-cloud-harness-deployment-plan/task_plan.md`
