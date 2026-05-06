# Task Plan: Post Upstream Automation Followups

## Goal
在不直接执行实现的前提下，整理并评审 upstream automation 审计后的两个后续计划，并把当前 `npm run verify` 的 7 个失败拆分为独立 repair task，避免把运营跟踪、失败现场处置和代码回归修复混在同一个 task 里。

## Current State
Status: waiting_review
Archive Eligible: no
Close Reason:

## Current Phase
Phase 4

## Phases

### Phase 1: 上下文恢复与任务边界确认
- [x] 读取 `github-actions-upstream-automation-analysis` 的最新 audit 结论
- [x] 检查相关 active tasks，确认 `worktree-naming-governance` 已关闭，不能直接复用为本轮 repair task
- [x] 确认本轮先出 plan，不执行实现
- **Status:** complete

### Phase 2: 后续计划 A - 首次 scheduled upstream refresh run 跟踪
- [x] 固化观察窗口、成功/失败分支和产出物
- [x] 明确哪些动作可由 agent 执行，哪些只需要 human review
- [x] 等待用户 review 后再进入执行
- **Status:** complete

### Phase 3: 后续计划 B - stale rehearsal worktree 处置
- [x] 固化失败现场保留策略与清理前证据采集范围
- [x] 明确 destructive cleanup 的执行前置条件
- [x] 等待用户 review 后再进入执行
- **Status:** complete

### Phase 4: 新 verify repair task 切分
- [x] 为 `npm run verify` 的 7 个失败创建独立 task
- [x] 写清 repair 范围、依赖、验证策略和非目标
- [x] 等待用户 review 后再进入执行
- **Status:** complete

## Key Questions
1. 首次 weekly run 是否只需要 agent 在 2026-05-08 20:00 Asia/Shanghai 后跟踪结果，还是需要顺带处置生成的 PR / artifact？
2. stale worktree 应被当作需要保留的失败现场，还是在证据补齐后清理掉？
3. `npm run verify` 的 7 个失败里，哪些属于真实逻辑回归，哪些属于当前 sandbox / HOME 环境噪音？

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| 本轮新建总控 task，而不是继续修改已关闭的 `github-actions-upstream-automation-analysis` | 原 task 已完成并可归档；本轮是后续运营与修复编排，不应污染已关闭交付 |
| verify failures 必须单开 task | 用户明确要求；同时它和 scheduled run 跟踪、stale worktree 处置是不同类型的问题 |
| 当前只产出 plan，不执行实现或清理 | 用户要求先 review plan |
| `worktree-naming-governance` 只作为历史设计依据，不直接复用为活动 task | 该 task 已关闭，且当前失败很可能来自后续演进后的解析漂移 |

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
  1. 再次保存 `git status`、`git diff --stat`、`.harness/upstream-refresh-result.json` 的证据摘要。
  2. 判断是否需要把失败现场转写进新的 repair task，避免 worktree 本身承担长期记忆。
  3. 若用户确认“不保留现场”，再执行 worktree remove / branch cleanup。
  4. 若用户确认“保留现场”，则只补齐 planning 引用和用途说明，不做清理。
- 执行归属：证据整理可由 agent 执行；是否销毁现场需要 human decision，因为属于潜在不可逆清理。

### Verify Repair Task
- 独立 task id：`verify-worktree-naming-regressions`
- 目标：修复当前 `npm run verify` 的 7 个失败，重点收敛 `worktree-name` / `worktree-preflight` 回归，并区分真实逻辑问题与 sandbox/HOME 噪音。

## Notes
- 本 task 只负责 followup orchestration，不直接承接代码修复。
- `github-actions-upstream-automation-analysis` 继续保留为关闭态事实记录；后续执行结果只引用它，不回退其 lifecycle。
