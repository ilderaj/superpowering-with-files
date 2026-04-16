# Findings & Decisions

## Requirements

- 用户要求把上一轮 review 的优化 plan 落盘并执行。
- 需要先遵循 `using-superpowers` 的技能选择规则，再执行修改。
- 必须使用 `planning-with-files` 作为 durable task memory。
- 本轮目标不是继续辩论是否有矛盾，而是把“何时进入 planning”的规则写清并落地。

## Research Findings

- `harness/core/policy/base.md` 同时包含 `Directly execute straightforward work.` 与 `Keep the active task's three markdown files updated.`，但没有先定义“哪些任务必须成为 active task”。
- `harness/upstream/planning-with-files/SKILL.md` 当前描述为 `any work requiring >5 tool calls`，这是操作量阈值，不是任务复杂度定义。
- `AGENTS.md` 由 `harness/core/templates/AGENTS.md.hbs` + `harness/core/policy/base.md` 投影生成，因此规则修复必须回到源头。
- 仓库已有相关投影测试：`tests/adapters/templates.test.mjs`、`tests/adapters/sync.test.mjs`、`tests/adapters/sync-skills.test.mjs`。
- 当前仓库 `.harness/state.json` 是 `user-global` scope，因此执行 `./scripts/harness sync` 会刷新用户级投影，不会自动刷新 workspace 安装状态。
- 根仓库 `AGENTS.md` 在本轮开始前相对 source 已有漂移；重新渲染后补回了缺失的 policy 段落。

## Technical Decisions

| Decision | Rationale |
|----------|-----------|
| 把冲突定性为“优先级与触发条件不明确”，不是纯文本互相否定 | 现有规则不是字面矛盾，而是 agent 可解释空间过大 |
| 在 policy 中新增显式 rule precedence + task classification | 这样能把 “directly execute” 约束在 quick task 范围内 |
| 将 `>5 tool calls` 降级为辅助信号 | 避免小修复因为查看/验证动作较多而被误判成必须复杂规划 |
| README 也要同步更新 | 用户可见文档里仍然保留旧表述，否则仓库说明和实际 policy 会分叉 |
| 用 `./scripts/harness sync` 刷新当前 user-global 投影 | 这样安装中的 Copilot/Codex/Claude/Cursor 也会拿到新规则，而不只是 repo 源文件被修改 |

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| 仓库未安装 `fd` | 直接按项目偏好降级到 `find` 和 `rg` |

## Resources

- `/Users/jared/HarnessTemplate/harness/core/policy/base.md`
- `/Users/jared/HarnessTemplate/harness/upstream/planning-with-files/SKILL.md`
- `/Users/jared/HarnessTemplate/harness/core/templates/AGENTS.md.hbs`
- `/Users/jared/HarnessTemplate/AGENTS.md`
- `/Users/jared/HarnessTemplate/README.md`
- `/Users/jared/HarnessTemplate/tests/adapters/templates.test.mjs`
- `/Users/jared/HarnessTemplate/tests/adapters/sync.test.mjs`
- `/Users/jared/HarnessTemplate/tests/adapters/sync-skills.test.mjs`

## Visual/Browser Findings

- 本轮未使用 browser/image/pdf。
