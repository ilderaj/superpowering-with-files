# Task Plan: GitHub Actions Upstream Automation Analysis

## Goal
分析并规划如何用 GitHub Actions 定期检测 Superpowers 和 Planning with Files 主源变更，在本项目内自动刷新 baseline、执行验证，并以 PR 方式把结果落到 `dev`。

## Current State
Status: closed
Archive Eligible: yes
Close Reason: final rehearsal on main succeeded, dev parity fix merged, schedule gate enabled, and local dev aligned with origin/dev

## Current Phase
Phase 17

## Phases

### Phase 1: 仓库上下文与约束确认
- [x] 读取用户问题与仓库工作流约束
- [x] 确认已有 upstream update 能力与 planning 任务状态
- [x] 确认本次只做分析、不改源码
- **Status:** complete

### Phase 2: 外部能力与风险调研
- [x] 查阅 GitHub Actions、PR、auto-merge、权限和相关官方文档
- [x] 结合本项目 upstream source 设计判断可行方案
- [x] 记录关键发现
- **Status:** complete

### Phase 3: 分析结论交付
- [x] 给出推荐架构
- [x] 列出可自动化部分、需人工审批部分、风险与落地条件
- [x] 更新 planning 文件并向用户汇报
- **Status:** complete

### Phase 4: README 精简同步
- [x] 根据已确认的 Git source 状态，精简 README 的 upstream 更新说明
- [x] 确认 README 不再出现旧的本地 `--from` 指令
- **Status:** complete

### Phase 5: GitHub Actions 落地计划评审
- [x] 结合当前仓库与 GitHub 远端状态复核自动化前提
- [x] 审核“每周五拉取 upstream 更新并最终落到 origin dev”的计划路径
- [x] 输出计划风险、缺口和建议执行顺序
- **Status:** complete

### Phase 6: 可执行实现计划编写
- [x] 按 `writing-plans` 规则产出可落地执行的分步实现计划
- [x] 将实现计划写入当前 task 的 durable planning 文件
- [x] 将任务状态切换为 `waiting_review`
- **Status:** complete

### Phase 7: 旧计划有效性复核与修订
- [x] 结合仓库最新更新复核旧计划的技术与流程前提
- [x] 标记旧计划中已失效或需替换的关键假设
- [x] 产出一版修订后的可执行计划供 review
- **Status:** complete

### Phase 8: 计划 review 收口
- [x] 复核当前 GitHub 远端前提是否仍与旧 review 一致
- [x] 基于用户三点目标给出可执行与不可直接执行的边界
- [x] 把最新 review 结论写回 task-scoped planning 文件
- **Status:** complete

### Phase 9: 计划修订与 companion plan 收口
- [x] 按 review 结论重写实施计划
- [x] 把详细执行清单迁移到 companion plan
- [x] 在 task-scoped planning 文件中只保留摘要、决策和引用
- **Status:** complete

### Phase 10: 4 月 30 日方案复核与实施计划更新
- [x] 复核当前仓库是否已有 workflow / CI automation 实现
- [x] 复核远端默认分支、`dev` branch protection 和目标 PR 状态
- [x] 明确 GitHub 云端自动化与本地 `dev` 同步的边界
- [x] 更新 companion plan 的详细实施清单
- **Status:** complete

### Phase 11: Task 3 code quality review 重要问题修复
- [x] 修复 refresh command 失败时 stdout/stderr 捕获与错误传播
- [x] 修复 command-chain 失败结果中的 eligible files best-effort capture
- [x] 扩展 repo-owned upstream/projection/doc allowlist 并继续排除 runtime-only files
- [x] 增强 `tests/automation/upstream-refresh-lib.test.mjs` 覆盖以上行为
- **Status:** complete

### Phase 12: Task 4 PR automation 与 review gate 实现
- [x] 先运行 `tests/automation/upstream-pr-lib.test.mjs` 确认缺少 PR helper 时 RED
- [x] 新增 PR helper constants、body builder、command plan builders 与 no-eligible gate
- [x] 新增 PR CLI runner，读取 `.harness/upstream-refresh-result.json` 并通过注入 runner 执行 git/gh
- [x] 覆盖 bot git identity、existing PR update、新 PR create、advisory review body、commit/gh terminal failure
- [x] 运行指定验证并记录 Task 5 workflow 缺口不在本轮范围内
- **Status:** complete

### Phase 13: Task 5 Workflow And Artifacts 接线
- [x] 先运行 `tests/automation/upstream-refresh-workflow.test.mjs` 确认缺少 workflow 时 RED
- [x] 新增 `.github/workflows/upstream-refresh.yml`，接通 `workflow_dispatch` 与 weekly schedule `0 12 * * 5`
- [x] workflow 使用最小权限 `contents: write` 与 `pull-requests: write`
- [x] 接通 refresh runner、result artifact 上传、result JSON 输出解析和 PR runner gate
- [x] 运行 workflow contract test 与 automation 全量测试确认 GREEN
- **Status:** complete

