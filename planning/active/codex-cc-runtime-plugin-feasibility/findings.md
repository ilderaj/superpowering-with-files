# 发现与决策：Codex / Claude Code Runtime Plugin 可行性分析

## Findings Record: 2026-05-31 11:35:44 UTC+8

- 用户明确要求作为 tracked planning 处理，目标是输出至少兼容 Codex / Claude Code 的、容易分发、标准、可扩展、易协作的 runtime 类 harness plugin 可行性分析。
- 本任务不复用已有 active task，使用独立任务目录 `planning/active/codex-cc-runtime-plugin-feasibility/`。
- 现有相关任务显示项目已经具备三块可复用基础：Codex adapter/evidence 审计、Claude Code evidence hardening、MCP runtime facade。
- 初步架构假设：最佳形态可能不是把项目直接变成某一个平台的“原生 plugin”，而是抽出 `runtime core + MCP/control-plane + platform adapter pack + distribution manifest` 的组合包。

## 待核对事实
- 当前仓库是否已经有可直接打包的 runtime/service layer、MCP server、registry/policy、CLI install 命令和 adapter manifests。
- Codex 当前对插件、skills、hooks、AGENTS.md、MCP 或类似 extension 的支持边界。
- Claude Code 当前对 plugin、slash commands、hooks、MCP、settings 分发的支持边界。

## Findings Record: 2026-05-31 11:35:44 UTC+8

- 仓库当前是六层架构：`harness/core`、`harness/adapters`、`harness/installer`、`harness/runtime`、`harness/mcp`、`harness/upstream`。
- `package.json` 仍是 `"private": true`，版本 `0.1.0`，尚不是可直接 npm 分发的公开 package。
- 当前已有 `@modelcontextprotocol/sdk`、`zod`、`ws` 依赖和 `npm run test:mcp` / `npm run verify`，说明 MCP runtime facade 已经进入实现和测试面。
- `harness/runtime/**` 已包含 root policy、doctor/status/summary/verify/sync plan、approval token、safe apply、audit receipt、registry/policy evaluation 等 runtime service。
- `harness/mcp/**` 已暴露 stdio/HTTP transport、read-only tools、write tools、registry tools 和 resources；这非常接近 runtime plugin control plane。
- Codex 与 Claude Code adapter manifest 当前很薄：主要声明 `AGENTS.md` / `CLAUDE.md` 模板、platform override、workspace/global entry、`superpowers` 与 `planning-with-files` 两个 materialized skills。它们是 projection adapters，不是完整 package/plugin manifests。
- `harness/core/skills/index.json` 是当前 capability registry 的雏形，已经能声明 skill source、baseline path、projection strategy、patches 与 hook configs。
- `harness/core/registry/schema.json` 目前很宽松，`payload` 未定义强 schema，`additionalProperties: true`；适合作为早期 registry，但还达不到标准化可协作插件生态的强契约。
- 测试面覆盖 adapter、installer、hooks、MCP、安全、automation；这对 runtime plugin 产品化很有利。

## Findings Record: 2026-05-31 11:35:44 UTC+8

### 外部平台事实

