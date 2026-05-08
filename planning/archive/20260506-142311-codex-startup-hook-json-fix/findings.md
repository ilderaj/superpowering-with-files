# 发现

- 当前用户级 `/Users/jared/.codex/hooks.json` 已只保留 Codex `SessionStart` 与 `UserPromptSubmit` 的 Harness-managed planning hooks，另有一个 superpowers `SessionStart` hook；旧的 planning `Stop` 已不在当前配置中。
- 在本仓库根目录直接运行 `/Users/jared/.codex/hooks/task-scoped-hook.sh codex session-start` 与 `... user-prompt-submit`，stdout 分别返回：
  - `hookEventName: "session-start"`
  - `hookEventName: "user-prompt-submit"`
- 触发条件是仓库下存在多个 `planning/active/*` 且状态为 `Status: active` 的任务目录。脚本在 `task_count > 1` 分支调用 `emit_context ... "$event"`，把原始 shell 事件名直接塞进 Codex payload。
- 对 Codex 来说，`hookSpecificOutput.hookEventName` 需要使用 PascalCase 的官方事件名，例如 `SessionStart`、`UserPromptSubmit`；当前 lower-kebab-case 值会让 JSON payload 通过语法解析但无法通过事件 schema 校验。
- superpowers 的 `/Users/jared/.codex/hooks/session-start` 单独输出 `hookEventName: "SessionStart"`，因此截图里更可能是 planning `SessionStart` 与 `UserPromptSubmit` 报错，而不是 superpowers hook 本身报错。
- 修复方式是在 `harness/core/hooks/planning-with-files/scripts/task-scoped-hook.sh` 中新增 `canonical_hook_event_name()`，并在 `emit_context()` 内统一 canonicalize 事件名；这样即使未来又走到“多个 active task”或其他 raw shell event 分支，也不会再向 Codex 输出 lower-kebab-case 事件名。
- `./scripts/harness sync --dry-run` 的 manifest diff 不会把这类 hook script 内容差异显示为 `update`，因为 manifest 只记录 `sourcePath` / `targetPath` 等元数据，不比较源文件内容；但真正执行 `./scripts/harness sync` 时仍会重新 materialize hook scripts，所以本次用户级 `~/.codex/hooks/task-scoped-hook.sh` 已成功更新。