### Phase 14: Task 7 Optional Local Dev Sync Helper
- [x] 先新增并运行 `tests/automation/local-dev-sync.test.mjs`，确认 helper 缺失时 RED
- [x] 新增 `scripts/local/sync-dev-after-upstream-pr.mjs`，只允许 clean worktree、local `dev` 未领先且可 fast-forward 时同步
- [x] 文档说明 GitHub Actions 不能直接触发本机 helper，v1 使用 manual、macOS LaunchAgent 或有意暴露的 local webhook
- [x] 运行 focused test、`node --check` 与 `npm run verify` 确认 GREEN
- **Status:** complete

### Phase 15: Final code review PR helper 修复
- [x] 在 `runOpenUpstreamPullRequest()` 内部要求 refresh result status 为 `success`
- [x] 非 success refresh result 抛出 `UpstreamPullRequestError`，让 CLI 非零，并且不运行 git/gh 写操作
- [x] existing automation PR update 使用 `git push --force-with-lease origin automation/upstream-refresh`
- [x] create path 保持 `git push --set-upstream origin automation/upstream-refresh`
- [x] 更新 PR body、maintenance docs 和 regression tests，明确 guarded update 只适用于 matched automation branch/base PR
- **Status:** complete

### Phase 16: Post-merge rehearsal fix for clean-checkout workspace takeover
- [x] 在 `main` 上触发第一次 `workflow_dispatch` rehearsal，并下载失败 artifact 与 logs
- [x] 确认失败根因是 clean checkout 缺少 workspace projection ownership，导致 `install --scope=workspace` 在 `AGENTS.md` 处拒绝 takeover
- [x] 从 `origin/main` 创建隔离 worktree 修复 CI 路径，而不是沿本地分叉 `dev` 继续
- [x] 先补 failing tests，锁住 `install --mode=force` 和 refresh command chain
- [x] 实现显式 `install --mode=force` -> `sync --takeover` 通道，并让 upstream refresh 使用它
- [x] 运行 focused tests 与 `npm run verify` 确认 GREEN
- **Status:** complete

### Phase 17: Final rollout rehearsal and governance enablement
- [x] 触发带有 final gating fix 的最新 `main` rehearsal，并确认 workflow run `25295497835` 全部成功
- [x] 将 final gating fix 同步到 `dev`，合并 PR `#40` 保持 `main` / `dev` automation parity
- [x] 启用 repo variable `UPSTREAM_REFRESH_SCHEDULE_ENABLED=true`
- [x] 为 `dev` 启用最小可行 branch protection：PR required、1 个 approval、resolved conversations
- [x] 将主工作区本地 `dev` 安全对齐到 `origin/dev`，并保留备份分支
- **Status:** complete