- Codex 官方文档显示 plugins 用于把 skills、apps 和 MCP servers 打包为 Codex 可复用 workflow；因此 Codex plugin 不是只放 prompt 的目录，而是可承载 runtime control plane 的分发单元。
- Codex plugin build 文档显示 plugin-bundled hooks 已是官方路径：默认 `hooks/hooks.json`，或在 `.codex-plugin/plugin.json` 中通过 `hooks` 指向路径/数组/inline object；plugin hook commands 会收到 `PLUGIN_ROOT` 和 `PLUGIN_DATA`。
- 本机 `codex-cli 0.130.0` 显示 `plugins stable true`、`hooks stable true`，但 `plugin_hooks under development false`；这说明“基础 plugin + 全局/project hooks”可用，plugin hook runtime 的具体本机启用状态仍需要真实安装 smoke test，不应过度声明。
- Codex 官方 MCP 文档支持 plugin-provided MCP servers，并允许用户通过 `plugins.<plugin>.mcp_servers.<server>` 控制启用与 tool approval policy。
- Codex `AGENTS.md` 官方文档确认 Codex 会读取 global 与 project scope 的 `AGENTS.md`/override 层级；现有 adapter 方向正确。
- OpenAI Skills 文档把 skill 定义为带 `SKILL.md` manifest 的 versioned bundle，并明确平台把 skill `name`、`description`、`path` 放进上下文供模型决定是否读取；现有 skill 投影符合这个模型，但 package 化时需要收敛 bundle 大小和 front matter 质量。
- Claude Code 官方插件文档显示插件可共享 skills、agents、hooks、MCP servers，适合团队/社区分发、版本发布和 marketplace；standalone `.claude/` 更适合项目或个人实验。
- Claude Code plugin root 必须包含 `.claude-plugin/plugin.json`；可包含 `skills/`、`commands/`、`agents/`、`hooks/`、`.mcp.json`、`bin/`、`settings.json` 等组件。
- Claude Code marketplace 插件会复制到 `~/.claude/plugins/cache`，安装后不能引用 plugin root 外部文件；这会强制 Harness plugin 变成自包含包，不能依赖当前 repo 相对路径。
- Claude Code plugin scope 支持 user/project/local/managed；project scope 写入 `.claude/settings.json`，团队共享但会经过 trust gate，MCP/LSP/monitors 等代码执行组件还有额外限制。

### 当前仓库状态验证

- `npm run test:mcp` 通过：21 tests passed，证明 MCP facade 当前不是空壳。
- `./scripts/harness doctor --check-only` 失败，失败原因不是 runtime facade 本身，而是当前 checkout/adoption 状态存在 companion plan 同步问题、Claude Code user-global hook config 缺失、多 active task 测量受限、Codex user-global full profile 较重等。
- `./scripts/harness sync --dry-run` 返回 `create=89 update=0 stale=89`，说明当前 user-global desired projection 与实际状态存在明显漂移；如果要发 runtime plugin，需要先把安装/adoption 状态和发布 fixture 分离。
- `npm pack --dry-run --json` 生成的 tarball 约 7.6 MB packed / 16.3 MB unpacked，包含 2020 个文件，并且因为没有 `.npmignore`，把 `.agents/skills`、`planning/archive`、tests、reports 等大量开发/历史状态打进去。这是当前分发阻塞项之一。
- `package.json` 为 `"private": true` 且没有 `bin` 字段；当前不能作为标准 npm CLI/runtime package 直接发布。

### 可行性结论

- 总体可行性：高。项目已经有足够核心能力形成 runtime harness plugin：统一 policy source、平台 adapter、skill projection、hook projection/evidence、runtime services、MCP facade、approval token、receipt ledger、registry/policy evaluation、测试套件。
- 最优架构不是“把整个仓库原样做成 Codex plugin 或 Claude plugin”，而是拆成一个平台中立 runtime package，加两个薄 plugin wrapper：
  - `@superpowering-with-files/harness-runtime`：Node runtime、CLI、MCP server、policy/registry schema、safe write/approval/receipt。
  - `@superpowering-with-files/codex-plugin` 或 `plugins/codex/`：`.codex-plugin/plugin.json`、skills、hooks、mcpServers、minimal AGENTS guidance。
  - `@superpowering-with-files/claude-code-plugin` 或 `plugins/claude-code/`：`.claude-plugin/plugin.json`、skills、hooks、`.mcp.json`、agents/commands 可选、minimal CLAUDE guidance。
  - `@superpowering-with-files/plugin-kit`：共享 schema、manifest generator、adapter conformance tests、fixture pack。
- “runtime 类 harness plugin”的本体应是 MCP/control-plane + local policy runtime；AGENTS.md/CLAUDE.md/skills/hooks 是 platform activation surfaces，不应承载核心状态机。

