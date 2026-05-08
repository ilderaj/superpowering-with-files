# Task Plan: Local Adopt Global With Full Profile

## Goal
在本机真实 user-global 环境执行一次 `./scripts/harness adopt-global --skills-profile=full`，将当前仓库的全局配置投影 adopt 到本地全局路径，并确认 adoption receipt、verification report、health/status 结果一致。

## Current State
Status: blocked
Archive Eligible: no
Close Reason:

## Current Phase
Phase 1

## Phases

### Phase 1: 上下文恢复与执行前校验
- [x] 确认现有 active task 与历史记忆中是否已有可复用的 adoption 语义
- [x] 确认 `adopt-global` 的 `full` profile 命令面、默认行为和 health gate
- [x] 检查当前安装状态是否允许 user-global adoption 执行
- **Status:** complete

### Phase 2: 执行本机 user-global adoption
- [ ] 以真实 HOME 执行 `adopt-global --skills-profile=full`
- [ ] 记录实际写入行为、receipt 和 verification 输出位置
- **Status:** blocked

### Phase 3: 执行后验证与收口
- [ ] 运行 `adoption-status`，确认结果达到 `in_sync`
- [ ] 记录任何 health warning / mismatch / backup takeover 现象
- [ ] 回写 planning 文件中的 durable 结果
- **Status:** pending

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
- 当前 Codex 桌面环境拒绝本次越权执行，请求未进入命令本身：
  - `Rejected: You've hit your usage limit... try again at May 9th, 2026 3:00 AM.`
- 在该限制解除前，无法从当前会话对真实 `~/.codex` / `~/.copilot` / `~/.claude` / `~/.cursor` 执行 user-global 写入。

## Notes
- 本轮目标是修改本机 user-global 配置，不改仓库代码。
