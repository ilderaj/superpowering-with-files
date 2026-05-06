# Task Plan: Verify Worktree Naming Regressions

## Goal
修复当前 `npm run verify` 的 7 个失败，重点解决 `tests/installer/worktree-name.test.mjs` 与 `tests/installer/worktree-preflight.test.mjs` 的命名回归，并把 `sync-skills` 的 `~/.harness/backups` 写权限问题与真实逻辑问题分离。

## Current State
Status: closed
Archive Eligible: no
Close Reason: 原始 7 个 verify 失败已修复，并在主工作区复跑 `npm run verify` 得到 `319 pass / 0 fail`；临时 repair branch 删除因沙箱权限限制未完成，不影响本 task 交付。

## Current Phase
Complete

## Phases

### Phase 1: 失败面重现与分类
- [x] 在隔离 worktree 中重现当前 7 个失败
- [x] 区分 sandbox/HOME 噪音与真实逻辑回归
- [x] 固化最小 reproduction matrix
- **Status:** complete

### Phase 2: worktree naming / preflight 语义复核
- [x] 对照 `worktree-naming-governance` 的已关闭设计，核对当前 `task id -> slug -> canonical label` 解析链
- [x] 判断是实现漂移、测试期望过期，还是 active-plan 解析规则变化
- [x] 收敛修复策略
- **Status:** complete

### Phase 3: TDD 修复
- [x] 先锁 focused failing tests
- [x] 修复 `worktree-name` 与 `worktree-preflight` 断言对应的实现或测试
- [x] 处理 `sync-skills` backup archive 写权限问题，使测试在受控 HOME 下稳定运行
- **Status:** complete

### Phase 4: 验证与收口
- [x] 跑 focused tests
- [x] 跑全量 `npm run verify`
- [x] 更新 planning 文件并给出 residual risk
- **Status:** complete

## Key Questions
1. `worktree-name` 当前为什么返回 UUID 风格 task id，而不是测试期望中的 slug？
2. 这是 planner active-plan 解析规则变化，还是 `worktree-name` helper 的回退逻辑被后续改坏了？
3. `sync-skills` 的 `EPERM` 是否应通过隔离 `HOME` / backup root 消除，而不是在生产逻辑里特殊分支处理？

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| 单开 repair task | 用户明确要求 verify failures 独立承接 |
| 优先处理 `worktree-name` / `worktree-preflight` | 6/7 失败集中在这里，且直接影响后续 worktree orchestration |
| `sync-skills` 的 `EPERM` 先按测试环境问题排查 | 当前报错点是 `~/.harness/backups` 写权限，不应先假设产品逻辑错误 |
| 默认在隔离 worktree 中执行修复 | 避免主工作区多 active task、HOME 写权限和现有 worktree 状态继续污染结果 |
| 修复收口以主工作区 `npm run verify` 为准 | 只有主工作区全绿，才能确认回归真正解除 |

## Planned Implementation Shape
- 建议 worktree / branch：通过 `./scripts/harness worktree-preflight --task verify-worktree-naming-regressions --safety` 与 `./scripts/harness worktree-name --task verify-worktree-naming-regressions` 生成。
- 当前执行 worktree：`/Users/jared/.config/superpowers/worktrees/SuperpoweringWithFiles/202605060339-verify-worktree-naming-regressions-001`（已删除）
- 当前执行 branch：`codex/202605060339-verify-worktree-naming-regressions-001`（本地残留，未再挂接 worktree）
- Worktree base: `dev @ 83dee6245ce7f30109fddb985585e9e112f240a9`
- 实际修改文件：
  - `harness/installer/lib/worktree-name.mjs`
  - `tests/installer/worktree-name.test.mjs`
  - `tests/installer/worktree-preflight.test.mjs`
  - `tests/adapters/sync-skills.test.mjs`

## Non-Goals
- 不在本 task 内重新设计 upstream refresh workflow。
- 不在本 task 内清理 stale rehearsal worktree。
- 不在没有证据的前提下重开 `worktree-naming-governance` 的设计结论。

## Residual Risk
- 本地临时 branch `codex/202605060339-verify-worktree-naming-regressions-001` 仍留在 `.git/refs/heads/`，因为当前沙箱无法创建 ref lock 文件完成删除；它已不再挂接任何 worktree，也不影响主工作区验证结果。
