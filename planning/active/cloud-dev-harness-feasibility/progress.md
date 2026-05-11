# Cloud Dev Harness 可行性分析进展

## 2026-05-10
- 创建任务记录。
- 确认工作区基线：`/Users/jared/SuperpoweringWithFiles`，branch `dev`，HEAD `69cf018`。
- 已阅读 `docs/architecture.md`、`docs/workflows.md`、`docs/install/copilot.md`、`docs/install/platform-support.md`、`package.json`，并搜索 GitHub/Actions/cloud/profile 相关引用。
- 发现现有 Copilot cloud-safe/github-cloud profile 是本方案的直接基础。
- 接下来研究 `.github` workflow、维护文档中的 workflow_dispatch/PR 机制，以及 installer/profile 代码。
- 已阅读现有 upstream refresh workflow、cloud-safe/safety policy、cloud-bootstrap、install/state、platform metadata、相关测试，以及归档的 `origin-cloud-harness-deployment-plan`。
- 已通过 GitHub Docs 核对 cloud agent、hooks、custom agents、agent skills 的关键约束。
- 发生一次文件路径误判：`harness/installer/lib/deployment-profile.mjs` 不存在，已改读 `harness/installer/lib/state.mjs`。
- 已创建报告：`docs/superpowers/plans/2026-05-10-cloud-dev-harness-feasibility.md`。
- 已创建工程级 implementation plan：`docs/superpowers/plans/2026-05-10-cloud-dev-harness-implementation-plan.md`。
- 报告自检：未发现 `TBD` / `TODO` / `implement later` / `fill in details` / `待定` 占位符。
- 验证：`git diff --check` 通过；`git status --short` 仅显示新报告和本任务 planning 目录。
- 当前状态：等待用户 review。

## 2026-05-10 Implementation Plan Follow-up
- 用户询问当前报告是否足够执行，或是否需要更详细的 implementation plan。
- 结论：当前 feasibility report 可指导人工 pilot，但不是工程级任务单；已补充工程级 plan。
- 新增：`docs/superpowers/plans/2026-05-10-cloud-dev-harness-implementation-plan.md`。
- implementation plan 覆盖：`cloud-dev` branch pure library、branch runner、sync workflow、issue triage library/runner/workflow、docs updates、focused/full verification、GitHub rollout gate。
- 自检：implementation plan 占位符扫描无命中；feasibility report 头部已同步为 `waiting_review` / `complete`。
- 验证：`git diff --check` 通过。
- `git status --short` 还显示无关未跟踪目录 `planning/active/cursor-skill-projection-consolidation/`；本任务未修改该目录，保持不动。

## 验证
- 尚未运行实现级测试；当前阶段为方案分析。

## Session: 2026-05-10 22:24:47 UTC+8
- 已创建并切换到 linked worktree：`.worktrees/202605101422-cloud-dev-harness-feasibility-001`。
- worktree branch: `202605101422-cloud-dev-harness-feasibility-001`。
- Worktree base: `dev @ 8be83eada6ebb7d0637d3f2cedd0d24bc1bb3d4e`。
- 已在 worktree 内完成 `npm install`。
- 已在 worktree 内运行 `npm run verify`，基线通过。
- 已定位 Task 1/2/3 的实现参考：`scripts/local/sync-dev-after-upstream-pr.mjs`、`tests/automation/local-dev-sync.test.mjs`、`tests/automation/upstream-refresh-workflow.test.mjs`、`scripts/ci/run-upstream-refresh.mjs`、`scripts/ci/lib/upstream-refresh.mjs`。
- 当前进入 Task 1，按 implementation plan 先写失败测试。

## Session: 2026-05-10 22:41:58 UTC+8
- Task 1 完成：创建 `scripts/ci/lib/cloud-dev-branch.mjs` 与 `tests/automation/cloud-dev-branch.test.mjs`。
- TDD 证据：`node --test tests/automation/cloud-dev-branch.test.mjs` 先因 `ERR_MODULE_NOT_FOUND` 失败，随后在实现后通过。
- 额外验证：`node --test tests/automation/cloud-dev-branch.test.mjs tests/automation/local-dev-sync.test.mjs` 通过。
- spec review 先发现常量断言缺少 `sourceBranch`/`syncRange`，已补齐后复审通过。
- code quality review 发现 `syncRange` 测试断言存在假阳性风险，已改为字面量精确断言后复审通过。
- 当前进入 Task 2：实现 `scripts/ci/check-cloud-dev-branch.mjs` 并扩展 branch runner 测试。

