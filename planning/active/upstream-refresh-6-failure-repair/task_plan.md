# Task Plan: Upstream Refresh 6 Failure Repair

## Goal
定位并修复 `Upstream Refresh #6` 失败原因，重点确认是否为 upstream `superpowers` 更新导致 `finishing-a-development-branch` 与 `using-git-worktrees` 补丁锚点失效，并在本地复现、修复、验证后恢复 GitHub Actions upstream refresh 流程。

## Current State
Status: closed
Archive Eligible: yes
Close Reason: `main` 已合入修复，production path 恢复，refresh PR `#45` 已在消除 repo-local entry 覆盖风险后成功合并。

## Current Phase
Complete

## Phases

### Phase 1: GitHub run 取证
- [x] 记录失败 run id、时间、事件类型、失败 job/step
- [x] 提取失败日志和 refresh artifact 关键结论
- [x] 判断需要单开 repair scope
- **Status:** complete

### Phase 2: 本地复现与 upstream diff 定位
- [x] 在隔离 worktree 中抓取最新 upstream candidate
- [x] 复现触发 patch 失败的最小路径
- [x] 对比 upstream skill 结构变化与当前 patch 锚点
- **Status:** complete

### Phase 3: 修复与回归验证
- [x] 修复 patch 逻辑和相应测试
- [x] 跑 focused tests
- [x] 跑全量 `npm run verify`
- [x] 用已更新 upstream candidate 验证失败路径已解除
- **Status:** complete

### Phase 4: 回写 followup 记录
- [x] 更新 `post-upstream-automation-followups` 的观察结论
- [x] 记录 residual risk 和 rerun 前置条件
- [x] 取证首次 scheduled run `#7` 的新失败点并确认仍属于同一 repair scope
- [x] 修复 PR open/update 路径的 `E2BIG` 问题并完成本地回归验证
- [x] 重新触发远端 workflow，确认 `E2BIG` 已解除并暴露出下一层 fixed-branch non-fast-forward 问题
- [x] 修复 remote fixed branch exists but no open PR 时的 push 策略
- [x] 代码进入 GitHub 触发分支后，再次 rerun workflow，确认 branch reuse 已恢复并暴露出最终的 repo-level Actions PR policy blocker
- [x] human 启用 repo 级 “Allow GitHub Actions to create and approve pull requests”，并确认 setting 生效
- [x] 再次 rerun workflow，确认 repo-level policy blocker 已解除并暴露出新的 refresh-step blockers
- [x] 将 `npm ci` + Python cache filtering 修复推上远端，并在本地重新确认 `npm run verify` 通过
- [x] 确认修复进入 `main` 后，再次 rerun workflow 验证生产路径完全恢复
- **Status:** complete

## Key Questions
1. `superpowers` upstream 是否改写了 `finishing-a-development-branch/SKILL.md` 的 Step 结构，导致当前 regex 锚点失效？
2. 这次失败是否只影响 patch materialization，还是已经影响 refresh allowlist / PR contract？
3. 修复应该做成更稳健的 heading-anchor patch，还是直接改成 marker-based replacement？

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| 单开 repair task | 这是新的代码修复面，不能继续只留在 followup 观察 task 里 |
| 复现基线显式选 `origin/dev @ 98fab25430fe6a46bd453cc2af5b37bfdd045b08` | 这正是失败 run 的 headSha；不能混入本地脏 `dev` |
| patch 逻辑改为兼容旧/新两种 upstream heading 结构 | 最新 upstream 已经发生 Step 重排，单一锚点会再次脆断 |
| 只同步 patch 代码与测试回主工作区，不把临时 apply 的 upstream baseline 一起带回 | 修复目标是恢复 refresh 机制本身，不是手工替 action 完成一次 baseline vendor update |
| `gh pr create/edit` 改为 `--body-file`，并截断 PR body 中的 eligible file 列表 | 首次真实 scheduled run 已经证明 refresh 成功后仍会在 PR 打开阶段因为超大 argv 失败；同时需要避免 body 过长带来的二次失败或可读性问题 |
| 当 `automation/upstream-refresh` 远端分支已存在但没有 open PR 时，create path 也必须走 `--force-with-lease` | 手动 rerun 已证明“无 open PR”并不等于“远端 branch 不存在”；固定 automation branch 的状态机必须显式建模远端 branch existence |
| repo 级 GitHub Actions policy 需要显式允许 Actions 创建/批准 PR | 代码链路和 workflow 权限已经足够；最终失败来自仓库设置 `can_approve_pull_request_reviews=false` 对 `createPullRequest` 的硬性拦截 |
| upstream-refresh workflow 必须在 runner 上显式执行 `npm ci` | `verify` 已包含 `tests/mcp/*.test.mjs`，但 workflow 此前只 `setup-node` 没有安装依赖，导致 GitHub runner 在 refresh step 中对 `@modelcontextprotocol/sdk` 直接 `ERR_MODULE_NOT_FOUND` |
| refresh changed-file allowlist 必须忽略运行时 `__pycache__/*.pyc` | Python 脚本在 GitHub runner 上会生成 `cpython-312.pyc`，这类缓存既不是应提交的 upstream/projection 结果，也不应把 refresh 误判成 allowlist violation |
| `workflow_dispatch --ref main` 与 schedule 都使用 `main` 上的 workflow 定义 | 2026-05-08 的 rerun 仍未出现新增的 `Install dependencies` step；对比 `origin/main` 与 `origin/dev` 的 workflow 文件可确认修复只在 `dev`，尚未进入 `main` |
| `sync` 清理 stale projection 时必须受当前 session 的 `rootDir/homeDir` 边界约束 | 否则像 MCP safe-apply 这类测试在临时 `HOME` 下运行时，会因为历史 manifest 中的绝对路径去碰真实 `~/.claude/CLAUDE.md` |

## Implementation Shape
- 隔离 worktree：
  - path: `/Users/jared/.config/superpowers/worktrees/SuperpoweringWithFiles/202605080601-upstream-refresh-6-failure-repair-001`
  - branch: `codex/202605080601-upstream-refresh-6-failure-repair-001`
  - Worktree base: `origin/dev @ 98fab25430fe6a46bd453cc2af5b37bfdd045b08`
- 实际修复文件：
  - `harness/installer/lib/superpowers-finishing-a-development-branch-patch.mjs`
  - `harness/installer/lib/superpowers-using-git-worktrees-patch.mjs`
  - `tests/adapters/skill-projection.test.mjs`

## Residual Risk
- 当前 repair 链路已闭环；后续风险不再是这次修复未生效，而是未来 upstream 继续演进时可能产生新的 refresh diff 或新的 GitHub Actions 平台兼容性变化。
- 当前 GitHub Actions 日志包含平台预警：`actions/checkout@v4`、`actions/setup-node@v4`、`actions/upload-artifact@v4` 仍运行在 Node.js 20 compatibility layer，上游在 **2026-06-02** 开始默认转向 Node.js 24；这不是本次失败原因，但应作为后续维护项关注。

## Notes
- 此 task 来源于 `planning/active/post-upstream-automation-followups/` 的 Phase 2 失败分支。
