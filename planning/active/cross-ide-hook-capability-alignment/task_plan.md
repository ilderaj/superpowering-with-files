# Task Plan: Cross-IDE Hook Capability Alignment

## Goal
基于官方 upstream 文档，重新核实 Codex、GitHub Copilot/VS Code Chat、Cursor、Claude Code 的 hooks 能力与配置入口，明确 Harness 当前实现与官方能力之间的差异，并产出一份可审阅的整改与优化 implementation plan，服务于 session summary / planning-with-files hooks 在多 IDE 中的一致落地。

## Current State
Status: active
Archive Eligible: no
Close Reason:

## Current Phase
Phase 5: Implementation execution

## Phases

### Phase 1: Official Docs Refresh
- [x] 复核 VS Code preview hooks 官方文档
- [x] 复核 Claude Code hooks 官方文档
- [x] 复核 Codex hooks 官方文档
- [x] 复核 Cursor hooks 官方文档
- [x] 写入仅基于官方来源的事实与证据缺口
- **Status:** complete

### Phase 2: Gap Analysis
- [x] 对照 Harness 当前 adapter/projection 与官方能力
- [x] 标出需要修正文档、实现、验证、状态输出的位置
- [x] 区分“官方支持”“兼容读取”“Harness 自定义约定”
- **Status:** complete

### Phase 3: Implementation Plan
- [x] 形成详细整改 implementation plan
- [x] 明确文件边界、验证策略、回归风险与执行顺序
- [x] 将详细计划写入 companion plan
- **Status:** complete

### Phase 4: Review Handoff
- [x] 将 planning 状态同步回 task-scoped files
- [x] 输出供用户 review 的计划摘要与关键判断
- **Status:** complete

### Phase 5: Implementation Execution
- [x] Task 1: Reclassify hook evidence and health rules
- [x] Task 2: Align Copilot planning hooks with official VS Code lifecycle
- [x] Task 3: Add Copilot support for the superpowers SessionStart hook
- [x] Task 4: Refresh cross-IDE documentation to match official facts
- [x] Task 5: Final verification and task sync-back
- **Status:** complete

### Phase 6: Dev Integration
- [ ] Merge execution branch back into local `dev`
- [ ] Push `origin dev`
- **Status:** pending

## Key Questions
1. VS Code Chat preview hooks 是否足以被视为 Harness 可用的 Copilot hooks runtime，而不是仅仅“可读取 Copilot CLI/Claude 配置”的兼容层？
2. VS Code 读取 Claude hooks 配置时，能否直接承载当前 Harness 的 Claude-style hook 投影，还是仍需要独立的 Copilot/VS Code adapter 事件映射？
3. 哪些现有文档表述已经过时，尤其是 `docs/install/copilot.md`、`docs/install/claude-code.md`、`docs/install/cursor.md`、`docs/install/codex.md` 与 `docs/install/platform-support.md`？
4. 哪些结论可直接落地为代码整改，哪些仍应保守标记为 evidence gap？

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| 新建独立 task，而不是复用已关闭的 `session-summary-mechanism` | 本次交付物是 cross-IDE 能力对齐与整改计划，不是前一任务的实现延续 |
| planning 先行，代码与文档变更后置 | 用户明确要求先出 implementation plan review |
| 仅把官方可核实事实写入 findings | 避免把 Harness 当前实现误记成 upstream 能力 |
| 保留 Copilot 的原生 adapter，而不是让 VS Code 直接以 Claude hooks 作为主契约 | VS Code 虽能兼容读取 Claude hooks，但会忽略 matcher，且 Claude/VS Code 的 tool names 与 input schema 不同，直接共用会引入重复执行与语义漂移风险 |
| 将“Claude hooks 兼容读取”视为迁移/兼容能力，不视为 Harness 的首选投影路径 | Harness 需要稳定、可验证、无重复执行的主路径；原生 `.github/hooks/*.json` / `~/.copilot/hooks` 更符合这一点 |
| 本轮同时把 Copilot `superpowers` session-start hook 纳入整改范围 | VS Code preview hooks 已具备官方 runtime，文档里继续声明 Copilot 不支持 superpowers hooks 已不准确 |

## Notes
- Related prior task: `planning/active/session-summary-mechanism/`
- Related audit baseline: `planning/active/cross-ide-projection-audit/`
- Companion plan path: `docs/superpowers/plans/2026-04-26-cross-ide-hook-capability-alignment.md`
- Execution mode: use subagents task-by-task with review gates, then integrate into local `dev`
