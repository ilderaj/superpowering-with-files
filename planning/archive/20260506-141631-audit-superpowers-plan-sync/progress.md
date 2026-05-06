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

## 2026-04-26 warning 误报修复执行

- 按 TDD 在 `tests/installer/health.test.mjs` 增加两个 RED 用例：
  - markdown link back-reference
  - incidental path mention should stay orphan
- RED 验证：
  - `node --test tests/installer/health.test.mjs`
  - 初次结果：2 个新用例失败，符合预期
- GREEN 实现：
  - 更新 `harness/installer/lib/plan-locations.mjs`
  - 第一次实现引入 markdown-link 正则语法错误，导致 health suite 大面积失败
  - 局部修正为字符串/解析式匹配后恢复
  - 再修正 `extractLabeledReferenceValue()` 中转义错误，完成最终解析逻辑
- Targeted verification：
  - `node --test tests/installer/health.test.mjs`
  - 结果：31 passed, 0 failed
- Live verification：
  - `./scripts/harness doctor --check-only`
  - 结果：所有 `missing back-reference` 误报消失，仅剩历史 orphan companion warning
- Active companion metadata cleanup：
  - 更新 `docs/superpowers/plans/2026-04-19-github-actions-upstream-automation-analysis-plan.md`
  - 更新 `docs/superpowers/plans/2026-04-20-cross-ide-single-source-consolidation.md`
  - 更新 `docs/superpowers/plans/2026-04-25-checkpoint-push-automation-plan.md`
  - 更新 `docs/superpowers/plans/2026-04-25-session-summary-mechanism.md`
- End-to-end verification：
  - 运行 `./scripts/harness adoption-status`
  - 用于确认用户可见入口中的 warning 集合也已收敛到真实 orphan 集合

## 2026-04-26 adopt-global 收口验证

- 因本轮修复修改了 repo 内容，`./scripts/harness adoption-status` 一度返回 `needs_apply`，原因仅为 receipt HEAD 落后于当前 repo HEAD。
- 重新执行：
  - `./scripts/harness adopt-global`
  - 输出：`Synced 4 target(s): codex, copilot, cursor, claude-code (create=0, update=0, stale=0)`
- 独立复核：
  - `./scripts/harness adoption-status`
  - 预期状态：`in_sync`
  - 预期 warning：仅剩 8 条历史 orphan companion warning
