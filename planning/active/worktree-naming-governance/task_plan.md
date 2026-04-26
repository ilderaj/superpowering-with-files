# Task Plan: Worktree Naming Governance

## Goal
为 Harness 设计一套 repo-owned、cross-IDE、upstream-safe 的 worktree / branch naming contract，让隔离工作区的名称稳定体现任务语义，并避免因 prompt 首句或 skill 调用模板而重复。

## Current State
Status: closed
Archive Eligible: yes
Close Reason: Merged into local dev after repository verification.

## Current Phase
Phase 5

## Phases

### Phase 1: 现状与约束确认
- [x] 读取当前仓库内 worktree-preflight、using-git-worktrees、planning task-id 解析逻辑
- [x] 确认当前真实实现只负责 base recommendation，不负责 branch / worktree naming
- [x] 确认 upstream skill 不能作为本仓库持久治理的落点
- **Status:** complete

### Phase 2: 方案选型
- [x] 对比“纯 task slug”“纯 policy 约定”“repo-owned helper + projection patch”三类路径
- [x] 评估 planning 作为持久记忆时，对 naming 的可复用价值
- [x] 收敛推荐方案与非目标边界
- **Status:** complete

### Phase 3: Design + Implementation Plan Drafting
- [x] 产出 design doc，明确 naming contract、fallback、cross-IDE integration、upstream boundary
- [x] 产出 implementation plan，列出文件、测试、patch 入口与 rollout 顺序
- [x] 将 companion artifact 路径与摘要回写到 task-scoped planning files
- **Status:** complete

### Phase 4: Review Handoff
- [x] 整理 review 所需结论、假设与 open questions
- [x] 将任务状态切到 `waiting_review`
- **Status:** complete

### Phase 5: Implementation + Verification + Integration
- [x] 先补齐 `worktree-name` helper / CLI / test contracts，并按 TDD 执行 focused slices
- [x] 让 `worktree-preflight` 复用 naming helper，但保持 base recommendation 归属不变
- [x] 给 projected `using-git-worktrees` 增加 Harness-owned child patch，并补齐 projection / sync coverage
- [x] 同步 policy / operator docs / install docs 的 naming contract
- [x] 完成仓库级验证、更新 planning files、合并回本地 `dev`、commit、push
- **Status:** complete

## Key Questions
1. 如何让 worktree / branch 名称不再依赖 agent 对 prompt 的临时摘要？
2. 如何利用 `planning/active/<task-id>/` 的持久语义，使同一任务下的多 worktree 可区分且可追溯？
3. 如何做到不修改 `harness/upstream/**`，同时让 Codex / Copilot / Cursor / Claude Code 都收到同一 naming contract？
4. Codex 这类原生管理 worktree 的宿主，如何把新规则作为补充而不是冲突来源？

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| 推荐使用 canonical run label：`YYYYMMDDHHMM-<task-slug>-NNN` | 同时满足可读性、唯一性和按任务聚合；时间戳解决“第一次名字就撞上”的问题，序号解决同一 task 多 worktree 并发 |
| `task-slug` 取自 planning task id，而不是 prompt 首句 | `planning/active/<task-id>/` 是 Harness 的 authoritative durable task memory，语义比 prompt 更稳定 |
| 分离“canonical label”与“branch namespace” | 允许仓库继续保留 `codex/`、`copilot/`、`fix/` 之类前缀习惯，同时保持核心唯一部分一致 |
| 机械规则落在 Harness-owned CLI / installer / projection patch | `docs/maintenance.md` 已明确要求：mechanical support 放在 `harness/installer`，不要 patch vendored upstream baselines |
| 对 `using-git-worktrees` 使用 projected child patch，而不是改 upstream skill 源 | 保证 `harness/upstream/superpowers/**` 可继续被 update 覆盖，不引入本地治理漂移 |

## Constraints
- 不直接修改 `harness/upstream/superpowers/**` 或 `harness/upstream/planning-with-files/**`。
- 命名规则必须在没有 IDE 特殊能力时仍可工作；IDE 有原生命名或原生 worktree 管理时，新规则只作为补充。
- 设计必须覆盖至少 Codex、Copilot、Cursor、Claude Code 四个 target 的一致表达。
- 设计应优先复用现有 `planning/active/<task-id>/` 与 `worktree-preflight` 工作流，不引入第二套持久状态系统。

## Companion Artifacts
- Design spec: `docs/superpowers/specs/2026-04-26-worktree-naming-governance-design.md`
- Companion plan: `docs/superpowers/plans/2026-04-26-worktree-naming-governance.md`
- Companion summary: repo-owned naming helper + projected `using-git-worktrees` patch + policy/docs/test sync，统一生成基于 planning task id 的 canonical worktree label。
- Sync-back status: implementation complete on 2026-04-26; final integration into `dev` and push are in progress.

## Notes
- 当前仓库的 `worktree-preflight` 只推荐 base，示例命令中的 `<new-branch>` 仍是占位符，没有 naming logic。
- 当前 `using-git-worktrees` skill 只消费 `BRANCH_NAME`，并没有定义生成规则；感知上的“拿 prompt 第一话命名”更像 agent 的临时启发式，不是 Harness code path。
- 当前 skill projection 体系已经支持 child patch；`writing-plans` 就是现成先例，说明可用同一路径给 `using-git-worktrees` 注入 Harness-specific naming contract。
- live repo verification 证明多 active task 仓库需要为 `worktree-preflight` 提供显式 `--task` 通道；该通道现已补齐并写回 docs/policy。