### 推荐标准包结构

```text
packages/
  harness-runtime/
    package.json
    bin/harness
    harness/runtime/**
    harness/mcp/**
    harness/core/{policy,registry,metadata,templates,skills}
  plugin-kit/
    schemas/harness-plugin.schema.json
    src/build-codex-plugin.mjs
    src/build-claude-plugin.mjs
    tests/conformance/**
plugins/
  codex/
    .codex-plugin/plugin.json
    skills/**
    hooks/hooks.json
    hooks/**
    mcp/harness-runtime.mjs
    AGENTS.md
  claude-code/
    .claude-plugin/plugin.json
    skills/**
    hooks/hooks.json
    .mcp.json
    bin/harness
    CLAUDE.md
```

### 标准 manifest 应补足的字段

- identity：`name`、`version`、`description`、`author`、`license`、`repository`、`homepage`。
- compatibility：`targets`、最低 Codex/Claude Code 版本、Node 版本、OS 支持、MCP transport 支持。
- components：skills、hooks、mcp servers、commands/agents/bin/settings 的文件路径与 hash。
- capabilities：read-only tools、write tools、requires approval、writes files、network/no-network、secret handling。
- policy：default profile、allowed roots、managed paths、conflict policy、hook trust requirements。
- evidence：doctor gates、conformance tests、runtime evidence schema、receipt ledger path。
- distribution：package files allowlist、marketplace metadata、signature/digest、upgrade/migration hooks。

### 分阶段路线图

1. M0：发布卫生。添加 `.npmignore` 或 `files` allowlist；移除 package tarball 中的 planning/archive/tests/reports/live projections；加 `bin`；把 root package 从 private repo package 改成 workspace。
2. M1：Runtime package。把 `harness/runtime`、`harness/mcp`、CLI dispatcher、core schema 收敛成可 npm pack 的自包含包；保留 tests 但不发布。
3. M2：Codex plugin wrapper。生成 `.codex-plugin/plugin.json`，声明 skills、MCP server、hooks；用本机 `codex plugin marketplace` / app install path 做真实 smoke test，特别验证 plugin-bundled hooks 是否在当前 build 生效。
4. M3：Claude Code plugin wrapper。生成 `.claude-plugin/plugin.json`、`.mcp.json`、hooks、skills；用 `claude plugin validate` 和 `--plugin-dir` / marketplace-local 流程验证，但当前机器没有 `claude` CLI，需要另一个环境或安装后验证。
5. M4：统一 conformance。编写 `plugin:build`、`plugin:validate`、`plugin:smoke:codex`、`plugin:smoke:claude`，测试技能可发现、MCP 可 handshake、hooks 能本地 payload、runtime evidence 能写 trace。
6. M5：协作与治理。强化 registry schema，签名 policy bundle，支持团队 channel、upgrade migration、receipt review、adoption status。

### 主要风险

- 平台语义漂移：Codex plugin hooks 在官方文档与本机 feature flag 之间仍可能存在差异，必须用 live plugin install smoke test 兜底。
- 自包含约束：Claude marketplace cache 不允许引用 plugin root 外部文件，当前 repo 内部的相对路径和 vendored upstream 需要重新打包。
- 分发污染：当前 `npm pack` 会打入历史 planning、reports、tests 和 projected `.agents`，必须先做发布 allowlist。
- 权限边界：MCP write tools 必须保持 plan/approval/apply/receipt，不能因为 plugin 安装便利而变成 shell wrapper。
- 多平台 hook 信任：Codex plugin hooks、Claude project-scope plugins、MCP servers 都有 trust/approval 门槛；插件只能请求和引导，不应伪装成自动可信。
- 协作状态归属：planning/active 是项目状态，不应该进入通用 plugin 包；runtime plugin 应只提供机制和模板，不能携带当前项目任务记忆。

### 最终判断

