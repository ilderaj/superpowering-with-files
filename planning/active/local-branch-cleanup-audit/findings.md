# Findings & Decisions

## Requirements
- 检查所有本地分支。
- 审计分支当前状态与用途。
- 评估“清理本地分支”的方案，不直接删除。

## Research Findings
- 当前主工作区位于 `dev`，`git status --short --branch` 显示 `dev...origin/dev [ahead 1]`。
- 当前工作区还存在未提交改动：`.codex-worktrees/202605061308-roadmap-v1-4-safety-overlay-governance-002`。
- 这次 `ahead 1` 需要在审计中单独判断其是否仅由 planning / meta 变更构成，避免误导对分支活跃度的判断。
- 已执行 `git fetch --all --prune`，审计基于最新远端引用。
- 当前共有 `19` 个本地分支：
  - 保留主线：`dev`、`main`
  - `backup/*`：3 个
  - `codex/*`：8 个
  - `copilot/*`：3 个
  - 其他：`automation/upstream-refresh` 1 个
- 当前共有 `11` 个 worktree：
  - 主工作区 `dev`
  - `main` worktree 1 个
  - 额外 branch-bound worktree 8 个
  - detached worktree 1 个：`/Users/jared/.config/superpowers/worktrees/SuperpoweringWithFiles/20260503-upstream-refresh-main-promotion @ 6281a9c`
- `dev` 相对 `origin/dev` 的 ahead 1 提交是 `56e3a55 Fix active-summary test fixture directory creation`，内容只新增了 `planning/active/branch-head-sync-latest/` 三件套，不包含产品/脚本代码差异。
- 已同时并入 `dev` 与 `main`、且当前不被 worktree 占用的分支：
  - `backup/pr41-dev-before-main-merge-20260506`
  - `codex/202605060339-verify-worktree-naming-regressions-001`
  - `codex/202605070150-roadmap-v1-4-safety-overlay-governance-003`
  - `codex/202605070210-roadmap-v1-5-workflow-productization-001`
  - `codex/202605070235-roadmap-v1-6-release-readiness-001`
  - `copilot/20260503-upstream-refresh-rehearsal-fix-dev`
  - `automation/upstream-refresh` 也已并入两条主线，但它在 active followup 任务中仍作为固定 automation branch name 被引用，适合列入 review 候选而不是第一批直接删。
- 已同时并入 `dev` 与 `main`、但仍被 clean worktree 占用的分支：
  - `copilot/202604301444-github-actions-upstream-automation-analysis-001`
  - `copilot/20260504-upstream-refresh-rehearsal-final-fix-dev`
  - `codex/202605060906-roadmap-v1-1-planning-hygiene-001`
  - `codex/202605061018-roadmap-v1-1-planning-hygiene-001`
  - `codex/202605061025-roadmap-v1-2-cross-ide-closure-001`
  - `codex/202605061218-roadmap-v1-3-context-budget-governance-001`
  - `codex/202605061308-roadmap-v1-4-safety-overlay-governance-001`
- `codex/202605061308-roadmap-v1-4-safety-overlay-governance-002` 对应的仓内 fallback worktree 有大量未提交修改，并且仍被 active task `roadmap-v1.4-safety-overlay-governance` 明确引用，当前不可清理。
- `backup/dev-before-origin-align-20260504` 未并入 `dev/main`，属于纯本地恢复点。
- `backup/main-before-dev-sync-20260508-1125` 已被 `main` 包含，但它是今天新建的回退点，时间上过近，不建议立刻删。
- `codex/202605061018-roadmap-v1-1-planning-hygiene-001` 的 upstream 配置异常：本地分支跟踪的是 `origin/dev` 而不是同名 `origin/codex/*` 分支，且当前 `behind 23`；这更像 stale worktree 遗留，不像还在维护中的 feature branch。
- detached worktree `20260503-upstream-refresh-main-promotion @ 6281a9c` 不绑定本地分支，且该提交已被 `dev/main` 和多个 roadmap 分支包含；它不阻塞分支删除，但本身是明确的本地清理候选。
- 执行完成后的剩余本地分支只有 6 个：
  - `automation/upstream-refresh`
  - `backup/dev-before-origin-align-20260504`
  - `backup/main-before-dev-sync-20260508-1125`
  - `codex/202605061308-roadmap-v1-4-safety-overlay-governance-002`
  - `dev`
  - `main`
