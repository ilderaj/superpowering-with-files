# Cloud Dev Harness 可行性分析发现

## 已知事实
- 当前主工作区为 `/Users/jared/SuperpoweringWithFiles`，分支 `dev`，HEAD `69cf018`。
- 仓库默认分支为 `main`，当前工作分支为 `dev`。
- 仓库已有多个隔离 worktree，说明现有流程已经重视并行隔离。
- `docs/install/copilot.md` 已记录 repo-local cloud execution：`install --targets=copilot --scope=workspace --profile=cloud-safe --deployment-profile=github-cloud --hooks=on`，并将 GitHub-origin cloud workspace skill root 切到 `.github/skills`。
- `docs/architecture.md` 说明核心策略来自 `harness/core/policy/base.md`，各平台由 adapter 投影；GitHub Copilot hooks 使用 `.github/hooks/*.json` 与 `.github/hooks/*` helper scripts。
- `docs/workflows.md` 已有 plan/review/verify/finish/release/archive lane，适合扩展为 cloud-dev lane 或在现有 lane 上增加 cloud 分支约束。
- `.github/workflows/upstream-refresh.yml` 是现有 Actions 自动化样板：`workflow_dispatch` + schedule，最小权限 `contents: write` / `pull-requests: write`，默认 `create_pr: false` rehearsal，可选 PR 创建。
- `harness/core/policy/cloud-safe.md` 限制 cloud 工作区写 HOME、全局安装、host-only secrets 和出站 credential-bearing 自动化；适合作为 cloud dev agent 的 baseline overlay。
- `harness/installer/commands/cloud-bootstrap.mjs` 已能生成 Codespaces safety bootstrap；模板会运行 `./scripts/harness install --scope=workspace --profile=cloud-safe --deployment-profile=github-cloud --hooks=on`。
- `harness/installer/lib/state.mjs` 中 `deploymentProfile` 仅支持 `standard` 和 `github-cloud`，且非 workspace scope 禁止使用非默认 deployment profile。
- `harness/core/metadata/platforms.json` 已把 Copilot `github-cloud` 的 workspace skill root 切到 `.github/skills`，测试覆盖该行为。
- 归档任务 `origin-cloud-harness-deployment-plan` 已确认：cloud harness 推荐是 Copilot-only repo overlay；不推荐根 `AGENTS.md` 或共享 `.agents/skills` 作为 cloud 专用入口。
- GitHub 官方文档确认：Copilot cloud agent 在 GitHub Actions 驱动的临时环境中工作，可研究、计划、改代码、跑测试、推 branch、可开 PR；单次任务只能操作指定 repo、一个 branch、一个 PR。
- GitHub 官方 hooks 文档确认：`.github/hooks/*.json` 必须存在于 default branch 才会被 Copilot cloud agent 使用。
- GitHub 官方 agent skills 文档确认：project skills 支持 `.github/skills`、`.claude/skills` 或 `.agents/skills`；对本方案应优先使用 `.github/skills` 以降低本地跨 agent 串扰。

## 待研究
- Harness adoption/install 的现有入口和平台支持。
- GitHub Actions / cloud agent 是否已有文档或脚本基础。
- 分支、base、同步、权限、PR 边界的安全约束。

## 风险判断
- `cloud-dev` 可以作为 base 分支或 staging 分支，但不应作为 agent 直接反复 force-push 的工作分支；agent 每个 issue/task 应使用独立 `cloud-dev/<issue>-<slug>` 或 Copilot 原生 branch，然后向 `cloud-dev` 或 `dev` 开 PR。
- 如果目标是完全不让本地看到 cloud harness 文件，则不可达；一旦文件进入 repo，本地 checkout 会看到。但可通过只在 `.github/**` 存放 Copilot cloud 专用入口，把对本地 Codex/Claude/Cursor 的影响降到最低。
- Actions 可以监听 issues 并触发 orchestration，但真正“让 Copilot cloud agent 自动开发”的公共接口需要按 GitHub 当时支持面选择：优先使用 issue assignment / `@copilot` / custom agent 入口；如果需要 Actions 主动调用 agent，需要额外确认可用 API 或 GitHub App 能力。
- 最终建议采用 staged pilot：先 docs-only / planning task，再低风险 test/docs/refactor，最后才开放普通 feature implementation。
- 工程级 plan 应优先实现可测试的纯函数层：`scripts/ci/lib/cloud-dev-branch.mjs` 和 `scripts/ci/lib/cloud-dev-issue.mjs`，再接 runner 与 workflows，避免把 GitHub Actions 行为写成不可测试脚本。
- `cloud-dev` sync 必须默认 check-only；sync path 只能在明确 `mode=sync`、repo variable enabled、无 open cloud PR、且 `cloud-dev` 可从 `origin/dev` fast-forward 时执行。

