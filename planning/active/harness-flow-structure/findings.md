# Findings

## Initial Notes
- 待读取：`README.md`、`docs/architecture.md`、`docs/install/*.md`、`harness/installer/lib/*.mjs`、`harness/adapters/*/manifest.json`、`harness/core/templates/*`。

## Workflow Policy
- `harness/core/policy/base.md` 定义混合工作流：Planning with Files 是持久记忆；Superpowers 是可选临时 reasoning 工具。
- 默认不使用 Superpowers。允许使用的条件：架构不清、需求含糊、复杂 debugging、根因不明显、明确要求深度结构化 reasoning。
- Superpowers 使用后必须把 durable decisions 同步回 `planning/active/<task-id>/task_plan.md`、`findings.md`、必要时 `progress.md`。
- Planning with Files lifecycle guard：只有 `Status: closed` 且 `Archive Eligible: yes` 才能 archive。所有阶段完成不等于可归档。

## Entry File Projection
- `install` 只写 `.harness/state.json`，记录 scope、projectionMode、targets 和目标 paths。
- `sync` 读取 state，为 enabled targets 渲染入口规则文件，并用 `writeRenderedFile` 替换目标路径。
- `writeRenderedFile` 会删除旧目标并写入真实文件，不是硬链接或软链接。
- 目标路径来自 `harness/core/metadata/platforms.json` 和 `harness/installer/lib/paths.mjs`。

## Platform Entry Paths
- Codex workspace: `/Users/jared/HarnessTemplate/AGENTS.md`
- Codex user-global: `/Users/jared/.codex/AGENTS.md`
- GitHub Copilot workspace: `/Users/jared/HarnessTemplate/.copilot/copilot-instructions.md`
- GitHub Copilot user-global: `/Users/jared/.copilot/copilot-instructions.md`
- Cursor workspace: `/Users/jared/HarnessTemplate/.cursor/rules/harness.mdc`
- Cursor user-global: `/Users/jared/.cursor/rules/harness.mdc`
- Claude Code workspace: `/Users/jared/HarnessTemplate/CLAUDE.md`
- Claude Code user-global: `/Users/jared/.claude/CLAUDE.md`

## Skill Projection Metadata
- `harness/core/skills/index.json` 定义 `superpowers` baseline 为 `harness/upstream/superpowers/skills`，所有平台策略为 `link`。
- `planning-with-files` baseline 为 `harness/upstream/planning-with-files`，Codex/Cursor/Claude Code 策略为 `link`，Copilot 策略为 `materialize`，并有 `harness/core/skills/patches/copilot-planning-with-files.patch.md`。
- `fs-ops.mjs` 支持 `linkPath` 软链接和 `materializeFile` 复制实体文件，没有 hard link API。
- 当前 `sync.mjs` 没有调用 `projectionForSkill`、`linkPath` 或 `materializeFile`，所以当前已实现落盘行为主要是入口文件实体渲染；skills 策略属于已建模、已测试但未接入 sync 的投射能力。

## Verification
- `node --test tests/installer/paths.test.mjs tests/adapters/skill-projection.test.mjs tests/adapters/sync.test.mjs` 通过，8 个测试全部 pass。

## README Integration
- README 已重构为：简介、Quick Start、Workflow、Installation Structure、Entry Files、Skill Projection Metadata、Common Commands、Documentation。
- 两张 Mermaid 图已整合进 README：运行时治理流程图、安装结构图。
- 保留关键 caveat：当前 `sync` 只写规则入口实体文件，skill filesystem projection 尚未接入；没有 hard-link 实现。
