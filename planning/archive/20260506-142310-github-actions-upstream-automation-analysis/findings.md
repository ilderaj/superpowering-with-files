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
- 2026-04-18 复核：仓库最近新增的是 workflow/policy 审计与 companion-plan 三层模型相关文档、自检与测试，没有新增 `.github/workflows/`、`scripts/ci/`、`tests/automation/` 等旧计划假定的实现文件。
- 2026-04-18 复核：`package.json` 仍未把 `tests/automation/*.test.mjs` 纳入 `npm run verify`，说明旧计划中的自动化测试接线尚未开始落地。
- 2026-04-18 复核：当前 policy 明确要求 `sync-back is summary-only`，并强调 detailed implementation checklist 不应继续直接塞进 `planning/active/<task-id>/task_plan.md`。
- 2026-04-18 复核：旧计划中的 refresh runner 使用 `git status --porcelain --untracked-files=no` 收集变更；这会漏掉首次由 `sync` 生成的 untracked projection files，导致自动 PR 可能缺失 repo-owned 新文件。
- 2026-04-18 复核：旧计划没有为 GitHub runner 上的自动 commit 配置 `git user.name` / `git user.email`，commit 步骤存在失败风险。
- 2026-04-19 复核：远端仓库 `ilderaj/superpowering-with-files` 默认分支仍是 `main`，`dev`/`main` 仍未启用 branch protection，且当前没有 base 为 `dev` 的 open PR；4 月 17 日的外部前提到今天仍然成立。
- 2026-04-19 复核：用户这次口头计划只指定了“每周五”，但没有指定具体时刻；GitHub Actions `schedule` 使用 UTC，若不先确定时区与时间点，就无法写出稳定且可 review 的 cron 表达式。
- 2026-04-19 复核：用户要求“处理冲突”，但当前仓库并没有可支撑 bot 自动解冲突的既有机制；v1 应把冲突、verify 失败、allowlist 失败都视为“停止开 PR/停止合并并告警”的人工分流条件，而不是自动修复条件。
- 2026-04-19 修订：详细实施清单已迁移到 companion plan `docs/superpowers/plans/2026-04-19-github-actions-upstream-automation-analysis-plan.md`；`planning/active/github-actions-upstream-automation-analysis/` 只保留摘要级任务记忆。
- 2026-04-30 复核：当前仓库仍没有 `.github/workflows/`、`scripts/ci/` 或 `tests/automation/`，说明 GitHub Actions upstream refresh 自动化尚未开始实现。
- 2026-04-30 复核：远端默认分支仍为 `main`，`dev` branch protection 仍返回 `404 Branch not protected`，base 为 `dev` 的 open PR 仍为空。
- 2026-04-30 复核：`harness/installer/lib/upstream.mjs` 当前 `stageGitCandidate` 只是 shallow clone Git source 并删除 `.git`，没有持久记录 upstream HEAD；若要“根据 head 分析有无更新”，需要新增 HEAD probe 和 repo-owned source head record。
- 2026-04-30 复核：GitHub Actions 可以更新远端 branch/PR，但不能直接同步开发者本机的 local `dev` checkout；本地同步必须由本地 helper、LaunchAgent、手动命令或显式 webhook/listener 负责。
- 2026-04-30 复核：本地 `dev` 同步只能安全自动化 fast-forward；如果本地有未提交修改、本地领先或分叉，自动解冲突风险过高，应停止并输出恢复建议。

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
| 旧计划的架构方向保留，但实现计划需要重写为“修订版” | 仓库最近的 policy/health 语义变化没有推翻总体架构，但已足以让旧计划不能按原样执行 |
| 修订版 refresh 逻辑必须纳入 untracked repo-owned files | 否则首次自动刷新时可能遗漏新生成的 projection files |
| 修订版 PR 流程必须显式配置 bot git identity | 避免 GitHub runner 上的 `git commit` 因身份未配置而失败 |
| 修订版计划应把 `task_plan.md` 恢复为摘要级状态记录 | 与最新 companion-plan / summary-only sync-back 边界保持一致 |
| “每周五拉取”在实现前必须补全为“某时区下的明确时刻” | GitHub Actions cron 只接受 UTC；没有时刻就没有可验证的 schedule |
| v1 的“冲突处理”定义为 fail-fast + 通知，而不是自动解冲突 | upstream baseline 更新涉及供应链输入和投影结果，自动解冲突风险过高 |
| 只有在 `dev` 完成保护后，计划里的“最终落到 origin dev”才适合自动化推进 | 否则 workflow 结果实际会绕过代码审查与 required checks 治理目标 |
| 旧 companion plan 曾采用 `Friday 21:00 UTC` (`0 21 * * 5`) 作为默认 schedule 假设 | 该假设已被 2026-04-30 的 `Friday 20:00 Asia/Shanghai` / `0 12 * * 5` 修订取代 |
| companion plan 把 schedule enablement 放到 branch protection 之后 | 先有治理，再启用定时自动化 |
| 2026-04-30 修订采用 `Friday 20:00 Asia/Shanghai` / `0 12 * * 5` | 用户本轮明确晚上 8 点；未指定时区时按中文语境默认 UTC+8 |
| 新增 upstream HEAD probe，不直接依赖 `fetch/update` 判断是否有更新 | 当前 updater 不记录 upstream HEAD；先探测 HEAD 可以在无更新时跳过 branch 和 PR |
| 本地 `dev` 同步从 GitHub workflow 中拆出 | GitHub Actions 无法修改本机 checkout；混在同一条云端 workflow 会制造不可执行假设 |
| 本地同步 helper 只做 fast-forward，不做 stash/rebase/conflict auto-resolution | 自动解决本地冲突可能覆盖用户工作或错误合并供应链输入 |
| Task 3 review 修复要求 refresh command 失败对象携带 stdout/stderr 与 failed command | `blockedReason` 需要真实输出才能识别 `CONFLICT`、merge 和 verify 失败细节 |
| command-chain 失败时仍应 best-effort capture changed files 并 filter | 失败结果需要保留 repo-owned eligible files，方便人工接管和 PR gate 判断 |
| refresh allowlist 扩展为 repo-owned upstream/projection/doc paths，但继续排除 `.harness` runtime result/state files | `./scripts/harness sync` 会写投影文件；运行态文件不应进入 commit surface |
| Task 4 PR helper 使用固定 branch/base/title constants | `automation/upstream-refresh`、`dev`、`chore: refresh upstream baselines` 是 PR 去重与 reviewer 识别的稳定契约 |
| Task 4 PR CLI 在 commit 前配置 GitHub Actions bot identity | 避免 runner 上 `git commit` 因缺少 user.name / user.email 失败 |
| Task 4 no eligible files 时不运行 git/gh | 避免空 commit、空 PR 和不必要的远端写入 |
| Task 4 existing PR 路径更新分支并刷新 PR body，不创建新 PR | 固定 automation branch 上的 open PR 是去重依据；body 保持 advisory review gate 文案最新 |
| Task 4 PR body 明确 automatic review/checks are advisory and final human review remains required | 满足 review gate 目标，同时不启用 auto-merge、不让 bot review 替代最终人工 review |
| Task 5 workflow 入口固定为 `workflow_dispatch` 与 `schedule` cron `0 12 * * 5` | 对应 Friday 20:00 Asia/Shanghai，且满足默认分支 `main` 上运行的约束 |
| Task 5 workflow 只声明 `contents: write` 与 `pull-requests: write` | PR branch push 与 PR create/update 需要这两项；不扩大 token 权限 |
| Task 5 workflow 不加 `npm ci` | 当前仓库没有 lockfile，按用户约束避免 broken install step |
| 2026-05-03 rehearsal failure root cause 是 clean checkout 缺少 workspace projection ownership manifest | GitHub runner 在 `origin/dev` 派生 branch 后执行 `./scripts/harness install --scope=workspace --targets=all --projection=link`，会把已存在的 `AGENTS.md` / workspace skill roots 视为 non-Harness-owned 并拒绝覆盖 |
| 修复采用显式 `install --mode=force`，内部转发到 `sync --takeover` | 只在调用方明确 opt in 时把 desired projection targets 视为本次 run 可接管，避免放宽默认 reject 语义 |
| 2026-05-03 rollout fix worktree 明确基于 `origin/main @ 89d0926af4c172428294cf90972fb42ebe4ee822` | `worktree-preflight` 默认建议沿本地 `dev @ 150e824...` 续接，但本地 `dev` 已 ahead/behind `origin/dev`，而失败 workflow 实际运行在 `main`；修复必须跟随远端默认分支 |
| Task 5 PR gate 使用 `success()`、`result.status == success` 与 `eligible_count != 0` | 只有 refresh 成功且存在 eligible changes 时才运行 PR runner |
| Task 5 workflow 上传 `.harness/upstream-refresh-result.json` artifact | 保证 blocked/failure 路径有机器可读结果供人工排查 |
| Task 6 手动 `workflow_dispatch` 默认不走 PR path | `create_pr` input 默认 `false`，只有 operator 显式设置 `create_pr: true` 时才测试 PR create/update |
| Task 6 schedule 需要 repo variable gate | workflow 合入 `main` 后 cron 仍存在，但 scheduled job 只有 `UPSTREAM_REFRESH_SCHEDULE_ENABLED=true` 时才真正执行 |
| Task 7 local helper 不能由 GitHub Actions 直接触发本机执行 | GitHub runner 不能访问开发者机器；v1 只记录 manual、macOS LaunchAgent 和有意暴露的 local webhook 三类显式触发方式 |
| Task 7 local sync 使用 injected runner + pure helper exports | 测试不触碰真实 Git repo；command plan、preflight analysis、ahead/behind parsing 和 report formatting 都可单元测试 |
| Task 7 local sync preflight 使用 `refs/heads/dev`、`refs/remotes/origin/dev` 和完整 range `refs/heads/dev...refs/remotes/origin/dev` | 避免 tag 或其他同名短 ref 让 preflight 误判 local/remote dev 存在性与 ahead/behind |
| Task 7 local sync 只有完整 ref preflight 通过后才执行 `git fetch origin dev`、`git checkout dev`、`git merge --ff-only origin/dev` | 保持用户可识别的同步命令形状，同时把短 ref 风险隔离在 preflight 之外 |
| Task 7 local sync 不执行 stash、rebase 或自动 conflict resolution | 失败时输出 current branch、local HEAD、origin/dev HEAD、stop reason 和 manual recovery suggestions |
| Final review 修复要求 PR helper 内部检查 refresh status | workflow gate 之外仍要保护 direct helper invocation；failure/no_changes/unknown result 必须抛出终止错误，不能运行 git/gh 写操作 |
| Final review 修复要求 existing PR update 使用 guarded force-with-lease | 固定 automation branch 会从 `origin/dev` 重建，plain push 容易 non-fast-forward；只有 matched head/base PR 才允许 guarded lease update |
| PR body 与维护文档必须说明 force-with-lease 不是泛用 force push | 该策略只属于 automation-owned `automation/upstream-refresh` -> `dev` 更新路径；create path 仍使用 `--set-upstream` |
| Final reviewer approved latest PR helper status gate and guarded push behavior | `failure`、`no_changes`、missing/unknown status 会抛出 `UpstreamPullRequestError` 且不运行 git/gh；matched automation PR update 才使用 `--force-with-lease` |
- 2026-05-04 最终 rehearsal run `25295497835` 在最新 `main` 上全部成功 | 之前的 `25295417628` 已因启动时未包含 PR `#39` 修复而失效，不能作为最终 rollout 判定 |
- 2026-05-04 `dev` parity 通过 cherry-pick `d0a690f`、PR `#40` 合并完成 | automation gating 修复现在同时存在于 `main` 和 `dev`，避免后续主线漂移 |
- 2026-05-04 已启用 repo variable `UPSTREAM_REFRESH_SCHEDULE_ENABLED=true` | scheduled run gate 已正式打开，后续 weekly cron 将真正执行 |
- 2026-05-04 `dev` branch protection 采用最小可行治理配置 | 当前仓库没有其他 PR checks 可作为 required checks，因此配置为要求 PR、1 个 approval、resolved conversations，且禁用 force push/deletion |
- 2026-05-04 主工作区本地 `dev` 原本 `ahead 1, behind 9` | 通过创建 `backup/dev-before-origin-align-20260504` 备份分支后重置到 `origin/dev`，完成安全对齐 |
| 正式启用 schedule 前先补最小 `dev` protection，再打开 variable gate | 既遵守“不要在无治理分支上启用定时自动化”的 rollout 原则，也避免因虚构 required checks 把仓库卡死 |

