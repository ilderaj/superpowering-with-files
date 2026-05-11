# Cloud Dev Harness 可行性分析计划

## Current State
Status: waiting_review
Archive Eligible: no
Close Reason:

## 目标
分析是否可以在本项目 GitHub repo 中 adoption 本项目自身的 Harness，并让 Harness 只在专门的 cloud dev 分支上通过 GitHub cloud/Actions/agent 完成开发迭代、测试、commit 和 PR，同时避免污染关键分支、本地 dev 或本地工作区。输出可行性分析报告和可执行实施方案。

## 基线
- Workspace: `/Users/jared/SuperpoweringWithFiles`
- Current branch: `dev`
- Current HEAD: `69cf018`
- Default branch: `main`
- Repository: `ilderaj/superpowering-with-files`
- 本任务不直接实现 CI/agent 自动化代码，只产出分析和方案。

## 阶段
1. 上下文恢复与任务建档 - complete
2. 研究现有 Harness 架构、安装/adoption、workflow 和安全模型 - complete
3. 评估 GitHub cloud 分支、base 同步、issue 触发和隔离策略 - complete
4. 输出可行性分析报告和实施方案 - complete
5. 自检报告覆盖面并总结 - complete
6. 输出工程级 implementation plan - complete
7. 审阅 implementation plan 并恢复执行上下文 - complete
8. 实现 cloud-dev branch pure library - complete
9. 实现 cloud-dev branch runner 与 sync workflow - complete
10. 实现 issue triage library、runner 与 workflow - complete
11. 更新 cloud-dev operator 文档 - complete
12. 运行 focused/full verification 与 dry-run - complete
13. 回写 implementation evidence 与 rollout gate - complete

## 关键决策
- 将 cloud dev 模式视为可选运行模式，不改变本地 dev 的默认工作流。
- 所有自动开发写入必须限制到专用分支命名空间，关键分支只接受 PR。
- 现有文档已经包含 Copilot cloud-safe/github-cloud deployment profile，可作为方案基础而不是从零设计。
- 归档任务 `origin-cloud-harness-deployment-plan` 的核心结论已经在 roadmap v1.4 落地；本报告基于该现状继续规划 cloud dev 分支与 issue 触发模式。

## Companion plan
- Path: `docs/superpowers/plans/2026-05-10-cloud-dev-harness-feasibility.md`
- Summary: 已创建；报告结论为可行，推荐 Copilot cloud repo-local overlay + protected `cloud-dev` staging lane，任务分支 PR 到 `cloud-dev`，再由 gated PR promotion 到 `dev`。
- Sync-back status: complete

## Implementation plan
- Path: `docs/superpowers/plans/2026-05-10-cloud-dev-harness-implementation-plan.md`
- Summary: 已创建；将可行性报告拆成文件级工程任务，覆盖 `cloud-dev` branch helper、sync workflow、issue triage workflow、docs、tests、verification 和 GitHub rollout gate。
- Sync-back status: complete

## Plan Record: 2026-05-10 22:20:39 UTC+8
- 用户已明确要求开始执行 `docs/superpowers/plans/2026-05-10-cloud-dev-harness-implementation-plan.md`。
- 当前执行策略：按任务顺序遵循 TDD 落地纯函数、runner、workflow、文档与验证，再把实现证据回写到本任务目录。
- 执行前 preflight 已完成：当前 checkout 是普通 repo 工作区，不是 linked worktree；当前分支为 `dev`。
- `./scripts/harness worktree-preflight` 推荐 worktree base 为 `dev @ 8be83eada6ebb7d0637d3f2cedd0d24bc1bb3d4e`。

## Plan Record: 2026-05-10 22:24:47 UTC+8
- 用户已明确要求开始执行 `docs/superpowers/plans/2026-05-10-cloud-dev-harness-implementation-plan.md`。
- 执行工作区已切换到 linked worktree：`.worktrees/202605101422-cloud-dev-harness-feasibility-001`，分支 `202605101422-cloud-dev-harness-feasibility-001`。
- Worktree base: `dev @ 8be83eada6ebb7d0637d3f2cedd0d24bc1bb3d4e`。
- 基线验证已通过：在 worktree 内运行 `npm run verify` 成功，可将后续失败归因到本次实现。

## Plan Record: 2026-05-10 22:41:58 UTC+8
- Task 1 已完成：新增 `scripts/ci/lib/cloud-dev-branch.mjs` 与 `tests/automation/cloud-dev-branch.test.mjs`。
- Task 1 经 implementer、spec reviewer、code quality reviewer 三轮闭环后通过；目前进入 Task 2（branch runner）。

## Plan Record: 2026-05-10 22:59:39 UTC+8
- Task 2 已完成：新增 `scripts/ci/check-cloud-dev-branch.mjs`，并扩展 `tests/automation/cloud-dev-branch.test.mjs` 覆盖 check/sync/failure path。
- Task 2 代码审查期间修复了失败时未写 result artifact、以及 sync 成功后输出状态不准确的问题。
- 当前继续执行 Task 3：将 branch checker 接入 `cloud-dev-sync` workflow 与静态测试。

