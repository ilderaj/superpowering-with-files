# Findings：Cross-IDE 单一同源收敛审计

## 当前已确认事实

- 当前仓库 metadata 中：
  - Codex skills 使用 `.agents/skills` 与 `~/.agents/skills`
  - GitHub Copilot skills 使用 `.github/skills` 与 `~/.copilot/skills`
  - Cursor skills 使用 `.cursor/skills` 与 `~/.cursor/skills`
  - Claude Code skills 使用 `.claude/skills` 与 `~/.claude/skills`
- 当前仓库没有把所有 IDE 的 skills 统一投影到 `.agents/skills`；只有 Codex 使用该路径。
- 旧的 `cross-ide-projection-audit` 已记录过一个重要官方事实：
  - GitHub Copilot 官方文档把 project skills / personal skills 的默认搜索目录同时列为 `.github/skills`、`.claude/skills`、`.agents/skills` 与对应 home 目录。
- 这意味着“Copilot 能不能读 `.agents/skills`”与“Copilot 的默认/推荐路径是不是 `.agents/skills`”需要分开判断。

## 本轮待确认

- OpenAI Codex 对 `.agents/skills` 的官方表述强度。
- GitHub Copilot 对 `.agents/skills`、`.claude/skills`、`.github/skills` 的优先级与推荐语义。
- Cursor 对 `.agents/skills` 与 `.cursor/skills` 的关系：是原生主路径还是兼容扫描。
- Claude Code 是否支持 `.agents/skills` 作为原生或兼容 skill root。
- hooks、instructions、rules、settings 是否存在类似“共享单一同源”的机会。

## 官方文档核对结果

### Codex

- OpenAI Codex 官方文档已经明确：
  - repo/project skills 在 `.agents/skills`
  - user/global skills 在 `~/.agents/skills`
  - repo instructions 使用 `AGENTS.md`
  - user/global instructions 使用 `~/.codex/AGENTS.md`
  - hooks 使用 `<repo>/.codex/hooks.json` 与 `~/.codex/hooks.json`
  - config 使用 `.codex/config.toml` 与 `~/.codex/config.toml`
- 结论：Codex 的 skills 与 instructions 都有清晰且稳定的官方路径，不需要额外猜测。

### GitHub Copilot / VS Code

- VS Code 官方文档已经明确：
  - always-on workspace instructions 首选 `.github/copilot-instructions.md`
  - 也支持 `AGENTS.md` 作为 always-on instructions
  - 也支持 `CLAUDE.md` 兼容加载
  - file-based instructions 使用 `.instructions.md`，默认目录是 `.github/instructions` 与 user profile
  - project skills 支持 `.github/skills/`、`.claude/skills/`、`.agents/skills/`
  - personal skills 支持 `~/.copilot/skills/`、`~/.claude/skills/`、`~/.agents/skills/`
  - hooks 使用 `.github/hooks/*.json` 与 `~/.copilot/hooks`，同时兼容读取 Claude 的 settings hooks
- 结论：
  - 你问的 “Codex 和 Copilot 的 skills 路径能不能统一用 `.agents/skills` / `~/.agents/skills`” 从官方文档看，答案是“可以作为共同支持路径”。
  - 但对 Copilot 来说，这不是唯一官方路径，而是多种官方支持路径之一。

### Cursor

- 当前可稳定抓取的官方文档明确：
  - project rules 使用 `.cursor/rules`
  - user rules 定义在 Cursor Settings，而不是单独的 repo/home 规则文件
  - `AGENTS.md` 是 `.cursor/rules` 的简单替代
  - 官方 changelog 已明确支持 Agent Skills，使用 `SKILL.md`
- 但本轮通过公开可抓取文档，未能稳定拿到 Cursor skills 页正文里的完整“skills directories”表格。
- 结合仓库既有审计上下文，Cursor 曾公开说明支持 `.agents/skills`、`.cursor/skills`、`~/.agents/skills`、`~/.cursor/skills`；但这条在本轮需要标记为“历史已见、当前抓取不足以再次强证”。
- 结论：
  - 对 Cursor，`AGENTS.md` 与 `.cursor/rules` 的关系是官方明确的。
  - 对 Cursor skills 的具体目录集合，本轮可作为“高概率成立、但需二次留痕确认”的事实处理，不宜在治理文档里写成 100% 已重验事实。

### Claude Code

