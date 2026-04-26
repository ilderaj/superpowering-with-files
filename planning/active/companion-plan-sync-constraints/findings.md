# Findings: Companion Plan Sync Constraints

## Verified Findings

- 当前 `plan-locations.mjs` 只负责扫描和报告 companion-plan 引用关系，主要消费点是 `readHarnessHealth()`。
- 当前 `harness/upstream/planning-with-files/scripts/close-task.sh` 与 `archive-task.sh` 只做 lifecycle / archive 路径处理，不会同步或强校验 companion plan。
- 用户已选定约束强度 `B`：`close-task` 与 `archive-task` 都应在 companion plan 未同步时 hard-block。
- `close-task.py` 当前只会重写 `task_plan.md` 的 `## Current State`，把任务直接标成 `Status: closed`、`Archive Eligible: yes`，没有 companion-plan gate。
- `task-status.py --require-safe-to-archive` 只基于 active task 的 lifecycle 安全性返回 non-zero，不会读取或验证 `docs/superpowers/plans/**` 的 companion artifact。
- `planning_paths.py archive-active` 只在 `safe_to_archive` 为真时移动 `planning/active/<task-id>/` 目录，本身不会迁移或重写 companion artifact 路径。
- 用户已选择 archive 行为 `A`：归档阶段不只是检测，还要自动把 companion artifact 迁入对应 archive task 目录，并同步更新归档 planning 引用。

## Open Threads

- `未同步` 的判定口径仍待收敛：是只校验结构性元数据，还是还要比较 active task 与 companion plan 的阶段/状态摘要是否一致。
- 若用户继续坚持 `B`，最合理的第一版 gate 很可能应是“结构元数据 + lifecycle 一致性”，而 archive 目录迁移可作为 close/archive 流程中的附带动作，而不是依赖人工补写。

## Durable Design Decisions

- v1 `未同步` 定义收敛为：结构元数据缺失或 lifecycle metadata 不一致，而不比较 prose 内容。
- `close-task` 负责 hard-block + close-time metadata sync。
- `archive-task` 负责 hard-block + archive-time companion migration + reference rewrite。
- `doctor` / `adoption-status` 继续保留 read-only warning 语义，不承担 lifecycle 写入职责。

## Implementation Plan Reference

- Companion plan: `docs/superpowers/plans/2026-04-26-companion-plan-sync-constraints.md`
- Companion summary: phased implementation for close/archive lifecycle guards, archive-time companion relocation, focused tests, and planning closeout.
- Sync-back status: drafted on `2026-04-26`; waiting for execution mode selection.