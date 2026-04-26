# Findings & Decisions

## Scope

- 目标不是立即改代码，而是先把 cross-IDE hooks 能力的官方事实重新校准，并形成整改计划。
- 重点围绕 session summary / planning-with-files hooks，而不是泛化到所有 agent customization surface。

## Initial Baseline

- 现有仓库文档已经承认 `docs/install/cursor.md` 的 hook projection 仍是 provisional。
- `docs/install/copilot.md` 仍写着 “Superpowers hooks are reported as unsupported for Copilot.”，这与 VS Code 2026-04-22 发布的 preview hooks 文档不再一致。
- `docs/install/claude-code.md` 已经把 Claude hooks 入口写成 settings JSON，这部分方向与既有官方认知一致，但还未显式说明 VS Code 可兼容读取 Claude hook 配置。
- `planning/active/cross-ide-projection-audit/findings.md` 已经记录过一轮 cross-IDE 官方审计，可作为本次增量更新基线。

## Official Evidence Refresh

- VS Code / GitHub Copilot 官方 hooks 文档（2026-04-22 页面）确认：
	- hooks 是 VS Code Chat 的原生 preview 能力，不是仅“兼容读取外部配置”。
	- 官方生命周期事件为 `SessionStart`、`UserPromptSubmit`、`PreToolUse`、`PostToolUse`、`PreCompact`、`SubagentStart`、`SubagentStop`、`Stop`。
	- 官方默认 hook 加载位置包括 `.github/hooks/*.json`、`~/.copilot/hooks`、`.claude/settings.json`、`.claude/settings.local.json`、`~/.claude/settings.json`。
	- 官方 FAQ 明确说明 VS Code 会解析 Claude Code hooks 配置，也会解析 Copilot CLI lowerCamelCase hook config 并自动转换事件名。
	- 官方 FAQ 同时明确指出：VS Code 与 Claude Code 在 tool names、tool_input 字段命名上存在差异，而且 VS Code 当前忽略 Claude matcher。
- Claude Code 官方 hooks reference 确认：
	- 原生 hook 入口仍是 `~/.claude/settings.json`、`.claude/settings.json`、`.claude/settings.local.json`。
	- 生命周期包含 `SessionStart`、`UserPromptSubmit`、`PreToolUse`、`PostToolUse`、`Stop`、`SessionEnd` 等；`SessionEnd` 为真正 session 终止语义。
	- `Stop` 是 turn 级“Claude 完成回复”事件；`SessionEnd` 是 session 关闭事件，两者不可混同。
	- `SessionEnd` 默认整体超时预算为 1.5 秒，但可通过 per-hook timeout 或环境变量提高。
- Codex 官方 hooks 页面现在可直接抓取，确认：
	- hooks 官方入口为 `hooks.json` 或 `config.toml` 内联 `[hooks]`；常用位置是 `~/.codex/hooks.json`、`~/.codex/config.toml`、`<repo>/.codex/hooks.json`、`<repo>/.codex/config.toml`。
	- 仍需要 `[features] codex_hooks = true`。
	- `SessionStart`、`PreToolUse`、`PermissionRequest`、`PostToolUse`、`UserPromptSubmit`、`Stop` 是官方文档确认的核心事件。
	- `Stop` 是 turn scope，不是 session-end；`matcher` 对 `Stop` 不生效。
- Cursor 官方 hooks 页面确认：
	- 原生 hook 入口是 `<project>/.cursor/hooks.json` 与 `~/.cursor/hooks.json`，脚本目录是 `.cursor/hooks/` 与 `~/.cursor/hooks/`。
	- Agent hooks 官方事件包含 `sessionStart`、`sessionEnd`、`preToolUse`、`postToolUse`、`postToolUseFailure`、`subagentStart`、`subagentStop`、`beforeShellExecution`、`afterShellExecution`、`beforeMCPExecution`、`afterMCPExecution`、`beforeReadFile`、`afterFileEdit`、`beforeSubmitPrompt`、`preCompact`、`stop`、`afterAgentResponse`、`afterAgentThought`。
	- Cursor 还有官方 third-party Claude hooks 兼容页，确认可读取 `.claude/settings*.json`，但需要启用 Third-party skills 功能，并且并非所有 Claude event/type 都完整支持。
