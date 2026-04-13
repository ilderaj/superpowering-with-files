# Findings & Decisions

## Requirements

- 全面审计 installation structure、entry files 路径、skills projection、hooks projection、upstream/updates。
- 查阅 Codex、GitHub Copilot、Cursor、Claude Code 官方文档或 API 文档。
- 重点确认 workspace 与 user-global 路径和前缀差异，尤其是 GitHub Copilot。
- 确认链接、路径格式、文件夹分类、命名是否符合要求。
- 先出 Plans；若需要优化更新，不直接执行实现更新。

## Existing Task Context

- `planning/active/copilot-instructions-path/` 记录了前次 Copilot 修正：
  - workspace entry: `.github/copilot-instructions.md`
  - user-global entry: `~/.copilot/instructions/harness.instructions.md`
  - user-global `*.instructions.md` 需要 `applyTo: "**"` frontmatter 才能自动应用。
- `planning/active/cross-ide-hooks-projection/` 记录了当前 entry + skills + hooks projection 的实现历史：
  - skills projection 已接入 `sync`、`doctor`、`status`。
  - hooks 为 opt-in，`hookMode: on` 时才投影。
  - Codex hooks 当前标记为 unsupported，不伪造 hook adapter。
  - Copilot `planning-with-files` 使用 materialize，不使用 symlink。

## Research Findings

- VS Code/GitHub Copilot custom instructions 官方文档确认：
  - workspace-wide instructions: `.github/copilot-instructions.md`
  - scoped instruction files: `.instructions.md`
  - default workspace instruction folder: `.github/instructions`
  - user profile instruction files存在，`*.instructions.md` 需要 `applyTo` 才能自动应用。
- VS Code/GitHub Copilot Agent Skills 官方文档确认：
  - project skills 默认目录包括 `.github/skills/`、`.claude/skills/`、`.agents/skills/`
  - personal skills 默认目录包括 `~/.copilot/skills/`、`~/.claude/skills/`、`~/.agents/skills/`
  - 每个 skill 是目录，包含 required `SKILL.md`。
- VS Code/GitHub Copilot hooks 官方文档确认：
  - workspace hook JSON 默认位于 `.github/hooks/*.json`
  - user hook JSON 默认位于 `~/.copilot/hooks`
  - VS Code 使用 PascalCase 事件名，但会解析 Copilot CLI lowerCamelCase hook config 并转换为 PascalCase。
  - `bash` command property 会映射到 macOS/Linux OS-specific command。
- Cursor 官方文档确认：
  - Project Rules 位于 `.cursor/rules`，规则文件是 `.mdc` 格式，可用 `alwaysApply`。
  - Cursor 支持项目根和子目录 `AGENTS.md`。
  - User Rules 是设置层面的全局规则，不是 `~/.cursor/rules/*.mdc` 文件系统入口。
  - Agent Skills 默认从 `.agents/skills/`、`.cursor/skills/`、`~/.cursor/skills/` 加载，并兼容 `.claude/skills/`、`.codex/skills/`、`~/.claude/skills/`、`~/.codex/skills/`。
- Claude Code 官方文档确认：
  - project instructions 可放 `./CLAUDE.md` 或 `./.claude/CLAUDE.md`
  - user instructions 位于 `~/.claude/CLAUDE.md`
  - skills 位于 `~/.claude/skills/<skill-name>/SKILL.md` 或 `.claude/skills/<skill-name>/SKILL.md`
  - hooks 通过 settings JSON 配置，常见位置包括 `~/.claude/settings.json`、`.claude/settings.json`、`.claude/settings.local.json`；plugin hooks 可来自 `hooks/hooks.json`。
- Codex 官方 OpenAI developer docs 页面可定位，但本轮直接抓取 `developers.openai.com/codex/*` 被 403；可用的官方 OpenAI GitHub repo 文档确认 `~/.codex/config.toml` 和 notify hook，但没有在可抓取页面中确认 `.codex/skills` 或 Codex hooks config schema。

## Technical Decisions

| Decision | Rationale |
|----------|-----------|
| 将官方文档事实和本地实现事实分开记录 | 避免把 Harness 自定义约定误判为官方要求 |
| Plans 只提出优化方案，不直接修改代码 | 符合用户明确边界 |
| Copilot 当前修正方向成立 | VS Code/GitHub Copilot 官方文档确认 workspace 在 `.github`，user/profile instructions 在 profile instructions 体系中；当前 `~/.copilot/instructions/harness.instructions.md` 比旧的 `~/.copilot/copilot-instructions.md` 更符合文档 |
| Cursor user-global entry 需要降级 | Cursor 官方文档说明 User Rules 是设置层配置，且迁移文档明确 user rules 不以文件系统形式存储；当前 `~/.cursor/rules/harness.mdc` 没有官方依据 |
| Claude hooks 需要改为 settings JSON | Claude Code 官方文档说明 hooks 配在 settings JSON，当前 `.claude/hooks.json`/`~/.claude/hooks.json` 更像 plugin/upstream 内部文件，不是 project/user settings 入口 |
| Codex 部分保守处理 | 本轮无法抓取 Codex developer 子页全文，只能确认 OpenAI GitHub docs 中的 config/notify 相关事实，不能把 Codex skills/hooks 投影结论写死 |

