# 进展

## 2026-04-27
- 创建任务记录，开始排查 Codex stop hook JSON 报错。
- 读取技能与本仓库证据：确认 Codex 适配层、安装文档、task-scoped hook 脚本、hook projection 和回归测试都把 Codex `Stop` 当作 Harness 支持事件。
- 读取用户级现场配置：`/Users/jared/.codex/hooks.json` 当前已安装 Harness-managed `Stop` hook，且脚本来自 `/Users/jared/.codex/hooks/task-scoped-hook.sh`。
- focused validation 1：`node --test tests/hooks/task-scoped-hook.test.mjs --test-name-pattern='stop-like events emit session summaries|stop emits unavailable duration'` → pass；说明仓库内测试明确要求 Codex stop hook 输出当前这套 payload。
- focused validation 2：直接运行 `bash /Users/jared/.codex/hooks/task-scoped-hook.sh codex stop` → 返回 `{"hookSpecificOutput":{"hookEventName":"stop",...}}`；说明当前安装在用户环境中的 Harness hook 的确会在 stop 事件输出该 payload。
- 对照 OpenAI `openai/codex` 官方 hooks 解析实现：`Stop` 事件输出 schema 不包含 `hookSpecificOutput`，因此当前 Harness Codex `Stop` hook 与官方 stop output contract 不兼容。
- 用户认可事件级 allowlist 方向，进入设计文档化阶段；目标是把 Codex 的保留/禁用/条件保留 hook 事件与治理规则固化成 spec，不做实现改动。
- 已写出设计文档：`docs/superpowers/specs/2026-04-27-codex-hook-allowlist-design.md`。
- spec 自审：占位词扫描无结果，内容与当前调查结论一致；任务状态切为 `waiting_review`，等待用户确认设计文档。
- 用户已批准继续输出 implementation plan。
- 已写 implementation plan：`docs/superpowers/plans/2026-04-27-codex-hook-allowlist-implementation-plan.md`。
- companion plan 内容覆盖：Codex allowlist 测试重写、projection/config 变更、兼容性文档更新、最终验证与 task-memory sync。
- active task 状态更新为 `waiting_execution`，等待选择执行方式。
- 在现有开发工作区执行 implementation plan：当前分支 `dev`，HEAD `5b14bafcedace278e541226b8e04cbf00708fb18`；未新建额外 worktree。
- TDD red 阶段：先重写 `tests/adapters/sync-hooks.test.mjs`、`tests/installer/health.test.mjs`、`tests/hooks/task-scoped-hook.test.mjs`，然后运行 `node --test tests/adapters/sync-hooks.test.mjs tests/installer/health.test.mjs tests/hooks/task-scoped-hook.test.mjs`，得到 2 个预期失败，失败点都集中在 Codex `Stop` 仍被投影/要求。
- green 阶段：修改 `harness/installer/lib/hook-projection.mjs` 与 `harness/core/hooks/planning-with-files/codex-hooks.json`，只保留 Codex planning `SessionStart` / `UserPromptSubmit`。
- code review 发现 rollout 缺口：旧的 Harness-managed Codex `Stop` 会在 merge 时残留。随后补写 `tests/installer/hook-config.test.mjs` 与 `tests/adapters/sync-hooks.test.mjs` 回归，先确认失败，再修改 `harness/installer/lib/hook-config.mjs`，让 merge 在保留用户 hook 的前提下剔除已退出 allowlist 的 managed entries。
- focused verification：`node --test tests/adapters/sync-hooks.test.mjs tests/installer/health.test.mjs tests/hooks/task-scoped-hook.test.mjs tests/hooks/session-summary.test.mjs` → pass（54/54）。
- docs sync：更新 `docs/install/codex.md`、`docs/compatibility/hooks.md`、`docs/architecture.md`，并用 repo rg 工具确认 allowlist、retained events 和 stale `Stop` migration note 都已出现。
- follow-up verification：`node --test tests/adapters/sync-hooks.test.mjs tests/installer/hook-config.test.mjs` → pass（18/18）；复审后未发现新的实质问题。

## 验证
- `npm test -- --test-reporter=dot | tail -n 50` → pass（命令退出码 0）。
- `./scripts/harness sync --dry-run` → pass；dry-run 显示用户级 Codex planning hook 将从包含 `Stop` 的旧投影更新为只含 `SessionStart` 与 `UserPromptSubmit` 的 allowlist 配置。