## Session: 2026-05-10 22:59:39 UTC+8
- Task 2 完成：创建 `scripts/ci/check-cloud-dev-branch.mjs`，并把 runner 测试并入 `tests/automation/cloud-dev-branch.test.mjs`。
- TDD 证据：`node --test tests/automation/cloud-dev-branch.test.mjs` 先因 `ERR_MODULE_NOT_FOUND`（缺少 `scripts/ci/check-cloud-dev-branch.mjs`）失败，再在实现后通过。
- 首轮 code quality review 发现 runner 在命令失败时不会写 result artifact；已补成 failure result + writeResult 保底，并新增 push failure 覆盖。
- 当前 `node --test tests/automation/cloud-dev-branch.test.mjs` 通过。
- 当前进入 Task 3：新增 `.github/workflows/cloud-dev-sync.yml` 与 `tests/automation/cloud-dev-workflow.test.mjs`。
- Task 3 TDD 证据：`node --test tests/automation/cloud-dev-workflow.test.mjs` 在 workflow 文件尚未创建时先以 `ENOENT` 失败，随后在新增 `.github/workflows/cloud-dev-sync.yml` 后转绿。

## Session: 2026-05-10 23:11:00 UTC+8
- Task 3 完成：创建 `.github/workflows/cloud-dev-sync.yml` 与 `tests/automation/cloud-dev-workflow.test.mjs`。
- 当前 `node --test tests/automation/cloud-dev-workflow.test.mjs` 通过。
- code quality review 发现 upload 步骤缺少 `hashFiles('.harness/cloud-dev-sync-result.json') != ''` guard；已补进 workflow，并在静态测试中断言该 `if:` 表达式。
- 当前进入 Task 4：实现 `scripts/ci/lib/cloud-dev-issue.mjs`、`scripts/ci/run-cloud-dev-issue-triage.mjs` 与对应测试。
- Task 4 TDD 证据：`node --test tests/automation/cloud-dev-issue.test.mjs` 在 `scripts/ci/lib/cloud-dev-issue.mjs` 尚不存在时先失败，随后在实现 library 与 runner 后转绿。

## Session: 2026-05-10 23:49:44 UTC+8
- Task 4 完成：创建 `scripts/ci/lib/cloud-dev-issue.mjs`、`scripts/ci/run-cloud-dev-issue-triage.mjs` 与 `tests/automation/cloud-dev-issue.test.mjs`。
- 当前 `node --test tests/automation/cloud-dev-issue.test.mjs` 通过（10 tests）。
- review 修复：
  - comment command 失败时仍写 `.harness/cloud-dev-issue-triage-result.json`
  - 缺少 `issue.number` / `issue.title` 时 fail fast
  - `cloudDevReady=false` 的 not-ready 路径不再过早要求 title
- 当前进入 Task 5：新增 `.github/workflows/cloud-dev-issue-triage.yml` 并扩展 workflow 静态测试。
- Task 5 TDD 证据：`node --test tests/automation/cloud-dev-workflow.test.mjs` 在 `.github/workflows/cloud-dev-issue-triage.yml` 尚未创建时先失败，随后在补齐 workflow 后转绿。

## Session: 2026-05-11 00:03:43 UTC+8
- 针对 Task 5 code review 先做了根因验证，而不是直接改 YAML。
- 复现实验确认：`analyzeCloudDevSync({ mode: 'check' })` 在 diverged、`cloud-dev` ahead、open PR 等场景下都固定返回 `reason: 'check_only'`，所以当前 readiness handoff 仅按 `reason` 判定时会误放行不健康分支状态。
- 复查 workflow 后确认：`.github/workflows/cloud-dev-issue-triage.yml` 没有排除 PR discussion comments，`issue_comment` 事件范围过宽。
- 接下来修复方向：保持 Task 1/2 的 check-mode 契约不变，在 workflow readiness step 中改用结构化字段判定健康状态，并为 `issue_comment` 添加 PR guard，同时补静态测试锁住这两个约束。
- 修复轮 TDD 证据：先修改 `tests/automation/cloud-dev-workflow.test.mjs` 断言结构化 readiness 和 PR-comment guard，随后 `node --test tests/automation/cloud-dev-workflow.test.mjs` 先对旧 workflow 失败；修复 `.github/workflows/cloud-dev-issue-triage.yml` 后再转绿。

## Session: 2026-05-11 00:28:25 UTC+8
- Task 5 完成：创建 `.github/workflows/cloud-dev-issue-triage.yml` 并扩展 `tests/automation/cloud-dev-workflow.test.mjs`。
- 修复了三类 workflow 风险：
  - readiness handoff 改为读取 `.harness/cloud-dev-sync-result.json` 的结构化字段，而不是仅看 `reason`
  - `issue_comment` 事件增加 PR comment 排除 guard
  - triage workflow 补齐 `pull-requests: read` 以支持 `gh pr list --base cloud-dev`