## Key Questions
1. GitHub Actions 是否能定期检测两个 upstream 主源的变更？
2. Actions 是否能安全触发本项目已有 `fetch` / `update` 流程？
3. 更新后自动代码审查、验证、PR 创建/更新、合并分别能做到什么程度？
4. 哪些环节必须设置权限、分支保护或人工审批，避免供应链和权限风险？

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| 本次只做分析与计划修订，不改源码 | 用户先要求 review plan，不直接执行 |
| 复用现有 `github-actions-upstream-automation-analysis` task | 避免制造平行 planning 状态 |
| 自动化入口必须是默认分支 `main` 上的 workflow | GitHub `schedule` 仅在默认分支运行 |
| 真正的 upstream 拉取应映射为 Harness `fetch/update/sync/verify/doctor` 链路 | 仓库没有 git remote `upstream`；上游来源定义在 `harness/upstream/sources.json` |
| refresh 工作分支固定从 `origin/dev` 派生 | 用户目标是最终通过 PR 落到 `dev` |
| 详细实施清单迁移到 companion plan `docs/superpowers/plans/2026-04-19-github-actions-upstream-automation-analysis-plan.md` | 保持 `planning/active/.../task_plan.md` 为 summary-only durable task memory |
| 2026-04-30 修订采用 `Friday 20:00 Asia/Shanghai`，即 GitHub cron `0 12 * * 5` | 用户本轮明确“周五晚上 8 点”；在未另行指定时区时按中文语境默认 UTC+8 |
| v1 的“处理冲突”定义为 fail-fast + artifact/log + 人工接管 | 当前仓库没有安全的 bot 自动解冲突机制 |
| 启用 weekly schedule 前先要求 `dev` branch protection / required checks 就位 | 否则“最终落到 origin dev”的自动化会绕过治理面 |
| v1 不做 auto-merge，也不允许 workflow 直推 `dev` | 先保留审查面，降低供应链与误推风险 |
| upstream 更新探测应先做 `git ls-remote <url> HEAD` 对比 | 用户要求“根据 head 分析有无更新”，可避免无更新时创建分支和 PR |
| GitHub Actions 不能直接同步这台机器的 local `dev` | GitHub runner 只能修改远端仓库；本地 checkout 需要独立 helper、local schedule 或手动触发 |
| local `dev` 同步 v1 只允许 fast-forward | 脏工作区、本地领先、分叉或冲突都必须停止并输出恢复建议，不能无人值守解冲突 |
| local `dev` 同步 preflight 必须使用完整 refs | 短 ref `dev` 可能解析到同名 tag；`origin/dev` 也应避免短名歧义 |
| PR automation helper 固定 `automation/upstream-refresh` -> `dev` 与 `chore: refresh upstream baselines` | 保持自动化分支、目标分支和 PR 标题稳定，便于去重、review 和 workflow gate |
| PR body 只把 automatic review/checks 标记为 advisory，并明确 final human review required | 避免 bot review 被误解为最终审批，也不启用 auto-merge |
| PR CLI 通过注入 runner 执行 git/gh | 测试不实际 push、不创建 PR；CI 运行时仍可执行真实命令 |
| Task 5 workflow 不运行 `npm ci` | 当前仓库没有 lockfile，加入 install step 会制造不稳定失败；refresh runner 内部会执行 `npm run verify` |
| clean checkout 的 workspace refresh install 必须显式 opt into takeover | CI checkout 没有 `.harness/projections.json` ownership manifest，但仓库已经包含 authoritative workspace projections；默认 reject 会在 `AGENTS.md` / skill roots 处阻塞 refresh |
| `install --mode=force` 通过 `sync --takeover` 接管 desired projection targets | 只为显式重建场景放宽 ownership，不改变默认 install/sync 的 reject 保护 |
| PR runner gate 同时要求 job success、`result.status == success` 和 `eligibleFiles.length > 0` | 避免失败 refresh、无变化或无 eligible files 时创建 PR |
| `.harness/upstream-refresh-result.json` 作为 workflow artifact 上传 | 失败或 blocked 情况下仍保留 result JSON，便于人工接管 |
| Task 7 local dev sync helper 只运行 `git fetch origin dev`、`git checkout dev`、`git merge --ff-only origin/dev` | 本地同步保持 fast-forward-only；脏工作区、本地领先、分叉或冲突全部停止并报告恢复建议 |
| PR helper 内部必须再次检查 `refreshResult.status === 'success'` | workflow gate 不能作为唯一保护；helper 被单独调用时必须从 failure/no_changes/unknown result 抛出终止错误，不能创建或更新 PR |
| existing automation PR update 使用 `--force-with-lease` | 自动化分支每次从 `origin/dev` 重建，plain push 可能 non-fast-forward；lease 只用于已匹配 head `automation/upstream-refresh` 和 base `dev` 的 automation-owned PR |
| PR create path 不使用 force push | 新建 automation PR 仍使用 `git push --set-upstream origin automation/upstream-refresh`，保持首次远端分支创建语义清晰 |
| final rollout 在启用 schedule 前先补 `dev` 最小保护，再把 repo variable 打开 | 仓库没有其他 required checks 可挂，因此用 PR review + conversation resolution 建立最低治理面，避免定时自动化在无保护分支上长期运行 |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| `fd` 不存在 | 1 | 按降级策略改用 `rg --files` |

## Notes
- 需要用中文输出分析；代码相关名称、命令、workflow 字段保持英文。
- 本轮只修订计划与 planning 文件，不创建 workflow、不改 GitHub 设置、不推分支。
- Companion plan 与 task memory 已双向关联；task memory 保留摘要，companion plan 保存详细步骤。
- 2026-05-04 已完成 rollout 收口：`main` rehearsal 通过、`dev` parity fix 合并、schedule gate 启用、`dev` protection 生效、本地 `dev` 已对齐远端。
- 2026-05-06 审计确认：关闭状态仍有效；主工作区实现与远端状态一致，但存在一个旧 rehearsal worktree 保留失败 refresh 产物，不应视为当前待合并实现。

## Current Verdict