## Plan Record: 2026-05-10 23:11:00 UTC+8
- Task 3 已完成：新增 `.github/workflows/cloud-dev-sync.yml` 与 `tests/automation/cloud-dev-workflow.test.mjs`。
- Task 3 代码审查期间修复了 artifact upload 缺少 `hashFiles(...)` guard 的问题，并将该 guard 纳入静态测试。
- 当前进入 Task 4：实现 `cloud-dev` issue triage 的 pure library 与 runner。

## Plan Record: 2026-05-10 23:49:44 UTC+8
- Task 4 已完成：新增 `scripts/ci/lib/cloud-dev-issue.mjs`、`scripts/ci/run-cloud-dev-issue-triage.mjs` 与 `tests/automation/cloud-dev-issue.test.mjs`。
- Task 4 review 修复了评论失败时未落 result artifact、issue 字段缺失校验，以及 not-ready 路径过早要求 title 的问题。
- 当前继续 Task 5：把 issue triage 接入 workflow，并收紧 readiness handoff。

## Plan Record: 2026-05-11 00:28:25 UTC+8
- Task 5 已完成：新增 `.github/workflows/cloud-dev-issue-triage.yml` 并扩展 `tests/automation/cloud-dev-workflow.test.mjs`。
- 本阶段确认并修复了 companion plan 内部的 Task 1/2 vs Task 5 契约冲突：保留 `check` 模式 `reason: 'check_only'` 语义，改由 triage workflow 的 readiness handoff 读取结构化 report 字段判定健康状态。
- 额外修复：排除 PR comments、补齐 `pull-requests: read` 权限、收紧 workflow trigger 结构测试。
- 当前进入 Task 6：补齐 `cloud-dev` operator 文档与维护说明。

## Plan Record: 2026-05-11 00:53:06 UTC+8
- Task 6 已完成：新增 `docs/cloud-dev-harness.md`，并更新 `docs/workflows.md`、`docs/install/copilot.md`、`docs/maintenance.md`。
- 文档 review 期间修复了 repo variable 语义、remote `cloud-dev` bootstrap、Recovery 定位，以及 finish lane 写死 `dev` 的示例偏差。
- 当前进入 Task 7：跑 focused/full verification、执行本地 check-mode dry-run，并把实现证据写回本任务目录。

## Plan Record: 2026-05-11 01:44:43 UTC+8
- cloud-dev 实现面的最终 code review 已通过；额外修复了 triage comment retry 入口、manual dispatch `issue_number` 支持、branch checker failed exit code，以及 sync 后 result 使用实际 post-sync refs 的问题。
- Task 7 验证结果分成两类：
  - 通过：focused cloud-dev tests、full automation tests、`./scripts/harness verify --output=.harness/verification`、`git diff --check`
  - 阻塞：`npm run verify` 被当前 worktree 的 Harness projection state / MCP safe-apply 测试卡住；`./scripts/harness doctor --check-only` 报 companion-plan 元数据与缺失 generated entries；`node scripts/ci/check-cloud-dev-branch.mjs --mode=check` 因远端尚无 `cloud-dev` 分支而 `fetch_failed`
- 结论：代码与 focused verification 已完成，但整仓 completion 仍受现有环境/rollout 前置条件阻塞，因此任务状态改为 `blocked`。

## Plan Record: 2026-05-11 11:42:11 UTC+8
- 已在目标 worktree 内执行 `./scripts/harness sync --takeover`，修复 `.harness/projections.json` 为空、缺失 generated entries、以及 MCP safe-apply ownership 拒写的环境问题。
- 已将 `package.json` 中的 MCP 测试切到串行执行；根因是 `tests/mcp/receipt-ledger.test.mjs` 与 `tests/mcp/safe-write.test.mjs` 在 shared repo root 上并发跑 `sync` 会互相踩踏。
- 已调整 `scripts/ci/check-cloud-dev-branch.mjs`：`--mode=check` 下若远端尚未 bootstrap `cloud-dev`，返回 `Reason: staging_branch_missing` 的 checked result，而不是 failed result。
- 已放宽 companion-plan 解析器，支持 planning 文件中的 `- Path:` 标签和 companion 文档中的 `**Active task path:**` 粗体标签；`./scripts/harness doctor --check-only` 现已 clean pass。
- 当前验证结论：`npm run verify` 通过，`./scripts/harness doctor --check-only` 通过，`node scripts/ci/check-cloud-dev-branch.mjs --mode=check` 不再失败退出，而是把缺失远端 `cloud-dev` 明确标记为 rollout prerequisite。

