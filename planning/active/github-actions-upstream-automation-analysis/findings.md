# Findings & Decisions

## Requirements
- 用户要分析 GitHub Actions 是否可用于定期监测 Superpowers 和 Planning with Files 主源变更。
- 自动化目标包括：触发项目内更新、更新后自动代码审查、相关验证、验证通过后自动合并分支并创建/处理 PR。
- 用户明确要求不要改代码，先分析。
- 仓库要求本次对话和 planning 内容使用中文；代码相关内容保持英文。

## Research Findings
- 本项目已有 `planning/active/harness-upstream-smooth-update/` 任务，但已标记 `Status: closed` 和 `Archive Eligible: yes`。
- 旧任务结论显示项目已经实现了分离式 upstream 更新能力：`fetch` 将候选更新写入 `.harness/upstream-candidates/<source-name>/`，`update` 只允许写入 allowlisted `harness/upstream/<source-name>`。
- `harness/upstream/sources.json` 已将 `superpowers` 配置为 git source：`https://github.com/obra/superpowers`；`planning-with-files` 已配置为 git source：`https://github.com/OthmanAdi/planning-with-files`。
- 2026-04-12 复核：全局 `/Users/jared/.agents/.skill-lock.json` 中 `planning-with-files` 记录为 GitHub 来源 `https://github.com/OthmanAdi/planning-with-files.git`；用户已确认该仓库为主源，HarnessTemplate 现在也以 `harness/upstream/sources.json` 跟踪该 Git source。
- 2026-04-12 复核：本地 `/Users/jared/.agents/skills/planning-with-files` 不是 Git 仓库；`/Users/jared/.agents/skills/superpowers` 是指向 `/Users/jared/.codex/superpowers/skills` 的 symlink，后者是跟踪 `origin/main` 的 Git 仓库。
- planning-with-files active 扫描显示多个旧任务已 `ARCHIVE_OK`，但本次未自动归档。
- GitHub Actions `schedule` 可以定期触发 workflow，但只会在默认分支运行；定时任务可能在高负载时延迟或被丢弃，因此不应把它当成精确时钟。
- `GITHUB_TOKEN` 可以在 workflow 中调用 API、创建 issue/PR 等，但应按最小权限设置 `permissions`。
- 重要限制：用仓库 `GITHUB_TOKEN` 触发的事件，除了 `workflow_dispatch` 和 `repository_dispatch`，不会创建新的 workflow run；如果 schedule job 用 `GITHUB_TOKEN` push 更新分支，普通 `push`/`pull_request` CI 可能不会自动启动。
- GitHub App installation token 可以在 Actions 中生成，用于需要超出 `GITHUB_TOKEN` 行为或权限的 API 调用；这是自动创建分支/PR 并触发后续检查链的更稳妥路径。
- `gh pr create` 支持非交互创建 PR，`gh pr merge --auto` 支持在必要要求满足后自动合并。
- GitHub auto-merge 需要仓库启用；PR 会在 required reviews 和 required status checks 满足后自动合并。
- 分支保护可以要求 PR、审批和 required status checks；required checks 必须在 PR 最新 commit SHA 上成功。
- GitHub Copilot code review 可以配置为自动 review PR；这是“自动代码审查”的一种 GitHub 原生路径，但依赖 Copilot 计划/仓库或组织规则集配置。
- Dependency review 可在 PR 中展示依赖变化与漏洞信息，Dependency Review Action 可作为 required check 阻断有漏洞的依赖变更；本仓库更新的是 vendored skill baseline，仍应配合普通测试和差异 allowlist。
- 2026-04-17 复核：当前仓库 git remote 只有 `origin`，没有名为 `upstream` 的 remote；真正的上游来源来自 `harness/upstream/sources.json` 中的两个 Git source。
- 2026-04-17 复核：GitHub 远端 `ilderaj/superpowering-with-files` 默认分支是 `main`，不是 `dev`。
- 2026-04-17 复核：仓库当前没有 `.github/workflows/`，说明 GitHub Actions 自动化尚未开始落地。
- 2026-04-17 复核：`dev` 和 `main` 当前都没有 branch protection；`gh api repos/ilderaj/superpowering-with-files/branches/<branch>/protection` 返回 `404 Branch not protected`。
- 2026-04-17 复核：仓库当前 `.harness/state.json` 为 `scope: "user-global"`，target 指向用户目录，不是 CI 可直接复用的 workspace 安装状态。
- 2026-04-17 复核：`package.json` 提供的仓库级验证命令是 `npm run verify`；维护文档要求 upstream update 后继续跑 `./scripts/harness worktree-preflight`、`./scripts/harness sync --dry-run`、`./scripts/harness sync`、`./scripts/harness doctor`。
- 2026-04-17 复核：当前没有以 `dev` 为 base 的 open PR，说明计划若要“最终落到 origin dev”，需自行定义 PR 分支命名、合并策略和去重逻辑。

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| 将本次分析作为独立 task id | 避免覆盖已关闭的 upstream smooth update 任务状态 |
| 先基于本地已有 updater 能力和 GitHub 官方文档分析 | 用户问的是可行性与设计，不需要实现 |
| 自动化拆成“探测/更新 PR”和“PR 验证/合并”两条链路 | 避免 `GITHUB_TOKEN` 递归触发限制导致 PR required checks 缺失 |
| 更新 PR 只允许变更 `harness/upstream/**` 和必要 metadata/docs | 本仓库已有 upstream path guard；CI 还应做 diff allowlist 二次校验 |
| 对 `planning-with-files` 按 Git source 自动化处理 | 已确认远端主源并更新 source metadata，Actions 可独立拉取候选更新 |
| 本轮用户计划可以做，但原始描述缺少分支入口、CI 初始化和冲突分流设计 | 直接写成“每周五拉取 upstream 并落到 dev”会忽略 `schedule` 只跑默认分支、CI 没有 workspace state、以及冲突无法在无人值守下自动解决 |
| 冲突处理应分成“无冲突自动 PR”与“有冲突开 issue/失败告警”两条路径 | upstream baseline 更新可能触发 patch/projection/test 失败，不能默认靠 bot 自动 rebase 或强推修复 |
| 如果目标是保留审查面，第一阶段不要自动直推 `dev` | 当前 `dev` 未受保护，若 workflow 直接 push 到 `dev`，等同绕过代码审查与 required checks 设计 |
| 若后续需要 auto-merge，先补 `dev` 分支保护与 required checks，再决定是否启用 | 当前远端无保护规则，auto-merge 的治理前提尚未建立 |
| 若 workflow 需要触发后续 PR 检查链，优先准备 GitHub App token；否则至少把验证全部放在同一个 workflow 内完成 | 这是现有 GitHub token 触发行为的硬边界，不是实现细节偏好 |
| 可执行 v1 采用“单 workflow 完成 refresh + validate + PR create/update” | 这样可以先避开 `GITHUB_TOKEN` 的递归触发限制，不必在第一版就引入 GitHub App token |
| workflow 文件放在默认分支 `main`，但实际工作分支从 `origin/dev` 派生 | `schedule` 必须从默认分支触发，但用户目标是最终把更新落到 `dev` |
| 自动化分支名固定为 `automation/upstream-refresh` | 固定分支便于 PR 去重与更新，也让 reviewer 能稳定识别自动更新来源 |
| v1 的 commit allowlist 只接受 `harness/upstream/**`、repo-local projection paths 和 `docs/maintenance.md` | 需要把供应链变更面收窄到 Harness-owned 文件，避免 CI 意外改动其他路径 |
| `.harness/projections.json` 视为运行态文件，不进入 commit | `sync` 会写入该文件，但它不属于本次 PR 应提交的 repo-owned baseline/projection 结果 |