## Findings Record: 2026-05-10 22:20:39 UTC+8
- implementation plan 已被用户批准执行，当前活动任务继续沿用 `cloud-dev-harness-feasibility` 目录，并把 companion implementation plan 作为详细施工清单。
- 当前工作区不是 linked worktree：`git rev-parse --git-dir` 与 `--git-common-dir` 都指向仓库根 `.git`。
- worktree preflight 推荐保留当前开发上下文，使用 `dev @ 8be83eada6ebb7d0637d3f2cedd0d24bc1bb3d4e` 作为隔离工作区基线。
- 当前 `git status --short` 仅看到无关未跟踪项 `.agents/skills/planning-with-files/scripts/__pycache__/`；说明主工作区并非完全干净。

## Findings Record: 2026-05-10 22:24:47 UTC+8
- 当前实现在 linked worktree `.worktrees/202605101422-cloud-dev-harness-feasibility-001` 中进行，避免污染主 `dev` 工作区。
- worktree 分支为 `202605101422-cloud-dev-harness-feasibility-001`，显式基线为 `dev @ 8be83eada6ebb7d0637d3f2cedd0d24bc1bb3d4e`。
- `npm run verify` 在该 worktree 基线上已通过，说明仓库当前测试基线干净。
- Task 1/2 的最近邻实现模式来自 `scripts/local/sync-dev-after-upstream-pr.mjs` 与 `tests/automation/local-dev-sync.test.mjs`：先测试纯函数，再用注入式 command runner 组装可测试的 CLI。
- workflow 静态测试可直接复用 `tests/automation/upstream-refresh-workflow.test.mjs` 中的 block/step 解析 helper。

## Findings Record: 2026-05-11 00:03:43 UTC+8
- Task 5 review 暴露了 implementation plan 内部的一个真实冲突：Task 1/2 明确让 `analyzeCloudDevSync({ mode: 'check' })` 返回 `reason: 'check_only'`，而 Task 5 的 readiness handoff 又尝试仅凭 `reason` 判定是否 ready。
- 已通过实际复现确认：`analyzeCloudDevSync()` 在 `mode='check'` 下，无论分支是 diverged、`cloud-dev` ahead，还是存在 open PR，都会返回 `reason: 'check_only'`。
- 因此 readiness gate 的根因不是 YAML 语法，而是“把被压平的 `reason` 当成健康状态”。修复应改为读取 result report 的结构化字段（至少 `aheadBehind` 与 `openPullRequestsTargetingCloudDev`），而不是继续放大 `check_only` 的语义。
- `.github/workflows/cloud-dev-issue-triage.yml` 当前也没有排除 PR comments；`issue_comment` 事件默认会覆盖 issue 和 PR discussion comment，需要显式加 guard 才符合 issue triage 预期范围。

## Findings Record: 2026-05-11 01:44:43 UTC+8
- `npm run verify` 的剩余失败不在本次 cloud-dev 实现范围内：失败测试是 `tests/mcp/receipt-ledger.test.mjs` 与 `tests/mcp/safe-write.test.mjs`，根因是当前 worktree 的 Harness projection manifest/state 与受管 entry 文件（尤其 `AGENTS.md`）不一致，`applyWritePlan(sync)` 命中了现有的 safe-apply ownership 拒写逻辑。
- `./scripts/harness doctor --check-only` 的失败同样属于现有环境/元数据问题：当前 worktree 缺失 `.github/copilot-instructions.md` 与 `CLAUDE.md`，同时 doctor 仍报告 companion-plan 引用不一致；这些都不是 cloud-dev feature 代码路径本身的回归。
- `node scripts/ci/check-cloud-dev-branch.mjs --mode=check` 失败则是 rollout prerequisite 未满足：远端尚未创建 `cloud-dev` 分支，因此 `git fetch origin dev cloud-dev` 会返回 `fatal: couldn't find remote ref cloud-dev`。
