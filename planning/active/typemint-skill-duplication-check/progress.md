# TypeMint Skill 重复候选排查进度

## 2026-04-14

- 新建任务目录，记录本轮对 `TypeMint` workspace skill 重复候选的检查。
- 已检查 `TypeMint/AGENTS.md`，确认项目规则把 skills canonical 主源定义为 `.agents/skills/`。
- 已检查 `TypeMint/.agents/skills/skills-manifest.json`，确认其中没有 superpowers 相关 skills。
- 已检查 `TypeMint/.codex/skills/`，确认其中只有 `openspec-*` 技能，没有 `using-superpowers` 等重复项。
- 已检查 HarnessTemplate README 与既有调研记录，确认当前 Harness for Codex 仍沿用 `.codex/skills` / `~/.codex/skills` 作为 skill root。
- 已检查 `~/.codex/skills/using-superpowers`、`using-git-worktrees`、`requesting-code-review`、`systematic-debugging`，确认它们都是指向 `/Users/jared/HarnessTemplate/harness/upstream/superpowers/skills/...` 的 symlink。
- 当前判断：重复来自同一 skill 被 UI 从多个路径来源展示，而不是 TypeMint 本地真实存在两份安装。
- 已补充安装侧证据：
  - README Quick Start 与 install 默认值确认 `projection=link` 是默认行为。
  - Codex 平台元数据确认 skill roots 仍是 `.codex/skills` / `~/.codex/skills`。
  - `tests/adapters/sync-skills.test.mjs` 明确验证 `sync` 会把 `.codex/skills/using-superpowers` 投影成指向 upstream skill 的 symlink。
- 已根据用户补充现象重新核对 Copilot：
  - `TypeMint` 不存在 `.github/skills`；
  - `~/.copilot/skills/using-superpowers` 等路径存在，且都是 symlink 到 HarnessTemplate upstream superpowers 源；
  - `harness/core/skills/index.json` 明确把 `superpowers` 对 Copilot 的 projection 设为 `link`。
- 当前结论收敛为：
  - 这是 HarnessTemplate 当前 **Copilot** adapter 采用 symlink 投影后，与 Copilot 候选发现/去重逻辑叠加出的结构性问题；
  - 已有 workspace 不是必要条件；
  - Codex 没复现，说明同一投影布局在不同客户端上的表现不一致，问题暴露点目前是 Copilot，不是 Codex。
