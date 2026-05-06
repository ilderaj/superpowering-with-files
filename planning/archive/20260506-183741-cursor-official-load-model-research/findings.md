# Findings: Cursor 官方加载模型研究

## 官方链接矩阵

| 主题 | 官方链接 | 当前可确认事实 | 结论类型 |
| --- | --- | --- | --- |
| Rules 总览 | `https://cursor.com/docs/rules` | 当前规则页已把 `Project Rules`、`User Rules`、`AGENTS.md` 放在同一套规则模型下，并新增 `Team Rules` | 官方确认 |
| Project Rules | `https://cursor.com/docs/rules` | `Project Rules` 存储在 `.cursor/rules`，受版本控制并作用于代码库 | 官方确认 |
| User Rules | `https://cursor.com/docs/rules` | `User Rules` 是 Cursor 环境级配置，不是文件系统里的 `~/.cursor/rules/*.mdc`；当前文档还明确它只用于 Agent(Chat)，不用于 Inline Edit | 官方确认 |
| AGENTS.md | `https://cursor.com/docs/rules` | `AGENTS.md` 是 `.cursor/rules` 的简化替代，当前文档明确支持 project root 和 subdirectories | 官方确认 |
| Skills 总览 | `https://cursor.com/docs/skills` | Cursor 启动时会自动发现 skills，并把可用 skills 提供给 Agent 决定是否按上下文使用 | 官方确认 |
| Skill directories | `https://cursor.com/docs/skills` | 官方自动发现目录包括 `.agents/skills/`、`.cursor/skills/`、`~/.agents/skills/`、`~/.cursor/skills/` | 官方确认 |
| SKILL.md / 自动应用 | `https://cursor.com/docs/skills` | skills 以 `SKILL.md` 为主入口，Agent 会根据上下文决定是否自动使用 | 官方确认 |
| 显式调用技能 | `https://cursor.com/docs/skills` | 可在 Agent chat 里通过 `/skill-name` 手动调用；`disable-model-invocation: true` 会把 skill 限制为显式调用 | 官方确认 |
| Hooks 总览 | `https://cursor.com/docs/hooks` | hooks 用自定义脚本观察、控制并扩展 agent loop，可在 agent loop 的定义阶段前后运行 | 官方确认 |
| Hook 配置路径 | `https://cursor.com/docs/hooks` | hooks.json 支持 project-level `<project>/.cursor/hooks.json` 和 user-level `~/.cursor/hooks.json`；两者分别对应项目级和全局级 hooks | 官方确认 |

## 已确认事实

- Cursor 当前把 rules、skills、hooks 都纳入官方文档主线，不再是零散功能页。
- `Project Rules` 是 `.cursor/rules`；`User Rules` 是 settings 层配置；因此不应伪造 `~/.cursor/rules/*.mdc` 作为 user-global 入口。
- `AGENTS.md` 现在是规则模型中的官方入口，不只是边缘兼容说明。
- Cursor 当前官方自动发现的 skill directories 已明确包含 shared `.agents/skills/` 与 native `.cursor/skills/` 两条 project-level 路径，以及各自的 user-level 路径。
- skills 默认可被 Agent 按相关性自动调用；如果要强制显式调用，应使用 `disable-model-invocation: true`。
- hooks 现在有明确的 native 路径文档：workspace/project 使用 `.cursor/hooks.json`，user-global 使用 `~/.cursor/hooks.json`。

## 基于官方事实的 Harness policy

- Harness 继续把 `.cursor/rules/harness.mdc` 作为 Cursor 的 workspace primary rule projection。
- Harness 继续把 Cursor User Rules 视为 settings-layer configuration，不写入 user-global filesystem rule。
- 虽然 Cursor 官方也支持 `.agents/skills/` 与 `~/.agents/skills/`，Harness 仍保留 `.cursor/skills` / `~/.cursor/skills` 作为 Cursor 的 primary native projection；shared `.agents/skills` 属于兼容发现路径，不是本 repo 当前对 Cursor 的首选投影面。
- Cursor hooks 保持 native `.cursor/hooks.json` / `~/.cursor/hooks.json`；Claude-compatible loading 只作为兼容行为，不作为主投影契约。

## 未确认

- 官方文档没有明确给出多目录 skills 在所有安装形态下的完整优先级矩阵。
- 官方文档没有明确说明 `.agents/skills/` 与 `.cursor/skills/` 同时存在时的冲突解决顺序。
- 官方文档没有把 rules、skills、hooks、subagents 收敛成单独的“分层记忆”术语模型。
