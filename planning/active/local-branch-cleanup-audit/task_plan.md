# Task Plan: Local Branch Cleanup Audit

## Goal
只读检查当前仓库全部本地分支，审计其与远端、worktree、主线集成状态的关系，并给出可执行但未落地的本地分支清理方案。

## Current State
Status: closed
Archive Eligible: no
Close Reason: 本轮本地与远端 branch/worktree cleanup 审计与经用户批准的清理动作均已完成；当前剩余对象已收敛到需要保留、仍在进行、或因脏 worktree/恢复语义而不应继续删除的集合。

## Current Phase
Phase 1

## Phases

### Phase 1: 上下文恢复与历史约束收集
- [x] 轻扫当前 active tasks，确认不复用旧 task
- [x] 记录当前工作区分支与脏状态
- [x] 回溯历史 branch/worktree cleanup 记录
- **Status:** complete

### Phase 2: 本地分支全量盘点
- [x] 列出全部本地分支、tracking、ahead/behind、最后提交时间
- [x] 识别被 worktree 占用的分支
- [x] 标记未推送、本地独有、已合入、已过期等候选类别
- **Status:** complete

### Phase 3: 清理方案评估
- [x] 按风险分层给出 keep / review / safe-delete 候选
- [x] 说明每类分支的删除前置条件与回退手段
- [x] 记录不建议清理的对象与原因
- **Status:** complete

### Phase 4: 收口与交付
- [x] 汇总审计结论
- [x] 更新 findings / progress
- [x] 输出清理建议但不执行删除
- **Status:** complete

## Recommended Cleanup Tiers

### Tier 1: 现在即可清理的本地分支候选
- `backup/pr41-dev-before-main-merge-20260506`
- `codex/202605060339-verify-worktree-naming-regressions-001`
- `codex/202605070150-roadmap-v1-4-safety-overlay-governance-003`
- `codex/202605070210-roadmap-v1-5-workflow-productization-001`
- `codex/202605070235-roadmap-v1-6-release-readiness-001`
- `copilot/20260503-upstream-refresh-rehearsal-fix-dev`

这些分支当前都满足：不被 worktree 占用、已并入 `dev` 与 `main`。删除前只需确认用户不再需要本地便捷 checkout。

### Tier 2: 先清 worktree，再删分支
- `copilot/202604301444-github-actions-upstream-automation-analysis-001`
- `copilot/20260504-upstream-refresh-rehearsal-final-fix-dev`
- `codex/202605060906-roadmap-v1-1-planning-hygiene-001`
- `codex/202605061018-roadmap-v1-1-planning-hygiene-001`
- `codex/202605061025-roadmap-v1-2-cross-ide-closure-001`
- `codex/202605061218-roadmap-v1-3-context-budget-governance-001`
- `codex/202605061308-roadmap-v1-4-safety-overlay-governance-001`

这些分支已逻辑冗余，但当前 branch ref 仍被 clean worktree 占用。正确顺序是先审查并移除对应 worktree，再删本地分支。`codex/202605061018-*` 还带有 tracking 配置异常，应优先纳入这一批。

### Tier 3: 当前不建议清理
- `dev`
- `main`
- `backup/dev-before-origin-align-20260504`
- `backup/main-before-dev-sync-20260508-1125`
- `automation/upstream-refresh`
- `codex/202605061308-roadmap-v1-4-safety-overlay-governance-002`

原因分别是：主线分支、恢复点、active automation 语义、或仍有未提交修改且被 active task 引用。

## Execution Outcome

- 已执行 Tier 1 全部候选分支删除。
- 已执行 Tier 2 对应 clean worktree 删除与 branch 删除。
- 已保留 Tier 3 全部对象。

## Current Snapshot: 2026-05-11 13:24:00 UTC+8

- 用户额外批准并执行了本地分支 `202605101422-cloud-dev-harness-feasibility-001` 及其对应 clean worktree 的删除。
- 当前剩余本地分支为 8 个：
	- `202605081401-harness-runtime-facade-mcp-001`
	- `automation/upstream-refresh`
	- `backup/dev-before-origin-align-20260504`
	- `backup/main-before-dev-sync-20260508-1125`
	- `codex/202605061308-roadmap-v1-4-safety-overlay-governance-002`
	- `codex/202605080601-upstream-refresh-6-failure-repair-001`
	- `dev`
	- `main`
