# Roadmap 全版本执行计划发现

## Durable Findings

- 用户明确要求先输出 plan 后 review，因此本轮不执行任何 roadmap 实现、merge、commit 或 push。
- 本轮任务属于 tracked/deep planning：覆盖多个版本、多任务依赖、Git 操作链、records 留存和后续执行边界。
- 当前工作区已有上一轮 roadmap audit/cleanup 改动，以及 `global-rule-context-load-analysis`、`origin-cloud-harness-deployment-plan` 的外部/并发修改。本轮不得覆盖这些内容。

## Source Context

- 当前执行 base：本地当前分支为 `dev`，`origin` 指向 `https://github.com/ilderaj/superpowering-with-files.git`。
- 当前 `package.json` 脚本：
  - `npm test`
  - `npm run test:core`
  - `npm run verify`
- `docs/roadmap.md` 当前版本范围为 v1.1 到 v1.6。
- 当前 active task 队列共 11 个目录，包含 `project-roadmap-audit` 和本轮 `roadmap-implementation-plan` 之外的 10 个剩余 roadmap 任务。
- 当前本地还存在多个旧 worktree；后续执行每个版本前必须使用 `./scripts/harness worktree-preflight --task <task-id>` 明确 base，而不是复用旧 worktree 推断。

## Execution Decisions

- 每个版本使用独立 task id：`roadmap-v1.x-<theme>`。
- 每个版本从最新 `dev` 派生独立 `codex/roadmap-v1.x-<theme>` 分支和 worktree。
- 每个版本至少保留两个 commit：implementation commit 和 verification/record commit；再用 merge commit 合回 `dev`。
- 每个版本完成后先 `npm run verify`、`./scripts/harness verify`、`./scripts/harness doctor --check-only`、`./scripts/harness sync --check`，再 push `origin/dev`。
- `v1.4` 不能在 2026-05-08 20:05 Asia/Shanghai 的 upstream scheduled run 观察前完成最终 closeout。
- `v1.6` 中的 `adopt-global` 只能在 risk gate 通过且执行授权明确时运行。
- PR #22 / PR #29 的处理必须在执行时重新查询 GitHub 状态；不能在计划中假设已经可合并。
- 执行阶段发现的计划修正：Gate 0 baseline commit 不能只 stage `planning/archive` 新目录，还必须显式 stage 被归档 active task 的删除；否则 archive move 不会完整入库。
- 执行阶段决定：在 v1.4 时间 gate 到来前，不阻塞 v1.5/v1.6 的代码/文档准备工作，但所有需要依赖 v1.4 结论的 closeout 仍以后置 gate 为准。
