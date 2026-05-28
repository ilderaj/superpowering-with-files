# 发现记录：Cursor / OpenCode Harness 审计

## Findings Record: 2026-05-28 13:33:23 UTC+8

### 初始发现
- `planning/active/` 下已有多个历史审计任务，包含 `cc-harness-analysis`、`codex-harness-capability-audit-20260528`、`cursor-skill-projection-consolidation`、`cross-platform-harness-audit` 等；这些可作为背景，但本次审计需要独立 task 目录。
- 现有历史任务显示：仓库过去已经分别审计过 Claude Code、Codex、Cursor skill projection 与跨平台兼容性，但没有现成任务完全覆盖“Cursor 当前真实支持程度 + OpenCode adoptability”的组合问题。
- 本次审计边界：不动代码；只接受仓库实际实现、可执行验证结果、以及目标平台官方文档作为事实源。

## Findings Record: 2026-05-28 13:33:23 UTC+8

### 项目定位与能力边界（文档声明）
- README 将项目定义为“local coding-agent workflows 的 governance harness”，核心目标是把一套共享治理策略渲染为多 IDE/agent 平台的原生入口文件、skills 与可选 hooks，而不是做某一个 IDE 独占插件。[README.md:2](README.md:2)
- README 明确列出的当前目标平台是 Codex、GitHub Copilot、Cursor、Claude Code；同时明确写出 Gemini CLI 当前不是支持的 installer target。[README.md:2](README.md:2) [README.md:9](README.md:9)
- README 给出的核心模型强调：`planning-with-files` 是唯一 durable task-memory，`superpowers` 只是临时 reasoning layer；verify/doctor/sync/adopt-global 等命令构成操作面。[README.md:4](README.md:4) [README.md:41](README.md:41) [README.md:48](README.md:48) [README.md:79](README.md:79) [README.md:192](README.md:192)
- README 的 projection map 声称 Cursor 的 workspace entry 是 `.cursor/rules/harness.mdc`，skill root 是 `.agents/skills`；Codex / Copilot / Cursor 共用 `.agents/skills`，Claude Code 单独走 `.claude/skills`。[README.md:153](README.md:153) [README.md:161](README.md:161) [README.md:166](README.md:166) [README.md:173](README.md:173)
- PRODUCT 将产品目的定义为：为本地与 cloud coding-agent workflows 提供 governance layer，使 planning state durable，并把一套 policy 投射到多个 agent surfaces，同时让 verification / release lanes 显式化。[PRODUCT.md:8](PRODUCT.md:8) [PRODUCT.md:10](PRODUCT.md:10)

## Findings Record: 2026-05-28 13:33:23 UTC+8

### 架构与平台扩展点（仓库实证）
- 项目架构分为 `core`、`adapters`、`installer`、`runtime`、`mcp`、`upstream` 六层；其中 adapter 负责平台特定 projection，runtime / mcp 是共享运行时与控制面。[docs/architecture.md:2](docs/architecture.md:2) [docs/architecture.md:11](docs/architecture.md:11)
- 平台元数据注册在 `harness/core/metadata/platforms.json`；当前仅有 `codex`、`copilot`、`cursor`、`claude-code`，另有 `unsupportedPlatforms.gemini`，没有 `opencode`。[harness/core/metadata/platforms.json:4](harness/core/metadata/platforms.json:4) [harness/core/metadata/platforms.json:11](harness/core/metadata/platforms.json:11)
- `harness/adapters/` 下只有四个平台 manifest：`claude-code`、`codex`、`copilot`、`cursor`；OpenCode 没有 adapter 目录。[docs/architecture.md:15](docs/architecture.md:15)
- installer 的 `loadAdapter()` 直接从 `harness/adapters/<target>/manifest.json` 读取目标适配器，因此未注册/无 manifest 的平台不能直接被 adopt。[harness/installer/lib/adapters.mjs:44](harness/installer/lib/adapters.mjs:44)

