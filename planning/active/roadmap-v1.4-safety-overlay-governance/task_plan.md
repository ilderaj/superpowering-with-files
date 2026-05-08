# Task Plan: Roadmap v1.4 Safety Overlay Governance

## Current State
Status: active
Archive Eligible: no
Close Reason:

## Goal

执行 `docs/roadmap.md` 的 `v1.4`，把 safety / cloud-safe 从“改写 baseline”收敛成 workspace 或 cloud repo-local overlay，并完成 automation follow-through 中除时间门槛之外的所有可执行工作。

## Scope

- 复核并接续 `post-upstream-automation-followups`，但承认首次 scheduled run 观察存在 2026-05-08 的硬时间门槛。
- 评估并尽可能落地 `origin-cloud-harness-deployment-plan` 的 repo-local cloud profile 能力。
- 实现 baseline + overlay 的最小可行 state / sync / doctor / adoption-status 分层。
- 收敛 safety pre-tool-use false positives，避免 read/search/verify 常规流程被误挡。
- 在隔离 worktree 中完成开发、验证、merge back、push 和 closeout；若存在不可消除的时间门槛，则为剩余观察动作建立自动续跑。

## Execution Source

- Master execution plan: `docs/superpowers/plans/2026-05-06-roadmap-implementation-plan.md`
- Section: `## 7. v1.4: Safety Overlay, Cloud Harness, And Automation Follow-Through`
- Sync-back status: active, implementation and full verification complete; merge/push pending.

## Current Phase

Phase 4: Time-gated follow-through and closeout

## Phases

### Phase 1: Discovery and boundary check
- [x] 复核 `post-upstream-automation-followups` 的剩余阻塞是否只有 scheduled run 时间门槛
- [x] 复核 `origin-cloud-harness-deployment-plan` 的 review 结论与现有代码落点
- [x] 提取当前 state / safety / cloud-bootstrap / pre-tool-use runtime 的真实实现边界
- [x] 记录 worktree base、branch 和执行边界
- **Status:** complete

### Phase 2: Implementation in isolated worktree
- [x] 落地 baseline + overlay 分层与 cloud repo-local profile
- [x] 落地 safety hook false-positive reduction
- [x] 更新相关文档与 planning records
- **Status:** complete

### Phase 3: Verification and integration
- [x] 运行 focused tests、`npm run verify`、`./scripts/harness verify --output=stdout`、`./scripts/harness doctor --check-only`
- [x] 提交版本实现与验证记录
- [x] merge back 到本地 `dev` 并 push `origin/dev`
- **Status:** complete

### Phase 4: Time-gated follow-through and closeout
- [x] 如果 scheduled run 观察尚未到窗口，则建立自动续跑并明确剩余 gate
- [ ] 如果 scheduled run 已观察完成，则关闭 `post-upstream-automation-followups`
- [x] 更新 roadmap 总控记录
- [ ] 关闭并归档 `roadmap-v1.4-safety-overlay-governance`
- **Status:** in_progress

## Finishing Criteria

- `dev` 和 `origin/dev` 包含 `v1.4` 所需的 overlay / cloud / safety governance 变更，或明确记录唯一剩余的时间门槛。
- `origin-cloud-harness-deployment-plan` 与 `post-upstream-automation-followups` 的可执行部分被关闭归档，或只保留 scheduled run 观察这一项明确外部 gate。
- 本任务三件套记录 worktree base、验证、merge/push、自动续跑和 closeout 结论。
