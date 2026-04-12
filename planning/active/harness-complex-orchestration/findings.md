# Findings

## 初始发现

- `harness-flow-structure` 已经 `Status: closed` 且 `Archive Eligible: yes`，本任务不复用、不移动它。
- `harness-template-foundation` 仍是 active，但范围更大；本任务使用独立 task id `harness-complex-orchestration`，避免覆盖旧任务状态。
- 当前核心规则真源是 `harness/core/policy/base.md`。
- 四个平台模板都只拼接 `basePolicy` 与各自 `platformOverride`，因此只要核心 policy 更新并通过渲染测试，Codex / Copilot / Cursor / Claude Code 都应收到同一套核心编排规则。
- 当前 README 已有运行时流程图，但核心 policy 尚未把复杂任务下的 worktree/branch、subagent 文件所有权、Superpowers 临时性和主 agent 验收关系写成明确规则。

## 设计决策

- 长期计划只写入 `planning/active/harness-complex-orchestration/`。
- 不创建 `docs/superpowers/plans/...`，因为仓库 policy 已覆盖 `writing-plans` 默认位置。
- 不修改 vendored upstream skill 内容；改造应发生在 Harness 的 core policy 与说明文档。
- 跨 IDE 验证必须看渲染结果，而不是只检查源 Markdown。

## Verification

- `node --test tests/adapters/templates.test.mjs` 通过：3 tests pass，覆盖四个平台渲染入口是否包含复杂任务编排规则。
- `git diff --check -- harness/core/policy/base.md README.md docs/maintenance.md tests/adapters/templates.test.mjs planning/active/harness-complex-orchestration` 通过：无 whitespace errors。
- `npm run verify` 通过：25 tests pass，0 fail。

## 最终结论

- 复杂任务编排现在位于 `harness/core/policy/base.md`，会被四个平台入口模板共同投影。
- README 增加了面向用户的 Complex Request Mode，维护文档增加了 orchestration policy 修改 checklist。
- 新增 adapter rendering test 直接渲染 Codex、Copilot、Cursor、Claude Code，避免只检查源 Markdown 导致跨 IDE 漏规则。