### Cursor 支持链路（仓库实证）
- Cursor adapter 明确把入口文件定义为 `.cursor/rules/harness.mdc`，并为 `superpowers` 与 `planning-with-files` 指定 `materialize` skill projection。[harness/adapters/cursor/manifest.json:1](harness/adapters/cursor/manifest.json:1)
- Cursor 规则模板使用 `.mdc` frontmatter，包含 `description` 与 `alwaysApply: true`，与仓库文档所述规则形态一致。[harness/core/templates/cursor-rule.mdc.hbs:1](harness/core/templates/cursor-rule.mdc.hbs:1)
- Cursor 的平台元数据声明：workspace entry 为 `.cursor/rules/harness.mdc`，skill roots 为 `.agents/skills`，hook roots 为 `.cursor`，并支持 workspace/global 两种 scope。[harness/core/metadata/platforms.json:51](harness/core/metadata/platforms.json:51)
- Cursor planning hooks 配置文件存在，包含 `userPromptSubmit`、`preToolUse`、`postToolUse`、`stop` 四类事件，并写到 `.cursor/hooks.json`。[harness/core/hooks/planning-with-files/cursor-hooks.json:1](harness/core/hooks/planning-with-files/cursor-hooks.json:1)
- Cursor superpowers hooks 配置文件存在，当前只注入 `sessionStart` 到 `.cursor/hooks.json`。[harness/core/hooks/superpowers/cursor-hooks.json:1](harness/core/hooks/superpowers/cursor-hooks.json:1)
- 安装文档明确写出：Cursor workspace 写 `.cursor/rules/harness.mdc`；user-global 只投影 skills；共享 skill roots 为 `.agents/skills` / `~/.agents/skills`；`.cursor/skills` 仍被视为官方兼容发现路径，但 Harness 不再复制一份 Cursor 专属 skill tree。[docs/install/cursor.md:2](docs/install/cursor.md:2) [docs/install/cursor.md:10](docs/install/cursor.md:10) [docs/install/cursor.md:18](docs/install/cursor.md:18) [docs/install/cursor.md:20](docs/install/cursor.md:20)

### Cursor 支持链路（实测）
- `./scripts/harness doctor --check-only` 在当前仓库返回 `Harness check passed`，并把 Cursor 的 hook evidence 标为：`planning-with-files` = `config=verified, payload=not-measured, runtime=not-measured`；`superpowers` = `config=verified, payload=local-payload-verified, runtime=not-measured`。这证明当前 harness 能验证 Cursor 的配置与部分 payload，但没有运行时调用证据。
- `tests/adapters/sync-hooks.test.mjs` 中，`sync installs cursor planning hooks when hookMode is on` 通过，证明 sync 会真正写出 `.cursor/hooks.json` 与 `.cursor/hooks/task-scoped-hook.sh`。[tests/adapters/sync-hooks.test.mjs:32](tests/adapters/sync-hooks.test.mjs:32)
- `tests/adapters/templates.test.mjs` 中 `renderEntry keeps the always-on core profile thin across supported targets` 覆盖 `cursor`，证明 Cursor entry 可被渲染且在支持目标列表内。[tests/adapters/templates.test.mjs:15](tests/adapters/templates.test.mjs:15)
- 运行 targeted adapter tests 时，`sync-hooks.test.mjs` 与 `templates.test.mjs` 的 Cursor 相关用例通过；但 `hook-projection.test.mjs` 中 Cursor / Codex / Copilot / Claude 的多个 hook-projection 断言失败，失败根因是 `scriptSourcePaths` 实际多了 `harness/core/hooks/runtime-hook-evidence.sh`，说明测试期望已落后于当前实现，而不是 Cursor 专属功能被单独破坏。[tests/adapters/hook-projection.test.mjs:18](tests/adapters/hook-projection.test.mjs:18) [tests/adapters/hook-projection.test.mjs:152](tests/adapters/hook-projection.test.mjs:152)

