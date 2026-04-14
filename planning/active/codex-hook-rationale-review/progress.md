# Codex Hook 覆盖依据复核进度

## 2026-04-14

- 新建任务目录，隔离本轮关于 `Codex hooks` 覆盖依据的分析。
- 已复读旧任务：
  - `planning/active/cross-ide-hooks-projection/`
  - `planning/active/cross-ide-projection-audit/`
- 当前重点：
  - 验证旧结论是否仍然成立；
  - 补齐 `Codex` 官方能力依据；
  - 明确当前 hooks 清单和实际影响。
- 已完成关键核对：
  - OpenAI 官方 Codex hooks 文档已可访问，并明确给出 `~/.codex/hooks.json`、`<repo>/.codex/hooks.json`、事件集合和 feature flag。
  - OpenAI 官方 Codex skills 文档已明确改为 `.agents/skills` / `~/.agents/skills`。
  - 本仓库当前代码仍把 `Codex` hooks 标记为 unsupported，并把 skill root 写成 `.codex/skills`。
- 当前判断：
  - 旧设计在当时证据不足的情况下合理；
  - 但现在 Codex adapter 已经出现官方能力漂移，需要重新设计。
