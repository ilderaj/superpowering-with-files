# Task Plan: Roadmap v1.4 Safety Overlay Governance

## Current State
Status: closed
Archive Eligible: yes
Close Reason: repo-local entry file refresh 漏洞已修复，`main` 上 production workflow 已恢复，PR `#45` 已重新生成并成功合并。

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
- Sync-back status: complete

## Current Phase

Complete

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
- [x] 清理误提交的 in-repo Codex worktree gitlink，恢复主仓库与嵌套 worktree 的边界
- [x] 如果 scheduled run 已观察完成，则关闭 `post-upstream-automation-followups`
- [x] 审计 upstream refresh PR 是否可合并，并明确 merge blocker 或 merge 结论
- [x] 修复 upstream refresh 不应覆盖 repo-local entry files（`AGENTS.md` / `CLAUDE.md` / `.github/copilot-instructions.md`）的 allowlist 缺陷，并让下一轮 refresh 产物不再包含这些文件
- [x] 更新 roadmap 总控记录
- [x] 关闭并归档 `roadmap-v1.4-safety-overlay-governance`
- **Status:** complete

## Finishing Criteria

- `dev` 和 `origin/dev` 包含 `v1.4` 所需的 overlay / cloud / safety governance 变更，或明确记录唯一剩余的时间门槛。
- `origin-cloud-harness-deployment-plan` 与 `post-upstream-automation-followups` 的可执行部分被关闭归档，且 upstream refresh PR 不再携带 repo-local policy entry 覆盖风险。
- 本任务三件套记录 worktree base、验证、merge/push、自动续跑和 closeout 结论。

## Final Outcome

- `v1.4` overlay / cloud / safety governance 已在 `dev` 完成并验证。
- upstream refresh production path 已在 `main` 恢复。
- PR `#45 chore: refresh upstream baselines` 已在移除 repo-local entry 覆盖风险后成功合并。