### Cursor 官方文档侧证（仓库内官方引用）
- 平台支持文档明确写到：Cursor native hooks 已官方支持；Claude-compatible hooks 还要求 Third-party skills feature。[docs/install/platform-support.md:21](docs/install/platform-support.md:21)
- Cursor 安装文档明确声称“Cursor official docs list `.agents/skills` and `~/.agents/skills` as auto-discovered skill directories”，并同时列出 `.cursor/skills` / `~/.cursor/skills` 仍是官方 discovery roots；Harness 选择只用共享的 `.agents/skills`。[docs/install/cursor.md:18](docs/install/cursor.md:18) [docs/install/cursor.md:20](docs/install/cursor.md:20)
- 由于本次会话的外部 web-reader/search MCP 出现 429 或无可用正文返回，我无法在本会话里直接抓到 Cursor 官网页面正文；因此关于 Cursor 官方支持细节，我只接受仓库里已落地且明确标注为 official docs 的引用，不进一步扩张结论。

### OpenCode adoptability（仓库实证）
- 当前仓库没有 `opencode` 平台注册，也没有 `harness/adapters/opencode/manifest.json`，因此 installer 不能把 OpenCode 当现成 target 使用。[harness/core/metadata/platforms.json:11](harness/core/metadata/platforms.json:11) [harness/installer/lib/adapters.mjs:44](harness/installer/lib/adapters.mjs:44)
- Adoption starter kit 只提供 `minimal-global`、`full-local`、`cloud-dev` 三类 adoption profile，适用对象仍是当前支持的平台，没有 OpenCode adoption 流程。[docs/install/adoption-starter-kit.md:5](docs/install/adoption-starter-kit.md:5)

### OpenCode 官方文档 / 官方仓库侧证
- 仓库 vendored 的 OpenCode 官方接入文档 `harness/upstream/superpowers/docs/README.opencode.md` 说明 OpenCode 通过 `opencode.json` 的 `plugin` 数组安装 git-backed 插件；project skills 在 `.opencode/skills/`，personal skills 在 `~/.config/opencode/skills/`；bootstrap 通过 `experimental.chat.system.transform` 和 `config` hooks 完成；技能调用依赖 OpenCode 原生 `skill` tool。[harness/upstream/superpowers/docs/README.opencode.md:6](harness/upstream/superpowers/docs/README.opencode.md:6) [harness/upstream/superpowers/docs/README.opencode.md:57](harness/upstream/superpowers/docs/README.opencode.md:57) [harness/upstream/superpowers/docs/README.opencode.md:76](harness/upstream/superpowers/docs/README.opencode.md:76) [harness/upstream/superpowers/docs/README.opencode.md:97](harness/upstream/superpowers/docs/README.opencode.md:97)
- 上游设计文档 `harness/upstream/superpowers/docs/plans/2025-11-22-opencode-support-design.md` 将 OpenCode 定义为“JavaScript/TypeScript plugins with event hooks and custom tools API”，并明确标注为 `Status: Design Complete, Awaiting Implementation`；这说明 OpenCode 支持方案在上游有设计，但在本仓库当前 harness 中尚未实现。[harness/upstream/superpowers/docs/plans/2025-11-22-opencode-support-design.md:1](harness/upstream/superpowers/docs/plans/2025-11-22-opencode-support-design.md:1) [harness/upstream/superpowers/docs/plans/2025-11-22-opencode-support-design.md:16](harness/upstream/superpowers/docs/plans/2025-11-22-opencode-support-design.md:16)

### 当前缺陷与验证盲区
- Cursor 目前的最大盲区不是“没有 projection”，而是“缺运行时证据”：当前 `doctor` 只能证明配置已写入、部分 payload 已本地验证，但不能证明在真实 Cursor 会话里 hooks/skills 确实被触发。
- Hook projection 相关测试有一组过时断言，当前实现新增了 `runtime-hook-evidence.sh` 后，若不更新预期，会造成多平台 adapter tests 红灯；这削弱了“测试能精确描述现状”的可信度，但不等于 Cursor 本身不支持。
- OpenCode 不是零改造可接入：当前 harness 可以复用 policy、skills 内容与部分 installer/runtime 共享层，但缺少平台注册、adapter manifest、以及匹配 OpenCode plugin / hooks / tool model 的特定实现。
