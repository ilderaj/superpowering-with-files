# Findings: Roadmap v1.6 Release Readiness

## Scope Boundaries

- `v1.6` 以 foundation closeout、release readiness、adoption stabilization 为主，不引入新的 feature lane。
- `roadmap-v1.4-safety-overlay-governance` 仍保留一个外部时间 gate；这不会阻塞 `v1.6` 的 release/adoption closeout。
- `planning-timestamp-render-fix` 是独立 active task，本轮不覆盖。

## Known Inputs

- Roadmap source: `docs/roadmap.md`
- Master execution companion: `docs/superpowers/plans/2026-05-06-roadmap-implementation-plan.md`
- Related tasks:
  - `planning/active/harness-template-foundation/`
  - `planning/active/post-upstream-automation-followups/`
  - `planning/active/roadmap-v1.4-safety-overlay-governance/`

## Durable Findings

- 当前 GitHub remote 已是 `https://github.com/ilderaj/superpowering-with-files.git`，说明仓库 rename 已完成，release 文档只需要保持这一名称为现行事实源。
- `./scripts/harness adoption-status` 在 `adopt-global` 后已回到 `in_sync`；之前的 `needs_apply` 只是 receipt 指向旧 `repoHead c497a612...`，不是安装损坏。
- `v1.4` 的 overlay 模型和 false-positive 修复已经实装并通过验证，但更广泛的默认 safety rollout 仍缺少 adoption 重新对齐后的长期证据，因此 `keep default-off` 仍是当前最稳的 posture。
- `harness-template-foundation` 已完成设计、实现、文档、分支与 origin 发布准备；剩余工作本质上是 release/adoption 状态记录和 lifecycle closeout。
- 本轮 `sync --dry-run` 只有 15 个 projection metadata update、没有 create/stale，说明 adoption 稳定化只需刷新 receipt 与 materialized metadata，不涉及新的 surface 扩张。
- `harness-template-foundation` 已归档到 `planning/archive/20260506-222324-harness-template-foundation/`，说明 foundation umbrella 已完成从实现任务到历史记录的收口。