- 执行完成后的剩余 worktree 只有 3 个：
  - 主工作区 `dev`
  - `main` worktree
  - 仓内 fallback worktree `codex/202605061308-roadmap-v1-4-safety-overlay-governance-002`
- `codex/...-002` worktree 仍然脏，且 active task 引用仍在，保留策略没有变化。

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| 分支审计必须同时看 local refs、remote tracking、worktree 占用与历史任务语义 | 仅看 `git branch --merged` 会漏掉恢复点、占用分支与未推远端分支 |
| 将清理候选按“三档”分层而不是只按 merged / not merged 二分 | 本仓库大量 stale refs 来自已归档任务 worktree，真正的风险边界在于是否被占用、是否仍承载恢复语义、是否仍被 active task 引用 |
| 执行时继续保留 `automation/upstream-refresh` | 它在 active followup task 中仍被明确引用为固定 automation branch name，先不与纯 stale 分支混删 |

## Issues Encountered
| Issue | Resolution |
|-------|------------|
| `dev` ahead 1 容易被误判为代码未同步 | 复核该 commit 仅包含 `branch-head-sync-latest` planning 三件套，单独标记为 planning-only 漂移 |

## Destructive Operations Log
| Command | Target | Checkpoint | Rollback |
|---------|--------|------------|----------|
| `./scripts/harness checkpoint . --quiet` | 当前仓库快照 | `/Users/jared/.agent-config/checkpoints/SuperpoweringWithFiles/2026-05-08T03-39-41Z` | n/a |
| `git worktree remove <detached/main-promotion>` | detached worktree `/Users/jared/.config/superpowers/worktrees/SuperpoweringWithFiles/20260503-upstream-refresh-main-promotion` | `/Users/jared/.agent-config/checkpoints/SuperpoweringWithFiles/2026-05-08T03-39-41Z` | restore from checkpoint or recreate worktree at `6281a9c` |
| `git worktree remove <tier-2 clean worktrees>` | 7 clean branch-bound worktrees | `/Users/jared/.agent-config/checkpoints/SuperpoweringWithFiles/2026-05-08T03-39-41Z` | restore from checkpoint or recreate worktrees from surviving refs / remotes |
| `git branch -D <tier-1 + tier-2 branches>` | 13 local branches | `/Users/jared/.agent-config/checkpoints/SuperpoweringWithFiles/2026-05-08T03-39-41Z` | restore refs from checkpoint, or recreate from `origin/*` when remote still exists |

## Resources
- `/Users/jared/SuperpoweringWithFiles/planning/archive/20260506-142311-cleanup-local-branches-worktrees/`
- `/Users/jared/SuperpoweringWithFiles/.git`

## Findings Record: 2026-05-11 13:24:00 UTC+8

- 已按用户批准删除：
  - 本地分支 `202605101422-cloud-dev-harness-feasibility-001`
  - worktree `/Users/jared/SuperpoweringWithFiles/.worktrees/202605101422-cloud-dev-harness-feasibility-001`
- 删除前条件满足：目标分支已并入 `origin/dev` 与 `origin/main`，目标 worktree 干净，且没有同名 remote ref 需要一并处理。
- 当前本地分支逐项结论：
  - `202605081401-harness-runtime-facade-mcp-001`：不可清；未并入 `origin/dev` / `origin/main`，且仍有 worktree 占用。
  - `automation/upstream-refresh`：技术上可清，但建议先保留；虽已并入 `origin/dev` / `origin/main`，但仍带 automation 语义。
  - `backup/dev-before-origin-align-20260504`：不可清；未并入 `origin/dev` / `origin/main`，属于恢复点。
  - `backup/main-before-dev-sync-20260508-1125`：可清，但不急；已并入 `origin/main`，未并入 `origin/dev`，本质是 main 回退点。
  - `codex/202605061308-roadmap-v1-4-safety-overlay-governance-002`：不可清；虽已并入主线，但对应 fallback worktree 有未提交改动，且 active task 仍引用。
  - `codex/202605080601-upstream-refresh-6-failure-repair-001`：当前不可清；虽已并入主线，但对应 worktree 有未提交改动，且 active repair task 仍在。
  - `dev`：不可清；主工作区分支。
  - `main`：不可清；主线 worktree，但当前落后 `origin/main` 7 个提交，应先同步后再谈其它操作。
