# Codex Hook 覆盖依据复核记录

## 当前观察

- 仓库文档当前明确写死：`Codex` hooks 为 unsupported，原因是 “Harness does not have a verified Codex hook adapter”。
- 旧的 `cross-ide-hooks-projection` 调研记录已经把这个状态当作设计结论写入，但还需要复核其证据链是否充足。
- 旧的 `cross-ide-projection-audit` 明确记录了一个证据缺口：无法从当时可访问的官方 OpenAI 文档中确认 Codex 的 hooks config schema，因此采取保守处理。

## 新确认的官方依据

- OpenAI 官方 Codex hooks 文档现在已明确给出：
  - hooks 需要在 `config.toml` 中启用 `codex_hooks = true`。
  - 主要 hooks 文件位置是 `~/.codex/hooks.json` 和 `<repo>/.codex/hooks.json`。
  - 支持的核心事件包括 `SessionStart`、`PreToolUse`、`PostToolUse`、`UserPromptSubmit`、`Stop`。
  - `PreToolUse` / `PostToolUse` 当前主要只拦截 `Bash`，而不是所有工具。
  - hooks 仍是 experimental，且 Windows 当前禁用。
- OpenAI 官方 Codex skills 文档现在明确写的是：
  - repo skills 走 `.agents/skills`
  - user skills 走 `~/.agents/skills`
  - 不是仓库当前写死的 `.codex/skills`

## 对当前设计的含义

- “Codex 没有可验证 hook schema”这个前提已经不成立。
- 当前 `unsupported` 更准确地说是：
  - 2026-04-13 时点基于证据缺口的保守设计；
  - 到 2026-04-14 现在已经演变成过时实现。
- 当前 Codex adapter 至少有两个漂移点：
  - hooks 仍被标成 unsupported；
  - skill roots 仍使用 `.codex/skills` / `~/.codex/skills`，与官方 `.agents/skills` / `~/.agents/skills` 不一致。

## 待确认问题

- 现在的 `Codex unsupported` 是因为产品确实没有 hooks，还是因为仓库没有完成 verified adapter。
- Copilot 过去为什么被视为“特殊”，现在为什么变成了支持 `planning-with-files` hooks 但不支持 `superpowers` hooks。
- 当前 hooks 支持矩阵是否仍然与实际产品能力一致。

## 初步判断

- 目前可以确认：这是“Harness 只为已验证的 hook schema 建 adapter”的产物，而不是“Codex 一定没有 hook”。
- Copilot 过去之所以显得“特殊”，主要不是它不能挂 hooks，而是：
  - `planning-with-files` 对 Copilot 要 materialize skill 副本，不能简单 symlink；
  - `superpowers` 上游并没有提供 Copilot 的 hook descriptor，所以当前只 cover `planning-with-files`，不 cover `superpowers`。
- 当前 hooks 支持矩阵对 Copilot / Claude Code / Cursor 基本仍可自圆其说，但对 Codex 已经过时。
