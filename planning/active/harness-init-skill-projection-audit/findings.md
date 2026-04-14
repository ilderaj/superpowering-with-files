# HarnessTemplate 初始化 Skill 投影审计与优化方案

## 本轮执行边界

- 只修 HarnessTemplate 初始化自身带出的 skill projection 结构性问题。
- 不处理当前机器上已存在的历史 symlink、旧目录、手工安装残留。

## 当前执行判断

- 长期稳定方案需要牺牲部分 `link` 的“单源更新”优势，换取宿主 IDE 侧更稳定的 discovery 行为。
- 对 `superpowers`，当前最稳的方向是统一改为 materialize，而不是继续让不同平台维持混合的 per-skill symlink 暴露。
- 对 `planning-with-files`，保留现有 Copilot patch 机制；其他平台根据既有模型维持，但测试要重新对齐新 root / projection 语义。

## 本轮要验证的核心问题

1. Codex root 切换到 `.agents/skills` 是否会影响现有 paths / sync / health / docs 测试。
2. `superpowers` 全平台 materialize 后，是否还需要对 Claude 保留现有特殊健康约束。
3. `health` 是否需要从“只校验 target 是否存在且策略正确”提升为“识别重复来源风险与过时 root 风险”。

## 本轮已落地实现

- Codex skill roots 已从 `.codex/skills` / `~/.codex/skills` 切换为 `.agents/skills` / `~/.agents/skills`。
- `superpowers` 已改为四平台统一 `materialize`。
- `planning-with-files` 也已统一为四平台 `materialize`，Copilot 继续保留 patch 机制。
- 平台 adapter manifests、platform overrides、README、安装文档、架构文档已同步更新。
- `health` 现在会：
  - 先检查 Claude shared skill root symlink
  - 对 materialized skill 强制要求“真实目录而非 symlink”

## 当前验证结果

- 已通过 targeted + broader installer/adapter/core test 回归。
- `node --test tests/core/*.test.mjs tests/installer/*.test.mjs tests/adapters/*.test.mjs`
  - 结果：105 passed, 0 failed

## 剩余 review 关注点

- 这次把 `planning-with-files` 也一起统一为 materialize，属于比最初 B 方案更强的收敛；如果你希望保留它在部分平台的 link 行为，需要单独回退这一层。