- 当前远端分支逐项结论：
  - 必须保留：`origin/main`、`origin/dev`、`origin/cloud-dev`。
  - 建议保留：`origin/automation/upstream-refresh`，因为 automation 语义仍明确。
  - 可清理候选：`origin/readme-slim-pr`、`origin/copilot/202604301444-github-actions-upstream-automation-analysis-001`、`origin/copilot/20260503-upstream-refresh-layout-compat-dev`、`origin/copilot/20260503-upstream-refresh-rehearsal-fix-dev`、`origin/copilot/20260504-upstream-refresh-rehearsal-final-fix-dev`、`origin/copilot/using-subagents-for-plans`、`origin/codex/202605061218-roadmap-v1-3-context-budget-governance-001`、`origin/codex/202605070150-roadmap-v1-4-safety-overlay-governance-003`、`origin/codex/202605070210-roadmap-v1-5-workflow-productization-001`、`origin/codex/202605070235-roadmap-v1-6-release-readiness-001`、`origin/codex/readme-final-polish`、`origin/codex/rename-repo-superpowering-with-files`、`origin/codex/superpowers-plan-artifact-model`；这些都已并入 `origin/dev` 与 `origin/main`。
  - 暂不清理：`origin/codex/202605060906-roadmap-v1-1-planning-hygiene-001`；当前未并入 `origin/dev` / `origin/main`。
  - 二次复核：当前 `gh pr list --state open` 返回空结果，没有 open PR 仍绑定上述可清理候选远端分支。
  - 二次复核：先前矩阵中出现的 `origin` 项不是有效的 `refs/remotes/origin` 引用，不属于真实可操作的远端分支，不应进入删除集。

## Rollback Data: 2026-05-11 14:56:03 UTC+8

- 远端删除候选 tip SHA：
  - `readme-slim-pr` -> `ca0e409f816f4d190a8549899a772718e0607924`
  - `copilot/202604301444-github-actions-upstream-automation-analysis-001` -> `825fbf3a3594d8609cf231676f27f186dda93eba`
  - `copilot/20260503-upstream-refresh-layout-compat-dev` -> `2b73dfc3fb810db6f4061a706fba6f2e9196f48e`
  - `copilot/20260503-upstream-refresh-rehearsal-fix-dev` -> `3af20d0552939f5ac96e56635868eaa779c06109`
  - `copilot/20260504-upstream-refresh-rehearsal-final-fix-dev` -> `6f1826d133ee84ea380c43e2b17381a83d636e0e`
  - `copilot/using-subagents-for-plans` -> `e61ddd15c0dcfb418e48746e1f056d1f9496f934`
  - `codex/202605061218-roadmap-v1-3-context-budget-governance-001` -> `a9f699c57d575352cd36fb90c265120cf20e46b5`
  - `codex/202605070150-roadmap-v1-4-safety-overlay-governance-003` -> `23a326b20ce40023fa3fb9638adc67b38a9541e4`
  - `codex/202605070210-roadmap-v1-5-workflow-productization-001` -> `7b44cf14c5e3275455fac64d9fdfc91c1d4ca65a`
  - `codex/202605070235-roadmap-v1-6-release-readiness-001` -> `2b2e85f1c280c73a64750aacd3b4e77720f0187e`
  - `codex/readme-final-polish` -> `dad5af926f767e59a96c34f0b3dbbe875b34c3ac`
  - `codex/rename-repo-superpowering-with-files` -> `05746b1bb86900db67295e4c02849fd4c74a65a2`
  - `codex/superpowers-plan-artifact-model` -> `37340d5a24d785a3fbfee5f58c9572454debca40`

## Execution Result: 2026-05-11 15:00:00 UTC+8

- 已执行远端删除并成功移除以下 13 个远端分支：
  - `readme-slim-pr`
  - `copilot/202604301444-github-actions-upstream-automation-analysis-001`
  - `copilot/20260503-upstream-refresh-layout-compat-dev`
  - `copilot/20260503-upstream-refresh-rehearsal-fix-dev`
  - `copilot/20260504-upstream-refresh-rehearsal-final-fix-dev`
  - `copilot/using-subagents-for-plans`
  - `codex/202605061218-roadmap-v1-3-context-budget-governance-001`
  - `codex/202605070150-roadmap-v1-4-safety-overlay-governance-003`
  - `codex/202605070210-roadmap-v1-5-workflow-productization-001`
  - `codex/202605070235-roadmap-v1-6-release-readiness-001`
  - `codex/readme-final-polish`
  - `codex/rename-repo-superpowering-with-files`
  - `codex/superpowers-plan-artifact-model`
