# 已确认事实

- Cursor 官方规则页确认了 `Project Rules`、`User Rules`、`AGENTS.md` 与 legacy `.cursorrules` 四类入口。
- 官方规则页确认 `Project Rules` 可通过路径模式作用域、`alwaysApply`、`Agent Requested` 等机制做 scoped 或按需加载。
- 官方规则页确认 `User Rules` 是全局设置，定义在 `Cursor Settings → Rules`，并会应用到所有项目。
- 官方 skills 页确认 skills 使用 `SKILL.md`，`description` 会用于判断相关性，默认会在 agent 认为相关时自动应用。
- 官方 skills 页确认 `disable-model-invocation: true` 可把 skill 变成显式 `/skill-name` 才加载的行为。
- 官方 skills 页确认 `scripts/` 与 `references/` 支持按需加载，主 `SKILL.md` 应保持精简以降低上下文负担。
- 官方 changelog 与 enterprise blog 确认 hooks 是用自定义脚本观察、控制和扩展 agent loop 的机制。

## 未确认

- 官方文档没有明确给出 skills 在所有安装形态下的完整全局扫描优先级矩阵。
- 官方文档没有明确确认全局用户目录 skills 与 project skills 的所有优先级细节。
- 官方文档没有把 rules、skills、hooks、subagents 统一成一个单独术语的“分层记忆”模型。