- 可以做，而且方向非常顺：本项目已经从“projection harness”进化出 runtime facade，正适合被产品化成 runtime harness plugin。
- 当前不应直接发布整个 repo；应先拆 runtime package 与 platform plugin wrappers。
- 第一版应主打 “local runtime + MCP read-only/write-with-approval + skills/hooks projection + doctor/verify evidence”，不要一开始承诺 cloud/team marketplace 全能力。
- Codex 兼容性成熟度高于历史预期，因为官方 plugin 已覆盖 skills/MCP/hooks；Claude Code plugin 生态也天然匹配，但需要在有 `claude` CLI 的环境跑 validation。
- 真正的产品化难点不是功能能不能做，而是标准化边界：包内容、manifest schema、trust flow、approval/receipt、升级/迁移、团队 policy registry。

## Findings Record: 2026-05-31 11:50:17 UTC+8

### 用户追问

- 用户认可 M0-M5 路线图，并希望实施。
- 实施前需要讨论：
  - package 应该作为当前 workspace/repo 的 release 形式存在，还是独立 repo/workspace。
  - 已经本地 `adopt-global` 的 harness 如何平顺过渡到 plugin。
  - 如果一起考虑 Cursor 和 Copilot plugin 支持，包边界是否需要调整。

### 新增平台事实

- GitHub Copilot 官方文档显示 Agent Skills 支持 Copilot cloud agent、GitHub Copilot CLI、VS Code agent mode；项目 skill roots 可用 `.github/skills`、`.claude/skills`、`.agents/skills`，个人 skill roots 可用 `~/.copilot/skills` 或 `~/.agents/skills`。
- GitHub Copilot cloud agent 支持 MCP tools，但当前官方文档明确 cloud agent 只支持 MCP tools，不支持 MCP resources 或 prompts，且不支持带 OAuth 的 remote MCP servers。
- GitHub Copilot CLI customization 文档把 plugins 描述为可交付 skills、hooks、custom agents、MCP servers 的 package；这说明 Copilot 方向也在收敛到 plugin packaging，但 cloud 与 CLI/VS Code 的 capability matrix 不完全一致。
- Cursor 2.5 changelog 显示 Cursor plugins package skills、subagents、MCP servers、hooks、rules，并可通过 marketplace 或 `/add-plugin` 安装。
- Cursor MCP 文档显示 Cursor 支持 stdio、SSE、Streamable HTTP 三类 MCP transport，并有 extension API 可动态注册 MCP servers。

### Package 边界决策

- 推荐方案：当前 repo 内 monorepo/workspace。
  - 理由：现有 runtime、installer、adapter、MCP、tests、docs、planning 互相强耦合，立即拆 repo 会制造双写和 release drift。
  - 形式：root repo 继续叫 `superpowering-with-files`，改成 npm workspace；新增 `packages/harness-runtime`、`packages/plugin-kit`、`plugins/codex`、`plugins/claude-code`，后续加 `plugins/cursor`、`plugins/copilot`。
  - release：从同一个 repo 的 CI 生成 npm tarball、Codex plugin artifact、Claude plugin artifact、Cursor/Copilot plugin artifact；tag 与 changelog 统一。
- 暂不推荐独立 repo。
  - 只有在 runtime API 稳定、有外部贡献者独立消费、或 marketplace 要求独立 repo 时，再拆 `harness-runtime` 或 `plugins/*` 到独立 repo。
  - 如果未来拆 repo，应把当前 repo 保留为 integration/conformance repo，避免平台 wrapper 各自漂移。

### Global adoption 到 plugin adoption 的迁移策略

- 迁移原则：plugin adoption 先与 global adoption 并存，再逐步切换 source-of-truth；不要一上来删除 `~/.codex`、`~/.claude`、`~/.agents`、`~/.copilot`、`~/.cursor`。
- 新增迁移命令建议：
  - `harness plugin doctor`：检测当前 global projections、plugin installs、hook trust、MCP config 和重复 skill roots。
  - `harness plugin migrate --target=codex --scope=user --dry-run`：生成迁移计划，不写文件。
  - `harness plugin migrate --adopt-existing`：把现有 projection 识别为已安装 runtime 的状态来源，避免重装。
  - `harness plugin rollback`：恢复到 pre-plugin global projection。
