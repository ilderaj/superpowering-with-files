# TypeMint Skill 重复候选排查计划

## Current State
Status: active
Archive Eligible: no
Close Reason:

## 目标

- 解释为什么在 `TypeMint` workspace 中输入 `/using-superpowers` 等 harness skills 时会出现重复候选。
- 区分“真实存在两份 skill 投影”和“同一份 skill 被不同发现路径重复展示”两种情况。
- 说明为什么常规 skill 查询结果与 UI 候选列表不一致。

## 完成标准

- 明确 `TypeMint` 仓库本地 skills 根目录实际包含什么。
- 明确 Codex/Harness 当前为 superpowers skills 使用的用户级投影路径。
- 明确重复是否由 symlink + 多来源扫描造成，并给出证据。
- 不修改产品代码，只输出检查结论与后续建议。

## 执行步骤

1. 检查 `TypeMint` 的 `AGENTS.md`、`.agents/skills`、`.codex/skills`。
2. 检查 HarnessTemplate 对 Codex skill roots 的当前设计与已有调研记录。
3. 检查 `~/.codex/skills` 中 superpowers skills 是否为 symlink，以及目标路径。
4. 汇总重复来源与查询差异。
