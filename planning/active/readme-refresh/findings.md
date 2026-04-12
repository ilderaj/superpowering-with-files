# README 改造发现记录

## Requirements
- 清晰描述 HarnessTemplate 的作用和主要功能。
- 给全新用户提供如何把 Harness 固化到本地 workspace 或 user-global 的指引。
- 给非全新用户提供与本地 workspace / user-global 相关内容整合、替换、更新、增强、包裹的指引。
- 强调 Superpowers + Planning with Files + HarnessTemplate 是更高层次、更 capable 的规则集合，适合做本地整合。
- 强调新建本地项目或 workspace 时可以让 Harness 在项目内生效，不必默认影响本地全局规则。
- 同时说明 Harness 也可以替换、更新或整合到本地 user-global 规则，让多项目共享同一套上层 Harness baseline。
- README 要同时 friendly for humans and agents。
- 保留现有两张 Mermaid 图，并检查是否需要更新。
- 初始轮只做计划；用户随后点名 `executing-plans`，本轮已执行 README 改造。

## Research Findings
- 当前 README 已有清晰的基础介绍、Quick Start、Workflow、Complex Request Mode、Installation Structure、Entry Files、Skill Projection Metadata、Upstream Updates、Common Commands、Documentation。
- 当前两张 Mermaid 图分别解释：
  - task governance workflow：任务进入规则后如何决定直接执行、Planning with Files、Superpowers、验证和归档。
  - installation structure：`harness/core`、`harness/adapters`、`harness/installer`、`harness/upstream` 如何渲染到 Codex、Copilot、Cursor、Claude Code 入口。
- 当前 README 已说明 `sync` 渲染真实入口文件，skill projection 策略已有建模和测试，但尚未接入 `sync`，没有 hard-link 实现。
- 当前 README 的弱点是 Quick Start 只给命令，没有明确区分新用户和已有本地规则用户，也没有把 workspace 与 user-global 下的 replace / update / enhance / wrap 整合模式讲清楚。
- `harness/installer/commands/sync.mjs` 会把 rendered entry file 写入配置 scope 的目标路径；`harness/installer/lib/fs-ops.mjs` 先删除目标路径再写入，因此 README 需要提醒用户在已有 workspace 或 user-global 规则场景下先审查现有入口文件。
- CLI 支持的 scope 是 `workspace`、`user-global`、`both`，不是 `user`。
- README 改造后仍保留两张 Mermaid 图。第一张只微调入口节点文案，以覆盖 workspace 和 user-global 的 nearest entry file 语义；第二张未改结构。
- `planning/active/harness-flow-structure/` 已关闭且 archive eligible，说明两张图来自近期任务，不应随意重画。
- `planning/active/harness-complex-orchestration/` 已关闭且 archive eligible，README 中的 Complex Request Mode 来自近期编排改造，也不应删除。
- `planning/active/harness-template-foundation/` 仍为 active，是模板基础任务的长期上下文；本次 README refresh 使用独立 task，避免覆盖旧状态。

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| 复用 README 现有事实，不重写成营销页 | 当前 README 的实现事实密度高，主要问题是结构与安装/整合导引不足。 |
| 把 `Common Commands` 和 `Documentation` 合并为尾部轻量区块 | 可以减少章节碎片，同时保留可扫读性。 |
| README 同时覆盖 workspace 与 user-global 的 replace / update / enhance / wrap | 用户补充要求不能只讲固化到本地 workspace，也要说明如何替换、更新或整合到本地 user-global。 |
| 图只在准确性需要时更新 | 用户明确要求图保留，且现有图对应近期已关闭任务，默认可信。 |
| README 正文继续使用英文 | 仓库规则要求 code-related documentation 使用英文。 |
| 既说明 replace/update，也提醒先审查现有入口文件 | `sync` 会替换目标路径；直接鼓励 user-global 替换会有覆盖本地规则的风险。 |

## Resources
- `/Users/jared/HarnessTemplate/README.md`
- `/Users/jared/HarnessTemplate/planning/active/harness-flow-structure/task_plan.md`
- `/Users/jared/HarnessTemplate/planning/active/harness-complex-orchestration/task_plan.md`
- `/Users/jared/HarnessTemplate/planning/active/harness-template-foundation/task_plan.md`
- `/Users/jared/HarnessTemplate/planning/active/harness-upstream-smooth-update/task_plan.md`
- `/Users/jared/.codex/superpowers/skills/using-superpowers/SKILL.md`
- `/Users/jared/.codex/superpowers/skills/brainstorming/SKILL.md`
- `/Users/jared/.codex/superpowers/skills/writing-plans/SKILL.md`
- `/Users/jared/.agents/skills/planning-with-files/SKILL.md`
- `/Users/jared/.config/superpowers/worktrees/HarnessTemplate/readme-refresh/README.md`
- `/Users/jared/.config/superpowers/worktrees/HarnessTemplate/readme-refresh/harness/installer/commands/sync.mjs`
- `/Users/jared/.config/superpowers/worktrees/HarnessTemplate/readme-refresh/harness/installer/lib/fs-ops.mjs`
- `/Users/jared/.config/superpowers/worktrees/HarnessTemplate/readme-refresh/harness/installer/lib/metadata.mjs`

## Issues Encountered
| Issue | Resolution |
|-------|------------|
| `fd` 不存在 | 使用 `rg --files` 替代。 |
| shell quoting 错误导致 `rg` 核对命令失败 | 改用单引号包裹的简化 pattern 后核对通过。 |