- 当前剩余 worktree 为 5 个：主工作区 `dev`、`main` worktree、`harness-runtime-facade-mcp` worktree、`upstream-refresh-6-failure-repair` worktree、以及脏的 `roadmap-v1.4-safety-overlay-governance-002` fallback worktree。

## Current Snapshot: 2026-05-11 15:00:00 UTC+8

- 已执行并完成 13 个远端历史分支删除。
- 复核 `git ls-remote --heads origin` 后，当前远端只剩 5 个真实 heads：
	- `automation/upstream-refresh`
	- `cloud-dev`
	- `codex/202605060906-roadmap-v1-1-planning-hygiene-001`
	- `dev`
	- `main`
- 其中 `codex/202605060906-roadmap-v1-1-planning-hygiene-001` 仍未并入主线，因此继续保留。

## Current Snapshot: 2026-05-11 15:04:30 UTC+8

- 已强制删除本地 backup 分支 `backup/main-before-dev-sync-20260508-1125`。
- 当前剩余本地分支为 7 个：
	- `202605081401-harness-runtime-facade-mcp-001`
	- `automation/upstream-refresh`
	- `backup/dev-before-origin-align-20260504`
	- `codex/202605061308-roadmap-v1-4-safety-overlay-governance-002`
	- `codex/202605080601-upstream-refresh-6-failure-repair-001`
	- `dev`
	- `main`
- 当前远端 `origin/codex/202605060906-roadmap-v1-1-planning-hygiene-001` 被重新归类为“可单独 review 后删除”的对象，而非“必须保留”的对象，因为它只承载未合入的 planning 历史。

## Current Snapshot: 2026-05-11 15:06:30 UTC+8

- 已执行并完成远端分支 `origin/codex/202605060906-roadmap-v1-1-planning-hygiene-001` 删除。
- 复核 `git ls-remote --heads origin` 后，当前远端只剩 4 个真实 heads：
	- `automation/upstream-refresh`
	- `cloud-dev`
	- `dev`
	- `main`
- 这意味着远端历史 feature / planning 分支已经清理完成，远端集合收敛到主线与仍需保留的 automation lane。

## Final Conclusion

- 本地 cleanup 结果：剩余 7 个本地分支，均不属于“立即安全删除”对象。
- 远端 cleanup 结果：剩余 4 个真实 heads，远端历史 feature / planning 分支已清理完成。
- 后续边界：
	- 继续保留：`dev`、`main`、`cloud-dev`、`automation/upstream-refresh`。
	- 继续保留本地恢复点：`backup/dev-before-origin-align-20260504`。
	- 暂不处理：`202605081401-harness-runtime-facade-mcp-001`、`codex/202605061308-roadmap-v1-4-safety-overlay-governance-002`、`codex/202605080601-upstream-refresh-6-failure-repair-001`，因为它们要么未并入主线，要么仍绑定脏 worktree / active task。

## Risk Assessment

| 风险 | 触发条件 | 影响范围 | 缓解 / 已落盘的回退方案 |
|---|---|---|---|
| 把仍被 worktree 占用或仍有用途的分支误判为可删 | 只看 merge 状态，不看 worktree / active task /远端用途 | 本地开发流与恢复路径 | 审计同时检查 worktree、tracking、最近用途与历史任务记录 |
| 把“仅 planning 提交”与“真实代码差异”混为一类 | 当前 `dev` ahead 1，且工作区有未提交状态 | 分支优先级判断失真 | 分开记录代码分支、planning-only 漂移与当前脏状态 |
| 基于过期远端引用判断已合入/已失效 | 未先 fetch | 清理建议失真 | 先刷新远端再做矩阵 |

