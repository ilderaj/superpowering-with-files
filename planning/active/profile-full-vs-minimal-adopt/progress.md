# Progress

## Session: 2026-05-08 UTC+8

### Phase 1: 上下文恢复与入口定位
- **Status:** complete
- Actions taken:
  - 阅读仓库 `AGENTS.md` 中的 tracked-task 与 planning-with-files 规则，确认本轮需要 task-scoped planning。
  - 扫描 `planning/active/`，确认当前没有同主题 active task 可直接复用。
  - 定位 profile / projection / token summary 相关实现与测试入口。
  - 读取一份现有 active task 作为 planning 文件格式参考。
- Files created/modified:
  - `planning/active/profile-full-vs-minimal-adopt/task_plan.md` (created)
  - `planning/active/profile-full-vs-minimal-adopt/findings.md` (created)
  - `planning/active/profile-full-vs-minimal-adopt/progress.md` (created)

## Session: 2026-05-08 UTC+8

### Phase 2-4: profile / projection / token 对比与结论整理
- **Status:** complete
- Actions taken:
  - 读取 `harness/core/skills/profiles.json`，确认 `full` 与 `minimal-global` 的 skill profile 定义。
  - 读取 `harness/installer/lib/skill-projection.mjs`、`harness/installer/commands/install.mjs`、`harness/installer/lib/adoption.mjs`，确认默认 profile 选择与 collection child 展开逻辑。
  - 读取 `harness/installer/lib/health.mjs`、`harness/installer/lib/context-budget.mjs`、`harness/core/context-budgets.json`，确认 token 口径、summary 维度与 worst-target 判定方式。
  - 运行仓库内 projection / measurement 逻辑，对 `user-global + all targets` 下的 `minimal-global` 与 `full` 做定量比较。
  - 结合 `README.md`、`docs/architecture.md`、`docs/maintenance.md`、`docs/release.md` 与相关测试，交叉验证默认语义和预算模型没有偏读。
- Key results:
  - `minimal-global` 每 target 投影 5 个 logical skills；`full` 每 target 投影 17 个。
  - `all targets` 下 coalesced 物理 skill paths：`15` vs `51`。
  - 单 target discovery summary 约 `77-79` vs `225-226` tokens。
  - 单 target skill body total 约 `7,351` vs `31,001` tokens。
  - 单 target source tree total 约 `17,084` vs `76,101` tokens。
- Files created/modified:
  - `planning/active/profile-full-vs-minimal-adopt/task_plan.md` (updated)
  - `planning/active/profile-full-vs-minimal-adopt/findings.md` (updated)
  - `planning/active/profile-full-vs-minimal-adopt/progress.md` (updated)

## Session: 2026-05-08 UTC+8

### Follow-up: skill 是否每轮全量加载
- **Status:** complete
- Actions taken:
  - 检查 `harness/core/context-budget-policies.json`，确认 Codex/Claude 明确按 lazy-skills 设计。
  - 搜索 `skillDiscovery` / `skillBody` / `skillSource` 与 “Files read on-demand” 的文档和测试证据。
  - 校正上一轮结论的表达：`full` 代表更大的潜在技能面，不等于每轮新会话都固定注入全部 skill bodies。
- Files created/modified:
  - `planning/active/profile-full-vs-minimal-adopt/findings.md` (updated)
  - `planning/active/profile-full-vs-minimal-adopt/progress.md` (updated)