- 迁移阶段：
  1. Baseline capture：读取 `.harness/state.json`、`~/.codex/AGENTS.md`、`~/.codex/hooks.json`、`~/.agents/skills`、`~/.claude/settings.json`、`~/.claude/skills` 等，生成 receipt。
  2. Shadow install：安装 plugin 但默认只启用 read-only MCP / skills，不启用写操作和 hooks；doctor 比较 plugin 与 global projection 语义一致性。
  3. Dual-run：保持 global entry files 作为 fallback，同时让 plugin 提供 MCP runtime 和 namespaced skills；避免重复 hooks。
  4. Cutover：对每个 target 单独切换 source-of-truth；Codex/Claude 先，Cursor/Copilot 后。
  5. Cleanup：只有 doctor 连续通过且用户确认后，清理或降级旧 global projections。
- 对当前用户状态的含义：现有 `adopt-global` 不应该被视作阻碍，而应该作为 migration seed；已有 global harness state 可以成为 plugin 初次配置的默认 profile。

### Cursor / Copilot 一起考虑后的设计调整

- 不应把项目命名或目录结构绑定为 `codex-claude-plugin`；应该叫 `harness-runtime` + `platform plugin wrappers`。
- Plugin wrapper 层应抽象为 `target manifest generator`，支持：
  - Codex：`.codex-plugin/plugin.json`、skills、hooks、mcpServers、AGENTS guidance。
  - Claude Code：`.claude-plugin/plugin.json`、skills、hooks、`.mcp.json`、agents/commands/bin/settings。
  - Cursor：rules、skills、hooks、MCP servers、subagents，未来可能 marketplace artifact。
  - Copilot：skills、instructions、hooks、MCP servers、custom agents；cloud agent 只暴露 MCP tools，不依赖 resources/prompts。
- Runtime MCP 工具设计要按最小公共子集分层：
  - `core-read`：status、doctor、active summary、task summary，适合所有 MCP hosts。
  - `plan-only`：sync dry-run、install plan、policy diff，不写文件。
  - `write-with-approval`：sync apply、record progress、checkpoint，只有本地受信环境启用。
  - `host-extended`：resources/prompts/subagents 等仅给支持的 host。

### 推荐实施顺序修正

- M0a：先做 workspace/package boundary，不动用户 global adoption。
- M0b：做 publish allowlist 和 package dry-run contract。
- M1：抽 runtime package，但 CLI 仍兼容 `./scripts/harness`。
- M2：实现 migration inspector，不先做 destructive cleanup。
- M3：Codex/Claude plugin wrappers。
- M4：Cursor/Copilot wrapper design spike；至少生成 manifests，但不一定首发 marketplace。
- M5：统一 conformance + migration smoke。

## 资源
- `planning/active/cc-harness-analysis/`
- `planning/active/codex-harness-capability-audit-20260528/`
- `planning/active/harness-runtime-facade-mcp/`
- `planning/active/codex-cc-runtime-plugin-feasibility/`

## 视觉/浏览器发现
- 暂无。

## Findings Record: 2026-05-31 12:19:03 UTC+8

- 用户要求 companion plan 最终目标包括 GitHub release、版本号 +1、四个支持 IDE 都有 packed plugin artifact，并且这些包能被对应 IDE 直接安装使用。
- 本地 Git tags 最新为 `1.0.5`，root `package.json` 当前为 `0.1.0` 且 `private: true`；计划将 release target 固定为 `1.0.6`，并要求所有 workspace/plugin manifest 统一版本。
- Plan 明确把外部 IDE 安装验证设为 release hard gate：如果某个平台无法在真实或官方文档路径中验证 packed artifact，不能静默发布，必须修复、换环境验证或请求用户 waiver。
- Plan 创建路径：`docs/superpowers/plans/2026-05-31-runtime-harness-plugin-release-plan.md`。

