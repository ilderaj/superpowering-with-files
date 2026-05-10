# Task Plan: Post Upstream Automation Followups

## Goal
执行 upstream automation 审计后的后续动作：安排首次 scheduled run 观察、处置 stale rehearsal worktree，并把 `npm run verify` 的 7 个失败拆分并推进为独立 repair task，避免把运营跟踪、失败现场处置和代码回归修复混在同一个 task 里。

## Current State
Status: closed
Archive Eligible: yes
Close Reason: 首次真实 scheduled run 已观察完成，相关失败已通过独立 repair task 修复，production path 已恢复且 refresh PR `#45` 已成功合并。

## Current Phase
Complete

## Phases

### Phase 1: 上下文恢复与任务边界确认
- [x] 读取 `github-actions-upstream-automation-analysis` 的最新 audit 结论
- [x] 检查相关 active tasks，确认 `worktree-naming-governance` 已关闭，不能直接复用为本轮 repair task
- [x] 明确 followup orchestration、stale worktree cleanup、verify repair 的任务边界
- **Status:** complete

### Phase 2: 后续计划 A - 首次 scheduled upstream refresh run 跟踪
- [x] 固化观察窗口、成功/失败分支和产出物
- [x] 明确哪些动作可由 agent 执行，哪些只需要 human review
- [x] 在 run 前复核一次远端 workflow / variable / protection 状态
- [x] 安排 thread heartbeat 在首次 scheduled run 窗口后自动继续
- [x] 记录 heartbeat 在 2026-05-08 21:06 Asia/Shanghai 的首次观察结果：当时仍未出现 `event = schedule` 的 run
- [x] 记录同日晚些时候首次真实 scheduled run `25559163029`，并把失败转入既有 repair scope
- **Status:** complete

### Phase 3: 后续计划 B - stale rehearsal worktree 处置
- [x] 固化失败现场保留策略与清理前证据采集范围
- [x] 明确 destructive cleanup 的执行前置条件
- [x] 创建 checkpoint 并执行 stale worktree cleanup
- [x] 验证 stale worktree 已移除且远端提交历史未受影响
- **Status:** complete

### Phase 4: 新 verify repair task 切分与回收
- [x] 为 `npm run verify` 的 7 个失败创建独立 task
- [x] 写清 repair 范围、依赖、验证策略和非目标
- [x] 在独立 repair task 中完成修复并回传主工作区验证结果
- **Status:** complete

## Key Questions
1. 2026-05-08 20:05 Asia/Shanghai heartbeat 触发后，如首次 scheduled run 失败，是否需要直接转入新的 repair scope，还是先只做 failure artifact 归档？

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| 本轮新建总控 task，而不是继续修改已关闭的 `github-actions-upstream-automation-analysis` | 原 task 已完成；本轮是后续运营与修复编排，不应污染已关闭交付 |
| verify failures 必须单开 task | 用户明确要求；同时它和 scheduled run 跟踪、stale worktree 处置是不同类型的问题 |
| stale rehearsal worktree 在 checkpoint 后直接清理 | 本地失败现场已充分固化到 planning 与 checkpoint，继续保留只会增加噪音 |
| scheduled run 观察通过 thread heartbeat 续跑 | 唯一剩余动作发生在未来时间窗口，不应阻塞当前修复收口 |
| `worktree-naming-governance` 只作为历史设计依据，不直接复用为活动 task | 该 task 已关闭，且当前失败来自后续实现漂移而不是设计未定 |
| 首次真实 scheduled run 的失败并入 `upstream-refresh-6-failure-repair`，不再单开新的 rollout task | 根因仍在同一条 upstream refresh 修复链路上，只是失败阶段从 refresh 主链路转移到了 PR opening path |

## Planned Followups

### Plan A: First Scheduled Run Watch
- 目标：在 **2026-05-08 20:00 Asia/Shanghai** 之后，验证 `UPSTREAM_REFRESH_SCHEDULE_ENABLED=true` 下的首次真实 scheduled run 是否按设计运行。
- 执行切片：
  1. 在 run 前再次快照远端 workflow / variable / protection 状态。
  2. 轮询 `upstream-refresh.yml` 的最新 `schedule` 事件 run。
  3. 若 `success + no_changes`，记录为稳定空跑基线。
  4. 若 `success + create/update PR`，检查 branch/base/body/result artifact 是否符合 contract。
  5. 若 `failure`，下载 artifact 和 failed-step log，并把问题转入新的 repair scope，而不是回头污染已关闭 rollout task。
- 执行归属：agent 可独立执行；human 只需要 review 结果，不需要手工点 GitHub。

### Plan B: Stale Rehearsal Worktree Disposition
- 目标：处理 `/Users/jared/.config/superpowers/worktrees/SuperpoweringWithFiles/20260503-upstream-refresh-rehearsal-fix` 这份旧 rehearsal 失败现场。
- 执行切片：
  1. 保存 `git status`、`git diff --stat`、`.harness/upstream-refresh-result.json` 的证据摘要。
  2. 创建 checkpoint 作为本地回退点。
  3. 执行 worktree remove / local branch cleanup，保留远端 branch 作为最后一层提交历史。
  4. 回写 planning，明确此失败现场已转为文档化证据，不再依赖 worktree 本体。
- 执行归属：agent 已执行完成；不需要 human 手工操作。

### Verify Repair Task
- 独立 task id：`verify-worktree-naming-regressions`
- 当前状态：已关闭
- 结果：主工作区 `npm run verify` 已恢复到 `319 pass / 0 fail`

## Notes
- 本 task 负责 followup orchestration；代码修复由 `verify-worktree-naming-regressions` 承接并已回传验证结果。
- `github-actions-upstream-automation-analysis` 继续保留为关闭态事实记录；后续执行结果只引用它，不回退其 lifecycle。
- 首次 scheduled run heartbeat 已完成；需要以“窗口内观察快照”而不是“最终未触发结论”来解释 2026-05-08 21:06 Asia/Shanghai 的空结果，因为同日晚些时候首次真实 scheduled run `25559163029` 已经出现并失败。

## Risk Assessment

| 风险 | 触发条件 | 影响范围 | 缓解 / 已落盘的回退方案 |
|---|---|---|---|
| 删除 stale rehearsal worktree 及其本地分支，导致未提交失败现场在本地消失 | 执行 `git worktree remove /Users/jared/.config/superpowers/worktrees/SuperpoweringWithFiles/20260503-upstream-refresh-rehearsal-fix --force`，随后执行 `git branch -D copilot/20260503-upstream-refresh-layout-compat-dev` | 当前仓库的本地 worktree 路径、本地 branch ref，以及该 worktree 中未提交的 refresh 失败产物；不触碰远端 branch | 已创建 checkpoint：`/Users/jared/.agent-config/checkpoints/SuperpoweringWithFiles/2026-05-06T03-36-52Z`。失败现场摘要与 blocked reason 已写入 `planning/active/post-upstream-automation-followups/` 和 `planning/active/github-actions-upstream-automation-analysis/`。如需回退，可从 checkpoint 恢复仓库快照，或重新检出 `origin/copilot/20260503-upstream-refresh-layout-compat-dev` 后按 result file 线索重建分析环境。 |
