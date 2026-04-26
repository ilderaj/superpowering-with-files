# 任务计划：companion plan 同步约束执行

## Goal
按照 `docs/superpowers/plans/2026-04-26-companion-plan-sync-constraints.md` 完成 companion lifecycle guard 与 archive auto-migration，实现、验证、保守更新 README，并将结果合并回本地 `dev`、提交、推送、清理 worktree。

## Current State
Status: closed
Archive Eligible: yes
Close Reason: Task completed, verified, merged into local dev, and published to origin/dev.
Closed At: 2026-04-26T16:04:50

## Companion Plan
- Companion plan: `docs/superpowers/plans/2026-04-26-companion-plan-sync-constraints.md`
- Companion summary: close/archive 生命周期硬门禁已实现，archive 会自动迁移 companion artifact；已完成 dev 集成与 feature worktree cleanup。
- Sync-back status: closed at 2026-04-26T16:04:50: Task completed, verified, merged into local dev, and published to origin/dev.

## Current Phase
Phase 5

## Phases
### Phase 1: 建立任务上下文与基线
- [x] 审阅 companion plan 与仓库约束
- [x] 确认当前隔离 worktree 与分支状态
- [x] 记录 worktree 基线与执行约束
- **Status:** complete

### Phase 2: 实现 close-task companion sync gate
- [x] 新增生命周期测试夹具与 close-task 回归测试
- [x] 实现 shared companion sync helper 与 close-task 集成
- [x] 让 close-task 成功时同步 companion metadata
- **Status:** complete

### Phase 3: 实现 archive gate 与 companion 迁移
- [x] 增加 archive blocking / relocation 测试
- [x] 扩展 task-status、planning_paths、archive-task、companion_sync
- [x] 验证 archive 生命周期门禁与迁移行为
- **Status:** complete

### Phase 4: 文档与仓库验证
- [x] 运行 `node --test tests/core/companion-plan-lifecycle.test.mjs && npm run verify`
- [x] 更新 `harness/upstream/planning-with-files/SKILL.md` 与 `docs/maintenance.md`
- [x] 保守更新 `README.md`
- **Status:** complete

### Phase 5: 集成、回合并与清理
- [x] 同步 authoritative planning closeout
- [x] 合并回本地 `dev`
- [x] 提交、推送、移除 worktree
- **Status:** complete

## Risk Assessment
| 风险 | 触发条件 | 影响范围 | 缓解 / 已落盘的回退方案 |
|---|---|---|---|
| lifecycle gate 改坏现有 close/archive 流程 | metadata 解析或路径改写不兼容旧格式 | planning-with-files 脚本与测试 | 先补回归测试，再分阶段实现；通过 focused test + `npm run verify` 验证 |
| close / archive 同步覆盖错误字段 | metadata replace 逻辑匹配范围过宽 | active task / companion plan markdown | 用最小替换函数并在 close / archive 测试中断言最终文本 |
| merge / cleanup 操作误伤未提交内容 | 分支或 worktree 状态判断错误 | 本地开发分支 | 完成实现后先核对 git 状态，再按记录的 worktree 分支回合并并清理 |
| `git worktree remove /Users/jared/SuperpoweringWithFiles.worktrees/copilot-superpowers-task-execution-update && git branch -d copilot/superpowers-task-execution-update` | cleanup 前 worktree 或分支仍含唯一状态 | 当前 feature worktree、本地分支引用 | checkpoint: `~/.agent-config/checkpoints/SuperpoweringWithFiles/2026-04-26T07-54-50Z`；如失败，从 `dev` 保留的 merge commit `52c61a4` 恢复，必要时用 checkpoint 回看删除前状态 |
| `git -C /Users/jared/SuperpoweringWithFiles worktree remove /Users/jared/SuperpoweringWithFiles.worktrees/copilot-superpowers-execution-merge-commit` | 删除当前收尾 worktree 前仍需保留其独立 checkout 与未推送 closeout 分支引用 | 仅影响当前隔离工作区路径 `/Users/jared/SuperpoweringWithFiles.worktrees/copilot-superpowers-execution-merge-commit`；不触碰主 checkout `/Users/jared/SuperpoweringWithFiles` 或 `origin/dev` | checkpoint: `/Users/jared/.agent-config/checkpoints/SuperpoweringWithFiles/2026-04-26T07-54-50Z`；如需回滚，可用本地分支 `copilot/superpowers-execution-merge-commit @ 9d3f55a` 重新创建 worktree，或从已推送的 `dev @ e4229fa` 补建 clean checkout |

## Key Questions
1. 现有 planning-with-files 脚本与测试模式如何最小侵入扩展 close/archive companion lifecycle？
2. archive 时如何改写 archived task 与 companion 的双向引用，才能在归档后保持自洽？

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| authoritative task memory 使用 `planning/active/companion-plan-sync-constraints/` | 与 companion plan 标头和仓库策略一致 |
| 先建立测试基线，再分 close / archive 两段实现 | 降低脚本改动带来的回归风险，便于逐段验证 |
| fixture 目录放在仓库内的 `.test-fixtures/` 并在测试后清理 | 避免写入 `/tmp`，同时保留隔离的脚本执行环境 |
| `task-status.py` 直接暴露 companion sync 结构，并以 `--require-companion-synced` 作为 archive gate 输入 | 让 archive shell 包装器复用同一套生命周期判定，避免重复逻辑 |
| archive 时把 companion artifact 迁移为 archive 目录下的 `companion_plan.md` | 让 archived task 和 companion 成为自包含快照，不再依赖 `docs/superpowers/plans/` 下的活动路径 |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
|       | 1       |            |

## Notes
- 每完成一个实现阶段后同步更新 task_plan.md、findings.md、progress.md。
- 合并、推送、worktree 清理前再次核对 git 状态与本地 `dev` 分支。