## Findings Record: 2026-05-31 13:48:00 UTC+8

- 隔离 worktree 已创建：`.worktrees/202605310547-codex-cc-runtime-plugin-feasibility-001`，分支 `runtime-plugin/202605310547-codex-cc-runtime-plugin-feasibility-001`，base `dev @ 9cde3890f6fefb94425d09cc45b01366795bb757`。
- Baseline `npm run verify` 通过：431 个 core/installer/adapter/automation tests + 21 个 MCP tests。
- Baseline `npm run test:mcp` 通过：21 tests。
- Baseline `./scripts/harness sync --dry-run` 返回 `create=0 update=0 stale=0 unchanged=0`。
- Baseline `./scripts/harness doctor --check-only` exit 0，输出 `Harness check passed.`；仍提示若干历史 companion-plan metadata warnings，当前作为 release 前需清理或 owner-waive 的治理事项跟踪。

## Findings Record: 2026-05-31 14:00:00 UTC+8

- Codex docs confirm plugins can bundle skills, MCP servers, apps, and hooks. Codex plugin hooks default to `hooks/hooks.json`; bundled MCP servers are configured through `mcpServers`; plugin hook commands receive `PLUGIN_ROOT` and `PLUGIN_DATA`.
- Codex MCP docs confirm Codex supports stdio and Streamable HTTP MCP servers, and installed plugins can bundle MCP servers whose user policy is controlled under `plugins.<plugin>.mcp_servers.<server>`.
- OpenAI Skills docs define skills as versioned bundles with exactly one `SKILL.md`; local shell mode uses local skill file paths, and model skill discovery sees `name`, `description`, and `path`.
- Claude Code docs confirm plugins are for shareable/versioned skills, agents, hooks, and MCP servers; `.claude-plugin/plugin.json` is the manifest and `--plugin-dir` can load a local plugin directory or zip for development.
- Claude Code plugin reference confirms all component directories must live at plugin root, `hooks/hooks.json` is the hook config, `.mcp.json` is the MCP config, `bin/` executables are added to PATH, and `CLAUDE.md` at plugin root is not loaded as project context.
- GitHub Copilot agent skills docs confirm project skill roots include `.github/skills`, `.claude/skills`, and `.agents/skills`, while personal roots include `~/.copilot/skills` and `~/.agents/skills`.
- GitHub Copilot cloud-agent MCP docs confirm the cloud agent supports MCP tools only, not resources/prompts, and does not currently support remote MCP servers that use OAuth.
- GitHub Copilot CLI plugin docs confirm `plugin.json` can declare `agents`, `skills`, `hooks`, and `mcpServers`; plugin-provided skills are loaded after project/personal skills, while plugin MCP configs participate in last-wins precedence.
- Cursor 2.5 first-party changelog confirms Cursor plugins package skills, subagents, MCP servers, hooks, and rules into a single install, discoverable through Cursor Marketplace or `/add-plugin`.
- Route adjustment from companion plan: do not treat Claude plugin-root `CLAUDE.md` as activation evidence. For plugin artifacts, use README/docs plus a `harness` skill for loadable guidance.

## Findings Record: 2026-05-31 13:58:20 UTC+8

- The current repository already has source-of-truth policy, skill, hook, and MCP files; plugin artifacts should be generated from these sources instead of live user-global projection state.
- `planning/active/**` is runtime instance state and must remain excluded from plugin runtime copies and release packages.
- The runtime package source shell should not duplicate the full `harness/` tree in the monorepo; self-contained copies are created during artifact staging/build.
- The first checksum test failure exposed a test fixture error, not a production implementation issue; the corrected SHA-256 for `harness\n` is `c7eacb8ccadb7a650ad4eac69aca2d8bbb57d759d785ee07de32526d7a69c93f`.

## Findings Record: 2026-05-31 14:17:16 UTC+8

