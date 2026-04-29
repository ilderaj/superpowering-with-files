# 发现

- `planning-brief-context.mjs` 正确生成 SHA-256 指纹，并输出紧凑 brief context。
- `session-summary.mjs` 输出源路径为 `planning/active/<task-id>/...`，未泄露绝对 home 路径。
- `task-scoped-hook.sh` 仅对 `copilot` 启用 session-start / pre-tool-use 紧凑提示，以及 user-prompt-submit 指纹复用逻辑；`codex`、`cursor`、`claude-code` 仍直接输出 hot context。
- 现有测试主要覆盖 Copilot 路径，未覆盖通用目标上的事件感知与变更检测契约。