- 删除后以 `git fetch origin --prune` 刷新本地 remote-tracking refs，再以 `git ls-remote --heads origin` 做权威复核，确认远端只剩 5 个真实 heads：`automation/upstream-refresh`、`cloud-dev`、`codex/202605060906-roadmap-v1-1-planning-hygiene-001`、`dev`、`main`。
- `git branch -r` 仍输出一个噪声项 `origin`，但它不对应真实的远端 head；以 `git ls-remote --heads origin` 为准，删除结果成立。

## Findings Record: 2026-05-11 15:01:53 UTC+8

- 本地 `backup/main-before-dev-sync-20260508-1125` 删除前复核结果：
  - 已被 `origin/main` 吸收。
  - 未被 `origin/dev` 吸收，但这是预期，因为它本来就是旧 `main` 回退点。
  - 没有任何 worktree 绑定该分支。
  - tip 为 `fe42a20 Merge pull request #41 from ilderaj/dev`。
- 远端 `origin/codex/202605060906-roadmap-v1-1-planning-hygiene-001` 审计结果：
  - 未并入 `origin/main`，也未并入 `origin/dev`。
  - 相对 `origin/main` 仅有 1 个独有提交：`4311787 docs: sync roadmap execution control`。
  - 该提交只改动 roadmap/planning 文档：
    - `superpowers/plans/2026-05-06-roadmap-implementation-plan.md`
    - `planning/active/roadmap-implementation-plan/findings.md`
    - `planning/active/roadmap-implementation-plan/progress.md`
  - 未发现以该分支为 head 的 PR。
  - 结论：这个远端分支没有产品代码保留价值，只剩“历史 planning 审计快照”价值；如果仓库不需要继续保留未合入的 roadmap 历史分支，可以单独删除，并在需要时从 `4311787` 恢复。否则也可以继续保留，作为未并入的历史记录分支。

## Execution Result: 2026-05-11 15:04:30 UTC+8

- 已执行并完成本地分支删除：`backup/main-before-dev-sync-20260508-1125`。
- 删除方式为 `git branch -D`，因为该分支虽已被 `origin/main` 吸收，但未并入当前 `HEAD=dev`，`git branch -d` 会被 Git 拒绝。
- 删除后复核：本地分支集合已收敛到 7 个，主工作区仍只包含 cleanup 审计文件修改，没有新增代码层副作用。
- 当前最明确的后续清理判断：
  - 仍然不要动：`dev`、`main`、`backup/dev-before-origin-align-20260504`、两个脏 worktree 对应分支、以及未合入主线的 `202605081401-harness-runtime-facade-mcp-001`。
  - 可以在你点头后单独处理：远端 `codex/202605060906-roadmap-v1-1-planning-hygiene-001`，因为它只剩历史 planning 快照价值。

## Rollback Data: 2026-05-11 15:04:18 UTC+8

- 单分支远端删除目标：`codex/202605060906-roadmap-v1-1-planning-hygiene-001`
- tip SHA：`43117876b1dcf9c8a7697261b20a6806601f3283`
- open PR 复核：无

## Execution Result: 2026-05-11 15:06:30 UTC+8

- 已执行远端删除：`codex/202605060906-roadmap-v1-1-planning-hygiene-001`。
- 删除后复核：
  - `git ls-remote --heads origin` 显示远端真实 heads 仅剩 `automation/upstream-refresh`、`cloud-dev`、`dev`、`main`。
  - `git branch -r` 对应地只剩 `origin/automation/upstream-refresh`、`origin/cloud-dev`、`origin/dev`、`origin/main`，外加一个无效噪声项 `origin`。
- 当前最终判断：
  - 远端历史分支清理阶段可以视为完成。
  - 若后续还要继续清理，本地只剩需要保留或暂时不该动的对象，没有新的“立即安全删除”目标。

## Final Summary

- 本地最终保留分支：
  - `202605081401-harness-runtime-facade-mcp-001`
  - `automation/upstream-refresh`
  - `backup/dev-before-origin-align-20260504`
  - `codex/202605061308-roadmap-v1-4-safety-overlay-governance-002`
  - `codex/202605080601-upstream-refresh-6-failure-repair-001`
  - `dev`
  - `main`
- 远端最终保留 heads：`automation/upstream-refresh`、`cloud-dev`、`dev`、`main`。
- 当前没有新的低风险 branch 删除动作值得继续执行；再往下的动作都需要先解决 active task、未合入分支或脏 worktree 的边界问题。
