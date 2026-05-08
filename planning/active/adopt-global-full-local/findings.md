# Findings

## Current Facts
- 当前仓库 `adopt-global` 命令支持显式 `--skills-profile=<name>`，且帮助文本明确“explicit values always win”。
- `adopt-global` 的执行顺序是：
  1. `ensureUserGlobalState(...)`
  2. `sync([])`
  3. `verify([--output=...])`
  4. 读取 health；若有问题则写 `.harness/adoption/global.failure.json` 并失败
  5. 写 `.harness/adoption/global.json` success receipt
  6. 重新计算并输出 `adoption-status`
- `adopt-global` 是 user-global-only；如果当前 install state 是非空的 `workspace` 或 `both`，实现会直接拒绝执行。
- 当前仓库文档与历史记忆都说明：user-global adopt 默认 skills profile 是 `minimal-global`，`full` 需要显式 opt-in。
- 当前本机 preflight 结果：
  - `./scripts/harness adoption-status` 返回 `status: needs_apply`
  - 原因仅为当前 repo HEAD `0176e0009f4c5573e975693501758aae118defa7` 与 receipt HEAD `0aeb6704c062a7e4a44442d6f7ad2e843c86cded` 不同
  - 现有 scope 为 `user-global`
  - 现有 targets 为 `claude-code`, `codex`, `copilot`, `cursor`
  - 现有 `skillProfile` 为 `minimal-global`
  - `doctor --check-only` 通过，`health.problems = []`, `health.warnings = []`

## Open Checks
- 真实 HOME 写入需要提权执行，因为目标路径位于仓库外的用户全局目录。
- adoption 完成后是否回到 `in_sync` 且 receipt 的 `skillProfile` 改为 `full` 仍需执行后确认。

## Execution Blocker
- 本轮尝试通过提权执行：
  - `./scripts/harness adopt-global --skills-profile=full`
- 结果不是 Harness 失败，而是 Codex 执行层拒绝本次越权请求：
  - 原因：当前环境的 usage limit 已命中，自动审批要求在 `2026-05-09 03:00 AM` 后再试
- 这意味着当前会话可确认 preflight、安全性与命令正确性，但不能代替用户完成真实 HOME 写入。
