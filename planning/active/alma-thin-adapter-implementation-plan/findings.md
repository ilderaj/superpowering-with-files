# Findings

## Requirements
- 用户要把 Alma 适配的 implementation plan 落成 MD 文档。
- 本轮只出 plan，供 review，不执行实现。
- Alma 适配必须是插件式、可插拔、可整体删除。
- 原有 Codex / Claude Code / Cursor / Copilot 方案要保持干净。
- 需要额外回答：真最小版是否足以让 Alma 用 planning-with-files 处理所有 tracked tasks，并在深度任务时走 superpowers。

## Research Findings
- 当前 installer-managed targets 只有 `codex`、`copilot`、`cursor`、`claude-code`，`docs/install/platform-support.md` 明确如此。
- `harness/core/metadata/platforms.json` 是 target 注册入口；`harness/installer/lib/paths.mjs` 还包含 target root 的硬编码映射。
- 每个平台都通过 `harness/adapters/<target>/manifest.json` + template + platform override 组合完成 entry projection。
- `sync` 的主流程会统一调用 `planSkillProjections()` 与 `planHookProjections()`；因此 Alma 一旦变成正式 target，skills / hooks 的兼容策略就要考虑。
- `hook-projection.mjs` 目前是平台白名单模式，不包含 Alma。
- MCP read-only 能暴露 harness 状态、doctor、summary、verify 等能力，但不会安装规则、同步规则、写 progress、打 checkpoint，也不会覆盖 Alma 的更高优先级系统行为。

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| 推荐先做薄 adapter（metadata + paths + adapter manifest + template + override + docs + tests） | 改动面最小，最容易删除，最不污染现有体系 |
| 将 hooks 与 full 写能力留到后续阶段 | 第一版只要做到 target 识别与 entry projection 即可 |
| 将 skills 深度兼容列为 P1 而非 P0 | 当前 `sync` 架构会碰到 skills，但最好延后到 adapter 稳定之后 |
| 将“真最小版”的能力界定为规则感知而非规则强制执行 | 只读 MCP 不具备强执行能力 |

## Issues Encountered
| Issue | Resolution |
|-------|------------|
| `sync` 会统一规划 skill projections，导致“完全不碰 skills”在正式 target 模式下未必可行 | 在计划里将 skills compatibility 标记为 P1，并建议首版先控制为最小入口适配 |
| 现阶段 Alma 没有在仓库里出现明确原生 entry path 规范 | 在计划里把 entry path 作为待 review 的关键决策点 |

## Resources
- `docs/install/platform-support.md`
- `harness/core/metadata/platforms.json`
- `harness/installer/lib/paths.mjs`
- `harness/adapters/codex/manifest.json`
- `harness/adapters/claude-code/manifest.json`
- `harness/adapters/copilot/manifest.json`
- `harness/adapters/cursor/manifest.json`
- `harness/installer/lib/adapters.mjs`
- `harness/installer/commands/install.mjs`
- `harness/installer/commands/sync.mjs`
- `harness/installer/lib/hook-projection.mjs`
- `harness/core/skills/index.json`

## Visual/Browser Findings
- 无。
