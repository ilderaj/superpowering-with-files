# Projection Health Analysis

## Current State
Status: waiting_review
Archive Eligible: no
Close Reason:

## Goal
复核 Jared 本机 user-global 与各 IDE 的 harnessTemplate（superpowering-with-files）skill projection 当前状态，判断是否仍存在与 metadata 预期不一致的问题；若需要治理，输出治理取舍与可 review 的执行计划。

## Finishing Criteria
- 识别当前本机 projection 状态是否仍与 metadata 预期不一致。
- 核验主工作区、旧 worktree、`.harness` 安装状态和 `doctor`/`status` 输出。
- 判断是否需要治理，并区分“代码治理”与“操作治理”。
- 如果需要治理，给出按优先级划分的执行计划，供用户 review。

## Phases
- [x] Phase 1: 建立当前 repo、分支、worktree 和任务上下文。
- [x] Phase 2: 定位 projection 健康检查逻辑、metadata、安装目录。
- [x] Phase 3: 检查 git 历史、分支和 worktree 中的相关修正。
- [x] Phase 4: 汇总结论，若需要则形成修正计划。
- [x] Phase 5: 在 2026-04-17 重新复核本机安装状态、`doctor`、`status` 与 `sync --dry-run`，判断是否还需要治理。

## Decisions
- 本任务只做分析和计划，不修改生产代码，除非用户后续要求执行修复。
- 本轮按用户要求使用 superpowers 相关技能进行重新审计，但 durable task memory 仍只写入 `planning/active/projection-health-analysis/`。
- 2026-04-17 重新复核后，当前主工作区的本机 user-global projection 已经与现行 metadata 对齐，`./scripts/harness doctor --check-only` 已通过，之前“未同步导致 unhealthy”的结论不再是当前状态。
- 仍存在操作层面的混淆源：旧 worktree `codex/hooks-projection` 还保留旧的 `.codex/skills` + `link` 语义；如果从该 worktree 执行诊断或 sync，容易再次得出过期结论。
- 当前更适合做“轻治理”而不是“重治理”：优先治理审计/操作流程和文档说明，而不是继续改 projection 代码。
- 不在本轮自动执行 `./scripts/harness sync` 或清理旧 worktree；本轮仅给出判断和治理计划供 review。

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
