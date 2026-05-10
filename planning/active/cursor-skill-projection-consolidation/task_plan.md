# Task Plan: Cursor Skill Projection Consolidation Research

## Goal
基于已 review 的 companion plan，执行 Cursor/Copilot/Codex skill projection 归并实现，保持 `planning/active/cursor-skill-projection-consolidation/` 作为权威任务记忆，并把 durable 决策持续同步回 active planning files。

## Current State
Status: active
Archive Eligible: no
Close Reason:

## Current Phase
Phase 6

## Phases

### Phase 1: 官方文档研究
- [x] 只使用 Cursor 官方文档确认 skills 支持现状
- [x] 判断 `.agents/skills` 是否为官方支持路径
- [x] 记录引用和限制
- **Status:** complete

### Phase 2: 仓库实现盘点
- [x] 找到 Cursor/Copilot/Codex skill projection 相关实现
- [x] 对比路径、模板、渲染策略和测试覆盖
- [x] 记录可归并点与不可归并点
- **Status:** complete

### Phase 3: 实现计划编写
- [x] 编写详细 plan，包含文件、步骤、测试和风险
- [x] 保存 companion plan 到 docs/superpowers/plans/
- [x] 同步摘要回 active planning files
- **Status:** complete

### Phase 4: Review 交付
- [x] 自查 plan 覆盖用户问题
- [x] 明确没有执行实现
- [x] 向用户交付结论和 plan 路径
- **Status:** complete

### Phase 5: 时间头回归修复
- [x] 复现 `Session` / `Started` / `Timestamp` 只写日期和 `UTC+8` 的问题
- [x] 定位生成规划文件时间头的真实代码路径
- [x] 先添加会失败的回归测试，覆盖 progress 和 findings 的具体时间要求
- [x] 修复根因并反复验证 red/green 与相关测试
- **Status:** complete

### Phase 6: Companion plan execution
- [x] 审阅 companion implementation plan 与 active planning files，确认可直接进入执行
- [x] 创建隔离 worktree，并记录 worktree base 为 `dev @ 8be83eada6ebb7d0637d3f2cedd0d24bc1bb3d4e`
- [x] 在隔离 worktree 中完成依赖安装与基线 `npm run verify`
- [ ] 按 companion plan Task 1-6 执行测试、实现、删除旧投影、文档与验证
- [ ] 在执行删除 `.cursor/skills/**` 前写入风险评估、checkpoint 与回滚路径
- [ ] 完成实现后做 review、最终验证与收尾
- **Status:** in_progress

## Risk Assessment

| 风险 | 触发条件 | 影响范围 | 缓解 / 已落盘的回退方案 |
|---|---|---|---|
| 将非官方资料误当事实源 | 搜索结果或社区讨论被混入判断 | 结论失真，错误归并 Cursor 行为 | 只引用 docs.cursor.com 官方文档；非官方资料不用于事实判断 |
| 归并 plan 过度简化 | 忽略 Cursor 与 Copilot/Codex 的入口差异 | 后续实现破坏平台兼容 | 先读现有 adapter/render 流程，再提出共享层和平台保留差异 |
| 误执行实现 | 将计划阶段变成代码修改 | 违反用户要求 | 本任务只创建/更新 planning 和 plan 文档，不改运行时代码 |
| 时间头再次回归 | 只修当前 markdown 内容或只覆盖一个字段 | 后续 planning files 继续缺少具体时分秒 | 必须定位生成逻辑并添加自动化回归测试，覆盖 progress 与 findings 中的时间字段 |

## Key Questions
1. Cursor 官方文档是否明确支持 skills？
2. Cursor 官方文档是否明确支持 `.agents/skills/<name>/SKILL.md`？
3. 如果支持，Cursor/Copilot/Codex 的 projection 是否能合并到共享实现？
4. 哪些平台差异必须保留在 thin adapter 层？

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| 本任务不执行实现，只交付 plan | 用户明确要求“不要执行plan，给我review先” |
| 以 Cursor 官方文档作为 Cursor 能力判断的唯一事实源 | 用户明确要求官方文档为唯一事实源 |
| 计划建议将 Cursor skill root 归并到 `.agents/skills` | Cursor 官方文档已经明确支持 `.agents/skills/`，现有 coalesce 机制可减少重复投影 |
| Companion plan: docs/superpowers/plans/2026-05-10-cursor-skill-projection-consolidation.md | 保存详细实现计划供 review；本轮不执行实现 |
| 用户已要求直接执行 approved companion plan | 当前会话目标已从 review 交付切换到实现执行 |
| 实现工作在隔离 worktree `202605101418-cursor-skill-projection-consolidation-001` 中进行 | 保持主 checkout `dev` 干净，并满足 worktree 隔离要求 |
| 时间头回归根因是手写 planning 记录路径缺少技能正文防护 | 脚本、record helper 和模板已有具体时间格式；本次补强 `SKILL.md` 源、overlay 和当前投影，并新增同步后的技能正文回归测试 |

## Companion Plan Sync
- Companion plan: docs/superpowers/plans/2026-05-10-cursor-skill-projection-consolidation.md
- Companion summary: 建议将 Cursor/Copilot/Codex skill projection 归并到共享 `.agents/skills` / `~/.agents/skills`，保留 Cursor rules/hooks 原生路径，泛化 planning-with-files shared skill root patch，并删除 tracked `.cursor/skills` 旧投影副本。
- Sync-back status: execution in progress; active task files record worktree bootstrap, baseline verification, and upcoming destructive-change checkpoint before `.cursor/skills/**` removal.

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
