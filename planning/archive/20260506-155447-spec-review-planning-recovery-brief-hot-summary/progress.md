# 进度

- 已读取 `task-scoped-hook.sh`、`planning-hot-context.mjs`、`planning-brief-context.mjs`、`render-brief-context.mjs`、`session-summary.mjs`。
- 已读取 `tests/hooks/task-scoped-hook.test.mjs`、`tests/hooks/hook-budget.test.mjs`、`tests/hooks/session-summary.test.mjs`。
- 已运行 `node --test tests/hooks/task-scoped-hook.test.mjs tests/hooks/hook-budget.test.mjs tests/hooks/session-summary.test.mjs`，结果通过（16 tests, 0 failures）。
- 额外运行 `task-scoped-hook.sh` 验证 `codex`：`session-start`、`pre-tool-use`、重复 `user-prompt-submit` 均仍输出 HOT CONTEXT，与通用行为契约不符。

## Test Results
| Command | Result |
| --- | --- |
| `node --test tests/hooks/task-scoped-hook.test.mjs tests/hooks/hook-budget.test.mjs tests/hooks/session-summary.test.mjs` | pass |
| `bash harness/core/hooks/planning-with-files/scripts/task-scoped-hook.sh codex session-start` | fail |
| `bash harness/core/hooks/planning-with-files/scripts/task-scoped-hook.sh codex pre-tool-use` | fail |
| `bash harness/core/hooks/planning-with-files/scripts/task-scoped-hook.sh codex user-prompt-submit` | fail |

## Error Log
| Error | Status | Notes |
| --- | --- | --- |
| Generic targets still emit hot context for compact/change-detect events | open | `task-scoped-hook.sh` gates the new behavior on `target = copilot`. |
