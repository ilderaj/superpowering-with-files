# 进度记录

## 2026-04-18

- 新建审计任务 `audit-superpowers-plan-sync`。
- 已读取：
  - `/Users/jared/AGENTS.md`
  - `/Users/jared/.agents/skills/using-superpowers/SKILL.md`
  - `/Users/jared/.agents/skills/planning-with-files/SKILL.md`
  - `/Users/jared/HarnessTemplate/harness/core/policy/base.md`
  - `/Users/jared/HarnessTemplate/planning/active/superpowers-plan-artifact-model/task_plan.md`
  - 相关历史任务：`cross-ide-projection-audit`、`copilot-instructions-path`、`plan-location-consolidation`
- 当前进入实现/投影/入口文件证据核查阶段。
- 已确认 source policy 与 repo entry 已升级：
  - `harness/core/policy/base.md`
  - `HarnessTemplate/AGENTS.md`
  - `tests/adapters/templates.test.mjs`
  - `tests/adapters/sync-skills.test.mjs`
  - `tests/installer/health.test.mjs`
- 已确认 Jared user-global 真实入口仍是旧模型：
  - `/Users/jared/.codex/AGENTS.md`
  - `/Users/jared/.copilot/instructions/harness.instructions.md`
  - `/Users/jared/.claude/CLAUDE.md`
- 已确认 Jared user-global / shared projected `writing-plans` 仍是旧 patch：
  - `/Users/jared/.agents/skills/writing-plans/SKILL.md`
  - `/Users/jared/.copilot/skills/writing-plans/SKILL.md`
  - `/Users/jared/.claude/skills/writing-plans/SKILL.md`
  - `/Users/jared/.cursor/skills/writing-plans/SKILL.md`
- Copilot 额外发现：
  - `docs/compatibility/copilot-planning-with-files.md` 说 materialized copy 必须保留 companion-plan boundary
  - 但 `harness/upstream/planning-with-files/SKILL.md` 与 `/Users/jared/.copilot/skills/planning-with-files/SKILL.md` 仍保留“不要创建 parallel superpowers plan”的旧语义
  - `harness/core/skills/patches/copilot-planning-with-files.patch.md` 没有补 companion-plan 语义
- 测试验证：
  - 运行 `node --test tests/adapters/templates.test.mjs tests/adapters/sync-skills.test.mjs tests/adapters/skill-projection.test.mjs tests/installer/health.test.mjs`
  - 结果：34 passed, 0 failed

## 2026-04-26 warning 修复计划分析

- 先读取 `./scripts/harness adoption-status`，看到 3 条 companion-plan warning。
- 再读取并比对：
  - `planning/active/audit-superpowers-plan-sync/{task_plan,findings,progress}.md`
  - `planning/active/session-summary-mechanism/task_plan.md`
  - 三个 warning 对应的 companion plan
  - `tests/installer/health.test.mjs`
  - `harness/installer/lib/plan-locations.mjs`
- 最后运行 `./scripts/harness doctor --check-only` 复现 live 文案；当前 3 条 warning 全部是 `missing back-reference`，不是 orphan。
- 关键结论：
  - `referencesForCompanionPlan()` 目前会把 active planning file 中任何出现 companion 相对路径的文本都算作引用。
  - `companionPlanBackReferences()` 不识别 markdown link 形式的 active task 回指。
  - 因此当前 warning 既受真实数据状态影响，也受解析规则误判影响。
- 本轮未改产品代码；仅产出修复顺序与验证建议。
