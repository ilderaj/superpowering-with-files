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

## Destructive Operations Log
| Command | Target | Checkpoint | Rollback |
|---------|--------|------------|----------|
| 待记录 | `git merge`, `git push`, `git worktree remove` | 实现完成并验证后记录 | 以 merge 前分支与 commit 为回退点 |

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