- Cursor third-party Claude hooks 官方页补充确认：
	- Claude 配置在 Cursor 中的优先级低于原生 `.cursor/hooks.json`。
	- 支持的 Claude-compatible 事件包括 `PreToolUse`、`PostToolUse`、`UserPromptSubmit`、`Stop`、`SubagentStop`、`SessionStart`、`SessionEnd`、`PreCompact`。
	- `Notification`、`PermissionRequest` 等 Claude 事件在 Cursor 第三方兼容层中不支持。

## Local Gap Analysis

- [harness/installer/lib/hook-projection.mjs](/Users/jared/SuperpoweringWithFiles/harness/installer/lib/hook-projection.mjs#L8) 仍把 Copilot planning hook 事件写成 `sessionStart`、`preToolUse`、`postToolUse`、`agentStop`、`errorOccurred`。
- [harness/core/hooks/planning-with-files/copilot-hooks.json](/Users/jared/SuperpoweringWithFiles/harness/core/hooks/planning-with-files/copilot-hooks.json#L1) 也仍然生成 `agentStop` / `errorOccurred`，缺少官方生命周期里的 `userPromptSubmit` 与 `stop`。
- [harness/core/hooks/planning-with-files/scripts/task-scoped-hook.sh](/Users/jared/SuperpoweringWithFiles/harness/core/hooks/planning-with-files/scripts/task-scoped-hook.sh#L130) 已经具备 `user-prompt-submit` 与 `stop` 分支，因此问题主要在投影层，而不是 hook runtime 脚本层。
- `superpowers` 在 [harness/core/skills/index.json](/Users/jared/SuperpoweringWithFiles/harness/core/skills/index.json#L1) 中仍未声明 Copilot hook adapter，导致 [docs/install/copilot.md](/Users/jared/SuperpoweringWithFiles/docs/install/copilot.md#L37)、[docs/compatibility/hooks.md](/Users/jared/SuperpoweringWithFiles/docs/compatibility/hooks.md#L1)、[docs/architecture.md](/Users/jared/SuperpoweringWithFiles/docs/architecture.md#L31) 继续把 Copilot 的 `superpowers` hook 标成 unsupported。
- [harness/installer/lib/health.mjs](/Users/jared/SuperpoweringWithFiles/harness/installer/lib/health.mjs#L171) 仍把 Cursor hook 证据等级硬编码为 `provisional`，已落后于现有官方 docs。
- [tests/installer/health.test.mjs](/Users/jared/SuperpoweringWithFiles/tests/installer/health.test.mjs#L915) 仍断言 Cursor 为 provisional；需要与官方文档事实同步。

## Recommended Architecture

- 推荐方案：继续保留每个 target 的原生 hook adapter。
- 对 Copilot / VS Code：以 `.github/hooks/*.json` / `~/.copilot/hooks` 作为 Harness 主契约，按 VS Code 官方 lifecycle 校正事件名，并新增 `superpowers` session-start adapter。
- 对 Claude Code：继续以 `.claude/settings*.json` 为原生契约。
- 对 Cursor：继续以 `.cursor/hooks.json` 为原生契约，第三方 Claude hooks 只作为兼容/迁移能力，不与原生 projection 混用成默认路径。
- 对 Codex：保留当前官方路径与 feature-flag 语义，但把“证据不足”的保守表述升级为“官方 docs 已验证”。

## Why Not Use Claude Hooks As The Primary Copilot Path

- VS Code 会读取 Claude hooks，但官方 FAQ 已明确说明它忽略 matcher，并且 tool names / tool_input 命名与 Claude Code 不同。
- 如果 Harness 同时投影原生 Copilot hooks 与 Claude hooks，VS Code 很可能双重加载，触发重复执行。
- 如果 Harness 改为只投影 Claude hooks 给 Copilot，则 Copilot/VS Code 行为会被 Claude 兼容层的限制绑住，不利于长期维护。
- 因此，Claude hooks compatibility 应当被记录为“可利用的兼容入口”，而不是 Harness 的首选实现路径。

## Evidence Gaps

- VS Code 官方文档确认可读取 Claude hooks，但没有在抓取页面中直接给出“Chat: Use Claude Hooks”这个 settings key 的完整说明；当前这部分可由用户截图与本地 UI 进一步佐证。
- Cursor 第三方 Claude hooks 需要启用 `Third-party skills` 功能并对账号开放；这意味着“兼容可用”不等于“默认对所有 Cursor 用户无条件可用”。
- Claude hooks 在 VS Code / Cursor 中虽可被读取，但它们的 tool schema 差异意味着 Harness 不能把“可加载”直接等同为“无适配即可完全等价运行”。

## Working Decisions

| Decision | Rationale |
|----------|-----------|
| 在本文件中分开记录“官方事实”“Harness 当前行为”“证据缺口” | 后续整改时可以直接决定哪些内容更新文档，哪些内容更新实现 |
| Copilot 的整改目标是“官方 lifecycle 对齐 + 官方支持声明更新”，不是“把 Claude hooks 当作 Copilot 主适配层” | 降低重复执行与 schema 偏差风险 |
| Cursor 从此不应再被标记为仅 provisional | 现已拿到官方 hooks 与 third-party Claude hooks 两页正式文档 |
| Codex hooks 需要从“保守表述”改成“官方已验证但 feature-flag gated” | 官方 developers 页面现可抓取，且与现有实现基本一致 |
| 在现有隔离 worktree 中直接执行计划 | 当前工作目录已是独立 worktree，且与本地 `dev` 同步，适合在不污染主工作区的前提下执行 |
| 完成后回合并到本地 `dev` 并推送 `origin dev` | 这是本次用户明确要求的交付收口方式 |

## Task 1 Execution Notes

- `harness/installer/lib/health.mjs` 已将 hook evidence 判定改为显式 target map；`codex`、`copilot`、`cursor`、`claude-code` 统一标记为 `verified`。
- `tests/installer/health.test.mjs` 中 Cursor 断言已改为 `verified`，并新增 Copilot lifecycle health 测试，当前红灯稳定暴露旧 schema 仍要求 `agentStop`。
- 为了命中“required event”检查而不是更早的 marker 缺失，Copilot 新测试的夹具配置加入了 `Harness-managed planning-with-files hook` 描述条目；这不改变任务目标，只是避免被更前置的校验短路。

## Execution Context

- Worktree base: `copilot/subagents-plan-execution @ a84a5882217772f8a882779f42723f9638ff3158`
- Local `dev` at execution start: `a84a5882217772f8a882779f42723f9638ff3158`
- Companion plan status: 从“awaiting user review before execution”切换为执行中，由 task-scoped files 继续记录 durable 状态

## Task 2 Execution Notes

- Copilot planning hooks 已对齐到官方 VS Code lifecycle：`sessionStart`、`userPromptSubmit`、`preToolUse`、`postToolUse`、`stop`。
- `harness/core/hooks/planning-with-files/copilot-hooks.json` 已移除 `agentStop` / `errorOccurred`，并改为对应的 kebab-case runtime event 参数。
- 为了让 Task 1 新增的 Copilot health 测试在 Task 2 落地后按计划转绿，`harness/installer/lib/health.mjs` 将缺失 required events 的报错改为聚合输出，而不是在第一个缺失事件处提前返回。

## Task 3 Execution Notes

- Copilot 现在具备 native `superpowers` SessionStart adapter，会投影 `.github/hooks/superpowers.json` 和 `.github/hooks/session-start`。
- `harness/core/skills/index.json` 已在 `skills.superpowers.hooks` 下注册 `copilot` 入口，并复用 `harness/core/hooks/superpowers/scripts/session-start` 与 `run-hook.cmd`。
- `superpowers` runtime payload 继续使用既有的 PascalCase `hookEventName: "SessionStart"`；这与仓库现有 superpowers tests / health 约定一致，不因新增 Copilot adapter 而改写。

## Task 4 Execution Notes

- 安装文档、兼容矩阵与架构文档已统一更新：Copilot/VS Code 与 Cursor 都明确采用 native-first hook adapter，Claude-format hooks 仅作为兼容层。
- Copilot 文档现在明确列出 `planning-with-files` 与 `superpowers` 两类 native hook projection；不再声称 Copilot 缺少 superpowers hook 支持。
- Cursor 文档已移除 provisional 表述，并修正 smoke test，使 `sessionStart` 明确对应 vendored `.cursor/hooks/session-start`。
- Claude Code 安装文档的 optional hooks 列表已补上 `.claude/hooks/session-start` 与 `~/.claude/hooks/session-start`，与实际 projection 保持一致。

## Final Conclusions

- Copilot planning hooks 现在与 VS Code 官方 lifecycle 对齐：`sessionStart`、`userPromptSubmit`、`preToolUse`、`postToolUse`、`stop`。
- Copilot `superpowers` SessionStart hook 现在通过 native Copilot adapter 正式受支持。
- Cursor hook evidence level 已从 provisional 升级为 verified。
- Claude hook compatibility 在 Copilot / Cursor 上被明确定义为 secondary compatibility surface，而不是 primary contract。
