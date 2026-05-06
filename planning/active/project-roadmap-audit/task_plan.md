# 项目 roadmap/backlog/follow-up 全量审计计划

## Current State
Status: waiting_review
Archive Eligible: no
Close Reason: 已完成 roadmap/backlog/follow-up 审计、版本计划输出和安全范围内的 planning cleanup，等待用户 review。

## Goal

全面审计当前仓库的项目现状、roadmap、backlog、follow-up planning files 与 `planning/active/` 任务状态，输出至少 5 个版本的迭代计划，并在安全边界内尽可能清理已完成、重复、过期或可合并的任务。

## Scope

- 审计 `roadmap`、`backlog`、`follow-up`、`followup`、`todo`、`planning` 相关文件。
- 审计 `planning/active/*/{task_plan.md,findings.md,progress.md}`。
- 汇总项目当前能力、未完成工作、重复任务、风险和版本切分。
- 只在生命周期证据充分时清理任务状态；不自动归档未显式 `closed + Archive Eligible: yes` 的历史任务。
- 避免覆盖当前工作区里已有的非本轮修改。

## Companion Plan

- Companion plan: `docs/superpowers/plans/2026-05-06-project-roadmap-audit.md`
- Companion summary: 用于保存详细审计清单、文件矩阵、版本拆分逻辑和清理判据。
- Sync-back status: waiting_review, summary synced

## Phases

1. 恢复上下文并建立本轮任务状态。
2. 盘点 roadmap/backlog/follow-up/planning 相关文件。
3. 审计全部 active planning tasks，按状态、主题、完成度、可清理性分类。
4. 归纳当前项目现状和未完成任务池。
5. 输出至少 5 个版本的版本/迭代计划。
6. 在安全范围内更新或清理 planning files，并记录无法清理的原因。
7. 复查 git diff 与最终任务状态，确认没有误改无关文件。

## Phase Status

| Phase | Status |
| --- | --- |
| 1. 恢复上下文并建立任务状态 | complete |
| 2. 盘点 roadmap/backlog/follow-up/planning 文件 | complete |
| 3. 审计 active planning tasks | complete |
| 4. 归纳项目现状和未完成任务池 | complete |
| 5. 输出版本/迭代计划 | complete |
| 6. 执行安全 planning cleanup | complete |
| 7. 复查 diff 与最终状态 | complete |

## Finishing Criteria

- 已列出并审计所有可发现的 roadmap/backlog/follow-up/planning 文件。
- 已审计所有 `planning/active/` 任务目录。
- 已输出不少于 5 个版本的迭代计划。
- 已明确哪些任务已清理、哪些保留、哪些需要人工确认。
- 已更新本任务 `task_plan.md`、`findings.md`、`progress.md` 与 companion plan。

## Errors Encountered

| Error | Attempt | Resolution |
| --- | --- | --- |
| `session-summary-mechanism` / `worktree-naming-governance` 首次 archive 被 companion sync 阻止 | 归档 closed+eligible 任务 | 修正 companion path / lifecycle / sync-back metadata 后重跑 archive 成功 |
