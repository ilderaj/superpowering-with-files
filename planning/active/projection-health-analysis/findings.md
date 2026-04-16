# Projection Health Analysis Findings

## Findings
- 当前工作区是 `/Users/jared/HarnessTemplate`，分支 `dev`，HEAD `8bea63695ce53ae1830dbe613e9007ce41fcbafe`。
- 另一个 worktree 位于 `/Users/jared/.config/superpowers/worktrees/HarnessTemplate/codex-hooks-projection`，分支 `codex/hooks-projection`，HEAD `d8da24d6382faf676c315059b001af3ebff0bc85`。
- `250ac99dabce16f54b94a9fd1f4829ac1db7e7a4` 是实际代码修正提交，修改了 `harness/core/skills/index.json`、`harness/core/metadata/platforms.json`、`harness/installer/lib/health.mjs` 和相关测试；它已经包含在 `dev` 和 `origin/main`，但不在 `codex/hooks-projection` worktree。
- `b51f1b1` 标题也叫 `Stabilize skill projections across IDE adapters`，但该提交只记录 planning 文件，不是实际代码修正；实际代码修正是小写标题的 `250ac99`。
- 当前 `dev` 的 skill metadata 已把 `superpowers` 和 `planning-with-files` 对 Codex、Copilot、Cursor、Claude Code 都设为 `materialize`。
- 当前 `dev` 的 platform metadata 已把 Codex skill root 从旧的 `.codex/skills` 调整到 `.agents/skills`，并标记为 `materialize-preferred`。
- 当前 `.harness/state.json` 的 `lastSync` 是 `2026-04-14T06:17:44.418Z`，早于 `250ac99` 的提交时间 `2026-04-14 23:02:38 +0800`，所以本机安装状态停在修正前。
- 当前 `.harness/projections.json` 仍记录旧的 `link` strategy 和旧 Codex target `/Users/jared/.codex/skills/*`。
- 实际文件系统状态与 health 报告一致：`/Users/jared/.agents/skills` 缺少 Harness 管理的 Codex projection；`/Users/jared/.copilot/skills`、`/Users/jared/.cursor/skills`、`/Users/jared/.claude/skills` 中多个 Harness skills 仍为 symlink。
- `./scripts/harness sync --dry-run` 显示无需代码修改即可修复当前安装状态：会创建 15 个 Codex materialized skills、更新 44 个旧 link projection、清理 15 个旧 Codex stale projection。
- 相关测试通过：`node --test tests/core/skill-index.test.mjs tests/installer/health.test.mjs tests/adapters/sync-skills.test.mjs tests/installer/paths.test.mjs`，共 36 个测试通过。

## Conclusion
- 代码层面的修正确实已经在当前 `dev` 中。
- 当前仍报 unhealthy 的原因不是修正缺失，而是本机 user-global projection 没有在修正后重新 `sync`。
- 如果用户从 `codex/hooks-projection` worktree 操作，则那边确实没有 `250ac99`，仍会看到旧 metadata/路径逻辑。

## Repair Plan
1. 在 `/Users/jared/HarnessTemplate` 的 `dev` 分支执行 `./scripts/harness sync --dry-run`，确认 diff 仍为 create/update/stale 且没有非 Harness-owned 冲突。
2. 执行 `./scripts/harness sync`，让 user-global projection 按当前 metadata materialize。
3. 执行 `./scripts/harness doctor --check-only`，确认 skill projection problems 清零，只保留允许的 plan-location warning。
4. 如果仍需保留 `codex/hooks-projection` worktree，先将该分支 rebase/merge 到当前 `dev`，否则不要从该旧 worktree 执行 install/sync/status。
5. 如果想避免以后混淆，在文档或 release note 里明确：metadata 改动后必须重新运行 `sync`，`.harness/projections.json` 是本机安装状态，不会仅因 git checkout/merge 自动迁移。

## References
- `/Users/jared/HarnessTemplate`
- `/Users/jared/.config/superpowers/worktrees/HarnessTemplate/codex-hooks-projection`
- `/Users/jared/HarnessTemplate/harness/core/skills/index.json`
- `/Users/jared/HarnessTemplate/harness/core/metadata/platforms.json`
- `/Users/jared/HarnessTemplate/harness/installer/lib/health.mjs`
- `/Users/jared/HarnessTemplate/.harness/state.json`
- `/Users/jared/HarnessTemplate/.harness/projections.json`
