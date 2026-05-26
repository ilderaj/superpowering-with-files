# Task Plan: Local Adopt Global With Full Profile

## Goal
在本机真实 user-global 环境执行一次 `./scripts/harness adopt-global --skills-profile=full`，将当前仓库的全局配置投影 adopt 到本地全局路径，并确认 adoption receipt、verification report、health/status 结果一致。

## Current State
Status: complete
Archive Eligible: yes
Close Reason: Local user-global adoption completed after backup-based takeover of a non-Harness-owned Codex entry file.

## Current Phase
Phase 1

## Phases

### Phase 1: 上下文恢复与执行前校验
- [x] 确认现有 active task 与历史记忆中是否已有可复用的 adoption 语义
- [x] 确认 `adopt-global` 的 `full` profile 命令面、默认行为和 health gate
- [x] 检查当前安装状态是否允许 user-global adoption 执行
- **Status:** complete

### Phase 2: 执行本机 user-global adoption
- [x] 以真实 HOME 执行 `adopt-global --skills-profile=full`
- [x] 记录实际写入行为、receipt 和 verification 输出位置
- **Status:** complete

### Phase 3: 执行后验证与收口
- [x] 运行 `adoption-status`，确认结果达到 `in_sync`
- [x] 记录任何 health warning / mismatch / backup takeover 现象
- [x] 回写 planning 文件中的 durable 结果
- **Status:** complete

## Key Questions
1. 当前 `.harness` install state 是否已经是 `user-global`，还是存在会触发 `adopt-global` 拒绝的 workspace/both 状态？
2. 本次是否需要仅保留既有 target 集，还是 bootstrap 到全部全局 target？
3. 真实 HOME 写入后，health 与 adoption receipt 是否都能回到一致状态？

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| 本轮作为独立 tracked execution task 处理 | 这是对真实本机 user-global 的写操作，且需要 durable verification trail |
| 不使用 superpowers | 任务路径清晰，属于直接执行型 adoption，不符合 deep-reasoning 条件 |
| 明确使用 `--skills-profile=full` | 用户要求用 `profile full` 做一次本地全局 adopt |
| 不传 `--mode=force` | 当前 install state 已是合法的非空 `user-global`，`ensure` 足以保留既有 target/hook/projection 配置并只切 skill profile |

## Blockers
- None. Previous execution-layer limit is no longer blocking this task.

## Notes
- 本轮目标是修改本机 user-global 配置，不改仓库代码。

## Risk Assessment
| Time | Command | Target Path(s) | Workspace Boundary | Checkpoint | Rollback | Status |
|---|---|---|---|---|---|---|
| 2026-05-26 UTC+8 | `./scripts/harness sync --conflict=backup` then `./scripts/harness adopt-global --skills-profile=full` | `~/.codex/AGENTS.md` plus other configured user-global target paths | Touches user-global paths outside the workspace | `/Users/jared/.agent-config/checkpoints/SuperpoweringWithFiles/2026-05-26T01-50-41Z/manifest.json` | Restore from `~/.harness/backups/` entry recorded by Harness, or recover repo state from the checkpoint bundle/diffs if needed, then rerun `sync`/`adoption-status` | approved and pending execution |
