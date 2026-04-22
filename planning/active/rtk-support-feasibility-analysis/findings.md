# Findings & Decisions

## Requirements

- 评估在 Harness 中增加 `https://github.com/rtk-ai/rtk` 支持的价值。
- 列出价值点，并给出成本节省与效率提升的预估。
- 分析在当前各 IDE 中的效果。
- 分析它与 Harness 当前两个 upstream 关键模块的兼容性与适配性。
- 所有判断先基于事实来源：官方文档、GitHub issues、GitHub PR。
- 不进行任何程序和代码改动。

## Early Facts

- Harness 当前 `harness/upstream/sources.json` 只声明两个 upstream 来源：
  - `superpowers`
  - `planning-with-files`
- 本仓库把 `planning/active/<task-id>/` 作为唯一权威任务记忆位置。

## Research Findings

### RTK 自身定位与成熟度

- RTK 官方 README 将自己定义为 “CLI proxy that reduces LLM token consumption by 60-90% on common dev commands”，核心机制是把高噪声 shell 命令重写为 `rtk <cmd>`，再把压缩后的输出交给 agent。
- 官方 hooks 文档说明，所有 agent hook 都只是薄代理；真正的命令匹配与重写逻辑在 Rust 二进制里，hook 只负责解析各家 JSON 格式并调用 `rtk rewrite`。
- 官方 README 当前声明支持 12 个 AI coding tools，其中 Harness 当前覆盖的 4 个目标都在支持列表中：
  - Claude Code
  - GitHub Copilot
  - Cursor
  - Codex
- GitHub 页面显示仓库活跃度较高：
  - 3 万以上 stars
  - 300+ open issues
  - 300+ open PRs
  - 2026-04 仍有持续 release

### RTK 对 Harness 四个目标的官方集成方式

- Claude Code：
  - `PreToolUse` shell hook，透明重写，返回 `updatedInput`
  - `rtk init -g` 还会创建 `RTK.md`，并向 `CLAUDE.md` 注入 `@RTK.md`
  - hooks 配置写入 `settings.json`
- GitHub Copilot：
  - VS Code Copilot Chat：`PreToolUse` hook，可透明重写
  - Copilot CLI：不支持 `updatedInput`，只能 deny-with-suggestion
  - 官方 `hooks/copilot/rtk-awareness.md` 明确依赖两层：
    - `.github/copilot-instructions.md`
    - `.github/hooks/rtk-rewrite.json`
- Cursor：
  - `preToolUse` hook，可透明重写，写入 `~/.cursor/hooks.json`
  - 官方源码明确 Cursor 集成是 global-only
  - 当前没有看到 RTK 对 Cursor 额外写 `.cursor/rules/*.mdc` 的官方逻辑
- Codex：
  - 官方 hooks 文档明确写的是 “AGENTS.md / instructions”，不是程序化 hook
  - `rtk init --codex` 会创建 / 更新 `AGENTS.md` 与 `RTK.md`
  - 官方源码明确写到 Codex 目标是 “uses AGENTS.md + RTK.md, no Claude hook patching”

### 与 Harness 当前投影模型的结构关系

- Harness 的 entry files 是权威渲染产物，README 与 `docs/maintenance.md` 明确：
  - `sync` 会重新生成 installed projections
  - rendered entry files 属于 Harness 管理范围
- Harness 的 hook merge 逻辑会保留非 Harness-managed 条目，只替换同 marker 的 Harness 条目。
- 这意味着：
  - RTK 直接写入 hook config 时，理论上不会被 Harness 自动清理掉
  - 但 RTK 直接改写 instruction / rule files 时，可能在后续 `sync` 中被 Harness 覆盖

### 兼容性关键事实

- Claude Code 存在 RTK 官方已确认的 Bash `PreToolUse` 冲突问题：
  - RTK issue #361 说明，只要另一个 hook 也注册同一 `(PreToolUse, Bash)`，Claude Code 可能静默丢弃全部 `updatedInput`
  - Harness 当前 `planning-with-files` 的 Claude hook matcher 包含 `Bash`
  - 因此，RTK 与 Harness 当前 Claude planning hook 存在真实冲突面，不是理论风险
- Codex 当前在 Harness 中已有 hook 能力，但 RTK 官方 Codex 集成仍停留在 prompt-level：
  - Harness `planning-with-files` / `superpowers` 已可写 `.codex/hooks.json`
  - RTK 官方 Codex 集成仍是 `AGENTS.md + RTK.md`
  - 所以若只是“照抄 RTK 官方做法”，Codex 上的效果会明显弱于 Claude / Copilot / Cursor
- Copilot instruction 冲突是确定存在的：
  - Harness 当前 workspace entry 是 `.github/copilot-instructions.md`
  - RTK 官方 Copilot awareness 文件也明确使用 `.github/copilot-instructions.md`
  - 如果不由 Harness 接管整合，`rtk init --copilot` 与 Harness render 会互相覆盖
- Codex instruction 冲突同样确定存在：
  - Harness 当前 workspace entry 是 `AGENTS.md`
  - RTK 官方 Codex 集成明确写入 `AGENTS.md` + `RTK.md`
  - 如果不由 Harness 接管整合，`rtk init --codex` 与 Harness render 会互相覆盖

## Technical Decisions

| Decision | Rationale |
|----------|-----------|
| 如果要支持 RTK，首选“可选插件 / 可选 integration layer”，不应把 RTK 当成第三个 core upstream | RTK 是外部二进制依赖；`superpowers` upstream 也明确第三方依赖更适合放独立插件 |
| 不建议把“运行 `rtk init`”当成 Harness 官方支持方式 | 它会改 Harness 也在管理的 entry files，并在 Claude 上触发已知 hook 冲突面 |
| 若做 v1，优先支持 Copilot 与 Cursor，再评估 Claude，最后才考虑 Codex 深化 | Copilot / Cursor 的机制最接近 Harness 现有 projection；Claude 有已知冲突；Codex 官方集成仍弱 |
| Codex 上若要做出真正高价值支持，需要 Harness 自己设计 hook-based RTK adapter，而不是复用 RTK 官方 prompt-only 集成 | 官方 RTK 对 Codex 只做到 `AGENTS.md` awareness，达不到透明重写 |

## Open Questions

- RTK 当前官方支持的运行形态是什么：CLI、库、agent runtime、协议层，还是混合形态？
- RTK 是否已有与 Codex、Claude Code、Cursor、Copilot 等 IDE/agent harness 的已知集成案例？
- RTK 接入 Harness 需要“内建支持”还是更适合作为可选插件 / adapter 扩展？
