# Progress

## Session: 2026-05-23 12:41:00 UTC+0

### Baseline Verification
- 运行 `npm run verify`（本地）确认当前基线存在 3 个失败：
  - `checkpoint-push creates a review artifact, commit, and upstream push for eligible worktrees`（`safe.bareRepository`）
  - `worktree-name command prints the naming contract as JSON`（`ENOTEMPTY`）
  - `worktree-preflight prints naming suggestions in text output`（`ENOTEMPTY`）

### Next Actions
- 修复 `ENOTEMPTY`：增强 `tests/helpers/harness-fixture.mjs` 的删除策略（重试/退避）
- 修复 bare repo：调整 `tests/installer/checkpoint-push.test.mjs` 的 `git()` helper，为 bare repo 操作显式允许
- 修复 upstream refresh allowlist：忽略 `node_modules/.cache/**` 等运行时缓存
- 修复 blockedReason 误报：只在真实 git 命令失败时才识别冲突

