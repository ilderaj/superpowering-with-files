# Task Plan: Roadmap v1.6 Release Readiness

## Current State
Status: closed
Archive Eligible: yes
Close Reason: Roadmap v1.6 release readiness completed; dev adoption is in_sync and foundation records are archived.
Closed At: 2026-05-06T22:29:29

## Goal

执行 `docs/roadmap.md` 的 `v1.6`，关闭 foundation umbrella，确认仓库命名、release 文档、`dev` / `origin/dev` 对齐，以及 adoption 状态回到可重复的稳定基线。

## Scope

- 记录当前 release/adoption 事实：branch、origin URL、`dev` SHA、verify、doctor、adoption-status。
- 在 risk gate 通过后执行受控的 `adopt-global`，把 user-global adoption receipt 对齐到当前 `dev`。
- 收敛 `keep default-off` 的 safety posture 结论，并把它记录进 roadmap / planning。
- 关闭并归档 `harness-template-foundation`。
- 完成 `v1.6` 自身的 merge/push/closeout。

## Execution Source

- Master execution plan: `docs/superpowers/plans/2026-05-06-roadmap-implementation-plan.md`
- Section: `## 9. v1.6: Release Readiness And Adoption Stabilization`
- Sync-back status: active, adoption stabilized and closeout in progress.

## Current Phase

Phase 3: Foundation closeout

## Phases

### Phase 1: Release and adoption baseline capture
- [x] 读取 `harness-template-foundation` 的当前收尾状态
- [x] 记录当前 `origin`、`dev` SHA、verify/doctor/adoption-status 基线
- [x] 记录 `v1.6` 的 closeout criteria 与默认 safety posture 判断边界
- **Status:** complete

### Phase 2: Adoption stabilization and release alignment
- [x] 在 risk gate 通过后执行 `adopt-global`
- [x] 确认 adoption-status 回到稳定状态
- [x] 更新 release/readiness 相关文档或记录
- **Status:** complete

### Phase 3: Foundation closeout
- [x] 关闭并归档 `harness-template-foundation`
- [x] 更新 roadmap 总控记录
- [x] 提交 `v1.6` 实现与验证记录
- [x] merge back 到本地 `dev` 并 push `origin/dev`
- **Status:** complete

### Phase 4: Roadmap completion
- [ ] 关闭并归档 `roadmap-v1.6-release-readiness`
- [x] 将 `roadmap-implementation-plan` 更新到“只剩外部时间 gate”或“全部完成”
- **Status:** in_progress

## Finishing Criteria

- `harness-template-foundation` 已关闭归档。
- `./scripts/harness adoption-status` 返回稳定状态，且 receipt 对齐当前 `dev`。
- `docs/roadmap.md` 的 `v1.6` 有明确 closeout 和默认 safety posture 结论。
- `dev` 和 `origin/dev` 完成 `v1.6` closeout。
