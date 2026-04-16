# Projection Health Analysis Progress

## Session Log
- 开始排查当前工作区 projection 安装状态不健康的来源。
- 复现 `./scripts/harness status` 和 `./scripts/harness doctor --check-only`：Codex skills missing，Copilot/Cursor/Claude Code 多个 skills 仍为 symlink。
- 检查 `.harness/state.json` 与 `.harness/projections.json`：lastSync 早于实际修正提交，manifest 仍记录旧 link projection。
- 检查 `dev`、`origin/main`、`codex/hooks-projection` worktree：实际代码修正 `250ac99` 在 `dev` 和 `origin/main`，不在 `codex/hooks-projection`。
- 执行 `./scripts/harness sync --dry-run`：计划 create 15、update 44、stale 15、unchanged 4，说明当前代码能够迁移旧安装状态。
- 执行相关测试并通过。

## Verification
- `./scripts/harness doctor --check-only`：失败，符合当前未同步安装状态。
- `./scripts/harness sync --dry-run`：通过，显示可迁移旧 projection。
- `node --test tests/core/skill-index.test.mjs tests/installer/health.test.mjs tests/adapters/sync-skills.test.mjs tests/installer/paths.test.mjs`：36 个测试通过。