- 最后一轮测试增强：把 issue/comment triggers 的 `types` 断言绑定到各自父 block，避免 YAML 结构漂移漏检。
- 当前进入 Task 6：新增 `docs/cloud-dev-harness.md` 并更新 workflows/install/maintenance 文档。

## Session: 2026-05-11 00:53:06 UTC+8
- Task 6 完成：新增 `docs/cloud-dev-harness.md`，并更新 `docs/workflows.md`、`docs/install/copilot.md`、`docs/maintenance.md`。
- 文档 review 修复：
  - 明确 `CLOUD_DEV_SYNC_ENABLED` 的 workflow gate 与 script gate 是两层语义
  - 补充远端 `cloud-dev` 分支 bootstrap 提示
  - 将 Recovery 标注为人工接管/恢复路径
  - 将 finish lane 示例改为基于记录的 `<base-ref>`，而非写死 `dev`
- 当前进入 Task 7：执行 focused/full verification 与 dry-run，并记录 implementation evidence。

## Session: 2026-05-11 00:58:33 UTC+8
- 为清理本次执行生成的 `__pycache__/*.pyc` 先进行了风险评估，并执行 checkpoint：`/Users/jared/.agent-config/checkpoints/202605101422-cloud-dev-harness-feasibility-001/2026-05-10T16-58-46Z`。
- 计划清理命令仅针对当前 worktree 内 5 个 Python bytecode 文件；回滚路径已记录到 `task_plan.md` 的 `## Risk Assessment` 表格。

## Session: 2026-05-11 01:44:43 UTC+8
- 最终审查追加修复：
  - `issue_comment` 仅在评论正文包含独立命令 `/cloud-dev retry` 时才重试 triage
  - `workflow_dispatch` 增加必填 `issue_number`，runner 会用 `gh issue view --json number,title,labels` 解析目标 issue
  - branch checker 对任意 `status: failed` 统一返回非零退出码
  - sync 成功后重新读取 refs/ahead-behind，最终 result 反映实际 post-sync 状态
- 清理误操作回滚：误删 5 个已跟踪 `__pycache__/*.pyc` 后，已立即用 `git restore -- <paths>` 恢复，当前不再有 `__pycache__` diff。

## Implementation Evidence

- Focused tests: **PASS** — `node --test tests/automation/cloud-dev-branch.test.mjs tests/automation/cloud-dev-issue.test.mjs tests/automation/cloud-dev-workflow.test.mjs`
- Full automation tests: **PASS** — `node --test tests/automation/*.test.mjs`
- Full verification: **PARTIAL / BLOCKED**
  - **FAIL** — `npm run verify`
    - blocked by existing MCP safe-apply tests:
      - `tests/mcp/receipt-ledger.test.mjs`
      - `tests/mcp/safe-write.test.mjs`
    - observed error: `Refusing to overwrite non-Harness-owned path: .../AGENTS.md`
  - **PASS** — `./scripts/harness verify --output=.harness/verification`
  - **FAIL** — `./scripts/harness doctor --check-only`
    - blocked by existing companion-plan / generated-entry issues:
      - companion plan references not recognized for `2026-05-10-cloud-dev-harness-feasibility.md`
      - companion plan references not recognized for `2026-05-10-cloud-dev-harness-implementation-plan.md`
      - missing `.github/copilot-instructions.md`
      - missing `CLAUDE.md`
  - **PASS** — `git diff --check`
- Manual check mode: **FAIL / rollout prerequisite missing** — `node scripts/ci/check-cloud-dev-branch.mjs --mode=check`
  - observed error: `fatal: couldn't find remote ref cloud-dev`
  - prerequisite: create remote `cloud-dev` from `origin/dev` before rerunning
- Changed files:
  - `.github/workflows/cloud-dev-sync.yml`
  - `.github/workflows/cloud-dev-issue-triage.yml`
  - `scripts/ci/lib/cloud-dev-branch.mjs`
  - `scripts/ci/check-cloud-dev-branch.mjs`
  - `scripts/ci/lib/cloud-dev-issue.mjs`
  - `scripts/ci/run-cloud-dev-issue-triage.mjs`
  - `tests/automation/cloud-dev-branch.test.mjs`
  - `tests/automation/cloud-dev-issue.test.mjs`
  - `tests/automation/cloud-dev-workflow.test.mjs`
  - `docs/cloud-dev-harness.md`
  - `docs/workflows.md`
  - `docs/install/copilot.md`
  - `docs/maintenance.md`

