# Task Plan: Upstream Refresh 6 Failure Repair

## Goal
定位并修复 `Upstream Refresh #6` 失败原因，重点确认是否为 upstream `superpowers` 更新导致 `finishing-a-development-branch` 与 `using-git-worktrees` 补丁锚点失效，并在本地复现、修复、验证后恢复 GitHub Actions upstream refresh 流程。

## Current State
Status: active
Archive Eligible: no
Close Reason:

## Current Phase
Phase 4

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
- [ ] 等代码进入 GitHub 触发分支后，再次 rerun workflow 验证远端恢复
- **Status:** in_progress

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
- 远端 GitHub Actions 还没有用到这次本地修复；只有当修复进入触发 workflow 的 GitHub 分支后，rerun 或下一次 scheduled run 才会真正恢复。
- 当前主工作区还存在用户/历史未提交改动；本 task 没有替用户创建 commit 或 push，避免误混不相关 changes。

## Notes
- 此 task 来源于 `planning/active/post-upstream-automation-followups/` 的 Phase 2 失败分支。