## Plan Record: 2026-05-11 11:55:18 UTC+8
- 已验证当前 worktree 可以临时切换到 `copilot + cloud-safe + github-cloud + hooks=on`，并成功生成 `.github/hooks` 与 `.github/skills`。
- 但该切换会把仓库内供本地开发使用的 `.agents/skills/**` 视为当前 workspace 的 stale projection，从而在 worktree 中删除本地兼容投影；这说明该形态不能直接 merge 回 `dev`。
- 部署决策更新：`dev` 继续保留本地兼容/full Harness 形态；GitHub cloud 所需的 `github-cloud` / `cloud-safe` / Copilot-only 变体只在远端 `cloud-dev` 发布分支上生成和提交，不回灌到本地 `dev`。
- 当前进入 finish 阶段：先恢复当前 worktree 到可 merge 状态，再 merge 回本地 `dev`，随后基于合并后的 `dev` 单独构造远端 `cloud-dev` 发布形态。

## Plan Record: 2026-05-11 12:01:30 UTC+8
- 已在主 checkout 将功能分支 `202605101422-cloud-dev-harness-feasibility-001` merge 回本地 `dev`，merge commit 为 `2c3d787`。
- merge 后验证结论：`npm run verify` 通过，`./scripts/harness doctor --check-only` 通过，`node scripts/ci/check-cloud-dev-branch.mjs --mode=check` 在远端分支建立后返回 `Reason: check_only`。
- 已将 `dev` 推送到 `origin/dev`，并将 `origin/cloud-dev` bootstrap 到与 `origin/dev` 同一提交，满足当前 branch checker 的 zero-divergence staging 契约。
- 已在 GitHub 仓库上创建并启用 `CLOUD_DEV_SYNC_ENABLED=true` 与 `CLOUD_DEV_ISSUE_TRIAGE_ENABLED=true`，并补齐 labels：`cloud-dev`、`agent:plan`、`agent:test`、`agent:impl`。
- 已创建并合并 `dev -> main` 的发布 PR `#52 Add cloud-dev harness workflows and rollout checks`，使默认分支 `main` 获得 cloud-dev workflows、docs 与 Copilot entry baseline。
- 已从 `main` 手动触发一次 `Cloud Dev Sync` workflow 的 `workflow_dispatch(mode=check)`；GitHub Actions run `25649619094` 成功完成。

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| 误读不存在的 `harness/installer/lib/deployment-profile.mjs` | 1 | 改读真实实现 `harness/installer/lib/state.mjs`，确认 `deploymentProfile` 枚举与校验在 state 层。 |

## Risk Assessment
| Timestamp | Command | Target | Workspace Boundaries | Checkpoint | Rollback |
|-----------|---------|--------|----------------------|------------|----------|
| 2026-05-11 00:58:33 UTC+8 | `rm -f harness/core/upstream-overlays/planning-with-files/scripts/__pycache__/companion_sync.cpython-313.pyc harness/core/upstream-overlays/planning-with-files/scripts/__pycache__/planning_paths.cpython-313.pyc harness/core/upstream-overlays/planning-with-files/scripts/__pycache__/task_lifecycle.cpython-313.pyc harness/upstream/planning-with-files/scripts/__pycache__/planning_paths.cpython-313.pyc harness/upstream/planning-with-files/scripts/__pycache__/task_lifecycle.cpython-313.pyc` | 5 generated `__pycache__/*.pyc` files produced during local execution | 仅限当前 linked worktree；不触及原始 checkout 或远端 | `/Users/jared/.agent-config/checkpoints/202605101422-cloud-dev-harness-feasibility-001/2026-05-10T16-58-46Z` | 如误删，使用 checkpoint 恢复该 worktree，或从主 checkout/branch 重新检出对应路径。 |
| 2026-05-11 01:45:45 UTC+8 | `rm -f test_comprehensive.mjs test_write_failure.mjs && git restore -- harness/core/upstream-overlays/planning-with-files/scripts/__pycache__/companion_sync.cpython-313.pyc harness/core/upstream-overlays/planning-with-files/scripts/__pycache__/planning_paths.cpython-313.pyc harness/core/upstream-overlays/planning-with-files/scripts/__pycache__/task_lifecycle.cpython-313.pyc harness/upstream/planning-with-files/scripts/__pycache__/planning_paths.cpython-313.pyc harness/upstream/planning-with-files/scripts/__pycache__/task_lifecycle.cpython-313.pyc` | 2 untracked temporary probe scripts + 5 tracked pyc files re-dirtied by execution | 仅限当前 linked worktree；不触及原始 checkout 或远端 | `/Users/jared/.agent-config/checkpoints/202605101422-cloud-dev-harness-feasibility-001/2026-05-10T17-45-45Z` | 如误清理，使用新 checkpoint 恢复，或从当前 branch 重新检出这些 tracked/untracked artifacts。 |
| 2026-05-11 11:55:18 UTC+8 | `git clean -fd -- .agent-config` | 当前 worktree 内本次 `github-cloud` 试跑生成的未跟踪安全投影目录 `.agent-config/` | 仅限当前 linked worktree；不触及原始 checkout、主仓库工作树或远端 | `/Users/jared/.agent-config/checkpoints/202605101422-cloud-dev-harness-feasibility-001/2026-05-11T03-55-18Z` | 如误清理，使用该 checkpoint 恢复，或重新执行相同 profile 的 `./scripts/harness sync` 重建目录。 |
