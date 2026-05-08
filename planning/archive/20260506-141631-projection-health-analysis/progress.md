# Projection Health Analysis Progress

## Session Log
- 开始排查当前工作区 projection 安装状态不健康的来源。
- 复现 `./scripts/harness status` 和 `./scripts/harness doctor --check-only`：Codex skills missing，Copilot/Cursor/Claude Code 多个 skills 仍为 symlink。
- 检查 `.harness/state.json` 与 `.harness/projections.json`：lastSync 早于实际修正提交，manifest 仍记录旧 link projection。
- 检查 `dev`、`origin/main`、`codex/hooks-projection` worktree：实际代码修正 `250ac99` 在 `dev` 和 `origin/main`，不在 `codex/hooks-projection`。
- 执行 `./scripts/harness sync --dry-run`：计划 create 15、update 44、stale 15、unchanged 4，说明当前代码能够迁移旧安装状态。
- 执行相关测试并通过。
- 2026-04-17 按用户要求重新复核当前本机 projection 状态与治理必要性。
- 重新检查 `/Users/jared/HarnessTemplate` 主工作区、`.harness/state.json`、`.harness/projections.json`、`./scripts/harness status`、`./scripts/harness doctor --check-only`、`./scripts/harness sync --dry-run`。
- 复核发现当前本机 user-global projection 已经健康，先前 unhealthy 结论对应的是更早的安装状态，不再代表现在。
- 抽样对比 projected skill 目录与 source 目录，确认当前 dry-run 的 `update` 主要反映内容漂移/patch 差异，而不是路径策略回退。
- 形成新的治理判断：不建议继续做 projection core 重治理，建议做旧 worktree 与运维文档的轻治理。

## Verification
- `./scripts/harness doctor --check-only`：失败，符合当前未同步安装状态。
- `./scripts/harness sync --dry-run`：通过，显示可迁移旧 projection。
- `node --test tests/core/skill-index.test.mjs tests/installer/health.test.mjs tests/adapters/sync-skills.test.mjs tests/installer/paths.test.mjs`：36 个测试通过。
- `git -C /Users/jared/HarnessTemplate rev-parse HEAD`：`f5b100c468f4206cf1f9045b4251947d58c7cae5`
- `git -C /Users/jared/HarnessTemplate branch --contains 250ac99dabce16f54b94a9fd1f4829ac1db7e7a4`：`dev`、`main` 及相关分支均包含该提交。
- `git -C /Users/jared/.config/superpowers/worktrees/HarnessTemplate/codex-hooks-projection rev-parse HEAD`：`d8da24d6382faf676c315059b001af3ebff0bc85`
- `./scripts/harness doctor --check-only`：通过；仅剩 `docs/superpowers/plans` warning。
- `./scripts/harness status`：四个 IDE target 的 projected entries/skills 均为 `status: "ok"`，`problems: []`。
- `./scripts/harness sync --dry-run`：`update: 55, unchanged: 8`；未见 create/stale，说明当前不是缺根路径/错策略问题。
- `diff -ru /Users/jared/HarnessTemplate/harness/upstream/superpowers/skills/using-superpowers /Users/jared/.agents/skills/using-superpowers`：无差异。
- `diff -ru /Users/jared/HarnessTemplate/harness/upstream/planning-with-files /Users/jared/.copilot/skills/planning-with-files`：仅见预期 patch 和 `__pycache__` 二进制差异。