## Session: 2026-05-11 01:45:45 UTC+8
- 第二轮清理前已再次 checkpoint：`/Users/jared/.agent-config/checkpoints/202605101422-cloud-dev-harness-feasibility-001/2026-05-10T17-45-45Z`。
- 计划清理：
  - 删除子代理遗留的临时探针脚本 `test_comprehensive.mjs`、`test_write_failure.mjs`
  - 将再次被 Python 解释器改脏的 5 个 tracked `__pycache__/*.pyc` 恢复到当前 branch 版本

## Session: 2026-05-11 11:42:11 UTC+8

- Actions taken:
  - Reproduced all three blockers in `/Users/jared/SuperpoweringWithFiles/.worktrees/202605101422-cloud-dev-harness-feasibility-001` instead of relying on earlier notes.
  - Confirmed the shared root cause behind the original `npm run verify` and doctor failures: `.harness/state.json` claimed a workspace install, but `.harness/projections.json` was empty and generated entry files were missing.
  - Ran `./scripts/harness sync --takeover` to realign the worktree projection manifest and restore missing generated entries.
  - Verified that `./scripts/harness doctor --check-only` changed from failing to passing after the projection resync.
  - Narrowed the remaining MCP failure to test orchestration: `tests/mcp/safe-write.test.mjs` passes alone, but collides with `tests/mcp/receipt-ledger.test.mjs` when `npm run verify` runs both against the same repo root concurrently.
  - Updated `package.json` so `test:mcp` and `verify` run MCP tests with `--test-concurrency=1`.
  - Updated `scripts/ci/check-cloud-dev-branch.mjs` and `tests/automation/cloud-dev-branch.test.mjs` so check mode treats a missing remote `cloud-dev` branch as a checked bootstrap prerequisite (`staging_branch_missing`) instead of a failed run.
  - Updated `harness/installer/lib/plan-locations.mjs` and `tests/installer/health.test.mjs` so doctor accepts existing companion-plan metadata styles used in this repo (`- Path:` and `**Active task path:**`).
- Files created/modified:
  - `package.json`
  - `scripts/ci/check-cloud-dev-branch.mjs`
  - `tests/automation/cloud-dev-branch.test.mjs`
  - `harness/installer/lib/plan-locations.mjs`
  - `tests/installer/health.test.mjs`
  - `.harness/projections.json`
  - `.github/copilot-instructions.md`
  - `CLAUDE.md`
  - `AGENTS.md`

- Verification:
  - **PASS** — `npm run verify`
  - **PASS** — `./scripts/harness doctor --check-only`
  - **PASS** — `node --test tests/automation/cloud-dev-branch.test.mjs`
  - **PASS** — `node --test tests/installer/health.test.mjs`
  - **PASS** — `node --test tests/mcp/safe-write.test.mjs`
  - **PASS** — `node scripts/ci/check-cloud-dev-branch.mjs --mode=check`

- Residual note:
  - The real remote `origin/cloud-dev` branch still does not exist; the difference is now semantic. Check mode reports that absence as a rollout prerequisite instead of failing the command.

## Session: 2026-05-11 11:55:18 UTC+8

- finish / deploy 准备阶段新增发现：
  - 当前 worktree 通过 `./scripts/harness install --targets=copilot --scope=workspace --profile=cloud-safe --deployment-profile=github-cloud --hooks=on` 与 `./scripts/harness sync --takeover` 可以成功生成 `.github/hooks/**`、`.github/skills/**`，且 `./scripts/harness doctor --check-only` 在该形态下通过。
  - 但该形态不适合直接 merge 回 `dev`。原因是它会把仓库内现有的 `.agents/skills/**` 本地开发投影视为 stale，并在当前分支上删除大量 tracked files；这会把本地开发基线错误地改成 cloud-only 形态。
- 已立即回滚这批未提交试跑改动：
  - `git restore --source=HEAD --worktree -- .`
  - `git clean -fd -- .github/hooks .github/skills`
- 当前部署策略调整为双轨：
  - 本分支仅承载 cloud-dev 功能实现与 blocker cleanup，merge 回本地 `dev`
  - 远端 `cloud-dev` 分支在 merge 后从更新后的 `dev` 单独生成 `github-cloud` / `cloud-safe` / Copilot-only 变体
- 为清理本次试跑额外生成的 `.agent-config/`，已创建 checkpoint：`/Users/jared/.agent-config/checkpoints/202605101422-cloud-dev-harness-feasibility-001/2026-05-11T03-55-18Z`
- 当前 worktree 状态：仅剩未跟踪目录 `.agent-config/`，待按风险记录执行清理。
