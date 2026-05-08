# Task Plan: Session 收尾结构化总结机制

## Goal
让一轮 session 结束时输出一个**结构化、精炼、可复现**的总结，主要数据源是 harness 已有的 planning files（`task_plan.md` / `progress.md` / `findings.md`）与 hook lifecycle 信号，而不是模型自由发挥。

## Current State
Status: closed
Archive Eligible: yes
Close Reason: Session summary hook + CLI delivered, verified, merged into local dev, and ready for push.

## Current Phase
Closed

## Phases

### Phase 1: Research & Design (this turn)
- [x] Map planning hot-context renderer and Stop hook integration
- [x] Confirm authoritative inputs available without new durable state
- [x] Choose duration capture strategy compatible with existing hook mode
- [x] Define output contract bounded by `hookPayload` budget
- **Status:** complete

### Phase 2: MVP Renderer
- [x] Implement `session-summary.mjs` pure function reusing planning-hot-context parsing helpers
- [x] Implement `render-session-summary.mjs` thin CLI shim
- [x] Add `installer/lib/session-summary.mjs` re-export shim
- [x] Unit tests for renderer (phases → checklist, duration math, fallbacks)
- **Status:** complete

### Phase 3: Hook & CLI Wiring
- [x] Extend `task-scoped-hook.sh`: `session-start` writes `.session-start` sidecar; `stop|agent-stop|session-end` emits structured summary
- [x] Add `harness summary` CLI command
- [x] Extend `tests/hooks/task-scoped-hook.test.mjs` with stop-event case
- [x] Verify hook payload stays under `hookPayload.warn` budget
- **Status:** complete

### Phase 4: Verification & Sync-back
- [x] `npm test` green
- [x] Manual fixture run for each adapter (codex/cursor/copilot/claude-code) JSON shape
- [x] Update `findings.md` and `progress.md` with concrete results
- [x] Decide lifecycle close
- **Status:** complete

## Key Questions
1. 是否新增持久状态？— 不新增。仅 `.session-start` 临时 sidecar（per-task，session 结束清理）。
2. duration 采集？— SessionStart hook 写 epoch sidecar，Stop hook 读取并计算 delta。无 sidecar 时 fallback 到 `progress.md` 中 `Started:` 时间戳，再 fallback 到 "duration unavailable"。
3. checklist 来源？— `task_plan.md` 的 `### Phase N` + `**Status:** ...` 已被 `task_lifecycle.py` 解析过，直接复用同样的正则；当前 phase 内的 `- [ ]` 子任务可作为细粒度补充。
4. summary 应放在哪一层？— 复用现有 hook 链 + 新增可独立调用的 CLI（便于测试与手动触发）。
5. 怎么保证精炼？— 硬编码每节最大行数（结论 1 行 / checklist ≤ phase 数 / findings ≤3 / progress ≤3 / next ≤2），并以 `hookPayload.warn`（12000 chars/160 lines）做上限。

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| 复用 `planning-hot-context.mjs` 的解析助手 | 避免在两处实现 markdown 解析；保证 hook 输出风格一致 |
| 通过 `.session-start` sidecar 采集 duration | 真实数据，不让模型推测；落在 task 目录内不引入新状态体系 |
| 集成在 Stop / agent-stop / session-end hook | harness 已有 lifecycle 钩子；最自然的"收尾"语义 |
| 同时开放 `harness summary` CLI | 可独立测试；用户可手动复现；不绑死 hook 语义差异 |
| 不新增 durable summary file | 现有 `progress.md` 已是会话级 log；新增 `summary.md` 会破坏单一来源 |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| Root `npm test` initially failed because `ws` was not installed for the upstream brainstorm-server tests | 1 | Installed the upstream test dependency with `npm ci` in `harness/upstream/superpowers/tests/brainstorm-server`, then re-ran `npm test` successfully |

## Notes
- Companion plan: `planning/archive/20260506-155323-session-summary-mechanism/companion_plan.md`
  - Holds the detailed 11-task TDD checklist that would be too verbose for this file.
  - Companion summary: detailed 11-task TDD checklist for renderer, hook, CLI, adapter verification, and closeout.
  - Sync-back status: closed and ready for archive.
  - Sync-back: durable decisions are mirrored into `findings.md`; phases 2-4 above are the coarse-grained projection of the companion checklist.
  - Status: drafted, not yet executed.
  - Note: this task is **not** a Deep-reasoning Superpowers task. The companion plan path under `docs/superpowers/plans/` is reused as a generic companion-artifact location per Harness AGENTS.md "Companion Plan Model". No Superpowers tooling was invoked.
- 所有 hook 改动需保持 budget 下限并兼容 4 个 adapter（codex/copilot/cursor/claude-code）的 payload 形状
