# Findings

## Scope

- Jared user-global:
  - `/Users/jared/.codex/AGENTS.md`
  - `/Users/jared/.copilot/instructions/harness.instructions.md`
  - `/Users/jared/.claude/CLAUDE.md`
  - `/Users/jared/.agents/skills/*`
  - `/Users/jared/.copilot/skills/*`
  - `/Users/jared/.claude/skills/*`
  - `/Users/jared/.cursor/skills/*`
- Focus workspaces:
  - `/Users/jared/HarnessTemplate`
  - `/Users/jared/AgentPlugins/agent-plugin-marketplace`
  - `/Users/jared/TypeMint`
  - `/Users/jared/BabyCry`
  - `/Users/jared/lullabyApp`

## Recovered Audit Baseline

- `HarnessTemplate` source policy 和 tests 已支持新的 companion-plan 模型。
- Jared user-global rendered entries 与 projected skills 仍大量停留在旧模型。
- 该任务开始时 Copilot 的 `planning-with-files` 曾存在源码级 companion-plan 语义裂缝；用户现已明确说明这一点已经修复，需要基于当前 `HarnessTemplate` 状态执行 adoption。

## Workspace Classification

### Harness source

- `/Users/jared/HarnessTemplate`
  - 是当前 Harness policy / projection / tests 的 source-of-truth 仓库。
  - 本轮治理不能修改其代码内容，但 adoption 判断必须以它为准。

### Global-baseline consumer

- `/Users/jared/lullabyApp`
  - `AGENTS.md` 明确写明“继承 Jared 全局 Harness baseline”。
  - 只保留项目 delta，明确说不复制通用 `superpowers` 或 `planning-with-files` 规则。
  - 这类仓库应该优先通过“全局对齐 + 最小 delta”完成 adoption。

### Project-canonical autonomous

- `/Users/jared/TypeMint`
- `/Users/jared/BabyCry`
  - 二者 `AGENTS.md` 都声明自己的 canonical 主源在 `.agents/rules/` 等目录。
  - `BabyCry` 还明确说 `.cursor/`、`.claude/` 等只是兼容层，不是长期主源。
  - 这类仓库不应被 Jared 全局 Harness baseline 直接覆盖；只能做 selective adoption。

### Agent Plugin workspace

- `/Users/jared/AgentPlugins/agent-plugin-marketplace`
  - 当前未发现项目级 `AGENTS.md`。
  - 发现的是 marketplace 数据、`plugins/codex--superpowers`、以及已有 `docs/plans/` / `planning/active/` 工作产物。
  - 说明它暂时不在“统一入口文件 adoption”第一批，而更偏向内容仓库/分发仓库治理。

## Duplication / Conflict Findings

### User-global stale baseline

- 执行前，以下 user-global 入口仍是旧 Harness 规则：
  - `/Users/jared/.codex/AGENTS.md`
  - `/Users/jared/.copilot/instructions/harness.instructions.md`
  - `/Users/jared/.claude/CLAUDE.md`
- 执行前，以下 user-global/shared skills 仍是旧 `writing-plans` patch：
  - `/Users/jared/.agents/skills/writing-plans/SKILL.md`
  - `/Users/jared/.copilot/skills/writing-plans/SKILL.md`
  - `/Users/jared/.claude/skills/writing-plans/SKILL.md`
  - `/Users/jared/.cursor/skills/writing-plans/SKILL.md`
- 执行前，`/Users/jared/.copilot/skills/planning-with-files/SKILL.md` 仍保留旧的 “不要创建 parallel long-lived superpowers plan” 语义。

### Focus workspaces do not currently ship local duplicated skills

- 在 `TypeMint`、`BabyCry`、`lullabyApp`、`agent-plugin-marketplace` 下，没有发现本地 `.agents/skills/*/SKILL.md` 级别的 workspace skills 副本。
- 当前重复主要不是“workspace 本地 skill 副本 vs 全局 skill 副本”，而是：
  - user-global rendered entries / projected skills 已过时
  - workspace 自身有 project delta / project canonical rules
  - 历史 `docs/superpowers/plans/**` 仍被一些任务引用和执行

### Historical superpowers plans remain execution inputs in existing workspaces

- `TypeMint`、`BabyCry`、`lullabyApp` 都保留了大量 `docs/superpowers/plans/**` 历史计划或执行引用。
- 多个 active task 还显式引用这些 plan 作为执行输入。
- 这意味着“一次性清理 docs/superpowers/plans 或统一替换 plan 引用”风险很高，会直接影响存量任务可执行性。

## Initial Governance Implications

- 立即对齐的最佳切入点是 Jared user-global baseline，而不是先动各 workspace。
- `LullabyApp` 可以在全局对齐后做最小增量清理，因为它本来就声明“继承全局 baseline”。
- `TypeMint` / `BabyCry` 只能做 selective adoption：吸收新的 Harness 主路径与 companion-plan 边界，但不能覆盖其项目自治规则体系。
- `Agent Plugin` 暂不适合纳入第一批规则入口对齐，更适合作为后续内容仓库治理对象。

## Execution Outcome

### Executed now

- 已在 `/Users/jared/HarnessTemplate` 上按现有 user-global state 执行 `./scripts/harness sync`。
- 刷新范围仅限 Jared user-global targets：
  - `codex`
  - `copilot`
  - `cursor`
  - `claude-code`
- 没有对 `TypeMint`、`BabyCry`、`lullabyApp`、`Agent Plugin` 做 workspace 覆盖式修改。

### Verified now

- `./scripts/harness doctor --check-only` 返回 `Harness check passed.`  
  仍存在的 warning 只来自 `HarnessTemplate` 仓库内历史 companion plan 缺 back-reference，与本轮 user-global adoption 无关。
- 以下 user-global entry 已确认切到新模型：
  - `/Users/jared/.codex/AGENTS.md`
  - `/Users/jared/.copilot/instructions/harness.instructions.md`
  - `/Users/jared/.claude/CLAUDE.md`
- 以下 user-global/shared `writing-plans` 已确认切到新 companion-plan patch：
  - `/Users/jared/.agents/skills/writing-plans/SKILL.md`
  - `/Users/jared/.copilot/skills/writing-plans/SKILL.md`
  - `/Users/jared/.claude/skills/writing-plans/SKILL.md`
  - `/Users/jared/.cursor/skills/writing-plans/SKILL.md`
- 以下 `planning-with-files` 已确认包含 companion-plan patch marker：
  - `/Users/jared/.agents/skills/planning-with-files/SKILL.md`
  - `/Users/jared/.copilot/skills/planning-with-files/SKILL.md`
  - `/Users/jared/.claude/skills/planning-with-files/SKILL.md`
  - `/Users/jared/.cursor/skills/planning-with-files/SKILL.md`

## Residuals After Adoption

- `writing-plans` 末尾仍保留：
  - `Plan complete and saved to docs/superpowers/plans/<filename>.md`
- 这是当前 `HarnessTemplate` upstream/patched source 自身仍保留的文案残余，不是本轮 user-global adoption 漏同步。
- 按本轮边界，不对全局 consumer 做 source-divergent 手工修补；后续如果要消除这条残余，应在 `HarnessTemplate` source 里修，再重新 sync。
