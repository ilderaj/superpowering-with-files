# Findings & Decisions

## Requirements
- 按 companion plan 完成 close/archive lifecycle guard、archive auto-migration、文档同步与 authoritative planning sync-back。
- 完成实现后运行 focused lifecycle tests 与仓库 `npm run verify`。
- 在验证之后保守更新 README。
- 最终需要把 worktree 分支合并回本地 `dev`，然后提交、推送、清理 worktree。

## Research Findings
- companion plan Task 1 要求新增 fixture helper：`createPlanningLifecycleFixture()`、`writeActiveTask()`、`writeCompanion()`、`runPythonScript()`、`runShellScript()`。
- companion plan Task 2 要求 `companion_sync.py` 至少提供 `read_text`、`parse_field`、`inspect_companion_sync()`、`replace_field()`、`sync_close_state()`。
- 当前 `close-task.py` 只会更新 `task_plan.md` 的 Current State，不检查 companion metadata，也不会同步 active task / companion 的 `Sync-back status`。
- 目标测试覆盖 3 个 close-flow 场景：无 companion 可 close；metadata 不完整会被阻止；成功 close 后同步 companion lifecycle 与 sync-back status。
- `Companion plan` 与 `Active task path` 字段在 markdown 中常用反引号包裹；共享解析器需要先去掉包裹反引号再拼接路径。
- archive-flow 已补齐：`task-status.py` 增加 companion sync gate，`planning_paths.py` 会在 archive 时迁移 companion artifact 并重写 archived task / companion 引用。
- `archive-task.sh` 现在会同时要求 safe-to-archive 与 companion-synced，防止 unsynced companion metadata 被归档。
- focused lifecycle tests 与全仓 `npm run verify` 已通过。
- 合并到主 `dev` worktree 后，直接在该 worktree 跑 `npm run verify` 暴露了两个环境相关问题：一个是已有未跟踪文件 `docs/superpowers/plans/2026-04-26-backup-conflict-governance-plan.md` 触发 `no-personal-paths`，另一个是 `summary-command` 在那次聚合执行中出现一次性模块解析失败；在主 worktree 单独复现实验时后者未复现。
- 为了验证合并结果本身，使用 detached 临时 worktree 在 `dev` merge commit 上运行 `node --test tests/core/companion-plan-lifecycle.test.mjs && npm run verify`，结果通过，说明失败来自主 worktree 环境污染而非本次改动。

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| 继续沿用 Python 脚本实现 companion sync 解析与改写 | 现有 planning-with-files 生命周期脚本已经是 Python，最小化跨语言复杂度 |
| 生命周期能力拆成 shared helper `companion_sync.py` | 便于 `close-task.py`、`task-status.py`、`planning_paths.py` 复用并保持一致 |
| fixture 直接复制仓库 `harness` 与 `docs` 到临时测试目录 | close-flow 脚本依赖真实相对路径，保留最接近仓库的执行方式 |
| close-task / archive-task 都通过 shared companion helpers 执行生命周期约束 | 避免 close 与 archive 之间出现分叉规则 |
| README 仅补一条 companion-aware lifecycle 说明 | 满足“conservatively update README”，避免把实现细节过度堆进入口文档 |

## Issues Encountered
| Issue | Resolution |
|-------|------------|
| 测试夹具若沿用现有 helper 会写入 `/tmp`，违反当前环境约束 | 新 helper 改为在仓库内创建 `.test-fixtures/` 并在测试完成后清理 |
| 子代理一度把 planning scope 收窄到 close-flow | 已由主代理恢复为完整任务范围，并继续推进 archive / docs / integration 阶段 |
| 主 `dev` worktree 有与本任务无关的未跟踪文件，导致聚合 verify 失败 | 保留用户现有未跟踪内容不动，改在干净 detached worktree 上验证 merge 结果 |

## Destructive Operations Log
| Command | Target | Checkpoint | Rollback |
|---------|--------|------------|----------|
| `git worktree remove /Users/jared/SuperpoweringWithFiles.worktrees/copilot-superpowers-task-execution-update && git branch -d copilot/superpowers-task-execution-update` | feature worktree path 与本地 feature branch | `~/.agent-config/checkpoints/SuperpoweringWithFiles/2026-04-26T07-54-50Z` | merge commit `52c61a4` 已保留在 `dev`；如需回看删除前状态，使用 checkpoint 路径 |
| `git -C /Users/jared/SuperpoweringWithFiles worktree remove /Users/jared/SuperpoweringWithFiles.worktrees/copilot-superpowers-execution-merge-commit` | 当前收尾 worktree 路径 | `/Users/jared/.agent-config/checkpoints/SuperpoweringWithFiles/2026-04-26T07-54-50Z` | 保留本地分支 `copilot/superpowers-execution-merge-commit @ 9d3f55a`；如需恢复，重新 `git worktree add` 到新路径，或直接从 `dev @ e4229fa` 建干净 checkout |

## Resources
- `docs/superpowers/plans/2026-04-26-companion-plan-sync-constraints.md`
- `harness/upstream/planning-with-files/scripts/close-task.py`
- `harness/upstream/planning-with-files/scripts/companion_sync.py`
- `harness/upstream/planning-with-files/scripts/task-status.py`
- `harness/upstream/planning-with-files/scripts/planning_paths.py`
- `harness/upstream/planning-with-files/scripts/archive-task.sh`
- `harness/upstream/planning-with-files/SKILL.md`
- `docs/maintenance.md`
- `README.md`

## Visual/Browser Findings
- 未使用浏览器或图片输入；当前信息来自仓库文件与 companion plan。
