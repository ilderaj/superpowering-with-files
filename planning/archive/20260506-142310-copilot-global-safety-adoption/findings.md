# Findings & Decisions

## Requirements
- README 需要根据近期 harness 变化更新，保持精炼、简洁、克制。
- global adopt 要跟上最新约束。
- 确认 safety profile 的开闭边界：针对本项目的 Copilot 可以开启，user-global 不应默认开启。

## Research Findings
- `adopt-global` 当前在没有既有 user-global state 时，应把 `normalizeTargets(..., ['all'])` 解析成所有平台，其中包含 Copilot。
- README 同时存在两处会误导 user-global adopt / safety 边界的内容：
	- Quick Start 的 user-global 示例默认面向 `targets=all`
	- Safety 段落直接展示 `--scope=user-global --profile=safety --hooks=on`
- `docs/install/copilot.md` 也把 user-global Copilot install 写成常规 adoption 路径，而没有强调 repo-local 优先。
- `tests/installer/adoption.test.mjs` 的 bootstrap case 现在断言 4 个 targets，验证 global baseline 默认包含 Copilot。
- `adopt-global` 仍然保留显式 `--targets=` 覆盖能力；本次恢复的是默认 bootstrap，不是移除手动裁剪能力。
- 聚焦测试通过后，说明“默认包含 Copilot + 默认 profile 仍是 always-on-core + hooks off”已经同时成立。
- `safety-projection` 只在 `policyProfile` 为 `safety` 或 `cloud-safe` 时投影 safety 目录与脚本；这说明 global baseline 即便包含 Copilot，也不会在 `always-on-core` 下生成 safety hooks。
- `tests/adapters/sync-hooks.test.mjs` 仅在 `scope=workspace` 且 `policyProfile=safety` 时显式覆盖 Copilot safety hooks 投影，符合“workspace 显式开启才生效”的目标。
- 新增测试后，`install` 在 `scope=user-global` / `scope=both` 上对 `profile=safety|cloud-safe` 会直接报错；`adopt-global` 遇到既有 user-global safety state 也会直接拒绝。
- 当前真实 HOME 的 live state 已恢复为 4 targets：`claude-code,codex,copilot,cursor`。
- 当前真实 HOME 下的 Copilot global baseline 文件存在：`~/.copilot/instructions/harness.instructions.md`、`~/.copilot/hooks/planning-with-files.json`、`~/.copilot/hooks/superpowers.json`、`~/.copilot/hooks/task-scoped-hook.sh`、`~/.copilot/hooks/session-start`。
- 当前真实 HOME 下的 Copilot safety 文件不存在：`~/.copilot/hooks/safety.json`、`~/.copilot/hooks/pretool-guard.sh`、`~/.copilot/hooks/session-checkpoint.sh`。
- 当前 live `adoption-status` 为 `in_sync`，targets 为 `claude-code,codex,copilot,cursor`；`doctor --check-only` 返回 `Harness check passed.`。
- 在执行最终 apply 后，当前仓库状态已切换为 `scope=workspace`、`target=copilot`、`policyProfile=safety`，并且 `.github/hooks/safety.json`、`.github/hooks/pretool-guard.sh`、`.github/hooks/session-checkpoint.sh` 都已落地。
- 在 workspace safety 开启后，真实 HOME 下的 Copilot safety 文件仍然不存在，这说明 workspace safety 没有泄漏到 global。
- 用户随后手动执行了 `user-global + always-on-core + targets=all` 的 install/sync/adopt-global/doctor 序列，当前仓库 `.harness/state.json` 与 `.harness/adoption/global.json` 都已恢复到 global baseline。
- 当前仓库 `.github/hooks/` 目录为空，说明 workspace safety 已被移除，不再拦截本仓库的正常工具调用。
- 仓库内已新增正式 roadmap 文档 `docs/roadmap.md`，记录三条后续事项：
  - `global baseline + workspace safety overlay`
  - `safety hook false-positive reduction`
  - `re-evaluate default safety posture`

## Verification Conclusion
- 结论：通过，并补充新的默认策略判断也成立。
- 逐条对应：
	- “整体的 harness adopt 要包括 copilot”：通过。fresh bootstrap 测试与 live global adopt 均得到 targets=`claude-code,codex,copilot,cursor`。
	- “safety profile 默认不 global”：通过。global live state 的 `policyProfile=always-on-core`，且 user-global Copilot 目录没有 safety 文件。
	- “只针对 copilot 下的当前 workspace 生效”：这条在 Phase 5 中已被验证过；随后按用户新决策已主动回退当前 workspace safety，避免影响日常使用。
	- “以后全局 harness 中的 safety profiles 默认关闭，只有在 workspace 中指定针对某个 IDE 开启的时候才开启”：通过。实现层已经禁止 user-global/both 的 safety/cloud-safe 安装或 adoption 保留。
	- “当前应该回到全局 adopt 相同的 skills、harness 和关闭 safety 的状态”：通过。当前 repo state 为 `user-global + always-on-core + full`，`.github/hooks/` 为空，global receipt 为 `in_sync`。

## Roadmap Conclusion
- 用户关于 safety 当前增益有限、默认关闭更合理、待 overlay 模型和 tool false-positive 修复后再重评的建议成立。
- 该结论已记录到 `docs/roadmap.md`，作为后续 review / prioritization 的正式输入。

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| 空 user-global bootstrap 默认 targets 恢复为 `all` | 满足“整体 Harness global baseline 包含 Copilot”的最新目标 |
| Copilot user-global 文档改为“默认包含，但 safety 仍 workspace-only” | 平台能力与安全边界要同时表达清楚 |
| README 文案收敛到“薄说明 + 单一推荐路径” | 用户要求精炼简洁克制，避免在首页保留过多分支说明 |
| 真实 HOME 的目标状态定义为“有 Copilot global baseline，但没有 Copilot global safety 文件” | 这样 adoption 与 safety 边界同时符合最新目标 |
| workspace-only safety 通过命令与 adoption 双入口共同约束 | 只改 `install` 不够，因为 `adopt-global` 也会保留既有 user-global safety state |
