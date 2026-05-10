# Findings & Decisions

## Requirements
- 详细研究 Cursor 官方文档。
- Cursor 能力判断以官方文档为唯一事实源。
- 判断 Cursor 是否已经支持 `.agents/skills`。
- 如果支持，判断是否可以合并 Cursor、Copilot 和 Codex 的 skill projection。
- 如果可以，产出详细 implementation plan。
- 不执行 plan，先交给用户 review。
- 追加要求：修复 planning files 的时间头回归，不能只修当前文档内容；必须定位生成逻辑、添加回归测试，并反复验证到不会再出现只有日期和 `UTC+8` 的格式。

## Research Findings
- 当前 `planning/active/cursor-skill-projection-consolidation/progress.md` 复现了缺陷：`## Session: 2026-05-10 UTC+8`、`- **Started:** 2026-05-10 UTC+8`、Error Log 时间戳均缺少 `HH:mm:ss`。
- 仓库中存在正确格式样例，例如其他 active progress 文件使用 `YYYY-MM-DD HH:mm:ss UTC+8`，说明目标格式不是未知，而是当前生成路径退化或缺少守护测试。
- `https://docs.cursor.com/context/skills` 和 `https://docs.cursor.com/en/context/skills` 会重定向到 `https://cursor.com/docs`；Cursor 官方文档主域名当前为 `cursor.com/docs`。
- `https://cursor.com/docs` 的 “Customize Cursor” 入口文案明确提到 “Use rules, skills, and prompts that match how your team works”，链接指向 `https://cursor.com/docs/rules`。
- `https://cursor.com/docs/rules` 明确描述 Rules，并列出四类规则：Project Rules、User Rules、Team Rules、AGENTS.md。
- `https://cursor.com/docs/rules` 明确说明 Project Rules 存放在 `.cursor/rules`，`AGENTS.md` 可放在项目根目录和子目录。
- `https://cursor.com/docs/context/skills` 页面存在但正文抽取失败；需要继续从官方 HTML/静态数据确认 skills 正文。
- `https://cursor.com/docs/skills` 是 Cursor 官方 Agent Skills 文档的 canonical 页面。
- Cursor 官方文档定义 Agent Skills 为 “open standard for extending AI agents”，用于包装 domain-specific knowledge、workflows、scripts、templates 和 references。
- Cursor 官方文档明确说 Cursor 启动时会从 skill directories 自动发现 skills，并由 Agent 根据上下文决定相关性；也支持在 Agent chat 中输入 `/` 手动调用。
- Cursor 官方文档明确列出的自动加载路径包括 `.agents/skills/`、`.cursor/skills/`、`~/.agents/skills/`、`~/.cursor/skills/`。
- Cursor 官方文档明确说为了兼容性还会从 Claude 和 Codex 目录加载 skills：`.claude/skills/`、`.codex/skills/`、`~/.claude/skills/`、`~/.codex/skills/`。
- Cursor 官方文档明确每个 skill 应是包含 `SKILL.md` 的文件夹，且 `SKILL.md` 使用 YAML frontmatter；必填字段为 `name` 和 `description`。
- Cursor 官方文档明确 `paths` 是新的文件作用域字段；legacy `globs` 仍作为旧 skills fallback 接受，但新 skills 应使用 `paths`。
- Cursor 官方文档明确支持 `disable-model-invocation: true`，用于让 skill 只在 `/skill-name` 手动调用时进入上下文。
- Cursor 官方文档明确支持 `scripts/`、`references/`、`assets/` 可选目录。
- Cursor 官方文档明确 Cursor 会递归扫描 skill root，并会拾取任意 `SKILL.md`；也会发现仓库子目录中的 `.cursor/skills/` 或 `.agents/skills/`，并自动按该子目录作用域限制。
- 当前仓库的 Cursor/Copilot/Codex skill projection 根路径来自 `harness/core/metadata/platforms.json` 的 `skillRoots`。
- 当前 `harness/core/metadata/platforms.json` 中 Codex 和 Copilot 都使用 `.agents/skills` / `~/.agents/skills`，Cursor 使用 `.cursor/skills` / `~/.cursor/skills`。
- `harness/installer/lib/paths.mjs` 只按 metadata 解析 skill root；没有 hard-coded Cursor skill path，适合通过 metadata 收敛。
- `harness/installer/lib/skill-projection.mjs` 的 `coalesceSkillProjections` 已能按相同 `targetPath` 合并多个 target 的 skill projection，并合并 patch 列表。
- `harness/installer/commands/sync.mjs` 已在所有 target 的 raw skill writes 收集后调用 `coalesceSkillProjections`，因此 Cursor 改到 `.agents/skills` 后可自然与 Codex/Copilot 合并。
- `tests/adapters/skill-projection.test.mjs` 当前多处断言 Cursor skill target path 为 `.cursor/skills/...`，需要更新为 `.agents/skills/...`，并新增三 target coalesce 断言。
- `tests/adapters/sync-skills.test.mjs` 当前已有 Codex+Copilot coalesce 测试；需要扩展到 Codex+Copilot+Cursor，并更新 all-target planning skill path expectation。
- `tests/installer/paths.test.mjs` 当前断言 Cursor skill target roots 为 `.cursor/skills` / `~/.cursor/skills`，需要改为 `.agents/skills` / `~/.agents/skills`。
- `docs/architecture.md` 当前仍写着 Cursor stays on `.cursor/skills` until official contract is re-verified；该条件已被官方 docs research 满足，需要更新。
- `docs/install/cursor.md` 已承认 Cursor 官方 docs 同时列出 `.cursor/skills` 和 `.agents/skills`，但仍称 Harness 以 `.cursor/skills` 为 primary；需要更新为共享 `.agents/skills` primary，并将 `.cursor/skills` 表述为官方兼容发现路径。
- 当前仓库同时跟踪 `.agents/skills` 和 `.cursor/skills` 两套投影目录，各约 412 个 tracked files；实现阶段若归并 projection，应包含删除 tracked `.cursor/skills` 生成副本或由 sync/manifest 流程清理 stale projection 的明确步骤。
- `.harness/` 被 `.gitignore` 忽略，因此 projection manifest 不是 repo 文档的一部分；测试需要通过 fixture state/manifest 验证合并行为。

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| Cursor 支持判断只引用 docs.cursor.com | 用户明确限定官方文档唯一事实源 |
| 初步判断 Cursor 已支持 `.agents/skills` | Cursor 官方 `https://cursor.com/docs/skills` 明确将 `.agents/skills/` 列为 Project-level 自动加载目录 |
| 建议归并 Cursor、Copilot、Codex skill projection 到 `.agents/skills` / `~/.agents/skills` | Cursor 官方文档已支持共享路径；现有 coalesce 机制可直接减少重复 projection，Claude Code 仍保留 `.claude/skills` |
| 不建议改变 Cursor rule entry 或 hook root | 官方 skills 支持只影响 skill discovery；Cursor rules 仍是 `.cursor/rules`，hooks 仍是 `.cursor` adapter surface |
| 建议泛化 Copilot planning-with-files root patch | 三个 target 共享同一个 materialized skill 后，shared copy 应尽量保持 target-neutral；保留 `GITHUB_COPILOT_SKILL_ROOT` 作为兼容覆盖 |

## Companion Plan
- Path: docs/superpowers/plans/2026-05-10-cursor-skill-projection-consolidation.md
- Summary: 详细实现计划已覆盖官方事实、metadata 变更、shared planning root patch、`.cursor/skills` tracked 副本移除、测试和文档更新。
- Sync-back status: complete

## Issues Encountered
| Issue | Resolution |
|-------|------------|
| 当前 shell 环境没有 `rg`，导致第一次 HTML 文本提取失败 | 改用系统自带 `grep` 继续只针对 Cursor 官方页面提取内容 |
| 当前 planning 时间头回归为仅日期 | 正在按系统化调试流程复现、定位生成路径并补自动化回归测试 |

## Destructive Operations Log
| Command | Target | Checkpoint | Rollback |
|---------|--------|------------|----------|

## Resources
- https://cursor.com/docs
- https://cursor.com/docs/rules
- https://cursor.com/docs/context/skills
- https://cursor.com/docs/skills
- docs/superpowers/plans/2026-05-10-cursor-skill-projection-consolidation.md

## Visual/Browser Findings
- 不适用。

## Findings Record: 2026-05-10 22:10:28 UTC+8

### Timestamp Root Cause

-