- Anthropic 官方文档已经明确：
  - user/project scope 都基于 `~/.claude/` 与 `.claude/`
  - skills 使用 `~/.claude/skills/<name>/SKILL.md` 与 `.claude/skills/<name>/SKILL.md`
  - instructions 使用 `~/.claude/CLAUDE.md`、`CLAUDE.md` 或 `.claude/CLAUDE.md`
  - hooks 与其他设置都通过 `~/.claude/settings.json`、`.claude/settings.json`、`.claude/settings.local.json`
- 结论：Claude Code 没有把 `.agents/skills` 当成官方本地 skills root；不能把 `.agents/skills` 直接当成 Claude 的 runtime 单一路径。

## 收敛判断

### 1. Skills

- `Codex + Copilot`：
  - 官方都支持 `.agents/skills` 与 `~/.agents/skills`
  - 因此这两者可以收敛到共同的 authoring/discovery 路径
- `Claude Code`：
  - 官方坚持 `.claude/skills`
  - 不能把 `.agents/skills` 当成 Claude 的官方 runtime 路径
- `Cursor`：
  - 当前官方可抓取证据不足以重验完整 skills path matrix
  - 在治理上应采用“保守兼容”策略，不建议在这轮直接删除 `.cursor/skills` 投影

### 2. Instructions / Entry Files

- `AGENTS.md`：
  - Codex 官方原生
  - Copilot 官方支持
  - Cursor 官方支持
- `CLAUDE.md`：
  - Claude 官方原生
  - Copilot 官方兼容支持
- 结论：
  - `AGENTS.md` 可以作为跨 Codex / Copilot / Cursor 的核心 authoring source
  - `CLAUDE.md` 仍需要为 Claude Code 保留官方原生入口
  - 因此 instructions 适合“单一源内容 + 少量官方投影”，不适合“所有 IDE 共用一个物理文件路径且不投影”

### 3. Hooks

- Codex: `.codex/hooks.json`
- Copilot: `.github/hooks/*.json` / `~/.copilot/hooks`
- Cursor: `.cursor/hooks.json` / `~/.cursor/hooks.json`（当前公开可抓取证据不如前两者强）
- Claude: `.claude/settings.json` family
- 结论：hooks 不存在可直接共用的官方物理路径；最多只能共用一个内部 canonical schema，再生成各平台 projection。

### 4. Settings / Config

- Codex: TOML
- Claude: JSON settings
- Cursor: settings + `.cursor/*`
- Copilot: VS Code settings + file customizations
- 结论：不存在单一路径，也不存在单一文件格式。

## 对当前仓库的含义

- 当前仓库对 Copilot 仍使用 `.github/skills` / `~/.copilot/skills` 作为主投影，这比官方允许的收敛程度更保守。
- 这个保守策略不是偶然的，仓库里目前还显式写着 `Copilot must not be assumed to read ... shared .agents/skills directories.`，见 `/Users/jared/HarnessTemplate/harness/core/policy/platform-overrides/copilot.md`。
- 当前仓库对 Codex 使用 `.agents/skills`，这是对的。
- 当前仓库对 Claude 使用 `.claude/skills`，这也是对的。
- 如果目标是降低重复维护成本，那么最值得先收敛的是：
  - 将 skills 的 canonical source 收敛到 `.agents/skills` / `~/.agents/skills`，至少覆盖 Codex + Copilot，并视 Cursor 证据情况决定是否顺带覆盖
  - 将通用 instructions 的 canonical source 收敛到 `AGENTS.md`
  - 保留 Claude 的 `CLAUDE.md` 与 `.claude/skills` 作为必要 projection，而不是独立手工维护源

## 风险与边界

- 不能把“Copilot 支持 `.agents/skills`”误写成“Copilot 只认 `.agents/skills`”。
- 不能把“Cursor 历史上支持 `.agents/skills`”在当前证据不足时当成已重验事实。
- 不能为了追求单一路径而放弃 Claude 的官方原生入口，否则会把收敛成本转化成运行时不确定性。
- 最合理的收敛目标不是“所有 IDE 都直接读同一路径”，而是“所有共享内容只在一个 canonical source 里手工维护，其他 IDE 路径自动投影生成”。

## Implementation Plan Artifact

- Companion plan: `docs/superpowers/plans/2026-04-20-cross-ide-single-source-consolidation.md`
- Purpose: 给后续执行者一份可直接落地的、按 task 拆分的 implementation plan。
- Boundaries captured in the plan:
  - 不改 `harness/core/policy/base.md`
  - 不改 `harness/core/policy/entry-profiles.json`
  - 不在本轮改变 hook schema 或 hook event 逻辑
  - 以 shared skill roots only for `Codex + Copilot` 为第一阶段目标