## Issues Encountered
| Issue | Resolution |
|-------|------------|
| 本机没有 `fd` | 使用 `rg --files` 继续定位文件 |

## 2026-05-06 Audit Findings

- 主工作区 `dev` 当前干净，`git status --short --branch` 为 `## dev...origin/dev`，说明本地主线没有残留未提交实现。
- 本地文件面与 closed-task 结论一致：`.github/workflows/upstream-refresh.yml`、`scripts/ci/lib/upstream-heads.mjs`、`scripts/ci/lib/upstream-refresh.mjs`、`scripts/ci/lib/upstream-pr.mjs`、`scripts/ci/run-upstream-refresh.mjs`、`scripts/ci/open-upstream-pr.mjs`、`tests/automation/*.test.mjs`、`scripts/local/sync-dev-after-upstream-pr.mjs` 都已存在。
- 远端事实在 2026-05-06 再次确认：默认分支仍为 `main`；`dev` protection 仍要求 1 个 approval、resolved conversations，并禁用 force push/deletion；repo variable `UPSTREAM_REFRESH_SCHEDULE_ENABLED=true`；最近一次 `Upstream Refresh` run `25295497835` 仍为 `workflow_dispatch` 成功。
- 由于今天是 2026-05-06，离下一次周五定时触发还没到，因此当前只验证过 manual rehearsal，尚未看到 schedule gate 打开后的首次真实 weekly run。
- worktree `/Users/jared/.config/superpowers/worktrees/SuperpoweringWithFiles/20260503-upstream-refresh-rehearsal-fix` 不是待合并实现分支；它停在旧 branch `copilot/20260503-upstream-refresh-layout-compat-dev`，工作区里保留了一次失败 refresh 的未提交产物和 `.harness/upstream-refresh-result.json`。
- 上述 stale worktree 的变更面不符合“可直接提交”的结论：失败 result 明确记录 `npm run verify` 失败，并且存在 `.planning/**` 这类 allowlist violation；因此这批变更只能当作失败现场/后续分析输入，不能视为当前任务未收口的正确实现。
- 当前主工作区运行 `npm run verify` 未全绿，但失败点集中在：
  - `tests/adapters/sync-skills.test.mjs` 试图写入 `~/.harness/backups`，在本轮 sandbox 下报 `EPERM`
  - `tests/installer/worktree-name.test.mjs`
  - `tests/installer/worktree-preflight.test.mjs`
- 这些 verify 失败不属于原 upstream automation rollout 的剩余实施步骤；更像是后续 repo 演进引入的 worktree naming / test harness 问题，需要另开任务处理。

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
