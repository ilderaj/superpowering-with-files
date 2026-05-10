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
