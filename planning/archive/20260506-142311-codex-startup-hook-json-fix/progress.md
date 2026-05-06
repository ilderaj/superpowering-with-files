# 进展

## 2026-05-06
- 读取 `planning-with-files` 与 `systematic-debugging` skill，按 tracked task 建立本次任务记录。
- 复用历史 active task `codex-stop-hook-json-analysis` 与 `cross-ide-hook-capability-alignment` 的证据，确认此前已修复 Codex planning `Stop` 不兼容问题。
- 检查当前用户级 `/Users/jared/.codex/hooks.json`，确认现有三条启动相关 hook 为：
  - planning `SessionStart`
  - superpowers `SessionStart`
  - planning `UserPromptSubmit`
- 现场复现：
  - `bash /Users/jared/.codex/hooks/task-scoped-hook.sh codex session-start`
  - `bash /Users/jared/.codex/hooks/task-scoped-hook.sh codex user-prompt-submit`
  两者都返回 lower-kebab-case 的 `hookEventName`，与 Codex 期望不符。
- 初步结论：根因不是 superpowers 文本内容本身，而是 planning hook 在“多个 active task”分支没有做事件名 canonicalization。
- 代码修复：
  - 在 `harness/core/hooks/planning-with-files/scripts/task-scoped-hook.sh` 新增 `canonical_hook_event_name()`
  - 在 `emit_context()` 中统一 canonicalize `hook_event`
  - 在 `tests/hooks/task-scoped-hook.test.mjs` 增加多 active task 下的 Codex `SessionStart` / `UserPromptSubmit` 回归
- focused verification：
  - `node --test tests/hooks/task-scoped-hook.test.mjs tests/hooks/superpowers-codex-hook.test.mjs` → pass（10/10）
  - `bash harness/core/hooks/planning-with-files/scripts/task-scoped-hook.sh codex session-start` → `hookEventName: "SessionStart"`
  - `bash harness/core/hooks/planning-with-files/scripts/task-scoped-hook.sh codex user-prompt-submit` → `hookEventName: "UserPromptSubmit"`
- 用户级落地：
  - 先执行 `./scripts/harness sync`，sandbox 因写入 `~/.codex/AGENTS.md` 报 `EPERM`
  - 提升权限后重跑 `./scripts/harness sync` → `Synced 4 target(s): codex, copilot, cursor, claude-code (create=0, update=0, stale=0)`
  - 再次直接运行 `/Users/jared/.codex/hooks/task-scoped-hook.sh` 的两个 Codex 事件，输出均已变为 canonical event 名
  - `shasum` 对比确认仓库脚本与 `/Users/jared/.codex/hooks/task-scoped-hook.sh` 已一致