- Codex CLI local plugin verification is marketplace-root based. A root-level `marketplace.json` is rejected; the working layout is `<root>/.agents/plugins/marketplace.json` plus `<root>/plugins/<plugin-name>`.
- Codex plugin creator validation required `interface.defaultPrompt`; adding it eliminated the schema failure.
- Claude Code plugin validation passed but initially warned that `interface` is ignored. Removing `interface` from the Claude plugin manifest eliminated the warning.
- Direct MCP wrapper startup failed until runtime dependencies were bundled. Self-contained direct-install plugin artifacts now include `runtime/node_modules` so `runtime/harness/mcp/stdio.mjs` can resolve `@modelcontextprotocol/sdk`, `zod`, `ws`, and transitive dependencies.
- Host CLI install semantics differ by platform: Codex validates via local marketplace, Claude validates plugin directory/archive, Cursor and Copilot support local `--plugin-dir` session loading. Packed `.tgz` artifacts are release assets; some hosts still require unpacking or marketplace/repo indirection for local CLI validation.
- Bundling dependencies increases each compressed artifact to roughly 6-7 MB, which is acceptable for direct-install reliability in this release. Future optimization can replace whole `node_modules` copying with exact dependency closure staging.

## Findings Record: 2026-05-31 14:23:33 UTC+8

- GitHub release `1.0.6` was created from branch `runtime-plugin/202605310547-codex-cc-runtime-plugin-feasibility-001` and is published as a non-draft, non-prerelease release.
- Release asset upload was verified through `gh release view 1.0.6`; all five packed runtime/plugin artifacts plus `manifest.json`, `release-notes.md`, and `SHA256SUMS` are present.
- The release tag currently points at the implementation commit before this post-release planning update; the follow-up planning commit records release metadata for traceability in the PR branch.

## Findings Record: 2026-05-31 14:48:04 UTC+8

- PR #73 review comments correctly identified a functional gap in `packages/plugin-kit/src/build-plugin.mjs`: packed plugins were shipping `hooks/hooks.json` with empty hook arrays, so hook registration succeeded but no planning hook callback could ever run.
- The same review also caught that Codex plugin manifests were omitting `hooks`, which meant Codex would not discover the bundled hook config even after the hook payload was populated.
- The safe remediation is to treat `harness/core/hooks/planning-with-files/*-hooks.json` as the hook source of truth and transform those platform-native configs into plugin-bundled configs by copying referenced scripts and rewriting only the script paths. Re-synthesizing commands in the packer introduced an immediate regression (`CLAUDE_PLUGIN_ROOT` string interpolation at build time), so template inheritance is the lower-risk design.
- Regression coverage now asserts three contracts for every built plugin artifact: hook config contains non-empty entries, bundled commands reference `./hooks/task-scoped-hook.sh`, and no built hook config leaks workspace install paths such as `.codex/hooks/...`, `.claude/hooks/...`, `.cursor/hooks/...`, or `.github/hooks/...`.

## Findings Record: 2026-05-31 16:33:00 UTC+8

- README already listed the traditional per-target install docs, but there was no single entry point for the new packed plugin release artifacts. A dedicated install page is the clearest shape because the packed-plugin workflow crosses release, download, unpack, and IDE-specific loading.
- Current host consumption semantics differ enough that the install guide should be explicit about unpacked-directory workflows:
  - Codex local validation is marketplace-root based and expects `<root>/.agents/plugins/marketplace.json` plus `<root>/plugins/<plugin-name>`.
  - Claude Code can load a local plugin directory with `--plugin-dir` and can validate a plugin root with `claude plugin validate`.
  - Cursor Agent accepts `--plugin-dir` for a local plugin directory.
  - GitHub Copilot CLI accepts `--plugin-dir` for a local plugin directory, while its managed `plugin install` flow is oriented around marketplaces and repositories.
- Because the release assets are `.tgz` archives, the end-user docs need to say plainly that most local IDE flows consume an unpacked plugin directory even when the release distribution format is a tarball.