- 原始方向仍成立：`main` 上 schedule 触发、先探测 upstream `HEAD`、工作分支从 `origin/dev` 派生、执行 Harness refresh chain、通过 PR 落到 `dev`。
- 2026-05-06 复核：`.github/workflows/upstream-refresh.yml`、`scripts/ci/*`、`tests/automation/*`、`scripts/local/sync-dev-after-upstream-pr.mjs` 均已存在；远端默认分支仍为 `main`，`dev` protection 与 `UPSTREAM_REFRESH_SCHEDULE_ENABLED=true` 仍在，最新 run `25295497835` 仍是成功 rehearsal。
- 原始计划不能按原样执行，核心缺口是：
  1. 缺少具体的 UTC schedule。
  2. 把“处理冲突”描述得过于乐观，没有 fail-fast 分流。
  3. 缺少 `dev` branch protection / required checks 前置条件。
  4. 详细 checklist 直接写在 task memory，违反当前 summary-only sync-back 边界。
- 2026-04-30 复核后新增边界：GitHub 端自动化可行；PR merge 后自动同步 local `dev` 不是 GitHub-only 能力，需要本地 fast-forward helper。
- 修订后计划已经把这些边界收口，并迁移到 companion plan。
- 2026-05-06 额外观察：当前主工作区执行 `npm run verify` 未全绿，但失败集中在 `tests/adapters/sync-skills.test.mjs` 的本机 `~/.harness/backups` 写权限，以及 `tests/installer/worktree-name.test.mjs` / `tests/installer/worktree-preflight.test.mjs` 的 worktree naming 断言漂移；这些不是原 upstream automation rollout 的未完成项，而是后续 repo health / worktree naming 回归问题。

## Companion Plan Reference

- Companion plan: `docs/superpowers/plans/2026-04-19-github-actions-upstream-automation-analysis-plan.md`
- Companion plan role: 保存详细实施清单、rollout gates、文件级任务拆分和启用顺序。
- Sync-back status: `2026-04-30` 已完成。

## Revised Execution Plan Summary

### Phase A: Workflow Skeleton And Contracts
- 建立 `.github/workflows/upstream-refresh.yml`，先接通 contract tests 和 `workflow_dispatch` 演练。
- 定时入口默认锁定为 `Friday 20:00 Asia/Shanghai` / `0 12 * * 5`，但只有在 `dev` protection 配好后才启用 schedule。
- 新增 `tests/automation/` 合约测试，锁定 workflow trigger、branch source、result file 和 PR gate。

### Phase A1: Upstream HEAD Probe
- 新增 `scripts/ci/lib/upstream-heads.mjs`，读取 `harness/upstream/sources.json` 并用 `git ls-remote <url> HEAD` 检查两个 Git source。
- 维护 repo-owned source head record，例如 `harness/upstream/.source-heads.json`。
- 无 upstream HEAD 变化时写出 `no_changes` result，不创建 branch、不开 PR。

### Phase B: Refresh Runner
- 用 `scripts/ci/lib/upstream-refresh.mjs` 和 `scripts/ci/run-upstream-refresh.mjs` 执行：
  - `git fetch origin main dev`
  - `git checkout -B automation/upstream-refresh origin/dev`
  - `./scripts/harness install --scope=workspace --targets=all --projection=link --mode=force`
  - `./scripts/harness fetch`
  - `./scripts/harness update`
  - `npm run verify`
  - `./scripts/harness worktree-preflight`
  - `./scripts/harness sync --dry-run`
  - `./scripts/harness sync`
  - `./scripts/harness doctor`
- 变更检测必须覆盖 tracked + untracked repo-owned files。
- `.harness/projections.json`、`.harness/state.json` 和其他运行态文件继续排除在 commit allowlist 外。
- 冲突、verify 失败、allowlist 失败全部按 fail-fast 处理，不自动修复。

### Phase C: PR Automation
- 用 `scripts/ci/lib/upstream-pr.mjs` 和 `scripts/ci/open-upstream-pr.mjs` 固定：
  - branch：`automation/upstream-refresh`
  - title：`chore: refresh upstream baselines`
  - base：`dev`
- commit 前显式配置 bot git identity。
- 没有 eligible changes 时不创建空 PR。

### Phase D: Docs And Operator Checklist
- 更新 `docs/maintenance.md`，说明：
  - schedule 在 `main` 上运行，但工作基线是 `origin/dev`
  - v1 没有 auto-merge，冲突处理是 fail-fast + 人工接管
  - 失败时查看 workflow artifact 与 `.harness/upstream-refresh-result.json`
  - 启用 schedule 前需要人工确认 `dev` branch protection / required checks

### Phase E: Local Dev Sync Helper
- 新增可选本地命令 `scripts/local/sync-dev-after-upstream-pr.mjs`。
- helper 只在 clean worktree、local `dev` 未领先、可 fast-forward 时同步 `origin/dev`。
- GitHub Actions 不直接触发本地同步；本地同步通过手动命令、macOS LaunchAgent 或后续显式配置的本地 webhook 完成。