| Timestamp | Command | Target | Workspace Boundaries | Checkpoint | Rollback |
|---|---|---|---|---|---|
| 2026-05-11 13:21:26 UTC+8 | `git worktree remove .worktrees/202605101422-cloud-dev-harness-feasibility-001 && git branch -d 202605101422-cloud-dev-harness-feasibility-001` | 本地 clean worktree `/Users/jared/SuperpoweringWithFiles/.worktrees/202605101422-cloud-dev-harness-feasibility-001` 与对应本地分支 `202605101422-cloud-dev-harness-feasibility-001` | 仅限当前仓库本地 refs 与本地 worktree 挂载；不触及 `origin/*` 远端分支 | `/Users/jared/.agent-config/checkpoints/SuperpoweringWithFiles/2026-05-11T05-21-26Z` | 如需回退，可用 checkpoint 恢复整个仓库状态，或基于 `f11120a` 重新创建本地分支并重新挂载 worktree。 |
| 2026-05-11 14:56:03 UTC+8 | `git push origin --delete readme-slim-pr copilot/202604301444-github-actions-upstream-automation-analysis-001 copilot/20260503-upstream-refresh-layout-compat-dev copilot/20260503-upstream-refresh-rehearsal-fix-dev copilot/20260504-upstream-refresh-rehearsal-final-fix-dev copilot/using-subagents-for-plans codex/202605061218-roadmap-v1-3-context-budget-governance-001 codex/202605070150-roadmap-v1-4-safety-overlay-governance-003 codex/202605070210-roadmap-v1-5-workflow-productization-001 codex/202605070235-roadmap-v1-6-release-readiness-001 codex/readme-final-polish codex/rename-repo-superpowering-with-files codex/superpowers-plan-artifact-model` | 13 个已并入 `origin/dev` 与 `origin/main` 的历史远端分支 | 影响当前 GitHub 仓库上的 `origin/*` 远端 refs；不修改本地工作树文件，但会改变共享远端可见分支集合 | `/Users/jared/.agent-config/checkpoints/SuperpoweringWithFiles/2026-05-11T06-56-03Z` | 如需回退，使用已记录的 tip SHA 逐个执行 `git push origin <sha>:refs/heads/<branch>` 重建远端分支；本地 checkpoint 仅用于保留删除前审计上下文。 |
| 2026-05-11 15:01:53 UTC+8 | `git branch -D backup/main-before-dev-sync-20260508-1125` | 本地 backup 分支 `backup/main-before-dev-sync-20260508-1125` | 仅影响当前仓库本地 ref；不触及工作树文件、不触及任何 `origin/*` 远端分支 | `/Users/jared/.agent-config/checkpoints/SuperpoweringWithFiles/2026-05-11T07-01-53Z` | 如需回退，可用 checkpoint 恢复，或基于 tip `fe42a20` 重新创建本地分支 `backup/main-before-dev-sync-20260508-1125`。 |
| 2026-05-11 15:04:18 UTC+8 | `git push origin --delete codex/202605060906-roadmap-v1-1-planning-hygiene-001` | 单个远端分支 `origin/codex/202605060906-roadmap-v1-1-planning-hygiene-001` | 仅影响当前 GitHub 仓库上的一个 `origin/*` 远端 ref；不修改本地工作树文件，也不触及其它远端分支 | `/Users/jared/.agent-config/checkpoints/SuperpoweringWithFiles/2026-05-11T07-04-18Z` | 如需回退，可用已记录 tip `43117876b1dcf9c8a7697261b20a6806601f3283` 执行 `git push origin 43117876b1dcf9c8a7697261b20a6806601f3283:refs/heads/codex/202605060906-roadmap-v1-1-planning-hygiene-001` 重建远端分支。 |

## Key Questions
1. 哪些本地分支仍被 worktree 持有或由 active task 暗示仍在用？
2. 哪些分支相对远端/主线已经完全冗余，可以进入第一批清理候选？
3. 哪些分支虽然未跟踪远端，但仍应保留为恢复点或审计证据？

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| 本任务只做审计与方案，不执行删除 | 用户要求是“审计并评估清理方案”，不是直接清理 |
| 新建独立 `local-branch-cleanup-audit` task | 涉及全量分支盘点、历史记录回溯和风险分层，属于 tracked task |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
|       | 1       |            |
