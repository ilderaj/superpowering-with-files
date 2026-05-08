# Task Plan: Roadmap v1.2 Cross-IDE Closure

## Current State
Status: closed
Archive Eligible: yes
Close Reason: Roadmap v1.2 closeout completed: related tasks archived, branch merged back into dev, and verification recorded in the roadmap controller task.
Closed At: 2026-05-06T18:45:43

## Goal

执行 `docs/roadmap.md` 的 `v1.2`，收口 cross-IDE projection、hook lifecycle、single-source 和 Cursor 官方加载模型，确保 Codex、GitHub Copilot、Cursor、Claude Code 四个 target 的 entry、skills、hooks 语义一致、验证通过，并把相关 active task 关闭或记录保留理由。

## Scope

- 调查并集成 `cross-ide-projection-audit` 的可落地实现，或记录 no-merge decision。
- 完成 `cross-ide-hook-capability-alignment` 的 dev integration / push。
- 核实 `cross-ide-single-source-consolidation` 的 PR / merge 落点并完成 closeout。
- 将 `cursor-official-load-model-research` 的官方结论转成 adapter policy、文档或 closeout 记录。
- 在隔离 worktree 中完成开发、验证、commit、merge back、push 和 archive。

## Execution Source

- Master execution plan: `docs/superpowers/plans/2026-05-06-roadmap-implementation-plan.md`
- Section: `## 5. v1.2: Cross-IDE Projection And Hook Closure`
- Sync-back status: `v1.2` closeout completed and recorded back into this task plus `roadmap-implementation-plan`.

## Current Phase

Phase 4: Task closeout

## Phases

### Phase 1: Discovery and integration decision
- [x] 核对四个相关 active task 的真实 merge / PR / worktree 状态
- [x] 明确哪些内容已在 `dev`，哪些需要集成，哪些只需 closeout
- [x] 记录 worktree base、branch 和执行边界
- **Status:** complete

### Phase 2: Implementation in isolated worktree
- [x] 在 `v1.2` branch 补齐缺失实现与文档
- [x] 处理 projection、hook、single-source、Cursor policy 收口
- [x] 同步 task-scoped planning records
- **Status:** complete

### Phase 3: Verification and integration
- [x] 运行 focused tests、`npm run verify`、`./scripts/harness sync --dry-run`、`./scripts/harness doctor --check-only`
- [x] 提交版本实现与验证记录
- [x] merge back 到本地 `dev` 并 push `origin/dev`
- **Status:** complete

### Phase 4: Task closeout
- [x] 关闭或归档相关 active task
- [x] 更新 roadmap 总控记录
- [ ] 关闭并归档 `roadmap-v1.2-cross-ide-closure`
- **Status:** in_progress

## Finishing Criteria

- `dev` 和 `origin/dev` 包含 `v1.2` 所需实现与文档收口。
- `cross-ide-projection-audit`、`cross-ide-hook-capability-alignment`、`cross-ide-single-source-consolidation`、`cursor-official-load-model-research` 被关闭归档，或记录无法关闭的明确理由。
- 本任务三件套记录 worktree base、验证、merge/push 和 closeout 结论。
