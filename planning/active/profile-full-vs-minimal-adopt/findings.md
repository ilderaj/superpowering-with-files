# Findings

## Current Facts
- 当前仓库里与本题最直接相关的入口已定位到：
  - `harness/core/skills/profiles.json`
  - `harness/installer/commands/adopt-global.mjs`
  - `harness/installer/commands/install.mjs`
  - `harness/installer/commands/verify.mjs`
  - `tests/adapters/skill-profile.test.mjs`
  - `tests/installer/commands.test.mjs`
  - `README.md`
  - `docs/install/*.md`
- `fd` 在当前环境不可用，因此本轮文件扫描已回退到 `find` / `rg`。

## Profile Semantics
- “full adopt” 对应显式 `--skills-profile=full`。
- 用户全局 adopt 的默认“minimal adopt”在当前仓库语义里对应 `minimal-global`：
  - `install` 在 `scope=user-global|both` 时默认回落到 `minimal-global`
  - `adopt-global` 在 bootstrap user-global state 时同样走这条默认逻辑
- `full` 与 `minimal-global` 控制的是 **skill profile**，不是 entry policy profile。
- entry files 默认仍走薄的 `always-on-core` policy profile；`full` / `minimal-global` 不会直接把 entry profile 切厚。

## Projection Findings
- `minimal-global` 在每个 target 上只投影 5 个 skill 组件：
  - `planning-with-files`
  - `superpowers:using-superpowers`
  - `superpowers:writing-plans`
  - `superpowers:executing-plans`
  - `superpowers:verification-before-completion`
- `full` 在每个 target 上投影 17 个 skill 组件：
  - `planning-with-files`
  - `risk-assessment-before-destructive-changes`
  - `safe-bypass-flow`
  - 整个 `superpowers` collection 的全部当前 child skills
- 关键实现机制：
  - `full` profile 直接包含父项 `superpowers`
  - planner 对 collection skill 遇到父项命中时，会把该 collection 当前所有 children 全部展开
  - `minimal-global` 只列出 4 个显式 allow-listed `superpowers:*` children，因此集合大小稳定、增长受控
- user-global `all targets` 视角下，coalesced 后的**物理投影路径**数量：
  - `minimal-global`: 15
  - `full`: 51
- 差异不是 `20 -> 68`，因为 Codex 与 Copilot 共享 `~/.agents/skills`，sync 会对同 targetPath 的 skill projection 做 coalesce。

## Token Findings
- 当前仓库的 token 度量使用 `approxTokens = ceil(chars / 4)`。
- `verify` / `doctor` 的 `Skill profile size` 不是整套 skill 内容，而是 discovery 文本：
  - 格式是 `Profile / Target / Skills / - skill (strategy)` 这类列表
  - 因此它反映的是“暴露出的 skill surface”，不是 skill bodies 全量源码体积
- 以 user-global 单 target 口径量化：
  - `minimal-global`
    - logical skills: 5
    - discovery context: 77-79 tokens
    - frontmatter total: 334 tokens
    - skill body total: 7,351 tokens
    - source tree total: 17,084 tokens
  - `full`
    - logical skills: 17
    - discovery context: 225-226 tokens
    - frontmatter total: 912 tokens
    - skill body total: 31,001 tokens
    - source tree total: 76,101 tokens
- 相对倍数大致是：
  - projection 组件数：`17 / 5 = 3.4x`
  - discovery summary：约 `2.9x`
  - skill body：约 `4.2x`
  - source tree：约 `4.5x`

## Interpretation
- 如果关注“默认日常 adopt 的上下文开销可控”，`minimal-global` 的设计目标是成立的：它把 user-global 基线压成一个小而稳的 allowlist。
- 如果显式切到 `full`，放大的不是某一个 entry 文件，而是整个 projected skill surface；后续 skill discovery、skill body、skill source 三层预算都会一起升高。
- 预算判断不能把多 IDE 简单相加成一个 session；仓库 health 模型按 target session 分别统计，然后报告 worst target session。

## Follow-up Clarification: Lazy Loading vs Full Injection
- 当前仓库的设计假设不是“每轮新对话把 full skill bodies 全量注入”。
- 明确信号有三层：
  - `context-budget-policies.json` 对 Codex 写的是 `stable-prefix-lazy-skills`，推荐做法是 “Use a light global entry, keep skills lazy-loaded”。
  - 对 Claude Code 也写的是 `light-claude-md-lazy-skills`。
  - vendored `writing-skills` 文档明确写了 `Files read on-demand`，即 skill 文件在需要时才从文件系统读取。
- 因此：
  - entry file 更接近“稳定前缀 / discovery surface”
  - projected skill roots 是“可发现、可按需读取的技能源”
  - `health.context.ledger.session.skillBody` / `skillSource` 更像是“该 profile 打开后可暴露出的技能体量上限/面宽诊断”，不是断言每轮都把这些文本一次性塞进上下文
- `full` 仍然会提高真实成本风险，因为：
  - 可发现的 skills 更多，discovery surface 更大
  - agent 触发、读取、展开 skill 的机会更多
  - 某些平台/实现若对 skill discovery 较激进，full 的税会比 minimal 更容易显化
- 但从仓库当前设计意图看，`full` 不等于“每轮固定支付 4x token”；更准确说法是：**full 提高了潜在可见面和按需读取上限，minimal-global 则把这部分上限压低。**