## Audit Verdicts

### Correct / Keep

- GitHub Copilot workspace entry: `.github/copilot-instructions.md`
- GitHub Copilot user-global entry: `~/.copilot/instructions/harness.instructions.md`
- GitHub Copilot skills: `.github/skills`、`~/.copilot/skills`
- GitHub Copilot hooks: `.github/hooks/*.json`、`~/.copilot/hooks`
- Cursor workspace entry: `.cursor/rules/harness.mdc`
- Cursor skills: `.cursor/skills`、`~/.cursor/skills`
- Claude Code entries: `CLAUDE.md`、`.claude/CLAUDE.md`、`~/.claude/CLAUDE.md`
- Claude Code skills: `.claude/skills`、`~/.claude/skills`

### Needs Update

- Claude Code hooks config target:
  - Current: `.claude/hooks.json`、`~/.claude/hooks.json`
  - Should be: `.claude/settings.json`、`~/.claude/settings.json` with `hooks` field
- Cursor user-global rendered entry:
  - Current: `~/.cursor/rules/harness.mdc`
  - Should be: unsupported/manual user setting; keep only workspace `.cursor/rules/harness.mdc`
- Hook projection merge:
  - Current: valid JSON configs are merged and written directly.
  - Should be: tracked as managed merge projection with manifest/ownership metadata and content validation.
- Health/status:
  - Current: hook checks mostly verify file existence.
  - Should be: verify expected hook entries and script commands exist inside config.
- Upstream/update status:
  - Current: staged/applied timestamps and versions are not surfaced strongly.
  - Should be: update state and status output with fetch/update/sync metadata.

### Evidence Gaps

- Codex entry/skills/hooks official filesystem details need another pass using accessible OpenAI official docs or OpenAI docs MCP. Current implementation may match the Codex app environment, but this audit cannot honestly claim all Codex paths are official documented requirements.
- Cursor hooks path details should be re-confirmed from a clean official docs extraction before changing the Cursor hook implementation. The current `.cursor/hooks.json` model is plausible and matches existing upstream Cursor hook assets, but the official page extraction was incomplete.

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| `fd` 不可用 | 使用 `find`/`rg` 继续审计 |

## Implementation Outcome

- Worktree: `/Users/jared/.config/superpowers/worktrees/HarnessTemplate/codex-cross-ide-projection-fix`
- Branch: `codex/cross-ide-projection-fix`
- Base: `dev @ 729bdee9193e0dacaf361fd97657c12dc4c77a5e`
- Status: implementation complete, not committed
- Verification:
  - `npm run verify`: 93 pass, 0 fail
  - `git diff --check`: pass
  - stale path search across `README.md docs harness` excluding `docs/superpowers/**`: pass
  - final code re-review: approved

## Implemented Decisions

- Cursor user-global rendered entry was removed; workspace `.cursor/rules/harness.mdc` remains and user-global skills still project to `~/.cursor/skills`.
- Claude Code hook config now merges into `.claude/settings.json` / `~/.claude/settings.json`; scripts still materialize under `.claude/hooks/*` / `~/.claude/hooks/*`.
- Hook health now reads hook config/settings JSON, validates Harness-managed hook markers structurally, and distinguishes unreadable vs malformed JSON.
- `sync`, `fetch`, and `update` now record state timestamps and upstream candidate/applied path metadata.
- `status`/`readHarnessHealth` exposes only allowlisted public upstream fields: `candidatePath`, `appliedPath`, `lastFetch`, `lastUpdate`.
- README and install/compatibility/architecture docs were updated to match the corrected platform model.

## Resources

- `/Users/jared/HarnessTemplate/planning/active/copilot-instructions-path/task_plan.md`
- `/Users/jared/HarnessTemplate/planning/active/copilot-instructions-path/findings.md`
- `/Users/jared/HarnessTemplate/planning/active/copilot-instructions-path/progress.md`
- `/Users/jared/HarnessTemplate/planning/active/cross-ide-hooks-projection/task_plan.md`
- `/Users/jared/HarnessTemplate/planning/active/cross-ide-hooks-projection/findings.md`
- `/Users/jared/HarnessTemplate/planning/active/cross-ide-hooks-projection/progress.md`
- https://code.visualstudio.com/docs/copilot/customization/custom-instructions
- https://code.visualstudio.com/docs/copilot/customization/agent-skills
- https://code.visualstudio.com/docs/copilot/customization/hooks
- https://cursor.com/docs/rules
- https://cursor.com/docs/skills
- https://cursor.com/docs/hooks
- https://docs.claude.com/en/docs/claude-code/memory
- https://docs.claude.com/en/docs/claude-code/skills
- https://docs.claude.com/en/docs/claude-code/hooks
- https://docs.claude.com/en/docs/claude-code/settings
- https://github.com/openai/codex/blob/main/docs/config.md
- https://developers.openai.com/codex/

## Visual/Browser Findings

- OpenAI developer Codex 子页面当前对直接抓取返回 403；不能把未抓取全文的 Codex skills/hooks 细节当成已确认事实。