## Issues Encountered
| Issue | Resolution |
|-------|------------|
| 本机没有 `fd` | 使用 `rg --files` 继续定位文件 |

## Resources
- 本地 Superpowers 源：`/Users/jared/.codex/superpowers`
- 本地 Planning with Files skill：`/Users/jared/.agents/skills/planning-with-files/SKILL.md`
- 本项目 upstream smooth update 任务：`/Users/jared/HarnessTemplate/planning/active/harness-upstream-smooth-update/`
- GitHub Actions schedule 文档：`https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule`
- GitHub `GITHUB_TOKEN` 文档：`https://docs.github.com/en/actions/concepts/security/github_token`
- GitHub App token in Actions 文档：`https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/making-authenticated-api-requests-with-a-github-app-in-a-github-actions-workflow`
- GitHub CLI `gh pr create`：`https://cli.github.com/manual/gh_pr_create`
- GitHub CLI `gh pr merge`：`https://cli.github.com/manual/gh_pr_merge`
- GitHub auto-merge 文档：`https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/incorporating-changes-from-a-pull-request/automatically-merging-a-pull-request`
- GitHub branch protection 文档：`https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/managing-a-branch-protection-rule`
- GitHub Copilot automatic code review 文档：`https://docs.github.com/en/copilot/how-tos/copilot-on-github/set-up-copilot/configure-automatic-review`
- GitHub dependency review 文档：`https://docs.github.com/en/code-security/concepts/supply-chain-security/about-dependency-review`
- 远端仓库信息：`gh repo view ilderaj/superpowering-with-files --json nameWithOwner,defaultBranchRef,mergeCommitAllowed,rebaseMergeAllowed,squashMergeAllowed,isPrivate,viewerPermission,deleteBranchOnMerge`
- 分支保护检查：`gh api repos/ilderaj/superpowering-with-files/branches/dev/protection`
- 分支保护检查：`gh api repos/ilderaj/superpowering-with-files/branches/main/protection`

## Visual/Browser Findings
- GitHub 官方文档确认了定时触发、token 递归触发限制、GitHub App token、自动 PR review、auto-merge 与 required checks 的行为边界。
